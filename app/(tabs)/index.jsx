import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { auth } from '@/lib/firebase-services';
import { commonStyles } from '@/styles/common';
import { homeStyles } from '@/styles/homeStyles';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Google from 'expo-auth-session/providers/google';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { GoogleAuthProvider, onAuthStateChanged, signInWithCredential, signInWithPopup, signOut } from 'firebase/auth';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import dogBreedsData from '../../data/dog-breeds.json';

WebBrowser.maybeCompleteAuthSession();

const TOTAL_COATS = dogBreedsData.breeds.reduce(
  (sum, breed) => sum + (breed.coatCount ?? breed.coatColors?.length ?? 0),
  0
);

const LABRADOR_BACKGROUND_IMAGES = {
  yellow: 'https://images.dog.ceo/breeds/labrador/n02099712_5640.jpg',
  black: 'https://images.dog.ceo/breeds/labrador/n02099712_1978.jpg',
  chocolate: 'https://images.dog.ceo/breeds/labrador/n02099712_4467.jpg',
};

export default function HomeScreen() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [coatsUnlocked, setCoatsUnlocked] = useState(0);
  const [showStats, setShowStats] = useState(false);

  const [request, , promptAsync] = Google.useAuthRequest({
    webClientId: process.env.WEB_CLIENT_ID,
    iosClientId: process.env.IOS_CLIENT_ID,
    androidClientId: process.env.ANDROID_CLIENT_ID,
    expoClientId: process.env.EXPO_CLIENT_ID,
    selectAccount: true,
    extraParams: {
      prompt: 'select_account',
    },
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser ?? null);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const storedCollection = await AsyncStorage.getItem('dogCollection');
        if (storedCollection) {
          const parsedCollection = JSON.parse(storedCollection);
          const uniqueCoats = Array.isArray(parsedCollection) ? new Set(parsedCollection).size : 0;
          setCoatsUnlocked(uniqueCoats);
        } else {
          setCoatsUnlocked(0);
        }
      } catch (e) {
        console.warn('Failed to load home state', e);
      }
    })();
  }, []);

  async function handleGoogleSignIn() {
    try {
      if (Platform.OS === 'web') {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
        return;
      }

      const result = await promptAsync();

      if (!result || result.type !== 'success' || !result.authentication) {
        return;
      }

      const { idToken, accessToken } = result.authentication;

      if (!idToken && !accessToken) {
        return;
      }

      const credential = GoogleAuthProvider.credential(idToken ?? null, accessToken ?? null);
      await signInWithCredential(auth, credential);
    } catch (e) {
      console.warn('Failed to launch Google sign-in', e);
    }
  }

  async function handleSignOut() {
    try {
      await signOut(auth);
    } catch (e) {
      console.warn('Failed to clear signed-in user', e);
    }
  }

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const storedCollection = await AsyncStorage.getItem('dogCollection');
          if (storedCollection) {
            const parsedCollection = JSON.parse(storedCollection);
            const uniqueCoats = Array.isArray(parsedCollection) ? new Set(parsedCollection).size : 0;
            setCoatsUnlocked(uniqueCoats);
          } else {
            setCoatsUnlocked(0);
          }
        } catch (e) {
          console.warn('Failed to refresh coat unlock count', e);
        }
      })();
    }, [])
  );

  const progressPct = TOTAL_COATS > 0 ? Math.round((coatsUnlocked / TOTAL_COATS) * 100) : 0;

  return (
    <ThemedView style={homeStyles.screen}>
      <View style={[commonStyles.container, homeStyles.container]}>
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
          ) : (
            <Pressable
              style={({ hovered, pressed }) => [
                homeStyles.signInButton,
                (hovered || pressed) && homeStyles.signInButtonHover,
              ]}
              disabled={Platform.OS !== 'web' && !request}
              onPress={handleGoogleSignIn}>
              <ThemedText style={homeStyles.signInText}>Sign in with Google</ThemedText>
            </Pressable>
          )}
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
        <View style={homeStyles.content}>
          <View style={homeStyles.titleWrap}>
            <View style={homeStyles.titleBalanceSpacer} />
            <ThemedText type="title" style={homeStyles.title}>DoggyDex</ThemedText>
            <View style={homeStyles.titlePawCluster}>
              <ThemedText style={homeStyles.titlePawBg}>🐾</ThemedText>
            </View>
          </View>
          <ThemedText style={homeStyles.subtitle}>Guess the dog breed from any coat colour</ThemedText>

          <View style={homeStyles.controls}>
            <Pressable
              style={({ hovered, pressed }) => [
                commonStyles.playButton,
                homeStyles.actionButton,
                (hovered || pressed) && homeStyles.startButtonHover,
                pressed && homeStyles.buttonPressed,
              ]}
              onPress={() => router.push('/quiz')}>
              <ThemedText type="subtitle" style={homeStyles.buttonLabel}>Start Quiz</ThemedText>
            </Pressable>
            <Pressable
              style={({ hovered, pressed }) => [
                commonStyles.playButton,
                homeStyles.actionButton,
                homeStyles.doggydexButton,
                (hovered || pressed) && homeStyles.doggydexButtonHover,
                pressed && homeStyles.buttonPressed,
              ]}
              onPress={() => router.push('/doggydex')}>
              <ThemedText type="subtitle" style={homeStyles.buttonLabel}>View DoggyDex</ThemedText>
            </Pressable>
            <Pressable
              style={({ hovered, pressed }) => [
                commonStyles.playButton,
                homeStyles.actionButton,
                homeStyles.statsButton,
                (hovered || pressed) && homeStyles.statsButtonHover,
                pressed && homeStyles.buttonPressed,
              ]}
              onPress={() => setShowStats((prev) => !prev)}>
              <ThemedText type="subtitle" style={homeStyles.buttonLabel}>Stats</ThemedText>
            </Pressable>
          </View>

          {showStats ? (
            <View style={homeStyles.statsCard}>
              <ThemedText style={homeStyles.statsLine}>Coats unlocked: {coatsUnlocked} / {TOTAL_COATS}</ThemedText>
              <ThemedText style={homeStyles.statsLine}>Completion: {progressPct}%</ThemedText>
            </View>
          ) : null}
        </View>
      </View>
    </ThemedView>
  );
}
