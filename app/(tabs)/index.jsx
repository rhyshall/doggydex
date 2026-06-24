import { DoggyDexHeader } from '@/components/doggydex-header';
import { FrostedGlassCard } from '@/components/frosted-glass-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { auth, db } from '@/lib/firebase-services';
import { getUserProfileUsername, hasUsername, upsertUserProfile } from '@/lib/user-store';
import { commonStyles } from '@/styles/common';
import { homeStyles } from '@/styles/homeStyles';
import { Image } from 'expo-image';
import { Redirect, useRouter } from 'expo-router';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useEffect, useState } from 'react';

// Firestore imports needed for unlock fetch logic
import { doc, collection as firestoreCollection, getDoc, getDocs, query, where } from 'firebase/firestore';
import { Pressable, StyleSheet, View } from 'react-native';

const LABRADOR_BACKGROUND_IMAGES = {
  yellow: 'https://images.dog.ceo/breeds/labrador/n02099712_5640.jpg',
  black: 'https://images.dog.ceo/breeds/labrador/n02099712_1978.jpg',
  chocolate: 'https://images.dog.ceo/breeds/labrador/n02099712_4467.jpg',
};

// Import fetchAndStoreUnlockCoats if not already imported
// import { fetchAndStoreUnlockCoats } from '../quiz'; // If needed, adjust import path

export default function HomeScreen() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [userUnlocks, setUserUnlocks] = useState([]);

  useEffect(() => {
    let isActive = true;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!isActive) {
        return;
      }

      setUser(firebaseUser ?? null);
      setAuthChecked(true);

      if (!firebaseUser) {
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
        }
      } catch (usernameCheckError) {
        console.warn('Failed to check username requirement', usernameCheckError);
        router.replace('/username-setup');
      }

      // Fetch unlocks for user on home screen
      try {
        if (firebaseUser) {
          // Inline fetchAndStoreUnlockCoats logic (copy from quiz.js)
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
            console.log('[HOME] User unlock_coats (all):', allUnlocks);
          } else {
            setUserUnlocks([]);
          }
        } else {
          setUserUnlocks([]);
        }
      } catch (e) {
        setUserUnlocks([]);
        console.warn('[HOME] DEBUG fetchAndStoreUnlockCoats error:', e);
      }
    });

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [router]);

  async function handleSignOut() {
    try {
      await signOut(auth);
    } catch (e) {
      console.warn('Failed to clear signed-in user', e);
    }
  }

  if (!authChecked) {
    return (
      <ThemedView style={homeStyles.screen}>
        <View style={[commonStyles.container, homeStyles.container]}>
          <ThemedText style={homeStyles.subtitle}>Checking sign-in...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (!user) {
    return <Redirect href="/doggydex" />;
  }

  return (
    <ThemedView style={homeStyles.screen}>
      <View style={[commonStyles.container, homeStyles.container, { flex: 1, alignItems: 'center', justifyContent: 'center' }]}> 
        <View style={homeStyles.authCorner}>
          {user ? (
            <View style={homeStyles.authRow}>
              <Image source={{ uri: user.photoURL || undefined }} style={homeStyles.authAvatar} contentFit="cover" />
              <View style={homeStyles.authMeta}>
                <ThemedText style={homeStyles.authSignedText}>Signed in</ThemedText>
                <ThemedText style={homeStyles.authName}>{user.displayName || user.email || 'Firebase User'}</ThemedText>
              </View>
              <Pressable
                style={({ hovered, pressed }) => [
                  homeStyles.signOutButton,
                  (hovered || pressed) && homeStyles.signOutButtonHover,
                ]}
                onPress={handleSignOut}>
                <ThemedText style={homeStyles.signOutText}>Sign out</ThemedText>
              </Pressable>
            </View>
          ) : null}
        </View>

        <View pointerEvents="none" style={homeStyles.bgDogsLayer}>
          <Image
            source={{ uri: LABRADOR_BACKGROUND_IMAGES.yellow }}
            style={[homeStyles.bgDogImage, homeStyles.bgDogYellow]}
            contentFit="cover"
          />
          <Image
            source={{ uri: LABRADOR_BACKGROUND_IMAGES.black }}
            style={[homeStyles.bgDogImage, homeStyles.bgDogBlack]}
            contentFit="cover"
          />
          <Image
            source={{ uri: LABRADOR_BACKGROUND_IMAGES.chocolate }}
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
                onPress={() => router.push('/quiz')}>
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
    </ThemedView>
  );
}

const styles = StyleSheet.create({
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
});
