/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const root = path.resolve(__dirname, '..');
const catalogPath = path.join(root, 'data', 'dog-breeds.json');
const serviceAccount = require(path.join(root, 'temp', 'doggydex-f83a1-firebase-adminsdk-fbsvc-3e08ebc3fc.json'));
const shouldWrite = process.argv.includes('--write');

const BREED_ID_ALIASES = Object.freeze({
  english_bulldog: ['bulldog'],
});

const COAT_BREED_ID_ALIASES = Object.freeze({
  american_cocker_spaniel: 'cocker_spaniel',
  rough_collie: 'collie',
});

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

function getLocalBreedId(breed) {
  return toId(breed?.breed_id || breed?.breed_name || breed?.breed);
}

function getColor(data, fallbackId) {
  const explicit = [data?.color_name, data?.coat_color, data?.coat]
    .find((value) => typeof value === 'string' && value.trim());
  if (explicit) return explicit.trim();
  return String(fallbackId || '')
    .split('__').pop()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function findLocalBreed(localById, breedId) {
  if (localById.has(breedId)) return localById.get(breedId);
  for (const alias of BREED_ID_ALIASES[breedId] || []) {
    if (localById.has(alias)) return localById.get(alias);
  }
  return null;
}

function formatRange(minimum, maximum, unit) {
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) return undefined;
  return `${minimum}-${maximum} ${unit}`;
}

function getRemoteBreedDefaults(data) {
  return {
    size: data.size_category,
    weightRange: formatRange(data.weight_min_lbs, data.weight_max_lbs, 'lbs'),
    heightRange: formatRange(data.height_min_inches, data.height_max_inches, 'inches'),
    energyLevel: data.energy_level,
    trainability: data.trainability,
    funFact: data.fun_fact,
    historicalPurpose: data.historical_purpose,
    originCountry: data.origin_country,
    popularityRank: data.popularity_rank,
    categoryTags: data.category_tags,
    thumbnail: data.thumbnail,
  };
}

async function sync() {
  const localCatalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const localBreeds = Array.isArray(localCatalog?.breeds) ? localCatalog.breeds : [];
  const localById = new Map(localBreeds.map((breed) => [getLocalBreedId(breed), breed]));
  const localOrder = new Map(localBreeds.map((breed, index) => [getLocalBreedId(breed), index]));

  const [breedSnapshot, coatSnapshot] = await Promise.all([
    db.collection('breeds').get(),
    db.collection('coats').get(),
  ]);

  const remoteBreeds = breedSnapshot.docs.map((doc) => {
    const data = doc.data() || {};
    return { docId: doc.id, breedId: toId(data.breed_id || doc.id), data };
  });
  const remoteBreedIds = new Set(remoteBreeds.map(({ breedId }) => breedId));
  const coatsByBreed = new Map();
  for (const doc of coatSnapshot.docs) {
    const data = doc.data() || {};
    const storedBreedId = toId(data.breed_id);
    const aliasedBreedId = COAT_BREED_ID_ALIASES[storedBreedId];
    const inferredBreedId = [...remoteBreedIds]
      .filter((breedId) => doc.id.startsWith(`${breedId}__`))
      .sort((left, right) => right.length - left.length)[0];
    const catalogBreedId = remoteBreedIds.has(storedBreedId)
      ? storedBreedId
      : (remoteBreedIds.has(aliasedBreedId) ? aliasedBreedId : inferredBreedId);
    if (!catalogBreedId) continue;
    if (!coatsByBreed.has(catalogBreedId)) coatsByBreed.set(catalogBreedId, []);
    coatsByBreed.get(catalogBreedId).push({ docId: doc.id, data });
  }
  const orphanRemoteCoats = coatSnapshot.docs
    .map((doc) => ({ docId: doc.id, breedId: toId(doc.data()?.breed_id) }))
    .filter(({ breedId }) => !breedId || (
      !remoteBreedIds.has(breedId)
      && !remoteBreedIds.has(COAT_BREED_ID_ALIASES[breedId])
    ));

  remoteBreeds.sort((left, right) => {
    const leftLocalId = localById.has(left.breedId)
      ? left.breedId
      : (BREED_ID_ALIASES[left.breedId] || []).find((alias) => localById.has(alias));
    const rightLocalId = localById.has(right.breedId)
      ? right.breedId
      : (BREED_ID_ALIASES[right.breedId] || []).find((alias) => localById.has(alias));
    return (localOrder.get(leftLocalId) ?? Number.MAX_SAFE_INTEGER)
      - (localOrder.get(rightLocalId) ?? Number.MAX_SAFE_INTEGER)
      || left.breedId.localeCompare(right.breedId);
  });

  const outputBreeds = remoteBreeds.map(({ breedId, data }) => {
    const local = findLocalBreed(localById, breedId) || {};
    const remoteDefaults = getRemoteBreedDefaults(data);
    const breedName = String(data.breed_name || data.breed || local.breed_name || local.breed || breedId).trim();
    const remoteCoats = [...(coatsByBreed.get(breedId) || [])]
      .sort((left, right) => (Number(left.data.coat_id) || Number.MAX_SAFE_INTEGER)
        - (Number(right.data.coat_id) || Number.MAX_SAFE_INTEGER)
        || left.docId.localeCompare(right.docId));

    const coats = remoteCoats.map(({ docId, data: coat }) => {
      const outputCoat = {
        coat_id: coat.coat_id,
        coat_name: docId,
        color_name: getColor(coat, docId),
        breed_id: toId(coat.breed_id) || breedId,
      };
      for (const field of ['img_filename', 'img_two_filename', 'image_exists', 'image_two_exists']) {
        if (Object.prototype.hasOwnProperty.call(coat, field)) outputCoat[field] = coat[field];
      }
      return outputCoat;
    });

    const output = {
      ...Object.fromEntries(Object.entries(remoteDefaults).filter(([, value]) => value !== undefined)),
      ...local,
      breed_id: breedId,
      breed_name: breedName,
      coatColors: coats.map((coat) => coat.color_name),
      coatCount: coats.length,
      coats,
    };

    if (Object.prototype.hasOwnProperty.call(local, 'breed')) output.breed = breedName;
    delete output.coat_count;
    return output;
  });

  const output = { breeds: outputBreeds };
  const summary = {
    mode: shouldWrite ? 'write' : 'dry-run',
    beforeBreeds: localBreeds.length,
    afterBreeds: outputBreeds.length,
    beforeCoats: localBreeds.reduce((sum, breed) => sum + (Array.isArray(breed.coats) ? breed.coats.length : 0), 0),
    afterCoats: outputBreeds.reduce((sum, breed) => sum + breed.coats.length, 0),
    removedLocalOnlyBreeds: [...localById.keys()].filter((localId) => (
      !remoteBreeds.some(({ breedId }) => breedId === localId || (BREED_ID_ALIASES[breedId] || []).includes(localId))
    )),
    orphanRemoteCoats,
  };

  if (shouldWrite) fs.writeFileSync(catalogPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(summary, null, 2));
}

sync().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
