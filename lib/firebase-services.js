import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { getAuth, getReactNativePersistence, initializeAuth } from '@firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

import { firebaseApp } from './firebase';

let authInstance;

function getFirebaseAuth() {
	if (authInstance) {
		return authInstance;
	}

	if (Platform.OS === 'web') {
		authInstance = getAuth(firebaseApp);
		return authInstance;
	}

	try {
		authInstance = initializeAuth(firebaseApp, {
			persistence: getReactNativePersistence(AsyncStorage),
		});
	} catch {
		authInstance = getAuth(firebaseApp);
	}

	return authInstance;
}

export const auth = getFirebaseAuth();
export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);