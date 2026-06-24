const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');

initializeApp({
  credential: applicationDefault(),
});

const db = getFirestore();

async function updateBreedTiers() {
  // Read dog-breeds-tiers.json, expecting { breed_id: tier, ... }
  const breedTiers = JSON.parse(fs.readFileSync('data/dog-breeds-tiers.json', 'utf8'));
  let updated = 0;
  for (const [breed_id, tier] of Object.entries(breedTiers)) {
    if (!breed_id || !tier) {
      console.warn(`Skipping invalid entry: ${breed_id}: ${tier}`);
      continue;
    }
    const docRef = db.collection('breeds').doc(breed_id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      console.warn(`No breed found for breed_id (as doc ID): ${breed_id}`);
      continue;
    }
    await docRef.update({ tier });
    updated++;
    console.log(`Updated ${breed_id} with tier: ${tier}`);
  }
  console.log(`Done. Updated ${updated} breeds.`);
}

updateBreedTiers().catch(console.error);
