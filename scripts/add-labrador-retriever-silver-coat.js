// Script to add a new coat document for labrador_retriever__silver in Firestore
// Usage: node scripts/add-labrador-retriever-silver-coat.js

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccount = require(path.resolve(__dirname, '../temp/doggydex-f83a1-firebase-adminsdk-fbsvc-3e08ebc3fc.json'));

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

async function addCoat() {
  const docId = 'labrador_retriever__silver';
  const data = {
    coat_name: docId,
    image_exists: true,
    img_filename: 'labrador_retriever_silver.jpg',
    img_two_filename: 'labrador_retriever_silver_two.jpg',
    updated_at: FieldValue.serverTimestamp(),
  };
  await db.collection('coats').doc(docId).set(data);
  console.log('Added new coat:', data);
}

addCoat().catch(err => {
  console.error('Error adding coat:', err);
  process.exit(1);
});
