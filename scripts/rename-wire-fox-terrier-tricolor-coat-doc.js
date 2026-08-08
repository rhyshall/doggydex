// Rename and normalize the Wire Fox Terrier tricolor coat document in Firestore.
// Usage: node scripts/rename-wire-fox-terrier-tricolor-coat-doc.js

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccount = require(path.resolve(
  __dirname,
  '../temp/doggydex-f83a1-firebase-adminsdk-fbsvc-3e08ebc3fc.json',
));

initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();
const oldId = 'wire_fox_terrier__white_with_black_tan';
const newId = 'wire_fox_terrier__tricolor';

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
      color_name: 'Tricolor',
      img_filename: 'wire_fox_terrier_tricolor.jpg',
      img_two_filename: 'wire_fox_terrier_tricolor_two.jpg',
      updated_at: FieldValue.serverTimestamp(),
    });
    transaction.delete(oldRef);
  });

  const [oldSnapshot, newSnapshot] = await Promise.all([
    oldRef.get(),
    newRef.get(),
  ]);

  console.log(`Renamed '${oldId}' to '${newId}' and updated matching fields.`);
  console.log('Source exists:', oldSnapshot.exists);
  console.log('Destination data:', newSnapshot.data());
}

renameCoatDocument().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
