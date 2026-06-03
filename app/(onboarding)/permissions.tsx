import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Camera, ScanLine, Lock } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';

const ONBOARDING_KEY = 'onboarding_complete';

export default function CameraPermissionScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  async function completeOnboarding() {
    await SecureStore.setItemAsync(ONBOARDING_KEY, 'true');
    router.replace('/(tabs)');
  }

  async function handleAllow() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Camera access denied',
        'You can enable it later in Settings → KeepSlip → Camera.',
        [{ text: 'OK', onPress: completeOnboarding }]
      );
      return;
    }
    await completeOnboarding();
  }

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom + 20 }]}>
      {/* Teal header */}
      <View style={styles.header}>
        <View style={styles.iconCircle}>
          <Camera size={40} color="#fff" />
        </View>
        <Text style={styles.title}>Allow Camera Access</Text>
        <Text style={styles.subtitle}>Scan receipts in seconds.</Text>
      </View>

      {/* Info cards */}
      <View style={styles.body}>
        <View style={styles.card}>
          <View style={styles.cardIcon}>
            <ScanLine size={18} color="#0D9488" />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>What gets scanned</Text>
            <Text style={styles.cardSub}>
              Receipt total, line items, date, and merchant name.
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardIcon}>
            <Lock size={18} color="#0D9488" />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Photos stay private</Text>
            <Text style={styles.cardSub}>
              Images are uploaded to your private encrypted storage.
            </Text>
          </View>
        </View>

        {/* CTAs */}
        <TouchableOpacity style={styles.primaryBtn} onPress={handleAllow} activeOpacity={0.85}>
          <Camera size={18} color="#fff" />
          <Text style={styles.primaryBtnText}>Allow Camera Access</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.skipBtn} onPress={completeOnboarding} activeOpacity={0.7}>
          <Text style={styles.skipText}>Not now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    backgroundColor: '#0D9488',
    height: 240,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 20,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: 'DMSans-Bold',
    fontSize: 22,
    color: '#fff',
  },
  subtitle: {
    fontFamily: 'DMSans-Regular',
    fontSize: 14,
    color: 'rgba(255,255,255,0.82)',
  },
  body: {
    flex: 1,
    padding: 24,
    gap: 12,
    paddingTop: 20,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    padding: 14,
    paddingHorizontal: 16,
    gap: 12,
    height: 72,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    flex: 1,
    gap: 3,
  },
  cardTitle: {
    fontFamily: 'DMSans-SemiBold',
    fontSize: 15,
    color: '#0C0C0C',
  },
  cardSub: {
    fontFamily: 'DMSans-Regular',
    fontSize: 12,
    color: '#6B7280',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D9488',
    borderRadius: 14,
    height: 52,
    gap: 10,
    marginTop: 8,
  },
  primaryBtnText: {
    fontFamily: 'DMSans-Bold',
    fontSize: 16,
    color: '#fff',
  },
  skipBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  skipText: {
    fontFamily: 'DMSans-Medium',
    fontSize: 14,
    color: '#9CA3AF',
  },
});
