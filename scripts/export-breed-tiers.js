// Script to update dog-breeds-tiers.json with tier values from Firestore breeds collection
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');

initializeApp({
  credential: applicationDefault(),
});

const db = getFirestore();

async function exportBreedTiers() {
  const breedsSnap = await db.collection('breeds').get();
  const breedTiers = {};
  breedsSnap.forEach(doc => {
    const data = doc.data();
    // Prefer breed_id field, else use doc id
    const breedId = data.breed_id || doc.id;
    if (breedId && data.tier) {
      breedTiers[breedId] = data.tier;
    }
  });
  fs.writeFileSync('data/dog-breeds-tiers.json', JSON.stringify(breedTiers, null, 2));
  console.log('dog-breeds-tiers.json updated with Firestore breed tiers.');
}

exportBreedTiers().catch(console.error);
