import { doc, getDoc, runTransaction, serverTimestamp, setDoc } from 'firebase/firestore';

import { db } from './firebase-services';

const USERS_COLLECTION = 'users';
const USERNAMES_COLLECTION = 'usernames';
const META_COLLECTION = '_meta';
const USER_ID_COUNTER_DOC = 'user_id_counter';
export const USERNAME_TAKEN_ERROR_CODE = 'username/taken';

function normalizeUsername(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toUsernameKey(value) {
  return normalizeUsername(value).toLowerCase();
}

function buildUsernameTakenError(username) {
  const error = new Error(`Username "${username}" is already taken.`);
  error.code = USERNAME_TAKEN_ERROR_CODE;
  return error;
}

function isPermissionDeniedError(error) {
  const code = error?.code;
  return (
    code === 'permission-denied'
    || code === 'firestore/permission-denied'
    || code === 'unauthenticated'
    || code === 'firestore/unauthenticated'
  );
}

function toPositiveInteger(value) {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === 'string' && /^[0-9]+$/.test(value)) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
}

async function writeUserProfileWithRetry(user, userRef, payload) {
  try {
    await setDoc(userRef, payload, { merge: true });
    return;
  } catch (error) {
    if (!isPermissionDeniedError(error) || typeof user?.getIdToken !== 'function') {
      throw error;
    }
  }

  await user.getIdToken(true);
  await setDoc(userRef, payload, { merge: true });
}

export function hasUsername(value) {
  return normalizeUsername(value).length > 0;
}

