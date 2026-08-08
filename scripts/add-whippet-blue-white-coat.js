// Add the Whippet Blue & White coat document in Firestore.
// Usage: node scripts/add-whippet-blue-white-coat.js

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccount = require(path.resolve(
  __dirname,
  '../temp/doggydex-f83a1-firebase-adminsdk-fbsvc-3e08ebc3fc.json',
));

initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();
const docId = 'whippet__blue_white';

async function addCoat() {
  const coatsRef = db.collection('coats');
  const docRef = coatsRef.doc(docId);

  await db.runTransaction(async (transaction) => {
    const [targetDoc, allCoatsSnapshot] = await Promise.all([
      transaction.get(docRef),
      transaction.get(coatsRef),
    ]);

    if (targetDoc.exists) {
      throw new Error(`${docId} already exists.`);
    }

    let maxCoatId = 0;
    allCoatsSnapshot.forEach((coatDoc) => {
      const coatId = coatDoc.data()?.coat_id;
      if (typeof coatId === 'number' && coatId > maxCoatId) {
        maxCoatId = coatId;
      }
    });

    transaction.set(docRef, {
      coat_id: maxCoatId + 1,
      coat_name: docId,
      breed_id: 'whippet',
      color_name: 'Blue & White',
      image_exists: false,
      image_two_exists: false,
      img_filename: 'whippet_blue_white.jpg',
      img_two_filename: 'whippet_blue_white_two.jpg',
      updated_at: FieldValue.serverTimestamp(),
    });
  });

  const createdDoc = await docRef.get();
  console.log('Added new coat:', createdDoc.data());
}

addCoat().catch((error) => {
  console.error('Error adding Whippet Blue & White coat:', error);
  process.exit(1);
});
