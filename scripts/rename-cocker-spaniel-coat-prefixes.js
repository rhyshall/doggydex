// Canonicalize American and English Cocker Spaniel coat document prefixes.
// Usage: node scripts/rename-cocker-spaniel-coat-prefixes.js

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
const migrations = [
  { oldBreedId: 'cocker_spaniel_american', newBreedId: 'american_cocker_spaniel' },
  { oldBreedId: 'cocker_spaniel_english', newBreedId: 'english_cocker_spaniel' },
];

async function renameCoatDocuments() {
  await db.runTransaction(async (transaction) => {
    const sourceSnapshots = [];

    for (const { oldBreedId } of migrations) {
      const snapshot = await transaction.get(
        coatsRef.where('breed_id', '==', oldBreedId),
      );
      if (snapshot.empty) {
        throw new Error(`No source documents found for '${oldBreedId}'.`);
      }
      sourceSnapshots.push(snapshot);
    }

    const renames = migrations.flatMap(({ oldBreedId, newBreedId }, migrationIndex) => {
      const expectedPrefix = `${oldBreedId}__`;
      return sourceSnapshots[migrationIndex].docs.map((sourceDoc) => {
        if (!sourceDoc.id.startsWith(expectedPrefix)) {
          throw new Error(`Unexpected source document ID '${sourceDoc.id}'.`);
        }
        const suffix = sourceDoc.id.slice(expectedPrefix.length);
        const destinationId = `${newBreedId}__${suffix}`;
        return {
          sourceDoc,
          data: sourceDoc.data(),
          newBreedId,
          suffix,
          destinationId,
          destinationRef: coatsRef.doc(destinationId),
        };
      });
    });

    const destinationSnapshots = await transaction.getAll(
      ...renames.map(({ destinationRef }) => destinationRef),
    );
    destinationSnapshots.forEach((snapshot) => {
      if (snapshot.exists) {
        throw new Error(`Destination document '${snapshot.id}' already exists.`);
      }
    });

    renames.forEach(({
      sourceDoc,
      data,
      newBreedId,
      suffix,
      destinationId,
      destinationRef,
    }) => {
      transaction.set(destinationRef, {
        ...data,
        breed_id: newBreedId,
        coat_name: destinationId,
        img_filename: `${newBreedId}_${suffix}.jpg`,
        img_two_filename: `${newBreedId}_${suffix}_two.jpg`,
        updated_at: FieldValue.serverTimestamp(),
      });
      transaction.delete(sourceDoc.ref);
    });
  });

  for (const { oldBreedId, newBreedId } of migrations) {
    const [oldSnapshot, newSnapshot] = await Promise.all([
      coatsRef.where('breed_id', '==', oldBreedId).get(),
      coatsRef.where('breed_id', '==', newBreedId).get(),
    ]);
    console.log(`Remaining '${oldBreedId}' documents: ${oldSnapshot.size}`);
    console.log(`Created '${newBreedId}' documents: ${newSnapshot.size}`);
    newSnapshot.docs
      .map((doc) => ({ document_id: doc.id, ...doc.data() }))
      .sort((a, b) => a.coat_id - b.coat_id)
      .forEach((coat) => console.log({
        document_id: coat.document_id,
        coat_id: coat.coat_id,
        breed_id: coat.breed_id,
        coat_name: coat.coat_name,
        img_filename: coat.img_filename,
        img_two_filename: coat.img_two_filename,
      }));
  }
}

renameCoatDocuments().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
