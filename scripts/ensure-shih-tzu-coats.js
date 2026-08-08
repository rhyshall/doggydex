// Ensure the requested Shih Tzu coat documents exist in Firestore.
// Usage: node scripts/ensure-shih-tzu-coats.js

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccount = require(path.resolve(__dirname, '../temp/doggydex-f83a1-firebase-adminsdk-fbsvc-3e08ebc3fc.json'));

initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();
const requestedCoats = [
  ['gold_white', 'Gold & White'],
  ['white', 'White'],
  ['black_white', 'Black & White'],
  ['gold', 'Gold'],
  ['black', 'Black'],
  ['brindle', 'Brindle'],
  ['liver_white', 'Liver & White'],
  ['liver', 'Liver'],
].map(([slug, colorName]) => ({
  docId: `shih_tzu__${slug}`,
  colorName,
  imgFilename: `shih_tzu_${slug}.jpg`,
  imgTwoFilename: `shih_tzu_${slug}_two.jpg`,
}));

async function ensureCoats() {
  const coatsRef = db.collection('coats');
  const result = await db.runTransaction(async (transaction) => {
    const allCoatsSnapshot = await transaction.get(coatsRef);
    const existingIds = new Set(allCoatsSnapshot.docs.map((doc) => doc.id));

    let maxCoatId = 0;
    allCoatsSnapshot.forEach((coatDoc) => {
      const coatId = coatDoc.data()?.coat_id;
      if (typeof coatId === 'number' && coatId > maxCoatId) {
        maxCoatId = coatId;
      }
    });

    const created = [];
    const existing = [];

    requestedCoats.forEach((coat) => {
      if (existingIds.has(coat.docId)) {
        existing.push(coat.docId);
        return;
      }

      maxCoatId += 1;
      transaction.set(coatsRef.doc(coat.docId), {
        coat_id: maxCoatId,
        coat_name: coat.docId,
        breed_id: 'shih_tzu',
        color_name: coat.colorName,
        image_exists: false,
        image_two_exists: false,
        img_filename: coat.imgFilename,
        img_two_filename: coat.imgTwoFilename,
        updated_at: FieldValue.serverTimestamp(),
      });
      created.push({ docId: coat.docId, coatId: maxCoatId });
    });

    return { existing, created };
  });

  const verified = [];
  for (const coat of requestedCoats) {
    const snapshot = await coatsRef.doc(coat.docId).get();
    verified.push({ id: snapshot.id, exists: snapshot.exists, data: snapshot.data() });
  }

  console.log(JSON.stringify({ ...result, verified }, null, 2));
}

ensureCoats().catch((error) => {
  console.error('Error ensuring Shih Tzu coats:', error);
  process.exit(1);
});
