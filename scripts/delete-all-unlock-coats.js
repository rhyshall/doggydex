// scripts/delete-all-unlock-coats.js
// Deletes all documents in the unlock_coats collection

const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({
  credential: applicationDefault(),
});

const db = getFirestore();

async function deleteAllUnlockCoats() {
  const snapshot = await db.collection('unlock_coats').get();
  if (snapshot.empty) {
    console.log('No unlock_coats documents found.');
    return;
  }
  const batch = db.batch();
  snapshot.docs.forEach(doc => {
    batch.delete(doc.ref);
  });
  await batch.commit();
  console.log(`Deleted ${snapshot.size} unlock_coats documents.`);
}

deleteAllUnlockCoats().catch(err => {
  console.error('Error deleting unlock_coats:', err);
  process.exit(1);
});
