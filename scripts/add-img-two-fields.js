// Script to add img_two_filename and image_two_exists to all coats documents in Firestore
// Usage: node add-img-two-fields.js

const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({
  credential: applicationDefault(),
});

const db = getFirestore();

async function updateAllCoats() {
  const coatsRef = db.collection('coats');
  const snapshot = await coatsRef.get();
  let updatedCount = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const imgFilename = data.img_filename;
    let imgTwoFilename = null;
    if (typeof imgFilename === 'string' && imgFilename.endsWith('.jpg')) {
      imgTwoFilename = imgFilename.replace(/\.jpg$/i, '_two_.jpg');
    } else if (typeof imgFilename === 'string') {
      imgTwoFilename = imgFilename + '_two_';
    }
    await doc.ref.update({
      img_two_filename: imgTwoFilename,
      image_two_exists: false,
    });
    updatedCount++;
    console.log(`Updated coat ${doc.id}: img_two_filename = ${imgTwoFilename}, image_two_exists = false`);
  }
  console.log(`\nUpdated ${updatedCount} coat documents.`);
}

updateAllCoats().catch((err) => {
  console.error('Error updating coats:', err);
  process.exit(1);
});
