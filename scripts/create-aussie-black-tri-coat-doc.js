const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({
  credential: applicationDefault(),
});

const db = getFirestore();

async function duplicateCoatDoc() {
  const sourceId = 'australian_shepherd__black_white';
  const newId = 'australian_shepherd__black_tri';
  const coatsRef = db.collection('coats');
  const sourceDocRef = coatsRef.doc(sourceId);
  const newDocRef = coatsRef.doc(newId);

  const sourceDocSnap = await sourceDocRef.get();
  if (!sourceDocSnap.exists) {
    console.error(`Source document with ID '${sourceId}' does not exist.`);
    return;
  }

  const data = sourceDocSnap.data();
  await newDocRef.set(data);
  console.log(`Created new coat document '${newId}' with data from '${sourceId}'.`);
}

duplicateCoatDoc().catch(console.error);
