const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({
  credential: applicationDefault(),
});

const db = getFirestore();

async function renameCoatDoc() {
  const oldId = 'afghan_hound__black_tan';
  const newId = 'afghan_hound__black_cream';
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
