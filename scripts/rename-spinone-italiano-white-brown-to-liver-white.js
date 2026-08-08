// Rename the Spinone Italiano White & Brown coat document to Liver & White.
// Usage: node scripts/rename-spinone-italiano-white-brown-to-liver-white.js

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccount = require(path.resolve(__dirname, '../temp/doggydex-f83a1-firebase-adminsdk-fbsvc-3e08ebc3fc.json'));

initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();
const oldId = 'spinone_italiano__white_brown';
const newId = 'spinone_italiano__liver_white';

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
    transaction.set(newRef, {
      ...sourceData,
      coat_name: newId,
      color_name: 'Liver & White',
      img_filename: 'spinone_italiano_liver_white.jpg',
      img_two_filename: 'spinone_italiano_liver_white_two.jpg',
      updated_at: FieldValue.serverTimestamp(),
    });

    if (oldDoc.exists) {
      transaction.delete(oldRef);
    }
  });

  const [oldDoc, newDoc] = await Promise.all([oldRef.get(), newRef.get()]);
  console.log(JSON.stringify({
    old_document_exists: oldDoc.exists,
    new_document_exists: newDoc.exists,
    new_document: newDoc.data(),
  }, null, 2));
}

renameCoat().catch((error) => {
  console.error('Error renaming Spinone Italiano coat:', error);
  process.exit(1);
});
