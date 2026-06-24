// Script to rename all bulldog* documents to english_bulldog* in Firestore
// and update breed/coat fields accordingly
// Usage: node scripts/rename-bulldog-to-english-bulldog.js

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccount = require(path.resolve(__dirname, '../temp/doggydex-f83a1-firebase-adminsdk-fbsvc-3e08ebc3fc.json'));

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

async function renameBulldogDocs() {
  // 1. Update breeds collection
  const oldBreedId = 'bulldog';
  const newBreedId = 'english_bulldog';
  const breedsRef = db.collection('breeds');
  const oldBreedDoc = await breedsRef.doc(oldBreedId).get();
  if (oldBreedDoc.exists) {
    const data = oldBreedDoc.data();
    await breedsRef.doc(newBreedId).set({
      ...data,
      breed_id: newBreedId,
      breed_name: 'English Bulldog',
      // update any other fields if needed
    });
    await breedsRef.doc(oldBreedId).delete();
    console.log(`Renamed breed doc from ${oldBreedId} to ${newBreedId}`);
  } else {
    console.warn('No bulldog breed doc found.');
  }

  // 2. Update coats collection
  const coatsRef = db.collection('coats');
  const snapshot = await coatsRef.where('breed_id', '==', oldBreedId).get();
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const oldCoatId = doc.id;
    const newCoatId = oldCoatId.replace(/^bulldog/, 'english_bulldog');
    await coatsRef.doc(newCoatId).set({
      ...data,
      breed_id: newBreedId,
      coat_name: newCoatId,
    });
    await coatsRef.doc(oldCoatId).delete();
    console.log(`Renamed coat doc from ${oldCoatId} to ${newCoatId}`);
  }
}

renameBulldogDocs().catch(err => {
  console.error('Error renaming bulldog docs:', err);
  process.exit(1);
});
