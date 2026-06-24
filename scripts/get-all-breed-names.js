const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({
  credential: applicationDefault(),
});

const db = getFirestore();

async function getAllBreedNames() {
  const fs = require('fs');
  const path = require('path');
  const breedsRef = db.collection('breeds');
  const snapshot = await breedsRef.get();
  const breedNames = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.breed_name) {
      breedNames.push(data.breed_name);
    }
  });
  const outputPath = path.join(__dirname, '../data/dog-breeds-list.txt');
  fs.writeFileSync(outputPath, breedNames.join('\n'), 'utf8');
  console.log(`Wrote ${breedNames.length} breed names to dog-breeds-list.txt`);
  return breedNames;
}

getAllBreedNames().catch(console.error);
