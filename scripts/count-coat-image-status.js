// Report current image_exists counts from the Firestore coats collection.

const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require(path.resolve(
  __dirname,
  '../temp/doggydex-f83a1-firebase-adminsdk-fbsvc-3e08ebc3fc.json'
));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
  const snapshot = await db.collection('coats').get();
  const counts = { true: 0, false: 0, other: 0, total: snapshot.size };

  snapshot.forEach((document) => {
    const value = document.data().image_exists;
    if (value === true) counts.true += 1;
    else if (value === false) counts.false += 1;
    else counts.other += 1;
  });

  console.log(JSON.stringify(counts, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
