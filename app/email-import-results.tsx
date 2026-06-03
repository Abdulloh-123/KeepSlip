import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
  Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowLeft, Package, TriangleAlert, Mail, Copy, ExternalLink } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import type { Receipt } from '@/types/receipt';
import type { LinkOnlyReceipt } from '@/lib/gmail';

function formatDate(str: string) {
  return new Date(str).toLocaleDateString('en-AU', { month: 'short', day: 'numeric', year: 'numeric' });
}

function senderName(from: string): string {
  const nameMatch = from.match(/^([^<]+)</);
  if (nameMatch) return nameMatch[1].trim();
  return from.split('@')[0];
}

export default function EmailImportResults() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{
    imported:        string;
    already_scanned: string;
    remaining:       string;
  }>();

  const importedCount    = Number(params.imported        ?? 0);
  const alreadyScanned   = Number(params.already_scanned ?? 0);
  const remainingCount   = Number(params.remaining       ?? 0);

  const [receipts,  setReceipts]  = useState<Receipt[]>([]);
  const [linkOnly,  setLinkOnly]  = useState<LinkOnlyReceipt[]>([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    await Promise.all([loadReceipts(), loadLinkOnly()]);
    setLoading(false);
  }

  async function loadReceipts() {
    try {
      const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('receipts')
        .select('*')
        .eq('source', 'email_agent')
        .gte('created_at', since)
        .order('created_at', { ascending: false });
      if (!error) setReceipts(data ?? []);
    } catch {}
  }

  async function loadLinkOnly() {
    try {
      const raw = await AsyncStorage.getItem('email_import_link_only');
      if (raw) setLinkOnly(JSON.parse(raw) as LinkOnlyReceipt[]);
    } catch {}
  }

  async function copySearch(item: LinkOnlyReceipt) {
    try {
      await Share.share({ message: item.gmail_search });
    } catch {}
  }

  function openGmail(item: LinkOnlyReceipt) {
    Linking.openURL(
      `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(item.gmail_search)}`
    );
  }

  function handleDone() {
    router.replace('/(tabs)');
  }

  const hasStats = alreadyScanned > 0 || remainingCount > 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* App bar */}
      <View style={styles.appBar}>
        <TouchableOpacity style={styles.backBtn} onPress={handleDone} activeOpacity={0.7}>
          <ArrowLeft size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.titleText}>Import from Email</Text>
        <TouchableOpacity style={styles.doneChip} onPress={handleDone} activeOpacity={0.85}>
          <Text style={styles.doneChipText}>Done</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── ADDED section ──────────────────────────────────────────────── */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionLabel}>ADDED</Text>
          <View style={styles.greenBadge}>
            <Text style={styles.greenBadgeText}>{importedCount}</Text>
          </View>
        </View>

        <View style={styles.cardsWrap}>
          {loading ? (
            <ActivityIndicator size="small" color="#0D9488" style={styles.loader} />
          ) : receipts.length > 0 ? (
            receipts.map((r) => (
              <TouchableOpacity
                key={r.id}
                style={styles.card}
                onPress={() => router.push(`/receipt/${r.id}`)}
                activeOpacity={0.7}
              >
                <View style={styles.cardAvatar}>
                  <Package size={18} color="#0D9488" />
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardName}>{r.merchant_name}</Text>
                  <Text style={styles.cardSub}>{formatDate(r.date)} · Email import</Text>
                </View>
                <Text style={styles.cardAmount}>${r.total_amount.toFixed(2)}</Text>
              </TouchableOpacity>
            ))
          ) : (
            <Text style={styles.emptyNote}>
              {importedCount > 0
                ? 'Receipts saved — pull to refresh on the home screen.'
                : 'No new receipts found in this period.'}
            </Text>
          )}
        </View>

        {/* ── NEEDS YOUR ATTENTION section ──────────────────────────────── */}
        {linkOnly.length > 0 && (
          <View style={styles.nhSection}>
            <View style={styles.nhHeader}>
              <TriangleAlert size={15} color="#D97706" />
              <Text style={styles.nhLabel}>NEEDS YOUR ATTENTION</Text>
              <View style={styles.amberBadge}>
                <Text style={styles.amberBadgeText}>{linkOnly.length}</Text>
              </View>
            </View>

            <Text style={styles.nhNote}>
              These emails look like receipts but didn't have enough detail to import automatically.
              Find each one in Gmail and upload the attachment.
            </Text>

            {linkOnly.map((item) => (
              <View key={item.message_id} style={styles.linkCard}>
                {/* Card header */}
                <View style={styles.linkCardHeader}>
                  <View style={styles.mailIconWrap}>
                    <Mail size={16} color="#D97706" />
                  </View>
                  <View style={styles.linkCardMeta}>
                    <Text style={styles.linkCardSubject} numberOfLines={1}>
                      {item.subject || '(no subject)'}
                    </Text>
                    <Text style={styles.linkCardFrom} numberOfLines={1}>
                      {senderName(item.from_address)}
                      {item.received_at ? ` · ${formatDate(item.received_at)}` : ''}
                    </Text>
                  </View>
                </View>

                {/* Gmail search hint */}
                <View style={styles.searchHintBlock}>
                  <Text style={styles.searchHintLabel}>Gmail search</Text>
                  <Text style={styles.searchHintText} numberOfLines={2} selectable>
                    {item.gmail_search}
                  </Text>
                </View>

                {/* Actions */}
                <View style={styles.linkCardActions}>
                  <TouchableOpacity
                    style={styles.copyBtn}
                    onPress={() => copySearch(item)}
                    activeOpacity={0.8}
                  >
                    <Copy size={13} color="#92400E" />
                    <Text style={styles.copyBtnText}>
                      Copy search
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.openBtn}
                    onPress={() => openGmail(item)}
                    activeOpacity={0.8}
                  >
                    <ExternalLink size={13} color="#fff" />
                    <Text style={styles.openBtnText}>Open in Gmail</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── Stats row ─────────────────────────────────────────────────── */}
        {hasStats && (
          <View style={styles.statsRow}>
            {alreadyScanned > 0 && (
              <Text style={styles.statChip}>
                {alreadyScanned} already scanned
              </Text>
            )}
            {alreadyScanned > 0 && remainingCount > 0 && (
              <Text style={styles.statDot}>·</Text>
            )}
            {remainingCount > 0 && (
              <Text style={styles.statChip}>
                {remainingCount} left in this period
              </Text>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
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
    gap: 12,
    backgroundColor: '#fff',
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
  },
  doneChip: {
    backgroundColor: '#ECFDF5',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  doneChipText: {
    fontFamily: 'DMSans-SemiBold',
    fontSize: 12,
    color: '#0D9488',
  },
  scroll: {
    flex: 1,
  },

  // ── Section headers
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    paddingTop: 12,
    paddingBottom: 8,
    paddingHorizontal: 16,
  },
  sectionLabel: {
    fontFamily: 'DMSans-SemiBold',
    fontSize: 11,
    color: '#6B7280',
    letterSpacing: 0.8,
  },
  greenBadge: {
    backgroundColor: '#ECFDF5',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  greenBadgeText: {
    fontFamily: 'DMSans-SemiBold',
    fontSize: 11,
    color: '#0D9488',
  },

  // ── Added cards
  cardsWrap: {
    backgroundColor: '#fff',
    paddingTop: 4,
    paddingBottom: 16,
    paddingHorizontal: 16,
    gap: 8,
  },
  loader: {
    marginVertical: 16,
  },
  card: {
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
  cardAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: {
    flex: 1,
    gap: 3,
  },
  cardName: {
    fontFamily: 'DMSans-SemiBold',
    fontSize: 15,
    color: '#0C0C0C',
  },
  cardSub: {
    fontFamily: 'DMSans-Regular',
    fontSize: 12,
    color: '#6B7280',
  },
  cardAmount: {
    fontFamily: 'CabinetGrotesk-Bold',
    fontSize: 16,
    color: '#0C0C0C',
  },
  emptyNote: {
    fontFamily: 'DMSans-Regular',
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    paddingVertical: 24,
  },

  // ── Needs Your Attention
  nhSection: {
    backgroundColor: '#F8FAFC',
    paddingTop: 8,
    paddingBottom: 16,
    paddingHorizontal: 16,
    gap: 10,
  },
  nhHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  nhLabel: {
    flex: 1,
    fontFamily: 'DMSans-SemiBold',
    fontSize: 11,
    color: '#92400E',
    letterSpacing: 0.8,
  },
  amberBadge: {
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  amberBadgeText: {
    fontFamily: 'DMSans-SemiBold',
    fontSize: 11,
    color: '#D97706',
  },
  nhNote: {
    fontFamily: 'DMSans-Regular',
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },

  // ── Link-only card
  linkCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#FCD34D',
    overflow: 'hidden',
    marginBottom: 4,
  },
  linkCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    paddingBottom: 10,
    gap: 10,
  },
  mailIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFBEB',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  linkCardMeta: {
    flex: 1,
    gap: 3,
  },
  linkCardSubject: {
    fontFamily: 'DMSans-SemiBold',
    fontSize: 14,
    color: '#111827',
  },
  linkCardFrom: {
    fontFamily: 'DMSans-Regular',
    fontSize: 12,
    color: '#9CA3AF',
  },
  searchHintBlock: {
    backgroundColor: '#FAFAFA',
    marginHorizontal: 14,
    borderRadius: 8,
    padding: 10,
    gap: 4,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  searchHintLabel: {
    fontFamily: 'DMSans-SemiBold',
    fontSize: 10,
    color: '#9CA3AF',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  searchHintText: {
    fontFamily: 'DMSans-Regular',
    fontSize: 12,
    color: '#374151',
    lineHeight: 17,
  },
  linkCardActions: {
    flexDirection: 'row',
    gap: 8,
    padding: 14,
    paddingTop: 10,
  },
  copyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    paddingVertical: 9,
    gap: 5,
  },
  copyBtnText: {
    fontFamily: 'DMSans-SemiBold',
    fontSize: 12,
    color: '#92400E',
  },
  openBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D9488',
    borderRadius: 8,
    paddingVertical: 9,
    gap: 5,
  },
  openBtnText: {
    fontFamily: 'DMSans-SemiBold',
    fontSize: 12,
    color: '#fff',
  },

  // ── Stats row
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 6,
  },
  statChip: {
    fontFamily: 'DMSans-Regular',
    fontSize: 12,
    color: '#9CA3AF',
  },
  statDot: {
    fontFamily: 'DMSans-Regular',
    fontSize: 12,
    color: '#D1D5DB',
  },
});
