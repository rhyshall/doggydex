/* eslint-disable no-console */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const admin = require('firebase-admin');

try {
  // Load local .env values when present (safe no-op if file does not exist).
  require('dotenv').config();
} catch {
  // Keep script runnable even if dotenv is unavailable.
}

const DEFAULT_LOCAL_DIR = 'img';
const DEFAULT_REMOTE_PREFIX = 'img';
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

function getServiceAccount() {
  const inlineJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (inlineJson) {
    return JSON.parse(inlineJson);
  }

  const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!keyPath) {
    throw new Error(
      'Missing service account credentials. Set FIREBASE_SERVICE_ACCOUNT_KEY=<path-to-json> or FIREBASE_SERVICE_ACCOUNT_JSON=<json-string>.'
    );
  }

  const resolvedPath = path.isAbsolute(keyPath)
    ? keyPath
    : path.resolve(process.cwd(), keyPath);

  return JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
}

function toBucketName(rawBucket) {
  if (!rawBucket) {
    return null;
  }

  const value = String(rawBucket).trim();
  if (!value) {
    return null;
  }

  if (value.startsWith('gs://')) {
    return value.replace(/^gs:\/\//, '').replace(/\/+$/, '');
  }

  const firebaseApiMatch = value.match(/\/b\/([^/]+)\//);
  if (firebaseApiMatch?.[1]) {
    return firebaseApiMatch[1];
  }

  if (value.includes('://')) {
    try {
      const parsed = new URL(value);

      if (parsed.hostname === 'storage.googleapis.com') {
        const bucketFromPath = parsed.pathname
          .replace(/^\/+/, '')
          .split('/')[0];

        if (bucketFromPath) {
          return bucketFromPath;
        }
      }

      return parsed.hostname;
    } catch {
      return null;
    }
  }

  return value.replace(/\/+$/, '');
}

function pushUnique(items, seen, value) {
  if (!value || seen.has(value)) {
    return;
  }

  seen.add(value);
  items.push(value);
}

function toAlternativeAppspotBucket(bucketName) {
  if (!bucketName || !bucketName.endsWith('.firebasestorage.app')) {
    return null;
  }

  const projectId = bucketName.replace(/\.firebasestorage\.app$/, '');
  if (!projectId) {
    return null;
  }

  return `${projectId}.appspot.com`;
}

function getBucketCandidates(serviceAccount, bucketOverride) {
  const candidates = [];
  const seen = new Set();

  if (bucketOverride) {
    pushUnique(candidates, seen, bucketOverride);
    pushUnique(candidates, seen, toAlternativeAppspotBucket(bucketOverride));
  }

  const configuredBuckets = [
    toBucketName(process.env.FIREBASE_STORAGE_BUCKET),
    toBucketName(process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET),
  ].filter(Boolean);

  for (const bucketName of configuredBuckets) {
    pushUnique(candidates, seen, bucketName);
    pushUnique(candidates, seen, toAlternativeAppspotBucket(bucketName));
  }

  const projectId = serviceAccount?.project_id;
  if (projectId) {
    pushUnique(candidates, seen, `${projectId}.appspot.com`);
    pushUnique(candidates, seen, `${projectId}.firebasestorage.app`);
  }

  if (candidates.length === 0) {
    throw new Error(
      'Missing bucket config. Set FIREBASE_STORAGE_BUCKET (or EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET) to your Storage bucket name.'
    );
  }

  return candidates;
}

function isBucketNotFoundError(error) {
  if (!error) {
    return false;
  }

  if (error.code === 404) {
    return true;
  }

  const message = String(error.message || '');
  return message.toLowerCase().includes('bucket does not exist');
}

function isBucketListPermissionDeniedError(error) {
  if (!error || error.code !== 403) {
    return false;
  }

  const message = String(error.message || '').toLowerCase();
  return message.includes('storage.objects.list');
}

async function probeBucket(bucket, remotePrefix) {
  if (!remotePrefix) {
    await bucket.getFiles({ maxResults: 1 });
    return;
  }

  await bucket.getFiles({ prefix: `${remotePrefix}/`, maxResults: 1 });
}

async function resolveBucket(bucketCandidates, remotePrefix) {
  let lastNotFoundError = null;
  let listDeniedCandidate = null;

  for (const bucketName of bucketCandidates) {
    const bucket = admin.storage().bucket(bucketName);

    try {
      await probeBucket(bucket, remotePrefix);
      return { bucket, canList: true, listDeniedError: null };
    } catch (error) {
      if (isBucketListPermissionDeniedError(error)) {
        if (!listDeniedCandidate) {
          listDeniedCandidate = { bucket, error };
        }
        continue;
      }

      if (isBucketNotFoundError(error)) {
        lastNotFoundError = error;
        continue;
      }

      throw error;
    }
  }

  if (listDeniedCandidate) {
    return {
      bucket: listDeniedCandidate.bucket,
      canList: false,
      listDeniedError: listDeniedCandidate.error,
    };
  }

  const suffix = lastNotFoundError ? ` Last error: ${lastNotFoundError.message}` : '';
  throw new Error(
    `Could not resolve an existing Storage bucket. Tried: ${bucketCandidates.join(', ')}.${suffix}`
  );
}

function toRemotePrefix(rawPrefix) {
  if (typeof rawPrefix !== 'string') {
    return DEFAULT_REMOTE_PREFIX;
  }

  return rawPrefix
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

function parseArgs(argv) {
  const out = {
    dryRun: false,
    deleteRemote: false,
    localDir: DEFAULT_LOCAL_DIR,
    remotePrefix: DEFAULT_REMOTE_PREFIX,
    bucketOverride: null,
  };

  for (const arg of argv) {
    if (arg === '--dry-run') {
      out.dryRun = true;
      continue;
    }

    if (arg === '--delete-remote') {
      out.deleteRemote = true;
      continue;
    }

    if (arg.startsWith('--dir=')) {
      out.localDir = arg.split('=')[1] || DEFAULT_LOCAL_DIR;
      continue;
    }

    if (arg.startsWith('--prefix=')) {
      out.remotePrefix = arg.split('=')[1] || DEFAULT_REMOTE_PREFIX;
      continue;
    }

    if (arg.startsWith('--bucket=')) {
      out.bucketOverride = toBucketName(arg.split('=')[1] || '');
      continue;
    }
  }

  out.remotePrefix = toRemotePrefix(out.remotePrefix);
  return out;
}

function walkFilesRecursively(rootDir) {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const allFiles = [];

  for (const entry of entries) {
    const absolutePath = path.join(rootDir, entry.name);

    if (entry.isDirectory()) {
      allFiles.push(...walkFilesRecursively(absolutePath));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    allFiles.push(absolutePath);
  }

  return allFiles;
}

function getImageMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === '.jpg' || extension === '.jpeg') {
    return 'image/jpeg';
  }

  if (extension === '.png') {
    return 'image/png';
  }

  if (extension === '.webp') {
    return 'image/webp';
  }

  if (extension === '.gif') {
    return 'image/gif';
  }

  return 'application/octet-stream';
}

function getLocalImageEntries(localDir, remotePrefix) {
  const absoluteRoot = path.resolve(process.cwd(), localDir);

  if (!fs.existsSync(absoluteRoot)) {
    throw new Error(`Local directory does not exist: ${absoluteRoot}`);
  }

  const allFiles = walkFilesRecursively(absoluteRoot);

  return allFiles
    .filter((absolutePath) => IMAGE_EXTENSIONS.has(path.extname(absolutePath).toLowerCase()))
    .map((absolutePath) => {
      const relativePath = path
        .relative(absoluteRoot, absolutePath)
        .split(path.sep)
        .join('/');
      const remotePath = remotePrefix ? `${remotePrefix}/${relativePath}` : relativePath;
      const fileBuffer = fs.readFileSync(absolutePath);
      const md5Base64 = crypto.createHash('md5').update(fileBuffer).digest('base64');

      return {
        absolutePath,
        relativePath,
        remotePath,
        md5Base64,
        mimeType: getImageMimeType(absolutePath),
      };
    });
}

function indexRemoteFiles(files) {
  const byPath = new Map();
  for (const file of files) {
    const remotePath = file.name;
    if (!remotePath || remotePath.endsWith('/')) {
      continue;
    }
    byPath.set(remotePath, file);
  }
  return byPath;
}

async function listRemoteFiles(bucket, remotePrefix) {
  if (!remotePrefix) {
    const [files] = await bucket.getFiles();
    return files;
  }

  const [files] = await bucket.getFiles({ prefix: `${remotePrefix}/` });
  return files;
}

function toRemoteMd5(file) {
  const md5Hash = file?.metadata?.md5Hash;
  if (typeof md5Hash === 'string' && md5Hash) {
    return md5Hash;
  }
  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const serviceAccount = getServiceAccount();
  const bucketCandidates = getBucketCandidates(serviceAccount, args.bucketOverride);

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: bucketCandidates[0],
    });
  }

  const resolvedBucket = await resolveBucket(bucketCandidates, args.remotePrefix);
  const { bucket, canList, listDeniedError } = resolvedBucket;
  const bucketName = bucket.name;
  const localEntries = getLocalImageEntries(args.localDir, args.remotePrefix);

  if (localEntries.length === 0) {
    console.log('No images found in the local directory. Nothing to sync.');
    return;
  }

  let remoteFiles = [];
  let toUpload = [];
  let unchanged = [];
  let toDelete = [];

  if (canList) {
    remoteFiles = await listRemoteFiles(bucket, args.remotePrefix);
    const remoteFilesByPath = indexRemoteFiles(remoteFiles);

    for (const localEntry of localEntries) {
      const remoteFile = remoteFilesByPath.get(localEntry.remotePath);

      if (!remoteFile) {
        toUpload.push(localEntry);
        continue;
      }

      const remoteMd5 = toRemoteMd5(remoteFile);
      if (remoteMd5 && remoteMd5 === localEntry.md5Base64) {
        unchanged.push(localEntry);
        continue;
      }

      toUpload.push(localEntry);
    }

    const localRemotePathSet = new Set(localEntries.map((entry) => entry.remotePath));
    toDelete = args.deleteRemote
      ? remoteFiles.filter((remoteFile) => !localRemotePathSet.has(remoteFile.name))
      : [];
  } else {
    // Without list permission we cannot diff remote objects, so we overwrite all local files.
    toUpload = localEntries.slice();
  }

  console.log(`Bucket: ${bucketName}`);
  if (bucketCandidates[0] !== bucketName) {
    console.log(`Resolved from candidates: ${bucketCandidates.join(', ')}`);
  }
  if (!canList) {
    console.log(
      `Warning: Missing storage.objects.list permission. Using upload-only mode. ${String(
        listDeniedError?.message || ''
      )}`
    );
  }
  console.log(`Local directory: ${path.resolve(process.cwd(), args.localDir)}`);
  console.log(`Remote prefix: ${args.remotePrefix || '(root)'}`);
  console.log(`Local images: ${localEntries.length}`);
  console.log(
    `Remote files (under prefix): ${canList ? remoteFiles.length : 'Unavailable (missing list permission)'}`
  );
  console.log(`Will upload/update: ${toUpload.length}`);
  console.log(`Already up-to-date: ${unchanged.length}`);
  console.log(`Will delete remote extras: ${canList ? toDelete.length : 0}`);

  if (!canList && args.deleteRemote) {
    console.log('Skipping --delete-remote because list permission is not available.');
  }

  if (args.dryRun) {
    console.log('Dry run only. No Storage writes were made.');

    if (toUpload.length > 0) {
      console.log('Upload preview (first 10):');
      console.log(
        JSON.stringify(
          toUpload.slice(0, 10).map((entry) => ({
            local: entry.relativePath,
            remote: entry.remotePath,
          })),
          null,
          2
        )
      );
    }

    if (toDelete.length > 0) {
      console.log('Delete preview (first 10):');
      console.log(
        JSON.stringify(
          toDelete.slice(0, 10).map((file) => file.name),
          null,
          2
        )
      );
    }

    return;
  }

  let uploadedCount = 0;
  for (const entry of toUpload) {
    await bucket.upload(entry.absolutePath, {
      destination: entry.remotePath,
      metadata: {
        contentType: entry.mimeType,
        cacheControl: 'public,max-age=31536000,immutable',
      },
      resumable: false,
    });
    uploadedCount += 1;
  }

  let deletedCount = 0;
  for (const remoteFile of toDelete) {
    await remoteFile.delete();
    deletedCount += 1;
  }

  console.log(
    `Image sync complete. Uploaded/updated ${uploadedCount} files, left ${unchanged.length} unchanged, deleted ${deletedCount} remote extras.`
  );
}

main().catch((error) => {
  console.error('Failed to sync images to Firebase Storage:', error);
  process.exitCode = 1;
});
