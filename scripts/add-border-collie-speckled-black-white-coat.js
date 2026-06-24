// Script to add a new coat document to Firestore for border_collie__speckled_black_white
// Usage: node scripts/add-border-collie-speckled-black-white-coat.js

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccount = require(path.resolve(__dirname, '../temp/doggydex-f83a1-firebase-adminsdk-fbsvc-3e08ebc3fc.json'));

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

async function addCoat() {
  // Find the highest coat_id
  const coatsRef = db.collection('coats');
  const snapshot = await coatsRef.orderBy('coat_id', 'desc').limit(1).get();
  let nextCoatId = 1;
  if (!snapshot.empty) {
    const highest = snapshot.docs[0].data();
    nextCoatId = (typeof highest.coat_id === 'number' ? highest.coat_id : parseInt(highest.coat_id, 10)) + 1;
  }

  const docId = 'border_collie__speckled_black_white';
  const data = {
    coat_name: docId,
    coat_id: nextCoatId,
    breed_id: 'border_collie',
    color_name: 'Speckled Black & White',
    img_filename: 'border_collie_speckled_black_white.jpg',
    img_two_filename: 'border_collie_speckled_black_white_two.jpg',
    updated_at: FieldValue.serverTimestamp(),
  };

  await coatsRef.doc(docId).set(data);
  console.log('Added new coat:', data);
}

addCoat().catch(err => {
  console.error('Error adding coat:', err);
  process.exit(1);
});
