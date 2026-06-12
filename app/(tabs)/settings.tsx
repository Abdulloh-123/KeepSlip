import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ScrollView,
  Linking,
  Share,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Download, ShieldCheck, TriangleAlert, Trash2, FileText, LogOut, UserRound } from 'lucide-react-native';
import {
  fetchAccountProfile,
  fetchReceipts,
  supabase,
  upsertAccountProfile,
} from '@/lib/supabase';
import type { AccountType } from '@/lib/supabase';
import { ERROR_COPY } from '@/lib/errors';
import { trackError, trackEvent } from '@/lib/analytics';

function csvCell(value: unknown) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [userEmail, setUserEmail] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('individual');
  const [fullName, setFullName] = useState('');
  const [workField, setWorkField] = useState('');
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');

  useEffect(() => {
    let mounted = true;

    async function loadAccount() {
      setProfileLoading(true);
      setProfileError('');
      try {
        const { data } = await supabase.auth.getUser();
        const user = data.user;
        if (!mounted) return;

        setUserEmail(user?.email ?? '');
        const metadata = user?.user_metadata ?? {};
        const fallbackType =
          metadata.account_type === 'business' ? 'business' : 'individual';
        const fallbackName =
          typeof metadata.full_name === 'string' ? metadata.full_name : '';
        const fallbackField =
          typeof metadata.work_field === 'string' ? metadata.work_field : '';

        const profile = await fetchAccountProfile().catch(() => null);
        if (!mounted) return;

        const nextType = profile?.account_type ?? fallbackType;
        const nextName = profile?.full_name ?? fallbackName;
        const nextField = profile?.work_field ?? fallbackField;
        setAccountType(nextType);
        setFullName(nextName);
        setWorkField(nextField);

        if (!profile && user && nextName.trim()) {
          await upsertAccountProfile({
            account_type: nextType,
            full_name: nextName,
            work_field: nextField,
          }).catch(() => undefined);
        }
      } catch (error) {
        void trackError(error, {
          screen: 'settings',
          properties: { phase: 'load_account' },
        });
        if (mounted) setProfileError('We could not load your account details.');
      } finally {
        if (mounted) setProfileLoading(false);
      }
    }

    loadAccount();
    return () => {
      mounted = false;
    };
  }, []);

  const displayName = fullName.trim();
  const initials = displayName
    ? displayName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
    : userEmail
    ? userEmail.split('@')[0].slice(0, 2).toUpperCase()
    : 'U';

  async function handleSaveProfile() {
    setProfileError('');
    if (fullName.trim().length < 2) {
      setProfileError('Enter your name before saving.');
      return;
    }

    setProfileSaving(true);
    try {
      void trackEvent('profile_save_started', {
        account_type: accountType,
        has_work_field: Boolean(workField.trim()),
      }, 'settings');
      await upsertAccountProfile({
        account_type: accountType,
        full_name: fullName,
        work_field: workField,
      });
      void trackEvent('profile_save_succeeded', { account_type: accountType }, 'settings');
      Alert.alert('Saved', 'Your account details were updated.');
    } catch (error) {
      void trackError(error, {
        screen: 'settings',
        properties: { phase: 'save_profile', account_type: accountType },
      });
      void trackEvent('profile_save_failed', { account_type: accountType }, 'settings');
      setProfileError('We could not save your account details. Please try again.');
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          void trackEvent('sign_out_started', {}, 'settings');
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
            void trackEvent('account_delete_started', {}, 'settings');
            const { error } = await supabase.functions.invoke('delete-account');
            if (error) {
              void trackError(error, { screen: 'settings', properties: { phase: 'delete_account' } });
              void trackEvent('account_delete_failed', {}, 'settings');
              Alert.alert('Delete failed', ERROR_COPY.deleteAccount);
              return;
            }
            void trackEvent('account_delete_succeeded', {}, 'settings');
            await supabase.auth.signOut();
          },
        },
      ]
    );
  }

  async function handleExportCsv() {
    try {
      void trackEvent('receipts_export_started', {}, 'settings');
      const receipts = await fetchReceipts();
      const rows = [
        ['Merchant', 'Date', 'Amount', 'Currency', 'Category', 'Business', 'Source'],
        ...receipts.map((receipt) => [
          receipt.merchant_name,
          receipt.date,
          receipt.total_amount,
          receipt.currency,
          receipt.category ?? '',
          receipt.is_business ? 'Yes' : 'No',
          receipt.source,
        ]),
      ];
      const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n');
      await Share.share({
        title: 'KeepSlip receipts CSV',
        message: csv,
      });
      void trackEvent('receipts_export_succeeded', {
        receipt_count: receipts.length,
      }, 'settings');
    } catch (error) {
      void trackError(error, { screen: 'settings', properties: { phase: 'export_csv' } });
      void trackEvent('receipts_export_failed', {}, 'settings');
      Alert.alert('Export failed', 'Could not export receipts right now.');
    }
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
            <Text style={styles.profileName}>{displayName || 'Your account'}</Text>
            <Text style={styles.email}>{userEmail}</Text>
          </View>
        </View>

        <View style={styles.accountSection}>
          <View style={styles.sectionHeader}>
            <View style={[styles.cardAvatar, { backgroundColor: '#ECFDF5' }]}>
              <UserRound size={18} color="#0D9488" />
            </View>
            <View style={styles.cardInfo}>
              <Text style={styles.cardTitle}>Account details</Text>
              <Text style={styles.cardSub}>Used to personalize KeepSlip</Text>
            </View>
          </View>

          <View style={styles.segmented}>
            {(['individual', 'business'] as const).map((type) => (
              <TouchableOpacity
                key={type}
                style={[styles.segment, accountType === type && styles.segmentActive]}
                onPress={() => setAccountType(type)}
                disabled={profileLoading || profileSaving}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.segmentText,
                    accountType === type && styles.segmentTextActive,
                  ]}
                >
                  {type === 'individual' ? 'Individual' : 'Business'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            style={styles.input}
            placeholder="Name"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="words"
            value={fullName}
            onChangeText={setFullName}
            editable={!profileLoading && !profileSaving}
          />
          <TextInput
            style={styles.input}
            placeholder="Field you work in (optional)"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="words"
            value={workField}
            onChangeText={setWorkField}
            editable={!profileLoading && !profileSaving}
          />

          {profileError ? <Text style={styles.profileError}>{profileError}</Text> : null}

          <TouchableOpacity
            style={[
              styles.saveProfileBtn,
              (profileLoading || profileSaving) && styles.saveProfileBtnDisabled,
            ]}
            onPress={handleSaveProfile}
            disabled={profileLoading || profileSaving}
            activeOpacity={0.85}
          >
            {profileSaving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveProfileText}>
                {profileLoading ? 'Loading account' : 'Save account details'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Export card */}
        <View style={styles.cardsSection}>
          {/* Export CSV card */}
          <TouchableOpacity style={styles.card} onPress={handleExportCsv} activeOpacity={0.7}>
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
  profileName: {
    fontFamily: 'DMSans-SemiBold',
    fontSize: 16,
    color: '#111827',
    marginBottom: 2,
  },
  accountSection: {
    backgroundColor: '#F8FAFC',
    padding: 16,
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    padding: 14,
    gap: 12,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: '#E5E7EB',
    borderRadius: 12,
    padding: 3,
  },
  segment: {
    flex: 1,
    borderRadius: 9,
    paddingVertical: 10,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: '#fff',
  },
  segmentText: {
    fontFamily: 'DMSans-Medium',
    fontSize: 14,
    color: '#6B7280',
  },
  segmentTextActive: {
    fontFamily: 'DMSans-SemiBold',
    color: '#0D9488',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: 'DMSans-Regular',
    fontSize: 15,
    color: '#111827',
  },
  profileError: {
    fontFamily: 'DMSans-Regular',
    fontSize: 13,
    color: '#DC2626',
    lineHeight: 18,
  },
  saveProfileBtn: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#0D9488',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  saveProfileBtnDisabled: {
    opacity: 0.7,
  },
  saveProfileText: {
    fontFamily: 'DMSans-SemiBold',
    fontSize: 14,
    color: '#fff',
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
