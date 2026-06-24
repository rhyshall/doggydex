const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({
  credential: applicationDefault(),
});

const db = getFirestore();

async function findCoats() {
  const coatsRef = db.collection('coats');
  const querySnapshot = await coatsRef.where('coat_id', 'in', [514, 515]).get();

  if (querySnapshot.empty) {
    console.log('No matching coats found.');
    return;
  }

  querySnapshot.forEach(doc => {
    console.log(`Document ID: ${doc.id}`);
    console.log(doc.data());
  });
}

findCoats().catch(console.error);
