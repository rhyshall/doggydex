// Script to check and optionally fix unique/sequential coat_id values in Firestore coats collection
// Usage: node scripts/check-fix-firestore-coat-ids.js [--fix]

const admin = require('firebase-admin');
const path = require('path');

// Set this to your service account key path
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || './serviceAccountKey.json';
const coatsCollectionPath = 'coats'; // Change if your collection path is different

admin.initializeApp({
  credential: admin.credential.cert(require(path.resolve(serviceAccountPath)))
});

const db = admin.firestore();

async function main() {
  const snapshot = await db.collection(coatsCollectionPath).get();
  const coats = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    coats.push({ id: doc.id, ...data });
  });

  // Collect all coat_id values and references
  const coatIdRefs = coats.map(coat => ({
    ref: coat,
    value: coat.coat_id
  })).filter(x => typeof x.value === 'number');

  // Find duplicates and missing
  const allIds = coatIdRefs.map(x => x.value);
  const uniqueIds = Array.from(new Set(allIds)).sort((a, b) => a - b);
  const minId = uniqueIds[0];
  const maxId = uniqueIds[uniqueIds.length - 1];
  const missing = [];
  for (let i = minId; i <= maxId; i++) {
    if (!uniqueIds.includes(i)) missing.push(i);
  }
  const duplicates = allIds.filter((id, idx, arr) => arr.indexOf(id) !== idx);
  const duplicateIds = Array.from(new Set(duplicates));

  console.log(`Total coat_id values: ${allIds.length}`);
  console.log(`Unique coat_id values: ${uniqueIds.length}`);
  if (duplicateIds.length > 0) {
    console.log('Duplicate coat_id values found:', duplicateIds);
  } else {
    console.log('No duplicate coat_id values found.');
  }
  if (missing.length > 0) {
    console.log('Missing coat_id values in sequence:', missing);
  } else {
    console.log('No missing coat_id values in sequence.');
  }

  // If --fix flag is provided, fix duplicates by assigning missing IDs
  if (process.argv.includes('--fix')) {
    let missingIdx = 0;
    let changes = 0;
    const seen = new Set();
    for (const entry of coatIdRefs) {
      if (seen.has(entry.value)) {
        // Duplicate, assign a missing value if available
        if (missingIdx < missing.length) {
          entry.ref.coat_id = missing[missingIdx++];
          changes++;
          // Update Firestore
          await db.collection(coatsCollectionPath).doc(entry.ref.id).update({ coat_id: entry.ref.coat_id });
          console.log(`Updated doc ${entry.ref.id} with new coat_id ${entry.ref.coat_id}`);
        }
      }
      seen.add(entry.ref.coat_id);
    }
    if (changes > 0) {
      console.log(`Fixed ${changes} duplicate coat_id values in Firestore.`);
    } else {
      console.log('No duplicate coat_id values to fix.');
    }
    if (missing.length > 0 && missingIdx < missing.length) {
      console.log('Some missing coat_id values could not be filled (not enough duplicates).');
    } else if (missing.length === 0) {
      console.log('No missing coat_id values in sequence.');
    } else {
      console.log('All missing coat_id values filled.');
    }
  }
  console.log('Done.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
