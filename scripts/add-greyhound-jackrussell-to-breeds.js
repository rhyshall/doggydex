const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

initializeApp({
  credential: applicationDefault(),
});

const db = getFirestore();

async function addGreyhoundAndJackRussell() {
  // Load dog-breeds.json
  const breedsJsonPath = path.join(__dirname, '../data/dog-breeds.json');
  const breedsData = JSON.parse(fs.readFileSync(breedsJsonPath, 'utf8'));
  const breedsArr = breedsData.breeds || [];

  // Find Greyhound and Jack Russell Terrier records by breed_id
  const greyhound = breedsArr.find(b => b.breed_id === 'greyhound');
  const jackRussell = breedsArr.find(b => b.breed_id === 'jack_russell_terrier');

  if (!greyhound || !jackRussell) {
    console.error('Could not find both Greyhound and Jack Russell Terrier in dog-breeds.json');
    return;
  }

  // Get next two highest id values from breeds collection
  const breedsRef = db.collection('breeds');
  const snapshot = await breedsRef.get();
  let maxId = 0;
  snapshot.forEach(doc => {
    const data = doc.data();
    if (typeof data.id === 'number' && data.id > maxId) {
      maxId = data.id;
    }
  });
  const nextId = maxId + 1;
  const nextNextId = maxId + 2;

  // Prepare records
  const greyhoundDoc = { ...greyhound, id: nextId };
  const jackRussellDoc = { ...jackRussell, id: nextNextId };

  // Add to Firestore
  await breedsRef.doc('greyhound').set(greyhoundDoc);
  await breedsRef.doc('jack_russell_terrier').set(jackRussellDoc);
  console.log(`Added Greyhound (id: ${nextId}) and Jack Russell Terrier (id: ${nextNextId}) to breeds collection.`);
}

addGreyhoundAndJackRussell().catch(console.error);
