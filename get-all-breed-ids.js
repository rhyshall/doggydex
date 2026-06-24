const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({
  credential: applicationDefault(),
});

const db = getFirestore();

async function getAllBreedIds() {
  const breedsRef = db.collection('breeds');
  const snapshot = await breedsRef.get();
  const breedIds = [];

  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.breed_id) {
      breedIds.push(data.breed_id);
    } else {
      breedIds.push(doc.id);
    }
  });

  const fs = require('fs');
  fs.writeFileSync('breed-ids.txt', breedIds.join('\n'), 'utf8');
  console.log('All breed_ids written to breed-ids.txt');
}

getAllBreedIds().catch(console.error);
