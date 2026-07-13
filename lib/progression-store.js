import {
  collection,
  doc,
  getDocs,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';

import { db } from './firebase-services';

export const XP_REWARDS = Object.freeze({
  CORRECT_ANSWER: 10,
  DAILY_QUIZ: 25,
  TEN_ANSWER_STREAK: 50,
  NEW_BREED: 25,
  NEW_COAT: 15,
});

export const COAT_UNLOCK_MILESTONES = Object.freeze([1, 3, 7, 15, 30]);
export const TRAINER_RANKS = Object.freeze([
  { minLevel: 1, name: 'Puppy Trainer' },
  { minLevel: 5, name: 'Dog Walker' },
  { minLevel: 10, name: 'Kennel Assistant' },
  { minLevel: 20, name: 'Breed Specialist' },
  { minLevel: 35, name: 'Breed Expert' },
  { minLevel: 50, name: 'Master Trainer' },
  { minLevel: 75, name: 'DoggyDex Champion' },
]);

export function xpRequiredForLevel(level) {
  return 75 + (Math.max(1, level) - 1) * 50;
}

export function getTrainerRank(level) {
  return [...TRAINER_RANKS]
    .reverse()
    .find((rank) => level >= rank.minLevel)?.name || TRAINER_RANKS[0].name;
}

export function getNextTrainerRank(level) {
  return TRAINER_RANKS.find((rank) => rank.minLevel > level) || null;
}

export function getLevelProgress(totalXP = 0) {
  const normalizedTotalXP = Math.max(0, Math.floor(Number(totalXP) || 0));
  let level = 1;
  let levelStartXP = 0;
  let nextLevelCost = xpRequiredForLevel(level);

  while (normalizedTotalXP >= levelStartXP + nextLevelCost) {
    levelStartXP += nextLevelCost;
    level += 1;
    nextLevelCost = xpRequiredForLevel(level);
  }

  const currentLevelXP = normalizedTotalXP - levelStartXP;

  return {
    totalXP: normalizedTotalXP,
    level,
    rank: getTrainerRank(level),
    currentLevelXP,
    xpForNextLevel: nextLevelCost,
    xpRemaining: nextLevelCost - currentLevelXP,
    levelStartXP,
    nextLevelTotalXP: levelStartXP + nextLevelCost,
    percentage: Math.min(100, Math.round((currentLevelXP / nextLevelCost) * 100)),
  };
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeCoatIds(availableCoatIds) {
  return [...new Set(
    (Array.isArray(availableCoatIds) ? availableCoatIds : [])
      .map((coatId) => String(coatId ?? '').trim())
      .filter(Boolean)
  )];
}

export async function recordCorrectAnswer({
  uid,
  breedId,
  breedName,
  availableCoatIds,
  answeredCoatId,
  correctStreak,
}) {
  if (!uid || !breedId) {
    throw new Error('A signed-in user and breed are required to record progression.');
  }

  const normalizedBreedId = String(breedId).trim();
  const coatIds = normalizeCoatIds(availableCoatIds);
  const normalizedAnsweredCoatId = String(answeredCoatId ?? '').trim();
  const userRef = doc(db, 'users', uid);
  const breedRef = doc(db, 'users', uid, 'breedProgress', normalizedBreedId);

  return runTransaction(db, async (transaction) => {
    const [userSnapshot, breedSnapshot] = await Promise.all([
      transaction.get(userRef),
      transaction.get(breedRef),
    ]);

    const userData = userSnapshot.exists() ? userSnapshot.data() : {};
    const breedData = breedSnapshot.exists() ? breedSnapshot.data() : {};
    const wasDiscovered = breedData.discovered === true;
    const isNewBreed = !wasDiscovered;
    const previousTimesCorrect = Math.max(0, Number(breedData.timesCorrect) || 0);
    const timesCorrect = previousTimesCorrect + 1;
    const previousUnlockedCoats = normalizeCoatIds(breedData.unlockedCoats);
    const eligibleCoatCount = COAT_UNLOCK_MILESTONES.filter(
      (milestone) => timesCorrect >= milestone
    ).length;
    const unlockCandidates = [
      ...(coatIds.includes(normalizedAnsweredCoatId) ? [normalizedAnsweredCoatId] : []),
      ...coatIds,
    ];
    const unlockedCoats = [...previousUnlockedCoats];
    for (const coatId of unlockCandidates) {
      if (unlockedCoats.length >= eligibleCoatCount) break;
      if (!unlockedCoats.includes(coatId)) unlockedCoats.push(coatId);
    }
    const newlyUnlockedCoats = unlockedCoats.filter(
      (coatId) => !previousUnlockedCoats.includes(coatId)
    );
    const streakBonusAwarded = correctStreak > 0 && correctStreak % 10 === 0;

    const xpAwarded = XP_REWARDS.CORRECT_ANSWER
      + (isNewBreed ? XP_REWARDS.NEW_BREED : 0)
      + newlyUnlockedCoats.length * XP_REWARDS.NEW_COAT
      + (streakBonusAwarded ? XP_REWARDS.TEN_ANSWER_STREAK : 0);

    const previousTotalXP = Math.max(0, Number(userData.totalXP) || 0);
    const totalXP = previousTotalXP + xpAwarded;
    const previousLevel = getLevelProgress(previousTotalXP).level;
    const levelProgress = getLevelProgress(totalXP);

    transaction.set(userRef, {
      totalXP,
      level: levelProgress.level,
      trainerRank: levelProgress.rank,
      progressionUpdatedAt: serverTimestamp(),
    }, { merge: true });

    transaction.set(breedRef, {
      breedId: normalizedBreedId,
      breedName: breedName || breedData.breedName || normalizedBreedId,
      discovered: true,
      unlockedCoats,
      timesCorrect,
      firstDiscoveredAt: wasDiscovered
        ? (breedData.firstDiscoveredAt ?? serverTimestamp())
        : serverTimestamp(),
      lastCorrectAt: serverTimestamp(),
    }, { merge: true });

    return {
      xpAwarded,
      totalXP,
      previousLevel,
      level: levelProgress.level,
      rank: levelProgress.rank,
      didLevelUp: levelProgress.level > previousLevel,
      isNewBreed,
      newlyUnlockedCoats,
      unlockedCoats,
      timesCorrect,
      streakBonusAwarded,
    };
  });
}

export async function awardDailyQuizCompletion(uid, date = new Date()) {
  if (!uid) return null;

  const dateKey = getLocalDateKey(date);
  const userRef = doc(db, 'users', uid);

  return runTransaction(db, async (transaction) => {
    const userSnapshot = await transaction.get(userRef);
    const userData = userSnapshot.exists() ? userSnapshot.data() : {};

    if (userData.lastDailyQuizBonusDate === dateKey) {
      return { awarded: false, xpAwarded: 0 };
    }

    const previousTotalXP = Math.max(0, Number(userData.totalXP) || 0);
    const totalXP = previousTotalXP + XP_REWARDS.DAILY_QUIZ;
    const previousLevel = getLevelProgress(previousTotalXP).level;
    const levelProgress = getLevelProgress(totalXP);

    transaction.set(userRef, {
      totalXP,
      level: levelProgress.level,
      trainerRank: levelProgress.rank,
      lastDailyQuizBonusDate: dateKey,
      lastQuizCompletedAt: serverTimestamp(),
      progressionUpdatedAt: serverTimestamp(),
    }, { merge: true });

    return {
      awarded: true,
      xpAwarded: XP_REWARDS.DAILY_QUIZ,
      totalXP,
      previousLevel,
      level: levelProgress.level,
      rank: levelProgress.rank,
      didLevelUp: levelProgress.level > previousLevel,
    };
  });
}

export async function loadBreedProgress(uid) {
  if (!uid) return [];

  const snapshot = await getDocs(collection(db, 'users', uid, 'breedProgress'));
  return snapshot.docs.map((breedDoc) => ({ id: breedDoc.id, ...breedDoc.data() }));
}
