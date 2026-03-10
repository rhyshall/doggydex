import { doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';

import { db } from './firebase-services';

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
  if (!matches || matches.length === 0) {
    return { min: null, max: null };
  }

  const values = matches.map((value) => Number(value)).filter((value) => Number.isFinite(value));
  if (values.length === 0) {
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
  if (normalized.includes('small') && normalized.includes('medium')) {
    return 'Medium';
  }
  if (normalized.includes('medium') && normalized.includes('large')) {
    return 'Large';
  }
  if (normalized.includes('giant')) {
    return 'Large';
  }
  if (normalized.includes('large')) {
    return 'Large';
  }
  if (normalized.includes('medium')) {
    return 'Medium';
  }
  if (normalized.includes('small') || normalized.includes('toy')) {
    return 'Small';
  }

  return null;
}

function toEnergyLevel(energyText) {
  if (!energyText || typeof energyText !== 'string') {
    return null;
  }

  const normalized = energyText.toLowerCase();
  if (normalized.includes('very high') || normalized.includes('high')) {
    return 'High';
  }
  if (normalized.includes('low')) {
    return 'Low';
  }
  if (normalized.includes('medium')) {
    return 'Medium';
  }

  return null;
}

export async function ensureBreedCatalogSeeded(dogBreedsData) {
  const metaRef = doc(db, META_COLLECTION, META_DOC_ID);
  const metaSnapshot = await getDoc(metaRef);

  if (metaSnapshot.exists()) {
    const data = metaSnapshot.data();
    if (data?.seeded === true) {
      return;
    }
  }

  const breeds = Array.isArray(dogBreedsData?.breeds) ? dogBreedsData.breeds : [];

  if (breeds.length === 0) {
    return;
  }

  const batch = writeBatch(db);

  breeds.forEach((breed) => {
    const breedName = breed?.breed;
    if (!breedName) {
      return;
    }

    const breedId = toSafeKey(breedName);
    const weight = parseRangeToMinMax(breed?.weightRange);
    const height = parseRangeToMinMax(breed?.heightRange);

    batch.set(
      doc(db, BREEDS_COLLECTION, breedId),
      {
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
        coat_count: Number.isFinite(breed?.coatCount) ? breed.coatCount : Array.isArray(breed?.coatColors) ? breed.coatColors.length : null,
        category_tags: Array.isArray(breed?.categoryTags) ? breed.categoryTags : [],
        thumbnail: breed?.thumbnail ?? null,
        updated_at: serverTimestamp(),
      },
      { merge: true }
    );

    const coatColors = Array.isArray(breed?.coatColors) ? breed.coatColors : [];
    coatColors.forEach((colorName) => {
      const colorId = toSafeKey(colorName);
      const coatId = `${breedId}__${colorId}`;

      batch.set(
        doc(db, COATS_COLLECTION, coatId),
        {
          coat_id: coatId,
          breed_id: breedId,
          color_name: colorName,
          img_filename: `${breedId}_${colorId}.jpg`,
          updated_at: serverTimestamp(),
        },
        { merge: true }
      );
    });
  });

  batch.set(
    metaRef,
    {
      seeded: true,
      seeded_at: serverTimestamp(),
      updated_at: serverTimestamp(),
      source: 'data/dog-breeds.json',
      breed_count: breeds.length,
    },
    { merge: true }
  );

  await batch.commit();
}
