// Run this script with: node fix-user-id.js
// Make sure you are authenticated with Firebase Auth in your environment.

const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, setDoc } = require('firebase/firestore');
const { getAuth } = require('firebase/auth');

// TODO: Replace with your Firebase config
const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_AUTH_DOMAIN',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_STORAGE_BUCKET',
  messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',
  appId: 'YOUR_APP_ID',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

async function ensureUserIdField() {
  const user = auth.currentUser;
  if (!user) {
    console.error('No authenticated user. Please log in first.');
    return;
  }
  const userRef = doc(db, 'users', user.uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    console.error('User document does not exist.');
    return;
  }
  const data = snap.data();
  if (typeof data.id === 'number') {
    console.log('User id field is present and numeric:', data.id);
    return;
  }
  // If user_id exists, use it; otherwise, generate a new one (not recommended for prod)
  const newId = typeof data.user_id === 'number' ? data.user_id : Math.floor(Math.random() * 1000000);
  await setDoc(userRef, { id: newId }, { merge: true });
  console.log('User id field set to:', newId);
}

ensureUserIdField();
