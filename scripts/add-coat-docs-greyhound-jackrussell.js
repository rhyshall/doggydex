const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

initializeApp({
  credential: applicationDefault(),
});

const db = getFirestore();

async function addCoatsForGreyhoundAndJackRussell() {
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

  // Get all used coat_id values in Firestore
  const coatsRef = db.collection('coats');
  const snapshot = await coatsRef.get();
  const usedCoatIds = new Set();
  snapshot.forEach(doc => {
    const data = doc.data();
    if (typeof data.coat_id === 'number') {
      usedCoatIds.add(data.coat_id);
    } else if (typeof data.coat_id === 'string' && !isNaN(parseInt(data.coat_id, 10))) {
      usedCoatIds.add(parseInt(data.coat_id, 10));
    }
  });
  // Helper to get the lowest available coat_id
  function getNextAvailableCoatId() {
    let id = 1;
    while (usedCoatIds.has(id)) {
      id++;
    }
    usedCoatIds.add(id);
    return id;
  }

  // Helper to upload coats for a breed
  async function uploadCoatsForBreed(breed) {
    const breed_id = breed.breed_id;
    if (!breed_id || !Array.isArray(breed.coats)) return;
    for (const coat of breed.coats) {
      let color_name = '';
      if (typeof coat === 'string') {
        color_name = coat;
      } else if (coat && typeof coat === 'object' && coat.color_name) {
        color_name = coat.color_name;
      }
      const safeColor = color_name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      const coat_name = `${breed_id}__${safeColor}`;
      const img_filename = `${coat_name}.jpg`;
      const docData = {
        breed_id,
        coat_id: getNextAvailableCoatId(),
        coat_name,
        color_name,
        image_exists: true,
        img_filename,
        updated_at: FieldValue.serverTimestamp(),
      };
      await coatsRef.doc(coat_name).set(docData);
      console.log(`Uploaded coat: ${coat_name} (coat_id: ${docData.coat_id})`);
    }
  }

  await uploadCoatsForBreed(greyhound);
  await uploadCoatsForBreed(jackRussell);
  console.log('Coats for Greyhound and Jack Russell Terrier uploaded.');
}

addCoatsForGreyhoundAndJackRussell().catch(console.error);
