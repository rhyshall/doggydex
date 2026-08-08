// Replace cocker_spaniel_english coats with the five requested variants.
// Usage: node scripts/replace-english-cocker-spaniel-coats.js

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
const breedId = 'cocker_spaniel_english';

// Keep Black on its existing coat ID. The other requested variants reuse the
// next four IDs, and the obsolete sixth coat ID is retired.
const desiredCoats = [
  { suffix: 'black', colorName: 'Black', coatId: 183 },
  { suffix: 'golden', colorName: 'Golden', coatId: 184 },
  { suffix: 'liver_roan', colorName: 'Liver Roan', coatId: 185 },
  { suffix: 'blue_roan', colorName: 'Blue Roan', coatId: 186 },
  { suffix: 'orange_roan', colorName: 'Orange Roan', coatId: 187 },
];

async function replaceCoatDocuments() {
  await db.runTransaction(async (transaction) => {
    const currentSnapshot = await transaction.get(
      coatsRef.where('breed_id', '==', breedId),
    );

    if (currentSnapshot.size !== 6) {
      throw new Error(`Expected 6 existing '${breedId}' coats, found ${currentSnapshot.size}.`);
    }

    const actualCoatIds = currentSnapshot.docs
      .map((doc) => doc.data().coat_id)
      .sort((a, b) => a - b);
    const expectedCoatIds = [183, 184, 185, 186, 187, 188];

    if (actualCoatIds.join(',') !== expectedCoatIds.join(',')) {
      throw new Error(`Unexpected coat IDs: ${actualCoatIds.join(', ')}.`);
    }

    currentSnapshot.docs.forEach((doc) => transaction.delete(doc.ref));

    desiredCoats.forEach(({ suffix, colorName, coatId }) => {
      const documentId = `${breedId}__${suffix}`;
      transaction.set(coatsRef.doc(documentId), {
        coat_id: coatId,
        coat_name: documentId,
        breed_id: breedId,
        color_name: colorName,
        img_filename: `${breedId}_${suffix}.jpg`,
        img_two_filename: `${breedId}_${suffix}_two.jpg`,
        image_exists: false,
        image_two_exists: false,
        updated_at: FieldValue.serverTimestamp(),
      });
    });
  });

  const verification = await coatsRef.where('breed_id', '==', breedId).get();
  const coats = verification.docs
    .map((doc) => ({ document_id: doc.id, ...doc.data() }))
    .sort((a, b) => a.coat_id - b.coat_id);

  console.log(`'${breedId}' now has ${coats.length} coat documents:`);
  coats.forEach((coat) => console.log({
    document_id: coat.document_id,
    coat_id: coat.coat_id,
    color_name: coat.color_name,
    img_filename: coat.img_filename,
    img_two_filename: coat.img_two_filename,
    image_exists: coat.image_exists,
    image_two_exists: coat.image_two_exists,
  }));
}

replaceCoatDocuments().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
