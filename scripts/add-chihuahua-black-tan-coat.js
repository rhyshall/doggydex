// Add the Chihuahua Black & Tan coat document in Firestore.
// Usage: node scripts/add-chihuahua-black-tan-coat.js

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccount = require(path.resolve(
  __dirname,
  '../temp/doggydex-f83a1-firebase-adminsdk-fbsvc-3e08ebc3fc.json',
));

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();
const docId = 'chihuahua__black_tan';

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
      breed_id: 'chihuahua',
      color_name: 'Black & Tan',
      image_exists: false,
      image_two_exists: false,
      img_filename: 'chihuahua_black_tan.jpg',
      img_two_filename: 'chihuahua_black_tan_two.jpg',
      updated_at: FieldValue.serverTimestamp(),
    });
  });

  const createdDoc = await docRef.get();
  console.log('Added new coat:', createdDoc.data());
}

addCoat().catch((error) => {
  console.error('Error adding Chihuahua Black & Tan coat:', error);
  process.exit(1);
});
