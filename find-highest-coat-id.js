const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({
  credential: applicationDefault(),
});

const db = getFirestore();

async function findHighestCoatId() {
  const coatsRef = db.collection('coats');
  const snapshot = await coatsRef.get();
  let maxCoatId = null;
  let maxDoc = null;

  snapshot.forEach(doc => {
    const data = doc.data();
    const coatId = typeof data.coat_id === 'number' ? data.coat_id : parseInt(data.coat_id, 10);
    if (!isNaN(coatId) && (maxCoatId === null || coatId > maxCoatId)) {
      maxCoatId = coatId;
      maxDoc = { id: doc.id, ...data };
    }
  });

  if (maxCoatId !== null) {
    console.log('Highest coat_id:', maxCoatId);
    console.log('Document:', maxDoc);
  } else {
    console.log('No coat_id found in coats collection.');
  }
}

findHighestCoatId().catch(console.error);
