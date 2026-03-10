import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { auth } from '@/lib/firebase-services';
import {
    getUserProfileUsername,
    hasUsername,
    setUserProfileUsername,
    upsertUserProfile,
    USERNAME_TAKEN_ERROR_CODE,
} from '@/lib/user-store';
import { commonStyles } from '@/styles/common';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { onAuthStateChanged, updateProfile } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

const PAW_FOCUS_COLOR = '#FF8C66';
const APP_FONT_FAMILY = Platform.select({
  web: '"Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  ios: 'System',
  android: 'sans-serif',
  default: undefined,
});

function normalizeUsername(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeUsernameInput(value) {
  return value.replace(/\s+/g, '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 24);
}

function getUsernameSaveErrorMessage(saveError) {
  const code = saveError?.code;
  const message = typeof saveError?.message === 'string' ? saveError.message.toLowerCase() : '';

  if (code === USERNAME_TAKEN_ERROR_CODE || message.includes('already taken')) {
    return 'That username is already taken. Try another one.';
  }

  if (
    code === 'permission-denied'
    || code === 'firestore/permission-denied'
    || code === 'unauthenticated'
    || message.includes('permission')
    || message.includes('insufficient')
  ) {
    return 'Could not save due to permissions. Please sign out and sign in again.';
  }

  if (
    code === 'unavailable'
    || code === 'deadline-exceeded'
    || message.includes('network')
    || message.includes('offline')
  ) {
    return 'Network issue while saving username. Please try again.';
  }

  return 'Could not save your username. Please try again.';
}

export default function UsernameSetupScreen() {
  const router = useRouter();

  const [checkedAuth, setCheckedAuth] = useState(false);
  const [username, setUsername] = useState('');
  const [focusedField, setFocusedField] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  useEffect(() => {
    let isActive = true;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!isActive) {
        return;
      }

      if (!firebaseUser) {
        router.replace('/doggydex');
        return;
      }

      try {
        await upsertUserProfile(firebaseUser);
      } catch (profileError) {
        console.warn('Failed to sync user profile', profileError);
      }

      try {
        const storedUsername = await getUserProfileUsername(firebaseUser.uid);

        if (hasUsername(storedUsername)) {
          router.replace('/');
          return;
        }
      } catch (usernameCheckError) {
        console.warn('Failed to check username requirement', usernameCheckError);
      }

      setCheckedAuth(true);
    });

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [router]);

  function handleUsernameChange(value) {
    setErrorMessage(null);
    setUsername(sanitizeUsernameInput(value));
  }

  async function handleSaveUsername() {
    setErrorMessage(null);

    const currentUser = auth.currentUser;

    if (!currentUser) {
      router.replace('/doggydex');
      return;
    }

    const normalizedUsername = normalizeUsername(username);

    if (!hasUsername(normalizedUsername)) {
      setErrorMessage('Enter a username to continue');
      return;
    }

    if (normalizedUsername.length < 3) {
      setErrorMessage('Username must be at least 3 characters long');
      return;
    }

    setIsSaving(true);

    try {
      const savedUsername = await setUserProfileUsername(currentUser, normalizedUsername);

      try {
        await updateProfile(currentUser, {
          displayName: savedUsername,
        });
      } catch (profileUpdateError) {
        console.warn('Failed to update Firebase auth display name', profileUpdateError);
      }

      router.replace('/');
    } catch (saveError) {
      console.warn('Failed to save username', saveError);
      setErrorMessage(getUsernameSaveErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  if (!checkedAuth) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ThemedText style={styles.loadingText}>Checking sign-in...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.gateContainer}>
        <View style={styles.titleWrap}>
          <View style={styles.titleBalanceSpacer} />
          <ThemedText type="title" style={styles.titleText}>DoggyDex</ThemedText>
          <View style={styles.titlePawCluster}>
            <Image source={require('../assets/images/paw-favicon.png')} style={styles.titlePawIcon} contentFit="contain" />
          </View>
        </View>

        <ThemedText style={styles.gateText}>Pick a username to complete your DoggyDex profile.</ThemedText>

        <TextInput
          value={username}
          onChangeText={handleUsernameChange}
          placeholder="Username"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isSaving}
          onFocus={() => setFocusedField('username')}
          onBlur={() => setFocusedField((prev) => (prev === 'username' ? null : prev))}
          style={[styles.input, focusedField === 'username' && styles.inputFocused]}
        />

        {errorMessage ? <ThemedText style={styles.errorText}>{errorMessage}</ThemedText> : null}

        <View style={styles.actions}>
          <Pressable
            style={({ hovered, pressed }) => [
              commonStyles.playButton,
              styles.actionButton,
              styles.primaryButton,
              (hovered || pressed) && styles.primaryButtonHover,
              pressed && styles.buttonPressed,
            ]}
            disabled={isSaving}
            onPress={handleSaveUsername}>
            <ThemedText type="subtitle" style={[styles.buttonLabel, styles.primaryButtonLabel]}>
              {isSaving ? 'Saving...' : 'Continue'}
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.85,
  },
  gateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
  },
  titleText: {
    lineHeight: 30,
    flexShrink: 1,
    color: '#FF9F1C',
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  titleBalanceSpacer: {
    width: 42,
  },
  titlePawCluster: {
    marginLeft: 2,
  },
  titlePawIcon: {
    width: 40,
    height: 40,
    marginTop: -2,
    transform: [{ translateY: -4 }],
  },
  gateText: {
    fontSize: 17,
    lineHeight: 24,
    marginTop: 16,
    marginBottom: 22,
    textAlign: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
    backgroundColor: 'rgba(255,255,255,0.18)',
    color: '#2F3742',
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 1,
    width: '100%',
    maxWidth: 340,
  },
  input: {
    fontFamily: APP_FONT_FAMILY,
    width: '100%',
    maxWidth: 340,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#687076',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    lineHeight: 22,
    ...(Platform.OS === 'web'
      ? {
          outlineStyle: 'none',
          outlineWidth: 0,
        }
      : null),
  },
  inputFocused: {
    borderColor: PAW_FOCUS_COLOR,
    ...(Platform.OS === 'web'
      ? {
          outlineStyle: 'solid',
          outlineWidth: 2,
          outlineColor: PAW_FOCUS_COLOR,
        }
      : null),
  },
  actions: {
    marginTop: 14,
    gap: 10,
    alignItems: 'stretch',
    width: '100%',
    maxWidth: 340,
  },
  actionButton: {
    width: '100%',
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  primaryButton: {
    backgroundColor: '#FF9F1C',
    borderWidth: 1,
    borderColor: '#E68A00',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 2,
  },
  primaryButtonHover: {
    backgroundColor: '#E58E19',
    borderColor: '#E68A00',
  },
  buttonPressed: {
    transform: [{ scale: 0.98 }],
  },
  buttonLabel: {
    fontWeight: '600',
    textAlign: 'center',
    width: '100%',
  },
  primaryButtonLabel: {
    color: '#FFFFFF',
    fontSize: Platform.select({ web: 18, default: 16 }),
    lineHeight: Platform.select({ web: 24, default: 22 }),
    letterSpacing: 0.75,
    fontWeight: '500',
  },
  errorText: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 12,
    width: '100%',
    maxWidth: 340,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FDA29B',
    backgroundColor: '#FEF3F2',
    color: '#B42318',
    fontWeight: '600',
    textAlign: 'center',
  },
});
