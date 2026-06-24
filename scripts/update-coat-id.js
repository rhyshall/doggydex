const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({
  credential: applicationDefault(),
});

const db = getFirestore();

async function updateCoatId() {
  const coatsRef = db.collection('coats');
  const snapshot = await coatsRef.get();
  let maxCoatId = 0;
  snapshot.forEach(doc => {
    const data = doc.data();
    if (typeof data.coat_id === 'number' && data.coat_id > maxCoatId) {
      maxCoatId = data.coat_id;
    }
  });
  const newCoatId = maxCoatId + 1;
  await coatsRef.doc('afghan_hound__black_tan').update({ coat_id: newCoatId });
  console.log(`Updated 'afghan_hound__black_tan' with coat_id: ${newCoatId}`);
}

updateCoatId().catch(console.error);
