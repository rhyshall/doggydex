import { DoggyDexHeader } from '@/components/doggydex-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { auth } from '@/lib/firebase-services';
import {
    getUserProfileUsername,
    hasUsername,
    isUsernameAvailable,
    setUserProfileUsername,
    upsertUserProfile,
    USERNAME_TAKEN_ERROR_CODE,
} from '@/lib/user-store';
import { commonStyles } from '@/styles/common';
import { useRouter } from 'expo-router';
import { onAuthStateChanged, updateProfile } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

const PAW_FOCUS_COLOR = '#FF8C66';
const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 20;
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
  return value.replace(/\s+/g, '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, USERNAME_MAX_LENGTH);
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
  const [usernameAvailability, setUsernameAvailability] = useState('idle');
  const [hasReachedMinLengthOnce, setHasReachedMinLengthOnce] = useState(false);

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
    const sanitizedUsername = sanitizeUsernameInput(value);

    setErrorMessage(null);
    setUsername(sanitizedUsername);

    if (!hasReachedMinLengthOnce && sanitizedUsername.length >= USERNAME_MIN_LENGTH) {
      setHasReachedMinLengthOnce(true);
    }
  }

  const normalizedUsername = normalizeUsername(username);
  const isValidUsername =
    hasUsername(normalizedUsername) && normalizedUsername.length >= USERNAME_MIN_LENGTH;

  useEffect(() => {
    if (!checkedAuth) {
      return undefined;
    }

    if (!isValidUsername) {
      setUsernameAvailability('idle');
      return undefined;
    }

    let isActive = true;

    const timeoutId = setTimeout(async () => {
      try {
        const available = await isUsernameAvailable(normalizedUsername, auth.currentUser?.uid ?? null);

        if (!isActive) {
          return;
        }

        if (available === true) {
          setUsernameAvailability('available');
          return;
        }

        if (available === false) {
          setUsernameAvailability('taken');
          return;
        }
      } catch (availabilityError) {
        if (!isActive) {
          return;
        }

        console.warn('Failed to check username availability', availabilityError);
      }
    }, 250);

    return () => {
      isActive = false;
      clearTimeout(timeoutId);
    };
  }, [checkedAuth, isValidUsername, normalizedUsername]);

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

    if (normalizedUsername.length < USERNAME_MIN_LENGTH) {
      setErrorMessage(`Username must be at least ${USERNAME_MIN_LENGTH} characters long`);
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

  const canContinue = !isSaving && isValidUsername && usernameAvailability === 'available';

  return (
    <ThemedView style={styles.container}>
      <View pointerEvents="none" style={styles.screenOverlay} />
      <View style={styles.gateContainer}>
        <DoggyDexHeader style={{ marginBottom: 0 }} />

        <ThemedText style={styles.gateText}>Create your username</ThemedText>
        <ThemedText style={styles.subtitleText}>This is how other players will see you.</ThemedText>

        <TextInput
          value={username}
          onChangeText={handleUsernameChange}
          placeholder="Username"
          placeholderTextColor="#7C8791"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isSaving}
          onFocus={() => setFocusedField('username')}
          onBlur={() => setFocusedField((prev) => (prev === 'username' ? null : prev))}
          style={[styles.input, focusedField === 'username' && styles.inputFocused]}
        />

        {!isValidUsername && hasReachedMinLengthOnce ? (
          <ThemedText style={[styles.usernameStatusText, styles.usernameStatusWarning]}>
            ⚠️ 3–20 characters
          </ThemedText>
        ) : null}

        {isValidUsername && usernameAvailability === 'available' ? (
          <ThemedText style={[styles.usernameStatusText, styles.usernameStatusAvailable]}>
            ✅ Username available
          </ThemedText>
        ) : null}

        {isValidUsername && usernameAvailability === 'taken' ? (
          <ThemedText style={[styles.usernameStatusText, styles.usernameStatusTaken]}>
            ❌ Username already taken
          </ThemedText>
        ) : null}

        {errorMessage ? <ThemedText style={styles.errorText}>{errorMessage}</ThemedText> : null}

        <View style={styles.actions}>
          <Pressable
            style={({ hovered, pressed }) => [
              commonStyles.playButton,
              styles.actionButton,
              styles.primaryButton,
              !canContinue && styles.primaryButtonDisabled,
              canContinue && (hovered || pressed) && styles.primaryButtonHover,
              canContinue && pressed && styles.buttonPressed,
            ]}
            disabled={!canContinue}
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
  screenOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  gateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    transform: [{ translateY: -60 }],
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
    fontFamily: APP_FONT_FAMILY,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
    letterSpacing: 0.25,
    marginTop: 28,
    marginBottom: 8,
    textAlign: 'center',
    color: '#F28A1E',
    textShadowColor: 'rgba(47,34,20,0.32)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    paddingHorizontal: 12,
    width: '100%',
    maxWidth: 340,
  },
  subtitleText: {
    fontFamily: APP_FONT_FAMILY,
    width: '100%',
    maxWidth: 340,
    marginBottom: 16,
    color: '#F8F2E8',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    letterSpacing: 0.15,
    textAlign: 'center',
    textShadowColor: 'rgba(43, 31, 18, 0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
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
    textShadowColor: 'rgba(28, 20, 12, 0.24)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1.5,
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
  usernameStatusText: {
    width: '100%',
    maxWidth: 340,
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    textAlign: 'left',
  },
  usernameStatusAvailable: {
    color: '#16C56D',
  },
  usernameStatusTaken: {
    color: '#FF6B6E',
  },
  usernameStatusWarning: {
    color: '#FF4D4F',
  },
  actions: {
    marginTop: 24,
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
    boxShadow: '0 2px 6px 0 #1E3A8A33',
    elevation: 2,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
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
