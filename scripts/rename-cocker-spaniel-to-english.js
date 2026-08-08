// Rename cocker_spaniel coat documents to cocker_spaniel_english in Firestore.
// Usage: node scripts/rename-cocker-spaniel-to-english.js

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
const oldBreedId = 'cocker_spaniel';
const newBreedId = 'cocker_spaniel_english';

async function renameCoatDocuments() {
  await db.runTransaction(async (transaction) => {
    const sourceSnapshot = await transaction.get(
      coatsRef.where('breed_id', '==', oldBreedId),
    );

    if (sourceSnapshot.empty) {
      throw new Error(`No coat documents found for breed_id '${oldBreedId}'.`);
    }

    const renames = sourceSnapshot.docs.map((sourceDoc) => {
      const data = sourceDoc.data();
      const expectedPrefix = `${oldBreedId}__`;

      if (!sourceDoc.id.startsWith(expectedPrefix)) {
        throw new Error(`Unexpected source document ID '${sourceDoc.id}'.`);
      }

      const suffix = sourceDoc.id.slice(expectedPrefix.length);
      const newDocumentId = `${newBreedId}__${suffix}`;
      return {
        sourceDoc,
        data,
        destinationRef: coatsRef.doc(newDocumentId),
        newDocumentId,
        suffix,
      };
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
      destinationRef,
      newDocumentId,
      suffix,
    }) => {
      transaction.set(destinationRef, {
        ...data,
        breed_id: newBreedId,
        coat_name: newDocumentId,
        img_filename: `${newBreedId}_${suffix}.jpg`,
        img_two_filename: `${newBreedId}_${suffix}_two.jpg`,
        updated_at: FieldValue.serverTimestamp(),
      });
      transaction.delete(sourceDoc.ref);
    });
  });

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

renameCoatDocuments().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
