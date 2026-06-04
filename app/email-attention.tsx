import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, CheckCircle2, ExternalLink, Mail, TriangleAlert } from 'lucide-react-native';
import {
  fetchPendingEmailReceipts,
  resolvePendingEmailReceipt,
} from '@/lib/supabase';
import type { PendingEmailReceipt } from '@/types/receipt';

function formatDate(str: string | null) {
  if (!str) return 'Unknown date';
  return new Date(str).toLocaleDateString('en-AU', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function senderName(from: string | null): string {
  if (!from) return 'Unknown sender';
  const nameMatch = from.match(/^([^<]+)</);
  if (nameMatch) return nameMatch[1].trim();
  return from.split('@')[0];
}

function gmailSearch(item: PendingEmailReceipt): string {
  if (item.email_rfc822_message_id) return `rfc822msgid:${item.email_rfc822_message_id}`;
  if (item.gmail_search) return item.gmail_search;
  if (item.email_message_id) return item.email_message_id;
  return `${item.merchant_hint ?? ''} ${item.email_subject ?? ''}`.trim();
}

export default function EmailAttentionScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<PendingEmailReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await fetchPendingEmailReceipts());
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openGmail(item: PendingEmailReceipt) {
    const query = gmailSearch(item);
    Linking.openURL(
      `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(query)}`
    ).catch(() => null);
  }

  async function markUploaded(item: PendingEmailReceipt) {
    Alert.alert(
      'Mark as done?',
      'Use this only after you found the email, downloaded the receipt, and uploaded it manually.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Already uploaded',
          onPress: async () => {
            setResolvingId(item.id);
            try {
              await resolvePendingEmailReceipt(item.id);
              setItems((current) => current.filter((row) => row.id !== item.id));
            } catch (e: any) {
              Alert.alert('Could not update', e.message ?? 'Please try again.');
            } finally {
              setResolvingId(null);
            }
          },
        },
      ]
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.appBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <ArrowLeft size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.titleText}>Needs Attention</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#0D9488" />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centered}>
          <CheckCircle2 size={34} color="#16A34A" />
          <Text style={styles.emptyTitle}>Nothing needs attention</Text>
          <Text style={styles.emptyBody}>
            Receipt emails that need manual download will stay here until you mark them done.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        >
          <View style={styles.summary}>
            <TriangleAlert size={17} color="#D97706" />
            <Text style={styles.summaryText}>
              {items.length} receipt email{items.length !== 1 ? 's' : ''} need manual download
            </Text>
          </View>

          {items.map((item) => (
            <View key={item.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.iconWrap}>
                  <Mail size={17} color="#D97706" />
                </View>
                <View style={styles.cardMeta}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {item.merchant_hint || item.email_subject || 'Receipt email'}
                  </Text>
                  <Text style={styles.cardSub} numberOfLines={1}>
                    {senderName(item.email_source)} · {formatDate(item.email_received_at)}
                  </Text>
                </View>
              </View>

              <View style={styles.searchBox}>
                <Text style={styles.searchLabel}>Gmail search</Text>
                <Text style={styles.searchText}>{gmailSearch(item)}</Text>
              </View>

              {item.email_subject && (
                <Text style={styles.subjectText} numberOfLines={2}>
                  {item.email_subject}
                </Text>
              )}

              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.gmailButton}
                  onPress={() => openGmail(item)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.gmailButtonText}>Open Gmail</Text>
                  <ExternalLink size={14} color="#92400E" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.doneButton}
                  onPress={() => markUploaded(item)}
                  activeOpacity={0.8}
                  disabled={resolvingId === item.id}
                >
                  {resolvingId === item.id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.doneButtonText}>Already uploaded manually</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleText: {
    flex: 1,
    fontFamily: 'DMSans-SemiBold',
    fontSize: 17,
    color: '#111827',
    textAlign: 'center',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    gap: 10,
  },
  emptyTitle: {
    fontFamily: 'DMSans-SemiBold',
    fontSize: 18,
    color: '#111827',
    textAlign: 'center',
  },
  emptyBody: {
    fontFamily: 'DMSans-Regular',
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  scroll: {
    flex: 1,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FEF3C7',
    margin: 16,
    marginBottom: 8,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  summaryText: {
    flex: 1,
    fontFamily: 'DMSans-SemiBold',
    fontSize: 13,
    color: '#92400E',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginHorizontal: 16,
    marginTop: 8,
    padding: 14,
    gap: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFBEB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardMeta: {
    flex: 1,
    gap: 3,
  },
  cardTitle: {
    fontFamily: 'DMSans-SemiBold',
    fontSize: 15,
    color: '#111827',
  },
  cardSub: {
    fontFamily: 'DMSans-Regular',
    fontSize: 12,
    color: '#6B7280',
  },
  searchBox: {
    backgroundColor: '#FAFAFA',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    padding: 10,
    gap: 4,
  },
  searchLabel: {
    fontFamily: 'DMSans-SemiBold',
    fontSize: 10,
    color: '#9CA3AF',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  searchText: {
    fontFamily: 'DMSans-Regular',
    fontSize: 12,
    color: '#374151',
    lineHeight: 17,
  },
  subjectText: {
    fontFamily: 'DMSans-Regular',
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  actions: {
    gap: 8,
  },
  gmailButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    height: 40,
    gap: 6,
  },
  gmailButtonText: {
    fontFamily: 'DMSans-SemiBold',
    fontSize: 13,
    color: '#92400E',
  },
  doneButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D9488',
    borderRadius: 8,
    height: 42,
  },
  doneButtonText: {
    fontFamily: 'DMSans-SemiBold',
    fontSize: 13,
    color: '#fff',
  },
});
