// Script to rename a Firestore coat document from 'french_bulldog__pied' to 'french_bulldog__blue_pied'
// Usage: node rename-french-bulldog-pied.js

const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({
  credential: applicationDefault(),
});

const db = getFirestore();

async function renameCoatDoc() {
  const oldDocId = 'french_bulldog__pied';
  const newDocId = 'french_bulldog__blue_pied';
  const coatsRef = db.collection('coats');

  const oldDocRef = coatsRef.doc(oldDocId);
  const newDocRef = coatsRef.doc(newDocId);

  const oldDocSnap = await oldDocRef.get();
  if (!oldDocSnap.exists) {
    console.error(`Document ${oldDocId} does not exist.`);
    return;
  }

  const data = oldDocSnap.data();
  await newDocRef.set(data);
  await oldDocRef.delete();

  console.log(`Renamed document '${oldDocId}' to '${newDocId}'.`);
}

renameCoatDoc().catch((err) => {
  console.error('Error renaming document:', err);
});
