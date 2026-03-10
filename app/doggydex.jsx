import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { auth } from '@/lib/firebase-services';
import { loadUserProgress, saveUserProgress } from '@/lib/progress-store';
import { mapVariantsWithStorageUris, toColorKey } from '@/lib/storage-coat-variants';
import { getUserProfileUsername, hasUsername, upsertUserProfile } from '@/lib/user-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { Link, useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import dogBreedsData from '../data/dog-breeds.json';

const BREED_BADGES_KEY = 'breedBadges';
const PAW_FOCUS_COLOR = '#FF8C66';
const APP_FONT_FAMILY = Platform.select({
  web: '"Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  ios: 'System',
  android: 'sans-serif',
  default: undefined,
});

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

const BREED_SECTIONS = dogBreedsData.breeds.map((breedData) => ({
  breed: breedData.breed,
  coats: Array.isArray(breedData.coatColors) && breedData.coatColors.length
    ? breedData.coatColors
    : Array.from({ length: Math.max(0, breedData.coatCount ?? 0) }, (_, index) => `Coat ${index + 1}`),
}));

const TOTAL_COATS = BREED_SECTIONS.reduce(
  (sum, section) => sum + section.coats.length,
  0
);

export default function DoggyDexScreen() {
  const router = useRouter();
  const [collection, setCollection] = useState([]);
  const [badges, setBadges] = useState([]);
  const [displayDogs, setDisplayDogs] = useState(ALL_DOGS);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [syncNotice, setSyncNotice] = useState(null);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);

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

      try {
        await upsertUserProfile(user);
      } catch (profileError) {
        console.warn('Failed to sync user profile', profileError);
      }

      try {
        const storedUsername = await getUserProfileUsername(user.uid);

        if (!hasUsername(storedUsername)) {
          router.replace('/username-setup');
          setCheckedAuth(true);
          return;
        }
      } catch (usernameCheckError) {
        console.warn('Failed to check username requirement', usernameCheckError);
        router.replace('/username-setup');
        setCheckedAuth(true);
        return;
      }

      const localCollection = await loadCollection();
      const localBadges = await loadBadges();
      await loadRemoteProgress(user.uid, localCollection, localBadges);
      setCheckedAuth(true);
    });

    return unsubscribe;
  }, [loadBadges, loadCollection, loadRemoteProgress, router]);

  useEffect(() => {
    let isCancelled = false;

    async function loadStorageDogVariants() {
      const mappedVariants = await mapVariantsWithStorageUris(ALL_DOGS);

      if (isCancelled) {
        return;
      }

      setDisplayDogs(mappedVariants);
    }

    loadStorageDogVariants().catch((error) => {
      console.warn('Failed to load DoggyDex coat images from Firebase Storage', error);
    });

    return () => {
      isCancelled = true;
    };
  }, []);

  const collected = displayDogs.filter((dog) => collection.includes(dog.id));
  const dogByBreedColorKey = useMemo(() => {
    const mapping = new Map();

    displayDogs.forEach((dog) => {
      mapping.set(`${dog.breed}::${toColorKey(dog.coat)}`, dog);
    });

    return mapping;
  }, [displayDogs]);
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
      <ThemedView style={[styles.container, styles.chooserPageBackground]}>
        <View style={styles.chooserContainer}>
          <ThemedText style={styles.chooserSubtitle}>Guess breeds, unlock coats, build your collection!</ThemedText>
          <View style={styles.chooserCards}>
            <Pressable
              style={({ hovered, pressed }) => [
                styles.chooserCard,
                (hovered || pressed) && styles.chooserCardHover,
                pressed && styles.buttonPressed,
              ]}
              onPress={() => router.push('/signup')}>
              {({ hovered, pressed }) => (
                <>
                  <ThemedText style={styles.chooserIcon}>🆕</ThemedText>
                  <View style={styles.chooserCardTextWrap}>
                    <ThemedText style={[styles.chooserCardTitle, (hovered || pressed) && styles.chooserCardTitleHover]}>Create an Account</ThemedText>
                    <ThemedText style={styles.chooserCardBody}>Save progress and unlock breeds</ThemedText>
                  </View>
                </>
              )}
            </Pressable>

            <Pressable
              style={({ hovered, pressed }) => [
                styles.chooserCard,
                (hovered || pressed) && styles.chooserCardHover,
                pressed && styles.buttonPressed,
              ]}
              onPress={() => router.push('/login')}>
              {({ hovered, pressed }) => (
                <>
                  <ThemedText style={styles.chooserIcon}>🔑</ThemedText>
                  <View style={styles.chooserCardTextWrap}>
                    <ThemedText style={[styles.chooserCardTitle, (hovered || pressed) && styles.chooserCardTitleHover]}>Sign in</ThemedText>
                    <ThemedText style={styles.chooserCardBody}>Continue your journey</ThemedText>
                  </View>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.contentContainer}>
        {lastSyncedLabel ? <ThemedText style={styles.syncMeta}>{lastSyncedLabel}</ThemedText> : null}
        {syncNotice ? <ThemedText style={styles.syncNotice}>{syncNotice}</ThemedText> : null}
        <ThemedText style={styles.countText}>
          <ThemedText style={styles.countNumberText}>{collected.length}</ThemedText>
          {' of '}
          {TOTAL_COATS}
          {' coats unlocked'}
        </ThemedText>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {BREED_SECTIONS.map((section) => (
            <View key={section.breed} style={styles.breedSection}>
              <View style={styles.sectionTitleRow}>
                <ThemedText type="subtitle" style={styles.sectionTitle}>{section.breed}</ThemedText>
                {badges.includes(section.breed) ? <ThemedText style={styles.badgeIcon}>⭐</ThemedText> : null}
              </View>
              <View style={styles.coatGrid}>
                {section.coats.map((coat) => {
                  const matchedDog = dogByBreedColorKey.get(`${section.breed}::${toColorKey(coat)}`) || null;
                  const isUnlocked = matchedDog ? collection.includes(matchedDog.id) : false;

                  return (
                    <View key={`${section.breed}-${coat}`} style={styles.coatTile}>
                      <View style={styles.lockSquare}>
                        {matchedDog ? (
                          <>
                            <Image source={{ uri: matchedDog.uri }} style={styles.coatPreview} contentFit="cover" />
                            {!isUnlocked ? (
                              <View style={styles.coatLockedOverlay}>
                                <ThemedText style={styles.lockIcon}>🔒</ThemedText>
                              </View>
                            ) : null}
                          </>
                        ) : (
                          <ThemedText style={styles.lockIcon}>🔒</ThemedText>
                        )}
                      </View>
                      <ThemedText style={styles.coatLabel}>{coat}</ThemedText>
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={styles.bottomBackWrap}>
          <Link href="/" asChild>
            <Pressable
              style={({ hovered, pressed }) => [
                styles.switchLink,
                hovered && styles.switchLinkHover,
                pressed && styles.switchLinkPressed,
              ]}>
              {({ hovered, pressed }) => (
                <ThemedText
                  style={[
                    styles.switchLinkText,
                    hovered && styles.switchLinkTextHover,
                    pressed && styles.switchLinkTextPressed,
                  ]}>
                  ← Back
                </ThemedText>
              )}
            </Pressable>
          </Link>
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
  contentContainer: {
    flex: 1,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  breedSection: {
    marginTop: 12,
    marginBottom: 2,
  },
  coatGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  coatTile: {
    width: 66,
    alignItems: 'center',
    gap: 3,
  },
  lockSquare: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#C6D4E1',
    backgroundColor: '#F0F4F8',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  coatPreview: {
    ...StyleSheet.absoluteFillObject,
  },
  coatLockedOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(24, 29, 34, 0.45)',
  },
  coatLabel: {
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'center',
  },
  countText: {
    opacity: 0.9,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    color: '#2F6B3D',
    alignSelf: 'flex-start',
    marginTop: 40,
    marginBottom: 4,
  },
  countNumberText: {
    color: '#FF9F1C',
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
  scroll: {
    flex: 1,
    width: '100%',
    marginTop: 4,
    marginBottom: 27.92,
  },
  scrollContent: {
    width: '100%',
    paddingBottom: 52,
  },
  sectionTitle: {
    fontSize: 12,
    lineHeight: 16,
    color: '#000000',
    marginTop: 8,
    marginBottom: 5,
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
  switchLink: {
    alignSelf: 'flex-start',
    marginTop: 8,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.32)',
  },
  bottomBackWrap: {
    marginTop: 'auto',
    alignSelf: 'center',
    marginBottom: 40,
  },
  switchLinkHover: {
    backgroundColor: 'rgba(255,255,255,0.42)',
    transform: [{ translateX: -2 }],
  },
  switchLinkPressed: {
    transform: [{ scale: 0.99 }],
  },
  switchLinkText: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '500',
    color: '#4A2A1F',
    letterSpacing: 0.2,
    ...(Platform.OS === 'web'
      ? {
          transitionProperty: 'color, transform',
          transitionDuration: '0.2s, 0.15s',
          transitionTimingFunction: 'ease, ease',
        }
      : null),
  },
  switchLinkTextHover: {
    color: '#6B3E2E',
    textDecorationLine: 'underline',
  },
  switchLinkTextPressed: {
    color: '#3A2018',
  },
  gateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
  },
  chooserContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  chooserPageBackground: {
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  chooserSubtitle: {
    fontSize: 17,
    lineHeight: 24,
    marginTop: 12,
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
  },
  chooserCards: {
    width: '100%',
    maxWidth: 420,
    gap: 12,
  },
  chooserCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  chooserCardHover: {
    borderColor: PAW_FOCUS_COLOR,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  chooserIcon: {
    fontSize: 28,
    lineHeight: 34,
  },
  chooserCardTextWrap: {
    flex: 1,
    gap: 2,
  },
  chooserCardTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    color: '#1F2937',
  },
  chooserCardTitleHover: {
    color: '#FF9F1C',
  },
  chooserCardBody: {
    fontSize: 14,
    lineHeight: 20,
    color: '#6B7280',
  },
  gateIcon: {
    width: 56,
    height: 56,
    marginBottom: 10,
  },
  gateText: {
    fontSize: 15,
    lineHeight: 22,
    marginTop: 12,
    textAlign: 'center',
  },
  authControls: {
    marginTop: 14,
    gap: 10,
    alignItems: 'stretch',
    width: '100%',
    maxWidth: 340,
  },
  authActionButton: {
    width: '100%',
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  authPrimaryButton: {
    backgroundColor: '#FF9F1C',
    borderWidth: 1,
    borderColor: '#E68A00',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 2,
  },
  authPrimaryHover: {
    backgroundColor: '#E58E19',
    borderColor: '#E68A00',
  },
  authSecondary: {
    backgroundColor: '#FFE066',
  },
  authSecondaryHover: {
    backgroundColor: '#F7D64A',
  },
  authTertiary: {
    backgroundColor: '#B8E1FF',
  },
  authTertiaryHover: {
    backgroundColor: '#9BD3F7',
  },
  googleButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#DADCE0',
  },
  googleButtonHover: {
    backgroundColor: 'rgba(255,140,102,0.14)',
    borderColor: PAW_FOCUS_COLOR,
  },
  googleButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  googleLogo: {
    width: 18,
    height: 18,
  },
  googleButtonLabel: {
    fontWeight: '600',
    color: '#202124',
    textAlign: 'center',
  },
  orRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#B6BDC4',
  },
  orText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
    color: '#687076',
  },
  input: {
    fontFamily: APP_FONT_FAMILY,
    width: '100%',
    maxWidth: 340,
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#687076',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    lineHeight: 20,
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
  buttonPressed: {
    transform: [{ scale: 0.98 }],
  },
  buttonLabel: {
    fontWeight: '600',
    textAlign: 'center',
    width: '100%',
  },
  authPrimaryLabel: {
    color: '#FFFFFF',
    fontSize: Platform.select({ web: 18, default: 16 }),
    lineHeight: Platform.select({ web: 24, default: 22 }),
    letterSpacing: 0.75,
    fontWeight: '500',
  },
  authSecondaryLabel: {
    color: '#2D2100',
    fontSize: Platform.select({ web: 16, default: 15 }),
    lineHeight: Platform.select({ web: 22, default: 20 }),
    letterSpacing: 0.4,
    fontWeight: '600',
  },
  signInError: {
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
