// Rename the Cairn Terrier brindle coat document in Firestore.
// Usage: node scripts/rename-cairn-terrier-black-brindle-coat-doc.js

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccount = require(path.resolve(
  __dirname,
  '../temp/doggydex-f83a1-firebase-adminsdk-fbsvc-3e08ebc3fc.json',
));

initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();
const oldId = 'cairn_terrier__brindle';
const newId = 'cairn_terrier_black_brindle';

async function renameCoatDocument() {
  const oldRef = db.collection('coats').doc(oldId);
  const newRef = db.collection('coats').doc(newId);

  await db.runTransaction(async (transaction) => {
    const [oldSnapshot, newSnapshot] = await transaction.getAll(oldRef, newRef);

    if (!oldSnapshot.exists) {
      throw new Error(`Source document '${oldId}' does not exist.`);
    }
    if (newSnapshot.exists) {
      throw new Error(`Destination document '${newId}' already exists.`);
    }

    transaction.set(newRef, oldSnapshot.data());
    transaction.delete(oldRef);
  });

  const [oldSnapshot, newSnapshot] = await Promise.all([
    oldRef.get(),
    newRef.get(),
  ]);

  console.log(`Renamed '${oldId}' to '${newId}'.`);
  console.log('Source exists:', oldSnapshot.exists);
  console.log('Destination data:', newSnapshot.data());
}

renameCoatDocument().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
