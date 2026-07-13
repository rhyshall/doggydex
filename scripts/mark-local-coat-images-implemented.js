/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const root = path.resolve(__dirname, '..');
const imageDir = path.join(root, 'img');
const serviceAccount = require(path.join(root, 'temp', 'doggydex-f83a1-firebase-adminsdk-fbsvc-3e08ebc3fc.json'));
const shouldWrite = process.argv.includes('--write');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function run() {
  const localFiles = new Set(fs.readdirSync(imageDir));
  const snapshot = await db.collection('coats').get();
  const updates = [];

  for (const doc of snapshot.docs) {
    const data = doc.data() || {};
    const primary = typeof data.img_filename === 'string' ? data.img_filename.trim() : '';
    const secondary = typeof data.img_two_filename === 'string' ? data.img_two_filename.trim() : '';
    const patch = {};

    if (primary && localFiles.has(primary) && data.image_exists !== true) patch.image_exists = true;
    if (secondary && localFiles.has(secondary) && data.image_two_exists !== true) patch.image_two_exists = true;
    if (Object.keys(patch).length) updates.push({ ref: doc.ref, docId: doc.id, patch });
  }

  console.log(JSON.stringify({
    mode: shouldWrite ? 'write' : 'dry-run',
    localFiles: localFiles.size,
    firestoreCoats: snapshot.size,
    updates: updates.map(({ docId, patch }) => ({ docId, ...patch })),
  }, null, 2));

  if (!shouldWrite || updates.length === 0) return;
  for (let index = 0; index < updates.length; index += 450) {
    const batch = db.batch();
    for (const update of updates.slice(index, index + 450)) {
      batch.set(update.ref, { ...update.patch, updated_at: FieldValue.serverTimestamp() }, { merge: true });
    }
    await batch.commit();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
