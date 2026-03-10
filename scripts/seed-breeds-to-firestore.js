/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');

const admin = require('firebase-admin');

const BREEDS_COLLECTION = 'breeds';
const COATS_COLLECTION = 'coats';
const META_COLLECTION = '_meta';
const META_DOC_ID = 'breed_catalog';

function toSafeKey(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseRangeToMinMax(rangeText) {
  if (!rangeText || typeof rangeText !== 'string') {
    return { min: null, max: null };
  }

  const matches = rangeText.match(/[0-9]+(?:\.[0-9]+)?/g);
  if (!matches?.length) {
    return { min: null, max: null };
  }

  const values = matches
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  if (!values.length) {
    return { min: null, max: null };
  }

  return {
    min: values[0] ?? null,
    max: values.length > 1 ? values[1] : values[0],
  };
}

function toSizeCategory(sizeText) {
  if (!sizeText || typeof sizeText !== 'string') {
    return null;
  }

  const normalized = sizeText.toLowerCase();
  if (normalized.includes('small') && normalized.includes('medium')) return 'Medium';
  if (normalized.includes('medium') && normalized.includes('large')) return 'Large';
  if (normalized.includes('giant')) return 'Large';
  if (normalized.includes('large')) return 'Large';
  if (normalized.includes('medium')) return 'Medium';
  if (normalized.includes('small') || normalized.includes('toy')) return 'Small';
  return null;
}

function toEnergyLevel(energyText) {
  if (!energyText || typeof energyText !== 'string') {
    return null;
  }

  const normalized = energyText.toLowerCase();
  if (normalized.includes('very high') || normalized.includes('high')) return 'High';
  if (normalized.includes('low')) return 'Low';
  if (normalized.includes('medium')) return 'Medium';
  return null;
}

function getServiceAccount() {
  const inlineJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (inlineJson) {
    return JSON.parse(inlineJson);
  }

  const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!keyPath) {
    throw new Error(
      'Missing service account credentials. Set FIREBASE_SERVICE_ACCOUNT_KEY=<path-to-json> or FIREBASE_SERVICE_ACCOUNT_JSON=<json-string>.'
    );
  }

  const resolvedPath = path.isAbsolute(keyPath)
    ? keyPath
    : path.resolve(process.cwd(), keyPath);

  return JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
}

function chunk(array, size) {
  const out = [];
  for (let index = 0; index < array.length; index += size) {
    out.push(array.slice(index, index + size));
  }
  return out;
}

function toNumericCoatId(value) {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === 'string' && /^[0-9]+$/.test(value)) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
}

function toBreedCoatRows(breed, breedId) {
  const coatsFromObjects = Array.isArray(breed?.coats) ? breed.coats : [];

  const normalizedObjectRows = coatsFromObjects
    .map((coat) => {
      const colorName = typeof coat?.color_name === 'string' ? coat.color_name.trim() : '';
      if (!colorName) {
        return null;
      }

      const colorId = toSafeKey(colorName);
      const fallbackCoatName = `${breedId}__${colorId}`;
      const coatNameFromSource = typeof coat?.coat_name === 'string' ? coat.coat_name.trim() : '';

      return {
        coatName: coatNameFromSource || fallbackCoatName,
        colorName,
        requestedCoatId: toNumericCoatId(coat?.coat_id),
      };
    })
    .filter(Boolean);

  const rows = normalizedObjectRows.length
    ? normalizedObjectRows
    : (Array.isArray(breed?.coatColors) ? breed.coatColors : [])
      .map((colorNameRaw) => {
        const colorName = typeof colorNameRaw === 'string' ? colorNameRaw.trim() : '';
        if (!colorName) {
          return null;
        }

        const colorId = toSafeKey(colorName);
        return {
          coatName: `${breedId}__${colorId}`,
          colorName,
          requestedCoatId: null,
        };
      })
      .filter(Boolean);

  const dedupedRows = [];
  const seenCoatNames = new Set();

  for (const row of rows) {
    if (seenCoatNames.has(row.coatName)) {
      continue;
    }
    seenCoatNames.add(row.coatName);
    dedupedRows.push(row);
  }

  return dedupedRows;
}

