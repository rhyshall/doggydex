import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';
import { Platform } from 'react-native';

import { firebaseApp } from './firebase';

let authInstance;

if (Platform.OS === 'web') {
	authInstance = getAuth(firebaseApp);
} else {
	try {
		authInstance = initializeAuth(firebaseApp, {
			persistence: getReactNativePersistence(AsyncStorage),
		});
	} catch {
		// Reuse the existing instance if auth was already initialized elsewhere.
		authInstance = getAuth(firebaseApp);
	}
}

export const auth = authInstance;
export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);
export const functions = getFunctions(firebaseApp);