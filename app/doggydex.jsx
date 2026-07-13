import { DoggyDexHeader } from '@/components/doggydex-header';
import { FrostedGlassCard } from '@/components/frosted-glass-card';
import { GameIcon } from '@/components/game-icon';
import { SplashTransition } from '@/components/splash-transition';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { auth, db, storage } from '@/lib/firebase-services';
import { getLocalImgAsset } from '@/lib/local-image-assets';
import { loadBreedProgress } from '@/lib/progression-store';
import { getUserProfileUsername, hasUsername, upsertUserProfile } from '@/lib/user-store';
import { DoggyDexTheme } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { collection as firestoreCollection, getDocs } from 'firebase/firestore';
import { getDownloadURL, ref as storageRef } from 'firebase/storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

const LANDING_PREVIEW_DOGS = [
  getLocalImgAsset('golden_retriever_golden.jpg'),
  getLocalImgAsset('beagle_black_tan_white.jpg'),
  getLocalImgAsset('border_collie_black_white.jpg'),
];

function toSafeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function getProgressPercent(value, total) {
  const normalizedTotal = Math.max(0, Number(total) || 0);
  if (normalizedTotal <= 0) return 0;

  return Math.min(100, Math.round((Math.max(0, Number(value) || 0) / normalizedTotal) * 100));
}

function getDoggyDexImageSource(source) {
  return typeof source === 'string' ? { uri: source } : source;
}

function getCoatLookupKeys(breedId, coat) {
  return [
    coat?.id,
    ...(Array.isArray(coat?.aliases) ? coat.aliases : []),
    coat?.colorName ? `${breedId}__${toSafeKey(coat.colorName)}` : null,
    coat?.imgFilename,
  ].filter(Boolean).map(String);
}

function resolveCoatImageSource(breedId, coat, coatImageCatalog) {
  const imageCatalogForBreed = coatImageCatalog?.[breedId] || {};
  const firestoreImageEntry = getCoatLookupKeys(breedId, coat)
    .map((key) => imageCatalogForBreed[String(key)])
    .find(Boolean);

  return firestoreImageEntry?.imageSource
    || coat?.imageSource
    || getLocalImgAsset(firestoreImageEntry?.imgFilename || coat?.imgFilename)
    || null;
}

function getBreedName(breedData) {
  return breedData?.breed || breedData?.breed_name || 'Unknown Breed';
}

function getBreedId(breedData) {
  return breedData?.breed_id || toSafeKey(getBreedName(breedData));
}

function getBreedTier(breedData) {
  const tier = Number(breedData?.tier);
  return Number.isFinite(tier) && tier > 0 ? tier : 1;
}

function getBreedCoats(breedData) {
  if (Array.isArray(breedData?.coats) && breedData.coats.length) {
    return breedData.coats.map((coat, index) => {
      if (typeof coat === 'string') {
        const colorName = coat;
        const breedId = getBreedId(breedData);
        const colorId = toSafeKey(colorName);

        return {
          id: `${breedId}__${colorId}`,
          aliases: [`${breedId}__${colorId}`],
          colorName,
          imgFilename: `${breedId}_${colorId}.jpg`,
          order: index,
        };
      }

      const colorName = coat?.color_name || coat?.coat_color || coat?.name || `Coat ${index + 1}`;
      const breedId = getBreedId(breedData);
      const colorId = toSafeKey(colorName);
      const coatName = typeof coat?.coat_name === 'string' ? coat.coat_name.replace(/__+/g, '_') : '';

      return {
        id: `${breedId}__${colorId}`,
        aliases: [
          `${breedId}__${colorId}`,
          coat?.coat_id != null ? String(coat.coat_id) : null,
          typeof coat?.coat_name === 'string' ? coat.coat_name : null,
        ].filter(Boolean),
        colorName,
        imgFilename: coat?.img_filename || (coatName ? `${coatName}.jpg` : `${breedId}_${colorId}.jpg`),
        order: Number.isFinite(Number(coat?.coat_id)) ? Number(coat.coat_id) : index,
      };
    });
  }

  const coatColors = Array.isArray(breedData?.coatColors)
    ? breedData.coatColors
    : Array.from({ length: Math.max(0, Number(breedData?.coatCount || breedData?.coat_count) || 0) }, (_, index) => `Coat ${index + 1}`);

  return coatColors.map((colorName, index) => {
    const breedId = getBreedId(breedData);
    const colorId = toSafeKey(colorName);

    return {
      id: `${breedId}__${colorId}`,
      aliases: [`${breedId}__${colorId}`],
      colorName,
      imgFilename: `${breedId}_${colorId}.jpg`,
      order: index,
    };
  });
}

function buildBreedCatalog() {
  return dogBreedsData.breeds.map((breedData) => {
    const breedId = getBreedId(breedData);
    const name = getBreedName(breedData);
    const coats = getBreedCoats(breedData);

    return {
      id: breedId,
      name,
      tier: getBreedTier(breedData),
      coats,
      totalCoats: coats.length,
      funFact: breedData?.funFact || breedData?.fun_fact || '',
      categoryTags: breedData?.categoryTags || breedData?.category_tags || [],
    };
  });
}

