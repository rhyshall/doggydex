// List Whippet coat documents from Firestore.
// Usage: node scripts/list-firestore-whippet-coats.js

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccount = require(path.resolve(
  __dirname,
  '../temp/doggydex-f83a1-firebase-adminsdk-fbsvc-3e08ebc3fc.json',
));

initializeApp({ credential: cert(serviceAccount) });

async function listWhippetCoats() {
  const snapshot = await getFirestore()
    .collection('coats')
    .where('breed_id', '==', 'whippet')
    .get();

  snapshot.docs
    .sort((left, right) => left.id.localeCompare(right.id))
    .forEach((doc) => console.log(doc.id, doc.data()));
}

listWhippetCoats().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
