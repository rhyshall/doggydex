// Rename Blue Picardy Spaniel coat documents in one atomic Firestore transaction.
// Usage: node scripts/rename-blue-picardy-spaniel-coat-docs.js

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccount = require(path.resolve(
  __dirname,
  '../temp/doggydex-f83a1-firebase-adminsdk-fbsvc-3e08ebc3fc.json'
));

initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();
const renames = [
  ['blue_picardy_spaniel__blue', 'blue_picardy_spaniel__black'],
  ['blue_picardy_spaniel__blue_black', 'blue_picardy_spaniel__blue_roan_black'],
  ['blue_picardy_spaniel__gray', 'blue_picardy_spaniel__blue_roan'],
];

async function renameCoatDocuments() {
  const coats = db.collection('coats');
  const sourceRefs = renames.map(([oldId]) => coats.doc(oldId));
  const destinationRefs = renames.map(([, newId]) => coats.doc(newId));

  await db.runTransaction(async (transaction) => {
    const snapshots = await transaction.getAll(...sourceRefs, ...destinationRefs);
    const sourceSnapshots = snapshots.slice(0, renames.length);
    const destinationSnapshots = snapshots.slice(renames.length);

    renames.forEach(([oldId, newId], index) => {
      if (!sourceSnapshots[index].exists) {
        throw new Error(`Source document '${oldId}' does not exist.`);
      }
      if (destinationSnapshots[index].exists) {
        throw new Error(`Destination document '${newId}' already exists.`);
      }
    });

    renames.forEach((_, index) => {
      transaction.set(destinationRefs[index], sourceSnapshots[index].data());
      transaction.delete(sourceRefs[index]);
    });
  });

  renames.forEach(([oldId, newId]) => console.log(`Renamed '${oldId}' to '${newId}'.`));
}

renameCoatDocuments().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
