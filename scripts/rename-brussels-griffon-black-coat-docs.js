// Rename two Brussels Griffon coat documents in one atomic Firestore transaction.
// Usage: node scripts/rename-brussels-griffon-black-coat-docs.js

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
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
    oldId: 'brussels_griffon__rough_coat',
    newId: 'brussels_griffon__black',
  },
  {
    oldId: 'brussels_griffon__smooth_coat',
    newId: 'brussels_griffon__black_tan',
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

    renames.forEach((rename, index) => {
      transaction.set(newRefs[index], oldSnapshots[index].data());
      transaction.delete(oldRefs[index]);
    });
  });

  const verificationSnapshots = await Promise.all([
    ...oldRefs.map((ref) => ref.get()),
    ...newRefs.map((ref) => ref.get()),
  ]);

  renames.forEach(({ oldId, newId }, index) => {
    console.log(`Renamed '${oldId}' to '${newId}'.`);
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
