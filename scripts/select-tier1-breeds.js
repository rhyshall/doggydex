// Script to select all breeds from Firestore where tier = 1
// Usage: node scripts/select-tier1-breeds.js

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');

// Path to your service account key
const serviceAccount = require(path.resolve(__dirname, '../temp/doggydex-f83a1-firebase-adminsdk-fbsvc-3e08ebc3fc.json'));

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

async function selectTier1Breeds() {
  const breedsRef = db.collection('breeds');
  const snapshot = await breedsRef.where('tier', '==', 1).get();

  if (snapshot.empty) {
    console.log('No breeds with tier = 1 found.');
    return;
  }

  const breeds = [];
  snapshot.forEach(doc => {
    breeds.push({ id: doc.id, ...doc.data() });
  });

  console.log('Tier 1 breeds:', breeds);
}

selectTier1Breeds().catch(err => {
  console.error('Error selecting tier 1 breeds:', err);
  process.exit(1);
});
