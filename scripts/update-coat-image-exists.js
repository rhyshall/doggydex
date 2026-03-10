/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');

const admin = require('firebase-admin');

try {
  // Load local .env values when present (safe no-op if file does not exist).
  require('dotenv').config();
} catch {
  // Keep script runnable even if dotenv is unavailable.
}

const COATS_COLLECTION = 'coats';
const MAX_BATCH_SIZE = 450;
const DEFAULT_STORAGE_PREFIX = 'img';

function chunk(array, size) {
  const out = [];
  for (let index = 0; index < array.length; index += size) {
    out.push(array.slice(index, index + size));
  }
  return out;
}

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

async function resolveBucket(bucketCandidates) {
  let lastNotFoundError = null;

  for (const bucketName of bucketCandidates) {
    const bucket = admin.storage().bucket(bucketName);

    try {
      await bucket.getFiles({ maxResults: 1 });
      return bucket;
    } catch (error) {
      if (isBucketNotFoundError(error)) {
        lastNotFoundError = error;
        continue;
      }

      throw error;
    }
  }

  const suffix = lastNotFoundError ? ` Last error: ${lastNotFoundError.message}` : '';
  throw new Error(
    `Could not resolve an existing Storage bucket. Tried: ${bucketCandidates.join(', ')}.${suffix}`
  );
}

function toStoragePrefix(rawPrefix) {
  if (typeof rawPrefix !== 'string') {
    return DEFAULT_STORAGE_PREFIX;
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
    storagePrefix: DEFAULT_STORAGE_PREFIX,
    bucketOverride: null,
  };

  for (const arg of argv) {
    if (arg === '--dry-run') {
      out.dryRun = true;
      continue;
    }

    if (arg.startsWith('--prefix=')) {
      out.storagePrefix = arg.split('=')[1] || '';
      continue;
    }

    if (arg.startsWith('--bucket=')) {
      out.bucketOverride = toBucketName(arg.split('=')[1] || '');
      continue;
    }
  }

  out.storagePrefix = toStoragePrefix(out.storagePrefix);
  return out;
}

function toObjectPath(storagePrefix, imgFilename) {
  const normalizedFilename = String(imgFilename || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');

  if (!normalizedFilename) {
    return null;
  }

  if (!storagePrefix) {
    return normalizedFilename;
  }

  if (normalizedFilename.startsWith(`${storagePrefix}/`)) {
    return normalizedFilename;
  }

  return `${storagePrefix}/${normalizedFilename}`;
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

  const db = admin.firestore();
  const bucket = await resolveBucket(bucketCandidates);
  const [remoteFiles] = args.storagePrefix
    ? await bucket.getFiles({ prefix: `${args.storagePrefix}/` })
    : await bucket.getFiles();

  const remoteObjectNames = new Set(
    remoteFiles
      .map((file) => file.name)
      .filter((name) => typeof name === 'string' && name && !name.endsWith('/'))
  );

  const coatsSnapshot = await db.collection(COATS_COLLECTION).get();

  if (coatsSnapshot.empty) {
    console.log('No coat docs found. Nothing to update.');
    return;
  }

  const updates = [];
  let withFilename = 0;
  let withoutFilename = 0;
  let foundCount = 0;
  let missingCount = 0;

  for (const coatDoc of coatsSnapshot.docs) {
    const data = coatDoc.data() || {};
    const imgFilename = typeof data.img_filename === 'string' ? data.img_filename.trim() : '';

    if (!imgFilename) {
      withoutFilename += 1;

      if (data.image_exists !== false) {
        updates.push({ ref: coatDoc.ref, imageExists: false, imgFilename: null });
      }

      missingCount += 1;
      continue;
    }

    withFilename += 1;

    const objectPath = toObjectPath(args.storagePrefix, imgFilename);
    const exists = objectPath ? remoteObjectNames.has(objectPath) : false;

    if (exists) {
      foundCount += 1;
    } else {
      missingCount += 1;
    }

    if (data.image_exists !== exists) {
      updates.push({ ref: coatDoc.ref, imageExists: exists, imgFilename, objectPath });
    }
  }

  console.log(`Bucket: ${bucket.name}`);
  if (bucketCandidates[0] !== bucket.name) {
    console.log(`Resolved from candidates: ${bucketCandidates.join(', ')}`);
  }
  console.log(`Storage prefix: ${args.storagePrefix || '(root)'}`);
  console.log(`Coat docs scanned: ${coatsSnapshot.size}`);
  console.log(`Coat docs with img_filename: ${withFilename}`);
  console.log(`Coat docs missing img_filename: ${withoutFilename}`);
  console.log(`Storage object matches: ${foundCount}`);
  console.log(`Storage object missing: ${missingCount}`);
  console.log(`Docs requiring image_exists update: ${updates.length}`);

  if (args.dryRun) {
    console.log('Dry run only. No Firestore writes were made.');

    if (updates.length > 0) {
      const preview = updates.slice(0, 10).map((item) => ({
        path: item.ref.path,
        img_filename: item.imgFilename,
        object_path: item.objectPath ?? null,
        image_exists: item.imageExists,
      }));

      console.log('Update preview (first 10):');
      console.log(JSON.stringify(preview, null, 2));
    }

    return;
  }

  const updateChunks = chunk(updates, MAX_BATCH_SIZE);

  for (const updateChunk of updateChunks) {
    const batch = db.batch();

    for (const update of updateChunk) {
      batch.set(
        update.ref,
        {
          image_exists: update.imageExists,
        },
        { merge: true }
      );
    }

    await batch.commit();
  }

  console.log(`Completed. Updated image_exists on ${updates.length} coat docs.`);
}

main().catch((error) => {
  console.error('Failed to update coat image_exists values:', error);
  process.exitCode = 1;
});
