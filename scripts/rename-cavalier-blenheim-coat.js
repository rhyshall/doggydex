// Rename the Cavalier King Charles Spaniel Blenheim coat document in Firestore.
// Usage: node scripts/rename-cavalier-blenheim-coat.js

const { initializeApp, cert } = require('firebase-admin/app');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccount = require(path.resolve(
  __dirname,
  '../temp/doggydex-f83a1-firebase-adminsdk-fbsvc-3e08ebc3fc.json'
));

initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();
const oldId = 'cavalier_king_charles_spaniel__blenheim_chestnut_white';
const newId = 'cavalier_king_charles_spaniel__blenheim';

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

    transaction.set(newRef, {
      ...oldSnapshot.data(),
      coat_name: newId,
      color_name: 'Blenheim',
      img_filename: 'cavalier_king_charles_spaniel_blenheim.jpg',
      img_two_filename: 'cavalier_king_charles_spaniel_blenheim_two.jpg',
      updated_at: FieldValue.serverTimestamp(),
    });
    transaction.delete(oldRef);
  });

  const [oldSnapshot, newSnapshot] = await Promise.all([oldRef.get(), newRef.get()]);
  const data = newSnapshot.data();
  if (
    oldSnapshot.exists
    || !newSnapshot.exists
    || data.coat_name !== newId
    || data.color_name !== 'Blenheim'
    || data.img_filename !== 'cavalier_king_charles_spaniel_blenheim.jpg'
    || data.img_two_filename !== 'cavalier_king_charles_spaniel_blenheim_two.jpg'
  ) {
    throw new Error('Post-rename verification failed.');
  }

  console.log(`Renamed '${oldId}' to '${newId}' and verified all related fields.`);
}

renameCoatDocument().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
