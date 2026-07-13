import { DoggyDexHeader } from '@/components/doggydex-header';
import { FrostedGlassCard } from '@/components/frosted-glass-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { auth } from '@/lib/firebase-services';
import { getUserProfileUsername, hasUsername, upsertUserProfile } from '@/lib/user-store';
import { SplashTransition } from '@/components/splash-transition';
import { DoggyDexTheme } from '@/constants/theme';
import { commonStyles } from '@/styles/common';
import * as AuthSession from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import Constants from 'expo-constants';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import {
    createUserWithEmailAndPassword,
    GoogleAuthProvider,
    onAuthStateChanged,
    signInWithCredential,
    signInWithEmailAndPassword,
    signInWithPopup,
} from 'firebase/auth';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import GoogleIcon from './google-icon';

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_WEB_CLIENT_ID || process.env.WEB_CLIENT_ID;
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_IOS_CLIENT_ID || process.env.IOS_CLIENT_ID;
const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_ANDROID_CLIENT_ID || process.env.ANDROID_CLIENT_ID;
const GOOGLE_EXPO_CLIENT_ID = process.env.EXPO_PUBLIC_EXPO_CLIENT_ID || process.env.EXPO_CLIENT_ID;
const IS_EXPO_GO = Constants.appOwnership === 'expo';
const GOOGLE_ANDROID_REVERSE_CLIENT_ID = GOOGLE_ANDROID_CLIENT_ID
  ? `com.googleusercontent.apps.${GOOGLE_ANDROID_CLIENT_ID.replace('.apps.googleusercontent.com', '')}`
  : null;
const GOOGLE_ANDROID_REDIRECT_URI = AuthSession.makeRedirectUri({
  native: GOOGLE_ANDROID_REVERSE_CLIENT_ID ? `${GOOGLE_ANDROID_REVERSE_CLIENT_ID}:/oauthredirect` : undefined,
});
const PAW_SHIELD_ICON = require('../img/paw-shield.jpg');
const PAW_FOCUS_COLOR = DoggyDexTheme.colors.primary;
const AUTH_INPUT_TEXT_COLOR = DoggyDexTheme.colors.text;
const AUTH_INPUT_PLACEHOLDER_COLOR = DoggyDexTheme.colors.textMuted;
const AUTH_GATE_DEBUG_BUFFER_KEY = '__AUTH_GATE_DEBUG_LOGS__';
const APP_FONT_FAMILY = Platform.select({
  web: '"Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  ios: 'System',
  android: 'sans-serif',
  default: undefined,
});

function appendAuthGateDebugLog(event, payload) {
  if (!__DEV__) {
    return;
  }

  const entry = {
    ts: new Date().toISOString(),
    event,
    ...payload,
  };

  const existing = Array.isArray(globalThis[AUTH_GATE_DEBUG_BUFFER_KEY])
    ? globalThis[AUTH_GATE_DEBUG_BUFFER_KEY]
    : [];

  existing.push(entry);
  globalThis[AUTH_GATE_DEBUG_BUFFER_KEY] = existing.slice(-50);
}

WebBrowser.maybeCompleteAuthSession();