export default function DoggyDexScreen() {
  const router = useRouter();
  const localSearchParams = useLocalSearchParams();
  const [collection, setCollection] = useState([]);
  const [badges, setBadges] = useState([]);
  const [breedProgressRecords, setBreedProgressRecords] = useState([]);
  const [coatImageCatalog, setCoatImageCatalog] = useState({});
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [needsUsernameSetup, setNeedsUsernameSetup] = useState(false);
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [syncNotice, setSyncNotice] = useState(null);
  const [collectionFilter, setCollectionFilter] = useState('all');
  const authCheckIdRef = useRef(0);
  const rewardHighlights = useMemo(() => {
    try {
      const rawHighlights = localSearchParams?.rewardHighlights;
      const rawValue = Array.isArray(rawHighlights) ? rawHighlights[0] : rawHighlights;
      const parsed = rawValue ? JSON.parse(rawValue) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn('Failed to parse reward highlights', error);
      return [];
    }
  }, [localSearchParams]);
  const highlightedBreedIds = useMemo(() => new Set(
    rewardHighlights
      .filter((highlight) => highlight?.type === 'breed')
      .map((highlight) => String(highlight.breedId || ''))
      .filter(Boolean)
  ), [rewardHighlights]);
  const highlightedCoatIds = useMemo(() => new Set(
    rewardHighlights
      .filter((highlight) => highlight?.type === 'coat')
      .map((highlight) => String(highlight.coatId || ''))
      .filter(Boolean)
  ), [rewardHighlights]);

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
      const breedRecords = await loadBreedProgress(uid);
      setBreedProgressRecords(breedRecords);
      const remoteCollection = [...new Set(
        breedRecords.flatMap((breed) => Array.isArray(breed.unlockedCoats) ? breed.unlockedCoats : [])
      )];
      const remoteBadges = breedRecords
        .filter((breed) => breed.discovered)
        .map((breed) => breed.breedName || breed.breedId)
        .filter(Boolean);

      setCollection(remoteCollection.length ? remoteCollection : localCollection);
      setBadges(remoteBadges.length ? remoteBadges : localBadges);
      await persistLocalProgress(
        remoteCollection.length ? remoteCollection : localCollection,
        remoteBadges.length ? remoteBadges : localBadges
      );

      setSyncNotice(null);
    } catch (e) {
      console.warn('Failed to sync cloud progress', e);
      setBreedProgressRecords([]);
      setSyncNotice('Cloud sync is unavailable. Showing device-saved progress.');
    }
  }, [persistLocalProgress]);

  useEffect(() => {
    let isActive = true;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      const authCheckId = authCheckIdRef.current + 1;
      authCheckIdRef.current = authCheckId;
      const isCurrentAuthCheck = () =>
        isActive
        && authCheckIdRef.current === authCheckId
        && auth.currentUser?.uid === user?.uid;

      if (!isActive) {
        return;
      }

      setCheckedAuth(false);
      setIsSignedIn(Boolean(user));

      if (!user) {
        setNeedsUsernameSetup(false);
        setCollection([]);
        setBadges([]);
        setBreedProgressRecords([]);
        setCheckedAuth(true);
        return;
      }

      try {
        await upsertUserProfile(user);
      } catch (profileError) {
        console.warn('Failed to sync user profile', profileError);
      }

      if (!isCurrentAuthCheck()) {
        return;
      }

      try {
        const storedUsername = await getUserProfileUsername(user.uid);

        if (!isCurrentAuthCheck()) {
          return;
        }

        if (!hasUsername(storedUsername)) {
          setNeedsUsernameSetup(true);
          setCheckedAuth(true);
          return;
        }
      } catch (usernameCheckError) {
        console.warn('Failed to check username requirement', usernameCheckError);
        if (isCurrentAuthCheck()) {
          setSyncNotice('Could not verify your profile. Please check your connection and try again.');
          setCheckedAuth(true);
        }
        return;
      }

      if (isCurrentAuthCheck()) {
        setNeedsUsernameSetup(false);
      }

      const localCollection = await loadCollection();
      if (!isCurrentAuthCheck()) {
        return;
      }

      const localBadges = await loadBadges();
      if (!isCurrentAuthCheck()) {
        return;
      }

      await loadRemoteProgress(user.uid, localCollection, localBadges);
      if (isCurrentAuthCheck()) {
        setCheckedAuth(true);
      }
    });

    return () => {
      isActive = false;
      authCheckIdRef.current += 1;
      unsubscribe();
    };
  }, [loadBadges, loadCollection, loadRemoteProgress, router]);

  useEffect(() => {
    let isActive = true;

    async function loadCoatImageCatalog() {
      try {
        const coatsSnapshot = await getDocs(firestoreCollection(db, 'coats'));
        if (!isActive) return;

        const catalogByBreed = {};
        const coatEntries = await Promise.all(coatsSnapshot.docs.map(async (coatDoc) => {
          const data = coatDoc.data() || {};
          const breedId = typeof data.breed_id === 'string' ? data.breed_id.trim() : '';
          const imgFilename = typeof data.img_filename === 'string' ? data.img_filename.trim() : '';
          const imageExists = !!data.image_exists;
          if (!breedId || !imgFilename || !imageExists) return null;

          const colorName = typeof data.color_name === 'string' ? data.color_name.trim() : '';
          const coatName = typeof data.coat_name === 'string' ? data.coat_name.trim() : '';
          const coatId = data.coat_id != null ? String(data.coat_id) : '';
          const localAsset = getLocalImgAsset(imgFilename);
          let imageSource = localAsset;

          if (!imageSource) {
            try {
              imageSource = await getDownloadURL(storageRef(storage, `img/${imgFilename}`));
            } catch {
              imageSource = null;
            }
          }

          return {
            breedId,
            keys: [
              coatDoc.id,
              toSafeKey(coatDoc.id),
              colorName ? `${breedId}__${toSafeKey(colorName)}` : null,
              coatName,
              coatName ? toSafeKey(coatName) : null,
              coatId,
              imgFilename,
            ].filter(Boolean).map(String),
            entry: {
              imgFilename,
              colorName,
              imageSource,
            },
          };
        }));

        if (!isActive) return;

        coatEntries.filter(Boolean).forEach(({ breedId, keys, entry }) => {
          if (!catalogByBreed[breedId]) catalogByBreed[breedId] = {};
          keys.forEach((key) => {
            catalogByBreed[breedId][key] = entry;
          });
        });

        setCoatImageCatalog(catalogByBreed);
      } catch (error) {
        console.warn('Failed to load DoggyDex coat image catalog', error);
      }
    }

    loadCoatImageCatalog();

    return () => {
      isActive = false;
    };
  }, []);

  const breedCatalog = useMemo(() => {
    const baseCatalog = buildBreedCatalog();

    return baseCatalog.map((breed) => {
      const imageCatalogForBreed = coatImageCatalog[breed.id] || {};
      const coats = breed.coats.map((coat) => {
        const matchingImageEntry = getCoatLookupKeys(breed.id, coat)
          .map((key) => imageCatalogForBreed[String(key)])
          .find(Boolean);

        if (!matchingImageEntry?.imgFilename) return coat;

        return {
          ...coat,
          imgFilename: matchingImageEntry.imgFilename,
          imageSource: matchingImageEntry.imageSource || getLocalImgAsset(matchingImageEntry.imgFilename),
          colorName: coat.colorName || matchingImageEntry.colorName,
        };
      });

      return { ...breed, coats };
    });
  }, [coatImageCatalog]);
  const tierSections = useMemo(() => {
    const progressByBreed = new Map();

    breedProgressRecords.forEach((record) => {
      const keys = [
        record?.breedId,
        record?.breedName,
        toSafeKey(record?.breedName),
      ].filter(Boolean);

      keys.forEach((key) => progressByBreed.set(String(key), record));
    });

    const localBadgeSet = new Set((badges || []).map((badge) => String(badge).toLowerCase()));
    const localCollectionSet = new Set((collection || []).map((coatId) => String(coatId)));

    const breeds = breedCatalog.map((breed) => {
      const record = progressByBreed.get(breed.id) || progressByBreed.get(breed.name) || progressByBreed.get(toSafeKey(breed.name));
      const unlockedCoatSet = new Set([
        ...(Array.isArray(record?.unlockedCoats) ? record.unlockedCoats.map(String) : []),
        ...localCollectionSet,
      ]);
      const unlockedCoats = breed.coats.filter((coat) => {
        const isProgressUnlocked = [coat.id, ...(Array.isArray(coat.aliases) ? coat.aliases : [])]
          .filter(Boolean)
          .some((coatId) => unlockedCoatSet.has(String(coatId)));

        return isProgressUnlocked && Boolean(resolveCoatImageSource(breed.id, coat, coatImageCatalog));
      });
      const isDiscovered = Boolean(record?.discovered)
        || localBadgeSet.has(breed.name.toLowerCase())
        || unlockedCoats.length > 0;

      return {
        ...breed,
        isDiscovered,
        unlockedCoats,
        isComplete: unlockedCoats.length >= breed.totalCoats && breed.totalCoats > 0,
      };
    });

    const sectionsByTier = new Map();

    breeds.forEach((breed) => {
      if (!sectionsByTier.has(breed.tier)) {
        sectionsByTier.set(breed.tier, []);
      }

      sectionsByTier.get(breed.tier).push(breed);
    });

    return Array.from(sectionsByTier.entries())
      .map(([tier, tierBreeds]) => {
        const discoveredBreeds = tierBreeds.filter((breed) => breed.isDiscovered);
        const unlockedCoats = tierBreeds.reduce((sum, breed) => sum + breed.unlockedCoats.length, 0);
        const totalCoats = tierBreeds.reduce((sum, breed) => sum + breed.totalCoats, 0);

        return {
          tier,
          breeds: tierBreeds,
          discoveredBreeds,
          isUnlocked: discoveredBreeds.length > 0,
          unlockedCoats,
          totalCoats,
        };
      })
      .sort((a, b) => {
        if (a.isUnlocked !== b.isUnlocked) {
          return a.isUnlocked ? -1 : 1;
        }

        return a.tier - b.tier;
      });
  }, [badges, breedCatalog, breedProgressRecords, coatImageCatalog, collection]);
  const totalDiscoveredBreeds = tierSections.reduce((sum, section) => sum + section.discoveredBreeds.length, 0);
  const totalBreedCount = breedCatalog.length;
  const totalUnlockedCoats = tierSections.reduce((sum, section) => sum + section.unlockedCoats, 0);
  const totalAvailableCoats = tierSections.reduce((sum, section) => sum + section.totalCoats, 0);
  const breedsDiscoveredPercent = getProgressPercent(totalDiscoveredBreeds, totalBreedCount);
  const coatsUnlockedPercent = getProgressPercent(totalUnlockedCoats, totalAvailableCoats);
  const collectionProgressPercent = coatsUnlockedPercent;
  const filteredTierSections = useMemo(() => (
    tierSections
      .map((section) => {
        const displayBreeds = section.discoveredBreeds.filter((breed) => {
          if (collectionFilter === 'completed') return breed.isComplete;
          if (collectionFilter === 'in-progress') return !breed.isComplete;
          return true;
        });

        return { ...section, displayBreeds };
      })
      .filter((section) => collectionFilter === 'all' ? section.isUnlocked : section.displayBreeds.length > 0)
  ), [collectionFilter, tierSections]);
  if (!checkedAuth) {
    return <SplashTransition />;
  }

  if (!isSignedIn || needsUsernameSetup) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.chooserContainer}>
          <View style={styles.chooserBgOverlay} pointerEvents="none" />
          <FrostedGlassCard style={[styles.chooserGlassCard, styles.landingCard, { borderWidth: 0 }]}>
            <View pointerEvents="none" style={styles.cardDecorLayer}>
              <MaterialIcons name="pets" size={44} color={DoggyDexTheme.colors.text} style={styles.decorPawTop} />
              <MaterialIcons name="pets" size={36} color={DoggyDexTheme.colors.text} style={styles.decorPawBottom} />
              <MaterialIcons name="pets" size={28} color={DoggyDexTheme.colors.text} style={styles.decorPawSmall} />
              <MaterialIcons name="horizontal-rule" size={72} color={DoggyDexTheme.colors.text} style={styles.decorBoneLeft} />
              <MaterialIcons name="horizontal-rule" size={58} color={DoggyDexTheme.colors.text} style={styles.decorBoneRight} />
            </View>
            <View pointerEvents="none" style={styles.logoGlow} />
            <DoggyDexHeader style={styles.landingLogo} />
            <ThemedText style={styles.landingHeading}>Welcome, Trainer!</ThemedText>
            <ThemedText style={styles.landingSubtitle}>
              {needsUsernameSetup
                ? 'Finish your profile to save quiz progress and build your DoggyDex.'
                : 'Collect every breed, unlock every coat, and complete your DoggyDex.'}
            </ThemedText>
            <ThemedText style={styles.previewLabel}>Start your collection</ThemedText>
            <View style={styles.collectionPreviewRow}>
              {LANDING_PREVIEW_DOGS.map((source, index) => (
                <View key={`dog-${index}`} style={styles.previewCircle}>
                  <Image source={source} style={styles.previewImage} contentFit="cover" />
                </View>
              ))}
              {[0, 1].map((index) => (
                <View key={`locked-${index}`} style={[styles.previewCircle, styles.previewLockedCircle]}>
                  <MaterialIcons name="pets" size={21} color="#B7A58F" />
                </View>
              ))}
            </View>
            <ThemedText style={styles.previewStatLine}>134 breeds • 600+ coat variations</ThemedText>
            <View style={styles.chooserCards}>
              <Pressable
                style={({ hovered, pressed }) => [
                  styles.chooserCard,
                  styles.landingActionCard,
                  { backgroundColor: '#FFF9F3' },
                  (hovered || pressed) && [styles.chooserCardHover, { transform: [{ scale: 1.035 }] }],
                  pressed && styles.buttonPressed,
                ]}
                onPress={() => router.push(needsUsernameSetup ? '/username-setup' : '/signup')}>
                {({ hovered, pressed }) => (
                  <>
                    <GameIcon name={needsUsernameSetup ? 'person' : 'person-add'} size={25} compact style={styles.landingActionIcon} />
                    <View style={styles.chooserCardTextWrap}>
                      <ThemedText style={[styles.chooserCardTitle, (hovered || pressed) && styles.chooserCardTitleHover]}>
                        {needsUsernameSetup ? 'Continue Setup' : 'Create Account'}
                      </ThemedText>
                      <ThemedText style={styles.chooserCardBody}>
                        {needsUsernameSetup ? 'Choose your trainer name' : 'Begin your collection'}
                      </ThemedText>
                    </View>
                    <MaterialIcons name="chevron-right" size={26} color={DoggyDexTheme.colors.textSecondary} />
                  </>
                )}
              </Pressable>
              <Pressable
                style={({ hovered, pressed }) => [
                  styles.chooserCard,
                  styles.landingActionCard,
                  (hovered || pressed) && [styles.chooserCardHover, { transform: [{ scale: 1.035 }] }],
                  pressed && styles.buttonPressed,
                ]}
                onPress={() => router.push('/login')}>
                {({ hovered, pressed }) => (
                  <>
                    <GameIcon name="login" size={25} compact style={styles.landingActionIcon} />
                    <View style={styles.chooserCardTextWrap}>
                      <ThemedText style={[styles.chooserCardTitle, (hovered || pressed) && styles.chooserCardTitleHover]}>Sign in</ThemedText>
                      <ThemedText style={styles.chooserCardBody}>Continue your journey</ThemedText>
                    </View>
                    <MaterialIcons name="chevron-right" size={26} color={DoggyDexTheme.colors.textSecondary} />
                  </>
                )}
              </Pressable>
            </View>
          </FrostedGlassCard>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.dexScreen}>
      <ScrollView
        style={styles.dexScroll}
        contentContainerStyle={styles.dexScrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.dexHeaderRow}>
          <Pressable
            accessibilityLabel="Back to home"
            accessibilityRole="button"
            onPress={() => router.replace('/')}
            style={({ pressed }) => [styles.dexBackButton, pressed && styles.buttonPressed]}
          >
            <MaterialIcons name="chevron-left" size={26} color={DoggyDexTheme.colors.text} />
          </Pressable>
          <DoggyDexHeader style={styles.dexLogo} />
          <Pressable
            accessibilityLabel="Play quiz"
            accessibilityRole="button"
            onPress={() => router.push('/quiz')}
            style={({ pressed }) => [styles.dexPlayButton, pressed && styles.buttonPressed]}
          >
            <MaterialIcons name="play-arrow" size={24} color="#FFFFFF" />
          </Pressable>
        </View>

        <View style={styles.dexHeroCard}>
          <View style={styles.dexHeroIcon}>
            <GameIcon name="menu-book" size={27} />
          </View>
          <View style={styles.dexHeroCopy}>
            <ThemedText style={styles.dexTitle}>Your DoggyDex</ThemedText>
            <ThemedText style={styles.dexSubtitle} numberOfLines={2}>
              Browse unlocked tiers, discovered breeds, and every coat you&apos;ve collected.
            </ThemedText>
          </View>
        </View>

        <View style={styles.dexStatsRow}>
          <View style={styles.dexStatCard}>
            <View style={styles.dexStatTopRow}>
              <View style={styles.dexStatIcon}>
                <MaterialIcons name="pets" size={17} color={DoggyDexTheme.colors.primary} />
              </View>
              <ThemedText style={styles.dexStatPercent}>{breedsDiscoveredPercent}%</ThemedText>
            </View>
            <View style={styles.dexStatTrack}>
              <View style={[styles.dexStatFill, { width: `${breedsDiscoveredPercent}%` }]} />
            </View>
            <ThemedText numberOfLines={1} adjustsFontSizeToFit style={styles.dexStatValue}>
              {totalDiscoveredBreeds}/{totalBreedCount}
            </ThemedText>
            <ThemedText style={styles.dexStatLabel}>Breeds Discovered</ThemedText>
          </View>
          <View style={styles.dexStatCard}>
            <View style={styles.dexStatTopRow}>
              <View style={styles.dexStatIcon}>
                <MaterialIcons name="auto-awesome" size={17} color={DoggyDexTheme.colors.primary} />
              </View>
              <ThemedText style={styles.dexStatPercent}>{coatsUnlockedPercent}%</ThemedText>
            </View>
            <View style={styles.dexStatTrack}>
              <View style={[styles.dexStatFill, { width: `${coatsUnlockedPercent}%` }]} />
            </View>
            <ThemedText numberOfLines={1} adjustsFontSizeToFit style={styles.dexStatValue}>
              {totalUnlockedCoats}/{totalAvailableCoats}
            </ThemedText>
            <ThemedText style={styles.dexStatLabel}>Coats Unlocked</ThemedText>
          </View>
          <View style={styles.dexStatCard}>
            <View style={styles.dexStatTopRow}>
              <View style={styles.dexStatIcon}>
                <MaterialIcons name="emoji-events" size={17} color={DoggyDexTheme.colors.primary} />
              </View>
              <ThemedText style={styles.dexStatPercent}>{collectionProgressPercent}%</ThemedText>
            </View>
            <View style={styles.dexStatTrack}>
              <View style={[styles.dexStatFill, styles.dexStatFillGold, { width: `${collectionProgressPercent}%` }]} />
            </View>
            <ThemedText style={styles.dexStatValue}>{collectionProgressPercent}%</ThemedText>
            <ThemedText style={styles.dexStatLabel}>Collection Complete</ThemedText>
          </View>
        </View>

        {syncNotice ? <ThemedText style={styles.dexSyncNotice}>{syncNotice}</ThemedText> : null}
        {totalDiscoveredBreeds > 0 ? (
          <View style={styles.dexFilterRow}>
            {[
              { key: 'all', label: 'All', icon: 'grid-view' },
              { key: 'in-progress', label: 'In Progress', icon: 'pending-actions' },
              { key: 'completed', label: 'Completed', icon: 'verified' },
            ].map((filter) => {
              const isActive = collectionFilter === filter.key;
              return (
                <Pressable
                  key={filter.key}
                  onPress={() => setCollectionFilter(filter.key)}
                  style={({ pressed }) => [
                    styles.dexFilterChip,
                    isActive && styles.dexFilterChipActive,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <MaterialIcons
                    name={filter.icon}
                    size={15}
                    color={isActive ? '#FFFFFF' : DoggyDexTheme.colors.textSecondary}
                  />
                  <ThemedText style={[styles.dexFilterChipText, isActive && styles.dexFilterChipTextActive]}>
                    {filter.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {totalDiscoveredBreeds === 0 ? (
          <View style={styles.emptyDexCard}>
            <GameIcon name="pets" size={30} />
            <ThemedText style={styles.emptyDexTitle}>No breeds discovered yet</ThemedText>
            <ThemedText style={styles.emptyDexBody}>
              Play the quiz and correctly identify a breed to reveal its tier and unlock its base coat.
            </ThemedText>
            <Pressable
              onPress={() => router.push('/quiz')}
              style={({ pressed }) => [styles.emptyDexButton, pressed && styles.buttonPressed]}
            >
              <ThemedText style={styles.emptyDexButtonText}>Start Quiz</ThemedText>
            </Pressable>
          </View>
        ) : null}

        {totalDiscoveredBreeds > 0 && filteredTierSections.length === 0 ? (
          <View style={styles.emptyDexCard}>
            <GameIcon name="pets" size={30} />
            <ThemedText style={styles.emptyDexTitle}>
              {collectionFilter === 'completed' ? 'No completed breeds yet' : 'No breeds in this view'}
            </ThemedText>
            <ThemedText style={styles.emptyDexBody}>
              Keep collecting coats to fill this section of your DoggyDex.
            </ThemedText>
          </View>
        ) : null}

        {filteredTierSections.map((section) => {
          if (!section.isUnlocked) {
            return (
              <View key={`tier-${section.tier}`} style={styles.lockedTierCard}>
                <View style={styles.lockedTierIcon}>
                  <MaterialIcons name="lock" size={24} color={DoggyDexTheme.colors.textSecondary} />
                </View>
                <View style={styles.lockedTierCopy}>
                  <ThemedText style={styles.lockedTierTitle}>Tier {section.tier}</ThemedText>
                  <ThemedText style={styles.lockedTierBody}>
                    {section.breeds.length} breeds waiting to be discovered
                  </ThemedText>
                </View>
                <ThemedText style={styles.lockedTierCount}>{section.totalCoats} coats</ThemedText>
              </View>
            );
          }

          return (
            <View key={`tier-${section.tier}`} style={styles.dexTierSection}>
              <View style={styles.dexTierHeader}>
                <View style={styles.dexTierHeaderCopy}>
                  <ThemedText style={styles.dexTierTitle}>Tier {section.tier} Collection</ThemedText>
                  <ThemedText style={styles.dexTierMeta}>
                    {section.unlockedCoats}/{section.totalCoats} coats collected
                  </ThemedText>
                </View>
                <ThemedText style={styles.dexTierPercent}>
                  {getProgressPercent(section.unlockedCoats, section.totalCoats)}%
                </ThemedText>
              </View>
              <View style={styles.dexTierProgressTrack}>
                <View
                  style={[
                    styles.dexTierProgressFill,
                    { width: `${getProgressPercent(section.unlockedCoats, section.totalCoats)}%` },
                  ]}
                />
              </View>

              {section.displayBreeds.map((breed) => (
                (() => {
                  const isHighlightedBreed = highlightedBreedIds.has(String(breed.id));

                  return (
                    <View
                      key={breed.id}
                      style={[
                        styles.dexBreedCard,
                        breed.isComplete && styles.dexBreedCardComplete,
                        isHighlightedBreed && styles.dexBreedCardHighlighted,
                      ]}
                    >
                      <View style={styles.dexBreedHeader}>
                        <View style={[styles.dexBreedIcon, breed.isComplete && styles.dexBreedIconComplete]}>
                          <MaterialIcons
                            name={breed.isComplete ? 'emoji-events' : 'pets'}
                            size={24}
                            color={breed.isComplete ? DoggyDexTheme.colors.gold : DoggyDexTheme.colors.primary}
                          />
                        </View>
                        <View style={styles.dexBreedTitleWrap}>
                          <View style={styles.dexBreedNameRow}>
                            <ThemedText style={styles.dexBreedName}>{breed.name}</ThemedText>
                            {isHighlightedBreed ? (
                              <View style={styles.dexBreedNewBadge}>
                                <ThemedText style={styles.dexNewBadgeText}>NEW</ThemedText>
                              </View>
                            ) : null}
                          </View>
                          <ThemedText style={styles.dexBreedMeta}>
                            {breed.unlockedCoats.length}/{breed.totalCoats} coats unlocked
                          </ThemedText>
                        </View>
                        {breed.isComplete ? (
                          <View style={styles.dexCompleteBadge}>
                            <MaterialIcons name="check" size={13} color="#FFFFFF" />
                            <ThemedText style={styles.dexCompleteBadgeText}>Complete</ThemedText>
                          </View>
                        ) : null}
                      </View>

                      <View style={styles.dexCoatGrid}>
                        {breed.coats.map((coat) => {
                          const coatImageSource = resolveCoatImageSource(breed.id, coat, coatImageCatalog);
                          const isUnlocked = Boolean(coatImageSource)
                            && breed.unlockedCoats.some((unlockedCoat) => unlockedCoat.id === coat.id);
                          const isHighlightedCoat = isUnlocked
                            && [coat.id, ...(Array.isArray(coat.aliases) ? coat.aliases : [])]
                              .filter(Boolean)
                              .some((coatId) => highlightedCoatIds.has(String(coatId)));

                          return (
                            <View
                              key={coat.id}
                              style={[
                                styles.dexCoatTile,
                                !isUnlocked && styles.dexCoatTileLocked,
                                isHighlightedCoat && styles.dexCoatTileHighlighted,
                              ]}
                            >
                              {isHighlightedCoat ? (
                                <View style={styles.dexNewBadge}>
                                  <ThemedText style={styles.dexNewBadgeText}>NEW</ThemedText>
                                </View>
                              ) : null}
                              <View style={styles.dexCoatImageWrap}>
                                {isUnlocked ? (
                                  <Image source={getDoggyDexImageSource(coatImageSource)} style={styles.dexCoatImage} contentFit="cover" />
                                ) : (
                                  <View style={styles.dexCoatPlaceholder}>
                                    <View style={styles.dexLockedCoatIcon}>
                                      <MaterialIcons name="lock" size={17} color="#7C6650" />
                                    </View>
                                  </View>
                                )}
                              </View>
                              <ThemedText
                                numberOfLines={2}
                                style={[styles.dexCoatName, !isUnlocked && styles.dexCoatNameLocked]}
                              >
                                {coat.colorName}
                              </ThemedText>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  );
                })()
              ))}
            </View>
          );
        })}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  dexScreen: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  dexScroll: {
    flex: 1,
  },
  dexScrollContent: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 42,
    gap: 12,
  },
  dexHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  dexLogo: {
    flex: 1,
    maxWidth: 220,
    marginBottom: 0,
    marginTop: -18,
    transform: [{ scale: 0.66 }],
  },
  dexBackButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,253,247,0.96)',
    borderWidth: 1,
    borderColor: DoggyDexTheme.colors.border,
    ...DoggyDexTheme.shadow,
  },
  dexPlayButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DoggyDexTheme.colors.primary,
    borderWidth: 1,
    borderColor: DoggyDexTheme.colors.gold,
    ...DoggyDexTheme.shadow,
  },
  dexHeroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: DoggyDexTheme.radii.large,
    backgroundColor: 'rgba(255,246,232,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
    ...DoggyDexTheme.shadow,
  },
  dexHeroIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dexHeroCopy: {
    flex: 1,
    minWidth: 0,
  },
  dexTitle: {
    color: DoggyDexTheme.colors.text,
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '900',
  },
  dexSubtitle: {
    color: DoggyDexTheme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    marginTop: 1,
  },
  dexStatsRow: {
    flexDirection: 'row',
    gap: 9,
  },
  dexStatCard: {
    flex: 1,
    justifyContent: 'space-between',
    minHeight: 104,
    paddingVertical: 10,
    paddingHorizontal: 9,
    borderRadius: DoggyDexTheme.radii.medium,
    backgroundColor: 'rgba(255,253,247,0.96)',
    borderWidth: 1,
    borderColor: DoggyDexTheme.colors.border,
    ...DoggyDexTheme.shadow,
  },
  dexStatTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    width: '100%',
  },
  dexStatIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF2D2',
    borderWidth: 1,
    borderColor: '#F0D394',
  },
  dexStatPercent: {
    color: DoggyDexTheme.colors.text,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
  },
  dexStatTrack: {
    width: '100%',
    height: 7,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#E8DDCF',
    marginTop: 9,
    marginBottom: 7,
  },
  dexStatFill: {
    height: '100%',
    minWidth: 3,
    borderRadius: 999,
    backgroundColor: DoggyDexTheme.colors.primary,
  },
  dexStatFillGold: {
    backgroundColor: DoggyDexTheme.colors.gold,
  },
  dexStatValue: {
    color: DoggyDexTheme.colors.primary,
    fontSize: 19,
    lineHeight: 23,
    fontWeight: '900',
    textAlign: 'center',
  },
  dexStatLabel: {
    color: DoggyDexTheme.colors.textSecondary,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.45,
    textAlign: 'center',
  },
  dexSyncNotice: {
    color: DoggyDexTheme.colors.error,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    textAlign: 'center',
    backgroundColor: 'rgba(255,246,232,0.94)',
    borderRadius: DoggyDexTheme.radii.small,
    padding: 10,
  },
  dexFilterRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  dexFilterChip: {
    borderRadius: 999,
    backgroundColor: 'rgba(255,253,247,0.92)',
    borderWidth: 1,
    borderColor: DoggyDexTheme.colors.border,
    paddingVertical: 8,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dexFilterChipActive: {
    backgroundColor: DoggyDexTheme.colors.primary,
    borderColor: DoggyDexTheme.colors.gold,
  },
  dexFilterChipText: {
    color: DoggyDexTheme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
  },
  dexFilterChipTextActive: {
    color: '#FFFFFF',
  },
  emptyDexCard: {
    alignItems: 'center',
    padding: 22,
    borderRadius: DoggyDexTheme.radii.large,
    backgroundColor: 'rgba(255,246,232,0.96)',
    borderWidth: 1,
    borderColor: DoggyDexTheme.colors.border,
    ...DoggyDexTheme.shadow,
  },
  emptyDexTitle: {
    color: DoggyDexTheme.colors.text,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '900',
    marginTop: 12,
    textAlign: 'center',
  },
  emptyDexBody: {
    color: DoggyDexTheme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 430,
  },
  emptyDexButton: {
    marginTop: 16,
    borderRadius: DoggyDexTheme.radii.medium,
    backgroundColor: DoggyDexTheme.colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderWidth: 1,
    borderColor: DoggyDexTheme.colors.gold,
  },
  emptyDexButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '900',
  },
  dexTierSection: {
    gap: 20,
    padding: 14,
    borderRadius: DoggyDexTheme.radii.large,
    backgroundColor: 'rgba(255,246,232,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.86)',
    ...DoggyDexTheme.shadow,
  },
  dexTierHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  dexTierHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  dexTierTitle: {
    color: DoggyDexTheme.colors.text,
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '900',
  },
  dexTierMeta: {
    color: DoggyDexTheme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    marginTop: 2,
  },
  dexTierPercent: {
    color: DoggyDexTheme.colors.primary,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900',
  },
  dexTierProgressTrack: {
    height: 10,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#E8DDCF',
    marginTop: -9,
  },
  dexTierProgressFill: {
    height: '100%',
    minWidth: 3,
    borderRadius: 999,
    backgroundColor: DoggyDexTheme.colors.primary,
  },
  dexBreedCard: {
    padding: 14,
    borderRadius: DoggyDexTheme.radii.medium,
    backgroundColor: 'rgba(255,253,247,0.97)',
    borderWidth: 1,
    borderColor: DoggyDexTheme.colors.border,
  },
  dexBreedCardComplete: {
    borderColor: DoggyDexTheme.colors.gold,
    borderLeftWidth: 4,
    backgroundColor: '#FFF9EA',
    shadowColor: '#7A4E00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  dexBreedCardHighlighted: {
    borderColor: DoggyDexTheme.colors.gold,
    borderWidth: 2,
    backgroundColor: '#FFF9EA',
  },
  dexBreedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginBottom: 12,
  },
  dexBreedIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF2D2',
    borderWidth: 2,
    borderColor: DoggyDexTheme.colors.gold,
  },
  dexBreedIconComplete: {
    backgroundColor: '#FFF6D8',
    borderColor: DoggyDexTheme.colors.gold,
  },
  dexBreedTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  dexBreedNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 7,
  },
  dexBreedName: {
    color: DoggyDexTheme.colors.text,
    fontSize: 21,
    lineHeight: 26,
    fontWeight: '900',
  },
  dexBreedMeta: {
    color: DoggyDexTheme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    marginTop: 1,
  },
  dexBreedNewBadge: {
    borderRadius: 999,
    backgroundColor: DoggyDexTheme.colors.primary,
    borderWidth: 1,
    borderColor: DoggyDexTheme.colors.gold,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  dexCompleteBadge: {
    borderRadius: 999,
    backgroundColor: DoggyDexTheme.colors.primary,
    borderWidth: 1,
    borderColor: DoggyDexTheme.colors.gold,
    paddingVertical: 4,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dexCompleteBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  dexCoatGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  dexCoatTile: {
    width: Platform.select({ web: 104, default: '30.5%' }),
    minWidth: 86,
    borderRadius: DoggyDexTheme.radii.small,
    backgroundColor: '#FFF8EC',
    borderWidth: 1,
    borderColor: DoggyDexTheme.colors.border,
    padding: 7,
    position: 'relative',
  },
  dexCoatTileLocked: {
    backgroundColor: '#EFE2CF',
    borderStyle: 'dashed',
    borderColor: '#CBB596',
  },
  dexCoatTileHighlighted: {
    borderColor: DoggyDexTheme.colors.gold,
    borderWidth: 2,
    backgroundColor: '#FFF9EA',
  },
  dexNewBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    zIndex: 3,
    borderRadius: 999,
    backgroundColor: DoggyDexTheme.colors.primary,
    borderWidth: 1,
    borderColor: DoggyDexTheme.colors.gold,
    paddingVertical: 2,
    paddingHorizontal: 5,
  },
  dexNewBadgeText: {
    color: '#FFFFFF',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
  },
  dexCoatImageWrap: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#EDE1D2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dexCoatImage: {
    width: '100%',
    height: '100%',
  },
  dexCoatPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E9DDCF',
  },
  dexLockedCoatIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7EFE3',
    borderWidth: 1,
    borderColor: '#CBB596',
  },
  dexCoatName: {
    color: DoggyDexTheme.colors.text,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 6,
    minHeight: 28,
  },
  dexCoatNameLocked: {
    color: DoggyDexTheme.colors.textMuted,
  },
  lockedTierCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 15,
    borderRadius: DoggyDexTheme.radii.large,
    backgroundColor: 'rgba(255,253,247,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(231,205,168,0.78)',
  },
  lockedTierIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFE2CF',
    borderWidth: 1,
    borderColor: '#DDC8AA',
  },
  lockedTierCopy: {
    flex: 1,
    minWidth: 0,
  },
  lockedTierTitle: {
    color: DoggyDexTheme.colors.text,
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '900',
  },
  lockedTierBody: {
    color: DoggyDexTheme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  lockedTierCount: {
    color: DoggyDexTheme.colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
  },
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
  // bottomBackWrap removed for mobile full-screen experience
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
    boxShadow: '0 2px 6px 0 #ffffff22',
    elevation: 1,
  },
  landingCard: {
    paddingTop: 34,
    paddingBottom: 30,
    paddingHorizontal: 30,
  },
  cardDecorLayer: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.035,
    zIndex: 0,
  },
  decorPawTop: {
    position: 'absolute',
    top: 24,
    right: 28,
    transform: [{ rotate: '18deg' }],
  },
  decorPawBottom: {
    position: 'absolute',
    bottom: 92,
    left: 24,
    transform: [{ rotate: '-16deg' }],
  },
  decorPawSmall: {
    position: 'absolute',
    bottom: 26,
    right: 42,
    transform: [{ rotate: '12deg' }],
  },
  decorBoneLeft: {
    position: 'absolute',
    top: 154,
    left: -8,
    transform: [{ rotate: '-22deg' }],
  },
  decorBoneRight: {
    position: 'absolute',
    top: 214,
    right: 0,
    transform: [{ rotate: '24deg' }],
  },
  logoGlow: {
    position: 'absolute',
    top: 22,
    alignSelf: 'center',
    width: 285,
    height: 132,
    borderRadius: 999,
    backgroundColor: DoggyDexTheme.colors.gold,
    opacity: 0.055,
    shadowColor: DoggyDexTheme.colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 36,
  },
  landingLogo: {
    marginBottom: 18,
    transform: [{ scale: 1.12 }],
    zIndex: 2,
  },
  landingHeading: {
    color: DoggyDexTheme.colors.text,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.2,
    marginBottom: 8,
  },
  landingSubtitle: {
    color: DoggyDexTheme.colors.textSecondary,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: 350,
    alignSelf: 'center',
    marginBottom: 16,
  },
  previewLabel: {
    color: DoggyDexTheme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '800',
    letterSpacing: 1,
    textAlign: 'center',
    textTransform: 'uppercase',
    marginBottom: 9,
  },
  collectionPreviewRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  previewStatLine: {
    color: DoggyDexTheme.colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 24,
  },
  previewCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    overflow: 'hidden',
    backgroundColor: DoggyDexTheme.colors.surface,
    borderWidth: 2,
    borderColor: DoggyDexTheme.colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: DoggyDexTheme.colors.text,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 2,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewLockedCircle: {
    backgroundColor: '#EFE2CF',
    borderColor: '#DCC5A6',
    opacity: 0.82,
  },
  chooserCards: {
    width: '100%',
    maxWidth: 420,
    gap: 24,
  },
  chooserCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: DoggyDexTheme.colors.border,
    borderRadius: DoggyDexTheme.radii.medium,
    backgroundColor: DoggyDexTheme.colors.surface,
    ...DoggyDexTheme.shadow,
  },
  chooserCardHover: {
    borderColor: PAW_FOCUS_COLOR,
    boxShadow: '0 4px 10px 0 #0002',
    elevation: 2,
  },
  landingActionCard: {
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderWidth: 2,
  },
  landingActionIcon: {
    backgroundColor: '#FFF2D2',
  },
  chooserIcon: {
    fontSize: 28,
    lineHeight: 34,
  },
  chooserCardTextWrap: {
    flex: 1,
    gap: 2,
    justifyContent: 'center',
    flexDirection: 'column',
    minHeight: 44,
  },
  chooserCardTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    color: DoggyDexTheme.colors.text,
  },
  chooserCardTitleHover: {
    color: DoggyDexTheme.colors.primary,
  },
  chooserCardBody: {
    fontSize: 14,
    lineHeight: 20,
    color: DoggyDexTheme.colors.textSecondary,
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
    boxShadow: '0 2px 6px 0 #1E3A8A33',
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
