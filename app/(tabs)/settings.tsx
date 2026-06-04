import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Download, ShieldCheck, TriangleAlert, Trash2, FileText, LogOut } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { ERROR_COPY } from '@/lib/errors';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? '');
    });
  }, []);

  const initials = userEmail
    ? userEmail.split('@')[0].slice(0, 2).toUpperCase()
    : 'U';

  async function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
        },
      },
    ]);
  }

  async function handleDeleteAccount() {
    Alert.alert(
      'Delete account',
      'This permanently deletes all your receipts and account data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.functions.invoke('delete-account');
            if (error) {
              Alert.alert('Delete failed', ERROR_COPY.deleteAccount);
              return;
            }
            await supabase.auth.signOut();
          },
        },
      ]
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* App bar */}
      <View style={styles.appBar}>
        <View style={styles.appBarSpacer} />
        <Text style={styles.appBarTitle}>Settings</Text>
        <View style={styles.appBarSpacer} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        {/* Profile row */}
        <View style={styles.profileRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View>
            <Text style={styles.email}>{userEmail}</Text>
          </View>
        </View>

        {/* Export card */}
        <View style={styles.cardsSection}>
          {/* Export CSV card */}
          <TouchableOpacity style={styles.card} activeOpacity={0.7}>
            <View style={[styles.cardAvatar, { backgroundColor: '#ECFDF5' }]}>
              <Download size={18} color="#0D9488" />
            </View>
            <View style={styles.cardInfo}>
              <Text style={styles.cardTitle}>Export as CSV</Text>
              <Text style={styles.cardSub}>Download all your receipts</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>

        </View>

        {/* Bottom section */}
        <View style={styles.bottomSection}>
          {/* Privacy Policy */}
          <TouchableOpacity
            style={styles.privacyRow}
            onPress={() => Linking.openURL('https://ireceipt.app/privacy')}
            activeOpacity={0.7}
          >
            <ShieldCheck size={18} color="#6B7280" />
            <Text style={styles.privacyLabel}>Privacy Policy</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>

          {/* Sign out */}
          <TouchableOpacity style={styles.signOutRow} onPress={handleSignOut} activeOpacity={0.7}>
            <LogOut size={18} color="#6B7280" />
            <Text style={styles.privacyLabel}>Sign Out</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>

          {/* Danger zone card */}
          <View style={styles.dangerCard}>
            <View style={styles.dangerBanner}>
              <TriangleAlert size={14} color="#EF4444" />
              <Text style={styles.dangerBannerText}>DANGER ZONE</Text>
            </View>
            <View style={styles.dangerBody}>
              <Text style={styles.dangerTitle}>Delete Account</Text>
              <Text style={styles.dangerSub}>
                Permanently removes your account and all receipts.
              </Text>
              <TouchableOpacity
                style={styles.tosRow}
                onPress={() => Linking.openURL('https://ireceipt.app/terms')}
                activeOpacity={0.7}
              >
                <Text style={styles.tosLabel}>Terms of Service</Text>
                <FileText size={14} color="#6B7280" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={handleDeleteAccount}
                activeOpacity={0.85}
              >
                <Text style={styles.deleteBtnText}>Delete My Account</Text>
                <Trash2 size={14} color="#EF4444" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff',
  },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  appBarSpacer: {
    width: 36,
  },
  appBarTitle: {
    flex: 1,
    fontFamily: 'DMSans-SemiBold',
    fontSize: 17,
    color: '#111827',
    textAlign: 'center',
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#fff',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#0D9488',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: 'DMSans-Bold',
    fontSize: 18,
    color: '#fff',
  },
  email: {
    fontFamily: 'DMSans-Regular',
    fontSize: 13,
    color: '#6B7280',
  },
  cardsSection: {
    backgroundColor: '#F8FAFC',
    padding: 16,
    gap: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 64,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  cardAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: {
    flex: 1,
    gap: 3,
  },
  cardTitle: {
    fontFamily: 'DMSans-SemiBold',
    fontSize: 14,
    color: '#0C0C0C',
  },
  cardSub: {
    fontFamily: 'DMSans-Regular',
    fontSize: 12,
    color: '#6B7280',
  },
  chevron: {
    fontFamily: 'DMSans-Bold',
    fontSize: 22,
    color: '#9CA3AF',
  },
  bottomSection: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 8,
    gap: 10,
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    paddingHorizontal: 16,
    gap: 12,
  },
  signOutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    paddingHorizontal: 16,
    gap: 12,
  },
  privacyLabel: {
    flex: 1,
    fontFamily: 'DMSans-Medium',
    fontSize: 14,
    color: '#111827',
  },
  dangerCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    overflow: 'hidden',
  },
  dangerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  dangerBannerText: {
    fontFamily: 'DMSans-SemiBold',
    fontSize: 11,
    color: '#EF4444',
    letterSpacing: 0.8,
  },
  dangerBody: {
    padding: 14,
    gap: 10,
  },
  dangerTitle: {
    fontFamily: 'DMSans-SemiBold',
    fontSize: 15,
    color: '#EF4444',
  },
  dangerSub: {
    fontFamily: 'DMSans-Regular',
    fontSize: 12,
    color: '#9CA3AF',
  },
  tosRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F9FAFB',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tosLabel: {
    flex: 1,
    fontFamily: 'DMSans-Medium',
    fontSize: 13,
    color: '#374151',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  deleteBtnText: {
    fontFamily: 'DMSans-SemiBold',
    fontSize: 13,
    color: '#EF4444',
    textAlign: 'center',
  },
});
