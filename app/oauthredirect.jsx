import { auth } from '@/lib/firebase-services';
import { SplashTransition } from '@/components/splash-transition';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';

import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';

export default function OAuthRedirect() {
  const router = useRouter();

  useEffect(() => {
    WebBrowser.maybeCompleteAuthSession();

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.replace('/');
        return;
      }

      router.replace('/doggydex');
    });

    return unsubscribe;
  }, [router]);

  return <SplashTransition />;
}
