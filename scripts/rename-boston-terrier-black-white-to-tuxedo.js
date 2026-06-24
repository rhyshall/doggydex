// Script to rename a coat document in Firestore
// Usage: node scripts/rename-boston-terrier-black-white-to-tuxedo.js

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccount = require(path.resolve(__dirname, '../temp/doggydex-f83a1-firebase-adminsdk-fbsvc-3e08ebc3fc.json'));

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

async function renameCoat() {
  const oldId = 'boston_terrier__black_white';
  const newId = 'boston_terrier__tuxedo';
  const coatsRef = db.collection('coats');

  const oldDoc = await coatsRef.doc(oldId).get();
  if (!oldDoc.exists) {
    console.error('Old document does not exist:', oldId);
    process.exit(1);
  }

  const data = oldDoc.data();
  await coatsRef.doc(newId).set({ ...data, coat_name: newId });
  await coatsRef.doc(oldId).delete();
  console.log(`Renamed coat document from ${oldId} to ${newId}`);
}

renameCoat().catch(err => {
  console.error('Error renaming coat:', err);
  process.exit(1);
});
