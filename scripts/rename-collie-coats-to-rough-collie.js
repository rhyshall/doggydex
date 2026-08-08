// Rename Collie coat documents to Rough Collie in one atomic Firestore transaction.
// Usage: node scripts/rename-collie-coats-to-rough-collie.js

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccount = require(path.resolve(
  __dirname,
  '../temp/doggydex-f83a1-firebase-adminsdk-fbsvc-3e08ebc3fc.json'
));

initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();
const oldBreedId = 'collie';
const newBreedId = 'rough_collie';
const coatSuffixes = ['blue_merle', 'sable_white', 'tricolor', 'white'];

function replaceColliePrefix(value) {
  return typeof value === 'string'
    ? value.replace(/^collie(?=__|_)/, newBreedId)
    : value;
}

async function renameCollieCoats() {
  const coats = db.collection('coats');
  const renames = coatSuffixes.map((suffix) => ({
    oldId: `${oldBreedId}__${suffix}`,
    newId: `${newBreedId}__${suffix}`,
  }));
  const sourceRefs = renames.map(({ oldId }) => coats.doc(oldId));
  const destinationRefs = renames.map(({ newId }) => coats.doc(newId));

  await db.runTransaction(async (transaction) => {
    const snapshots = await transaction.getAll(...sourceRefs, ...destinationRefs);
    const sourceSnapshots = snapshots.slice(0, renames.length);
    const destinationSnapshots = snapshots.slice(renames.length);

    renames.forEach(({ oldId, newId }, index) => {
      if (!sourceSnapshots[index].exists) {
        throw new Error(`Source document '${oldId}' does not exist.`);
      }
      if (destinationSnapshots[index].exists) {
        throw new Error(`Destination document '${newId}' already exists.`);
      }
    });

    renames.forEach(({ newId }, index) => {
      const sourceData = sourceSnapshots[index].data();
      transaction.set(destinationRefs[index], {
        ...sourceData,
        breed_id: newBreedId,
        coat_name: newId,
        img_filename: replaceColliePrefix(sourceData.img_filename),
        img_two_filename: replaceColliePrefix(sourceData.img_two_filename),
      });
      transaction.delete(sourceRefs[index]);
    });
  });

  renames.forEach(({ oldId, newId }) => {
    console.log(`Renamed '${oldId}' to '${newId}'.`);
  });
}

async function verifyCollieCoats() {
  const coats = db.collection('coats');
  const oldRefs = coatSuffixes.map((suffix) => coats.doc(`${oldBreedId}__${suffix}`));
  const newRefs = coatSuffixes.map((suffix) => coats.doc(`${newBreedId}__${suffix}`));
  const snapshots = await db.getAll(...oldRefs, ...newRefs);
  const oldSnapshots = snapshots.slice(0, coatSuffixes.length);
  const newSnapshots = snapshots.slice(coatSuffixes.length);

  if (oldSnapshots.some((snapshot) => snapshot.exists)) {
    throw new Error('At least one old Collie coat document still exists.');
  }

  newSnapshots.forEach((snapshot, index) => {
    const expectedId = `${newBreedId}__${coatSuffixes[index]}`;
    const data = snapshot.data();
    if (!snapshot.exists || data.breed_id !== newBreedId || data.coat_name !== expectedId) {
      throw new Error(`Document '${expectedId}' is missing or has incorrect fields.`);
    }
  });

  console.log('Verified all four Rough Collie documents and fields; no old Collie IDs remain.');
}

const operation = process.argv.includes('--verify') ? verifyCollieCoats : renameCollieCoats;

operation().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
