// Rename the American Cocker Spaniel Parti Color coat document to Parti.
// Usage: node scripts/rename-american-cocker-parti-color-to-parti.js

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccount = require(path.resolve(
  __dirname,
  '../temp/doggydex-f83a1-firebase-adminsdk-fbsvc-3e08ebc3fc.json',
));

initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();
const coatsRef = db.collection('coats');
const oldDocumentId = 'cocker_spaniel_american__parti_color';
const newDocumentId = 'cocker_spaniel_american__parti';

async function renameCoatDocument() {
  const oldRef = coatsRef.doc(oldDocumentId);
  const newRef = coatsRef.doc(newDocumentId);

  await db.runTransaction(async (transaction) => {
    const [oldSnapshot, newSnapshot] = await transaction.getAll(oldRef, newRef);

    if (!oldSnapshot.exists) {
      throw new Error(`Source document '${oldDocumentId}' does not exist.`);
    }
    if (newSnapshot.exists) {
      throw new Error(`Destination document '${newDocumentId}' already exists.`);
    }

    transaction.set(newRef, {
      ...oldSnapshot.data(),
      coat_name: newDocumentId,
      color_name: 'Parti',
      breed_id: 'cocker_spaniel_american',
      img_filename: 'cocker_spaniel_american_parti.jpg',
      img_two_filename: 'cocker_spaniel_american_parti_two.jpg',
      updated_at: FieldValue.serverTimestamp(),
    });
    transaction.delete(oldRef);
  });

  const [oldSnapshot, newSnapshot] = await Promise.all([oldRef.get(), newRef.get()]);
  console.log('Source exists:', oldSnapshot.exists);
  console.log('Destination:', { document_id: newSnapshot.id, ...newSnapshot.data() });
}

renameCoatDocument().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
