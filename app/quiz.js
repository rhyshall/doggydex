import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { SplashTransition } from '@/components/splash-transition';
import { LifePawIcon } from '@/components/game-icon';
import { DOGGYDEX_CORAL_RED, DoggyDexTheme } from '@/constants/theme';
import { auth, db } from '@/lib/firebase-services';
import { getLocalDecoyAssets, getLocalImgAsset } from '@/lib/local-image-assets';
import { awardDailyQuizCompletion, getLevelProgress, recordCorrectAnswer } from '@/lib/progression-store';
// import { loadUserProgress, saveUserProgress } from '@/lib/progress-store';
import { indexVariantsByBreed } from '@/lib/storage-coat-variants';
import { quizStyles } from '@/styles/quizStyles';
import { MaterialIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';

import { onAuthStateChanged } from 'firebase/auth';
import { doc, collection as firestoreCollection, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, FlatList, Platform, Pressable, Animated as RNAnimated, Easing as RNEasing, View } from 'react-native';
import Animated, { Easing as ReanimatedEasing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import breedTiers from '../data/dog-breeds-tiers.json';

const LOCAL_DECOY_VARIANTS = getLocalDecoyAssets().map(({ filename, asset }) => ({
  id: `decoy__${filename}`,
  breed: '',
  breedId: null,
  coat: '',
  imgFilename: filename,
  uri: asset,
  images: [asset],
  isDecoy: true,
}));
const DECOY_BREED_KEY = '__quiz_decoys__';

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const MIN_BREEDS_PER_QUESTION = 4;
const QUESTION_TRANSITION_DISTANCE = 58;
const QUESTION_TRANSITION_DURATION = 240;
const QUESTION_TRANSITION_EASING = ReanimatedEasing.inOut(ReanimatedEasing.cubic);
function weightedPick(items, weightFn) {
  if (!items.length) return null;
  const weights = items.map((item) => Math.max(0, weightFn(item)));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  if (totalWeight <= 0) {
    return items[Math.floor(Math.random() * items.length)];
  }

  let roll = Math.random() * totalWeight;
  for (let index = 0; index < items.length; index += 1) {
    roll -= weights[index];
    if (roll <= 0) {
      return items[index];
    }
  }

  return items[items.length - 1];
}

function pickImageUri(variant, previousUri) {
  const imagePool = Array.isArray(variant.images) && variant.images.length
    ? variant.images
    : [variant.uri];

  if (imagePool.length <= 1) {
    return imagePool[0];
  }

  const filteredPool = imagePool.filter((uri) => uri !== previousUri);
  const finalPool = filteredPool.length ? filteredPool : imagePool;
  return finalPool[Math.floor(Math.random() * finalPool.length)];
}

function toTitleCaseFromId(value) {
  return String(value || '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

async function preloadQuizImageSource(source) {
  if (!source) return;
  return Image.loadAsync(source);
}

async function preloadQuestionImages(question) {
  if (!Array.isArray(question?.choices)) {
    return question;
  }

  const choices = await Promise.all(
    question.choices.map(async (choice) => {
      try {
        const preloadedSource = await preloadQuizImageSource(choice.uri);
        return preloadedSource ? { ...choice, preloadedSource } : choice;
      } catch (error) {
        console.warn('Failed to preload quiz image', error);
        return choice;
      }
    })
  );

  return { ...question, choices };
}

function getQuizImageSource(choice) {
  const source = choice?.preloadedSource || choice?.uri;
  return typeof source === 'string' ? { uri: source } : source;
}

function formatCoatLabel(value) {
  const label = String(value || '').trim();
  if (!label) return 'New coat';
  return label.replace(/\s+coat$/i, '');
}

function getUnlockRewardType(reward) {
  if (reward?.rewardKind === 'coat' || reward?.rewardKind === 'breed') {
    return reward.rewardKind;
  }

  if (reward?.isNewBreed) return 'breed';
  return Array.isArray(reward?.newlyUnlockedCoats) && reward.newlyUnlockedCoats.length > 0
    ? 'coat'
    : null;
}

function UnlockRewardFeedback({ reward, opacity, translateY, scale }) {
  const rewardType = getUnlockRewardType(reward);
  if (!rewardType) return null;

  const isBreedUnlock = rewardType === 'breed';
  const breedName = reward.breedName || reward.breed || 'New breed';
  const coatName = reward.newlyUnlockedCoatLabels?.[0] || reward.coatName || reward.newlyUnlockedCoats?.[0];

  return (
    <RNAnimated.View
      pointerEvents="none"
      style={[
        isBreedUnlock ? quizStyles.breedMilestoneWrap : quizStyles.unlockToastWrap,
        {
          opacity,
          transform: [{ translateY }, { scale }],
        },
      ]}
    >
      {isBreedUnlock ? (
        <View style={quizStyles.breedMilestoneCard}>
          <View style={quizStyles.breedMilestoneSparkleLeft}>
            <MaterialIcons name="auto-awesome" size={18} color="#F4D35E" />
          </View>
          <View style={quizStyles.breedMilestoneImageWrap}>
            {reward.breedImageSource ? (
              <Image source={reward.breedImageSource} style={quizStyles.breedMilestoneImage} contentFit="cover" />
            ) : (
              <MaterialIcons name="pets" size={38} color="#FFFFFF" />
            )}
          </View>
          <View style={quizStyles.breedMilestoneCopy}>
            <ThemedText style={quizStyles.breedMilestoneTitle}>New Breed Unlocked!</ThemedText>
            <ThemedText
              style={quizStyles.breedMilestoneBreed}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
            >
              {breedName}
            </ThemedText>
          </View>
          <View style={quizStyles.breedMilestoneSparkleRight}>
            <MaterialIcons name="auto-awesome" size={15} color="#FFE08A" />
          </View>
        </View>
      ) : (
        <View style={quizStyles.unlockToastCard}>
          <View style={quizStyles.unlockToastIconWrap}>
            <MaterialIcons name="pets" size={20} color="#FFFFFF" />
            <MaterialIcons name="auto-awesome" size={13} color="#FFE08A" style={quizStyles.unlockToastSparkle} />
          </View>
          <View style={quizStyles.unlockToastCopy}>
            <ThemedText style={quizStyles.unlockToastTitle}>New Coat Unlocked!</ThemedText>
            <ThemedText
              style={quizStyles.unlockToastBreed}
              numberOfLines={3}
              adjustsFontSizeToFit
              minimumFontScale={0.72}
            >
              {breedName} — {formatCoatLabel(coatName)}
            </ThemedText>
          </View>
        </View>
      )}
    </RNAnimated.View>
  );
}

const GAME_OVER_REWARD_EASING = RNEasing.bezier(0.22, 1, 0.36, 1);
const GAME_OVER_REWARD_TIMING = Object.freeze({
  xp: 920,
  levelPause: 220,
  unlockStagger: 150,
  unlockSettle: 360,
});

const GAME_OVER_UNLOCK_PREVIEW_LIMIT = 3;
const GAME_OVER_UNLOCK_ROW_HEIGHT = 64;
const GAME_OVER_UNLOCK_MAX_HEIGHT = 224;

function GameOverRewardFlow({
  visible,
  score,
  totalXp,
  xpStartTotal,
  xpEndTotal,
  events,
  skipSignal,
  onFinished,
}) {
  const [showUnlocks, setShowUnlocks] = useState(false);
  const [imagesReady, setImagesReady] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [displayedTotalXp, setDisplayedTotalXp] = useState(Math.max(0, xpStartTotal || 0));
  const [levelUpLevel, setLevelUpLevel] = useState(null);
  const rewardOpacity = useRef(new RNAnimated.Value(0)).current;
  const rewardTranslateY = useRef(new RNAnimated.Value(16)).current;
  const rewardScale = useRef(new RNAnimated.Value(0.97)).current;
  const xpFill = useRef(new RNAnimated.Value(getLevelProgress(xpStartTotal).percentage)).current;
  const listHeight = useRef(new RNAnimated.Value(GAME_OVER_UNLOCK_PREVIEW_LIMIT * GAME_OVER_UNLOCK_ROW_HEIGHT)).current;
  const levelUpOpacity = useRef(new RNAnimated.Value(0)).current;
  const chipAnims = useRef(Array.from({ length: 4 }, () => new RNAnimated.Value(0))).current;
  const unlockAnims = useRef(Array.from({ length: GAME_OVER_UNLOCK_PREVIEW_LIMIT }, () => new RNAnimated.Value(0))).current;
  const onFinishedRef = useRef(onFinished);
  const xpAnimationRef = useRef(null);
  const xpListenerIdRef = useRef(null);
  const rewardTimersRef = useRef([]);

  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  const unlockEvents = useMemo(() => (
    (Array.isArray(events) ? events.filter((event) => event.type === 'breed' || event.type === 'coat') : [])
      .sort((left, right) => Number(right.type === 'breed') - Number(left.type === 'breed'))
  ), [events]);
  const coatCount = unlockEvents.filter((event) => event.type === 'coat').length;
  const breedCount = unlockEvents.filter((event) => event.type === 'breed').length;
  const totalUnlockCount = unlockEvents.length;
  const displayedProgress = getLevelProgress(displayedTotalXp);
  const startTotal = Math.max(0, Number(xpStartTotal) || 0);
  const endTotal = Math.max(startTotal, Number(xpEndTotal) || startTotal);
  const earnedXp = Math.max(0, Number(totalXp) || endTotal - startTotal);
  const previewEvents = unlockEvents.slice(0, GAME_OVER_UNLOCK_PREVIEW_LIMIT);
  const moreCount = Math.max(0, totalUnlockCount - GAME_OVER_UNLOCK_PREVIEW_LIMIT);
  const runMessage = totalUnlockCount >= 9 || score >= 20
    ? 'Amazing Run!'
    : totalUnlockCount >= 4 || score >= 12
      ? 'Great Run!'
      : score >= 5 || totalXp >= 30
        ? 'Nice Run!'
        : 'Keep Going!';

  useEffect(() => {
    if (!visible || !skipSignal) return;
    rewardTimersRef.current.forEach((timerId) => clearTimeout(timerId));
    rewardTimersRef.current = [];
    xpAnimationRef.current?.stopAnimation();
    if (xpAnimationRef.current && xpListenerIdRef.current != null) {
      xpAnimationRef.current.removeListener(xpListenerIdRef.current);
    }
    xpAnimationRef.current = null;
    xpListenerIdRef.current = null;
    setDisplayedTotalXp(endTotal);
    xpFill.setValue(getLevelProgress(endTotal).percentage);
    setShowUnlocks(true);
    rewardOpacity.setValue(1);
    rewardTranslateY.setValue(0);
    rewardScale.setValue(1);
    chipAnims.forEach((value) => value.setValue(1));
    unlockAnims.forEach((value) => value.setValue(1));
    onFinishedRef.current?.();
  }, [chipAnims, endTotal, rewardOpacity, rewardScale, rewardTranslateY, skipSignal, unlockAnims, visible, xpFill]);

  useEffect(() => {
    let isMounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (isMounted) setReduceMotion(Boolean(enabled));
    });
    const subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduceMotion);
    return () => {
      isMounted = false;
      subscription?.remove?.();
    };
  }, []);

  useEffect(() => {
    if (!visible) {
      setShowUnlocks(false);
      setIsExpanded(false);
      setImagesReady(false);
      setDisplayedTotalXp(startTotal);
      setLevelUpLevel(null);
      rewardOpacity.setValue(0);
      rewardTranslateY.setValue(16);
      rewardScale.setValue(0.97);
      xpFill.setValue(getLevelProgress(startTotal).percentage);
      listHeight.setValue(Math.min(unlockEvents.length, GAME_OVER_UNLOCK_PREVIEW_LIMIT) * GAME_OVER_UNLOCK_ROW_HEIGHT);
      levelUpOpacity.setValue(0);
      chipAnims.forEach((value) => value.setValue(0));
      unlockAnims.forEach((value) => value.setValue(0));
      return undefined;
    }

    let isCancelled = false;
    const timers = [];
    listHeight.setValue(Math.min(unlockEvents.length, GAME_OVER_UNLOCK_PREVIEW_LIMIT) * GAME_OVER_UNLOCK_ROW_HEIGHT);
    const sources = unlockEvents.map((event) => event.imageSource).filter(Boolean);
    Promise.all(sources.map((source) => Image.loadAsync(source).catch(() => null))).then(() => {
      if (!isCancelled) setImagesReady(true);
    });

    const xpAnimation = new RNAnimated.Value(startTotal);
    xpAnimationRef.current = xpAnimation;
    let lastRenderedXp = startTotal;
    const xpListenerId = xpAnimation.addListener(({ value }) => {
      if (isCancelled) return;
      const nextTotal = Math.min(endTotal, Math.max(startTotal, Math.floor(value + 0.0001)));
      if (nextTotal === lastRenderedXp) return;
      lastRenderedXp = nextTotal;
      const nextProgress = getLevelProgress(nextTotal);
      setDisplayedTotalXp(nextTotal);
      xpFill.setValue(nextProgress.percentage);
    });
    xpListenerIdRef.current = xpListenerId;

    const revealUnlocks = () => {
      if (isCancelled) return;
      setShowUnlocks(true);
      rewardOpacity.setValue(0);
      rewardTranslateY.setValue(16);
      rewardScale.setValue(0.97);
      RNAnimated.parallel([
        RNAnimated.timing(rewardOpacity, {
          toValue: 1,
          duration: 260,
          easing: GAME_OVER_REWARD_EASING,
          useNativeDriver: true,
        }),
        RNAnimated.timing(rewardTranslateY, {
          toValue: 0,
          duration: 300,
          easing: GAME_OVER_REWARD_EASING,
          useNativeDriver: true,
        }),
        RNAnimated.spring(rewardScale, {
          toValue: 1,
          friction: 8,
          tension: 110,
          useNativeDriver: true,
        }),
      ]).start();
      chipAnims.forEach((value, index) => {
        RNAnimated.timing(value, {
          toValue: 1,
          duration: reduceMotion ? 80 : 180,
          delay: reduceMotion ? 0 : index * 75,
          easing: GAME_OVER_REWARD_EASING,
          useNativeDriver: true,
        }).start();
      });
      unlockAnims.forEach((value, index) => {
        RNAnimated.sequence([
          RNAnimated.delay(reduceMotion ? 0 : 180 + index * GAME_OVER_REWARD_TIMING.unlockStagger),
          RNAnimated.spring(value, {
            toValue: 1,
            friction: 6,
            tension: 125,
            useNativeDriver: true,
          }),
        ]).start();
      });
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

      const visibleUnlockCount = Math.min(totalUnlockCount, GAME_OVER_UNLOCK_PREVIEW_LIMIT);
      const finishDelay = reduceMotion
        ? 180
        : 180 + Math.max(0, visibleUnlockCount - 1) * GAME_OVER_REWARD_TIMING.unlockStagger + GAME_OVER_REWARD_TIMING.unlockSettle;
      timers.push(setTimeout(() => {
        if (!isCancelled) onFinishedRef.current?.();
      }, finishDelay));
    };

    const showLevelUp = (level) => {
      setLevelUpLevel(level);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      levelUpOpacity.stopAnimation();
      levelUpOpacity.setValue(1);
      RNAnimated.timing(levelUpOpacity, {
        toValue: 0,
        duration: reduceMotion ? 100 : 700,
        delay: reduceMotion ? 0 : 420,
        useNativeDriver: true,
      }).start();
    };

    const levelBoundaries = [];
    let boundaryCursor = startTotal;
    while (getLevelProgress(boundaryCursor).nextLevelTotalXP <= endTotal) {
      const boundary = getLevelProgress(boundaryCursor).nextLevelTotalXP;
      levelBoundaries.push(boundary);
      boundaryCursor = boundary;
    }
    const animationDistance = Math.max(1, endTotal - startTotal);
    const segmentTargets = [...levelBoundaries, endTotal];

    const animateSegment = (index, fromTotal) => {
      if (isCancelled) return;
      if (index >= segmentTargets.length || fromTotal >= endTotal) {
        setDisplayedTotalXp(endTotal);
        xpFill.setValue(getLevelProgress(endTotal).percentage);
        revealUnlocks();
        return;
      }

      const rawTarget = segmentTargets[index];
      const crossesLevel = levelBoundaries.includes(rawTarget);
      const animationTarget = crossesLevel ? rawTarget - 0.001 : rawTarget;
      const segmentDistance = Math.max(0, rawTarget - fromTotal);
      const segmentDuration = reduceMotion
        ? 80
        : Math.max(180, Math.round(GAME_OVER_REWARD_TIMING.xp * (segmentDistance / animationDistance)));

      xpAnimation.setValue(fromTotal);
      const animation = RNAnimated.timing(xpAnimation, {
        toValue: animationTarget,
        duration: segmentDuration,
        easing: GAME_OVER_REWARD_EASING,
        useNativeDriver: false,
      });
      animation.start(({ finished }) => {
        if (!finished || isCancelled) return;
        if (!crossesLevel) {
          setDisplayedTotalXp(endTotal);
          xpFill.setValue(getLevelProgress(endTotal).percentage);
          revealUnlocks();
          return;
        }

        xpFill.setValue(100);
        const nextLevel = getLevelProgress(rawTarget).level;
        showLevelUp(nextLevel);
        const pauseTimer = setTimeout(() => {
          if (isCancelled) return;
          setDisplayedTotalXp(rawTarget);
          xpFill.setValue(0);
          animateSegment(index + 1, rawTarget);
        }, reduceMotion ? 40 : GAME_OVER_REWARD_TIMING.levelPause);
        timers.push(pauseTimer);
      });
    };

    if (endTotal <= startTotal) {
      const noXpTimer = setTimeout(revealUnlocks, reduceMotion ? 60 : 180);
      timers.push(noXpTimer);
    } else {
      animateSegment(0, startTotal);
    }
    rewardTimersRef.current = timers;

    return () => {
      isCancelled = true;
      xpAnimation.stopAnimation();
      xpAnimation.removeListener(xpListenerId);
      timers.forEach((timerId) => clearTimeout(timerId));
      if (xpAnimationRef.current === xpAnimation) xpAnimationRef.current = null;
      if (xpListenerIdRef.current === xpListenerId) xpListenerIdRef.current = null;
      if (rewardTimersRef.current === timers) rewardTimersRef.current = [];
    };
  }, [
    rewardOpacity,
    rewardScale,
    rewardTranslateY,
    endTotal,
    levelUpOpacity,
    listHeight,
    chipAnims,
    reduceMotion,
    startTotal,
    totalUnlockCount,
    unlockEvents,
    unlockAnims,
    visible,
    xpFill,
  ]);

  if (!visible) return null;

  const renderUnlockTile = ({ item: event, index }) => {
    const isBreed = event.type === 'breed';
    const entryAnim = unlockAnims[index] || rewardOpacity;
    const tier = Number(breedTiers[event.breedId]) || 1;
    const rarityColor = ['#E8A447', '#6FAE78', '#5B8DEF', '#9B6AD6', '#D39B2A'][Math.min(4, Math.max(0, tier - 1))];
    return (
    <RNAnimated.View
      style={[
        quizStyles.gameOverUnlockTile,
        isBreed ? quizStyles.gameOverBreedUnlockTile : quizStyles.gameOverCoatUnlockTile,
        { borderLeftWidth: 3, borderLeftColor: rarityColor },
        {
          opacity: entryAnim,
          transform: [
            { translateY: entryAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
            { scale: entryAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1], extrapolate: 'extend' }) },
          ],
        },
      ]}
    >
      <View style={[quizStyles.gameOverUnlockImageWrap, isBreed && quizStyles.gameOverBreedImageWrap]}>
        {event.imageSource ? (
          <Image source={event.imageSource} style={quizStyles.gameOverUnlockImage} contentFit="cover" />
        ) : (
          <MaterialIcons name={event.type === 'level' ? 'military-tech' : 'pets'} size={24} color="#FFFFFF" />
        )}
      </View>
      <View style={quizStyles.gameOverUnlockCopy}>
        <ThemedText style={[quizStyles.gameOverUnlockTitle, isBreed && quizStyles.gameOverBreedUnlockTitle]}>
          {isBreed ? 'New Breed Discovered!' : 'New Coat Unlocked!'}
        </ThemedText>
        <ThemedText numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.72} style={quizStyles.gameOverUnlockName}>
          {event.name}
        </ThemedText>
      </View>
      {isBreed ? (
        <View pointerEvents="none" style={quizStyles.gameOverBreedSparkles}>
          <MaterialIcons name="auto-awesome" size={14} color={DoggyDexTheme.colors.gold} />
        </View>
      ) : null}
    </RNAnimated.View>
    );
  };

  const renderRewardChips = () => {
    const chips = [
      earnedXp > 0 ? { icon: 'stars', text: `+${earnedXp} XP` } : null,
      score > 0 ? { icon: 'check-circle', text: `${score} correct ${score === 1 ? 'answer' : 'answers'}` } : null,
      breedCount > 0 ? { icon: 'pets', text: `${breedCount} ${breedCount === 1 ? 'Breed' : 'Breeds'} Discovered` } : null,
      coatCount > 0 ? { icon: 'palette', text: `${coatCount} ${coatCount === 1 ? 'Coat' : 'Coats'} Unlocked` } : null,
    ].filter(Boolean);
    return (
    <View style={quizStyles.gameOverRewardChips}>
      {chips.map((chip, index) => (
        <RNAnimated.View
          key={chip.text}
          style={[
            quizStyles.gameOverRewardChip,
            {
              opacity: chipAnims[index],
              transform: [{ scale: chipAnims[index].interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
            },
          ]}
        >
          <MaterialIcons name={chip.icon} size={14} color={DoggyDexTheme.colors.primary} />
          <ThemedText style={quizStyles.gameOverRewardChipText}>{chip.text}</ThemedText>
        </RNAnimated.View>
      ))}
    </View>
    );
  };

  const collapsedHeight = Math.min(totalUnlockCount, GAME_OVER_UNLOCK_PREVIEW_LIMIT) * GAME_OVER_UNLOCK_ROW_HEIGHT;
  const expandedHeight = Math.min(totalUnlockCount * GAME_OVER_UNLOCK_ROW_HEIGHT, GAME_OVER_UNLOCK_MAX_HEIGHT);

  const toggleExpanded = () => {
    const nextExpanded = !isExpanded;
    setIsExpanded(nextExpanded);
    RNAnimated.timing(listHeight, {
      toValue: nextExpanded ? expandedHeight : collapsedHeight,
      duration: reduceMotion ? 80 : 240,
      easing: GAME_OVER_REWARD_EASING,
      useNativeDriver: false,
    }).start();
  };

  const xpWidth = xpFill.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={quizStyles.gameOverRewardFlow}>
      <View style={quizStyles.gameOverXpMini}>
        <View style={quizStyles.gameOverXpHeader}>
          <ThemedText style={quizStyles.gameOverLevelPill}>Trainer Level {displayedProgress.level}</ThemedText>
          {levelUpLevel ? (
            <RNAnimated.View style={{ opacity: levelUpOpacity }}>
              <ThemedText accessibilityLiveRegion="assertive" style={quizStyles.gameOverLevelUp}>Level Up! Level {levelUpLevel}</ThemedText>
            </RNAnimated.View>
          ) : null}
        </View>
        <View style={quizStyles.gameOverXpMetaRow}>
          <ThemedText style={quizStyles.gameOverMiniLabel}>Trainer Progress</ThemedText>
          <View style={quizStyles.gameOverXpTotals}>
            <ThemedText style={quizStyles.gameOverXpTotal}>{displayedTotalXp} XP total</ThemedText>
            <ThemedText style={quizStyles.gameOverXpValue}>+{Math.max(0, displayedTotalXp - startTotal)} XP</ThemedText>
          </View>
        </View>
        <View style={quizStyles.gameOverXpTrack}>
          <RNAnimated.View style={[quizStyles.gameOverXpFill, { width: xpWidth }]} />
        </View>
        <ThemedText style={quizStyles.gameOverXpSub}>
          {displayedProgress.currentLevelXP} / {displayedProgress.xpForNextLevel} XP
        </ThemedText>
      </View>

      {showUnlocks ? (
        totalUnlockCount <= 0 ? (
          <RNAnimated.View
            style={[
              quizStyles.gameOverRewardEmpty,
              { opacity: rewardOpacity, transform: [{ translateY: rewardTranslateY }, { scale: rewardScale }] },
            ]}
          >
            <MaterialIcons name="stars" size={20} color={DoggyDexTheme.colors.gold} />
            <ThemedText style={quizStyles.gameOverRewardEmptyText}>Great run! Keep training to unlock more.</ThemedText>
          </RNAnimated.View>
        ) : (
          <RNAnimated.View
            style={[
              quizStyles.gameOverSummaryCard,
              { opacity: rewardOpacity, transform: [{ translateY: rewardTranslateY }, { scale: rewardScale }] },
            ]}
          >
            <ThemedText style={quizStyles.gameOverSummaryTitle}>{runMessage}</ThemedText>
            {renderRewardChips()}
            <RNAnimated.View style={[quizStyles.gameOverUnlockViewport, { height: listHeight }]}>
              <FlatList
                data={isExpanded ? unlockEvents : previewEvents}
                renderItem={renderUnlockTile}
                keyExtractor={(item, index) => String(item.id || `${item.type}-${index}`)}
                ItemSeparatorComponent={() => <View style={quizStyles.gameOverUnlockSeparator} />}
                scrollEnabled={isExpanded && totalUnlockCount > GAME_OVER_UNLOCK_PREVIEW_LIMIT}
                nestedScrollEnabled={false}
                showsVerticalScrollIndicator={isExpanded}
                persistentScrollbar={isExpanded}
                initialNumToRender={GAME_OVER_UNLOCK_PREVIEW_LIMIT}
                maxToRenderPerBatch={6}
                windowSize={5}
                removeClippedSubviews={Platform.OS === 'android'}
              />
            </RNAnimated.View>
            {moreCount > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isExpanded ? 'Show fewer unlocks' : `Show ${moreCount} more unlocks`}
                onPress={toggleExpanded}
                style={({ pressed }) => [quizStyles.gameOverMoreButton, pressed && quizStyles.gameOverMoreButtonPressed]}
              >
                <ThemedText style={quizStyles.gameOverMoreText}>
                  {isExpanded ? 'Show less' : `Show ${moreCount} more`}
                </ThemedText>
                <MaterialIcons name={isExpanded ? 'expand-less' : 'expand-more'} size={17} color={DoggyDexTheme.colors.primary} />
              </Pressable>
            ) : null}
          </RNAnimated.View>
        )
      ) : null}

      {!imagesReady && unlockEvents.length > 0 ? (
        <ThemedText style={quizStyles.gameOverPreloadText}>Preparing reward images...</ThemedText>
      ) : null}
    </View>
  );
}