export async function upsertUserProfile(user) {
  if (!user?.uid) {
    return;
  }

  const providerIds = Array.isArray(user.providerData)
    ? user.providerData
      .map((provider) => provider?.providerId)
      .filter(Boolean)
    : [];

  const userRef = doc(db, USERS_COLLECTION, user.uid);
  const counterRef = doc(db, META_COLLECTION, USER_ID_COUNTER_DOC);
  const normalizedDisplayName = normalizeUsername(user.displayName);

  let existingSnapshot = null;
  try {
    existingSnapshot = await getDoc(userRef);
  } catch {
    existingSnapshot = null;
  }

  const existingData = existingSnapshot?.exists() ? existingSnapshot.data() : null;
  const existingNumericId = toPositiveInteger(existingData?.id);
  const isExistingProfile = existingSnapshot?.exists() ?? false;

  const createdAtValue = isExistingProfile
    ? (existingData?.created_at ?? existingData?.createdAt ?? serverTimestamp())
    : serverTimestamp();

  const dateCreatedValue = isExistingProfile
    ? (existingData?.date_created ?? existingData?.created_at ?? existingData?.createdAt ?? serverTimestamp())
    : serverTimestamp();

  const profilePayload = {
    user_id: user.uid,
    uid: user.uid,
    email: user.email ?? null,
    photoURL: user.photoURL ?? null,
    emailVerified: Boolean(user.emailVerified),
    providers: providerIds,
    date_created: dateCreatedValue,
    created_at: createdAtValue,
    createdAt: createdAtValue,
    last_login: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (normalizedDisplayName) {
    profilePayload.displayName = normalizedDisplayName;
  }

  if (existingNumericId != null) {
    profilePayload.id = existingNumericId;
  }

  await writeUserProfileWithRetry(user, userRef, profilePayload);

  if (existingNumericId != null) {
    return;
  }

  const runUserIdAssignmentTransaction = async () => {
    await runTransaction(db, async (transaction) => {
      const userSnapshot = await transaction.get(userRef);
      const userData = userSnapshot.exists() ? userSnapshot.data() : null;
      const persistedUserId = toPositiveInteger(userData?.id);

      if (persistedUserId != null) {
        return;
      }

      const counterSnapshot = await transaction.get(counterRef);
      const currentCounter = toPositiveInteger(counterSnapshot.data()?.last_id) ?? 0;
      const nextUserId = currentCounter + 1;

      transaction.set(
        counterRef,
        {
          last_id: nextUserId,
          updated_at: serverTimestamp(),
        },
        { merge: true }
      );

      transaction.set(
        userRef,
        {
          id: nextUserId,
          last_login: serverTimestamp(),
          lastLoginAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });
  };

  try {
    await runUserIdAssignmentTransaction();
  } catch (error) {
    if (isPermissionDeniedError(error) && typeof user.getIdToken === 'function') {
      try {
        await user.getIdToken(true);
        await runUserIdAssignmentTransaction();
      } catch (retryError) {
        console.warn('Unable to assign sequential user id', retryError);
      }
      return;
    }

    console.warn('Unable to assign sequential user id', error);
  }
}

export async function getUserProfileUsername(uid) {
  if (!uid) {
    return null;
  }

  const ref = doc(db, USERS_COLLECTION, uid);
  const snapshot = await getDoc(ref);

  if (!snapshot.exists()) {
    return null;
  }

  const normalized = normalizeUsername(snapshot.data()?.username);

  if (!normalized) {
    return null;
  }

  const usernameKey = toUsernameKey(normalized);

  if (!usernameKey) {
    return null;
  }

  try {
    const usernameRef = doc(db, USERNAMES_COLLECTION, usernameKey);
    const usernameSnapshot = await getDoc(usernameRef);

    if (!usernameSnapshot.exists()) {
      return null;
    }

    const ownerUid = usernameSnapshot.data()?.uid;

    if (ownerUid !== uid) {
      return null;
    }

    return normalized;
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      return normalized;
    }

    throw error;
  }
}

export async function setUserProfileUsername(user, username) {
  if (!user?.uid) {
    throw new Error('Missing authenticated user.');
  }

  const normalizedUsername = normalizeUsername(username);
  const usernameKey = toUsernameKey(normalizedUsername);

  if (!normalizedUsername || !usernameKey) {
    throw new Error('Username is required.');
  }

  try {
    await upsertUserProfile(user);
  } catch (profileError) {
    console.warn('Failed to sync user profile before saving username', profileError);
  }

  const userRef = doc(db, USERS_COLLECTION, user.uid);
  const usernameRef = doc(db, USERNAMES_COLLECTION, usernameKey);

  const userPayload = {
    user_id: user.uid,
    uid: user.uid,
    email: user.email ?? null,
    username: normalizedUsername,
    username_key: usernameKey,
    displayName: normalizedUsername,
    updatedAt: serverTimestamp(),
    last_login: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
  };

  try {
    await runTransaction(db, async (transaction) => {
      const usernameSnapshot = await transaction.get(usernameRef);

      if (usernameSnapshot.exists()) {
        const ownerUid = usernameSnapshot.data()?.uid;
        if (ownerUid !== user.uid) {
          throw buildUsernameTakenError(normalizedUsername);
        }
      }

      const userSnapshot = await transaction.get(userRef);
      const existingUsername = normalizeUsername(userSnapshot.data()?.username);
      const existingUsernameKey = toUsernameKey(existingUsername);

      let previousUsernameRef = null;
      let previousUsernameSnapshot = null;

      if (existingUsernameKey && existingUsernameKey !== usernameKey) {
        previousUsernameRef = doc(db, USERNAMES_COLLECTION, existingUsernameKey);
        previousUsernameSnapshot = await transaction.get(previousUsernameRef);
      }

      if (
        previousUsernameRef
        && previousUsernameSnapshot?.exists()
        && previousUsernameSnapshot.data()?.uid === user.uid
      ) {
        transaction.delete(previousUsernameRef);
      }

      transaction.set(
        usernameRef,
        {
          uid: user.uid,
          username: normalizedUsername,
          username_key: usernameKey,
          updatedAt: serverTimestamp(),
          createdAt: usernameSnapshot.exists()
            ? usernameSnapshot.data()?.createdAt ?? serverTimestamp()
            : serverTimestamp(),
        },
        { merge: true }
      );

      transaction.set(
        userRef,
        userPayload,
        { merge: true }
      );
    });
  } catch (error) {
    if (!isPermissionDeniedError(error)) {
      throw error;
    }

    await setDoc(userRef, userPayload, { merge: true });
  }

  return normalizedUsername;
}
