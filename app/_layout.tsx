import { useEffect, useState } from 'react';
import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import {
  useFonts,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import * as SplashScreen from 'expo-splash-screen';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { supabase } from '@/lib/supabase';

SplashScreen.preventAutoHideAsync();

const ONBOARDING_KEY = 'onboarding_complete';

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const rootNavigationState = useRootNavigationState();
  const [authChecked, setAuthChecked] = useState(false);

  const [fontsLoaded] = useFonts({
    'DMSans-Regular': DMSans_400Regular,
    'DMSans-Medium': DMSans_500Medium,
    'DMSans-SemiBold': DMSans_600SemiBold,
    'DMSans-Bold': DMSans_700Bold,
    'CabinetGrotesk-Medium': require('../assets/fonts/CabinetGrotesk-Medium.ttf'),
    'CabinetGrotesk-Bold': require('../assets/fonts/CabinetGrotesk-Bold.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded && authChecked) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, authChecked]);

  useEffect(() => {
    if (!rootNavigationState?.key) return;

    let mounted = true;

    async function routeForSession(session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']) {
      const inAuthGroup = segments[0] === '(auth)';
      const inOnboarding = segments[0] === '(onboarding)';

      if (!session) {
        if (!inAuthGroup) router.replace('/(auth)');
        return;
      }

      const done = await SecureStore.getItemAsync(ONBOARDING_KEY);
      if (!done && !inOnboarding) {
        router.replace('/(onboarding)/welcome');
      } else if (done && (inAuthGroup || inOnboarding)) {
        router.replace('/(tabs)');
      }
    }

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      await routeForSession(data.session);
      setAuthChecked(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!mounted) return;
        await routeForSession(session);
        setAuthChecked(true);
      }
    );
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [rootNavigationState?.key, segments]);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="receipt/[id]"
          options={{ presentation: 'card', headerShown: false }}
        />
        <Stack.Screen
          name="scan"
          options={{ presentation: 'fullScreenModal', headerShown: false }}
        />
        <Stack.Screen
          name="add-receipt"
          options={{ presentation: 'transparentModal', headerShown: false }}
        />
      </Stack>
    </GestureHandlerRootView>
  );
}
