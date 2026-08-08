// Rename St. Bernard coat documents and fields to the saint_bernard prefix.
// Usage: node scripts/rename-st-bernard-coats-to-saint-bernard.js

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccount = require(path.resolve(__dirname, '../temp/doggydex-f83a1-firebase-adminsdk-fbsvc-3e08ebc3fc.json'));

initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();
const suffixes = ['brindle_white', 'brown_white', 'red_white'];

async function renameCoats() {
  const coatsRef = db.collection('coats');

  await db.runTransaction(async (transaction) => {
    const migrations = await Promise.all(suffixes.map(async (suffix) => {
      const oldId = `st_bernard__${suffix}`;
      const newId = `saint_bernard__${suffix}`;
      const oldRef = coatsRef.doc(oldId);
      const newRef = coatsRef.doc(newId);
      const [oldDoc, newDoc] = await Promise.all([
        transaction.get(oldRef),
        transaction.get(newRef),
      ]);

      if (!oldDoc.exists && !newDoc.exists) {
        throw new Error(`Neither ${oldId} nor ${newId} exists in Firestore.`);
      }

      return { suffix, oldId, newId, oldRef, newRef, oldDoc, newDoc };
    }));

    for (const migration of migrations) {
      const { suffix, newId, oldRef, newRef, oldDoc, newDoc } = migration;
      const sourceData = oldDoc.exists ? oldDoc.data() : newDoc.data();
      transaction.set(newRef, {
        ...sourceData,
        coat_name: newId,
        breed_id: 'saint_bernard',
        img_filename: `saint_bernard_${suffix}.jpg`,
        img_two_filename: `saint_bernard_${suffix}_two.jpg`,
        updated_at: FieldValue.serverTimestamp(),
      });

      if (oldDoc.exists) {
        transaction.delete(oldRef);
      }
    }
  });

  const results = [];
  for (const suffix of suffixes) {
    const oldId = `st_bernard__${suffix}`;
    const newId = `saint_bernard__${suffix}`;
    const [oldDoc, newDoc] = await Promise.all([
      coatsRef.doc(oldId).get(),
      coatsRef.doc(newId).get(),
    ]);
    results.push({
      oldId,
      oldDocumentExists: oldDoc.exists,
      newId,
      newDocumentExists: newDoc.exists,
      data: newDoc.data(),
    });
  }

  console.log(JSON.stringify(results, null, 2));
}

renameCoats().catch((error) => {
  console.error('Error renaming St. Bernard coats:', error);
  process.exit(1);
});
