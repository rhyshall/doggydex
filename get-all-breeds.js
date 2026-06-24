const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({
  credential: applicationDefault(),
});

const db = getFirestore();

async function getAllDogIdsAndBreeds() {
  const breedsRef = db.collection('breeds');
  const snapshot = await breedsRef.get();
  const results = [];

  snapshot.forEach(doc => {
    const data = doc.data();
    results.push({
      id: doc.id,
      breed_id: data.breed_id || doc.id,
      breed_name: data.breed_name || '',
    });
  });

  console.log('Dog IDs and Breed Names:');
  results.forEach(entry => {
    console.log(`ID: ${entry.id}, breed_id: ${entry.breed_id}, breed_name: ${entry.breed_name}`);
  });
}

getAllDogIdsAndBreeds().catch(console.error);
