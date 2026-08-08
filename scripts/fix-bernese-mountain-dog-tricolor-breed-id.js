// Correct the Bernese Mountain Dog tricolor coat's breed_id in Firestore.
// Usage: node scripts/fix-bernese-mountain-dog-tricolor-breed-id.js

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccount = require(path.resolve(
  __dirname,
  '../temp/doggydex-f83a1-firebase-adminsdk-fbsvc-3e08ebc3fc.json',
));

initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();
const docId = 'bernese_mountain_dog__tricolor';

async function fixBreedId() {
  const docRef = db.collection('coats').doc(docId);

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(docRef);
    if (!snapshot.exists) {
      throw new Error(`Document '${docId}' does not exist.`);
    }

    transaction.update(docRef, {
      breed_id: 'bernese_mountain_dog',
      updated_at: FieldValue.serverTimestamp(),
    });
  });

  const updatedDoc = await docRef.get();
  console.log('Updated coat:', updatedDoc.data());
}

fixBreedId().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
