// scripts/cleanup-usernames-index-only.js
// Normalizes usernames docs to index-only fields.
// Usage:
//   node scripts/cleanup-usernames-index-only.js
//   node scripts/cleanup-usernames-index-only.js --dry-run

const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');

initializeApp({
  credential: applicationDefault(),
});

const db = getFirestore();
const USERNAMES_COLLECTION = 'usernames';
const ALLOWED_FIELDS = new Set(['uid', 'username', 'username_key', 'createdAt', 'updatedAt']);
const DRY_RUN = process.argv.includes('--dry-run');

function normalizeUsername(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toUsernameKey(value) {
  return normalizeUsername(value).toLowerCase();
}

function buildIndexOnlyPayload(docId, data) {
  const uid = typeof data?.uid === 'string' ? data.uid : null;
  const username = normalizeUsername(data?.username);
  const resolvedUsername = username || docId;
  const usernameKey = toUsernameKey(resolvedUsername) || docId;

  if (!uid) {
    return { payload: null, reason: 'missing uid' };
  }

  if (!resolvedUsername) {
    return { payload: null, reason: 'missing username' };
  }

  if (!usernameKey) {
    return { payload: null, reason: 'missing username_key' };
  }

  const createdAt = data?.createdAt ?? FieldValue.serverTimestamp();

  return {
    payload: {
      uid,
      username: resolvedUsername,
      username_key: usernameKey,
      createdAt,
      updatedAt: FieldValue.serverTimestamp(),
    },
    reason: null,
  };
}

async function cleanupUsernamesCollection() {
  const snapshot = await db.collection(USERNAMES_COLLECTION).get();

  if (snapshot.empty) {
    console.log('No usernames documents found.');
    return;
  }

  let normalizedCount = 0;
  let skippedCount = 0;

  let batch = db.batch();
  let batchOps = 0;

  for (const usernameDoc of snapshot.docs) {
    const data = usernameDoc.data() || {};
    const docId = usernameDoc.id;

    const { payload, reason } = buildIndexOnlyPayload(docId, data);

    if (!payload) {
      skippedCount += 1;
      console.log(`Skipping ${docId}: ${reason}`);
      continue;
    }

    const hasUnexpectedFields = Object.keys(data).some((key) => !ALLOWED_FIELDS.has(key));
    const usernameChanged = payload.username !== data.username;
    const usernameKeyChanged = payload.username_key !== data.username_key;

    if (!hasUnexpectedFields && !usernameChanged && !usernameKeyChanged) {
      continue;
    }

    normalizedCount += 1;

    if (DRY_RUN) {
      console.log(`Would normalize ${docId}`);
      continue;
    }

    batch.set(usernameDoc.ref, payload);
    batchOps += 1;

    if (batchOps >= 400) {
      await batch.commit();
      batch = db.batch();
      batchOps = 0;
    }
  }

  if (!DRY_RUN && batchOps > 0) {
    await batch.commit();
  }

  if (DRY_RUN) {
    console.log(`Dry run complete. Would normalize ${normalizedCount} document(s). Skipped ${skippedCount} document(s).`);
    return;
  }

  console.log(`Normalized ${normalizedCount} document(s). Skipped ${skippedCount} document(s).`);
}

cleanupUsernamesCollection().catch((error) => {
  console.error('Error cleaning usernames collection:', error);
  process.exit(1);
});