export default function AuthGateScreen({ mode }) {
  const router = useRouter();
  const localSearchParams = useLocalSearchParams();
  const isSignInMode = mode === 'signin';

  const [checkedAuth, setCheckedAuth] = useState(false);
  const [isRoutingAuthenticatedUser, setIsRoutingAuthenticatedUser] = useState(false);
  const [isAuthPending, setIsAuthPending] = useState(false);
  const [isProcessingOAuthReturn, setIsProcessingOAuthReturn] = useState(false);
  const [signInError, setSignInError] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [focusedField, setFocusedField] = useState(null);
  const routingUserUidRef = useRef(null);
  const routeAttemptIdRef = useRef(0);

  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    androidClientId: GOOGLE_ANDROID_CLIENT_ID,
    expoClientId: IS_EXPO_GO ? GOOGLE_EXPO_CLIENT_ID : undefined,
    redirectUri: Platform.OS === 'android' ? GOOGLE_ANDROID_REDIRECT_URI : undefined,
    selectAccount: true,
  });

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    const hasOAuthCallbackParams = [
      localSearchParams?.code,
      localSearchParams?.state,
      localSearchParams?.id_token,
      localSearchParams?.access_token,
      localSearchParams?.error,
      localSearchParams?.error_description,
    ].some((value) => typeof value === 'string' && value.length > 0);

    if (!hasOAuthCallbackParams) {
      return;
    }

    setIsProcessingOAuthReturn(true);

    const timeoutId = setTimeout(() => {
      setIsProcessingOAuthReturn(false);
    }, 6000);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [localSearchParams]);

  const routeSignedInUser = useCallback(async (firebaseUser = auth.currentUser) => {
    if (!firebaseUser) {
      setIsRoutingAuthenticatedUser(false);
      return;
    }

    if (routingUserUidRef.current === firebaseUser.uid) {
      return;
    }

    routingUserUidRef.current = firebaseUser.uid;
    const routeAttemptId = routeAttemptIdRef.current + 1;
    routeAttemptIdRef.current = routeAttemptId;
    setIsRoutingAuthenticatedUser(true);
    const isCurrentRouteAttempt = () =>
      routeAttemptIdRef.current === routeAttemptId
      && auth.currentUser?.uid === firebaseUser.uid;

    try {
      await upsertUserProfile(firebaseUser);
      if (!isCurrentRouteAttempt()) return;

      const storedUsername = await getUserProfileUsername(firebaseUser.uid);
      if (!isCurrentRouteAttempt()) return;

      router.replace(hasUsername(storedUsername) ? '/' : '/username-setup');
    } catch (error) {
      console.warn('Failed to resolve the signed-in user route', error);
      if (isCurrentRouteAttempt()) {
        router.replace('/');
      }
    }
  }, [router]);

  useEffect(() => {
    let isActive = true;

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!isActive) {
        return;
      }

      if (user) {
        setIsProcessingOAuthReturn(false);
        routeSignedInUser(user);

        return;
      }

      routingUserUidRef.current = null;
      routeAttemptIdRef.current += 1;
      setIsRoutingAuthenticatedUser(false);
      setCheckedAuth(true);
    });

    return () => {
      isActive = false;
      routeAttemptIdRef.current += 1;
      unsubscribe();
    };
  }, [routeSignedInUser]);

  useEffect(() => {
    let isCancelled = false;

    async function finishGoogleAuth() {
      if (Platform.OS === 'web' || !response) {
        return;
      }

      setIsProcessingOAuthReturn(false);

      appendAuthGateDebugLog('googleAuthResponse', {
        type: response.type,
        hasAuthentication: !!response.authentication,
        hasParams: !!response.params,
        hasIdToken: !!(response.authentication?.idToken || response.params?.id_token),
        hasAccessToken: !!(response.authentication?.accessToken || response.params?.access_token),
      });

      if (response.type !== 'success') {
        if (response.type !== 'dismiss' && response.type !== 'cancel') {
          setSignInError('Sign-in was canceled. Please try again.');
        }
        setIsAuthPending(false);
        return;
      }

      const authResult = response.authentication ?? null;
      const idToken = authResult?.idToken ?? response.params?.id_token ?? null;
      const accessToken = authResult?.accessToken ?? response.params?.access_token ?? null;

      if (!idToken && !accessToken) {
        setSignInError('Google sign-in token was not returned. Please try again.');
        setIsAuthPending(false);
        return;
      }

      try {
        const credential = GoogleAuthProvider.credential(idToken, accessToken);
        const credentialSignInResult = await signInWithCredential(auth, credential);

        if (!isCancelled) {
          routeSignedInUser();
        }
      } catch (error) {
        console.warn('Failed to sign in with Google', error);
        if (!isCancelled) {
          setSignInError('Could not sign in with Google. Please try again.');
        }
      } finally {
        if (!isCancelled) {
          setIsAuthPending(false);
        }
      }
    }

    finishGoogleAuth();

    return () => {
      isCancelled = true;
    };
  }, [response, routeSignedInUser]);

  function getEmailAuthErrorMessage(error, context = 'signIn') {
    const code = error?.code;

    if (code === 'auth/invalid-email') return 'Enter a valid email address';
    if (code === 'auth/network-request-failed') return 'Network error. Check your connection and try again.';
    if (code === 'auth/too-many-requests') return 'Too many attempts. Please wait a moment and try again.';
    if (code === 'auth/user-disabled') return 'This account has been disabled. Contact support.';

    if (context === 'create') {
      if (code === 'auth/weak-password') return 'Password must be at least 6 characters.';
      if (code === 'auth/email-already-in-use') return 'Account already exists. Sign in with your password.';
      if (code === 'auth/operation-not-allowed') return 'Email/password sign-in is not enabled in Firebase Auth.';
      return 'Could not create account right now. Please try again.';
    }
    
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
      return 'Incorrect Email / Password Combination';
    }

    return 'Could not sign in right now. Please try again.';
  }

  async function handleGoogleSignIn() {
    setSignInError(null);
    setIsAuthPending(true);

    appendAuthGateDebugLog('googleAuthRequestConfig', {
      platform: Platform.OS,
      hasRequest: !!request,
      redirectUri: request?.redirectUri,
      authUrl: request?.url,
      hasAndroidClientId: !!GOOGLE_ANDROID_CLIENT_ID,
      hasExpoClientId: !!GOOGLE_EXPO_CLIENT_ID,
      hasWebClientId: !!GOOGLE_WEB_CLIENT_ID,
      hasIosClientId: !!GOOGLE_IOS_CLIENT_ID,
    });

    try {
      if (Platform.OS === 'web') {
        const provider = new GoogleAuthProvider();
        const popupSignInResult = await signInWithPopup(auth, provider);
        routeSignedInUser();
        return;
      }

      await promptAsync();
    } catch (error) {
      console.warn('Failed to sign in with Google', error);
      setSignInError('Could not sign in with Google. Please try again.');
    } finally {
      if (Platform.OS === 'web') {
        setIsAuthPending(false);
      }
    }
  }

  function getNormalizedCreateCredentials() {
    const normalizedEmail = email.trim();

    if (!normalizedEmail || !password) {
      setSignInError('Enter both email and password');
      return null;
    }

    return { normalizedEmail, password };
  }

  async function handleEmailSignIn() {
    setSignInError(null);
    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      setSignInError('Enter your email');
      return;
    }

    if (!password) {
      setSignInError('Enter your password');
      return;
    }

    setIsAuthPending(true);

    try {
      const emailSignInResult = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      routeSignedInUser();
    } catch (signInError) {
      appendAuthGateDebugLog('emailSignInError', {
        email: normalizedEmail,
        code: signInError?.code,
        message: signInError?.message,
      });
      
      if (
        signInError?.code === 'auth/user-not-found'
        || signInError?.code === 'auth/invalid-credential'
        || signInError?.code === 'auth/wrong-password'
      ) {
        setSignInError('Incorrect Email / Password Combination');
        return;
      }

      setSignInError(getEmailAuthErrorMessage(signInError, 'signIn'));
    } finally {
      setIsAuthPending(false);
    }
  }

  async function handleEmailCreateAccount() {
    setSignInError(null);
    const credentials = getNormalizedCreateCredentials();

    if (!credentials) {
      return;
    }

    const { normalizedEmail, password: normalizedPassword } = credentials;

    setIsAuthPending(true);

    try {
      const createAccountResult = await createUserWithEmailAndPassword(auth, normalizedEmail, normalizedPassword);
      routeSignedInUser();
    } catch (createError) {
      setSignInError(getEmailAuthErrorMessage(createError, 'create'));
    } finally {
      setIsAuthPending(false);
    }
  }

  async function handleEmailAction() {
    if (isSignInMode) {
      await handleEmailSignIn();
      return;
    }

    await handleEmailCreateAccount();
  }

  if (!checkedAuth || isRoutingAuthenticatedUser || isAuthPending || isProcessingOAuthReturn) {
    return <SplashTransition />;
  }

  function handleEmailChange(value) {
    setEmail(value);
  }

  return (
    <ThemedView style={{ flex: 1, backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center' }}>
      <FrostedGlassCard style={[
        styles.authCard,
      ]}>

        <View style={{ width: '100%' }}>
          <DoggyDexHeader style={styles.authLogo} />
        </View>
        <View style={require('@/styles/homeStyles').homeStyles.chooserSubtitleWrap}>
          <ThemedText style={[
            require('@/styles/homeStyles').homeStyles.chooserSubtitle,
            { color: DoggyDexTheme.colors.textSecondary }
          ]}>
            Guess breeds, unlock coats,{"\n"}build your collection!
          </ThemedText>
        </View>

          <View style={{ width: '100%', alignItems: 'center', justifyContent: 'center', display: 'flex' }}>
            <TextInput
              value={email}
              onChangeText={handleEmailChange}
              placeholder="Email"
              placeholderTextColor={AUTH_INPUT_PLACEHOLDER_COLOR}
              autoCapitalize="none"
              keyboardType="email-address"
              onFocus={() => setFocusedField('email')}
              onBlur={() => setFocusedField((prev) => (prev === 'email' ? null : prev))}
              style={[
                styles.input,
                focusedField === 'email' && styles.inputFocused,
                { textAlign: 'center', marginBottom: 4 }
              ]}
            />
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        placeholderTextColor={AUTH_INPUT_PLACEHOLDER_COLOR}
        secureTextEntry
        onFocus={() => setFocusedField('password')}
        onBlur={() => setFocusedField((prev) => (prev === 'password' ? null : prev))}
              style={[
                styles.input,
                focusedField === 'password' && styles.inputFocused,
                { textAlign: 'center', marginBottom: 12 }
              ]}
      />

            {signInError ? <ThemedText style={styles.signInError}>{signInError}</ThemedText> : null}

            <View style={[styles.authControls, { alignItems: 'center', width: '100%' }]}> 
        <Pressable
        style={({ hovered, pressed }) => [
          commonStyles.playButton,
          styles.authActionButton,
          styles.authPrimaryButton,
          (hovered || pressed) && styles.authPrimaryHover,
          pressed && styles.buttonPressed,
          { marginBottom: 14 }
        ]}
        disabled={isAuthPending}
        onPress={handleEmailAction}>
        <ThemedText type="subtitle" style={[styles.buttonLabel, styles.authPrimaryLabel]}>
          {isSignInMode ? 'Sign In' : 'Create Account'}
        </ThemedText>
        </Pressable>

              <View style={styles.orRow}>
                <View style={styles.orLine} />
                <ThemedText style={styles.orText}>OR</ThemedText>
                <View style={styles.orLine} />
              </View>

        <Pressable
        style={({ hovered, pressed }) => [
          commonStyles.playButton,
          styles.authActionButton,
          styles.googleButton,
          (hovered || pressed) && styles.googleButtonHover,
          pressed && styles.buttonPressed,
          { marginTop: 14 }
        ]}
        disabled={isAuthPending || (Platform.OS !== 'web' && !request)}
        onPress={handleGoogleSignIn}>
        <View style={styles.googleButtonContent}>
                  <GoogleIcon size={28} style={styles.googleLogo} />
          <ThemedText type="subtitle" style={styles.googleButtonLabel}>Sign in with Google</ThemedText>
        </View>
        </Pressable>

              <View style={{ width: '100%', marginTop: 32 }}>
                <Link href="/doggydex" asChild>
                  <Pressable style={({ hovered, pressed }) => [styles.switchLink, hovered && styles.switchLinkHover, pressed && styles.switchLinkPressed]}>
                    {({ hovered, pressed }) => (
                      <ThemedText style={[styles.switchLinkText, hovered && styles.switchLinkTextHover, pressed && styles.switchLinkTextPressed]}>← Back</ThemedText>
                    )}
                  </Pressable>
                </Link>
              </View>
            </View>
          </View>
        </FrostedGlassCard>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  authCard: {
    width: 440,
    maxWidth: '94%',
    borderRadius: DoggyDexTheme.radii.large,
    paddingHorizontal: 28,
    paddingVertical: 32,
  },
  authLogo: {
    marginBottom: 28,
    transform: [{ scale: 1.18 }],
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingSpinner: {
    marginBottom: 14,
  },
  loadingText: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '600',
    color: '#FFFFFF',
    opacity: 0.92,
    textAlign: 'center',
  },
  gateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
  },
  titleText: {
    lineHeight: 30,
    flexShrink: 1,
    color: DoggyDexTheme.colors.primary,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  titleBalanceSpacer: {
    width: 42,
  },
  titlePawCluster: {
    marginLeft: 2,
  },
  titlePawIcon: {
    width: 40,
    height: 40,
    marginTop: -2,
    transform: [{ translateY: -4 }],
  },
  gateText: {
    fontSize: 15,
    lineHeight: 20,
    marginTop: 16,
    marginBottom: 22,
    textAlign: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: DoggyDexTheme.radii.medium,
    color: DoggyDexTheme.colors.textSecondary,
  },
  authControls: {
    marginTop: 14,
    gap: 10,
    alignItems: 'stretch',
    width: '100%',
    maxWidth: 340,
  },
  authActionButton: {
    width: '100%',
    alignItems: 'center',
    borderRadius: DoggyDexTheme.radii.medium,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  authPrimaryButton: {
    backgroundColor: DoggyDexTheme.colors.primary,
    borderWidth: 1,
    borderColor: DoggyDexTheme.colors.gold,
    ...DoggyDexTheme.shadow,
  },
  authPrimaryHover: {
    backgroundColor: '#E85F00',
    borderColor: DoggyDexTheme.colors.gold,
  },
  googleButton: {
    backgroundColor: DoggyDexTheme.colors.surface,
    borderWidth: 1,
    borderColor: DoggyDexTheme.colors.border,
  },
  googleButtonHover: {
    backgroundColor: DoggyDexTheme.colors.card,
    borderColor: PAW_FOCUS_COLOR,
  },
  googleButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  googleLogo: {
    width: 18,
    height: 18,
  },
  googleButtonLabel: {
    fontWeight: '600',
    color: DoggyDexTheme.colors.text,
    textAlign: 'center',
  },
  orRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  orLine: {
    flex: 1,
    height: 2,
    backgroundColor: DoggyDexTheme.colors.border,
  },
  orText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
    color: DoggyDexTheme.colors.textMuted,
  },
  input: {
    fontFamily: APP_FONT_FAMILY,
    color: AUTH_INPUT_TEXT_COLOR,
    width: '100%',
    maxWidth: 340,
    marginTop: 10,
    borderRadius: DoggyDexTheme.radii.small,
    borderWidth: 1,
    borderColor: DoggyDexTheme.colors.border,
    backgroundColor: DoggyDexTheme.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 16,
    fontSize: 14,
    lineHeight: 20,
    ...(Platform.OS === 'web'
      ? {
          outlineStyle: 'none',
          outlineWidth: 0,
        }
      : null),
  },
  inputFocused: {
    borderColor: PAW_FOCUS_COLOR,
    ...(Platform.OS === 'web'
      ? {
          outlineStyle: 'solid',
          outlineWidth: 2,
          outlineColor: PAW_FOCUS_COLOR,
        }
      : null),
  },
  buttonPressed: {
    transform: [{ scale: 0.98 }],
  },
  buttonLabel: {
    fontWeight: '600',
    textAlign: 'center',
    width: '100%',
  },
  authPrimaryLabel: {
    color: '#FFFFFF',
    fontSize: Platform.select({ web: 22, default: 20 }),
    lineHeight: Platform.select({ web: 28, default: 26 }),
    letterSpacing: 0.75,
    fontWeight: '600',
  },
  signInError: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 12,
    width: '100%',
    maxWidth: 340,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FDA29B',
    backgroundColor: '#FEF3F2',
    color: '#B42318',
    fontWeight: '600',
    textAlign: 'center',
  },
  switchLink: {
    alignSelf: 'flex-start',
    marginTop: 8,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.32)',
  },
  switchLinkHover: {
    backgroundColor: 'rgba(255,255,255,0.42)',
    transform: [{ translateX: -2 }],
  },
  switchLinkPressed: {
    transform: [{ scale: 0.99 }],
  },
  switchLinkText: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '600',
    color: '#4A2A1F',
    letterSpacing: 0.2,
    ...(Platform.OS === 'web'
      ? {
          transitionProperty: 'color, transform',
          transitionDuration: '0.2s, 0.15s',
          transitionTimingFunction: 'ease, ease',
        }
      : null),
  },
  switchLinkTextHover: {
    color: '#6B3E2E',
    textDecorationLine: 'underline',
  },
  switchLinkTextPressed: {
    color: '#3A2018',
  },
});
