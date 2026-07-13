import { GameIcon } from '@/components/game-icon';
import { SplashTransition } from '@/components/splash-transition';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { DoggyDexTheme } from '@/constants/theme';
import { auth, db } from '@/lib/firebase-services';
import { getLocalImgAsset } from '@/lib/local-image-assets';
import { getLevelProgress, getNextTrainerRank, loadBreedProgress } from '@/lib/progression-store';
import { getUserProfileUsername, hasUsername, upsertUserProfile } from '@/lib/user-store';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Redirect, useRouter } from 'expo-router';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import dogBreedsData from '../../data/dog-breeds.json';

const DOGGYDEX_LOGO = require('../../img/doggydex.png');
const TOTAL_CATALOG_BREEDS = dogBreedsData.breeds.length;
const PREVIEW_DOGS = [
  getLocalImgAsset('golden_retriever_golden.jpg'),
  getLocalImgAsset('beagle_black_tan_white.jpg'),
  getLocalImgAsset('border_collie_black_white.jpg'),
  getLocalImgAsset('pug_fawn.jpg'),
];

function getBalancedRankLabel(rank = '') {
  const words = String(rank).trim().toUpperCase().split(/\s+/).filter(Boolean);

  if (words.length <= 1) {
    return words[0] || '';
  }

  if (words.length === 2) {
    return `${words[0]}\n${words[1]}`;
  }

  const totalLength = words.join('').length;
  let bestSplit = 1;
  let bestDelta = Number.POSITIVE_INFINITY;

  for (let splitIndex = 1; splitIndex < words.length; splitIndex += 1) {
    const firstLineLength = words.slice(0, splitIndex).join('').length;
    const secondLineLength = totalLength - firstLineLength;
    const delta = Math.abs(firstLineLength - secondLineLength);

    if (delta < bestDelta) {
      bestDelta = delta;
      bestSplit = splitIndex;
    }
  }

  return `${words.slice(0, bestSplit).join(' ')}\n${words.slice(bestSplit).join(' ')}`;
}

function getRankBadgeLabelStyle(rank = '') {
  const words = String(rank).trim().split(/\s+/).filter(Boolean);
  const longestWordLength = words.reduce((longest, word) => Math.max(longest, word.length), 0);

  if (longestWordLength >= 10) {
    return styles.levelBadgeLabelLong;
  }

  if (longestWordLength >= 9 || words.join('').length >= 15) {
    return styles.levelBadgeLabelMedium;
  }

  return null;
}

