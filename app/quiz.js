import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { DOGGYDEX_CORAL_RED } from '@/constants/theme';
import { auth, db } from '@/lib/firebase-services';
import { getLocalImgAsset } from '@/lib/local-image-assets';
// import { loadUserProgress, saveUserProgress } from '@/lib/progress-store';
import { indexVariantsByBreed } from '@/lib/storage-coat-variants';
import { quizStyles } from '@/styles/quizStyles';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';


import { onAuthStateChanged } from 'firebase/auth';
import { addDoc, doc, collection as firestoreCollection, getDoc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Animated as RNAnimated, Easing as RNEasing, View } from 'react-native';
import Animated, { Easing as ReanimatedEasing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import breedTiers from '../data/dog-breeds-tiers.json';

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
  const router = useRouter();
  const [timerPaused, setTimerPaused] = useState(false);
  const [userUnlocks, setUserUnlocks] = useState([]);
  // Track auth state as a single object
  const [authState, setAuthState] = useState({ checked: false, user: null });
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
    const [scorePulse, setScorePulse] = useState(false);
    const plusOneAnimRef = useRef({});


    // Track which card to blur when timer hits 0
    const [blurredCardId, setBlurredCardId] = useState(null);
  // Time's Up feedback state
  const [showTimesUp, setShowTimesUp] = useState(false);
  const timesUpAnim = useRef(new RNAnimated.Value(0)).current;
  const [wrongAnimatedCardId, setWrongAnimatedCardId] = useState(null);
  const wrongShakeX = useRef(new RNAnimated.Value(0)).current;
  const wrongBorderOpacity = useRef(new RNAnimated.Value(0)).current;

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
          coat_id: variant.coat_id, 
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
  // Store the breed tier for the current question's correct answer
  const [currentBreedTier, setCurrentBreedTier] = useState(1);

  // Efficiently load the tier for the correct breed when a new question is loaded
  useEffect(() => {
    if (!choices || !Array.isArray(choices) || choices.length === 0 || typeof targetIndex !== 'number' || targetIndex < 0) {
      setCurrentBreedTier(1);
      return;
    }
    // Get the correct breed id for the current question
    const correctChoice = choices[targetIndex];
    let breedId = null;
    if (correctChoice && (correctChoice.breedId || correctChoice.breed_id)) {
      breedId = correctChoice.breedId || correctChoice.breed_id;
    } else if (correctChoice && correctChoice.breed) {
      breedId = correctChoice.breed;
    }
    let tier = 1;
    if (breedId && breedTiers[breedId]) {
      tier = breedTiers[breedId];
    }
    setCurrentBreedTier(tier);
  }, [questionIndex, choices, targetIndex]);
  // Track selected correct card, and wrong guesses
  const [selected, setSelected] = useState(null); // selected correct card
  const [wrongGuesses, setWrongGuesses] = useState([]); // array of dog ids guessed wrong

  // Clear wrongGuesses at the beginning of each new question
  useEffect(() => {
    setWrongGuesses([]);
    setFailedImageIds({});
    // Log userUnlocks state after every question
  }, [questionIndex, userUnlocks]);

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
  const [newCoatActuallyUnlocked, setNewCoatActuallyUnlocked] = useState(false);
  // Remove unlock banner state
  // const [showNewCoatUnlocked, setShowNewCoatUnlocked] = useState(false);
  // Remove global reward animation state
  const [newBadge, setNewBadge] = useState(null);
  const [localQuizSyncNotice, setLocalQuizSyncNotice] = useState(null);
  const [localQuizNotice, setLocalQuizNotice] = useState(null);
  const [isLocalQuizLoading, setIsLocalQuizLoading] = useState(true);
  const [missingLocalImageNotice, setMissingLocalImageNotice] = useState(null);
  // Duplicate declaration removed
  const [lives, setLives] = useState(3);
  const [heartPulse, setHeartPulse] = useState(null); // index of heart to pulse
  const [heartPulseColor, setHeartPulseColor] = useState(null); // color for pulsing heart
  const [failedImageIds, setFailedImageIds] = useState({});
  const lastTargetImageUriRef = useRef(null);

  // Show game over modal when lives reach zero
  useEffect(() => {
    if (lives === 0) {
      setTimerPaused(true); // Pause the timer when out of lives
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
              duration: 220, // was 110
              easing: RNEasing.out(RNEasing.ease),
              useNativeDriver: false,
            }),
            RNAnimated.timing(modalScale, {
              toValue: 1,
              duration: 220, // was 110
              easing: RNEasing.out(RNEasing.ease),
              useNativeDriver: false,
            })
          ]).start();
          // Fade in score after 500ms
          setTimeout(() => {
            RNAnimated.parallel([
              RNAnimated.timing(scoreOpacity, {
                toValue: 1,
                duration: 500, // was 400
                useNativeDriver: false,
              }),
              RNAnimated.sequence([
                RNAnimated.timing(scoreScale, {
                  toValue: 1.2,
                  duration: 180, // was 100
                  useNativeDriver: false,
                }),
                RNAnimated.timing(scoreScale, {
                  toValue: 1,
                  duration: 180, // was 100
                  useNativeDriver: false,
                })
              ])
            ]).start(() => {
              // Fade in best streak after 700ms (was 500ms)
              setTimeout(() => {
                RNAnimated.timing(bestStreakOpacity, {
                  toValue: 1,
                  duration: 500, // was 400
                  useNativeDriver: false,
                }).start(() => {
                  // Fade in high score after 500ms (was 300ms)
                  setTimeout(() => {
                    setShowHighScore(true);
                  }, 500);
                });
              }, 700);
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
        useNativeDriver: false,

      }).start(() => {
        // Fade in buttons after 300ms
        setTimeout(() => {
          RNAnimated.timing(buttonsOpacity, {
            toValue: 1,
            duration: 400,
            useNativeDriver: false,

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




  // Fetch and log all unlock_coats progress for the user from Firestore
  const fetchAndStoreUnlockCoats = async (user) => {
    try {
      // [DEBUG] fetchAndStoreUnlockCoats called with user: (kept for now)
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        let userIdNum = userSnap.data()?.user_id;

        if (userIdNum !== undefined && userIdNum !== null) {
          const unlockCoatsRef = firestoreCollection(db, 'unlock_coats');
          // Try both number and string queries
          const queries = [
            query(unlockCoatsRef, where('user_id', '==', userIdNum)),
            query(unlockCoatsRef, where('user_id', '==', String(userIdNum)))
          ];
          let allUnlocks = [];
          for (const [i, q] of queries.entries()) {
            const unlockSnap = await getDocs(q);
            const unlocks = unlockSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (unlocks.length > 0) allUnlocks = allUnlocks.concat(unlocks);
          }
          // Deduplicate by id
          const uniqueUnlocksMap = {};
          allUnlocks.forEach(unlock => {
            uniqueUnlocksMap[unlock.id] = unlock;
          });
          const uniqueUnlocks = Object.values(uniqueUnlocksMap);
          setUserUnlocks(uniqueUnlocks);
        } else {
          setUserUnlocks([]);
        }
      } else {
        setUserUnlocks([]);
      }
    } catch (e) {
      setUserUnlocks([]);
    }
  };

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

    // ...removed debug log for useEffect running...
    if (authState.checked && authState.user) {
      fetchAndStoreUnlockCoats(authState.user);
    }

    async function loadStorageVariants() {
      setIsLocalQuizLoading(true);
      setLocalQuizNotice(null);
      setMissingLocalImageNotice(null);

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
          const imgTwoFilename = typeof data.img_two_filename === 'string' ? data.img_two_filename.trim() : '';
          const imageTwoExists = !!data.image_two_exists;
          const imageExists = !!data.image_exists;

          if (!breedId || !imgFilename || !imageExists) {
            return null;
          }

          const breedNameFromDoc = typeof data.breed_name === 'string' ? data.breed_name.trim() : '';
          const colorName = typeof data.color_name === 'string' ? data.color_name.trim() : '';
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
            imageTwoExists,
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

          const secondaryAsset = variant.imageTwoExists && variant.imgTwoFilename
            ? getLocalImgAsset(variant.imgTwoFilename)
            : null;

          if (variant.imageTwoExists && variant.imgTwoFilename && !secondaryAsset) {
            missingLocalFilenames.add(variant.imgTwoFilename);
          }

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

    } catch (e) {
      console.warn('Failed to sync collection to cloud', e);
    }

    return { isNew: true, updatedCollection: updated };
  }

  // Track last 10 breeds to prevent repeats (already declared earlier)
  // const recentBreedsRef = useRef([]); // Removed duplicate

  const targetDog = targetIndex >= 0 ? choices[targetIndex] : null;

  async function handlePick(dog) {
    if ((selected && selected.id === targetDog.id) || !targetDog || lives === 0 || transitioning) return;
    // If already guessed this wrong dog, do nothing
    if (wrongGuesses.includes(dog.id)) return;

    if (dog.id === targetDog.id) {
      // Show the +1 reward on every correct answer.
      // Unlock-specific card messaging still uses the existing newUnlock logic below.
      {
        const startLeft = 30 + Math.random() * 40;
        const driftX = (Math.random() - 0.5) * 120;
        const driftY = -(35 + Math.random() * 15);
        const curve = (Math.random() - 0.5) * 40;
        setShowPlusOne(true);
        setPlusOnePulse(false);
        if (Platform.OS === 'web') {
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
            // Removed transition for instant appearance
            textShadow: `0 0 28px ${DOGGYDEX_ORANGE}, 0 0 12px ${DOGGYDEX_ORANGE}, 0 0 6px #fff`,
          });
        } else {
          plusOneMobileOpacity.setValue(0);
          plusOneMobileTranslateX.setValue(0);
          plusOneMobileTranslateY.setValue(0);
          plusOneMobileScale.setValue(1);
        }
        setTimeout(() => setPlusOnePulse(true), 0);
        setTimeout(() => {
          if (Platform.OS === 'web') {
            setPlusOneStyle((prev) => ({
              ...prev,
              opacity: 0,
              top: 30,
              transform: `translate(calc(-50% + ${driftX}px), ${driftY}px) scale(1.35) skewX(${curve}deg)`,
            }));
          } else {
            plusOneMobileOpacity.setValue(1);
            RNAnimated.parallel([
              RNAnimated.timing(plusOneMobileOpacity, {
                toValue: 0,
                duration: 700,
                easing: RNEasing.out(RNEasing.cubic),
                useNativeDriver: true,
              }),
              RNAnimated.timing(plusOneMobileTranslateX, {
                toValue: driftX,
                duration: 700,
                easing: RNEasing.out(RNEasing.cubic),
                useNativeDriver: true,
              }),
              RNAnimated.timing(plusOneMobileTranslateY, {
                toValue: driftY,
                duration: 700,
                easing: RNEasing.out(RNEasing.cubic),
                useNativeDriver: true,
              }),
              RNAnimated.timing(plusOneMobileScale, {
                toValue: 1.35,
                duration: 700,
                easing: RNEasing.out(RNEasing.cubic),
                useNativeDriver: true,
              }),
            ]).start();
          }
        }, 250);
        setTimeout(() => {
          setShowPlusOne(false);
        }, 1000);
        // Show +1 coat unlocked text immediately
        setNewUnlock(targetDog.id);
        setNewCoatActuallyUnlocked(true);
      }

      // --- THEN all other animations/state updates ---
      setTimerPaused(true);
      setTimer((prev) => prev); // Prevent timer decrement
      let timerPaused = true;
      setSelected(dog);
      // Delay the score increment so it lands in the 120-180ms window.
      setTimeout(() => {
        setScore((s) => s + 1);
        setScorePulse(true);
      }, 150);
      // Let the gold flash/scale breathe briefly, then ease back.
      setTimeout(() => setScorePulse(false), 750);
      setTransitioning(true);

      // Drive question transition from tap timing (not async unlock writes)
      // so timing tweaks are immediately visible.
      const slideOut = () => {
        gridSlideX.value = 0;
        gridOpacity.value = 1;
        gridSlideX.value = withTiming(-80, { duration: 400, easing: ReanimatedEasing.inOut(ReanimatedEasing.quad) }, () => {
          // Slide finishes after fade
        });
        gridOpacity.value = withTiming(0, {
          duration: 650,
          easing: ReanimatedEasing.out(ReanimatedEasing.quad),
        });

        // Begin incoming question when outgoing push-left is ~75% complete.
        setTimeout(() => {
          setPendingNext(true);
        }, 300);
      };
      setTimeout(() => slideOut(), 150);

      (async () => {
        let willShowNewUnlock = false;
        const { isNew, updatedCollection } = await unlockDog(targetDog.id);
        // --- Firestore unlock_coats logic ---
        let unlockedCoat = false;
        try {
          const user = auth.currentUser;
          if (user) {
            const userRef = doc(db, 'users', user.uid);
            const userSnap = await getDoc(userRef);
            let userIdNum = userSnap.data().user_id;
            const coatId = targetDog.coat_id;
            const unlockCoatsRef = firestoreCollection(db, 'unlock_coats');
            const q = query(unlockCoatsRef, where('user_id', '==', userIdNum), where('coat_id', '==', coatId));
            const unlockSnap = await getDocs(q);

            // Find breed_id for this coat
            let breedId = null;
            if (targetDog && (targetDog.breedId || targetDog.breed_id)) {
              breedId = targetDog.breedId || targetDog.breed_id;
            } else if (targetDog && targetDog.breed) {
              breedId = targetDog.breed;
            }

            // Load breed tiers from dog-breeds-tiers.json (static import)
            let breedTier = 1;
            if (breedId && breedTiers[breedId]) {
              breedTier = breedTiers[breedId];
            }

            let progressRequired = 1;
            if (breedTier === 2) progressRequired = 5;
            else if (breedTier === 3) progressRequired = 10;
            else if (breedTier === 4) progressRequired = 15;
            else if (breedTier === 5) progressRequired = 30;

            if (unlockSnap.empty) {
              // Create new unlock_coats doc
              await addDoc(unlockCoatsRef, {
                user_id: userIdNum,
                coat_id: coatId,
                unlock_date: null,
                is_unlocked: false,
                progress: 1,
                progress_required: progressRequired,
              });
              if (progressRequired === 1) {
                // Instantly unlocked
                const q2 = query(unlockCoatsRef, where('user_id', '==', userIdNum), where('coat_id', '==', coatId));
                const snap2 = await getDocs(q2);
                if (!snap2.empty) {
                  const docRef = snap2.docs[0].ref;
                  await setDoc(docRef, {
                    user_id: userIdNum,
                    coat_id: coatId,
                    unlock_date: serverTimestamp(),
                    is_unlocked: true,
                    progress: 1,
                    progress_required: progressRequired,
                  }, { merge: true });
                  unlockedCoat = true;
                }
              } else {
                unlockedCoat = false;
              }
            } else {
              // Update existing doc
              const docRef = unlockSnap.docs[0].ref;
              const data = unlockSnap.docs[0].data();
              let newProgress = (data.progress || 0) + 1;
              let isUnlocked = data.is_unlocked || false;
              let unlockDate = data.unlock_date || null;
              if (!isUnlocked && newProgress >= progressRequired) {
                isUnlocked = true;
                unlockDate = serverTimestamp();
                unlockedCoat = true;
              } else {
                unlockedCoat = false;
              }
              await setDoc(docRef, {
                progress: newProgress,
                is_unlocked: isUnlocked,
                unlock_date: isUnlocked ? unlockDate : null,
                progress_required: progressRequired,
                user_id: userIdNum,
                coat_id: coatId,
              }, { merge: true });
            }
          }
        } catch (e) {
          console.warn('Failed to update unlock_coats', e);
        }
        willShowNewUnlock = isNew || unlockedCoat;
        // Update newUnlock and newCoatActuallyUnlocked if async unlock logic disagrees with initial guess
        if (unlockedCoat) {
          setNewUnlock(targetDog.id);
          setNewCoatActuallyUnlocked(true);
        } else {
          setNewUnlock(null);
          setNewCoatActuallyUnlocked(false);
        }
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
        }

        // Always refresh unlocks after any unlock_coats update
        if (authState && authState.checked && authState.user) {
          fetchAndStoreUnlockCoats(authState.user);
        }

      })();
    } else {
      setWrongGuesses((prev) => [...prev, dog.id]);

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
      runOnJS(setSelected)(null);
      runOnJS(setNewUnlock)(null);
      runOnJS(setNewBadge)(null);
      runOnJS(setTimer)(30); // Reset timer to 30
      runOnJS(setTimerPaused)(false); // Resume timer
      runOnJS(setQuestionIndex)((q) => q + 1);
      // Animate grid in from right
      gridSlideX.value = 80;
      gridOpacity.value = 0;
      gridSlideX.value = withTiming(0, { duration: 360, easing: ReanimatedEasing.out(ReanimatedEasing.quad) });
      gridOpacity.value = withDelay(120, withTiming(1, {
        duration: 700,
        easing: ReanimatedEasing.out(ReanimatedEasing.quad),
      }, () => {
        runOnJS(setTransitioning)(false);
        runOnJS(setPendingNext)(false);
      }));
    }
  }, [pendingNext]);

  function next() {
    if (transitioning) return;
    // For manual next, animate grid out
    setTransitioning(true);
    gridSlideX.value = 0;
    gridOpacity.value = 1;
    gridSlideX.value = withTiming(-80, { duration: 350, easing: ReanimatedEasing.inOut(ReanimatedEasing.quad) }, () => {
      gridOpacity.value = withTiming(0, { duration: 350 }, () => {
        runOnJS(setPendingNext)(true);
      });
    });
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
    if (authState.checked && authState.user) {
      await fetchAndStoreUnlockCoats(authState.user);
    }
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
    setTimerPaused(false); // Unpause the timer
    // Force refresh the question
    setTimeout(() => setQuestionIndex(1), 0);
  }

  // Show loading indicator until authState.checked is true
  if (!authState.checked) {
    return (
      <ThemedView style={quizStyles.container}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <ThemedText style={{ fontSize: 22, color: '#888', fontWeight: '600', marginBottom: 12 }}>
            Loading user info...
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  const mobileStatusMessage = isLocalQuizLoading
    ? 'Loading quiz breeds with local images...'
    : localQuizSyncNotice || localQuizNotice || missingLocalImageNotice || '';
  const shouldBlurContainerOnTimeout = timer === 0 && !showGameOver;

  if (isLocalQuizLoading) {
    return (
      <ThemedView style={quizStyles.container}>
        <View style={quizStyles.loadingOverlay}>
          <View style={quizStyles.loadingCard}>
            <ActivityIndicator size="large" color="#FF9F1C" />
            <ThemedText style={quizStyles.loadingTitle}>Loading quiz...</ThemedText>
            <ThemedText style={quizStyles.loadingSubtitle}>Preparing local dog photos and breed data.</ThemedText>
          </View>
        </View>
      </ThemedView>
    );
  }

  if (Platform.OS !== 'web') {
    return (
      <ThemedView style={quizStyles.container}>
        {showPlusOne ? (
          <View pointerEvents="none" style={quizStyles.mobilePlusOneOverlay}>
            <RNAnimated.View
              style={[
                quizStyles.mobilePlusOneBubble,
                {
                  opacity: plusOneMobileOpacity,
                  transform: [
                    { translateX: plusOneMobileTranslateX },
                    { translateY: plusOneMobileTranslateY },
                    { scale: plusOneMobileScale },
                  ],
                },
              ]}
            >
              <ThemedText style={quizStyles.mobilePlusOneText}>+1</ThemedText>
            </RNAnimated.View>
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
              ⏰ Time's Up!
            </ThemedText>
          </RNAnimated.View>
        ) : null}

        <View style={quizStyles.mobileQuizStack}>
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
                    const baseStyle = quizStyles.heartIcon(isActive);
                    const hiddenStyle = !isActive ? { opacity: 0 } : null;

                    return (
                    <ThemedText
                      key={i}
                      style={
                        heartPulse === i && heartPulseColor
                          ? [baseStyle, hiddenStyle, { color: heartPulseColor, transform: [{ scale: 1.25 }] }]
                          : [baseStyle, hiddenStyle]
                      }
                    >
                      ♥
                    </ThemedText>
                    );
                  })}
                </View>
                <View style={quizStyles.mobileScoreWrap}>
                  <ThemedText style={quizStyles.mobileScoreLabel}>Score</ThemedText>
                  <ThemedText
                    style={[
                      quizStyles.mobileScoreValue,
                      scorePulse && {
                        color: '#FFD700',
                        textShadowColor: '#FFD700',
                        textShadowOffset: { width: 0, height: 0 },
                        textShadowRadius: 10,
                        transform: [{ scale: 1.08 }],
                      },
                    ]}
                  >
                    {score}
                  </ThemedText>
                </View>
                <View style={quizStyles.mobileTimerChip}>
                  <ThemedText style={quizStyles.mobileTimerIcon}>⏰</ThemedText>
                  <ThemedText style={[quizStyles.mobileTimerValue, timer <= 9 && quizStyles.mobileTimerCritical]}>
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
                          isWrongAnimating ? { transform: [{ translateX: wrongShakeX }] } : null,
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
                          source={typeof c.uri === 'string' ? { uri: c.uri } : c.uri}
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
                            <MaterialIcons name="pets" size={28} color="#6B7280" />
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
        </View>

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
              backgroundColor: 'rgba(255,255,255,0.98)',
              borderRadius: 22,
              paddingVertical: 22,
              paddingHorizontal: 18,
              width: '100%',
              maxWidth: 360,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.92)',
              shadowColor: '#111827',
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
              <ThemedText style={{ fontSize: 15, lineHeight: 22, color: '#374151', marginBottom: 18, textAlign: 'center', opacity: 0.92 }}>
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
          <View style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(12,16,24,0.56)',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            paddingHorizontal: 20,
          }}>
            <View style={{
              backgroundColor: 'rgba(255,255,255,0.98)',
              borderRadius: 24,
              paddingVertical: 22,
              paddingHorizontal: 18,
              width: '100%',
              maxWidth: 360,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.92)',
              shadowColor: '#111827',
              shadowOffset: { width: 0, height: 12 },
              shadowOpacity: 0.26,
              shadowRadius: 22,
              elevation: 12,
            }}>
              <View style={{
                width: 62,
                height: 62,
                borderRadius: 31,
                backgroundColor: '#FEE2E2',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 10,
              }}>
                <MaterialIcons name="heart-broken" size={34} color="#B91C1C" />
              </View>
              <ThemedText style={{ fontSize: 27, fontWeight: '800', color: '#B91C1C', marginBottom: 12 }}>
                Out of Lives!
              </ThemedText>
              <View style={{
                width: '100%',
                backgroundColor: '#F8FAFC',
                borderRadius: 14,
                borderWidth: 1,
                borderColor: '#E2E8F0',
                paddingVertical: 10,
                paddingHorizontal: 12,
                marginBottom: 16,
                gap: 8,
              }}>
                <RNAnimated.View style={{ opacity: scoreOpacity }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <ThemedText style={{ fontSize: 15, color: '#475569', fontWeight: '700' }}>Score</ThemedText>
                    <ThemedText style={{ fontSize: 24, color: '#F59E0B', fontWeight: '900' }}>{score}</ThemedText>
                  </View>
                </RNAnimated.View>
                <RNAnimated.View style={{ opacity: bestStreakOpacity }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <ThemedText style={{ fontSize: 15, color: '#475569', fontWeight: '700' }}>Best streak</ThemedText>
                    <ThemedText style={{ fontSize: 20, color: '#111827', fontWeight: '800' }}>{bestStreak}</ThemedText>
                  </View>
                </RNAnimated.View>
                <RNAnimated.View style={{ opacity: highScoreOpacity }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <ThemedText style={{ fontSize: 15, color: '#475569', fontWeight: '700' }}>High score</ThemedText>
                    <ThemedText style={{ fontSize: 20, color: isNewHighScore ? '#F59E0B' : '#111827', fontWeight: '800' }}>
                      {highScore ?? 0}
                    </ThemedText>
                  </View>
                </RNAnimated.View>
              </View>
              <RNAnimated.View style={{ width: '100%', flexDirection: 'row', gap: 10, opacity: buttonsOpacity }} pointerEvents={showHighScore ? 'auto' : 'none'}>
                <Pressable
                  onPress={handlePlayAgain}
                  style={({ pressed }) => [{
                    flex: 1,
                    backgroundColor: '#FF9F1C',
                    borderRadius: 12,
                    paddingVertical: 12,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: '#E68A00',
                  }, pressed && { transform: [{ scale: 0.98 }] }]}
                >
                  <ThemedText style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Play Again</ThemedText>
                </Pressable>
                <Pressable
                  onPress={goHomeWithSpinner}
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
                  <ThemedText style={{ color: '#334155', fontWeight: '800', fontSize: 16 }}>Home</ThemedText>
                </Pressable>
              </RNAnimated.View>
            </View>
          </View>
        ) : null}

        {isLeavingToHome ? (
          <View pointerEvents="auto" style={quizStyles.loadingOverlayStrong}>
            <View style={quizStyles.loadingCard}>
              <ActivityIndicator size="large" color="#FF9F1C" />
              <ThemedText style={quizStyles.loadingTitle}>Returning home...</ThemedText>
            </View>
          </View>
        ) : null}
      </ThemedView>
    );
  }

  return (
    <ThemedView style={quizStyles.container}>
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
            ⏰ Time's Up!
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
                  boxShadow: '0 6px 16px rgba(0,0,0,0.15)',
                  elevation: 10,
                  position: 'relative',
                  zIndex: 3000,
                  gap: 8,
                  transform: [{ scale: modalScale }],
                }}>
                  <ThemedText style={{ fontSize: 24, fontWeight: '700', color: '#B23B3B', marginBottom: 18, textAlign: 'center', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <MaterialIcons
                      name="heart-broken"
                      size={44}
                      color={DOGGYDEX_CORAL_RED}
                      style={{ marginRight: 8, verticalAlign: 'middle' }}
                    />
                    <span style={{ display: 'inline-block', marginTop: 10 }}>Out of Lives!</span>
                  </ThemedText>
                  {/* Stacked stat format */}
                  <View style={{ width: '100%', alignItems: 'center', marginBottom: 20 }}>
                    <RNAnimated.View style={{ opacity: scoreOpacity, width: '100%', marginBottom: 0 }}>
                      <ThemedText style={{ fontSize: 23, color: '#333', textAlign: 'center', fontWeight: '700', letterSpacing: 0.5, marginBottom: 5 }}>
                        Score
                      </ThemedText>
                      <RNAnimated.View style={{
                        transform: [{ scale: scoreScale }],
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: 0,
                      }}>
                        <ThemedText style={{ fontWeight: '900', color: '#FF9F1C', fontSize: '3.5rem', textAlign: 'center', letterSpacing: 1.6, padding: 8, borderRadius: 12, textShadow: '0 1.5px 8px #FFD58088' }}>
                          <span style={{ textShadow: '0 0 8px rgba(255,165,0,0.3)', fontSize: '3.5rem' }}>{score}</span>
                        </ThemedText>
                      </RNAnimated.View>
                      {/* Divider fades in with stat */}
                      <RNAnimated.View style={{ opacity: scoreOpacity, width: '80%', height: 1, backgroundColor: 'rgba(0,0,0,0.08)', alignSelf: 'center', marginVertical: 8 }} />
                    </RNAnimated.View>
                    <RNAnimated.View style={{ opacity: bestStreakOpacity, width: '100%', marginBottom: 0 }}>
                      <ThemedText style={{ fontSize: 22, color: '#333', textAlign: 'center', fontWeight: '600', letterSpacing: 0.5, flexDirection: 'row', alignItems: 'center', display: 'flex', justifyContent: 'center', marginTop: 4 }}>
                        <MaterialIcons name="whatshot" size={30} color="#FF9F1C" style={{ marginRight: 8, verticalAlign: 'middle' }} />
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
                        <MaterialIcons name="emoji-events" size={30} color="#FFD700" style={{ marginRight: 8, verticalAlign: 'middle' }} />
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
                      onPress={goHomeWithSpinner}
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
      <View
        style={{
          ...quizStyles.centerGradientOverlay,
          background: 'linear-gradient(180deg, #fff 0%, #f8fafc 100%)',
          filter: (showTimesUp || timer === 0) ? 'blur(32px)' : 'blur(2.5px)',
          WebkitFilter: (showTimesUp || timer === 0) ? 'blur(32px)' : 'blur(2.5px)',
          opacity: (showTimesUp || timer === 0) ? 0.65 : 1,
          transition: 'filter 0.3s, -webkit-filter 0.3s, background 0.3s, opacity 0.3s',
        }}
      />
      <View
        style={{
          ...quizStyles.grassBackground,
          background: '#fff',
          filter: (showTimesUp || timer === 0) ? 'blur(24px)' : 'blur(0px)',
          WebkitFilter: (showTimesUp || timer === 0) ? 'blur(24px)' : 'blur(0px)',
          opacity: (showTimesUp || timer === 0) ? 0.7 : 1,
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
                <ThemedText
                  key={i}
                  style={
                    heartPulse === i && heartPulseColor
                      ? [quizStyles.heartIcon(lives > i), { color: heartPulseColor, transform: [{ scale: 1.25 }], ...shakeAnim }]
                      : quizStyles.heartIcon(lives > i)
                  }
                >
                  ♥
                </ThemedText>
              );
            })}
          </View>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', display: 'flex', position: 'relative' }}>
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0 }}>
              <span style={{ fontSize: 21, color: 'black', fontWeight: 600, fontFamily: 'inherit', verticalAlign: 'middle', marginBottom: 0 }}>{'Score'}</span>
              <span style={{
                fontSize: 36,
                color: scorePulse ? DOGGYDEX_ORANGE : 'black',
                fontWeight: 800,
                fontFamily: 'inherit',
                verticalAlign: 'middle',
                marginTop: 0,
                background: 'none',
                backgroundColor: 'transparent',
                transition: 'color 0.25s cubic-bezier(0.4,1,0.6,1)',
                textShadow: scorePulse ? `0 0 12px ${DOGGYDEX_ORANGE}, 0 0 4px #fff` : 'none',
              }}>{score}</span>
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
                  +1
                </span>
              )}
            </span>
          </View>
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
            <span
              style={{
                fontSize: timer <= 9 ? 31 : 22,
                lineHeight: timer <= 9 ? '34px' : '24px',
                verticalAlign: 'middle',
                transition: 'font-size 0.2s, line-height 0.2s',
                marginRight: 2,
                display: 'inline-block',
              }}
            >
              ⏰
            </span>
            <span
              style={{
                color: timer <= 9 ? DOGGYDEX_CORAL_RED : DOGGYDEX_ORANGE,
                fontWeight: timer <= 9 ? 700 : 300,
                fontSize: timer <= 9 ? 32 : 19,
                letterSpacing: 1,
                transition: 'transform 0.3s, color 0.2s, font-size 0.2s, font-weight 0.2s',
                transform: pulse ? (timer <= 9 ? 'scale(1.18) rotate(-2deg)' : 'scale(1.08)') : 'scale(1)',
                textShadow: timer <= 9
                  ? `0 0 16px #D7263D, 0 0 6px #fff`
                  : `0 0 8px ${DOGGYDEX_ORANGE}, 0 0 2px #fff`,
                fontFamily: 'inherit',
                verticalAlign: 'middle',
                display: 'inline-block',
                WebkitTextStroke: '0.5px black',
                textStroke: '0.5px black',
                animation: timer <= 9 ? 'shake-timer 0.18s linear infinite alternate' : undefined,
              }}
            >
              {timer}
            </span>
            {/* Add shake animation for alarming effect */}
            <style>{`
              @keyframes shake-timer {
                0% { transform: scale(1.18) rotate(-2deg); }
                100% { transform: scale(1.18) rotate(2deg); }
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
          paddingTop: 0,
          width: 440,
          paddingTop: 0,
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          backgroundColor: quizStyles.scoreHeartsContainer.backgroundColor,
          overflow: 'hidden',
        }]}> 
          {shouldBlurContainerOnTimeout ? (
            <View pointerEvents="none" style={quizStyles.timerBlurOverlay}>
              <View style={quizStyles.timerBlurOverlayWeb} />
            </View>
          ) : null}

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
                <Pressable
                  key={c.id}
                  style={({ hovered, pressed }) => [
                    quizStyles.card,
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
                    source={typeof c.uri === 'string' ? { uri: c.uri } : c.uri}
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
        <View pointerEvents="auto" style={quizStyles.loadingOverlayStrong}>
          <View style={quizStyles.loadingCard}>
            <ActivityIndicator size="large" color="#FF9F1C" />
            <ThemedText style={quizStyles.loadingTitle}>Returning home...</ThemedText>
          </View>
        </View>
      ) : null}

      {/* Exit Quiz button moved inside dog images container above */}
    </ThemedView>
  );
}
