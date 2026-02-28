import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { auth } from '@/lib/firebase-services';
import { loadUserProgress, saveUserProgress } from '@/lib/progress-store';
import { commonStyles } from '@/styles/common';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Google from 'expo-auth-session/providers/google';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import {
    GoogleAuthProvider,
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signInWithCredential,
    signInWithEmailAndPassword,
    signInWithPopup,
    signOut,
} from 'firebase/auth';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

const BREED_BADGES_KEY = 'breedBadges';

WebBrowser.maybeCompleteAuthSession();

const ALL_DOGS = [
  { id: 'labrador-yellow', breed: 'Labrador Retriever', coat: 'Yellow', uri: 'https://images.dog.ceo/breeds/labrador/n02099712_5640.jpg' },
  { id: 'labrador-black', breed: 'Labrador Retriever', coat: 'Black', uri: 'https://images.dog.ceo/breeds/labrador/n02099712_1978.jpg' },
  { id: 'pug-fawn', breed: 'Pug', coat: 'Fawn', uri: 'https://images.dog.ceo/breeds/pug/n02110958_15761.jpg' },
  { id: 'pug-black', breed: 'Pug', coat: 'Black', uri: 'https://images.dog.ceo/breeds/pug/n02110958_8270.jpg' },
  { id: 'germanshepherd-tan', breed: 'German Shepherd', coat: 'Tan & Black', uri: 'https://images.dog.ceo/breeds/germanshepherd/n02106662_5705.jpg' },
  { id: 'germanshepherd-sable', breed: 'German Shepherd', coat: 'Sable', uri: 'https://images.dog.ceo/breeds/germanshepherd/n02106662_2169.jpg' },
  { id: 'golden-light', breed: 'Golden Retriever', coat: 'Light Golden', uri: 'https://images.dog.ceo/breeds/retriever/golden/n02099601_3004.jpg' },
  { id: 'golden-dark', breed: 'Golden Retriever', coat: 'Dark Golden', uri: 'https://images.dog.ceo/breeds/retriever/golden/n02099601_5159.jpg' },
];

