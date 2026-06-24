// Script to copy a coat document in Firestore
// Usage: node scripts/copy-border-collie-tricolor-to-blue-merle-tricolor.js

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccount = require(path.resolve(__dirname, '../temp/doggydex-f83a1-firebase-adminsdk-fbsvc-3e08ebc3fc.json'));

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

async function copyCoat() {
  const oldId = 'border_collie__tricolor';
  const newId = 'border_collie__blue_merle_tricolor';
  const coatsRef = db.collection('coats');

  const oldDoc = await coatsRef.doc(oldId).get();
  if (!oldDoc.exists) {
    console.error('Source document does not exist:', oldId);
    process.exit(1);
  }

  const data = oldDoc.data();
  // Optionally, update coat_name and updated_at
  await coatsRef.doc(newId).set({
    ...data,
    coat_name: newId,
    updated_at: FieldValue.serverTimestamp(),
  });
  console.log(`Copied coat document from ${oldId} to ${newId}`);
}

copyCoat().catch(err => {
  console.error('Error copying coat:', err);
  process.exit(1);
});
