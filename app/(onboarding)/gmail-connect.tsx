import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Mail, Search, Shield } from 'lucide-react-native';
import { useGmailAuth, saveGmailToken } from '@/lib/gmail';

export default function GmailConnectScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { promptAsync } = useGmailAuth();

  async function handleConnect() {
    const result = await promptAsync();
    if (result.type !== 'success') return;
    const token = result.authentication?.accessToken;
    if (token) await saveGmailToken(token, result.authentication?.expiresIn);
    router.replace('/(onboarding)/permissions');
  }

  function handleSkip() {
    router.replace('/(onboarding)/permissions');
  }

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom + 20 }]}>
      {/* Teal header */}
      <View style={styles.header}>
        <View style={styles.iconCircle}>
          <Mail size={40} color="#fff" />
        </View>
        <Text style={styles.title}>Connect Gmail</Text>
        <Text style={styles.subtitle}>We read only receipt emails.</Text>
      </View>

      {/* Info cards */}
      <View style={styles.body}>
        <View style={styles.card}>
          <View style={styles.cardIcon}>
            <Search size={18} color="#0D9488" />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>What we access</Text>
            <Text style={styles.cardSub}>
              Subject lines matching 'receipt', 'order', 'invoice'.
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardIcon}>
            <Shield size={18} color="#0D9488" />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Privacy protected</Text>
            <Text style={styles.cardSub}>
              We never read personal emails or contacts.
            </Text>
          </View>
        </View>

        {/* CTAs */}
        <TouchableOpacity style={styles.primaryBtn} onPress={handleConnect} activeOpacity={0.85}>
          <Mail size={18} color="#fff" />
          <Text style={styles.primaryBtnText}>Connect Gmail</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.skipBtn} onPress={handleSkip} activeOpacity={0.7}>
          <Text style={styles.skipText}>Skip for now</Text>
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
    fontSize: 24,
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
