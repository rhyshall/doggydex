// Replace the legacy Chinese Crested coat documents with the five implemented variants.
// Usage: node scripts/replace-chinese-crested-coats.js

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccount = require(path.resolve(
  __dirname,
  '../temp/doggydex-f83a1-firebase-adminsdk-fbsvc-3e08ebc3fc.json',
));

initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();
const coatsRef = db.collection('coats');
const breedId = 'chinese_crested';
const variants = [
  ['hairless_black', 'Hairless Black'],
  ['hairless_blue', 'Hairless Blue'],
  ['hairless_pink_spotted', 'Hairless Pink Spotted'],
  ['powderpuff_black_white', 'Powderpuff Black & White'],
  ['powderpuff_white', 'Powderpuff White'],
];

async function replaceCoats() {
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(
      coatsRef.where('breed_id', '==', breedId),
    );

    if (snapshot.size !== variants.length) {
      throw new Error(
        `Expected ${variants.length} Chinese Crested coats, found ${snapshot.size}.`,
      );
    }

    const coatIds = snapshot.docs
      .map((doc) => doc.data().coat_id)
      .sort((a, b) => a - b);

    if (coatIds.some((coatId) => !Number.isInteger(coatId))) {
      throw new Error('Every existing Chinese Crested coat must have a numeric coat_id.');
    }

    snapshot.docs.forEach((doc) => transaction.delete(doc.ref));

    variants.forEach(([suffix, colorName], index) => {
      const coatName = `${breedId}__${suffix}`;
      transaction.set(coatsRef.doc(coatName), {
        coat_id: coatIds[index],
        coat_name: coatName,
        breed_id: breedId,
        color_name: colorName,
        img_filename: `${breedId}_${suffix}.jpg`,
        img_two_filename: `${breedId}_${suffix}_two.jpg`,
        image_exists: true,
        image_two_exists: false,
        updated_at: FieldValue.serverTimestamp(),
      });
    });
  });

  const verification = await coatsRef.where('breed_id', '==', breedId).get();
  const coats = verification.docs
    .map((doc) => ({ document_id: doc.id, ...doc.data() }))
    .sort((a, b) => a.coat_id - b.coat_id);

  console.log(`Chinese Crested now has ${coats.length} coat documents:`);
  coats.forEach((coat) => console.log({
    document_id: coat.document_id,
    coat_id: coat.coat_id,
    color_name: coat.color_name,
    img_filename: coat.img_filename,
    image_exists: coat.image_exists,
  }));
}

replaceCoats().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
