// Rename and normalize the Yorkshire Terrier Blue & Gold coat document in Firestore.
// Usage: node scripts/rename-yorkshire-terrier-blue-gold-coat-doc.js

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccount = require(path.resolve(
  __dirname,
  '../temp/doggydex-f83a1-firebase-adminsdk-fbsvc-3e08ebc3fc.json',
));

initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();
const oldId = 'yorkshire_terrier__silver_tan';
const newId = 'yorkshire_terrier__blue_gold';

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
      color_name: 'Blue & Gold',
      img_filename: 'yorkshire_terrier_blue_gold.jpg',
      img_two_filename: 'yorkshire_terrier_blue_gold_two.jpg',
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
