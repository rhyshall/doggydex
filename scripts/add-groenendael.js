// Add the Groenendael breed and its black coat to Firestore.
// Usage: node scripts/add-groenendael.js

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccount = require(path.resolve(__dirname, '../temp/doggydex-f83a1-firebase-adminsdk-fbsvc-3e08ebc3fc.json'));

initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();
const breedId = 'groenendael';
const coatId = 'groenendael__black';

async function addGroenendael() {
  const breedRef = db.collection('breeds').doc(breedId);
  const coatRef = db.collection('coats').doc(coatId);
  const coatsRef = db.collection('coats');

  await db.runTransaction(async (transaction) => {
    const [breedDoc, coatDoc, allCoatsSnapshot] = await Promise.all([
      transaction.get(breedRef),
      transaction.get(coatRef),
      transaction.get(coatsRef),
    ]);

    if (breedDoc.exists || coatDoc.exists) {
      throw new Error(`${breedId} or ${coatId} already exists in Firestore.`);
    }

    let maxCoatId = 0;
    allCoatsSnapshot.forEach((document) => {
      const numericCoatId = document.data()?.coat_id;
      if (typeof numericCoatId === 'number' && numericCoatId > maxCoatId) {
        maxCoatId = numericCoatId;
      }
    });

    transaction.set(breedRef, {
      breed_id: breedId,
      breed_name: 'Groenendael',
      size_category: 'Medium',
      weight_min_lbs: 45,
      weight_max_lbs: 75,
      height_min_inches: 22,
      height_max_inches: 26,
      energy_level: 'High',
      trainability: 5,
      fun_fact: 'The Groenendael (Belgian Sheepdog) is the long-haired, solid-black variety of the Belgian Shepherd Dog.',
      historical_purpose: 'Herding and protecting livestock',
      origin_country: 'Belgium',
      popularity_rank: null,
      coat_count: 1,
      category_tags: ['Herding'],
      thumbnail: 'groenendael_thumb.jpg',
      updated_at: FieldValue.serverTimestamp(),
    });

    transaction.set(coatRef, {
      coat_id: maxCoatId + 1,
      coat_name: coatId,
      breed_id: breedId,
      color_name: 'Black',
      image_exists: false,
      image_two_exists: false,
      img_filename: 'groenendael_black.jpg',
      img_two_filename: 'groenendael_black_two.jpg',
      updated_at: FieldValue.serverTimestamp(),
    });
  });

  const [breedDoc, coatDoc] = await Promise.all([breedRef.get(), coatRef.get()]);
  console.log(JSON.stringify({
    breed: breedDoc.data(),
    coat: coatDoc.data(),
  }, null, 2));
}

addGroenendael().catch((error) => {
  console.error('Error adding Groenendael:', error);
  process.exit(1);
});
