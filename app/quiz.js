import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { auth, db } from '@/lib/firebase-services';
import { loadUserProgress, saveUserProgress } from '@/lib/progress-store';
import { indexVariantsByBreed } from '@/lib/storage-coat-variants';
import { commonStyles } from '@/styles/common';
import { quizStyles } from '@/styles/quizStyles';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { collection as firestoreCollection, getDocs, query, where } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

const QUIZ_IMAGE_BASE_URL = 'https://storage.googleapis.com/doggydex-storage-f83a1/img/';

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const BREED_BADGES_KEY = 'breedBadges';
const MIN_BREEDS_PER_QUESTION = 4;

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

export default function QuizScreen() {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState(null);
  const [collection, setCollection] = useState([]);
  const [badges, setBadges] = useState([]);
  const [newUnlock, setNewUnlock] = useState(null);
  const [newBadge, setNewBadge] = useState(null);
  const [syncNotice, setSyncNotice] = useState(null);
  const [cloudQuizNotice, setCloudQuizNotice] = useState(null);
  const [isCloudQuizLoading, setIsCloudQuizLoading] = useState(true);
  const [storageVariantMap, setStorageVariantMap] = useState({});
  const [lives, setLives] = useState(3);
  const lastTargetImageUriRef = useRef(null);

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

  useEffect(() => {
    let isCancelled = false;

    async function loadStorageVariants() {
      setIsCloudQuizLoading(true);
      setCloudQuizNotice(null);

      const [coatsSnapshot, breedsSnapshot] = await Promise.all([
        getDocs(query(firestoreCollection(db, 'coats'), where('image_exists', '==', true))),
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

          if (!breedId || !imgFilename) {
            return null;
          }

          const breedNameFromDoc = typeof data.breed_name === 'string' ? data.breed_name.trim() : '';
          const colorName = typeof data.color_name === 'string' ? data.color_name.trim() : '';
          const coatName = typeof data.coat_name === 'string' ? data.coat_name.trim() : '';

          const breedLabel = breedNameFromDoc || breedNameById.get(breedId) || toTitleCaseFromId(breedId);
          const coatLabel = colorName || coatName || coatDoc.id;

          return {
            id: coatDoc.id,
            breed: breedLabel,
            breedId,
            coat: coatLabel,
            imgFilename,
          };
        })
        .filter(Boolean);

      const cloudBackedVariants = coatsWithImageFiles.map((variant) => {
        // Add cache-busting query parameter
        const cacheBust = `?v=${Date.now()}`;
        const uri = `${QUIZ_IMAGE_BASE_URL}${variant.imgFilename}${cacheBust}`;

        return {
          ...variant,
          uri,
          images: [uri],
        };
      });

      if (isCancelled) {
        return;
      }

      const variantsByBreed = indexVariantsByBreed(cloudBackedVariants);
      setStorageVariantMap(variantsByBreed);

      const availableBreeds = Object.keys(variantsByBreed);
      if (availableBreeds.length < MIN_BREEDS_PER_QUESTION) {
        setCloudQuizNotice(
          `Cloud quiz setup incomplete (${availableBreeds.length}/${MIN_BREEDS_PER_QUESTION} breeds ready from ${coatsWithImageFiles.length} coats where image_exists=true).`
        );
      } else {
        setCloudQuizNotice(null);
      }

      setIsCloudQuizLoading(false);
    }

    loadStorageVariants().catch((error) => {
      console.warn('Failed to load quiz options from Firestore/Storage', error);
      if (isCancelled) {
        return;
      }

      setStorageVariantMap({});
      const errorCode = typeof error?.code === 'string' ? error.code : null;
      setCloudQuizNotice(
        errorCode
          ? `Cloud quiz request failed (${errorCode}). Check coats.image_exists/img_filename and Storage bucket img files.`
          : 'Cloud quiz request failed. Check coats.image_exists/img_filename and Storage bucket img files.'
      );
      setIsCloudQuizLoading(false);
    });

    return () => {
      isCancelled = true;
    };
  }, []);

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

  const { choices, targetIndex } = useMemo(() => {
    const availableBreeds = Object.keys(storageVariantMap).filter((breed) => {
      const variants = storageVariantMap[breed];
      return Array.isArray(variants) && variants.length > 0;
    });

    if (availableBreeds.length < MIN_BREEDS_PER_QUESTION) {
      return { choices: [], targetIndex: -1 };
    }

    const previousImageUri = questionIndex === 0 ? null : lastTargetImageUriRef.current;

    const targetBreed = weightedPick(availableBreeds, () => 1);
    const targetDog = pickRandomCoatForBreed(targetBreed, previousImageUri);

    if (!targetDog) {
      return { choices: [], targetIndex: -1 };
    }

    lastTargetImageUriRef.current = targetDog.uri;

    const distractorBreeds = shuffle(
      availableBreeds.filter((breed) => breed !== targetBreed)
    ).slice(0, 3);

    const distractors = distractorBreeds
      .map((breed) => pickRandomCoatForBreed(breed))
      .filter(Boolean);

    if (distractors.length < 3) {
      return { choices: [], targetIndex: -1 };
    }

    const shuffledChoices = shuffle([targetDog, ...distractors]);
    const computedTargetIndex = shuffledChoices.findIndex((choice) => choice.id === targetDog.id);

    return { choices: shuffledChoices, targetIndex: computedTargetIndex };
  }, [questionIndex, pickRandomCoatForBreed, storageVariantMap]);

  const targetDog = targetIndex >= 0 ? choices[targetIndex] : null;

  async function handlePick(dog) {
    if (selected || !targetDog || lives === 0) return;
    setSelected(dog);

    if (dog.id === targetDog.id) {
      setScore((s) => s + 1);
      const { isNew, updatedCollection } = await unlockDog(targetDog.id);

      if (isNew) setNewUnlock(targetDog);

      const breedCoats = storageVariantMap[targetDog.breed] || [];
      const isBreedCompleted = breedCoats.length > 0
        && breedCoats.every((variant) => updatedCollection.includes(variant.id));

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
    } else {
      setLives((l) => Math.max(0, l - 1));
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
      <View style={quizStyles.grassBackground} />
      <View style={quizStyles.header}>
        <Link href="/" style={quizStyles.backButton}>
          <ThemedText style={quizStyles.backButton}>Back</ThemedText>
        </Link>
      </View>
      <View style={quizStyles.scoreHeartsContainer}>
        <View style={quizStyles.scoreHeartsRow}>
          <ThemedText style={quizStyles.scoreText}>{`Score: ${score}`}</ThemedText>
          <View style={quizStyles.heartsRow}>
            {Array.from({ length: 3 }).map((_, i) => (
              <ThemedText key={i} style={quizStyles.heartIcon(lives > i)}>
                ♥
              </ThemedText>
            ))}
          </View>
        </View>
      </View>
      {targetDog ? (
        <>
          <View style={{ alignItems: 'center', width: '100%' }}>
            <ThemedText type="subtitle" style={quizStyles.promptLarge}>
              <span style={{
                color: 'black',
                fontWeight: 500,
                fontSize: 20,
                textShadow: '0 0 2px #FF8C66, 0 0 1px #FF8C66',
                fontFamily: 'inherit',
                verticalAlign: 'middle',
                display: 'inline-block',
                marginTop: '-2px',
              }}>
                {targetDog.breed}
              </span>
            </ThemedText>
          </View>
        </>
      ) : null}
      {isCloudQuizLoading ? (
        <ThemedText style={quizStyles.hint}>Loading quiz breeds with cloud images...</ThemedText>
      ) : null}
      {syncNotice ? <ThemedText style={quizStyles.hint}>{syncNotice}</ThemedText> : null}
      {!isCloudQuizLoading && cloudQuizNotice ? <ThemedText style={quizStyles.hint}>{cloudQuizNotice}</ThemedText> : null}

      {targetDog ? (
        <View style={quizStyles.grid}>
          {choices.map((c) => {
            const correct = selected && c.id === targetDog.id;
            const wrong = selected && c.id === selected.id && c.id !== targetDog.id;
            return (
              <Pressable
                key={c.id}
                style={({ hovered, pressed }) => [
                  quizStyles.card,
                  hovered && quizStyles.cardHover,
                  selected && c.id === targetDog.id && quizStyles.correctReveal,
                  wrong && quizStyles.wrongReveal,
                ]}
                onPress={() => handlePick(c)}>
                <Image source={{ uri: c.uri }} style={quizStyles.image} contentFit="cover" />
                {selected && selected.id === c.id ? (
                  <ThemedText type="default" style={quizStyles.cardLabel}>{c.breed}</ThemedText>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {selected && targetDog ? (
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
        </View>
      ) : null}

      <View style={quizStyles.bottomBackWrap}>
        <Link href="/" asChild>
          <Pressable
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
                ← Back
              </ThemedText>
            )}
          </Pressable>
        </Link>
      </View>
    </ThemedView>
  );
}