export default function DoggyDexScreen() {
  const [collection, setCollection] = useState([]);
  const [badges, setBadges] = useState([]);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [signInError, setSignInError] = useState(null);
  const [syncNotice, setSyncNotice] = useState(null);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAuthPending, setIsAuthPending] = useState(false);

  const [request, , promptAsync] = Google.useAuthRequest({
    webClientId: process.env.WEB_CLIENT_ID,
    iosClientId: process.env.IOS_CLIENT_ID,
    androidClientId: process.env.ANDROID_CLIENT_ID,
    expoClientId: process.env.EXPO_CLIENT_ID,
    selectAccount: true,
    extraParams: {
      prompt: 'select_account',
    },
  });

  const loadCollection = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem('dogCollection');
      const parsed = stored ? JSON.parse(stored) : [];
      const normalized = Array.isArray(parsed) ? parsed : [];
      setCollection(normalized);
      return normalized;
    } catch (e) {
      console.warn('Failed to load collection', e);
      setCollection([]);
      return [];
    }
  }, []);

  const loadBadges = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(BREED_BADGES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        const normalized = Array.isArray(parsed) ? parsed : [];
        setBadges(normalized);
        return normalized;
      }

      setBadges([]);
      return [];
    } catch (e) {
      console.warn('Failed to load breed badges', e);
      setBadges([]);
      return [];
    }
  }, []);

  const persistLocalProgress = useCallback(async (nextCollection, nextBadges) => {
    try {
      await AsyncStorage.setItem('dogCollection', JSON.stringify(nextCollection));
      await AsyncStorage.setItem(BREED_BADGES_KEY, JSON.stringify(nextBadges));
    } catch (e) {
      console.warn('Failed to persist local progress', e);
    }
  }, []);

  const loadRemoteProgress = useCallback(async (uid, localCollection = [], localBadges = []) => {
    if (!uid) {
      return;
    }

    try {
      const remoteProgress = await loadUserProgress(uid);

      if (remoteProgress && (remoteProgress.collection.length || remoteProgress.badges.length)) {
        setCollection(remoteProgress.collection);
        setBadges(remoteProgress.badges);
        setLastSyncedAt(remoteProgress.updatedAt ?? null);
        await persistLocalProgress(remoteProgress.collection, remoteProgress.badges);
        setSyncNotice(null);
        return;
      }

      if (localCollection.length || localBadges.length) {
        await saveUserProgress(uid, {
          collection: localCollection,
          badges: localBadges,
        });
        setLastSyncedAt(new Date());
      }

      setSyncNotice(null);
    } catch (e) {
      console.warn('Failed to sync cloud progress', e);
      setSyncNotice('Cloud sync is unavailable. Showing device-saved progress.');
    }
  }, [persistLocalProgress]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setIsSignedIn(Boolean(user));

      if (!user) {
        setCollection([]);
        setBadges([]);
        setLastSyncedAt(null);
        setCheckedAuth(true);
        return;
      }

      const localCollection = await loadCollection();
      const localBadges = await loadBadges();
      await loadRemoteProgress(user.uid, localCollection, localBadges);
      setCheckedAuth(true);
    });

    return unsubscribe;
  }, [loadBadges, loadCollection, loadRemoteProgress]);

  async function handleGoogleSignIn() {
    setSignInError(null);
    setIsAuthPending(true);

    try {
      if (Platform.OS === 'web') {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
        return;
      }

      const result = await promptAsync();

      if (!result || result.type !== 'success' || !result.authentication) {
        setSignInError('Sign-in was canceled. Please try again.');
        return;
      }

      const { idToken, accessToken } = result.authentication;

      if (!idToken && !accessToken) {
        setSignInError('Google sign-in token was not returned. Please try again.');
        return;
      }

      const credential = GoogleAuthProvider.credential(idToken ?? null, accessToken ?? null);
      await signInWithCredential(auth, credential);
    } catch (e) {
      console.warn('Failed to sign in with Google', e);
      setSignInError('Could not sign in with Google. Please try again.');
    } finally {
      setIsAuthPending(false);
    }
  }

  async function handleEmailSignIn() {
    setSignInError(null);
    const normalizedEmail = email.trim();

    if (!normalizedEmail || !password) {
      setSignInError('Enter both email and password.');
      return;
    }

    setIsAuthPending(true);

    try {
      await signInWithEmailAndPassword(auth, normalizedEmail, password);
    } catch (e) {
      console.warn('Failed email sign-in', e);
      setSignInError('Email sign-in failed. Check credentials and try again.');
    } finally {
      setIsAuthPending(false);
    }
  }

  async function handleCreateAccount() {
    setSignInError(null);
    const normalizedEmail = email.trim();

    if (!normalizedEmail || !password) {
      setSignInError('Enter both email and password.');
      return;
    }

    setIsAuthPending(true);

    try {
      await createUserWithEmailAndPassword(auth, normalizedEmail, password);
    } catch (e) {
      console.warn('Failed account creation', e);
      setSignInError('Could not create account. Use a valid email and 6+ char password.');
    } finally {
      setIsAuthPending(false);
    }
  }

  async function handleSignOut() {
    try {
      await signOut(auth);
    } catch (e) {
      console.warn('Failed to sign out', e);
    }
  }

  const collected = ALL_DOGS.filter((dog) => collection.includes(dog.id));
  const locked = ALL_DOGS.filter((dog) => !collection.includes(dog.id));
  const totalBreeds = new Set(ALL_DOGS.map((dog) => dog.breed)).size;
  const lastSyncedLabel = lastSyncedAt ? `Last synced: ${lastSyncedAt.toLocaleString()}` : null;

  if (!checkedAuth) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ThemedText style={styles.loadingText}>Checking sign-in...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (!isSignedIn) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.gateContainer}>
          <Image source={require('../img/coat_stat_icon.png')} style={styles.gateIcon} contentFit="contain" />
          <View style={styles.titleWrap}>
            <View style={styles.titleBalanceSpacer} />
            <ThemedText type="title" style={styles.titleText}>DoggyDex</ThemedText>
            <View style={styles.titlePawCluster}>
              <ThemedText style={styles.titlePawBg}>🐾</ThemedText>
            </View>
          </View>
          <ThemedText style={styles.gateText}>Sign in to view your DoggyDex.</ThemedText>

          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            style={styles.input}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            secureTextEntry
            style={styles.input}
          />

          <Pressable
            style={({ hovered, pressed }) => [
              commonStyles.playButton,
              styles.emailButton,
              (hovered || pressed) && styles.emailButtonHover,
              pressed && styles.buttonPressed,
            ]}
            disabled={isAuthPending}
            onPress={handleEmailSignIn}>
            <ThemedText type="subtitle" style={styles.buttonLabel}>Sign in with Email</ThemedText>
          </Pressable>

          <Pressable
            style={({ hovered, pressed }) => [
              commonStyles.playButton,
              styles.createAccountButton,
              (hovered || pressed) && styles.createAccountButtonHover,
              pressed && styles.buttonPressed,
            ]}
            disabled={isAuthPending}
            onPress={handleCreateAccount}>
            <ThemedText type="subtitle" style={styles.buttonLabel}>Create account</ThemedText>
          </Pressable>

          <Pressable
            style={({ hovered, pressed }) => [
              commonStyles.playButton,
              styles.signInButton,
              (hovered || pressed) && styles.signInButtonHover,
              pressed && styles.buttonPressed,
            ]}
            disabled={isAuthPending || (Platform.OS !== 'web' && !request)}
            onPress={handleGoogleSignIn}>
            <ThemedText type="subtitle" style={[styles.buttonLabel, styles.lightButtonText]}>
              Sign in with Google
            </ThemedText>
          </Pressable>

          {signInError ? <ThemedText style={styles.signInError}>{signInError}</ThemedText> : null}

          <Link href="/" asChild>
            <Pressable
              style={({ hovered, pressed }) => [
                styles.backLink,
                (hovered || pressed) && styles.backLinkHover,
              ]}>
              {({ hovered, pressed }) => (
                <ThemedText
                  style={[
                    styles.backLinkText,
                    (hovered || pressed) && styles.backLinkTextHover,
                  ]}>
                  ← Back to Home
                </ThemedText>
              )}
            </Pressable>
          </Link>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Image source={require('../img/coat_stat_icon.png')} style={styles.headerIcon} contentFit="contain" />
          <View style={styles.titleWrap}>
            <View style={styles.titleBalanceSpacer} />
            <ThemedText type="title" style={styles.titleText}>DoggyDex</ThemedText>
            <View style={styles.titlePawCluster}>
              <ThemedText style={styles.titlePawBg}>🐾</ThemedText>
            </View>
          </View>
        </View>
        <View style={styles.headerStats}>
          <ThemedText style={styles.countText}>
            {collected.length} / {ALL_DOGS.length} collected
          </ThemedText>
          <ThemedText style={styles.badgeCountText}>⭐ {badges.length} / {totalBreeds} breed badges</ThemedText>
          <Pressable onPress={handleSignOut} style={({ hovered, pressed }) => [(hovered || pressed) && styles.signOutLinkHover, pressed && styles.buttonPressed]}>
            <ThemedText style={styles.signOutLink}>Sign out</ThemedText>
          </Pressable>
        </View>
      </View>
      {lastSyncedLabel ? <ThemedText style={styles.syncMeta}>{lastSyncedLabel}</ThemedText> : null}
      {syncNotice ? <ThemedText style={styles.syncNotice}>{syncNotice}</ThemedText> : null}

      <ScrollView style={styles.scroll}>
        <ThemedText type="subtitle" style={styles.sectionTitle}>
          Collected ({collected.length})
        </ThemedText>
        <View style={styles.grid}>
          {collected.map((dog) => (
            <View key={dog.id} style={styles.card}>
              <Image source={{ uri: dog.uri }} style={styles.image} />
              <View style={styles.breedRow}>
                <ThemedText style={styles.breedText}>{dog.breed}</ThemedText>
                {badges.includes(dog.breed) ? <ThemedText style={styles.badgeIcon}>⭐</ThemedText> : null}
              </View>
              <ThemedText style={styles.coatText}>{dog.coat}</ThemedText>
            </View>
          ))}
        </View>

        {locked.length > 0 && (
          <>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Locked ({locked.length})
            </ThemedText>
            <View style={styles.grid}>
              {locked.map((dog) => (
                <View key={dog.id} style={[styles.card, styles.locked]}>
                  <View style={styles.lockedOverlay}>
                    <ThemedText style={styles.lockIcon}>🔒</ThemedText>
                  </View>
                  <ThemedText style={styles.breedText}>???</ThemedText>
                  <ThemedText style={styles.coatText}>???</ThemedText>
                </View>
              ))}
            </View>
          </>
        )}

        <Link href="/" asChild>
          <Pressable
            style={({ hovered, pressed }) => [
              styles.backLink,
              (hovered || pressed) && styles.backLinkHover,
            ]}>
            {({ hovered, pressed }) => (
              <ThemedText
                style={[
                  styles.backLinkText,
                  (hovered || pressed) && styles.backLinkTextHover,
                ]}>
                ← Back to Home
              </ThemedText>
            )}
          </Pressable>
        </Link>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7FBFF',
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  titleText: {
    lineHeight: 30,
    flexShrink: 1,
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
    marginLeft: 4,
  },
  titlePawBg: {
    fontSize: 36,
    opacity: 0.44,
    color: '#0A7EA4',
    lineHeight: 36,
    marginTop: -4,
    textShadowColor: 'rgba(10,126,164,0.22)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  headerStats: {
    alignItems: 'flex-end',
  },
  countText: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.9,
  },
  badgeCountText: {
    fontSize: 12,
    lineHeight: 16,
    color: '#8A6A00',
  },
  syncNotice: {
    fontSize: 12,
    lineHeight: 16,
    opacity: 0.8,
    marginBottom: 6,
  },
  syncMeta: {
    fontSize: 12,
    lineHeight: 16,
    opacity: 0.75,
    marginBottom: 2,
  },
  headerIcon: {
    width: 28,
    height: 28,
  },
  scroll: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 15,
    lineHeight: 22,
    marginTop: 12,
    marginBottom: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  card: {
    width: '48.3%',
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    paddingBottom: 8,
    backgroundColor: '#F7F9FC',
    borderWidth: 1,
    borderColor: '#687076',
  },
  image: {
    width: '100%',
    height: 132,
  },
  breedText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 6,
  },
  breedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    paddingHorizontal: 6,
    gap: 4,
  },
  badgeIcon: {
    fontSize: 12,
    lineHeight: 16,
  },
  coatText: {
    fontSize: 11,
    lineHeight: 16,
    opacity: 0.7,
    textAlign: 'center',
    paddingHorizontal: 6,
  },
  locked: {
    opacity: 0.45,
    position: 'relative',
  },
  lockedOverlay: {
    width: '100%',
    height: 132,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#333',
  },
  lockIcon: {
    fontSize: 40,
  },
  backLink: {
    marginTop: 14,
    marginBottom: 28,
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  backLinkHover: {
    backgroundColor: '#EAF6FB',
  },
  gateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
  },
  gateIcon: {
    width: 56,
    height: 56,
    marginBottom: 10,
  },
  gateText: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
    textAlign: 'center',
  },
  input: {
    width: '100%',
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#687076',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    lineHeight: 20,
  },
  signInButton: {
    marginTop: 14,
    width: '100%',
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#4285F4',
    paddingHorizontal: 14,
  },
  emailButton: {
    marginTop: 12,
    width: '100%',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: '#B8E1FF',
  },
  emailButtonHover: {
    backgroundColor: '#9BD3F7',
  },
  createAccountButton: {
    marginTop: 10,
    width: '100%',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: '#E8EEF4',
  },
  createAccountButtonHover: {
    backgroundColor: '#D8E0E8',
  },
  buttonPressed: {
    transform: [{ scale: 0.98 }],
  },
  signInButtonHover: {
    backgroundColor: '#2F74D9',
  },
  lightButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  buttonLabel: {
    fontWeight: '600',
    textAlign: 'center',
    width: '100%',
  },
  signInError: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
    textAlign: 'center',
  },
  backLinkText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: '#0A7EA4',
  },
  backLinkTextHover: {
    color: '#086283',
  },
  signOutLink: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: '#0A7EA4',
  },
  signOutLinkHover: {
    opacity: 0.7,
  },
});