function toDryRunSummary(breeds) {
  const validBreeds = breeds.filter((breed) => Boolean(breed?.breed));
  const coatsCount = validBreeds.reduce((sum, breed) => {
    const breedId = toSafeKey(breed.breed);
    const coatRows = toBreedCoatRows(breed, breedId);
    return sum + coatRows.length;
  }, 0);

  return {
    breedDocs: validBreeds.length,
    coatDocs: coatsCount,
    metaDocs: 1,
    totalWrites: validBreeds.length + coatsCount + 1,
    sampleBreeds: validBreeds.slice(0, 5).map((breed) => breed.breed),
  };
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');

  const sourcePath = path.resolve(process.cwd(), 'data', 'dog-breeds.json');
  const sourceData = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  const breeds = Array.isArray(sourceData?.breeds) ? sourceData.breeds : [];

  if (!breeds.length) {
    console.log('No breeds found in data/dog-breeds.json. Nothing to seed.');
    return;
  }

  if (isDryRun) {
    const summary = toDryRunSummary(breeds);
    console.log('Dry run only. No Firestore writes were made.');
    console.log(`Breeds docs: ${summary.breedDocs}`);
    console.log(`Coats docs: ${summary.coatDocs}`);
    console.log(`Meta docs: ${summary.metaDocs}`);
    console.log(`Total writes: ${summary.totalWrites}`);
    console.log(`Sample breeds: ${summary.sampleBreeds.join(', ')}`);
    return;
  }

  const serviceAccount = getServiceAccount();

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }

  const db = admin.firestore();

  // Keep numeric coat IDs stable across repeat seeding runs.
  const existingCoatIdsByDocId = new Map();
  const usedNumericCoatIds = new Set();
  let maxExistingNumericCoatId = 0;
  const existingCoatsSnapshot = await db.collection(COATS_COLLECTION).get();

  existingCoatsSnapshot.forEach((coatDoc) => {
    const numericCoatId = toNumericCoatId(coatDoc.data()?.coat_id);
    if (numericCoatId == null) {
      return;
    }

    existingCoatIdsByDocId.set(coatDoc.id, numericCoatId);
    usedNumericCoatIds.add(numericCoatId);
    if (numericCoatId > maxExistingNumericCoatId) {
      maxExistingNumericCoatId = numericCoatId;
    }
  });

  let nextNewCoatNumericId = maxExistingNumericCoatId + 1;
  let assignedNewCoatIds = 0;

  const writes = [];

  for (const breed of breeds) {
    const breedName = breed?.breed;
    if (!breedName) {
      continue;
    }

    const breedId = toSafeKey(breedName);
    const coatRows = toBreedCoatRows(breed, breedId);
    const weight = parseRangeToMinMax(breed?.weightRange);
    const height = parseRangeToMinMax(breed?.heightRange);

    writes.push({
      type: 'set',
      ref: db.collection(BREEDS_COLLECTION).doc(breedId),
      data: {
        breed_id: breedId,
        breed_name: breedName,
        size_category: toSizeCategory(breed?.size),
        weight_min_lbs: weight.min != null ? Math.round(weight.min) : null,
        weight_max_lbs: weight.max != null ? Math.round(weight.max) : null,
        height_min_inches: height.min != null ? Number(height.min) : null,
        height_max_inches: height.max != null ? Number(height.max) : null,
        energy_level: toEnergyLevel(breed?.energyLevel),
        trainability: Number.isFinite(breed?.trainability) ? breed.trainability : null,
        fun_fact: breed?.funFact ?? null,
        historical_purpose: breed?.historicalPurpose ?? null,
        origin_country: breed?.originCountry ?? null,
        popularity_rank: Number.isFinite(breed?.popularityRank) ? breed.popularityRank : null,
        coat_count: coatRows.length,
        category_tags: Array.isArray(breed?.categoryTags) ? breed.categoryTags : [],
        thumbnail: breed?.thumbnail ?? null,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      },
    });

    for (const coatRow of coatRows) {
      const colorName = coatRow.colorName;
      const colorId = toSafeKey(colorName);
      const coatName = coatRow.coatName;
      const existingNumericCoatId = existingCoatIdsByDocId.get(coatName) ?? null;

      let coatNumericId = existingNumericCoatId;
      if (coatNumericId == null) {
        const requestedCoatId = coatRow.requestedCoatId;

        if (requestedCoatId != null && !usedNumericCoatIds.has(requestedCoatId)) {
          coatNumericId = requestedCoatId;
        } else {
          while (usedNumericCoatIds.has(nextNewCoatNumericId)) {
            nextNewCoatNumericId += 1;
          }
          coatNumericId = nextNewCoatNumericId;
          nextNewCoatNumericId += 1;
        }
      }

      usedNumericCoatIds.add(coatNumericId);

      if (existingNumericCoatId == null) {
        assignedNewCoatIds += 1;
      }

      writes.push({
        type: 'set',
        ref: db.collection(COATS_COLLECTION).doc(coatName),
        data: {
          coat_id: coatNumericId,
          coat_name: coatName,
          breed_id: breedId,
          color_name: colorName,
          img_filename: `${breedId}_${colorId}.jpg`,
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
        },
      });
    }
  }

  writes.push({
    type: 'set',
    ref: db.collection(META_COLLECTION).doc(META_DOC_ID),
    data: {
      seeded: true,
      seeded_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      source: 'data/dog-breeds.json',
      breed_count: breeds.length,
    },
  });

  const batches = chunk(writes, 450);
  for (const operations of batches) {
    const batch = db.batch();
    for (const operation of operations) {
      if (operation.type === 'set') {
        batch.set(operation.ref, operation.data, { merge: true });
      }
    }
    await batch.commit();
  }

  console.log(
    `Seed complete. Upserted ${breeds.length} breeds and related coats. Assigned ${assignedNewCoatIds} new numeric coat IDs; preserved existing numeric IDs for matched coat docs.`
  );
}

main().catch((error) => {
  console.error('Failed to seed Firestore catalog:', error);
  process.exitCode = 1;
});
