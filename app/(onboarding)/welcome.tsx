import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Receipt, ArrowRight } from 'lucide-react-native';

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Teal hero */}
      <View style={styles.hero}>
        <View style={styles.iconCircle}>
          <Receipt size={44} color="#fff" />
        </View>
        <Text style={styles.appName}>KeepSlip</Text>
      </View>

      {/* Page dots — dot 1 active (Welcome), dot 2 inactive (Permissions) */}
      <View style={styles.dotsRow}>
        <View style={[styles.dot, styles.dotActive]} />
        <View style={styles.dot} />
      </View>

      {/* Sample receipt card previews */}
      <View style={styles.previewCards}>
        <View style={styles.previewCard}>
          <View style={[styles.previewAvatar, { backgroundColor: '#ECFDF5' }]} />
          <View style={styles.previewInfo}>
            <View style={styles.previewLineLong} />
            <View style={styles.previewLineShort} />
          </View>
        </View>
        <View style={styles.previewCard}>
          <View style={[styles.previewAvatar, { backgroundColor: '#FEF3C7' }]} />
          <View style={styles.previewInfo}>
            <View style={styles.previewLineLong} />
            <View style={styles.previewLineShort} />
          </View>
        </View>
      </View>

      {/* Bottom CTA */}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 40 }]}>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => router.replace('/(onboarding)/permissions')}
          activeOpacity={0.85}
        >
          <ArrowRight size={18} color="#fff" />
          <Text style={styles.primaryBtnText}>Get Started</Text>
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
  hero: {
    height: 290,
    backgroundColor: '#0D9488',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingTop: 32,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  iconCircle: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appName: {
    fontFamily: 'DMSans-Bold',
    fontSize: 30,
    color: '#fff',
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: '#fff',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E5E7EB',
  },
  dotActive: {
    backgroundColor: '#0D9488',
  },
  previewCards: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 10,
  },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 72,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  previewAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  previewInfo: {
    flex: 1,
    gap: 8,
  },
  previewLineLong: {
    height: 12,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    width: '60%',
  },
  previewLineShort: {
    height: 10,
    borderRadius: 5,
    backgroundColor: '#F1F5F9',
    width: '40%',
  },
  bottom: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
    justifyContent: 'flex-end',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D9488',
    borderRadius: 14,
    paddingVertical: 16,
    gap: 10,
  },
  primaryBtnText: {
    fontFamily: 'DMSans-Bold',
    fontSize: 16,
    color: '#fff',
  },
});
