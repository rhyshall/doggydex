import { AppBackground } from '@/components/app-background';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { initializeFirebaseAnalytics } from '@/lib/firebase';

export const unstable_settings = {
  anchor: '(tabs)',
};

function forFade({ current }) {
  return {
    cardStyle: {
      opacity: current.progress,
    },
  };
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    initializeFirebaseAnalytics().catch(() => {});
  }, []);

  const lightTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: 'transparent',
    },
  };

  const darkTheme = {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      background: 'transparent',
    },
  };

  return (
    <ThemeProvider value={colorScheme === 'dark' ? darkTheme : lightTheme}>
      <AppBackground style={styles.container}>
        <Stack screenOptions={{ contentStyle: { backgroundColor: 'transparent' } }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="doggydex" options={{ headerShown: false, animation: 'fade' }} />
          <Stack.Screen name="login" options={{ headerShown: false, animation: 'fade' }} />
          <Stack.Screen name="signup" options={{ headerShown: false, animation: 'fade' }} />
          <Stack.Screen name="oauthredirect" options={{ headerShown: false, animation: 'none' }} />
          <Stack.Screen name="quiz" options={{ headerShown: false }} />
          <Stack.Screen name="username-setup" options={{ headerShown: false }} />
          <Stack.Screen
            name="modal"
            options={{
              presentation: 'transparentModal',
              title: 'Modal',
              contentStyle: { backgroundColor: 'transparent' },
            }}
          />
        </Stack>
      </AppBackground>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  background: {
    ...StyleSheet.absoluteFillObject,
  },
  backgroundImage: {
    transform: [{ translateY: -110 }],
  },
});
