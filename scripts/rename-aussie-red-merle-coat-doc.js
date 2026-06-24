const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({
  credential: applicationDefault(),
});

const db = getFirestore();

async function renameCoatDoc() {
  const oldId = 'australian_shepherd__red_merle';
  const newId = 'australian_shepherd__red_merle_white';
  const coatsRef = db.collection('coats');
  const oldDocRef = coatsRef.doc(oldId);
  const newDocRef = coatsRef.doc(newId);

  const oldDocSnap = await oldDocRef.get();
  if (!oldDocSnap.exists) {
    console.error(`Document with ID '${oldId}' does not exist.`);
    return;
  }

  const data = oldDocSnap.data();
  await newDocRef.set(data);
  await oldDocRef.delete();
  console.log(`Renamed '${oldId}' to '${newId}'.`);
}

renameCoatDoc().catch(console.error);
