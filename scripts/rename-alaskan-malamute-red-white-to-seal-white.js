// Rename the Alaskan Malamute Red & White coat document to Seal & White.
// Usage: node scripts/rename-alaskan-malamute-red-white-to-seal-white.js

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccount = require(path.resolve(__dirname, '../temp/doggydex-f83a1-firebase-adminsdk-fbsvc-3e08ebc3fc.json'));

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

const oldId = 'alaskan_malamute__red_white';
const newId = 'alaskan_malamute__seal_white';

async function renameCoat() {
  const coatsRef = db.collection('coats');
  const oldRef = coatsRef.doc(oldId);
  const newRef = coatsRef.doc(newId);

  await db.runTransaction(async (transaction) => {
    const [oldDoc, newDoc] = await Promise.all([
      transaction.get(oldRef),
      transaction.get(newRef),
    ]);

    if (!oldDoc.exists && !newDoc.exists) {
      throw new Error(`Neither ${oldId} nor ${newId} exists in Firestore.`);
    }

    const sourceData = oldDoc.exists ? oldDoc.data() : newDoc.data();
    const nextData = {
      ...sourceData,
      coat_name: newId,
      color_name: 'Seal & White',
      img_filename: 'alaskan_malamute_seal_white.jpg',
      img_two_filename: 'alaskan_malamute_seal_white_two.jpg',
      updated_at: FieldValue.serverTimestamp(),
    };

    transaction.set(newRef, nextData, { merge: true });

    if (oldDoc.exists) {
      transaction.delete(oldRef);
    }
  });

  console.log(`Renamed ${oldId} to ${newId} and set color_name to Seal & White.`);
}

renameCoat().catch((error) => {
  console.error('Error renaming Alaskan Malamute coat:', error);
  process.exit(1);
});
