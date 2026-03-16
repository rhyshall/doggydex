import { DoggyDexHeader } from '@/components/doggydex-header';
import { FrostedGlassCard } from '@/components/frosted-glass-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { auth } from '@/lib/firebase-services';
import { getUserProfileUsername, hasUsername, upsertUserProfile } from '@/lib/user-store';
import { commonStyles } from '@/styles/common';
import { homeStyles } from '@/styles/homeStyles';
import { Image } from 'expo-image';
import { Redirect, useRouter } from 'expo-router';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

const LABRADOR_BACKGROUND_IMAGES = {
  yellow: 'https://images.dog.ceo/breeds/labrador/n02099712_5640.jpg',
  black: 'https://images.dog.ceo/breeds/labrador/n02099712_1978.jpg',
  chocolate: 'https://images.dog.ceo/breeds/labrador/n02099712_4467.jpg',
};

export default function HomeScreen() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

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
        <FrostedGlassCard style={{ width: '100%', maxWidth: 540, alignItems: 'center', justifyContent: 'center' }}>
          <View style={homeStyles.content}>
            <DoggyDexHeader style={{ marginBottom: 0 }} />
            <ThemedText style={homeStyles.subtitle}>Guess breeds, unlock coats, build your collection!</ThemedText>

            <View style={homeStyles.chooserCards}>
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
