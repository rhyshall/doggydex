// Count Firestore coat documents by their image_exists value.
// Usage: node scripts/count-firestore-coat-image-status.js

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccount = require(path.resolve(
  __dirname,
  '../temp/doggydex-f83a1-firebase-adminsdk-fbsvc-3e08ebc3fc.json',
));

initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();

async function countCoatImageStatuses() {
  const snapshot = await db.collection('coats').get();
  const counts = {
    true: 0,
    false: 0,
    missingOrInvalid: 0,
  };

  snapshot.forEach((doc) => {
    const value = doc.data().image_exists;
    if (value === true) counts.true += 1;
    else if (value === false) counts.false += 1;
    else counts.missingOrInvalid += 1;
  });

  console.log('Total coat documents:', snapshot.size);
  console.log('image_exists = true:', counts.true);
  console.log('image_exists = false:', counts.false);
  console.log('image_exists missing or invalid:', counts.missingOrInvalid);
}

countCoatImageStatuses().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
