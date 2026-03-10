/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');

const admin = require('firebase-admin');

const COATS_COLLECTION = 'coats';
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
  const coatsSnapshot = await db
    .collection(COATS_COLLECTION)
    .orderBy(admin.firestore.FieldPath.documentId())
    .get();

  if (coatsSnapshot.empty) {
    console.log('No coat docs found. Nothing to migrate.');
    return;
  }

  const operations = coatsSnapshot.docs.map((coatDoc, index) => {
    const data = coatDoc.data() || {};
    const oldCoatId = data?.coat_id != null ? String(data.coat_id) : coatDoc.id;
    const nextCoatId = startAt + index;

    return {
      ref: coatDoc.ref,
      docId: coatDoc.id,
      oldCoatId,
      nextCoatId,
      update: {
        coat_name: oldCoatId,
        coat_id: nextCoatId,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      },
    };
  });

  if (isDryRun) {
    console.log('Dry run only. No Firestore writes were made.');
    console.log(`Coat docs scanned: ${operations.length}`);
    console.log(`Coat ID range: ${startAt}..${startAt + operations.length - 1}`);

    const preview = operations.slice(0, 10).map((item) => ({
      doc_id: item.docId,
      old_coat_id: item.oldCoatId,
      new_coat_id: item.nextCoatId,
      new_coat_name: item.oldCoatId,
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
    `Migration complete. Updated ${operations.length} coat docs with sequential coat_id values from ${startAt} to ${startAt + operations.length - 1}.`
  );
}

main().catch((error) => {
  console.error('Failed to migrate coat IDs:', error);
  process.exitCode = 1;
});
