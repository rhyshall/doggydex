import { DoggyDexHeader } from '@/components/doggydex-header';
import { FrostedGlassCard } from '@/components/frosted-glass-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { auth, db } from '@/lib/firebase-services';
import { getLocalImgAsset } from '@/lib/local-image-assets';
import { getUserProfileUsername, hasUsername, upsertUserProfile } from '@/lib/user-store';
import { commonStyles } from '@/styles/common';
import { homeStyles } from '@/styles/homeStyles';
import { Image } from 'expo-image';
import { Redirect, useRouter } from 'expo-router';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Firestore imports needed for unlock fetch logic
import { doc, collection as firestoreCollection, getDoc, getDocs, query, where } from 'firebase/firestore';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

const LABRADOR_BACKGROUND_IMAGES = {
  yellow: getLocalImgAsset('labrador_retriever_yellow.jpg'),
  black: getLocalImgAsset('labrador_retriever_black.jpg'),
  chocolate: getLocalImgAsset('labrador_retriever_chocolate.jpg'),
};

// Import fetchAndStoreUnlockCoats if not already imported
// import { fetchAndStoreUnlockCoats } from '../quiz'; // If needed, adjust import path

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState(() => auth.currentUser ?? null);
  const [authChecked, setAuthChecked] = useState(() => Boolean(auth.currentUser));
  const [userUnlocks, setUserUnlocks] = useState([]);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(null);
  const [isLaunchingQuiz, setIsLaunchingQuiz] = useState(false);
  const [isHomeLoading, setIsHomeLoading] = useState(true);

  const handleOpenQuiz = () => {
    setIsLaunchingQuiz(true);
    router.push('/quiz');
  };

  useEffect(() => {
    let isActive = true;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!isActive) {
        return;
      }

      setIsHomeLoading(true);
      setUser(firebaseUser ?? null);
      setAuthChecked(true);

      try {
        if (!firebaseUser) {
          setUserUnlocks([]);
          return;
        }

        try {
          await upsertUserProfile(firebaseUser);
        } catch (profileError) {
          console.warn('Failed to sync user profile', profileError);
        }

        try {
          const storedUsername = await getUserProfileUsername(firebaseUser.uid);
          if (!hasUsername(storedUsername)) {
            router.replace('/username-setup');
            return;
          }
        } catch (usernameCheckError) {
          console.warn('Failed to check username requirement', usernameCheckError);
          router.replace('/username-setup');
          return;
        }

        // Fetch unlocks for user on home screen
        try {
          const userRef = doc(db, 'users', firebaseUser.uid);
          const userSnap = await getDoc(userRef);
          let userIdNum = userSnap.data()?.user_id;
          if (userIdNum !== undefined && userIdNum !== null) {
            const unlockCoatsRef = firestoreCollection(db, 'unlock_coats');
            const queries = [
              query(unlockCoatsRef, where('user_id', '==', userIdNum)),
              query(unlockCoatsRef, where('user_id', '==', String(userIdNum)))
            ];
            let allUnlocks = [];
            for (const q of queries) {
              const unlockSnap = await getDocs(q);
              const unlocks = unlockSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
              if (unlocks.length > 0) allUnlocks = allUnlocks.concat(unlocks);
            }
            setUserUnlocks(allUnlocks);
          } else {
            setUserUnlocks([]);
            }
        } catch (e) {
          setUserUnlocks([]);
          console.warn('[HOME] fetchAndStoreUnlockCoats error:', e);
        }
      } finally {
        if (isActive) {
          setIsHomeLoading(false);
        }
      }
    });

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [router]);

  async function handleSignOut() {
    setSignOutError(null);
    setIsSigningOut(true);

    try {
      await signOut(auth);
      setUser(null);
      router.replace('/doggydex');
    } catch (e) {
      console.warn('Failed to clear signed-in user', e);
      setSignOutError('Could not sign out. Please try again.');
    } finally {
      setIsSigningOut(false);
    }
  }

  if (!authChecked) {
    return (
      <ThemedView style={homeStyles.screen}>
        <View style={[commonStyles.container, homeStyles.container, styles.homeLoadingWrap]} />
      </ThemedView>
    );
  }

  if (!user) {
    return <Redirect href="/doggydex" />;
  }

  return (
    <ThemedView style={homeStyles.screen}>
      <View
        style={[
          commonStyles.container,
          homeStyles.container,
          { flex: 1, alignItems: 'center', justifyContent: 'center' },
          isHomeLoading && styles.hiddenHomeContent,
        ]}
      >

        <View pointerEvents="none" style={homeStyles.bgDogsLayer}>
          <Image
            source={LABRADOR_BACKGROUND_IMAGES.yellow}
            style={[homeStyles.bgDogImage, homeStyles.bgDogYellow]}
            contentFit="cover"
          />
          <Image
            source={LABRADOR_BACKGROUND_IMAGES.black}
            style={[homeStyles.bgDogImage, homeStyles.bgDogBlack]}
            contentFit="cover"
          />
          <Image
            source={LABRADOR_BACKGROUND_IMAGES.chocolate}
            style={[homeStyles.bgDogImage, homeStyles.bgDogChocolate]}
            contentFit="cover"
          />
        </View>
        <FrostedGlassCard style={styles.homeCard}>
          <View style={styles.homeCardContent}>
            <DoggyDexHeader style={styles.homeHeader} />
            <ThemedText style={styles.homeSubtitle}>
              The ultimate dog breed quiz & collection game
            </ThemedText>
            <View style={styles.homeActions}>
              <Pressable
                style={({ hovered, pressed }) => [
                  homeStyles.chooserCard,
                  (hovered || pressed) && homeStyles.chooserCardHover,
                  pressed && homeStyles.buttonPressed,
                ]}
                onPress={handleOpenQuiz}
                disabled={isLaunchingQuiz}>
                {({ hovered, pressed }) => (
                  <>
                    <ThemedText style={homeStyles.chooserIcon}>🎯</ThemedText>
                    <View style={homeStyles.chooserCardTextWrap}>
                      <ThemedText style={[homeStyles.chooserCardTitle, (hovered || pressed) && homeStyles.chooserCardTitleHover]}>Play Quiz</ThemedText>
                      <ThemedText style={homeStyles.chooserCardBody}>Guess correct breeds to unlock new coats</ThemedText>
                    </View>
                  </>
                )}
              </Pressable>
              <Pressable
                style={({ hovered, pressed }) => [
                  homeStyles.chooserCard,
                  (hovered || pressed) && homeStyles.chooserCardHover,
                  pressed && homeStyles.buttonPressed,
                ]}
                onPress={() => router.push('/doggydex')}>
                {({ hovered, pressed }) => (
                  <>
                    <ThemedText style={homeStyles.chooserIcon}>📘</ThemedText>
                    <View style={homeStyles.chooserCardTextWrap}>
                      <ThemedText style={[homeStyles.chooserCardTitle, (hovered || pressed) && homeStyles.chooserCardTitleHover]}>View DoggyDex</ThemedText>
                      <ThemedText style={homeStyles.chooserCardBody}>View your coat collection for each breed</ThemedText>
                    </View>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </FrostedGlassCard>

      </View>

      <View pointerEvents="box-none" style={[styles.authOverlay, isHomeLoading && styles.hiddenHomeContent]}>
        <View
          pointerEvents="auto"
          style={[
            styles.authOverlayRow,
            { paddingTop: Math.max(insets.top + 12, 24) },
          ]}>
          {user ? (
            <View style={homeStyles.authRow}>
              <Image source={{ uri: user.photoURL || undefined }} style={homeStyles.authAvatar} contentFit="cover" />
              <View style={homeStyles.authMeta}>
                <ThemedText style={homeStyles.authSignedText}>Signed in</ThemedText>
                <ThemedText style={homeStyles.authName}>{user.displayName || user.email || 'Firebase User'}</ThemedText>
                {signOutError ? <ThemedText style={styles.signOutError}>{signOutError}</ThemedText> : null}
              </View>
              <Pressable
                style={({ hovered, pressed }) => [
                  homeStyles.signOutButton,
                  (hovered || pressed) && homeStyles.signOutButtonHover,
                ]}
                hitSlop={8}
                disabled={isSigningOut}
                onPress={handleSignOut}>
                <ThemedText style={homeStyles.signOutText}>{isSigningOut ? 'Signing out...' : 'Sign out'}</ThemedText>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>

      {isLaunchingQuiz ? (
        <View pointerEvents="auto" style={styles.quizLaunchOverlay}>
          <View style={styles.quizLaunchCard}>
            <ActivityIndicator size="large" color="#FF9F1C" />
            <ThemedText style={styles.quizLaunchText}>Loading quiz...</ThemedText>
          </View>
        </View>
      ) : null}

      {isHomeLoading ? (
        <View pointerEvents="auto" style={styles.homeLoadingOverlay}>
          <View style={styles.homeLoadingCard}>
            <ActivityIndicator size="large" color="#FF9F1C" />
            <ThemedText style={styles.homeLoadingText}>Loading home...</ThemedText>
          </View>
        </View>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  authOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    elevation: 999,
  },
  authOverlayRow: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    paddingHorizontal: 4,
  },
  homeCard: {
    width: '100%',
    maxWidth: 460,
    paddingVertical: 22,
    paddingHorizontal: 16,
  },
  homeCardContent: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  homeHeader: {
    marginBottom: 18,
  },
  homeSubtitle: {
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
    color: 'rgba(0,0,0,0.72)',
    marginBottom: 18,
    paddingHorizontal: 6,
  },
  homeActions: {
    width: '100%',
    maxWidth: 420,
    gap: 12,
  },
  signOutError: {
    fontSize: 11,
    lineHeight: 14,
    color: '#B42318',
    marginTop: 2,
  },
  hiddenHomeContent: {
    opacity: 0,
  },
  homeLoadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10,14,20,0.22)',
    zIndex: 2100,
  },
  homeLoadingCard: {
    minWidth: 200,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.94)',
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  homeLoadingText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    color: '#374151',
  },
  quizLaunchOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,14,20,0.24)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
  },
  quizLaunchCard: {
    minWidth: 180,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.94)',
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  quizLaunchText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    color: '#374151',
  },
});
