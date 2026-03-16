// Script to create a new coat in Firestore if coat_id >= 67
// Usage: node create-coat.js <coat_id> <breed_id> <color_name>

const { initializeApp, applicationDefault, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

// TODO: Replace with your service account path or use env var
const serviceAccount = require('../temp/doggydex-f83a1-firebase-adminsdk-fbsvc-3e08ebc3fc.json');

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();


async function updateCoatIfExists(coat_id, breed_id, color_name) {
  if (Number(coat_id) < 67) {
    console.log('coat_id < 67, not updating.');
    return;
  }
  const coatDocRef = db.collection('coats').doc(String(coat_id));
  const docSnap = await coatDocRef.get();
  if (!docSnap.exists) {
    console.log('Coat does not exist, not updating:', coat_id);
    return;
  }
  await coatDocRef.update({
    breed_id,
    color_name,
    img_filename: `${breed_id}_${color_name}.jpg`,
    updated_at: FieldValue.serverTimestamp(),
  });
  console.log('Coat updated:', coat_id);
}

// Parse args
const [,, coat_id, breed_id, color_name] = process.argv;
if (!coat_id || !breed_id || !color_name) {
  console.error('Usage: node create-coat.js <coat_id> <breed_id> <color_name>');
  process.exit(1);
}

updateCoatIfExists(coat_id, breed_id, color_name).then(() => process.exit(0));