function CollectionRing({ percentage }) {
  const radius = 43;
  const circumference = 2 * Math.PI * radius;

  return (
    <View style={styles.collectionRingWrap}>
      <Svg width={102} height={102} viewBox="0 0 108 108" style={styles.collectionRingSvg}>
        <Circle cx="54" cy="54" r={radius} stroke="#E8DDCF" strokeWidth="8" fill="none" />
        <Circle
          cx="54"
          cy="54"
          r={radius}
          stroke="#F29032"
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - percentage / 100)}
          rotation="-90"
          origin="54, 54"
        />
      </Svg>
      <ThemedText style={styles.collectionPercent}>{percentage}%</ThemedText>
      <ThemedText style={styles.collectionComplete}>COMPLETE</ThemedText>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [breedProgress, setBreedProgress] = useState([]);
  const [totalXP, setTotalXP] = useState(0);
  const [username, setUsername] = useState('Trainer');
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(null);
  const [isLaunchingQuiz, setIsLaunchingQuiz] = useState(false);
  const [isHomeLoading, setIsHomeLoading] = useState(true);
  const authCheckIdRef = useRef(0);
  const playPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(playPulse, {
          toValue: 1,
          duration: 1700,
          useNativeDriver: true,
        }),
        Animated.timing(playPulse, {
          toValue: 0,
          duration: 1700,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [playPulse]);

  useEffect(() => {
    let isActive = true;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      const authCheckId = authCheckIdRef.current + 1;
      authCheckIdRef.current = authCheckId;
      const isCurrentAuthCheck = () =>
        isActive
        && authCheckIdRef.current === authCheckId
        && auth.currentUser?.uid === firebaseUser?.uid;

      if (!isActive) return;

      setIsHomeLoading(true);
      setUser(firebaseUser ?? null);
      setAuthChecked(true);

      try {
        if (!firebaseUser) {
          setBreedProgress([]);
          setTotalXP(0);
          setUsername('Trainer');
          return;
        }

        try {
          await upsertUserProfile(firebaseUser);
        } catch (profileError) {
          console.warn('Failed to sync user profile', profileError);
        }

        if (!isCurrentAuthCheck()) return;

        try {
          const storedUsername = await getUserProfileUsername(firebaseUser.uid);

          if (!isCurrentAuthCheck()) return;

          if (!hasUsername(storedUsername)) {
            router.replace('/doggydex');
            return;
          }
          setUsername(storedUsername);
        } catch (usernameCheckError) {
          console.warn('Failed to check username requirement', usernameCheckError);
          if (isCurrentAuthCheck()) {
            setUsername(firebaseUser.displayName || 'Trainer');
          }
          return;
        }

        if (!isCurrentAuthCheck()) return;

        try {
          const [storedBreedProgress, userSnap] = await Promise.all([
            loadBreedProgress(firebaseUser.uid),
            getDoc(doc(db, 'users', firebaseUser.uid)),
          ]);

          if (!isCurrentAuthCheck()) return;

          setBreedProgress(storedBreedProgress);
          setTotalXP(Math.max(0, Number(userSnap.data()?.totalXP) || 0));
        } catch (progressError) {
          if (!isCurrentAuthCheck()) return;

          setBreedProgress([]);
          setTotalXP(0);
          console.warn('[HOME] Failed to load player progress', progressError);
        }
      } finally {
        if (isCurrentAuthCheck() || (isActive && !firebaseUser)) {
          setIsHomeLoading(false);
        }
      }
    });

    return () => {
      isActive = false;
      authCheckIdRef.current += 1;
      unsubscribe();
    };
  }, [router]);

  function handleOpenQuiz() {
    if (isLaunchingQuiz) return;
    setIsProfileMenuOpen(false);
    setIsLaunchingQuiz(true);
    setTimeout(() => {
      router.push('/quiz');
    }, 120);
  }

  async function handleSignOut() {
    setIsProfileMenuOpen(false);
    setSignOutError(null);
    setIsSigningOut(true);

    try {
      await signOut(auth);
      setUser(null);
      router.replace('/doggydex');
    } catch (error) {
      console.warn('Failed to clear signed-in user', error);
      setSignOutError('Could not sign out. Please try again.');
    } finally {
      setIsSigningOut(false);
    }
  }

  if (!authChecked) return <SplashTransition />;
  if (!user) return <Redirect href="/doggydex" />;

  const discoveredBreeds = breedProgress.filter((breed) => breed.discovered).length;
  const levelProgress = getLevelProgress(totalXP);
  const nextRank = getNextTrainerRank(levelProgress.level);
  const collectionPercentage = Math.min(
    100,
    Math.round((discoveredBreeds / TOTAL_CATALOG_BREEDS) * 100)
  );
  const avatarLetter = username.charAt(0).toUpperCase();

  return (
    <ThemedView style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: Math.max(insets.top + 14, 32),
            paddingBottom: Math.max(insets.bottom + 20, 28),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <View style={styles.topBar}>
            <View style={styles.profileMenuAnchor}>
              <Pressable
                accessibilityLabel="Open player menu"
                accessibilityRole="button"
                accessibilityState={{ expanded: isProfileMenuOpen }}
                onPress={() => setIsProfileMenuOpen((open) => !open)}
                style={({ pressed }) => [styles.profileGroup, pressed && styles.profilePressed]}
              >
                {user.photoURL ? (
                  <Image source={{ uri: user.photoURL }} style={styles.avatar} contentFit="cover" />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <ThemedText style={styles.avatarLetter}>{avatarLetter}</ThemedText>
                  </View>
                )}
                <View style={styles.avatarMenuBadge}>
                  <MaterialIcons name="keyboard-arrow-down" size={15} color="#6B4F36" />
                </View>
              </Pressable>
            </View>
          </View>

          {signOutError ? <ThemedText style={styles.signOutError}>{signOutError}</ThemedText> : null}

          <View style={styles.hero}>
            <Image source={DOGGYDEX_LOGO} style={styles.heroLogo} contentFit="contain" />
            <View style={styles.heroTagline}>
              <ThemedText style={styles.heroTaglineLine}>Guess dog breeds.</ThemedText>
              <View style={styles.heroTaglineRow}>
                <ThemedText style={styles.heroTaglineLine}>Unlock </ThemedText>
                <ThemedText style={styles.heroAccent}>every</ThemedText>
                <ThemedText style={styles.heroTaglineLine}> coat.</ThemedText>
              </View>
            </View>
          </View>

          <View style={styles.infoCard}>
            <View style={styles.levelBadge}>
              <MaterialIcons name="pets" size={23} color="#FFD260" />
              <ThemedText
                style={[styles.levelBadgeLabel, getRankBadgeLabelStyle(levelProgress.rank)]}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.84}
                ellipsizeMode="clip"
              >
                {getBalancedRankLabel(levelProgress.rank)}
              </ThemedText>
              <ThemedText style={styles.levelBadgeSmall}>LEVEL</ThemedText>
              <ThemedText style={styles.levelBadgeNumber}>{levelProgress.level}</ThemedText>
            </View>

            <View style={styles.progressDetails}>
              <ThemedText style={styles.eyebrow}>TRAINER PROGRESS</ThemedText>
              <ThemedText style={styles.levelTitle}>
                Level <ThemedText style={styles.orange}>{levelProgress.level}</ThemedText>
              </ThemedText>
              <ThemedText style={styles.xpText}>
                <ThemedText style={styles.orange}>{levelProgress.currentLevelXP}</ThemedText> / {levelProgress.xpForNextLevel} XP
              </ThemedText>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${levelProgress.percentage}%` }]} />
              </View>
              <ThemedText style={styles.helperText}>
                {levelProgress.xpRemaining} XP until Level {levelProgress.level + 1}
              </ThemedText>
            </View>

            <View style={styles.rewardWrap}>
              <View style={styles.rewardIcon}>
                <GameIcon name="workspace-premium" size={31} />
              </View>
              <ThemedText style={styles.rewardLabel}>{nextRank ? 'NEXT RANK' : 'TOP RANK'}</ThemedText>
              <ThemedText style={styles.rewardRank}>{nextRank ? nextRank.name : 'Champion'}</ThemedText>
              {nextRank ? <ThemedText style={styles.rewardLevel}>Level {nextRank.minLevel}</ThemedText> : null}
            </View>
          </View>

          <Pressable
            onPress={() => router.push('/doggydex')}
            style={({ pressed }) => [styles.infoCard, styles.collectionCard, pressed && styles.pressed]}
          >
            <CollectionRing percentage={collectionPercentage} />
            <View style={styles.collectionDetails}>
              <ThemedText style={styles.eyebrow}>DOGGYDEX COLLECTION</ThemedText>
              <ThemedText style={styles.collectionCount}>
                <ThemedText style={styles.orange}>{discoveredBreeds}</ThemedText> / {TOTAL_CATALOG_BREEDS}
              </ThemedText>
              <ThemedText style={styles.helperText}>Breeds discovered</ThemedText>
              <View style={styles.previewRow}>
                {discoveredBreeds === 0
                  ? PREVIEW_DOGS.map((_, index) => (
                    <View key={index} style={styles.lockedPreview}>
                      <MaterialIcons name="pets" size={17} color="#A89A8D" />
                    </View>
                  ))
                  : PREVIEW_DOGS.map((source, index) => (
                    <Image key={index} source={source} style={styles.previewDog} contentFit="cover" />
                  ))}
              </View>
            </View>
            <View style={styles.collectionLink}>
              <GameIcon name="menu-book" size={28} />
              <MaterialIcons name="chevron-right" size={26} color="#3D332B" />
            </View>
          </Pressable>

          <Pressable
            onPress={handleOpenQuiz}
            disabled={isLaunchingQuiz}
            style={({ pressed }) => [
              styles.primaryAction,
              (pressed || isLaunchingQuiz) && styles.primaryActionPressed,
            ]}
          >
            <Animated.View
              pointerEvents="none"
              style={[
                styles.primaryActionGlow,
                {
                  opacity: playPulse.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.18, 0.38],
                  }),
                  transform: [
                    {
                      scale: playPulse.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.98, 1.035],
                      }),
                    },
                  ],
                },
              ]}
            />
            <View style={styles.playCircle}>
              <MaterialIcons name="play-arrow" size={32} color={DoggyDexTheme.colors.primary} />
            </View>
            <View style={styles.actionCopy}>
              <ThemedText style={styles.primaryActionTitle}>Play Quiz</ThemedText>
              <ThemedText style={styles.primaryActionBody}>Guess correct breeds to unlock new coats</ThemedText>
            </View>
          </Pressable>

          <Pressable
            onPress={() => router.push('/doggydex')}
            style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}
          >
            <GameIcon name="menu-book" size={27} compact style={styles.secondaryActionIcon} />
            <View style={styles.actionCopy}>
              <ThemedText style={styles.secondaryActionTitle}>View DoggyDex</ThemedText>
              <ThemedText style={styles.secondaryActionBody}>View your coat collection for each breed</ThemedText>
            </View>
            <MaterialIcons name="chevron-right" size={28} color="#332A22" />
          </Pressable>
        </View>
      </ScrollView>

      {isProfileMenuOpen ? (
        <>
          <Pressable
            accessibilityLabel="Close player menu"
            accessibilityRole="button"
            onPress={() => setIsProfileMenuOpen(false)}
            style={styles.profileMenuBackdrop}
          />
          <View
            style={[
              styles.profileMenu,
              {
                top: Math.max(insets.top + 14, 32) + 68,
                left: Math.max(14, (windowWidth - 620) / 2),
              },
            ]}
          >
            <ThemedText style={styles.profileMenuName}>{username}</ThemedText>
            <ThemedText style={styles.profileMenuEmail} numberOfLines={1}>
              {user.email || 'Signed-in player'}
            </ThemedText>
            <View style={styles.profileMenuDivider} />
            <Pressable
              accessibilityRole="button"
              disabled={isSigningOut}
              onPress={handleSignOut}
              style={({ pressed }) => [styles.signOutMenuButton, pressed && styles.profilePressed]}
            >
              <MaterialIcons name="logout" size={21} color="#B42318" />
              <ThemedText style={styles.signOutMenuText}>
                {isSigningOut ? 'Signing out…' : 'Sign out'}
              </ThemedText>
            </Pressable>
          </View>
        </>
      ) : null}

      {isLaunchingQuiz || isHomeLoading ? <SplashTransition overlay /> : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 14 },
  content: { width: '100%', maxWidth: 620, alignSelf: 'center', gap: 12 },
  topBar: { flexDirection: 'row', alignItems: 'center', zIndex: 100, marginTop: -8 },
  profileMenuAnchor: { flex: 1, position: 'relative' },
  profileGroup: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 18, position: 'relative' },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 3,
    borderColor: '#FFF6E7',
  },
  avatarMenuBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF6E7',
    borderWidth: 1,
    borderColor: '#E5C98D',
    ...DoggyDexTheme.shadow,
  },
  avatarFallback: { backgroundColor: DoggyDexTheme.colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { color: '#FFFFFF', fontSize: 25, fontWeight: '900' },
  profilePressed: { opacity: 0.72 },
  profileMenuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
  },
  profileMenu: {
    position: 'absolute',
    width: 250,
    borderRadius: DoggyDexTheme.radii.medium,
    padding: 14,
    backgroundColor: 'rgba(255,246,232,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    ...DoggyDexTheme.shadow,
    zIndex: 1001,
  },
  profileMenuName: { color: '#2D241D', fontSize: 17, lineHeight: 22, fontWeight: '900' },
  profileMenuEmail: { color: '#71665D', fontSize: 12, lineHeight: 17, marginTop: 1 },
  profileMenuDivider: { height: 1, backgroundColor: '#E6D8C8', marginVertical: 11 },
  signOutMenuButton: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 5 },
  signOutMenuText: { color: '#B42318', fontSize: 15, lineHeight: 20, fontWeight: '800' },
  signOutError: {
    fontSize: 12,
    lineHeight: 16,
    color: '#B42318',
    fontWeight: '700',
    backgroundColor: 'rgba(255,245,235,0.94)',
    padding: 8,
    borderRadius: 8,
  },
  hero: { alignItems: 'center', marginTop: -44, marginBottom: 24 },
  heroLogo: { width: '74%', maxWidth: 378, aspectRatio: 1.5 },
  heroTagline: {
    marginTop: -30,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  heroTaglineLine: {
    color: '#FFFFFF',
    fontSize: 23,
    lineHeight: 32,
    fontWeight: '900',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  heroTaglineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'baseline',
  },
  heroAccent: {
    color: DoggyDexTheme.colors.primary,
    fontSize: 27,
    lineHeight: 36,
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    padding: 15,
    borderRadius: DoggyDexTheme.radii.large,
    backgroundColor: 'rgba(255,246,232,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    ...DoggyDexTheme.shadow,
  },
  levelBadge: {
    width: 102,
    minHeight: 126,
    borderRadius: 20,
    paddingVertical: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#342541',
    borderWidth: 4,
    borderColor: '#C88727',
  },
  levelBadgeLabel: {
    width: '100%',
    marginTop: 6,
    color: '#FFFFFF',
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 16,
    fontWeight: '900',
    flexShrink: 1,
    includeFontPadding: false,
    wordBreak: 'normal',
    overflowWrap: 'normal',
  },
  levelBadgeLabelMedium: { fontSize: 14, lineHeight: 15 },
  levelBadgeLabelLong: { fontSize: 13, lineHeight: 14 },
  levelBadgeSmall: { color: '#FFE26A', fontSize: 10, fontWeight: '900', marginTop: 6 },
  levelBadgeNumber: { color: '#FFB51B', fontSize: 30, lineHeight: 34, fontWeight: '900' },
  progressDetails: { flex: 1, minWidth: 0, alignSelf: 'flex-start', paddingTop: 3 },
  eyebrow: {
    color: DoggyDexTheme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 17,
    letterSpacing: 1.1,
    fontWeight: '900',
    marginBottom: 4,
  },
  levelTitle: { color: DoggyDexTheme.colors.text, fontSize: 28, lineHeight: 33, fontWeight: '900', marginBottom: 6 },
  orange: { color: DoggyDexTheme.colors.primary, fontWeight: '900' },
  xpText: { color: DoggyDexTheme.colors.text, fontSize: 16, lineHeight: 22, fontWeight: '900', marginTop: 2, marginBottom: 6 },
  progressTrack: {
    height: 11,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: DoggyDexTheme.colors.track,
    marginTop: 15,
    marginBottom: 15,
  },
  progressFill: { height: '100%', minWidth: 3, borderRadius: 6, backgroundColor: DoggyDexTheme.colors.primary },
  helperText: { color: DoggyDexTheme.colors.textSecondary, fontSize: 13, lineHeight: 17, fontWeight: '600' },
  rewardWrap: { width: 86, alignItems: 'center', paddingVertical: 8, paddingHorizontal: 6 },
  rewardIcon: { alignItems: 'center', justifyContent: 'center' },
  rewardLabel: {
    marginTop: 10,
    color: DoggyDexTheme.colors.textMuted,
    fontSize: 9,
    lineHeight: 12,
    textAlign: 'center',
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  rewardRank: {
    marginTop: 2,
    color: DoggyDexTheme.colors.text,
    fontSize: 12,
    lineHeight: 15,
    textAlign: 'center',
    fontWeight: '900',
  },
  rewardLevel: {
    marginTop: 1,
    color: DoggyDexTheme.colors.textSecondary,
    fontSize: 10,
    lineHeight: 13,
    textAlign: 'center',
    fontWeight: '800',
  },
  collectionCard: { minHeight: 138, marginTop: 8 },
  collectionRingWrap: { width: 102, height: 102, alignItems: 'center', justifyContent: 'center', opacity: 0.9 },
  collectionRingSvg: { position: 'absolute' },
  collectionPercent: { color: '#231F1B', fontSize: 23, lineHeight: 27, fontWeight: '900' },
  collectionComplete: { color: '#6B625A', fontSize: 8, lineHeight: 10, fontWeight: '800' },
  collectionDetails: { flex: 1, minWidth: 0 },
  collectionCount: { color: '#28221D', fontSize: 29, lineHeight: 34, fontWeight: '900' },
  previewRow: { flexDirection: 'row', marginTop: 16 },
  previewDog: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#FFF8EC',
    marginRight: -3,
  },
  lockedPreview: {
    width: 34,
    height: 34,
    borderRadius: DoggyDexTheme.radii.small,
    borderWidth: 1,
    borderColor: '#D8C9B8',
    backgroundColor: '#E9E0D4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -3,
  },
  collectionLink: { alignItems: 'center', gap: 8 },
  primaryAction: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: DoggyDexTheme.radii.medium,
    backgroundColor: DoggyDexTheme.colors.primary,
    borderWidth: 2,
    borderColor: '#FF8E29',
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#2F251F',
    shadowOffset: { width: 0, height: 9 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 10,
  },
  primaryActionGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFD260',
    borderRadius: DoggyDexTheme.radii.medium,
  },
  primaryActionPressed: { transform: [{ scale: 0.965 }, { translateY: 2 }] },
  playCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF9EF',
  },
  actionCopy: { flex: 1, minWidth: 0 },
  primaryActionTitle: { color: '#FFFFFF', fontSize: 24, lineHeight: 28, fontWeight: '900' },
  primaryActionBody: { color: '#FFFDF7', fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 3 },
  secondaryAction: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    marginTop: 5,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: DoggyDexTheme.radii.medium,
    backgroundColor: 'rgba(255,253,247,0.96)',
    ...DoggyDexTheme.shadow,
  },
  secondaryActionTitle: { color: DoggyDexTheme.colors.text, fontSize: 20, lineHeight: 24, fontWeight: '900' },
  secondaryActionBody: { color: DoggyDexTheme.colors.textSecondary, fontSize: 13, lineHeight: 17, fontWeight: '600' },
  secondaryActionIcon: { marginLeft: 6 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
});
