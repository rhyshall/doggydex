const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({
  credential: applicationDefault(),
});

const db = getFirestore();

async function addCoatDoc() {
  const docId = 'afghan_hound__black_tan';
  const data = {
    img_filename: 'afghan_hound_black_tan.jpg',
    coat_color: 'Black & Tan',
  };
  const coatsRef = db.collection('coats');
  await coatsRef.doc(docId).set(data);
  console.log(`Created coat document '${docId}'.`);
}

addCoatDoc().catch(console.error);
