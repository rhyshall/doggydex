import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { auth } from '@/lib/firebase-services';
import { loadUserProgress, saveUserProgress } from '@/lib/progress-store';
import { commonStyles } from '@/styles/common';
import { quizStyles } from '@/styles/quizStyles';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

const DOGS = [
  { id: 'labrador-yellow', breed: 'Labrador Retriever', coat: 'Yellow', uri: 'https://images.dog.ceo/breeds/labrador/n02099712_5640.jpg' },
  { id: 'labrador-black', breed: 'Labrador Retriever', coat: 'Black', uri: 'https://images.dog.ceo/breeds/labrador/n02099712_1978.jpg' },
  { id: 'pug-fawn', breed: 'Pug', coat: 'Fawn', uri: 'https://images.dog.ceo/breeds/pug/n02110958_15761.jpg' },
  { id: 'pug-black', breed: 'Pug', coat: 'Black', uri: 'https://images.dog.ceo/breeds/pug/n02110958_8270.jpg' },
  { id: 'germanshepherd-tan', breed: 'German Shepherd', coat: 'Tan & Black', uri: 'https://images.dog.ceo/breeds/germanshepherd/n02106662_5705.jpg' },
  { id: 'germanshepherd-sable', breed: 'German Shepherd', coat: 'Sable', uri: 'https://images.dog.ceo/breeds/germanshepherd/n02106662_2169.jpg' },
  { id: 'golden-light', breed: 'Golden Retriever', coat: 'Light Golden', uri: 'https://images.dog.ceo/breeds/retriever/golden/n02099601_3004.jpg' },
  { id: 'golden-dark', breed: 'Golden Retriever', coat: 'Dark Golden', uri: 'https://images.dog.ceo/breeds/retriever/golden/n02099601_5159.jpg' },
];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const BREEDS = [...new Set(DOGS.map((dog) => dog.breed))];
const BREED_BADGES_KEY = 'breedBadges';

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

