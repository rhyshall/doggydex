// Rename the Borzoi Golden coat document to Red in Firestore.
// Usage: node scripts/rename-borzoi-golden-to-red.js

const { initializeApp, cert } = require('firebase-admin/app');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccount = require(path.resolve(
  __dirname,
  '../temp/doggydex-f83a1-firebase-adminsdk-fbsvc-3e08ebc3fc.json'
));

initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();
const oldId = 'borzoi__golden';
const newId = 'borzoi__red';

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
      color_name: 'Red',
      img_filename: 'borzoi_red.jpg',
      img_two_filename: 'borzoi_red_two.jpg',
      updated_at: FieldValue.serverTimestamp(),
    });
    transaction.delete(oldRef);
  });

  const [oldSnapshot, newSnapshot] = await Promise.all([
    oldRef.get(),
    newRef.get(),
  ]);

  if (oldSnapshot.exists || !newSnapshot.exists) {
    throw new Error('Post-rename verification failed.');
  }

  const data = newSnapshot.data();
  console.log(JSON.stringify({
    old_exists: oldSnapshot.exists,
    new_exists: newSnapshot.exists,
    coat_name: data.coat_name,
    color_name: data.color_name,
    img_filename: data.img_filename,
    img_two_filename: data.img_two_filename,
  }, null, 2));
}

renameCoatDocument().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