export default function QuizScreen() {
  const router = useRouter();
  const [timerPaused, setTimerPaused] = useState(false);
  // Track auth state as a single object
  const [authState, setAuthState] = useState({ checked: false, user: null });
    // For fading in score, best streak, and high score after score
    const [showHighScore, setShowHighScore] = useState(false);
    const scoreOpacity = useRef(new RNAnimated.Value(0)).current;
    const bestStreakOpacity = useRef(new RNAnimated.Value(0)).current;
    // Score scale animation
    const scoreScale = useRef(new RNAnimated.Value(0.7)).current;
    const highScoreOpacity = useRef(new RNAnimated.Value(0)).current;
    const highScoreScale = useRef(new RNAnimated.Value(0.94)).current;
    const buttonsOpacity = useRef(new RNAnimated.Value(0)).current;
    const modalOpacity = useRef(new RNAnimated.Value(0)).current;
    const modalTranslateY = useRef(new RNAnimated.Value(14)).current;
    const gameOverSequenceTimeoutsRef = useRef([]);
    const gameOverScoreCounterRef = useRef(null);
    const gameOverScoreListenerRef = useRef(null);
    const [displayedFinalScore, setDisplayedFinalScore] = useState(0);
      // Track best streak
      const [bestStreak, setBestStreak] = useState(0);
      const [currentStreak, setCurrentStreak] = useState(0);
    // High score state
    const [highScore, setHighScore] = useState(null);
    const [isNewHighScore, setIsNewHighScore] = useState(false);
    const [sessionXpEarned, setSessionXpEarned] = useState(0);
    const [sessionXpRange, setSessionXpRange] = useState({ startTotalXP: 0, endTotalXP: 0 });
    const [sessionRewardEvents, setSessionRewardEvents] = useState([]);
    const [gameOverRewardVisible, setGameOverRewardVisible] = useState(false);
    const [gameOverActionsReady, setGameOverActionsReady] = useState(false);
    const [gameOverSkipSignal, setGameOverSkipSignal] = useState(0);
    const [gameOverReduceMotion, setGameOverReduceMotion] = useState(false);
    // Game over modal state
    const [showGameOver, setShowGameOver] = useState(false);
    // Out of Lives modal scale animation
    const modalScale = useRef(new RNAnimated.Value(0.92)).current;
    useEffect(() => {
      AccessibilityInfo.isReduceMotionEnabled().then(setGameOverReduceMotion);
      const subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setGameOverReduceMotion);
      return () => subscription?.remove?.();
    }, []);
    // Ensure storageVariantMap is defined before any use
    const [storageVariantMap, setStorageVariantMap] = useState({});
    const decoyVariants = LOCAL_DECOY_VARIANTS;
    const [catalogCoatIdsByBreed, setCatalogCoatIdsByBreed] = useState({});
    // Inject shake keyframes for web (only once)
    useEffect(() => {
      if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        if (!document.getElementById('shake-heart-keyframes')) {
          const style = document.createElement('style');
          style.id = 'shake-heart-keyframes';
          style.innerHTML = `@keyframes shakeHeart {
            10%, 90% { transform: translateX(-2px); }
            20%, 80% { transform: translateX(4px); }
            30%, 50%, 70% { transform: translateX(-6px); }
            40%, 60% { transform: translateX(6px); }
          }`;
          document.head.appendChild(style);
        }
      }
    }, []);
  // Animation state for dog grid slide transition
  const [transitioning, setTransitioning] = useState(false);
  const [pendingNext, setPendingNext] = useState(false);
  const skipNextCardEntranceRef = useRef(false);
  const gridSlideX = useSharedValue(0); // 0=center, -80=slide left, +80=slide right
  const gridOpacity = useSharedValue(1);
  const gridAnimating = useRef(false);

  // Animated style for the dog card grid
  const dogGridStyle = useAnimatedStyle(() => {
    const scale = 1 - 0.04 * (1 - gridOpacity.value);
    const style = {
      transform: [
        { translateX: gridSlideX.value },
        { scale },
      ],
      opacity: gridOpacity.value,
    };
    // Blur removed: dog images should always be sharp
    return style;
  });
    const [timer, setTimer] = useState(30);
    const [pulse, setPulse] = useState(false);
    const [showExitConfirm, setShowExitConfirm] = useState(false);
    const [isLeavingToHome, setIsLeavingToHome] = useState(false);
    const [showPlusOne, setShowPlusOne] = useState(false);
    const [plusOneStyle, setPlusOneStyle] = useState({});
    const [plusOnePulse, setPlusOnePulse] = useState(false);
    const plusOneMobileOpacity = useRef(new RNAnimated.Value(0)).current;
    const plusOneMobileTranslateX = useRef(new RNAnimated.Value(0)).current;
    const plusOneMobileTranslateY = useRef(new RNAnimated.Value(0)).current;
    const plusOneMobileScale = useRef(new RNAnimated.Value(1)).current;
    // For orange pulse
    const DOGGYDEX_ORANGE = '#FF9F1C';
    const DOGGYDEX_ORANGE_DARK = '#e07c00';
    const scorePulseAnim = useRef(new RNAnimated.Value(0)).current;
    const plusOneAnimRef = useRef({});


    // Track which card to blur when timer hits 0
    const [blurredCardId, setBlurredCardId] = useState(null);
  // Time's Up feedback state
  const [showTimesUp, setShowTimesUp] = useState(false);
  const timesUpAnim = useRef(new RNAnimated.Value(0)).current;
  const [wrongAnimatedCardId, setWrongAnimatedCardId] = useState(null);
  const [wrongToast, setWrongToast] = useState(null);
  const wrongShakeX = useRef(new RNAnimated.Value(0)).current;
  const wrongBorderOpacity = useRef(new RNAnimated.Value(0)).current;
  const quizEntranceOpacity = useRef(new RNAnimated.Value(0)).current;
  const quizEntranceTranslateY = useRef(new RNAnimated.Value(18)).current;
  const hasShownInitialQuestionRef = useRef(false);
  const cardEntranceAnims = useRef(
    Array.from({ length: MIN_BREEDS_PER_QUESTION }, () => ({
      opacity: new RNAnimated.Value(0),
      translateY: new RNAnimated.Value(14),
    }))
  ).current;

    // Ensure questionIndex is defined before any use
  const [questionIndex, setQuestionIndex] = useState(0);

    // Ensure storageVariantMap is defined before any use
    // Duplicate declaration removed

    useEffect(() => {
      if (timer <= 0 || timerPaused) return;
      const interval = setInterval(() => {
        setTimer((prev) => (prev > 0 ? prev - 1 : 0));
        setPulse((p) => !p);
      }, 1000);
      return () => clearInterval(interval);
    }, [timer, timerPaused]);

    useEffect(() => {
      if (timer === 0) setCurrentStreak(0);
    }, [timer]);

    // ...existing code...
    // ...existing code...

    // Track last 10 breeds to prevent repeats
    const recentBreedsRef = useRef([]);

    // Move pickRandomCoatForBreed above useMemo
    const pickRandomCoatForBreed = useCallback((breed, previousTargetUri = null) => {
      const variants = storageVariantMap[breed] || [];
      if (!variants.length) {
        return null;
      }

      const pickedVariant = weightedPick(variants, () => 1);
      if (!pickedVariant) {
        return null;
      }
      
      const chosenUri = pickImageUri(pickedVariant, previousTargetUri);
      return { ...pickedVariant, uri: chosenUri };
    }, [storageVariantMap]);

    const buildQuestion = useCallback(({ commitRecent = false } = {}) => {
      // Generate quiz choices and pick a target
      const breedKeys = Object.keys(storageVariantMap).filter(Boolean);
      if (breedKeys.length < MIN_BREEDS_PER_QUESTION) {
        return { choices: [], targetIndex: -1 };
      }

      // Prevent breed repeats: exclude breeds in recentBreedsRef
      const availableBreeds = breedKeys.filter(
        (b) => !recentBreedsRef.current.includes(b)
      );
      // If not enough, allow repeats
      const pickFrom = availableBreeds.length >= MIN_BREEDS_PER_QUESTION
        ? availableBreeds
        : breedKeys;

      // Pick a real breed as the target. Decoys behave as the coat variants of
      // one pseudo-breed, so that pseudo-breed has the same distractor odds as
      // any individual real breed and can never become the correct answer.
      const targetBreed = shuffle(pickFrom)[0];
      const targetVariant = pickRandomCoatForBreed(targetBreed);
      if (!targetVariant) {
        return { choices: [], targetIndex: -1 };
      }

      const targetChoice = {
        ...targetVariant,
        breed: targetBreed,
        id: targetVariant.id || `${targetBreed}_target`,
        coat_id: targetVariant.coat_id,
      };
      const distractorBreedPool = breedKeys.filter((breed) => breed !== targetBreed);
      if (decoyVariants.length) {
        distractorBreedPool.push(DECOY_BREED_KEY);
      }

      const pickedDistractorBreeds = shuffle(distractorBreedPool)
        .slice(0, MIN_BREEDS_PER_QUESTION - 1);
      const distractors = pickedDistractorBreeds.map((breed, index) => {
        if (breed === DECOY_BREED_KEY) {
          return decoyVariants[Math.floor(Math.random() * decoyVariants.length)];
        }

        const variant = pickRandomCoatForBreed(breed);
        if (!variant) return null;
        return {
          ...variant,
          breed,
          id: variant.id || `${breed}_distractor_${index}`,
          coat_id: variant.coat_id,
        };
      }).filter(Boolean);

      if (distractors.length < MIN_BREEDS_PER_QUESTION - 1) {
        return { choices: [], targetIndex: -1 };
      }

      const targetIdx = Math.floor(Math.random() * MIN_BREEDS_PER_QUESTION);
      const choices = [...distractors];
      choices.splice(targetIdx, 0, targetChoice);

      // Update recent breeds
      if (commitRecent && targetBreed) {
        recentBreedsRef.current = [
          ...recentBreedsRef.current.slice(-9),
          targetBreed,
        ];
      }

      return { choices, targetIndex: targetIdx, targetBreed };
    }, [decoyVariants, pickRandomCoatForBreed, storageVariantMap]);

    const [activeQuestion, setActiveQuestion] = useState({ choices: [], targetIndex: -1 });
    const preparedNextQuestionRef = useRef(null);

    useEffect(() => {
      if (activeQuestion.choices.length || Object.keys(storageVariantMap).length < MIN_BREEDS_PER_QUESTION) {
        return;
      }

      setActiveQuestion(buildQuestion({ commitRecent: true }));
    }, [activeQuestion.choices.length, buildQuestion, storageVariantMap]);

    const { choices, targetIndex } = activeQuestion || { choices: [], targetIndex: -1 };

    const prepareNextQuestion = useCallback(async () => {
      const nextQuestion = buildQuestion({ commitRecent: true });
      if (!nextQuestion.choices.length) {
        preparedNextQuestionRef.current = nextQuestion;
        return nextQuestion;
      }

      const preloadedQuestion = await preloadQuestionImages(nextQuestion);
      preparedNextQuestionRef.current = preloadedQuestion;
      return preloadedQuestion;
    }, [buildQuestion]);

    // When timer hits 0, only show Time's Up feedback and handle heart/lives logic (no photo blurring)
    useEffect(() => {
      if (
        typeof choices !== 'undefined' &&
        Array.isArray(choices) &&
        choices.length > 0 &&
        typeof targetIndex === 'number' &&
        targetIndex >= 0
      ) {
        if (timer === 0) {
          // Show Time's Up feedback
          setShowTimesUp(true);
          timesUpAnim.setValue(0);
          RNAnimated.parallel([
            RNAnimated.timing(timesUpAnim, {
              toValue: 1,
              duration: 500,
              useNativeDriver: false,
            }),
          ]).start();
          setTimeout(() => {
            RNAnimated.timing(timesUpAnim, {
              toValue: 0,
              duration: 1600,
              useNativeDriver: false,
            }).start(() => setShowTimesUp(false));
            // Remove a heart with animation if timer runs out and lives remain (after Time's Up)
            setTimeout(() => {
              setLives((currentLives) => {
                if (currentLives <= 0) {
                  return 0;
                }

                const heartToLoseIndex = currentLives - 1;
                setHeartPulse(heartToLoseIndex); // pulse the heart that will be lost
                setHeartPulseColor('#FF0000');

                if (currentLives === 1) {
                  setTimeout(() => {
                    setHeartPulse(null);
                    setHeartPulseColor(null);
                  }, 500);
                } else {
                  setTimeout(() => setHeartPulseColor('#8B0000'), 400);
                  setTimeout(() => {
                    setHeartPulse(null);
                    setHeartPulseColor(null);
                  }, 900);
                }

                setTimeout(() => {
                  setTimer(30); // Reset timer after heart is removed (now delayed by 1.5s)
                }, 1050);

                return Math.max(0, currentLives - 1);
              });
            }, 700); // Increased delay after Time's Up fades out
          }, 1600);
        }
      }
    }, [timer, choices, targetIndex]);
  // (moved above)
  const [score, setScore] = useState(0);
  // Track selected correct card, and wrong guesses
  const [selected, setSelected] = useState(null); // selected correct card
  const [wrongGuesses, setWrongGuesses] = useState([]); // array of dog ids guessed wrong

  // Clear wrongGuesses at the beginning of each new question
  useEffect(() => {
    setWrongGuesses([]);
    setFailedImageIds({});
    // Log userUnlocks state after every question
  }, [questionIndex]);

  // Update streaks on answer
  useEffect(() => {
    if (!selected) return;
    if (selected.id === choices[targetIndex]?.id) {
      setCurrentStreak((s) => {
        const newStreak = s + 1;
        setBestStreak((b) => Math.max(b, newStreak));
        return newStreak;
      });
    } else {
      setCurrentStreak(0);
    }
  }, [selected]);

  // Reset streaks on new game
  useEffect(() => {
    if (!showGameOver) {
      setCurrentStreak(0);
      setBestStreak(0);
    }
  }, [showGameOver]);
  const [newUnlock, setNewUnlock] = useState(null);
  const [newCoatActuallyUnlocked, setNewCoatActuallyUnlocked] = useState(false);
  // Remove unlock banner state
  // const [showNewCoatUnlocked, setShowNewCoatUnlocked] = useState(false);
  // Remove global reward animation state
  const [progressionReward, setProgressionReward] = useState(null);
  const progressionRewardTimeoutRef = useRef(null);
  const progressionRewardDelayRef = useRef(null);
  const progressionRewardSequenceTimeoutsRef = useRef([]);
  const quizFeedbackTimeoutsRef = useRef([]);
  const unlockToastOpacity = useRef(new RNAnimated.Value(0)).current;
  const unlockToastTranslateY = useRef(new RNAnimated.Value(24)).current;
  const unlockToastScale = useRef(new RNAnimated.Value(0.95)).current;
  const [localQuizSyncNotice, setLocalQuizSyncNotice] = useState(null);
  const [localQuizNotice, setLocalQuizNotice] = useState(null);
  const [isLocalQuizLoading, setIsLocalQuizLoading] = useState(true);
  const [missingLocalImageNotice, setMissingLocalImageNotice] = useState(null);
  // Duplicate declaration removed
  const [lives, setLives] = useState(3);
  const [heartPulse, setHeartPulse] = useState(null); // index of heart to pulse
  const [heartPulseColor, setHeartPulseColor] = useState(null); // color for pulsing heart
  const heartShakeX = useRef(new RNAnimated.Value(0)).current;
  const [failedImageIds, setFailedImageIds] = useState({});
  const lastTargetImageUriRef = useRef(null);
  const dailyQuizBonusHandledRef = useRef(false);

  useEffect(() => {
    if (heartPulse == null) {
      heartShakeX.setValue(0);
      return undefined;
    }

    heartShakeX.stopAnimation();
    heartShakeX.setValue(0);
    RNAnimated.sequence([
      RNAnimated.timing(heartShakeX, { toValue: -5, duration: 28, useNativeDriver: true }),
      RNAnimated.timing(heartShakeX, { toValue: 6, duration: 32, useNativeDriver: true }),
      RNAnimated.timing(heartShakeX, { toValue: -4, duration: 28, useNativeDriver: true }),
      RNAnimated.timing(heartShakeX, { toValue: 4, duration: 28, useNativeDriver: true }),
      RNAnimated.timing(heartShakeX, { toValue: 0, duration: 34, useNativeDriver: true }),
    ]).start();

    return () => {
      heartShakeX.stopAnimation();
      heartShakeX.setValue(0);
    };
  }, [heartPulse, heartShakeX]);

  const addSessionProgressReward = useCallback((reward, rewardEvents = []) => {
    const xpAwarded = Math.max(0, Number(reward?.xpAwarded) || 0);
    const endTotalXP = Math.max(0, Number(reward?.totalXP) || 0);
    const startTotalXP = Math.max(0, endTotalXP - xpAwarded);

    setSessionXpEarned((earned) => earned + xpAwarded);
    setSessionXpRange((range) => ({
      startTotalXP: range.endTotalXP > 0 || range.startTotalXP > 0
        ? range.startTotalXP
        : startTotalXP,
      endTotalXP: Math.max(range.endTotalXP || 0, endTotalXP),
    }));

    if (rewardEvents.length) {
      setSessionRewardEvents((currentEvents) => [...currentEvents, ...rewardEvents]);
    }
  }, []);

  const finishGameOverRewardFlow = useCallback(() => {
    setGameOverActionsReady((isReady) => {
      if (isReady) return isReady;
      RNAnimated.timing(buttonsOpacity, {
        toValue: 1,
        duration: gameOverReduceMotion ? 100 : 320,
        easing: GAME_OVER_REWARD_EASING,
        useNativeDriver: true,
      }).start();
      return true;
    });
  }, [buttonsOpacity, gameOverReduceMotion]);

  const completeGameOverReveal = useCallback(() => {
    if (!showGameOver || gameOverActionsReady) return;
    gameOverSequenceTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    gameOverSequenceTimeoutsRef.current = [];
    gameOverScoreCounterRef.current?.stopAnimation();
    if (gameOverScoreCounterRef.current && gameOverScoreListenerRef.current != null) {
      gameOverScoreCounterRef.current.removeListener(gameOverScoreListenerRef.current);
    }
    gameOverScoreCounterRef.current = null;
    gameOverScoreListenerRef.current = null;
    scoreOpacity.setValue(1);
    scoreScale.setValue(1);
    bestStreakOpacity.setValue(1);
    highScoreOpacity.setValue(1);
    highScoreScale.setValue(1);
    buttonsOpacity.setValue(1);
    setDisplayedFinalScore(score);
    setShowHighScore(true);
    setGameOverRewardVisible(true);
    setGameOverActionsReady(true);
    setGameOverSkipSignal((value) => value + 1);
  }, [bestStreakOpacity, buttonsOpacity, gameOverActionsReady, highScoreOpacity, highScoreScale, score, scoreOpacity, scoreScale, showGameOver]);

  const viewDoggyDexRewards = useCallback(() => {
    const highlights = sessionRewardEvents
      .filter((event) => event.type === 'breed' || event.type === 'coat')
      .slice(-32)
      .map((event) => ({
        type: event.type,
        breedId: event.breedId,
        coatId: event.coatId,
      }));

    router.push({
      pathname: '/doggydex',
      params: {
        rewardHighlights: JSON.stringify(highlights),
      },
    });
  }, [router, sessionRewardEvents]);

  const showProgressionReward = useCallback((reward, duration, delay = 280) => {
    if (progressionRewardTimeoutRef.current) {
      clearTimeout(progressionRewardTimeoutRef.current);
      progressionRewardTimeoutRef.current = null;
    }
    if (progressionRewardDelayRef.current) {
      clearTimeout(progressionRewardDelayRef.current);
      progressionRewardDelayRef.current = null;
    }
    progressionRewardSequenceTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    progressionRewardSequenceTimeoutsRef.current = [];

    const hasNewCoat = Array.isArray(reward?.newlyUnlockedCoats) && reward.newlyUnlockedCoats.length > 0;
    const rewardSequence = [
      ...(reward?.isNewBreed ? [{ ...reward, rewardKind: 'breed' }] : []),
      ...(hasNewCoat ? [{ ...reward, rewardKind: 'coat', isNewBreed: false }] : []),
    ];

    if (!rewardSequence.length) {
      setProgressionReward(null);
      unlockToastOpacity.setValue(0);
      unlockToastTranslateY.setValue(24);
      unlockToastScale.setValue(0.95);
      return;
    }

    const playRewardFeedback = (nextReward, visibleDuration) => {
      const isBreedUnlock = getUnlockRewardType(nextReward) === 'breed';
      const startTranslateY = isBreedUnlock ? 34 : 24;
      const startScale = isBreedUnlock ? 0.9 : 0.95;
      progressionRewardDelayRef.current = null;
      setProgressionReward(nextReward);
      unlockToastOpacity.setValue(0);
      unlockToastTranslateY.setValue(startTranslateY);
      unlockToastScale.setValue(startScale);
      RNAnimated.parallel([
        RNAnimated.timing(unlockToastOpacity, {
          toValue: 1,
          duration: isBreedUnlock ? 240 : 210,
          easing: RNEasing.out(RNEasing.cubic),
          useNativeDriver: true,
        }),
        RNAnimated.timing(unlockToastTranslateY, {
          toValue: 0,
          duration: isBreedUnlock ? 300 : 260,
          easing: RNEasing.out(RNEasing.cubic),
          useNativeDriver: true,
        }),
        RNAnimated.sequence([
          RNAnimated.timing(unlockToastScale, {
            toValue: isBreedUnlock ? 1.04 : 1.025,
            duration: isBreedUnlock ? 210 : 180,
            easing: RNEasing.out(RNEasing.cubic),
            useNativeDriver: true,
          }),
          RNAnimated.spring(unlockToastScale, {
            toValue: 1,
            friction: 8,
            tension: 120,
            useNativeDriver: true,
          }),
        ]),
      ]).start();

      progressionRewardTimeoutRef.current = setTimeout(() => {
        RNAnimated.parallel([
          RNAnimated.timing(unlockToastOpacity, {
            toValue: 0,
            duration: 220,
            easing: RNEasing.in(RNEasing.cubic),
            useNativeDriver: true,
          }),
          RNAnimated.timing(unlockToastTranslateY, {
            toValue: isBreedUnlock ? 18 : 14,
            duration: 220,
            easing: RNEasing.in(RNEasing.cubic),
            useNativeDriver: true,
          }),
        ]).start(() => {
          setProgressionReward(null);
          progressionRewardTimeoutRef.current = null;
        });
      }, visibleDuration);
    };

    let nextDelay = delay;
    rewardSequence.forEach((nextReward, index) => {
      const isBreedUnlock = getUnlockRewardType(nextReward) === 'breed';
      const requestedDuration = typeof duration === 'number'
        ? duration
        : (isBreedUnlock ? 2350 : 2300);
      const visibleDuration = Math.min(2800, Math.max(900, requestedDuration));
      const timeoutId = setTimeout(() => {
        progressionRewardSequenceTimeoutsRef.current = progressionRewardSequenceTimeoutsRef.current
          .filter((storedTimeoutId) => storedTimeoutId !== timeoutId);
        playRewardFeedback(nextReward, visibleDuration);
      }, nextDelay);

      progressionRewardSequenceTimeoutsRef.current.push(timeoutId);
      nextDelay += visibleDuration + 520 + (index === 0 ? 180 : 0);
    });
  }, [unlockToastOpacity, unlockToastScale, unlockToastTranslateY]);

  useEffect(() => () => {
    if (progressionRewardTimeoutRef.current) {
      clearTimeout(progressionRewardTimeoutRef.current);
    }
    if (progressionRewardDelayRef.current) {
      clearTimeout(progressionRewardDelayRef.current);
    }
    progressionRewardSequenceTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    progressionRewardSequenceTimeoutsRef.current = [];
    gameOverSequenceTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    gameOverSequenceTimeoutsRef.current = [];
    quizFeedbackTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    quizFeedbackTimeoutsRef.current = [];
    scorePulseAnim.stopAnimation();
  }, [scorePulseAnim]);

  // Show game over modal when lives reach zero
  useEffect(() => {
    if (lives === 0) {
      setTimerPaused(true); // Pause the timer when out of lives
      // Reset opacities before showing modal
      scoreOpacity.setValue(0);
      bestStreakOpacity.setValue(0);
      highScoreOpacity.setValue(0);
      highScoreScale.setValue(0.94);
      buttonsOpacity.setValue(0);
      modalOpacity.setValue(0);
      modalTranslateY.setValue(14);
      setDisplayedFinalScore(0);
      setShowHighScore(false);
      setGameOverRewardVisible(false);
      setGameOverActionsReady(false);
      // On game over, check and update high score
      (async () => {
        const user = auth.currentUser;
        let prevHigh = 0;
        if (user) {
          if (!dailyQuizBonusHandledRef.current) {
            dailyQuizBonusHandledRef.current = true;
            try {
              const dailyReward = await awardDailyQuizCompletion(user.uid);
              if (dailyReward?.awarded) {
                const dailyEvents = dailyReward.didLevelUp
                  ? [{
                      id: `level-${dailyReward.level}-daily`,
                      type: 'level',
                      name: `Level ${dailyReward.level}`,
                      level: dailyReward.level,
                    }]
                  : [];
                addSessionProgressReward(dailyReward, dailyEvents);
                showProgressionReward({ ...dailyReward, dailyBonus: true }, 3200);
              }
            } catch (dailyBonusError) {
              console.warn('Failed to award daily quiz XP', dailyBonusError);
            }
          }

          const userRef = doc(db, 'users', user.uid);
          try {
            const snap = await getDoc(userRef);
            prevHigh = snap.exists() && typeof snap.data().highScore === 'number' ? snap.data().highScore : 0;
          } catch (e) {
            prevHigh = 0;
          }
          setHighScore(Math.max(prevHigh, score));
          if (score > prevHigh) {
            setIsNewHighScore(true);
            try {
              await setDoc(userRef, { highScore: score }, { merge: true });
            } catch (e) {
              // ignore
            }
          } else {
            setIsNewHighScore(false);
          }
        } else {
          setHighScore(0);
          setIsNewHighScore(false);
        }
        const scheduleGameOverStep = (callback, delay) => {
          const timeoutId = setTimeout(callback, delay);
          gameOverSequenceTimeoutsRef.current.push(timeoutId);
        };
        scheduleGameOverStep(() => {
          setShowGameOver(true);
          setGameOverActionsReady(false);
          buttonsOpacity.setValue(0);
          modalScale.setValue(gameOverReduceMotion ? 1 : 0.98);
          modalOpacity.setValue(0);
          modalTranslateY.setValue(gameOverReduceMotion ? 0 : 14);
          RNAnimated.parallel([
            RNAnimated.timing(modalOpacity, { toValue: 1, duration: gameOverReduceMotion ? 80 : 260, easing: GAME_OVER_REWARD_EASING, useNativeDriver: true }),
            RNAnimated.timing(modalTranslateY, { toValue: 0, duration: gameOverReduceMotion ? 80 : 300, easing: GAME_OVER_REWARD_EASING, useNativeDriver: true }),
            RNAnimated.timing(modalScale, { toValue: 1, duration: gameOverReduceMotion ? 80 : 300, easing: GAME_OVER_REWARD_EASING, useNativeDriver: true }),
          ]).start();
          const scoreCounter = new RNAnimated.Value(0);
          const listenerId = scoreCounter.addListener(({ value }) => setDisplayedFinalScore(Math.round(value)));
          gameOverScoreCounterRef.current = scoreCounter;
          gameOverScoreListenerRef.current = listenerId;
          scheduleGameOverStep(() => {
            scoreOpacity.setValue(1);
            RNAnimated.timing(scoreScale, { toValue: 1, duration: gameOverReduceMotion ? 80 : 280, easing: GAME_OVER_REWARD_EASING, useNativeDriver: true }).start();
            RNAnimated.timing(scoreCounter, { toValue: score, duration: gameOverReduceMotion ? 100 : 780, easing: GAME_OVER_REWARD_EASING, useNativeDriver: false })
              .start(({ finished }) => {
                scoreCounter.removeListener(listenerId);
                if (gameOverScoreCounterRef.current === scoreCounter) gameOverScoreCounterRef.current = null;
                if (gameOverScoreListenerRef.current === listenerId) gameOverScoreListenerRef.current = null;
                if (finished) setDisplayedFinalScore(score);
              });
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          }, gameOverReduceMotion ? 30 : 550);
          scheduleGameOverStep(() => {
            bestStreakOpacity.setValue(1);
            setShowHighScore(true);
            if (score > prevHigh && Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          }, gameOverReduceMotion ? 150 : 1360);
          scheduleGameOverStep(() => setGameOverRewardVisible(true), gameOverReduceMotion ? 220 : 1510);
        }, gameOverReduceMotion ? 0 : 20);
      })();
    }
  }, [addSessionProgressReward, bestStreakOpacity, buttonsOpacity, gameOverReduceMotion, highScoreOpacity, highScoreScale, lives, modalOpacity, modalScale, modalTranslateY, score, scoreOpacity, scoreScale, showProgressionReward]);

  // Animate high score fade-in when showHighScore becomes true
  useEffect(() => {
    if (showHighScore) {
      RNAnimated.parallel([
        RNAnimated.timing(highScoreOpacity, {
          toValue: 1,
          duration: gameOverReduceMotion ? 80 : 220,
          useNativeDriver: true,
        }),
        RNAnimated.sequence([
          RNAnimated.timing(highScoreScale, {
            toValue: isNewHighScore ? 1.04 : 1,
            duration: gameOverReduceMotion ? 80 : 180,
            easing: GAME_OVER_REWARD_EASING,
            useNativeDriver: true,
          }),
          RNAnimated.spring(highScoreScale, {
            toValue: 1,
            friction: 7,
            tension: 120,
            useNativeDriver: true,
          }),
        ]),
      ]).start();
    } else {
      highScoreOpacity.setValue(0);
      highScoreScale.setValue(0.94);
    }
  }, [gameOverReduceMotion, highScoreOpacity, highScoreScale, isNewHighScore, showHighScore]);

  // Listen for auth state changes and set local user state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthState((prev) => {
        const next = { checked: true, user };
        return next;
      });
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let isCancelled = false;

    async function loadStorageVariants() {
      setIsLocalQuizLoading(true);
      setLocalQuizNotice(null);
      setMissingLocalImageNotice(null);

      const [coatsSnapshot, breedsSnapshot] = await Promise.all([
        getDocs(firestoreCollection(db, 'coats')),
        getDocs(firestoreCollection(db, 'breeds')),
      ]);

      if (isCancelled) {
        return;
      }

      const breedNameById = new Map();
      breedsSnapshot.docs.forEach((breedDoc) => {
        const data = breedDoc.data() || {};
        const breedId = typeof data.breed_id === 'string' ? data.breed_id.trim() : breedDoc.id;
        const breedName = typeof data.breed_name === 'string' ? data.breed_name.trim() : '';

        if (breedId && breedName) {
          breedNameById.set(breedId, breedName);
        }
      });

      const coatsWithImageFiles = coatsSnapshot.docs
        .map((coatDoc) => {
          const data = coatDoc.data() || {};
          const breedId = typeof data.breed_id === 'string' ? data.breed_id.trim() : '';
          const imgFilename = typeof data.img_filename === 'string' ? data.img_filename.trim() : '';
          const imgTwoFilename = typeof data.img_two_filename === 'string' ? data.img_two_filename.trim() : '';
          const imageExists = !!data.image_exists;

          if (!breedId || !imgFilename || !imageExists) {
            return null;
          }

          const breedNameFromDoc = typeof data.breed_name === 'string' ? data.breed_name.trim() : '';
          const colorName = [data.color_name, data.coat_color, data.coat]
            .find((value) => typeof value === 'string' && value.trim())
            ?.trim() || '';
          const coatName = typeof data.coat_name === 'string' ? data.coat_name.trim() : '';
          const coatId = typeof data.coat_id === 'number' ? data.coat_id : undefined;

          const breedLabel = breedNameFromDoc || breedNameById.get(breedId) || toTitleCaseFromId(breedId);
          const coatLabel = colorName || coatName || coatDoc.id;

          return {
            id: coatDoc.id,
            breed: breedLabel,
            breedId,
            coat: coatLabel,
            imgFilename,
            imgTwoFilename,
            coat_id: coatId,
          };
        })
        .filter(Boolean);

      const missingLocalFilenames = new Set();

      const localBackedVariants = coatsWithImageFiles
        .map((variant) => {
          const primaryAsset = getLocalImgAsset(variant.imgFilename);
          if (!primaryAsset) {
            missingLocalFilenames.add(variant.imgFilename);
            return null;
          }

          const secondaryAsset = variant.imgTwoFilename
            ? getLocalImgAsset(variant.imgTwoFilename)
            : null;

          const images = [primaryAsset];
          if (secondaryAsset) {
            images.push(secondaryAsset);
          }

          return {
            ...variant,
            uri: primaryAsset,
            images,
          };
        })
        .filter(Boolean);

      if (isCancelled) {
        return;
      }

      const variantsByBreed = indexVariantsByBreed(localBackedVariants);
      setStorageVariantMap(variantsByBreed);

      const unlockableCoatsByBreed = {};
      Object.entries(variantsByBreed).forEach(([breedName, variants]) => {
        const breedId = variants[0]?.breedId;
        if (!breedId) return;
        unlockableCoatsByBreed[breedId] = [...variants]
          .sort((left, right) => (left.coat_id ?? Number.MAX_SAFE_INTEGER) - (right.coat_id ?? Number.MAX_SAFE_INTEGER))
          .map((variant) => variant.id);
      });
      setCatalogCoatIdsByBreed(unlockableCoatsByBreed);

      const availableBreeds = Object.keys(variantsByBreed);

      if (missingLocalFilenames.size > 0) {
        const missingList = [...missingLocalFilenames];
        const preview = missingList.slice(0, 8).join(', ');
        const suffix = missingList.length > 8 ? ` (+${missingList.length - 8} more)` : '';
        setMissingLocalImageNotice(`Missing local img files: ${preview}${suffix}`);
      }

      if (availableBreeds.length < MIN_BREEDS_PER_QUESTION) {
        setLocalQuizNotice(
          `Local quiz setup incomplete (${availableBreeds.length}/${MIN_BREEDS_PER_QUESTION} breeds ready from ${localBackedVariants.length} coats with bundled images).`
        );
      } else {
        setLocalQuizNotice(null);
      }

      setIsLocalQuizLoading(false);
    }

    loadStorageVariants().catch((error) => {
      console.warn('Failed to load quiz options from Firestore/local image map', error);
      if (isCancelled) {
        return;
      }

      setStorageVariantMap({});
      setCatalogCoatIdsByBreed({});
      const errorCode = typeof error?.code === 'string' ? error.code : null;
      setLocalQuizNotice(
        errorCode
          ? `Quiz setup failed (${errorCode}). Check coats.image_exists/img_filename and bundled img files.`
          : 'Quiz setup failed. Check coats.image_exists/img_filename and bundled img files.'
      );
      setIsLocalQuizLoading(false);
    });

    return () => {
      isCancelled = true;
    };
  }, []);

  // Track last 10 breeds to prevent repeats (already declared earlier)
  // const recentBreedsRef = useRef([]); // Removed duplicate

  const targetDog = targetIndex >= 0 ? choices[targetIndex] : null;

  useLayoutEffect(() => {
    if (!targetDog) return;

    // The loading splash already provides the route entrance. Reveal the first
    // complete question immediately so there is no second fade through an
    // empty or partially populated grid as the splash unmounts.
    if (!hasShownInitialQuestionRef.current) {
      hasShownInitialQuestionRef.current = true;
      quizEntranceOpacity.setValue(1);
      quizEntranceTranslateY.setValue(0);
      cardEntranceAnims.forEach((anim) => {
        anim.opacity.setValue(1);
        anim.translateY.setValue(0);
      });
      return;
    }

    if (skipNextCardEntranceRef.current) {
      skipNextCardEntranceRef.current = false;
      quizEntranceOpacity.setValue(1);
      quizEntranceTranslateY.setValue(0);
      cardEntranceAnims.forEach((anim) => {
        anim.opacity.setValue(1);
        anim.translateY.setValue(0);
      });
      return;
    }

    quizEntranceOpacity.setValue(0);
    quizEntranceTranslateY.setValue(18);
    cardEntranceAnims.forEach((anim) => {
      anim.opacity.setValue(0);
      anim.translateY.setValue(14);
    });

    RNAnimated.parallel([
      RNAnimated.timing(quizEntranceOpacity, {
        toValue: 1,
        duration: 230,
        easing: RNEasing.out(RNEasing.cubic),
        useNativeDriver: true,
      }),
      RNAnimated.timing(quizEntranceTranslateY, {
        toValue: 0,
        duration: 230,
        easing: RNEasing.out(RNEasing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    RNAnimated.stagger(
      26,
      cardEntranceAnims.map((anim) => (
        RNAnimated.parallel([
          RNAnimated.timing(anim.opacity, {
            toValue: 1,
            duration: 220,
            easing: RNEasing.out(RNEasing.cubic),
            useNativeDriver: true,
          }),
          RNAnimated.timing(anim.translateY, {
            toValue: 0,
            duration: 220,
            easing: RNEasing.out(RNEasing.cubic),
            useNativeDriver: true,
          }),
        ])
      ))
    ).start();
  }, [cardEntranceAnims, questionIndex, quizEntranceOpacity, quizEntranceTranslateY, targetDog]);

  async function handlePick(dog) {
    if ((selected && selected.id === targetDog.id) || !targetDog || lives === 0 || transitioning) return;
    // If already guessed this wrong dog, do nothing
    if (wrongGuesses.includes(dog.id)) return;

    if (dog.id === targetDog.id) {
      // Show a compact XP reward near the score on every correct answer.
      // Unlock-specific card messaging still uses the existing newUnlock logic below.
      {
        const xpFeedbackDelay = 130;
        const driftX = (Math.random() - 0.5) * 18;
        const driftY = -(26 + Math.random() * 10);
        const curve = (Math.random() - 0.5) * 6;
        setShowPlusOne(true);
        setPlusOnePulse(false);
        if (Platform.OS === 'web') {
          setPlusOneStyle({
            opacity: 0,
            position: 'absolute',
            left: '50%',
            top: 8,
            transform: `translate(-50%, 0) scale(1)`,
            color: '#2F6B45',
            fontWeight: 900,
            fontSize: 13,
            letterSpacing: 0,
            pointerEvents: 'none',
            zIndex: 2600,
            border: `1.5px solid ${DoggyDexTheme.colors.gold}`,
            borderRadius: '999px',
            background: 'rgba(255,249,232,0.98)',
            padding: '3px 10px',
            boxShadow: '0 8px 18px rgba(31,41,55,0.16)',
            transition: 'opacity 520ms cubic-bezier(0.22, 1, 0.36, 1), top 520ms cubic-bezier(0.22, 1, 0.36, 1), transform 520ms cubic-bezier(0.22, 1, 0.36, 1)',
            textShadow: 'none',
          });
        } else {
          plusOneMobileOpacity.setValue(0);
          plusOneMobileTranslateX.setValue(0);
          plusOneMobileTranslateY.setValue(0);
          plusOneMobileScale.setValue(1);
        }
        setTimeout(() => {
          setScore((s) => s + 1);
          setPlusOnePulse(true);
          scorePulseAnim.stopAnimation();
          scorePulseAnim.setValue(0);
          RNAnimated.sequence([
            RNAnimated.timing(scorePulseAnim, {
              toValue: 1,
              duration: 105,
              easing: RNEasing.out(RNEasing.cubic),
              useNativeDriver: true,
            }),
            RNAnimated.timing(scorePulseAnim, {
              toValue: 0,
              duration: 105,
              easing: RNEasing.inOut(RNEasing.cubic),
              useNativeDriver: true,
            }),
          ]).start();

          if (Platform.OS === 'web') {
            setPlusOneStyle((prev) => ({
              ...prev,
              opacity: 1,
            }));

            const scheduleXpBadgeFloat = typeof requestAnimationFrame === 'function'
              ? requestAnimationFrame
              : (callback) => setTimeout(callback, 16);
            scheduleXpBadgeFloat(() => {
              setPlusOneStyle((prev) => ({
                ...prev,
                opacity: 0,
                top: -18,
                transform: `translate(calc(-50% + ${driftX}px), ${driftY}px) scale(1.08) skewX(${curve}deg)`,
              }));
            });
          } else {
            plusOneMobileOpacity.setValue(1);
            RNAnimated.parallel([
              RNAnimated.timing(plusOneMobileOpacity, {
                toValue: 0,
                duration: 520,
                easing: RNEasing.out(RNEasing.cubic),
                useNativeDriver: true,
              }),
              RNAnimated.timing(plusOneMobileTranslateX, {
                toValue: driftX,
                duration: 520,
                easing: RNEasing.out(RNEasing.cubic),
                useNativeDriver: true,
              }),
              RNAnimated.timing(plusOneMobileTranslateY, {
                toValue: driftY,
                duration: 520,
                easing: RNEasing.out(RNEasing.cubic),
                useNativeDriver: true,
              }),
              RNAnimated.timing(plusOneMobileScale, {
                toValue: 1.08,
                duration: 520,
                easing: RNEasing.out(RNEasing.cubic),
                useNativeDriver: true,
              }),
            ]).start();
          }
        }, xpFeedbackDelay);
        setTimeout(() => {
          setShowPlusOne(false);
          if (Platform.OS === 'web') {
            setPlusOneStyle((prev) => ({
              ...prev,
              opacity: 0,
              top: -18,
              transform: `translate(calc(-50% + ${driftX}px), ${driftY}px) scale(1.08) skewX(${curve}deg)`,
            }));
          }
        }, xpFeedbackDelay + 620);
        // Keep the small coat-unlock marker on the correct card.
        setNewUnlock(targetDog.id);
        setNewCoatActuallyUnlocked(true);
      }

      // --- THEN all other animations/state updates ---
      setTimerPaused(true);
      setTimer((prev) => prev); // Prevent timer decrement
      let timerPaused = true;
      setSelected(dog);
      setTransitioning(true);

      // Drive question transition from tap timing (not async unlock writes)
      // so timing tweaks are immediately visible.
      const slideOut = () => {
        gridSlideX.value = 0;
        gridOpacity.value = 1;
        gridSlideX.value = withTiming(-QUESTION_TRANSITION_DISTANCE, {
          duration: QUESTION_TRANSITION_DURATION,
          easing: QUESTION_TRANSITION_EASING,
        }, () => {
          runOnJS(setPendingNext)(true);
        });
        gridOpacity.value = withTiming(0, {
          duration: QUESTION_TRANSITION_DURATION,
          easing: QUESTION_TRANSITION_EASING,
        });
      };
      setTimeout(() => {
        (async () => {
          await prepareNextQuestion();
          slideOut();
        })();
      }, 420);

      (async () => {
        try {
          const user = auth.currentUser;
          if (user) {
            const breedId = targetDog.breedId || targetDog.breed_id || targetDog.breed;
            const availableCoatIds = catalogCoatIdsByBreed[breedId]
              || (storageVariantMap[targetDog.breed] || []).map((variant) => variant.id);
            const reward = await recordCorrectAnswer({
              uid: user.uid,
              breedId,
              breedName: targetDog.breed,
              availableCoatIds,
              answeredCoatId: targetDog.id,
              correctStreak: currentStreak + 1,
            });

            const newlyUnlockedCoats = Array.isArray(reward.newlyUnlockedCoats)
              ? reward.newlyUnlockedCoats
              : [];
            const hasNewCoat = newlyUnlockedCoats.length > 0;
            const breedVariants = storageVariantMap[targetDog.breed] || [];
            const rewardImageSource = getQuizImageSource(targetDog);
            const newlyUnlockedCoatDetails = newlyUnlockedCoats.map((coatId) => {
              const matchedVariant = breedVariants.find((variant) => String(variant.id) === String(coatId));
              const coatIdWithoutBreed = String(coatId).replace(new RegExp(`^${breedId}__`), '');
              const label = matchedVariant?.coat
                || (String(targetDog.id) === String(coatId) ? targetDog.coat : '')
                || toTitleCaseFromId(coatIdWithoutBreed);
              return {
                coatId,
                label,
                imageSource: String(targetDog.id) === String(coatId)
                  ? rewardImageSource
                  : getQuizImageSource(matchedVariant),
              };
            });
            const newlyUnlockedCoatLabels = newlyUnlockedCoatDetails.map((coat) => coat.label);
            const rewardEvents = [
              ...(reward.isNewBreed ? [{
                id: `breed-${breedId}-${Date.now()}`,
                type: 'breed',
                breedId,
                name: targetDog.breed,
                imageSource: rewardImageSource,
              }] : []),
              ...newlyUnlockedCoatDetails.map((coat, index) => ({
                id: `coat-${breedId}-${coat.coatId}-${Date.now()}-${index}`,
                type: 'coat',
                breedId,
                coatId: coat.coatId,
                name: `${targetDog.breed} - ${formatCoatLabel(coat.label)}`,
                imageSource: coat.imageSource,
              })),
              ...(reward.didLevelUp ? [{
                id: `level-${reward.level}-${Date.now()}`,
                type: 'level',
                name: `Level ${reward.level}`,
                level: reward.level,
              }] : []),
            ];
            setTimeout(() => {
              addSessionProgressReward(reward, rewardEvents);
              setNewUnlock(hasNewCoat ? targetDog.id : null);
              setNewCoatActuallyUnlocked(hasNewCoat);
              showProgressionReward({
                ...reward,
                newlyUnlockedCoats,
                breedName: targetDog.breed,
                breedImageSource: rewardImageSource,
                newlyUnlockedCoatLabels,
              });
            }, QUESTION_TRANSITION_DURATION + 120);
          }
        } catch (progressionError) {
          console.warn('Failed to update player progression', progressionError);
          setNewUnlock(null);
          setNewCoatActuallyUnlocked(false);
        }
      })();
    } else {
      setCurrentStreak(0);
      setWrongGuesses((prev) => [...prev, dog.id]);
      setWrongToast(lives <= 1 ? 'Out of lives!' : 'Not quite — try another photo');
      setTimeout(() => setWrongToast(null), 720);

      setWrongAnimatedCardId(dog.id);
      wrongShakeX.setValue(0);
      wrongBorderOpacity.setValue(0);

      // 0-120ms: shake card, ~80ms: start red border fade-in.
      setTimeout(() => {
        RNAnimated.timing(wrongBorderOpacity, {
          toValue: 1,
          duration: 70,
          useNativeDriver: true,
        }).start();
      }, 80);

      RNAnimated.sequence([
        RNAnimated.timing(wrongShakeX, { toValue: -7, duration: 30, useNativeDriver: true }),
        RNAnimated.timing(wrongShakeX, { toValue: 7, duration: 30, useNativeDriver: true }),
        RNAnimated.timing(wrongShakeX, { toValue: -5, duration: 25, useNativeDriver: true }),
        RNAnimated.timing(wrongShakeX, { toValue: 5, duration: 25, useNativeDriver: true }),
        RNAnimated.timing(wrongShakeX, { toValue: 0, duration: 30, useNativeDriver: true }),
      ]).start(() => {
        setTimeout(() => setWrongAnimatedCardId(null), 20);
      });

      setHeartPulse(lives - 1); // pulse the heart that will be lost
      if (lives === 1) {
        // Last heart: skip color transition
        setHeartPulseColor('#FF0000');
        setTimeout(() => {
          setHeartPulse(null);
          setHeartPulseColor(null);
        }, 200); // very quick or no delay
      } else {
        setHeartPulseColor('#FF0000');
        setTimeout(() => setHeartPulseColor('#8B0000'), 400); // slower fade
        setTimeout(() => {
          setHeartPulse(null);
          setHeartPulseColor(null);
        }, 900);
      }
      setLives((l) => Math.max(0, l - 1));
      setTimer(30); // Reset timer on wrong answer
    }
  }

  // When pendingNext is set (after grid slide out), update question and animate grid in
  useEffect(() => {
    if (pendingNext) {
      const nextQuestion = preparedNextQuestionRef.current || buildQuestion({ commitRecent: true });
      preparedNextQuestionRef.current = null;
      skipNextCardEntranceRef.current = true;
      setSelected(null);
      setNewUnlock(null);
      setTimer(30); // Reset timer to 30
      setTimerPaused(false); // Resume timer
      setActiveQuestion(nextQuestion);
      setQuestionIndex((q) => q + 1);
      // Animate grid in from right
      gridSlideX.value = QUESTION_TRANSITION_DISTANCE;
      gridOpacity.value = 0;
      gridSlideX.value = withTiming(0, {
        duration: QUESTION_TRANSITION_DURATION,
        easing: QUESTION_TRANSITION_EASING,
      }, () => {
        runOnJS(setTransitioning)(false);
        runOnJS(setPendingNext)(false);
      });
      gridOpacity.value = withTiming(1, {
        duration: QUESTION_TRANSITION_DURATION,
        easing: QUESTION_TRANSITION_EASING,
      });
    }
  }, [buildQuestion, pendingNext]);

  function next() {
    if (transitioning) return;
    // For manual next, animate grid out
    setTransitioning(true);
    (async () => {
      await prepareNextQuestion();
      gridSlideX.value = 0;
      gridOpacity.value = 1;
      gridSlideX.value = withTiming(-QUESTION_TRANSITION_DISTANCE, {
        duration: QUESTION_TRANSITION_DURATION,
        easing: QUESTION_TRANSITION_EASING,
      }, () => {
        runOnJS(setPendingNext)(true);
      });
      gridOpacity.value = withTiming(0, {
        duration: QUESTION_TRANSITION_DURATION,
        easing: QUESTION_TRANSITION_EASING,
      });
    })();
  }

  const goHomeWithSpinner = useCallback(() => {
    if (isLeavingToHome) return;
    setIsLeavingToHome(true);
    setShowExitConfirm(false);
    setTimeout(() => {
      router.replace('/');
    }, 40);
  }, [isLeavingToHome, router]);

  async function handlePlayAgain() {
    gameOverSequenceTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    gameOverSequenceTimeoutsRef.current = [];
    modalOpacity.stopAnimation();
    modalTranslateY.stopAnimation();
    modalScale.stopAnimation();
    scoreOpacity.stopAnimation();
    bestStreakOpacity.stopAnimation();
    highScoreOpacity.stopAnimation();
    buttonsOpacity.stopAnimation();
    scorePulseAnim.stopAnimation();
    quizFeedbackTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    quizFeedbackTimeoutsRef.current = [];
    if (progressionRewardTimeoutRef.current) {
      clearTimeout(progressionRewardTimeoutRef.current);
      progressionRewardTimeoutRef.current = null;
    }
    if (progressionRewardDelayRef.current) {
      clearTimeout(progressionRewardDelayRef.current);
      progressionRewardDelayRef.current = null;
    }
    progressionRewardSequenceTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    progressionRewardSequenceTimeoutsRef.current = [];
    dailyQuizBonusHandledRef.current = false;
    recentBreedsRef.current = [];
    preparedNextQuestionRef.current = null;
    skipNextCardEntranceRef.current = false;
    setShowGameOver(false);
    setDisplayedFinalScore(0);
    setSessionXpEarned(0);
    setSessionXpRange({ startTotalXP: 0, endTotalXP: 0 });
    setSessionRewardEvents([]);
    setGameOverRewardVisible(false);
    setGameOverActionsReady(false);
    setGameOverSkipSignal(0);
    setScore(0);
    setLives(3);
    setQuestionIndex(0);
    setSelected(null);
    setWrongGuesses([]);
    setNewUnlock(null);
    setProgressionReward(null);
    unlockToastOpacity.setValue(0);
    unlockToastTranslateY.setValue(24);
    unlockToastScale.setValue(0.95);
    setPendingNext(false);
    setTransitioning(false);
    setTimer(30);
    setTimerPaused(false); // Unpause the timer
    setActiveQuestion(buildQuestion({ commitRecent: true }));
    setQuestionIndex((q) => q + 1);
  }

  // Show loading indicator until authState.checked is true
  if (!authState.checked) {
    return <SplashTransition />;
  }

  const mobileStatusMessage = isLocalQuizLoading
    ? 'Loading quiz breeds with local images...'
    : localQuizSyncNotice || localQuizNotice || missingLocalImageNotice || '';
  const shouldBlurContainerOnTimeout = timer === 0 && !showGameOver;

  const isInitialQuestionReady = Boolean(
    targetDog && choices.length === MIN_BREEDS_PER_QUESTION
  );

  // Loading the coat catalog and building the first question happen in
  // separate state updates. Keep the splash mounted across that handoff so an
  // empty quiz frame cannot flash before the first complete question exists.
  if (isLocalQuizLoading || (!isInitialQuestionReady && !localQuizNotice)) {
    return <SplashTransition />;
  }

  if (Platform.OS !== 'web') {
    return (
      <ThemedView style={quizStyles.container}>
        <UnlockRewardFeedback
          reward={progressionReward}
          opacity={unlockToastOpacity}
          translateY={unlockToastTranslateY}
          scale={unlockToastScale}
        />
        {wrongToast ? (
          <View pointerEvents="none" style={quizStyles.wrongToast}>
            <MaterialIcons name="close" size={15} color="#FFFFFF" />
            <ThemedText style={quizStyles.wrongToastText}>{wrongToast}</ThemedText>
          </View>
        ) : null}

        {showTimesUp && !showGameOver ? (
          <RNAnimated.View
            pointerEvents="none"
            style={[
              quizStyles.timeoutMessageOverlay,
              {
                opacity: timesUpAnim,
                transform: [
                  {
                    scale: timesUpAnim.interpolate({
                      inputRange: [0, 0.7, 1],
                      outputRange: [0.7, 1.18, 1.04],
                    }),
                  },
                ],
              },
            ]}
          >
            <ThemedText type="default" style={quizStyles.timeoutMessageText}>
              Time&apos;s Up!
            </ThemedText>
          </RNAnimated.View>
        ) : null}

          <RNAnimated.View
            style={[
              quizStyles.mobileQuizStack,
              {
                opacity: quizEntranceOpacity,
                transform: [{ translateY: -32 }, { translateY: quizEntranceTranslateY }],
              },
            ]}
          >
          <View style={quizStyles.mobileTopBackWrap}>
            <Pressable
              onPress={() => setShowExitConfirm(true)}
              style={({ pressed }) => [
                quizStyles.mobileTopBackButton,
                pressed && quizStyles.mobileTopBackButtonPressed,
              ]}
            >
              <MaterialIcons name="arrow-back" size={24} color="#8A6A54" />
            </Pressable>
          </View>

          <View style={quizStyles.mobileQuizCard}>
            {shouldBlurContainerOnTimeout ? (
              <View pointerEvents="none" style={quizStyles.timerBlurOverlay}>
                <BlurView intensity={72} tint="light" style={quizStyles.timerBlurOverlayNative} />
              </View>
            ) : null}

            <View style={quizStyles.mobileHeaderCard}>
              <View style={quizStyles.mobileStatsRow}>
                <View style={quizStyles.heartsChip}>
                  {Array.from({ length: 3 }).map((_, i) => {
                    const isActive = lives > i;

                    return (
                      <RNAnimated.View
                        key={i}
                        style={{
                          transform: [
                            { translateX: heartPulse === i ? heartShakeX : 0 },
                            { scale: heartPulse === i ? 1.2 : 1 },
                          ],
                        }}
                      >
                        <LifePawIcon
                          active={isActive}
                          color={heartPulse === i && heartPulseColor ? heartPulseColor : undefined}
                        />
                      </RNAnimated.View>
                    );
                  })}
                </View>
                <View style={quizStyles.mobileScoreWrap}>
                  <ThemedText style={quizStyles.mobileScoreLabel}>Score</ThemedText>
                  <RNAnimated.View style={{ position: 'relative', transform: [{ scale: scorePulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] }) }] }}>
                    <RNAnimated.View pointerEvents="none" style={[quizStyles.mobileScoreGlow, { opacity: scorePulseAnim }]} />
                    <ThemedText style={quizStyles.mobileScoreValue}>{score}</ThemedText>
                  </RNAnimated.View>
                  {showPlusOne ? (
                    <RNAnimated.View
                      pointerEvents="none"
                      style={[
                        quizStyles.mobilePlusOneBubble,
                        {
                          position: 'absolute',
                          top: -2,
                          opacity: plusOneMobileOpacity,
                          transform: [
                            { translateX: plusOneMobileTranslateX },
                            { translateY: plusOneMobileTranslateY },
                            { scale: plusOneMobileScale },
                          ],
                        },
                      ]}
                    >
                      <ThemedText style={quizStyles.mobilePlusOneText}>+10 XP</ThemedText>
                    </RNAnimated.View>
                  ) : null}
                </View>
                <View
                  style={[
                    quizStyles.mobileTimerChip,
                    timer <= 9 && quizStyles.mobileTimerChipCritical,
                    timer <= 9 && pulse && { transform: [{ scale: 1.08 }, { rotate: '-2deg' }] },
                  ]}
                >
                  <MaterialIcons name="timer" size={timer <= 9 ? 28 : 23} color={timer <= 9 ? '#FFFFFF' : '#FFA51F'} />
                  <ThemedText
                    style={[
                      quizStyles.mobileTimerValue,
                      timer <= 9 && quizStyles.mobileTimerCritical,
                      timer <= 9 && pulse && { transform: [{ scale: 1.16 }] },
                    ]}
                  >
                    {timer}
                  </ThemedText>
                </View>
              </View>
              <View style={[quizStyles.mobilePromptWrap, { minHeight: 84 }]}> 
                <ThemedText
                  type="subtitle"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                  style={[quizStyles.promptLarge, { opacity: targetDog ? 1 : 0 }]}
                >
                  {targetDog ? targetDog.breed : ' '}
                </ThemedText>
                <ThemedText style={[quizStyles.promptSmall, { opacity: targetDog ? 1 : 0 }]}>
                  Tap the matching photo
                </ThemedText>
              </View>
            </View>

            <View style={{ minHeight: 24, justifyContent: 'center' }}>
              <ThemedText style={[quizStyles.hint, { opacity: mobileStatusMessage ? 1 : 0 }]}>
                {mobileStatusMessage || ' '}
              </ThemedText>
            </View>

            <View style={quizStyles.mobileGridCard}>
              {targetDog ? (
                <Animated.View style={[quizStyles.grid, dogGridStyle]}>
                  {choices.map((c, idx) => {
                    const isCorrect = selected && c.id === targetDog.id;
                    const isWrong = wrongGuesses.includes(c.id);
                    const isWrongAnimating = wrongAnimatedCardId === c.id;
                    const isDimmed = selected && c.id !== targetDog.id;
                    const isDisabled = !!selected;
                    return (
                      <RNAnimated.View
                        key={c.id || `${c.breed}-${idx}`}
                        style={[
                          quizStyles.cardSlot,
                          {
                            opacity: cardEntranceAnims[idx]?.opacity,
                            transform: [
                              ...(isWrongAnimating ? [{ translateX: wrongShakeX }] : []),
                              { translateY: cardEntranceAnims[idx]?.translateY || 0 },
                            ],
                          },
                        ]}
                      >
                        <Pressable
                        style={[
                          quizStyles.card,
                          quizStyles.cardFill,
                          isCorrect && quizStyles.correctReveal,
                          isWrong && quizStyles.wrongBlur,
                          isDimmed && quizStyles.dimmedCard,
                          isDisabled && !isCorrect && !isWrong && { opacity: 0.7 },
                        ]}
                        onPress={() => handlePick(c)}
                        disabled={isDisabled}
                      >
                        <Image
                          source={getQuizImageSource(c)}
                          style={quizStyles.image}
                          contentFit="cover"
                          blurRadius={isWrong ? 7 : 0}
                          onError={() => {
                            setFailedImageIds((prev) => ({
                              ...prev,
                              [c.id]: true,
                            }));
                          }}
                        />
                        {failedImageIds[c.id] ? (
                          <View style={quizStyles.imageFallback}>
                            <MaterialIcons name="pets" size={28} color={DoggyDexTheme.colors.textMuted} />
                            <ThemedText style={quizStyles.imageFallbackText}>{c.breed}</ThemedText>
                          </View>
                        ) : null}

                        {isWrongAnimating ? (
                          <RNAnimated.View
                            pointerEvents="none"
                            style={{
                              ...quizStyles.wrongTapOverlay,
                              opacity: wrongBorderOpacity,
                            }}
                          />
                        ) : null}
                        {isCorrect ? <View pointerEvents="none" style={quizStyles.correctTapOverlay} /> : null}
                        </Pressable>
                      </RNAnimated.View>
                    );
                  })}
                </Animated.View>
              ) : (
                <View style={quizStyles.mobileGridPlaceholder} />
              )}
            </View>
          </View>
          </RNAnimated.View>

        {showExitConfirm ? (
          <View style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(12,16,24,0.46)',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            paddingHorizontal: 20,
          }}>
            <View style={{
              backgroundColor: 'rgba(255,246,232,0.98)',
              borderRadius: 22,
              paddingVertical: 22,
              paddingHorizontal: 18,
              width: '100%',
              maxWidth: 360,
              maxHeight: '94%',
              alignItems: 'center',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.92)',
              shadowColor: DoggyDexTheme.colors.text,
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.24,
              shadowRadius: 20,
              elevation: 10,
            }}>
              <View style={{
                width: 58,
                height: 58,
                borderRadius: 29,
                backgroundColor: '#FEE2E2',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 10,
              }}>
                <MaterialIcons name="warning-amber" size={34} color="#B91C1C" />
              </View>
              <ThemedText style={{ fontSize: 24, fontWeight: '800', color: '#B91C1C', marginBottom: 8, textAlign: 'center' }}>
                Abandon Quiz?
              </ThemedText>
              <ThemedText style={{ fontSize: 15, lineHeight: 22, color: DoggyDexTheme.colors.textSecondary, marginBottom: 18, textAlign: 'center', opacity: 0.92 }}>
                Are you sure you want to exit? All progress will be lost.
              </ThemedText>
              <View style={{ width: '100%', flexDirection: 'row', gap: 10 }}>
                <Pressable
                  onPress={() => setShowExitConfirm(false)}
                  style={({ pressed }) => [{
                    flex: 1,
                    backgroundColor: '#EEF2F7',
                    borderRadius: 12,
                    paddingVertical: 12,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: '#D1D9E6',
                  }, pressed && { transform: [{ scale: 0.98 }] }]}
                >
                  <ThemedText style={{ color: '#334155', fontWeight: '700', fontSize: 16 }}>Cancel</ThemedText>
                </Pressable>
                <Pressable
                  onPress={goHomeWithSpinner}
                  style={({ pressed }) => [{
                    flex: 1,
                    backgroundColor: '#EF4444',
                    borderRadius: 12,
                    paddingVertical: 12,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: '#DC2626',
                  }, pressed && { transform: [{ scale: 0.98 }] }]}
                >
                  <ThemedText style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Exit</ThemedText>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}

        {showGameOver ? (
          <View onTouchEnd={completeGameOverReveal} style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            paddingHorizontal: 20,
          }}>
            <RNAnimated.View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: modalOpacity, backgroundColor: 'rgba(12,16,24,0.44)' }}>
              <BlurView intensity={18} tint="dark" style={{ flex: 1 }} />
            </RNAnimated.View>
            <RNAnimated.View style={{
              backgroundColor: 'rgba(255,246,232,0.98)',
              borderRadius: 24,
              paddingVertical: 22,
              paddingHorizontal: 18,
              width: '100%',
              maxWidth: 360,
              maxHeight: '94%',
              alignItems: 'center',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.92)',
              shadowColor: DoggyDexTheme.colors.text,
              shadowOffset: { width: 0, height: 12 },
              shadowOpacity: 0.26,
              shadowRadius: 22,
              elevation: 12,
              opacity: modalOpacity,
              transform: [{ translateY: modalTranslateY }, { scale: modalScale }],
            }}>
              <View style={{
                width: 54,
                height: 54,
                borderRadius: 27,
                backgroundColor: '#FFF0E2',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 8,
              }}>
                <MaterialIcons name="heart-broken" size={30} color={DoggyDexTheme.colors.error} />
              </View>
              <ThemedText style={{ fontSize: 23, fontWeight: '800', color: DoggyDexTheme.colors.text, marginBottom: 2 }}>
                Out of Lives!
              </ThemedText>
              <RNAnimated.View style={{ opacity: scoreOpacity, transform: [{ scale: scoreScale }], alignItems: 'center', marginBottom: 12 }}>
                <ThemedText style={{ fontSize: 52, lineHeight: 58, color: DoggyDexTheme.colors.primary, fontWeight: '900', letterSpacing: 0.8 }}>
                  {displayedFinalScore}
                </ThemedText>
                <ThemedText style={{ fontSize: 13, lineHeight: 17, color: DoggyDexTheme.colors.textSecondary, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' }}>
                  Final Score
                </ThemedText>
              </RNAnimated.View>
              {isNewHighScore ? (
                <RNAnimated.View style={{
                  opacity: highScoreOpacity,
                  transform: [{ scale: highScoreScale }],
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 7,
                  backgroundColor: '#FFF4D6',
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: DoggyDexTheme.colors.gold,
                  paddingVertical: 7,
                  paddingHorizontal: 12,
                  marginBottom: 12,
                }}>
                  <MaterialIcons name="emoji-events" size={19} color={DoggyDexTheme.colors.gold} />
                  <ThemedText style={{ color: DoggyDexTheme.colors.text, fontSize: 13, lineHeight: 17, fontWeight: '900' }}>
                    New High Score!
                  </ThemedText>
                </RNAnimated.View>
              ) : null}
              <View style={{
                width: '100%',
                backgroundColor: DoggyDexTheme.colors.surface,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: DoggyDexTheme.colors.border,
                paddingVertical: 13,
                paddingHorizontal: 14,
                marginBottom: 8,
                gap: 12,
              }}>
                <RNAnimated.View style={{ opacity: scoreOpacity }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <MaterialIcons name="star" size={19} color={DoggyDexTheme.colors.gold} />
                      <ThemedText style={{ fontSize: 16, color: DoggyDexTheme.colors.textSecondary, fontWeight: '800' }}>Score</ThemedText>
                    </View>
                    <ThemedText style={{ fontSize: 22, color: DoggyDexTheme.colors.primary, fontWeight: '900' }}>{score}</ThemedText>
                  </View>
                </RNAnimated.View>
                <RNAnimated.View style={{ opacity: bestStreakOpacity }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <MaterialIcons name="whatshot" size={19} color={DoggyDexTheme.colors.primary} />
                      <ThemedText style={{ fontSize: 15, color: DoggyDexTheme.colors.textSecondary, fontWeight: '800' }}>Best streak</ThemedText>
                    </View>
                    <ThemedText style={{ fontSize: 20, color: DoggyDexTheme.colors.text, fontWeight: '800' }}>{bestStreak}</ThemedText>
                  </View>
                </RNAnimated.View>
                <RNAnimated.View style={{ opacity: highScoreOpacity }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <MaterialIcons name="emoji-events" size={19} color={DoggyDexTheme.colors.gold} />
                      <ThemedText style={{ fontSize: 15, color: DoggyDexTheme.colors.textSecondary, fontWeight: '800' }}>High score</ThemedText>
                    </View>
                    <ThemedText style={{ fontSize: 20, color: isNewHighScore ? DoggyDexTheme.colors.gold : DoggyDexTheme.colors.text, fontWeight: '800' }}>
                      {highScore ?? 0}
                    </ThemedText>
                  </View>
                </RNAnimated.View>
              </View>
              <GameOverRewardFlow
                visible={gameOverRewardVisible}
                score={score}
                totalXp={sessionXpEarned}
                xpStartTotal={sessionXpRange.startTotalXP}
                xpEndTotal={sessionXpRange.endTotalXP}
                events={sessionRewardEvents}
                skipSignal={gameOverSkipSignal}
                onFinished={finishGameOverRewardFlow}
              />
              <RNAnimated.View
                style={{ width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 10, opacity: buttonsOpacity }}
                pointerEvents={gameOverActionsReady ? 'auto' : 'none'}
              >
                <Pressable
                  onPress={handlePlayAgain}
                  style={({ pressed }) => [{
                    flexGrow: 1,
                    minWidth: 136,
                    backgroundColor: DoggyDexTheme.colors.primary,
                    borderRadius: 12,
                    paddingVertical: 13,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: DoggyDexTheme.colors.gold,
                  }, pressed && { transform: [{ scale: 0.98 }] }]}
                >
                  <ThemedText style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>Play Again</ThemedText>
                </Pressable>
                {sessionRewardEvents.some((event) => event.type === 'breed' || event.type === 'coat') ? (
                  <Pressable
                    onPress={viewDoggyDexRewards}
                    style={({ pressed }) => [{
                      flexGrow: 1,
                      minWidth: 118,
                      backgroundColor: DoggyDexTheme.colors.surface,
                      borderRadius: 12,
                      paddingVertical: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'row',
                      gap: 6,
                      borderWidth: 1,
                      borderColor: DoggyDexTheme.colors.border,
                    }, pressed && { transform: [{ scale: 0.98 }] }]}
                  >
                    <MaterialIcons name="menu-book" size={18} color={DoggyDexTheme.colors.primary} />
                    <ThemedText style={{ color: DoggyDexTheme.colors.text, fontWeight: '800', fontSize: 15 }}>DoggyDex</ThemedText>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={goHomeWithSpinner}
                  style={({ pressed }) => [{
                    flexGrow: 1,
                    minWidth: 104,
                    backgroundColor: 'transparent',
                    borderRadius: 12,
                    paddingVertical: 12,
                    alignItems: 'center',
                    borderWidth: 0,
                  }, pressed && { transform: [{ scale: 0.98 }] }]}
                >
                  <ThemedText style={{ color: DoggyDexTheme.colors.textSecondary, fontWeight: '800', fontSize: 16 }}>Home</ThemedText>
                </Pressable>
              </RNAnimated.View>
            </RNAnimated.View>
          </View>
        ) : null}

        {isLeavingToHome ? (
          <SplashTransition overlay />
        ) : null}
      </ThemedView>
    );
  }

  return (
    <ThemedView style={quizStyles.container}>
      <UnlockRewardFeedback
        reward={progressionReward}
        opacity={unlockToastOpacity}
        translateY={unlockToastTranslateY}
        scale={unlockToastScale}
      />
      {wrongToast ? (
        <View pointerEvents="none" style={quizStyles.wrongToast}>
          <MaterialIcons name="close" size={15} color="#FFFFFF" />
          <ThemedText style={quizStyles.wrongToastText}>{wrongToast}</ThemedText>
        </View>
      ) : null}
      {showTimesUp && !showGameOver ? (
        <RNAnimated.View
          pointerEvents="none"
          style={[
            quizStyles.timeoutMessageOverlay,
            {
              opacity: timesUpAnim,
              transform: [
                {
                  scale: timesUpAnim.interpolate({
                    inputRange: [0, 0.7, 1],
                    outputRange: [0.7, 1.18, 1.04],
                  }),
                },
              ],
            },
          ]}
        >
          <ThemedText type="default" style={quizStyles.timeoutMessageText}>
            Time&apos;s Up!
          </ThemedText>
        </RNAnimated.View>
      ) : null}

      {/* DEBUG: Show state if nothing is rendering */}
      {(!targetDog || !choices || choices.length === 0) && !isLocalQuizLoading && (
        <View style={{ padding: 24, alignItems: 'center' }}>
          <ThemedText style={{ color: 'red', fontWeight: 'bold', fontSize: 18 }}>
            Debug: No dog images to show!
          </ThemedText>
          <ThemedText style={{ color: '#333', fontSize: 15, marginTop: 8 }}>
            {`targetDog: ${targetDog ? 'OK' : 'null'} | choices: ${choices ? choices.length : 'undefined'} | storageVariantMap breeds: ${storageVariantMap ? Object.keys(storageVariantMap).length : 'undefined'}`}
          </ThemedText>
          <ThemedText style={{ color: '#333', fontSize: 15, marginTop: 4 }}>
            {localQuizNotice ? `localQuizNotice: ${localQuizNotice}` : ''}
          </ThemedText>
        </View>
      )}
            {/* Game Over Modal */}
            {showGameOver && (
              <View onTouchEnd={completeGameOverReveal} style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 2000,
              }}>
                <RNAnimated.View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: modalOpacity, backgroundColor: 'rgba(12,16,24,0.42)' }}>
                  <BlurView intensity={16} tint="dark" style={{ flex: 1 }} />
                </RNAnimated.View>
                {/* Top blurred divider line */}
                <RNAnimated.View style={{
                  opacity: scoreOpacity,
                  width: '80%',
                  height: 1,
                  backgroundColor: 'rgba(0,0,0,0.08)',
                  alignSelf: 'center',
                  marginVertical: 3,
                  ...(typeof window !== 'undefined' ? { filter: 'blur(1.5px)', WebkitFilter: 'blur(1.5px)' } : {})
                }} />
                <Animated.View style={{
                  backgroundColor: 'rgba(255,246,232,0.97)',
                  borderRadius: 18,
                  padding: 18,
                  maxWidth: 340,
                  width: '96%',
                  maxHeight: '94vh',
                  alignItems: 'center',
                  boxShadow: '0 6px 16px rgba(0,0,0,0.15)',
                  elevation: 10,
                  position: 'relative',
                  zIndex: 3000,
                  gap: 8,
                  opacity: modalOpacity,
                  transform: [{ translateY: modalTranslateY }, { scale: modalScale }],
                }}>
                  <ThemedText style={{ fontSize: 22, fontWeight: '800', color: DoggyDexTheme.colors.text, marginBottom: 4, textAlign: 'center', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <MaterialIcons
                      name="heart-broken"
                      size={34}
                      color={DOGGYDEX_CORAL_RED}
                      style={{ marginRight: 6, verticalAlign: 'middle' }}
                    />
                    <span style={{ display: 'inline-block', marginTop: 6 }}>Out of Lives!</span>
                  </ThemedText>
                  <RNAnimated.View style={{
                    opacity: scoreOpacity,
                    transform: [{ scale: scoreScale }],
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 12,
                  }}>
                    <ThemedText style={{ fontWeight: '900', color: DoggyDexTheme.colors.primary, fontSize: '3.35rem', textAlign: 'center', letterSpacing: 1.4, padding: 4, borderRadius: 12, textShadow: '0 1.5px 8px #FFD58088' }}>
                      <span style={{ textShadow: '0 0 8px rgba(255,165,0,0.3)', fontSize: '3.35rem' }}>{displayedFinalScore}</span>
                    </ThemedText>
                    <ThemedText style={{ color: DoggyDexTheme.colors.textSecondary, fontSize: 13, lineHeight: 17, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' }}>
                      Final Score
                    </ThemedText>
                  </RNAnimated.View>
                  {isNewHighScore ? (
                    <RNAnimated.View style={{
                      opacity: highScoreOpacity,
                      transform: [{ scale: highScoreScale }],
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      backgroundColor: '#FFF4D6',
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: DoggyDexTheme.colors.gold,
                      paddingVertical: 7,
                      paddingHorizontal: 13,
                      marginBottom: 12,
                    }}>
                      <MaterialIcons name="emoji-events" size={19} color={DoggyDexTheme.colors.gold} />
                      <ThemedText style={{ color: DoggyDexTheme.colors.text, fontSize: 13, lineHeight: 17, fontWeight: '900' }}>
                        New High Score!
                      </ThemedText>
                    </RNAnimated.View>
                  ) : null}
                  {/* Stacked stat format */}
                  <View style={{ width: '100%', backgroundColor: DoggyDexTheme.colors.surface, borderRadius: 18, borderWidth: 1, borderColor: DoggyDexTheme.colors.border, paddingVertical: 14, paddingHorizontal: 14, marginBottom: 8, gap: 12 }}>
                    <RNAnimated.View style={{ opacity: scoreOpacity, width: '100%', marginBottom: 0 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <MaterialIcons name="star" size={20} color={DoggyDexTheme.colors.gold} />
                          <ThemedText style={{ fontSize: 16, color: DoggyDexTheme.colors.textSecondary, fontWeight: '800' }}>
                            Score
                          </ThemedText>
                        </View>
                        <ThemedText style={{ fontWeight: '900', color: DoggyDexTheme.colors.primary, fontSize: 23, textAlign: 'center', letterSpacing: 1.1 }}>
                          {score}
                        </ThemedText>
                      </View>
                    </RNAnimated.View>
                    <RNAnimated.View style={{ opacity: bestStreakOpacity, width: '100%', marginBottom: 0 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <MaterialIcons name="whatshot" size={20} color={DoggyDexTheme.colors.primary} />
                          <ThemedText style={{ fontSize: 16, color: DoggyDexTheme.colors.textSecondary, fontWeight: '800' }}>
                            Best streak
                          </ThemedText>
                        </View>
                        <ThemedText style={{ fontWeight: '800', color: DoggyDexTheme.colors.text, fontSize: 21, textAlign: 'center', letterSpacing: 1.1 }}>
                          {bestStreak}
                        </ThemedText>
                      </View>
                    </RNAnimated.View>
                    <RNAnimated.View style={{ opacity: highScoreOpacity, width: '100%', marginBottom: 0 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <MaterialIcons name="emoji-events" size={20} color={DoggyDexTheme.colors.gold} />
                          <ThemedText style={{ fontSize: 16, color: DoggyDexTheme.colors.textSecondary, fontWeight: '800' }}>
                            High score
                          </ThemedText>
                        </View>
                        <ThemedText style={{ fontWeight: '800', color: isNewHighScore ? DoggyDexTheme.colors.gold : DoggyDexTheme.colors.text, fontSize: 21, textAlign: 'center', letterSpacing: 1.1 }}>
                          {highScore}
                        </ThemedText>
                      </View>
                    </RNAnimated.View>
                  </View>
                  <GameOverRewardFlow
                    visible={gameOverRewardVisible}
                    score={score}
                    totalXp={sessionXpEarned}
                    xpStartTotal={sessionXpRange.startTotalXP}
                    xpEndTotal={sessionXpRange.endTotalXP}
                    events={sessionRewardEvents}
                    skipSignal={gameOverSkipSignal}
                    onFinished={finishGameOverRewardFlow}
                  />
                  {/* Flash animation keyframes for web */}
                  {typeof window !== 'undefined' && (
                    <style>{`
                      @keyframes flashHighScore {
                        0%, 100% { opacity: 1; }
                        50% { opacity: 0.2; }
                      }
                    `}</style>
                  )}
                  <Animated.View style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: 10,
                    justifyContent: 'center',
                    width: '100%',
                    opacity: buttonsOpacity,
                  }}
                  pointerEvents={gameOverActionsReady ? 'auto' : 'none'}
                  >
                    <Pressable
                      onPress={handlePlayAgain}
                      style={({ hovered, pressed }) => ([
                        {
                          backgroundColor: '#FF9F1C',
                          borderRadius: 12,
                          paddingVertical: 13,
                          paddingHorizontal: 24,
                          minWidth: 138,
                          alignItems: 'center',
                          border: `1px solid ${DoggyDexTheme.colors.gold}`,
                          boxShadow: hovered ? '0 0 16px #FFD580' : '0 8px 18px rgba(255,159,28,0.24)',
                          transform: pressed
                            ? [{ scale: 0.97 }]
                            : hovered
                              ? [{ scale: 1.04 }]
                              : undefined,
                          transition: 'background 0.2s, box-shadow 0.2s, transform 0.1s',
                        },
                      ])}
                    >
                      <ThemedText style={{ color: '#fff', fontWeight: '900', fontSize: 16, letterSpacing: 0.5 }}>Play Again</ThemedText>
                    </Pressable>
                    {sessionRewardEvents.some((event) => event.type === 'breed' || event.type === 'coat') ? (
                      <Pressable
                        onPress={viewDoggyDexRewards}
                        style={({ hovered, pressed }) => ([
                          {
                            backgroundColor: hovered ? '#FFF6E8' : DoggyDexTheme.colors.surface,
                            borderRadius: 12,
                            paddingVertical: 12,
                            paddingHorizontal: 18,
                            minWidth: 122,
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexDirection: 'row',
                            gap: 6,
                            border: `1px solid ${DoggyDexTheme.colors.border}`,
                            boxShadow: 'none',
                            transform: pressed ? [{ scale: 0.97 }] : undefined,
                            transition: 'background 0.2s, box-shadow 0.2s, transform 0.1s',
                          },
                        ])}
                      >
                        <MaterialIcons name="menu-book" size={18} color={DoggyDexTheme.colors.primary} />
                        <ThemedText style={{ color: DoggyDexTheme.colors.text, fontWeight: '800', fontSize: 15, letterSpacing: 0.4 }}>DoggyDex</ThemedText>
                      </Pressable>
                    ) : null}
                    <Pressable
                      onPress={goHomeWithSpinner}
                      style={({ hovered }) => ([
                        {
                          backgroundColor: hovered ? '#FFF6E8' : DoggyDexTheme.colors.surface,
                          borderRadius: 12,
                          paddingVertical: 12,
                          paddingHorizontal: 22,
                          minWidth: 120,
                          alignItems: 'center',
                          border: '1px solid transparent',
                          boxShadow: 'none',
                          transition: 'background 0.2s, box-shadow 0.2s',
                          position: 'relative',
                          zIndex: 1,
                          marginTop: 0,
                        },
                      ])}
                    >
                      <ThemedText
                        style={{ color: '#444', fontWeight: '700', fontSize: 16, letterSpacing: 1, transition: 'color 0.2s' }}
                      >
                        Home
                      </ThemedText>
                    </Pressable>
                  </Animated.View>
                </Animated.View>
              </View>
            )}
      <View
        style={{
          ...quizStyles.centerGradientOverlay,
          background: 'transparent',
          opacity: 0,
          transition: 'filter 0.3s, -webkit-filter 0.3s, background 0.3s, opacity 0.3s',
        }}
      />
      <View
        style={{
          ...quizStyles.grassBackground,
          background: 'transparent',
          opacity: 0,
          transition: 'filter 0.3s, -webkit-filter 0.3s, background 0.3s, opacity 0.3s',
        }}
      />
      {/* Back button removed from top right */}
      <View style={[quizStyles.scoreHeartsContainer, {
        alignItems: 'center',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        paddingBottom: 32,
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        position: 'relative',
        overflow: 'visible',
        transform: [{ translateY: -24 }],
      }]}> 
        {/* Remove global +1 animation */}
        <View style={quizStyles.scoreHeartsRow}>
          <View style={quizStyles.heartsRow}>
            {Array.from({ length: 3 }).map((_, i) => {
              // Shake animation for the heart being lost
              const shake = heartPulse === i;
              const shakeAnim = shake
                ? {
                    // Keyframes for shake: left-right-left
                    animationName: 'shakeHeart',
                    animationDuration: '0.7s',
                    animationTimingFunction: 'cubic-bezier(.36,.07,.19,.97)',
                  }
                : {};
              return (
                <LifePawIcon
                  key={i}
                  active={lives > i}
                  color={heartPulse === i && heartPulseColor ? heartPulseColor : undefined}
                  style={
                    heartPulse === i && heartPulseColor
                      ? { transform: [{ scale: 1.25 }], ...shakeAnim }
                      : shakeAnim
                  }
                />
              );
            })}
          </View>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', display: 'flex', position: 'relative' }}>
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0 }}>
              <span style={{ fontSize: 21, color: 'black', fontWeight: 600, fontFamily: 'inherit', verticalAlign: 'middle', marginBottom: 0 }}>{'Score'}</span>
              <RNAnimated.View style={{ position: 'relative', transform: [{ scale: scorePulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] }) }] }}>
                <RNAnimated.View pointerEvents="none" style={[quizStyles.webScoreGlow, { opacity: scorePulseAnim }]} />
                <span style={{
                  fontSize: 36,
                  color: 'black',
                  fontWeight: 800,
                  fontFamily: 'inherit',
                  verticalAlign: 'middle',
                  marginTop: 0,
                  background: 'none',
                  backgroundColor: 'transparent',
                }}>{score}</span>
              </RNAnimated.View>
              {/* Flying +1 animation */}
              {showPlusOne && (
                <span
                  style={{
                    position: 'absolute',
                    left: plusOneStyle.left || '50%',
                    top: plusOneStyle.top || 40,
                    opacity: plusOneStyle.opacity,
                    transform: plusOneStyle.transform,
                    color: plusOneStyle.color,
                    fontWeight: plusOneStyle.fontWeight,
                    fontSize: plusOneStyle.fontSize,
                    letterSpacing: plusOneStyle.letterSpacing,
                    pointerEvents: 'none',
                    zIndex: plusOneStyle.zIndex || 1000,
                    border: plusOneStyle.border,
                    borderRadius: plusOneStyle.borderRadius,
                    background: plusOneStyle.background,
                    padding: plusOneStyle.padding,
                    boxShadow: plusOneStyle.boxShadow,
                    transition: plusOneStyle.transition,
                    textShadow: plusOneStyle.textShadow,
                    ...plusOneStyle,
                  }}
                >
                  +10 XP
                </span>
              )}
            </span>
          </View>
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 4,
              minWidth: 88,
              padding: timer <= 9 ? '5px 8px' : 0,
              borderRadius: 12,
              background: timer <= 9 ? '#2B0710' : 'transparent',
              border: timer <= 9 ? `2px solid ${DOGGYDEX_CORAL_RED}` : '2px solid transparent',
              boxShadow: timer <= 9
                ? '0 0 22px rgba(215,38,61,0.75), inset 0 0 8px rgba(255,255,255,0.22)'
                : 'none',
              animation: timer <= 9 ? 'timer-chip-panic 0.32s linear infinite alternate' : undefined,
            }}
          >
            <span
              style={{
                fontSize: timer <= 9 ? 35 : 22,
                lineHeight: timer <= 9 ? '38px' : '24px',
                verticalAlign: 'middle',
                transition: 'font-size 0.2s, line-height 0.2s',
                marginRight: 2,
                display: 'inline-block',
              }}
            >
              <MaterialIcons name="timer" size={timer <= 9 ? 31 : 25} color={timer <= 9 ? '#FFFFFF' : '#FFA51F'} />
            </span>
            <span
              style={{
                color: timer <= 9 ? '#FFFFFF' : DOGGYDEX_ORANGE,
                fontWeight: timer <= 9 ? 950 : 300,
                fontSize: timer <= 9 ? 40 : 19,
                letterSpacing: timer <= 9 ? 1.8 : 1,
                transition: 'transform 0.3s, color 0.2s, font-size 0.2s, font-weight 0.2s',
                transform: pulse ? (timer <= 9 ? 'scale(1.24) rotate(-3deg)' : 'scale(1.08)') : 'scale(1)',
                textShadow: timer <= 9
                  ? `0 0 20px ${DOGGYDEX_CORAL_RED}, 0 0 8px #fff, 0 2px 0 #000`
                  : `0 0 8px ${DOGGYDEX_ORANGE}, 0 0 2px #fff`,
                fontFamily: 'inherit',
                verticalAlign: 'middle',
                display: 'inline-block',
                WebkitTextStroke: timer <= 9 ? '1px #000' : '0.5px black',
                textStroke: timer <= 9 ? '1px #000' : '0.5px black',
                animation: timer <= 9 ? 'shake-timer 0.14s linear infinite alternate' : undefined,
              }}
            >
              {timer}
            </span>
            {/* Add shake animation for alarming effect */}
            <style>{`
              @keyframes shake-timer {
                0% { transform: scale(1.22) rotate(-3deg); }
                100% { transform: scale(1.22) rotate(3deg); }
              }
              @keyframes timer-chip-panic {
                0% { transform: translateX(-1px); }
                100% { transform: translateX(1px); }
              }
            `}</style>
          </div>
        </View>
        {targetDog ? (
          <View style={{
            alignItems: 'center',
            width: '100%',
            position: 'relative',
            opacity: showGameOver ? 1 : (timer === 0 ? 0.45 : 1),
            transition: 'opacity 0.3s'
          }}>
            <ThemedText type="subtitle" style={quizStyles.promptLarge}>
              <span style={{
                color: 'black',
                fontWeight: 700,
                fontSize: 24,
                textShadow: `0 1px 2x ${DOGGYDEX_ORANGE}, 0 0 1px #fff`,
                fontFamily: 'inherit',
                verticalAlign: 'middle',
                display: 'inline-block',
                marginTop: '0px',
              }}>
                {targetDog.breed}
              </span>
            </ThemedText>
          </View>
        ) : null}
      </View>
      {isLocalQuizLoading ? (
        <ThemedText style={quizStyles.hint}>Loading quiz breeds with local images...</ThemedText>
      ) : null}
      {localQuizSyncNotice ? <ThemedText style={quizStyles.hint}>{localQuizSyncNotice}</ThemedText> : null}
      {!isLocalQuizLoading && localQuizNotice ? <ThemedText style={quizStyles.hint}>{localQuizNotice}</ThemedText> : null}
      {!isLocalQuizLoading && missingLocalImageNotice ? <ThemedText style={quizStyles.hint}>{missingLocalImageNotice}</ThemedText> : null}


      {targetDog ? (
        <View style={[quizStyles.scoreHeartsContainer, {
          marginTop: 0,
          marginBottom: 0,
          width: 440,
          paddingTop: 0,
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          backgroundColor: quizStyles.scoreHeartsContainer.backgroundColor,
          overflow: 'hidden',
          transform: [{ translateY: -24 }],
        }]}> 
          {shouldBlurContainerOnTimeout ? (
            <View pointerEvents="none" style={quizStyles.timerBlurOverlay}>
              <View style={quizStyles.timerBlurOverlayWeb} />
            </View>
          ) : null}

          <RNAnimated.View
            style={{
              opacity: quizEntranceOpacity,
              transform: [{ translateY: quizEntranceTranslateY }],
              width: '100%',
              alignItems: 'center',
            }}
          >
          <Animated.View style={[quizStyles.grid, dogGridStyle, { opacity: showGameOver ? 1 : (timer === 0 ? 0.45 : 1), transition: 'opacity 0.3s' }]}> 
            {choices.map((c, idx) => {
              // Only show correct styling/label if the selected card is the correct one
              const isSelected = selected && c.id === selected.id;
              const isCorrect = isSelected && c.id === targetDog.id;
              const isWrong = wrongGuesses && wrongGuesses.includes(c.id);
              // Only dim other cards if the correct card was picked
              const isDimmed = selected && !isSelected && selected.id === targetDog.id;
              // Remove blur logic for timer
              const isDisabled = isCorrect || isWrong || timer === 0;
              // Show '+1' if this card is the correct one and just unlocked AND is_unlocked is true
              const showPlusOneOnCard = newUnlock === c.id && isCorrect && newCoatActuallyUnlocked;
              return (
                <RNAnimated.View
                  key={c.id}
                  style={[
                    quizStyles.cardSlot,
                    {
                      opacity: cardEntranceAnims[idx]?.opacity,
                      transform: [{ translateY: cardEntranceAnims[idx]?.translateY || 0 }],
                    },
                  ]}
                >
                <Pressable
                  style={({ hovered, pressed }) => [
                    quizStyles.card,
                    quizStyles.cardFill,
                    hovered && quizStyles.cardHover,
                    pressed && quizStyles.cardPressed,
                    isCorrect && quizStyles.correctReveal,
                    isWrong && quizStyles.wrongBlur,
                    isDimmed && quizStyles.dimmedCard,
                    // Only apply opacity fade to disabled cards that are NOT the correct one
                    isDisabled && !isCorrect && !isWrong && { opacity: 0.7 },
                  ]}
                  onPress={() => handlePick(c)}
                  disabled={isDisabled}
                >
                  <Image
                    source={getQuizImageSource(c)}
                    style={quizStyles.image}
                    contentFit="cover"
                    blurRadius={isWrong ? 7 : 0}
                  />
                  {/* Remove dog name label entirely. Show '+1 Coat Unlocked' in small rainbow text if new coat is unlocked. */}
                  {isCorrect ? <View pointerEvents="none" style={quizStyles.correctTapOverlay} /> : null}
                  {showPlusOneOnCard && (
                    <ThemedText
                      type="default"
                      style={{
                        position: 'absolute',
                        left: 0,
                        bottom: 0,
                        width: '100%',
                        minHeight: 38,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 15,
                        fontWeight: 'bold',
                        textTransform: 'lowercase',
                        color: '#fff',
                        background: 'linear-gradient(90deg, red, orange, yellow, green, blue, indigo, violet)',
                        opacity: 0.92,
                        borderBottomLeftRadius: 12,
                        borderBottomRightRadius: 12,
                        boxShadow: '0 1px 8px #fff',
                        textShadow: '0 1px 8px #fff, 0 0 12px #FF9F1C, 0 0 4px #FF9F1C',
                        letterSpacing: 0.5,
                        textAlign: 'center',
                        elevation: 2,
                        filter: 'drop-shadow(0 0 8px #fff)',
                        animation: 'rainbowFlash 1.2s linear infinite',
                        zIndex: 20,
                        pointerEvents: 'none',
                        overflow: 'hidden',
                        padding: '6px 0 4px 0',
                      }}
                    >
                      +1 coat unlocked
                      {typeof window !== 'undefined' && (
                        <style>{`
                          @keyframes rainbowFlash {
                            0% { filter: hue-rotate(0deg); }
                            20% { filter: hue-rotate(72deg); }
                            40% { filter: hue-rotate(144deg); }
                            60% { filter: hue-rotate(216deg); }
                            80% { filter: hue-rotate(288deg); }
                            100% { filter: hue-rotate(360deg); }
                          }
                        `}</style>
                      )}
                    </ThemedText>
                  )}
                </Pressable>
                </RNAnimated.View>
              );
            })}
          </Animated.View>
          </RNAnimated.View>
          <View style={{ width: '100%', alignItems: 'center', marginTop: -2, paddingBottom: 14 }}>
            <Pressable
              onPress={() => setShowExitConfirm(true)}
              style={({ hovered, pressed }) => [
                quizStyles.switchLink,
                hovered && quizStyles.switchLinkHover,
                pressed && quizStyles.switchLinkPressed,
              ]}>
              {({ hovered, pressed }) => (
                <ThemedText
                  style={[
                    quizStyles.switchLinkText,
                    hovered && quizStyles.switchLinkTextHover,
                    pressed && quizStyles.switchLinkTextPressed,
                  ]}>
                  ← Exit Quiz
                </ThemedText>
              )}
            </Pressable>
          </View>
              {/* Exit Quiz Confirmation Modal */}
              {showExitConfirm && (
                <View style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(0,0,0,0.32)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 1000,
                }}>
                  <View style={{
                    backgroundColor: 'rgba(255,246,232,0.97)',
                    borderRadius: 18,
                    padding: 28,
                    maxWidth: 340,
                    width: '90%',
                    alignItems: 'center',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                    elevation: 12,
                  }}>
                    <ThemedText style={{ fontSize: 20, fontWeight: '700', color: '#B23B3B', marginBottom: 10, textAlign: 'center' }}>
                      Abandon Quiz?
                    </ThemedText>
                    <ThemedText style={{ fontSize: 15, color: '#333', marginBottom: 22, textAlign: 'center', opacity: 0.85 }}>
                      Are you sure you want to exit? All progress will be lost.
                    </ThemedText>
                    <View style={{ flexDirection: 'row', gap: 16, justifyContent: 'center', width: '100%' }}>
                      <Pressable
                        onPress={() => setShowExitConfirm(false)}
                        style={({ hovered, pressed }) => ([
                          {
                            backgroundColor: '#EEE',
                            borderRadius: 8,
                            paddingVertical: 10,
                            paddingHorizontal: 22,
                            marginRight: 4,
                            minWidth: 80,
                            alignItems: 'center',
                            transform: pressed
                              ? [{ scale: 0.97 }]
                              : hovered
                                ? [{ scale: 1.06 }]
                                : undefined,
                            transition: 'background 0.2s, box-shadow 0.2s, transform 0.1s',
                          },
                        ])}
                      >
                        <ThemedText style={{ color: '#444', fontWeight: '600', fontSize: 16 }}>Cancel</ThemedText>
                      </Pressable>
                      <Pressable
                        onPress={goHomeWithSpinner}
                        style={({ hovered, pressed }) => ([
                          {
                            backgroundColor: '#F77777',
                            borderRadius: 8,
                            paddingVertical: 10,
                            paddingHorizontal: 22,
                            minWidth: 80,
                            alignItems: 'center',
                            transform: pressed
                              ? [{ scale: 0.97 }]
                              : hovered
                                ? [{ scale: 1.06 }]
                                : undefined,
                            transition: 'background 0.2s, box-shadow 0.2s, transform 0.1s',
                          },
                        ])}
                      >
                        <ThemedText style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Exit</ThemedText>
                      </Pressable>
                    </View>
                  </View>
                </View>
              )}
        </View>
      ) : null}

      {selected && targetDog ? (
        <View style={quizStyles.controls}>
          {/* Subtle reward animation for unlocking a coat is now only above the breed question */}
          {/* Removed new badge popup */}
          {/* Next button removed when answer is selected */}
        </View>
      ) : null}

      {isLeavingToHome ? (
        <SplashTransition overlay />
      ) : null}

      {/* Exit Quiz button moved inside dog images container above */}
    </ThemedView>
  );
}
