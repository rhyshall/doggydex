import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

import { db } from './firebase-services';

const COLLECTION_NAME = 'userProgress';

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

  return sourceId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export async function loadUserProgress(userRef) {
  const docId = getUserDocId(userRef);

  if (!docId) {
    return null;
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

  const ref = doc(db, COLLECTION_NAME, docId);

  await setDoc(
    ref,
    {
      collection: Array.isArray(progress.collection) ? progress.collection : [],
      badges: Array.isArray(progress.badges) ? progress.badges : [],
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}