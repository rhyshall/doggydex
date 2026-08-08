// Verify every Firestore coat with image_exists=true has its primary image locally.
// Usage: node scripts/verify-implemented-coat-images.js

const fs = require('node:fs');
const path = require('node:path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const root = path.resolve(__dirname, '..');
const imageDirectory = path.join(root, 'img');
const serviceAccount = require(path.join(
  root,
  'temp',
  'doggydex-f83a1-firebase-adminsdk-fbsvc-3e08ebc3fc.json',
));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function verify() {
  const localFiles = fs.readdirSync(imageDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
  const exactNames = new Set(localFiles);
  const namesByLowercase = new Map();

  localFiles.forEach((filename) => {
    const key = filename.toLowerCase();
    const matches = namesByLowercase.get(key) || [];
    matches.push(filename);
    namesByLowercase.set(key, matches);
  });

  const snapshot = await db.collection('coats').where('image_exists', '==', true).get();
  const invalidFilenames = [];
  const missingFiles = [];
  const caseMismatches = [];
  let verified = 0;

  snapshot.forEach((doc) => {
    const filename = doc.data().img_filename;
    if (typeof filename !== 'string' || !filename.trim() || path.basename(filename) !== filename) {
      invalidFilenames.push({ document_id: doc.id, img_filename: filename ?? null });
      return;
    }

    if (exactNames.has(filename)) {
      verified += 1;
      return;
    }

    const caseInsensitiveMatches = namesByLowercase.get(filename.toLowerCase());
    if (caseInsensitiveMatches) {
      caseMismatches.push({
        document_id: doc.id,
        img_filename: filename,
        local_filenames: caseInsensitiveMatches,
      });
      return;
    }

    missingFiles.push({ document_id: doc.id, img_filename: filename });
  });

  console.log(JSON.stringify({
    implemented_coats: snapshot.size,
    exact_local_matches: verified,
    missing_files: missingFiles,
    invalid_filenames: invalidFilenames,
    case_mismatches: caseMismatches,
  }, null, 2));

  if (missingFiles.length || invalidFilenames.length || caseMismatches.length) {
    process.exitCode = 2;
  }
}

verify().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