export default function QuizScreen() {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState(null);
  const [collection, setCollection] = useState([]);
  const [badges, setBadges] = useState([]);
  const [newUnlock, setNewUnlock] = useState(null);
  const [newBadge, setNewBadge] = useState(null);
  const [syncNotice, setSyncNotice] = useState(null);
  const collectionRef = useRef([]);
  const lastTargetImageUriRef = useRef(null);

  useEffect(() => {
    collectionRef.current = collection;
  }, [collection]);

  const loadCollection = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem('dogCollection');
      const parsed = stored ? JSON.parse(stored) : [];
      const normalized = Array.isArray(parsed) ? parsed : [];
      setCollection(normalized);
      return normalized;
    } catch (e) {
      console.warn('Failed to load collection', e);
      return [];
    }
  }, []);

  const loadBadges = useCallback(async () => {
    try {
      const storedBadges = await AsyncStorage.getItem(BREED_BADGES_KEY);
      if (storedBadges) {
        const parsedBadges = JSON.parse(storedBadges);
        const normalized = Array.isArray(parsedBadges) ? parsedBadges : [];
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

  const getCurrentUid = useCallback(() => auth.currentUser?.uid ?? null, []);

  const loadProgress = useCallback(async () => {
    const localCollection = await loadCollection();
    const localBadges = await loadBadges();
    const uid = getCurrentUid();

    if (!uid) {
      return;
    }

    try {
      const remoteProgress = await loadUserProgress(uid);

      if (remoteProgress && (remoteProgress.collection.length || remoteProgress.badges.length)) {
        setCollection(remoteProgress.collection);
        setBadges(remoteProgress.badges);
        await AsyncStorage.setItem('dogCollection', JSON.stringify(remoteProgress.collection));
        await AsyncStorage.setItem(BREED_BADGES_KEY, JSON.stringify(remoteProgress.badges));
        return;
      }

      if (localCollection.length || localBadges.length) {
        await saveUserProgress(uid, {
          collection: localCollection,
          badges: localBadges,
        });
      }
    } catch (e) {
      console.warn('Failed to sync progress from cloud', e);
      setSyncNotice('Cloud sync is unavailable. Progress is saved on this device.');
    }
  }, [getCurrentUid, loadBadges, loadCollection]);

  useEffect(() => {
    loadProgress();
  }, [loadProgress]);

  async function unlockDog(dogId) {
    if (collection.includes(dogId)) {
      return { isNew: false, updatedCollection: collection };
    }

    const updated = [...collection, dogId];
    setCollection(updated);

    try {
      await AsyncStorage.setItem('dogCollection', JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to save collection', e);
    }

    try {
      const uid = getCurrentUid();
      if (uid) {
        await saveUserProgress(uid, {
          collection: updated,
          badges,
        });
      }
    } catch (e) {
      console.warn('Failed to sync collection to cloud', e);
    }

    return { isNew: true, updatedCollection: updated };
  }

  function pickWeightedCoatForBreed(breed, unlockedSet, previousTargetUri = null) {
    const variants = DOGS.filter((dog) => dog.breed === breed);
    const pickedVariant = weightedPick(
      variants,
      (variant) => (unlockedSet.has(variant.id) ? 1 : 3)
    );

    const chosenUri = pickImageUri(pickedVariant, previousTargetUri);
    return { ...pickedVariant, uri: chosenUri };
  }

  const { choices, targetIndex } = useMemo(() => {
    const unlockedSet = new Set(collectionRef.current);
    const previousImageUri = questionIndex === 0 ? null : lastTargetImageUriRef.current;

    const targetBreed = weightedPick(
      BREEDS,
      (breed) => {
        const coats = DOGS.filter((dog) => dog.breed === breed);
        const isCompleted = coats.every((coat) => unlockedSet.has(coat.id));
        return isCompleted ? 1 : 3;
      }
    );

    const targetDog = pickWeightedCoatForBreed(
      targetBreed,
      unlockedSet,
      previousImageUri
    );

    lastTargetImageUriRef.current = targetDog.uri;

    const otherBreeds = BREEDS.filter((breed) => breed !== targetBreed);
    const distractorBreeds = [];

    while (distractorBreeds.length < 3 && otherBreeds.length > 0) {
      const selectedBreed = weightedPick(
        otherBreeds,
        (breed) => {
          const coats = DOGS.filter((dog) => dog.breed === breed);
          const isCompleted = coats.every((coat) => unlockedSet.has(coat.id));
          return isCompleted ? 1 : 3;
        }
      );

      distractorBreeds.push(selectedBreed);
      const removeIndex = otherBreeds.indexOf(selectedBreed);
      otherBreeds.splice(removeIndex, 1);
    }

    const distractors = distractorBreeds.map((breed) => pickWeightedCoatForBreed(breed, unlockedSet));
    const shuffledChoices = shuffle([targetDog, ...distractors]);
    const computedTargetIndex = shuffledChoices.findIndex((choice) => choice.id === targetDog.id);

    return { choices: shuffledChoices, targetIndex: computedTargetIndex };
  }, [questionIndex]);

  const targetDog = choices[targetIndex];

  async function handlePick(dog) {
    if (selected) return;
    setSelected(dog);

    if (dog.id === targetDog.id) {
      setScore((s) => s + 1);
      const { isNew, updatedCollection } = await unlockDog(targetDog.id);

      if (isNew) setNewUnlock(targetDog);

      const breedCoats = DOGS.filter((variant) => variant.breed === targetDog.breed);
      const isBreedCompleted = breedCoats.every((variant) => updatedCollection.includes(variant.id));

      if (isBreedCompleted && !badges.includes(targetDog.breed)) {
        const updatedBadges = [...badges, targetDog.breed];
        setBadges(updatedBadges);
        setNewBadge(targetDog.breed);

        try {
          await AsyncStorage.setItem(BREED_BADGES_KEY, JSON.stringify(updatedBadges));
        } catch (e) {
          console.warn('Failed to save breed badges', e);
        }

        try {
          const uid = getCurrentUid();
          if (uid) {
            await saveUserProgress(uid, {
              collection: updatedCollection,
              badges: updatedBadges,
            });
          }
        } catch (e) {
          console.warn('Failed to sync badges to cloud', e);
        }
      }
    }
  }

  function next() {
    setSelected(null);
    setNewUnlock(null);
    setNewBadge(null);
    setQuestionIndex((q) => q + 1);
  }

  return (
    <ThemedView style={quizStyles.container}>
      <View style={quizStyles.header}>
        <ThemedText type="title" style={quizStyles.title}>DoggyDex</ThemedText>
        <ThemedText style={quizStyles.scoreText}>{`Score: ${score}`}</ThemedText>
      </View>

      <ThemedText type="subtitle" style={quizStyles.prompt}>Tap the photo of: {targetDog.breed}</ThemedText>
      {syncNotice ? <ThemedText style={quizStyles.hint}>{syncNotice}</ThemedText> : null}

      <View style={quizStyles.grid}>
        {choices.map((c) => {
          const correct = selected && c.id === targetDog.id;
          const wrong = selected && c.id === selected.id && c.id !== targetDog.id;
          return (
            <Pressable
              key={c.id}
              style={[quizStyles.card, correct && quizStyles.correct, wrong && quizStyles.wrong]}
              onPress={() => handlePick(c)}>
              <Image source={{ uri: c.uri }} style={quizStyles.image} />
              {selected ? (
                <ThemedText type="default" style={quizStyles.cardLabel}>{c.breed}</ThemedText>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {selected ? (
        <View style={quizStyles.controls}>
          <ThemedText style={quizStyles.resultText}>
            {selected.id === targetDog.id ? 'Correct!' : `Wrong — it was ${targetDog.breed}`}
          </ThemedText>
          {newUnlock && (
            <View style={quizStyles.unlockBanner}>
              <ThemedText style={quizStyles.unlockTitle}>✨ NEW COAT UNLOCKED!</ThemedText>
              <ThemedText style={quizStyles.unlockText}>DoggyDex updated: {newUnlock.breed} ({newUnlock.coat})</ThemedText>
            </View>
          )}
          {newBadge ? (
            <View style={quizStyles.badgeBanner}>
              <ThemedText style={quizStyles.badgeText}>⭐ Breed badge earned: {newBadge}</ThemedText>
            </View>
          ) : null}
          <Pressable
            style={({ hovered, pressed }) => [
              commonStyles.playButton,
              commonStyles.nextButton,
              quizStyles.nextButton,
              (hovered || pressed) && quizStyles.nextButtonHover,
              pressed && quizStyles.buttonPressed,
            ]}
            onPress={next}>
            <ThemedText type="subtitle" style={quizStyles.nextButtonLabel}>Next</ThemedText>
          </Pressable>
          <Link href="/" asChild>
            <Pressable
              style={({ hovered, pressed }) => [
                quizStyles.backLink,
                (hovered || pressed) && quizStyles.backLinkHover,
              ]}>
              {({ hovered, pressed }) => (
                <ThemedText
                  style={[
                    quizStyles.backLinkText,
                    (hovered || pressed) && quizStyles.backLinkTextHover,
                  ]}>
                  Back
                </ThemedText>
              )}
            </Pressable>
          </Link>
        </View>
      ) : (
        <ThemedText style={quizStyles.hint}>Choose an image above</ThemedText>
      )}
    </ThemedView>
  );
}
