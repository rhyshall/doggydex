// Rename the Newfoundland Landseer coat document in Firestore.
// Usage: node scripts/rename-newfoundland-landseer-coat-doc.js

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccount = require(path.resolve(
  __dirname,
  '../temp/doggydex-f83a1-firebase-adminsdk-fbsvc-3e08ebc3fc.json'
));

initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();
const oldId = 'newfoundland__landseer_white_black';
const newId = 'newfoundland__landseer';

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

  console.log(`Renamed '${oldId}' to '${newId}'.`);
}

renameCoatDocument().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
