import { collection as firestoreCollection, getDocs, query, where } from 'firebase/firestore';
import { getDownloadURL, ref as storageRef } from 'firebase/storage';

import { db, storage } from './firebase-services';

function toSafeKey(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function toColorKey(value) {
  return String(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join('_');
}

export function indexVariantsByBreed(variants) {
  const variantsByBreed = {};

  for (const variant of variants || []) {
    const breed = typeof variant?.breed === 'string' ? variant.breed : '';
    if (!breed) {
      continue;
    }

    if (!variantsByBreed[breed]) {
      variantsByBreed[breed] = [];
    }

    variantsByBreed[breed].push(variant);
  }

  return variantsByBreed;
}

export async function mapVariantsWithStorageUris(variants, options = {}) {
  if (!Array.isArray(variants) || variants.length === 0) {
    return [];
  }

  const storagePathPrefix = typeof options.storagePathPrefix === 'string'
    ? options.storagePathPrefix.trim().replace(/^\/+/, '').replace(/\/+$/, '')
    : 'img';

  const variantsByBreed = indexVariantsByBreed(variants);
  const uriByVariantId = new Map();

  await Promise.all(
    Object.entries(variantsByBreed).map(async ([breed, breedVariants]) => {
      const variantsByColorKey = new Map();

      for (const variant of breedVariants) {
        const colorKey = toColorKey(variant?.coat || '');

        if (!colorKey || variantsByColorKey.has(colorKey)) {
          continue;
        }

        variantsByColorKey.set(colorKey, variant);
      }

      const breedId = toSafeKey(breed);
      if (!breedId) {
        return;
      }

      let coatsSnapshot = null;

      try {
        coatsSnapshot = await getDocs(
          query(firestoreCollection(db, 'coats'), where('breed_id', '==', breedId))
        );
      } catch {
        return;
      }

      await Promise.all(
        coatsSnapshot.docs.map(async (coatDoc) => {
          const data = coatDoc.data() || {};
          const colorName = typeof data.color_name === 'string' ? data.color_name.trim() : '';
          const imgFilename = typeof data.img_filename === 'string' ? data.img_filename.trim() : '';

          if (!colorName || !imgFilename) {
            return;
          }

          const matchedVariant = variantsByColorKey.get(toColorKey(colorName));
          if (!matchedVariant?.id) {
            return;
          }

          try {
            const objectPath = storagePathPrefix
              ? `${storagePathPrefix}/${imgFilename}`
              : imgFilename;
            const uri = await getDownloadURL(storageRef(storage, objectPath));
            uriByVariantId.set(matchedVariant.id, uri);
          } catch {
            // Keep original fallback URI when Storage URL retrieval fails.
          }
        })
      );
    })
  );

  return variants.map((variant) => {
    if (!variant || typeof variant !== 'object') {
      return variant;
    }

    const storageUri = uriByVariantId.get(variant.id);

    if (!storageUri) {
      return variant;
    }

    return {
      ...variant,
      uri: storageUri,
    };
  });
}
