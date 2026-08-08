// Rename and normalize two Wire Fox Terrier coat documents atomically.
// Usage: node scripts/rename-wire-fox-terrier-white-coat-docs.js

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
const renames = [
  {
    oldId: 'wire_fox_terrier__white_with_black',
    newId: 'wire_fox_terrier__white_black',
    colorName: 'White & Black',
    filenameBase: 'wire_fox_terrier_white_black',
  },
  {
    oldId: 'wire_fox_terrier__white_with_tan',
    newId: 'wire_fox_terrier__white_tan',
    colorName: 'White & Tan',
    filenameBase: 'wire_fox_terrier_white_tan',
  },
];

async function renameCoatDocuments() {
  const oldRefs = renames.map(({ oldId }) => coatsRef.doc(oldId));
  const newRefs = renames.map(({ newId }) => coatsRef.doc(newId));

  await db.runTransaction(async (transaction) => {
    const snapshots = await transaction.getAll(...oldRefs, ...newRefs);
    const oldSnapshots = snapshots.slice(0, oldRefs.length);
    const newSnapshots = snapshots.slice(oldRefs.length);

    renames.forEach(({ oldId, newId }, index) => {
      if (!oldSnapshots[index].exists) {
        throw new Error(`Source document '${oldId}' does not exist.`);
      }
      if (newSnapshots[index].exists) {
        throw new Error(`Destination document '${newId}' already exists.`);
      }
    });

    renames.forEach(({ newId, colorName, filenameBase }, index) => {
      transaction.set(newRefs[index], {
        ...oldSnapshots[index].data(),
        coat_name: newId,
        color_name: colorName,
        img_filename: `${filenameBase}.jpg`,
        img_two_filename: `${filenameBase}_two.jpg`,
        updated_at: FieldValue.serverTimestamp(),
      });
      transaction.delete(oldRefs[index]);
    });
  });

  const verificationSnapshots = await Promise.all([
    ...oldRefs.map((ref) => ref.get()),
    ...newRefs.map((ref) => ref.get()),
  ]);

  renames.forEach(({ oldId, newId }, index) => {
    console.log(`Renamed '${oldId}' to '${newId}' and updated matching fields.`);
    console.log('Source exists:', verificationSnapshots[index].exists);
    console.log(
      'Destination data:',
      verificationSnapshots[oldRefs.length + index].data(),
    );
  });
}

renameCoatDocuments().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
