/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');

const admin = require('firebase-admin');

const BREEDS_COLLECTION = 'breeds';
const MAX_BATCH_SIZE = 450;

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

function parseStartAt(argv) {
  const startArg = argv.find((arg) => arg.startsWith('--start='));
  if (!startArg) {
    return 1;
  }

  const rawValue = startArg.split('=')[1];
  const parsed = Number.parseInt(rawValue, 10);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Invalid --start value: ${rawValue}. Expected a positive integer.`);
  }

  return parsed;
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const startAt = parseStartAt(process.argv.slice(2));

  const serviceAccount = getServiceAccount();

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }

  const db = admin.firestore();
  const breedsSnapshot = await db
    .collection(BREEDS_COLLECTION)
    .orderBy(admin.firestore.FieldPath.documentId())
    .get();

  if (breedsSnapshot.empty) {
    console.log('No breed docs found. Nothing to migrate.');
    return;
  }

  const operations = breedsSnapshot.docs.map((breedDoc, index) => {
    const data = breedDoc.data() || {};
    const oldId = Number.isFinite(data?.id) ? data.id : null;
    const nextId = startAt + index;

    return {
      ref: breedDoc.ref,
      docId: breedDoc.id,
      breedName: data?.breed_name ?? null,
      oldId,
      nextId,
      update: {
        id: nextId,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      },
    };
  });

  if (isDryRun) {
    console.log('Dry run only. No Firestore writes were made.');
    console.log(`Breed docs scanned: ${operations.length}`);
    console.log(`ID range: ${startAt}..${startAt + operations.length - 1}`);

    const preview = operations.slice(0, 10).map((item) => ({
      doc_id: item.docId,
      breed_name: item.breedName,
      old_id: item.oldId,
      new_id: item.nextId,
    }));

    console.log('Preview (first 10):');
    console.log(JSON.stringify(preview, null, 2));
    return;
  }

  const batches = chunk(operations, MAX_BATCH_SIZE);

  for (const operationsChunk of batches) {
    const batch = db.batch();
    for (const operation of operationsChunk) {
      batch.set(operation.ref, operation.update, { merge: true });
    }
    await batch.commit();
  }

  console.log(
    `Migration complete. Updated ${operations.length} breed docs with sequential id values from ${startAt} to ${startAt + operations.length - 1}.`
  );
}

main().catch((error) => {
  console.error('Failed to migrate breed IDs:', error);
  process.exitCode = 1;
});
