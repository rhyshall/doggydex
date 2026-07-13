/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const root = path.resolve(__dirname, '..');
const serviceAccount = require(path.join(root, 'temp', 'doggydex-f83a1-firebase-adminsdk-fbsvc-3e08ebc3fc.json'));
const localCatalog = require(path.join(root, 'data', 'dog-breeds.json'));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

function toId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function getBreedId(breed) {
  return toId(breed?.breed_id || breed?.breed_name || breed?.breed);
}

function getBreedName(breed) {
  return String(breed?.breed_name || breed?.breed || '').trim();
}

function getCoatDocId(breedId, coat) {
  if (typeof coat === 'string') return `${breedId}__${toId(coat)}`;
  const explicitName = String(coat?.coat_name || '').trim();
  if (explicitName) return explicitName;
  return `${breedId}__${toId(coat?.color_name || coat?.coat_color || coat?.name)}`;
}

function getColor(data) {
  if (typeof data === 'string') return data.trim();
  return String(data?.color_name || data?.coat_color || data?.coat || data?.name || '').trim();
}

function addMismatch(report, type, id, local, firestore) {
  report.fieldMismatches.push({ type, id, local, firestore });
}

async function audit() {
  const localBreeds = Array.isArray(localCatalog?.breeds) ? localCatalog.breeds : [];
  const [breedSnapshot, coatSnapshot] = await Promise.all([
    db.collection('breeds').get(),
    db.collection('coats').get(),
  ]);

  const firestoreBreeds = new Map(breedSnapshot.docs.map((doc) => {
    const data = doc.data() || {};
    return [toId(data.breed_id || doc.id), { docId: doc.id, ...data }];
  }));
  const firestoreCoats = new Map(coatSnapshot.docs.map((doc) => [doc.id, { docId: doc.id, ...doc.data() }]));
  const localBreedMap = new Map();
  const localCoatMap = new Map();
  const duplicateLocalBreedIds = [];
  const duplicateLocalCoatDocIds = [];
  const duplicateLocalCoatIds = [];
  const localCoatIdOwners = new Map();
  const invalidLocalCoatCounts = [];

  for (const breed of localBreeds) {
    const breedId = getBreedId(breed);
    if (localBreedMap.has(breedId)) duplicateLocalBreedIds.push(breedId);
    localBreedMap.set(breedId, breed);

    const coats = Array.isArray(breed?.coats) ? breed.coats : [];
    const declaredCount = Number(breed?.coat_count ?? breed?.coatCount);
    if (Number.isFinite(declaredCount) && declaredCount !== coats.length) {
      invalidLocalCoatCounts.push({ breedId, declared: declaredCount, actual: coats.length });
    }

    for (const coat of coats) {
      const docId = getCoatDocId(breedId, coat);
      if (localCoatMap.has(docId)) duplicateLocalCoatDocIds.push(docId);
      localCoatMap.set(docId, { breedId, breed, coat });

      if (coat?.coat_id != null) {
        const numericId = Number(coat.coat_id);
        if (localCoatIdOwners.has(numericId)) {
          duplicateLocalCoatIds.push({ coatId: numericId, docs: [localCoatIdOwners.get(numericId), docId] });
        } else {
          localCoatIdOwners.set(numericId, docId);
        }
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      localBreeds: localBreedMap.size,
      firestoreBreeds: firestoreBreeds.size,
      localCoats: localCoatMap.size,
      firestoreCoats: firestoreCoats.size,
    },
    localBreedsMissingInFirestore: [],
    firestoreBreedsMissingLocally: [],
    localCoatsMissingInFirestore: [],
    firestoreCoatsMissingLocally: [],
    fieldMismatches: [],
    duplicateLocalBreedIds,
    duplicateLocalCoatDocIds,
    duplicateLocalCoatIds,
    invalidLocalCoatCounts,
  };

  for (const [breedId, breed] of localBreedMap) {
    const remote = firestoreBreeds.get(breedId);
    if (!remote) {
      report.localBreedsMissingInFirestore.push(breedId);
      continue;
    }
    const localName = getBreedName(breed);
    const remoteName = String(remote.breed_name || remote.breed || '').trim();
    if (localName && remoteName && localName !== remoteName) {
      addMismatch(report, 'breed_name', breedId, localName, remoteName);
    }
  }

  for (const breedId of firestoreBreeds.keys()) {
    if (!localBreedMap.has(breedId)) report.firestoreBreedsMissingLocally.push(breedId);
  }

  for (const [docId, local] of localCoatMap) {
    const remote = firestoreCoats.get(docId);
    if (!remote) {
      report.localCoatsMissingInFirestore.push(docId);
      continue;
    }
    const localCoatBreedId = toId(local.coat?.breed_id || local.breedId);
    if (localCoatBreedId !== toId(remote.breed_id)) {
      addMismatch(report, 'coat_breed_id', docId, localCoatBreedId, remote.breed_id ?? null);
    }
    const localColor = getColor(local.coat);
    const remoteColor = getColor(remote);
    if (localColor && remoteColor && localColor !== remoteColor) {
      addMismatch(report, 'coat_color', docId, localColor, remoteColor);
    }
    if (local.coat?.coat_id != null && remote.coat_id != null && Number(local.coat.coat_id) !== Number(remote.coat_id)) {
      addMismatch(report, 'coat_id', docId, Number(local.coat.coat_id), Number(remote.coat_id));
    }
    for (const field of ['img_filename', 'img_two_filename', 'image_exists', 'image_two_exists']) {
      if (Object.prototype.hasOwnProperty.call(local.coat, field) && local.coat[field] !== remote[field]) {
        addMismatch(report, field, docId, local.coat[field], remote[field] ?? null);
      }
    }
  }

  for (const docId of firestoreCoats.keys()) {
    if (!localCoatMap.has(docId)) report.firestoreCoatsMissingLocally.push(docId);
  }

  for (const key of [
    'localBreedsMissingInFirestore',
    'firestoreBreedsMissingLocally',
    'localCoatsMissingInFirestore',
    'firestoreCoatsMissingLocally',
  ]) report[key].sort();
  report.fieldMismatches.sort((left, right) => left.id.localeCompare(right.id) || left.type.localeCompare(right.type));

  const reportPath = path.join(root, 'reports', 'catalog-audit.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(JSON.stringify({
    ...report.summary,
    localBreedsMissingInFirestore: report.localBreedsMissingInFirestore.length,
    firestoreBreedsMissingLocally: report.firestoreBreedsMissingLocally.length,
    localCoatsMissingInFirestore: report.localCoatsMissingInFirestore.length,
    firestoreCoatsMissingLocally: report.firestoreCoatsMissingLocally.length,
    fieldMismatches: report.fieldMismatches.length,
    duplicateLocalBreedIds: report.duplicateLocalBreedIds.length,
    duplicateLocalCoatDocIds: report.duplicateLocalCoatDocIds.length,
    duplicateLocalCoatIds: report.duplicateLocalCoatIds.length,
    invalidLocalCoatCounts: report.invalidLocalCoatCounts.length,
    reportPath,
  }, null, 2));
}

audit().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
