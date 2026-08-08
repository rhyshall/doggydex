// Report source and destination Cocker Spaniel coat namespaces in Firestore.

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccount = require(path.resolve(
  __dirname,
  '../temp/doggydex-f83a1-firebase-adminsdk-fbsvc-3e08ebc3fc.json',
));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const breedIds = [
  'cocker_spaniel_american',
  'american_cocker_spaniel',
  'cocker_spaniel_english',
  'english_cocker_spaniel',
];

async function audit() {
  for (const breedId of breedIds) {
    const snapshot = await db.collection('coats').where('breed_id', '==', breedId).get();
    const documents = snapshot.docs
      .map((doc) => ({ id: doc.id, coat_id: doc.data().coat_id }))
      .sort((a, b) => a.coat_id - b.coat_id);
    console.log(breedId, documents);
  }
}

audit().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
