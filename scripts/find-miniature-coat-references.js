// Find miniature/miniture references in Firestore coat document IDs and string fields.

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccount = require(path.resolve(
  __dirname,
  '../temp/doggydex-f83a1-firebase-adminsdk-fbsvc-3e08ebc3fc.json',
));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
const pattern = /min(?:iature|iture)/i;

function findStringMatches(value, fieldPath = '') {
  if (typeof value === 'string') {
    return pattern.test(value) ? [{ field: fieldPath, value }] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findStringMatches(item, `${fieldPath}[${index}]`));
  }
  if (value && typeof value === 'object' && typeof value.toDate !== 'function') {
    return Object.entries(value).flatMap(([key, item]) =>
      findStringMatches(item, fieldPath ? `${fieldPath}.${key}` : key),
    );
  }
  return [];
}

async function main() {
  const snapshot = await db.collection('coats').get();
  const matches = [];

  snapshot.forEach((doc) => {
    const fieldMatches = findStringMatches(doc.data());
    if (pattern.test(doc.id)) {
      fieldMatches.unshift({ field: '__document_id__', value: doc.id });
    }
    if (fieldMatches.length > 0) matches.push({ document_id: doc.id, matches: fieldMatches });
  });

  console.log(`Scanned ${snapshot.size} coat documents.`);
  console.log(`Documents with miniature/miniture references: ${matches.length}`);
  matches.forEach((match) => console.log(JSON.stringify(match)));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
