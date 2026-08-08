// Rename the Spinone Italiano White & Roan coat document to Liver Roan.
// Usage: node scripts/rename-spinone-italiano-white-roan-to-liver-roan.js

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccount = require(path.resolve(__dirname, '../temp/doggydex-f83a1-firebase-adminsdk-fbsvc-3e08ebc3fc.json'));

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

const oldId = 'spinone_italiano__white_roan';
const newId = 'spinone_italiano__liver_roan';

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
      color_name: 'Liver Roan',
      img_filename: 'spinone_italiano_liver_roan.jpg',
      img_two_filename: 'spinone_italiano_liver_roan_two.jpg',
      updated_at: FieldValue.serverTimestamp(),
    });

    if (oldDoc.exists) {
      transaction.delete(oldRef);
    }
  });

  const [oldDoc, newDoc] = await Promise.all([
    db.collection('coats').doc(oldId).get(),
    db.collection('coats').doc(newId).get(),
  ]);

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
