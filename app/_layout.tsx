import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
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

  const [fontsLoaded] = useFonts({
    'DMSans-Regular': DMSans_400Regular,
    'DMSans-Medium': DMSans_500Medium,
    'DMSans-SemiBold': DMSans_600SemiBold,
    'DMSans-Bold': DMSans_700Bold,
    'CabinetGrotesk-Medium': require('../assets/fonts/CabinetGrotesk-Medium.ttf'),
    'CabinetGrotesk-Bold': require('../assets/fonts/CabinetGrotesk-Bold.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const inAuthGroup = segments[0] === '(auth)';
        const inOnboarding = segments[0] === '(onboarding)';

        if (!session && !inAuthGroup) {
          router.replace('/(auth)');
        } else if (session && inAuthGroup) {
          // New sign-in: route through onboarding for first-timers
          const done = await SecureStore.getItemAsync(ONBOARDING_KEY);
          if (done) {
            router.replace('/(tabs)');
          } else {
            router.replace('/(onboarding)/welcome');
          }
        }
        // inOnboarding or inTabs with session — let screens control their own flow
      }
    );
    return () => subscription.unsubscribe();
  }, [segments]);

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
          name="email-import"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="email-import-results"
          options={{ presentation: 'card', headerShown: false }}
        />
      </Stack>
    </GestureHandlerRootView>
  );
}
