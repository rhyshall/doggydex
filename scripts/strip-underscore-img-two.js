// Script to strip the '_' before '.jpg' in each img_two_filename field in Firestore coats collection
// Usage: node strip-underscore-img-two.js

const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({
  credential: applicationDefault(),
});

const db = getFirestore();

async function stripUnderscoreInImgTwo() {
  const coatsRef = db.collection('coats');
  const snapshot = await coatsRef.get();
  let updatedCount = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    let imgTwoFilename = data.img_two_filename;
    if (typeof imgTwoFilename === 'string') {
      // Replace the last occurrence of '_.' before jpg with just '.'
      imgTwoFilename = imgTwoFilename.replace(/_(?=\.jpg$)/i, '');
      await doc.ref.update({ img_two_filename: imgTwoFilename });
      updatedCount++;
      console.log(`Updated coat ${doc.id}: img_two_filename = ${imgTwoFilename}`);
    }
  }
  console.log(`\nUpdated ${updatedCount} coat documents.`);
}

stripUnderscoreInImgTwo().catch((err) => {
  console.error('Error updating coats:', err);
  process.exit(1);
});
