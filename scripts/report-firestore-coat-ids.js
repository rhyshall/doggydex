// Script to report duplicate and missing coat_id values from Firestore coats collection
// Usage: node scripts/report-firestore-coat-ids.js

const admin = require('firebase-admin');
const path = require('path');

const coatsCollectionPath = 'coats'; // Change if your collection path is different

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!keyPath) {
  throw new Error('Set GOOGLE_APPLICATION_CREDENTIALS to your service account key path.');
}
const resolvedKeyPath = path.isAbsolute(keyPath) ? keyPath : path.resolve(process.cwd(), keyPath);

admin.initializeApp({
  credential: admin.credential.cert(require(resolvedKeyPath))
});

const db = admin.firestore();

async function main() {
  const snapshot = await db.collection(coatsCollectionPath).get();
  const coats = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    coats.push({ id: doc.id, coat_id: data.coat_id, coat_name: data.coat_name });
  });

  const coatIdPairs = coats.filter(x => typeof x.coat_id === 'number');
  const allIds = coatIdPairs.map(x => x.coat_id);
  const uniqueIds = Array.from(new Set(allIds)).sort((a, b) => a - b);
  const minId = uniqueIds[0];
  const maxId = uniqueIds[uniqueIds.length - 1];
  const missing = [];
  for (let i = minId; i <= maxId; i++) {
    if (!uniqueIds.includes(i)) missing.push(i);
  }
  const duplicates = allIds.filter((id, idx, arr) => arr.indexOf(id) !== idx);
  const duplicateIds = Array.from(new Set(duplicates));

  console.log('coat_id, coat_name pairs:');
  coatIdPairs.forEach(x => {
    console.log(`${x.coat_id}, ${x.coat_name}`);
  });

  if (duplicateIds.length > 0) {
    console.log('\nDuplicate coat_id values found:', duplicateIds);
    coatIdPairs.filter(x => duplicateIds.includes(x.coat_id)).forEach(x => {
      console.log(`Duplicate: coat_id=${x.coat_id}, coat_name=${x.coat_name}`);
    });
  } else {
    console.log('\nNo duplicate coat_id values found.');
  }
  if (missing.length > 0) {
    console.log('\nMissing coat_id values in sequence:', missing);
  } else {
    console.log('\nNo missing coat_id values in sequence.');
  }
  console.log('Done.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
