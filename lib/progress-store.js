import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    serverTimestamp,
    setDoc,
    where,
    writeBatch,
} from 'firebase/firestore';

import { db } from './firebase-services';

const COLLECTION_NAME = 'userProgress';
const USER_COATS_COLLECTION = 'user_coats';
const USER_BADGES_COLLECTION = 'user_breed_badges';

function toSafeKey(value) {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function toBreedId(breedName) {
  return toSafeKey(breedName);
}

export function getUserDocId(userRef) {
  if (!userRef) {
    return null;
  }

  const sourceId = typeof userRef === 'string'
    ? userRef
    : (userRef.uid || userRef.id || userRef.email);

  if (!sourceId || typeof sourceId !== 'string') {
    return null;
  }

  const normalizedSourceId = sourceId.trim();

  if (!normalizedSourceId) {
    return null;
  }

  return normalizedSourceId.replace(/\//g, '_');
}

export async function loadUserProgress(userRef) {
  const docId = getUserDocId(userRef);

  if (!docId) {
    return null;
  }

  try {
    const coatsSnapshot = await getDocs(
      query(collection(db, USER_COATS_COLLECTION), where('user_id', '==', docId))
    );
    const badgesSnapshot = await getDocs(
      query(collection(db, USER_BADGES_COLLECTION), where('user_id', '==', docId))
    );

    const collectionFromRows = [];
    coatsSnapshot.forEach((coatDoc) => {
      const data = coatDoc.data();
      const dogId = data?.dog_id || data?.coat_id || null;
      if (dogId) {
        collectionFromRows.push(dogId);
      }
    });

    const badgesFromRows = [];
    badgesSnapshot.forEach((badgeDoc) => {
      const data = badgeDoc.data();
      const breedName = data?.breed_name || null;
      if (breedName) {
        badgesFromRows.push(breedName);
      }
    });

    if (collectionFromRows.length || badgesFromRows.length) {
      return {
        collection: [...new Set(collectionFromRows)],
        badges: [...new Set(badgesFromRows)],
        updatedAt: null,
      };
    }
  } catch (e) {
    console.warn('Failed to load relational progress rows', e);
  }

  const ref = doc(db, COLLECTION_NAME, docId);
  const snapshot = await getDoc(ref);

  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data();
  const updatedAt = data.updatedAt && typeof data.updatedAt.toDate === 'function'
    ? data.updatedAt.toDate()
    : null;

  return {
    collection: Array.isArray(data.collection) ? data.collection : [],
    badges: Array.isArray(data.badges) ? data.badges : [],
    updatedAt,
  };
}

export async function saveUserProgress(userRef, progress) {
  const docId = getUserDocId(userRef);

  if (!docId) {
    return;
  }

  const normalizedCollection = Array.isArray(progress.collection)
    ? [...new Set(progress.collection.filter((item) => typeof item === 'string' && item.trim().length > 0))]
    : [];
  const normalizedBadges = Array.isArray(progress.badges)
    ? [...new Set(progress.badges.filter((item) => typeof item === 'string' && item.trim().length > 0))]
    : [];

  try {
    const coatsRef = collection(db, USER_COATS_COLLECTION);
    const existingCoatsSnapshot = await getDocs(query(coatsRef, where('user_id', '==', docId)));
    const existingCoatDocsByDogId = new Map();
    existingCoatsSnapshot.forEach((coatDoc) => {
      const data = coatDoc.data();
      const dogId = data?.dog_id || data?.coat_id;
      if (dogId) {
        existingCoatDocsByDogId.set(dogId, coatDoc.id);
      }
    });

    const coatsBatch = writeBatch(db);

    normalizedCollection.forEach((dogId) => {
      if (existingCoatDocsByDogId.has(dogId)) {
        return;
      }

      const docKey = `${docId}__${toSafeKey(dogId)}`;
      coatsBatch.set(doc(db, USER_COATS_COLLECTION, docKey), {
        user_id: docId,
        coat_id: dogId,
        dog_id: dogId,
        unlocked_at: serverTimestamp(),
      });
    });

    existingCoatDocsByDogId.forEach((coatDocId, dogId) => {
      if (!normalizedCollection.includes(dogId)) {
        coatsBatch.delete(doc(db, USER_COATS_COLLECTION, coatDocId));
      }
    });

    await coatsBatch.commit();

    const badgesRef = collection(db, USER_BADGES_COLLECTION);
    const existingBadgesSnapshot = await getDocs(query(badgesRef, where('user_id', '==', docId)));
    const existingBadgeDocsByBreed = new Map();
    existingBadgesSnapshot.forEach((badgeDoc) => {
      const data = badgeDoc.data();
      const breedName = data?.breed_name;
      if (breedName) {
        existingBadgeDocsByBreed.set(breedName, badgeDoc.id);
      }
    });

    const badgesBatch = writeBatch(db);

    normalizedBadges.forEach((breedName) => {
      if (existingBadgeDocsByBreed.has(breedName)) {
        return;
      }

      const breedId = toBreedId(breedName);
      const docKey = `${docId}__${breedId}`;
      badgesBatch.set(doc(db, USER_BADGES_COLLECTION, docKey), {
        user_id: docId,
        breed_id: breedId,
        breed_name: breedName,
        earned_at: serverTimestamp(),
      });
    });

    existingBadgeDocsByBreed.forEach((badgeDocId, breedName) => {
      if (!normalizedBadges.includes(breedName)) {
        badgesBatch.delete(doc(db, USER_BADGES_COLLECTION, badgeDocId));
      }
    });

    await badgesBatch.commit();
  } catch (relationalWriteError) {
    console.warn('Failed to sync relational progress rows', relationalWriteError);
  }

  const ref = doc(db, COLLECTION_NAME, docId);

  await setDoc(
    ref,
    {
      collection: normalizedCollection,
      badges: normalizedBadges,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}