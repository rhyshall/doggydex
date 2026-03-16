import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { DOGGYDEX_CORAL_RED } from '@/constants/theme';
import { auth, db } from '@/lib/firebase-services';
import { loadUserProgress, saveUserProgress } from '@/lib/progress-store';
import { indexVariantsByBreed } from '@/lib/storage-coat-variants';
import { quizStyles } from '@/styles/quizStyles';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { doc, collection as firestoreCollection, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Easing, Pressable, Animated as RNAnimated, View } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

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
    // For fading in score, best streak, and high score after score
    const [showHighScore, setShowHighScore] = useState(false);
    const scoreOpacity = useRef(new RNAnimated.Value(0)).current;
    const bestStreakOpacity = useRef(new RNAnimated.Value(0)).current;
    // Score scale animation
    const scoreScale = useRef(new RNAnimated.Value(0.7)).current;
    const highScoreOpacity = useRef(new RNAnimated.Value(0)).current;
    const buttonsOpacity = useRef(new RNAnimated.Value(0)).current;
      // Track best streak
      const [bestStreak, setBestStreak] = useState(0);
      const [currentStreak, setCurrentStreak] = useState(0);
    // High score state
    const [highScore, setHighScore] = useState(null);
    const [isNewHighScore, setIsNewHighScore] = useState(false);
    // Game over modal state
    const [showGameOver, setShowGameOver] = useState(false);
    // Out of Lives modal scale animation
    const modalScale = useRef(new RNAnimated.Value(0.92)).current;
    // Ensure storageVariantMap is defined before any use
    const [storageVariantMap, setStorageVariantMap] = useState({});
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
  const gridSlideX = useSharedValue(0); // 0=center, -80=slide left, +80=slide right
  const gridOpacity = useSharedValue(1);
  const gridAnimating = useRef(false);

  // Animated style for the dog card grid
  const dogGridStyle = useAnimatedStyle(() => {
    // As gridOpacity goes from 1 to 0, scale from 1 to 0.82 (more dramatic)
    const scale = 1 - 0.18 * (1 - gridOpacity.value);
    // For web, add blur as it fades out
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
    const [showPlusOne, setShowPlusOne] = useState(false);
    const [plusOneStyle, setPlusOneStyle] = useState({});
    const [plusOnePulse, setPlusOnePulse] = useState(false);
    // For orange pulse
    const DOGGYDEX_ORANGE = '#FF9F1C';
    const DOGGYDEX_ORANGE_DARK = '#e07c00';
    const [scorePulse, setScorePulse] = useState(false);
    const plusOneAnimRef = useRef({});


    // Track which card to blur when timer hits 0
    const [blurredCardId, setBlurredCardId] = useState(null);

    // Ensure questionIndex is defined before any use
    const [questionIndex, setQuestionIndex] = useState(0);

    // Ensure storageVariantMap is defined before any use
    // Duplicate declaration removed

    useEffect(() => {
      if (timer <= 0) return;
      const interval = setInterval(() => {
        setTimer((prev) => (prev > 0 ? prev - 1 : 0));
        setPulse((p) => !p);
      }, 1000);
      return () => clearInterval(interval);
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

    const { choices, targetIndex } = useMemo(() => {
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

      // Shuffle and pick breeds for this question
      const pickedBreeds = shuffle(pickFrom).slice(0, MIN_BREEDS_PER_QUESTION);
      // Pick target
      const targetIdx = Math.floor(Math.random() * pickedBreeds.length);
      const targetBreed = pickedBreeds[targetIdx];

      // Generate choices with images
      const choices = pickedBreeds.map((breed, i) => {
        const variant = pickRandomCoatForBreed(breed);
        if (!variant) return null;
        return {
          ...variant,
          breed,
          id: variant.id || `${breed}_${i}`,
        };
      }).filter(Boolean);

      // If any choice is missing, skip this question
      if (choices.length < MIN_BREEDS_PER_QUESTION) {
        return { choices: [], targetIndex: -1 };
      }

      // Update recent breeds
      if (targetBreed) {
        recentBreedsRef.current = [
          ...recentBreedsRef.current.slice(-9),
          targetBreed,
        ];
      }

      return { choices, targetIndex: targetIdx };
    }, [questionIndex, pickRandomCoatForBreed, storageVariantMap]) || { choices: [], targetIndex: -1 };

    // When timer hits 0, blur a random incorrect card (must be after choices/targetIndex are defined)
    useEffect(() => {
      if (
        typeof choices !== 'undefined' &&
        Array.isArray(choices) &&
        choices.length > 0 &&
        typeof targetIndex === 'number' &&
        targetIndex >= 0
      ) {
        if (timer === 0) {
          // Find all incorrect card indices
          const incorrectIndices = choices.map((c, i) => i).filter(i => i !== targetIndex);
          if (incorrectIndices.length > 0) {
            const randomIdx = incorrectIndices[Math.floor(Math.random() * incorrectIndices.length)];
            setBlurredCardId(choices[randomIdx].id);
          }
        } else if (timer > 0) {
          setBlurredCardId(null);
        }
      } else {
        setBlurredCardId(null);
      }
    }, [timer, choices, targetIndex]);
  // (moved above)
  const [score, setScore] = useState(0);
  // Track selected correct card, and wrong guesses
  const [selected, setSelected] = useState(null); // selected correct card
  const [wrongGuesses, setWrongGuesses] = useState([]); // array of dog ids guessed wrong

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
  const [collection, setCollection] = useState([]);
  const [badges, setBadges] = useState([]);
  const [newUnlock, setNewUnlock] = useState(null);
  const [newBadge, setNewBadge] = useState(null);
  const [syncNotice, setSyncNotice] = useState(null);
  const [cloudQuizNotice, setCloudQuizNotice] = useState(null);
  const [isCloudQuizLoading, setIsCloudQuizLoading] = useState(true);
  // Duplicate declaration removed
  const [lives, setLives] = useState(3);
  const [heartPulse, setHeartPulse] = useState(null); // index of heart to pulse
  const [heartPulseColor, setHeartPulseColor] = useState(null); // color for pulsing heart
  const lastTargetImageUriRef = useRef(null);

  // Show game over modal when lives reach zero
  useEffect(() => {
    if (lives === 0) {
      // Reset opacities before showing modal
      scoreOpacity.setValue(0);
      bestStreakOpacity.setValue(0);
      highScoreOpacity.setValue(0);
      buttonsOpacity.setValue(0);
      setShowHighScore(false);
      // On game over, check and update high score
      (async () => {
        const user = auth.currentUser;
        let prevHigh = 0;
        if (user) {
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
              // Also update highScore in usernames collection if username exists
              const username = user.displayName || user.email || null;
              if (username) {
                // Use the same normalization as user-store.js
                const normalizeUsername = (value) => typeof value === 'string' ? value.trim() : '';
                const toUsernameKey = (value) => normalizeUsername(value).toLowerCase();
                const usernameKey = toUsernameKey(username);
                if (usernameKey) {
                  const usernameRef = doc(db, 'usernames', usernameKey);
                  await setDoc(usernameRef, { highScore: score }, { merge: true });
                }
              }
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
        // Show modal after 300ms
        setTimeout(() => {
          setShowGameOver(true);
          // Animate modal scale pop effect
          modalScale.setValue(0.92);
          RNAnimated.sequence([
            RNAnimated.timing(modalScale, {
              toValue: 1.05,
              duration: 110,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
            RNAnimated.timing(modalScale, {
              toValue: 1,
              duration: 110,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            })
          ]).start();
          // Fade in score after 500ms
          setTimeout(() => {
            RNAnimated.parallel([
              RNAnimated.timing(scoreOpacity, {
                toValue: 1,
                duration: 400,
                useNativeDriver: true,
              }),
              RNAnimated.sequence([
                RNAnimated.timing(scoreScale, {
                  toValue: 1.2,
                  duration: 100,
                  useNativeDriver: true,
                }),
                RNAnimated.timing(scoreScale, {
                  toValue: 1,
                  duration: 100,
                  useNativeDriver: true,
                })
              ])
            ]).start(() => {
              // Fade in best streak after 500ms
              setTimeout(() => {
                RNAnimated.timing(bestStreakOpacity, {
                  toValue: 1,
                  duration: 400,
                  useNativeDriver: true,
                }).start(() => {
                  // Fade in high score after 300ms
                  setTimeout(() => {
                    setShowHighScore(true);
                  }, 300);
                });
              }, 500);
            });
          }, 500);
        }, 300);
      })();
    }
  }, [lives]);

  // Animate high score fade-in when showHighScore becomes true
  useEffect(() => {
    if (showHighScore) {
      RNAnimated.timing(highScoreOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start(() => {
        // Fade in buttons after 300ms
        setTimeout(() => {
          RNAnimated.timing(buttonsOpacity, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }).start();
        }, 300);
      });
    } else {
      highScoreOpacity.setValue(0);
      buttonsOpacity.setValue(0);
    }
  }, [showHighScore]);

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

  // Duplicate declaration removed

  // Track last 10 breeds to prevent repeats (already declared earlier)
  // const recentBreedsRef = useRef([]); // Removed duplicate

  // Duplicate declaration removed

  const targetDog = targetIndex >= 0 ? choices[targetIndex] : null;


  async function handlePick(dog) {
    if ((selected && selected.id === targetDog.id) || !targetDog || lives === 0 || transitioning) return;
    // If already guessed this wrong dog, do nothing
    if (wrongGuesses.includes(dog.id)) return;

    if (dog.id === targetDog.id) {
      setSelected(dog);
      setTransitioning(true);
      gridSlideX.value = 0;
      gridOpacity.value = 1;
      gridSlideX.value = withTiming(-80, { duration: 600, easing: t => t < 0.5 ? 2*t*t : -1+(4-2*t)*t }, () => {
        // Slide finishes after fade
      });
      gridOpacity.value = withTiming(0, { duration: 750 }, () => {
        runOnJS(setPendingNext)(true);
      });
      const startLeft = 30 + Math.random() * 40;
      const driftX = (Math.random() - 0.5) * 120;
      const driftY = -120 - Math.random() * 60;
      const curve = (Math.random() - 0.5) * 40;
      setShowPlusOne(true);
      setPlusOnePulse(false);
      setPlusOneStyle({
        opacity: 1,
        position: 'absolute',
        left: `${startLeft}%`,
        top: 420,
        transform: `translate(-50%, 0) scale(1)`,
        color: DOGGYDEX_ORANGE,
        fontWeight: 900,
        fontSize: 15,
        letterSpacing: 1.1,
        pointerEvents: 'none',
        zIndex: 1000,
        border: '2px solid #fff',
        borderRadius: '8px',
        background: 'rgba(255,159,28,0.32)',
        padding: '1px 6px',
        boxShadow: `0 0 32px ${DOGGYDEX_ORANGE}, 0 0 12px #fff`,
        transition: 'all 1.5s cubic-bezier(0.4,1,0.6,1), color 0.5s cubic-bezier(0.4,1,0.6,1)',
        textShadow: `0 0 28px ${DOGGYDEX_ORANGE}, 0 0 12px ${DOGGYDEX_ORANGE}, 0 0 6px #fff`,
      });
      setTimeout(() => setPlusOnePulse(true), 200);
      setTimeout(() => {
        setScore((s) => s + 1);
        setScorePulse(true);
        setTimeout(() => setScorePulse(false), 1000);
      }, 400);
      setTimeout(() => {
        setPlusOneStyle((prev) => ({
          ...prev,
          opacity: 0,
          top: 30,
          transform: `translate(calc(-50% + ${driftX}px), ${driftY}px) scale(1.35) skewX(${curve}deg)`,
        }));
      }, 50);
      setTimeout(async () => {
        setShowPlusOne(false);
        const { isNew, updatedCollection } = await unlockDog(targetDog.id);
        if (isNew) setNewUnlock(targetDog);
        const breedCoats = storageVariantMap[targetDog.breed] || [];
        const isBreedCompleted = breedCoats.length > 0 && breedCoats.every((variant) => updatedCollection.includes(variant.id));
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
      }, 1550);
    } else {
      setWrongGuesses((prev) => [...prev, dog.id]);
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
    }
  }


  // When pendingNext is set (after grid slide out), update question and animate grid in
  useEffect(() => {
    if (pendingNext) {
      runOnJS(setSelected)(null);
      runOnJS(setNewUnlock)(null);
      runOnJS(setNewBadge)(null);
      runOnJS(setTimer)(30); // Reset timer to 30
      runOnJS(setQuestionIndex)((q) => q + 1);
      // Animate grid in from right
      gridSlideX.value = 80;
      gridOpacity.value = 0;
      gridSlideX.value = withTiming(0, { duration: 600, easing: t => t < 0.5 ? 2*t*t : -1+(4-2*t)*t });
      gridOpacity.value = withTiming(1, { duration: 550 }, () => {
        runOnJS(setTransitioning)(false);
        runOnJS(setPendingNext)(false);
      });
    }
  }, [pendingNext]);

  function next() {
    if (transitioning) return;
    // For manual next, animate grid out
    setTransitioning(true);
    gridSlideX.value = 0;
    gridOpacity.value = 1;
    gridSlideX.value = withTiming(-80, { duration: 350, easing: t => t < 0.5 ? 2*t*t : -1+(4-2*t)*t }, () => {
      gridOpacity.value = withTiming(0, { duration: 350 }, () => {
        runOnJS(setPendingNext)(true);
      });
    });
  }

  function handlePlayAgain() {
    setShowGameOver(false);
    setScore(0);
    setLives(3);
    setQuestionIndex(0);
    setSelected(null);
    setWrongGuesses([]);
    setNewUnlock(null);
    setNewBadge(null);
    setPendingNext(false);
    setTransitioning(false);
    setTimer(30);
    // Force refresh the question
    setTimeout(() => setQuestionIndex(1), 0);
  }

  return (
    <ThemedView style={quizStyles.container}>
      {/* DEBUG: Show state if nothing is rendering */}
      {(!targetDog || !choices || choices.length === 0) && !isCloudQuizLoading && (
        <View style={{ padding: 24, alignItems: 'center' }}>
          <ThemedText style={{ color: 'red', fontWeight: 'bold', fontSize: 18 }}>
            Debug: No dog images to show!
          </ThemedText>
          <ThemedText style={{ color: '#333', fontSize: 15, marginTop: 8 }}>
            {`targetDog: ${targetDog ? 'OK' : 'null'} | choices: ${choices ? choices.length : 'undefined'} | storageVariantMap breeds: ${storageVariantMap ? Object.keys(storageVariantMap).length : 'undefined'}`}
          </ThemedText>
          <ThemedText style={{ color: '#333', fontSize: 15, marginTop: 4 }}>
            {cloudQuizNotice ? `cloudQuizNotice: ${cloudQuizNotice}` : ''}
          </ThemedText>
        </View>
      )}
            {/* Game Over Modal */}
            {showGameOver && (
              <View style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.48)',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 2000,
              }}>
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
                  backgroundColor: 'rgba(255,255,255,0.97)',
                  borderRadius: 18,
                  padding: 18,
                  maxWidth: 340,
                  width: '96%',
                  alignItems: 'center',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 6 },
                  shadowOpacity: 0.15,
                  shadowRadius: 16,
                  elevation: 10,
                  position: 'relative',
                  zIndex: 3000,
                  gap: 8,
                  transform: [{ scale: modalScale }],
                }}>
                  <ThemedText style={{ fontSize: 22, fontWeight: '700', color: '#B23B3B', marginBottom: 18, textAlign: 'center', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <MaterialIcons
                      name="heart-broken"
                      size={30.5}
                      color={DOGGYDEX_CORAL_RED}
                      style={{ marginRight: 6, verticalAlign: 'middle' }}
                    />
                    Out of Lives!
                  </ThemedText>
                  {/* Stacked stat format */}
                  <View style={{ width: '100%', alignItems: 'center', marginBottom: 20 }}>
                    <RNAnimated.View style={{ opacity: scoreOpacity, width: '100%', marginBottom: 0 }}>
                      <ThemedText style={{ fontSize: 22, color: '#333', textAlign: 'center', fontWeight: '700', letterSpacing: 0.5 }}>
                        Score
                      </ThemedText>
                      <RNAnimated.View style={{
                        transform: [{ scale: scoreScale }],
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        <ThemedText style={{ fontWeight: '900', color: '#FF9F1C', fontSize: 48, textAlign: 'center', letterSpacing: 1.6, padding: 8, borderRadius: 12, textShadow: '0 1.5px 8px #FFD58088' }}>
                          <span style={{ textShadow: '0 0 8px rgba(255,165,0,0.3)' }}>{score}</span>
                        </ThemedText>
                      </RNAnimated.View>
                      {/* Divider fades in with stat */}
                      <RNAnimated.View style={{ opacity: scoreOpacity, width: '80%', height: 1, backgroundColor: 'rgba(0,0,0,0.08)', alignSelf: 'center', marginVertical: 3 }} />
                    </RNAnimated.View>
                    <RNAnimated.View style={{ opacity: bestStreakOpacity, width: '100%', marginBottom: 0 }}>
                      <ThemedText style={{ fontSize: 22, color: '#333', textAlign: 'center', fontWeight: '600', letterSpacing: 0.5, flexDirection: 'row', alignItems: 'center', display: 'flex', justifyContent: 'center', marginTop: 4 }}>
                        <MaterialIcons name="whatshot" size={22} color="#FF9F1C" style={{ marginRight: 6, verticalAlign: 'middle' }} />
                        Best Streak
                      </ThemedText>
                      <ThemedText style={{ fontWeight: '600', color: isNewHighScore ? '#FF9F1C' : '#444', fontSize: 26, textAlign: 'center', letterSpacing: 1.2, padding: 6, borderRadius: 10, textShadow: isNewHighScore ? '0 1.5px 8px #FFD58088' : undefined }}>
                        {bestStreak}
                      </ThemedText>
                      {/* Divider fades in with stat */}
                      <RNAnimated.View style={{ opacity: bestStreakOpacity, width: '80%', height: 1, backgroundColor: 'rgba(0,0,0,0.08)', alignSelf: 'center', marginVertical: 3 }} />
                    </RNAnimated.View>
                    <RNAnimated.View style={{ opacity: highScoreOpacity, width: '100%', marginBottom: 0 }}>
                      <ThemedText style={{ fontSize: 22, color: '#333', textAlign: 'center', fontWeight: '600', letterSpacing: 0.5, flexDirection: 'row', alignItems: 'center', display: 'flex', justifyContent: 'center', marginTop: 4 }}>
                        <MaterialIcons name="emoji-events" size={22} color="#FFD700" style={{ marginRight: 6, verticalAlign: 'middle' }} />
                        High Score
                      </ThemedText>
                      <ThemedText style={{ fontWeight: '600', color: isNewHighScore ? '#FF9F1C' : '#444', fontSize: 26, textAlign: 'center', letterSpacing: 1.2, padding: 6, borderRadius: 10, textShadow: isNewHighScore ? '0 1.5px 8px #FFD58088' : undefined }}>
                        {highScore}
                        {isNewHighScore && (
                          <span style={{ color: '#FF9F1C', fontWeight: 700, animation: 'flashHighScore 1s steps(2, start) infinite', WebkitAnimation: 'flashHighScore 1s steps(2, start) infinite', fontSize: 16, marginLeft: 8 }}>
                            New!
                          </span>
                        )}
                      </ThemedText>
                    </RNAnimated.View>
                  </View>
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
                    gap: 16,
                    justifyContent: 'center',
                    width: '100%',
                    opacity: buttonsOpacity,
                  }}>
                    <Pressable
                      onPress={handlePlayAgain}
                      style={({ hovered, pressed }) => ([
                        {
                          backgroundColor: '#FF9F1C',
                          borderRadius: 8,
                          paddingVertical: 10,
                          paddingHorizontal: 22,
                          minWidth: 80,
                          alignItems: 'center',
                          boxShadow: hovered ? '0 0 16px #FFD580' : 'none',
                          transform: pressed
                            ? [{ scale: 0.97 }]
                            : hovered
                              ? [{ scale: 1.06 }]
                              : undefined,
                          transition: 'background 0.2s, box-shadow 0.2s, transform 0.1s',
                        },
                      ])}
                    >
                      <ThemedText style={{ color: '#fff', fontWeight: '700', fontSize: 16, letterSpacing: 1 }}>Play Again</ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        if (typeof window !== 'undefined') {
                          window.location.href = '/';
                        }
                      }}
                      style={({ hovered }) => ([
                        {
                          backgroundColor: hovered ? '#d1d5db' : '#E5E7EB',
                          borderRadius: 8,
                          paddingVertical: 10,
                          paddingHorizontal: 22,
                          minWidth: 120,
                          alignItems: 'center',
                          border: '2px solid #d1d5db',
                          boxShadow: '0 2px 12px #B23B3B22',
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
                        Main Menu
                      </ThemedText>
                    </Pressable>
                  </Animated.View>
                </Animated.View>
              </View>
            )}
      <View style={quizStyles.centerGradientOverlay} />
      <View style={quizStyles.grassBackground} />
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
      }]}> 
        {showPlusOne && (
          <span
            style={{
              ...plusOneStyle,
              color: plusOnePulse ? DOGGYDEX_ORANGE_DARK : plusOneStyle.color,
              textShadow: plusOnePulse
                ? `0 0 48px ${DOGGYDEX_ORANGE_DARK}, 0 0 24px ${DOGGYDEX_ORANGE}, 0 0 12px #fff`
                : plusOneStyle.textShadow,
              transition: plusOneStyle.transition,
              zIndex: 1000,
              pointerEvents: 'none',
            }}
          >
            +1
          </span>
        )}
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
                <ThemedText
                  key={i}
                  style={
                    heartPulse === i && heartPulseColor
                      ? [quizStyles.heartIcon(lives > i), { color: heartPulseColor, textShadowColor: heartPulseColor, transform: [{ scale: 1.25 }], ...shakeAnim }]
                      : quizStyles.heartIcon(lives > i)
                  }
                >
                  ♥
                </ThemedText>
              );
            })}
          </View>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', display: 'flex' }}>
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0 }}>
              <span style={{ fontSize: 18, color: 'black', fontWeight: 500, fontFamily: 'inherit', verticalAlign: 'middle', marginBottom: 0 }}>{'Score'}</span>
              <span style={{
                fontSize: 25.5,
                color: scorePulse ? DOGGYDEX_ORANGE : 'black',
                fontWeight: 700,
                fontFamily: 'inherit',
                verticalAlign: 'middle',
                marginTop: 0,
                background: 'none',
                backgroundColor: 'transparent',
                transition: 'color 0.25s cubic-bezier(0.4,1,0.6,1)',
                textShadow: scorePulse ? `0 0 12px ${DOGGYDEX_ORANGE}, 0 0 4px #fff` : 'none',
              }}>{score}</span>
            </span>
          </View>
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
            <span style={{ fontSize: 22, lineHeight: '24px', verticalAlign: 'middle' }}>⏰</span>
            <span
              style={{
                color: DOGGYDEX_ORANGE,
                fontWeight: 300,
                fontSize: 19,
                letterSpacing: 1,
                transition: 'transform 0.3s',
                transform: pulse ? 'scale(1.08)' : 'scale(1)',
                textShadow: `0 0 8px ${DOGGYDEX_ORANGE}, 0 0 2px #fff`,
                fontFamily: 'inherit',
                verticalAlign: 'middle',
                display: 'inline-block',
                WebkitTextStroke: '0.5px black',
                textStroke: '0.5px black',
              }}
            >
              {timer}
            </span>
          </div>
        </View>
        {targetDog ? (
          <View style={{ alignItems: 'center', width: '100%' }}>
            <ThemedText type="subtitle" style={quizStyles.promptLarge}>
              <span style={{
                color: 'black',
                fontWeight: 400,
                fontSize: 18.5,
                fontFamily: 'inherit',
                verticalAlign: 'middle',
                display: 'inline-block',
                marginTop: '2px',
                marginRight: '6px',
              }}>
                Tap the 
              </span>
              <span style={{
                color: 'black',
                fontWeight: 700,
                fontSize: 21,
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
      {isCloudQuizLoading ? (
        <ThemedText style={quizStyles.hint}>Loading quiz breeds with cloud images...</ThemedText>
      ) : null}
      {syncNotice ? <ThemedText style={quizStyles.hint}>{syncNotice}</ThemedText> : null}
      {!isCloudQuizLoading && cloudQuizNotice ? <ThemedText style={quizStyles.hint}>{cloudQuizNotice}</ThemedText> : null}


      {targetDog ? (
        <View style={[quizStyles.scoreHeartsContainer, {
          marginTop: 0,
          marginBottom: 0,
          paddingTop: 0,
          width: 440,
          paddingTop: 0,
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          backgroundColor: quizStyles.scoreHeartsContainer.backgroundColor,
        }]}> 
          <Animated.View style={[quizStyles.grid, dogGridStyle]}>
            {choices.map((c, idx) => {
              // Only show correct styling/label if the selected card is the correct one
              const isSelected = selected && c.id === selected.id;
              const isCorrect = isSelected && c.id === targetDog.id;
              const isWrong = wrongGuesses && wrongGuesses.includes(c.id);
              // Only dim other cards if the correct card was picked
              const isDimmed = selected && !isSelected && selected.id === targetDog.id;
              const isDisabled = isCorrect || isWrong;
              // Blur a random incorrect card if timer is 0
              const isBlurredByTimer = blurredCardId === c.id;
              return (
                <Pressable
                  key={c.id}
                  style={({ hovered, pressed }) => [
                    quizStyles.card,
                    hovered && quizStyles.cardHover,
                    pressed && quizStyles.cardPressed,
                    isCorrect && quizStyles.correctReveal,
                    isWrong && quizStyles.wrongBlur,
                    isDimmed && quizStyles.dimmedCard,
                    isDisabled && { opacity: 0.7 },
                    isBlurredByTimer && quizStyles.wrongBlur,
                  ]}
                  onPress={() => handlePick(c)}
                  disabled={isDisabled}
                >
                  <Image source={{ uri: c.uri }} style={quizStyles.image} contentFit="cover" />
                  {isCorrect ? (
                    <ThemedText type="default" style={quizStyles.cardLabel}>{c.breed}</ThemedText>
                  ) : null}
                </Pressable>
              );
            })}
          </Animated.View>
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
                    backgroundColor: 'rgba(255,255,255,0.97)',
                    borderRadius: 18,
                    padding: 28,
                    maxWidth: 340,
                    width: '90%',
                    alignItems: 'center',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 8 },
                    shadowOpacity: 0.18,
                    shadowRadius: 24,
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
                        onPress={() => {
                          window.location.href = '/';
                        }}
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
          {/* Next button removed when answer is selected */}
        </View>
      ) : null}

      {/* Exit Quiz button moved inside dog images container above */}
    </ThemedView>
  );
}
