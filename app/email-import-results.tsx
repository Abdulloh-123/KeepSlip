import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Package, TriangleAlert, Mail, ExternalLink } from 'lucide-react-native';
import { fetchPendingEmailReceiptsByIds, fetchReceiptsByIds } from '@/lib/supabase';
import type { PendingEmailReceipt, Receipt } from '@/types/receipt';

function formatDate(str: string) {
  return new Date(str).toLocaleDateString('en-AU', { month: 'short', day: 'numeric', year: 'numeric' });
}

function senderName(from: string | null): string {
  if (!from) return 'Unknown sender';
  const nameMatch = from.match(/^([^<]+)</);
  if (nameMatch) return nameMatch[1].trim();
  return from.split('@')[0];
}

function parseReceiptIds(raw: string | string[] | undefined): string[] {
  if (!raw || Array.isArray(raw)) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function buildPendingGmailSearch(item: PendingEmailReceipt): string {
  if (item.email_rfc822_message_id) return `rfc822msgid:${item.email_rfc822_message_id}`;
  if (item.gmail_search) return item.gmail_search;
  if (item.email_message_id) return item.email_message_id;
  return `${item.merchant_hint ?? ''} ${item.email_subject ?? ''}`.trim();
}

export default function EmailImportResults() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{
    imported: string;
    processed: string;
    skipped: string;
    already_scanned: string;
    remaining: string;
    imported_receipt_ids?: string;
    link_only_receipt_ids?: string;
    pending_email_receipt_ids?: string;
  }>();

  const importedCount = Number(params.imported ?? 0);
  const processedCount = Number(params.processed ?? 0);
  const skippedCount = Number(params.skipped ?? 0);
  const alreadyScanned = Number(params.already_scanned ?? 0);
  const remainingCount = Number(params.remaining ?? 0);
  const importedReceiptIds = parseReceiptIds(params.imported_receipt_ids);
  const linkOnlyReceiptIds = parseReceiptIds(params.link_only_receipt_ids);
  const pendingEmailReceiptIds = parseReceiptIds(params.pending_email_receipt_ids);
  const addedReceiptIds = Array.from(new Set([...importedReceiptIds, ...linkOnlyReceiptIds]));

  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [pendingEmails, setPendingEmails] = useState<PendingEmailReceipt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadData();
  }, [params.imported_receipt_ids, params.link_only_receipt_ids, params.pending_email_receipt_ids]);

  async function loadData() {
    setLoading(true);
    try {
      const [addedRows, pendingRows] = await Promise.all([
        fetchReceiptsByIds(addedReceiptIds),
        fetchPendingEmailReceiptsByIds(pendingEmailReceiptIds),
      ]);
      setReceipts(addedRows);
      setPendingEmails(pendingRows);
    } catch {
      setReceipts([]);
      setPendingEmails([]);
    } finally {
      setLoading(false);
    }
  }

  function openPendingGmail(item: PendingEmailReceipt) {
    const hint = buildPendingGmailSearch(item);
    Linking.openURL(
      `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(hint)}`
    ).catch(() => null);
  }

  function handleDone() {
    router.replace('/(tabs)');
  }

  const hasStats = processedCount > 0 || skippedCount > 0 || alreadyScanned > 0 || remainingCount > 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
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
            receipts.map((receipt) => (
              <TouchableOpacity
                key={receipt.id}
                style={styles.card}
                onPress={() => router.push(`/receipt/${receipt.id}`)}
                activeOpacity={0.7}
              >
                <View style={styles.cardAvatar}>
                  <Package size={18} color="#0D9488" />
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardName}>{receipt.merchant_name}</Text>
                  <Text style={styles.cardSub}>{formatDate(receipt.date)} · Email import</Text>
                </View>
                <Text style={styles.cardAmount}>${receipt.total_amount.toFixed(2)}</Text>
              </TouchableOpacity>
            ))
          ) : (
            <Text style={styles.emptyNote}>
              {importedCount > 0
                ? 'Receipts saved. Open one to review the imported details.'
                : 'No new receipts found in this period.'}
            </Text>
          )}
        </View>

        {pendingEmails.length > 0 && (
          <View style={styles.nhSection}>
            <View style={styles.nhHeader}>
              <TriangleAlert size={15} color="#D97706" />
              <Text style={styles.nhLabel}>NEEDS YOUR ATTENTION</Text>
              <View style={styles.amberBadge}>
                <Text style={styles.amberBadgeText}>{pendingEmails.length}</Text>
              </View>
            </View>

            <Text style={styles.nhNote}>
              These emails look like receipts, but the receipt is behind a link and the
              message text did not include enough details. Find the email, download the
              receipt manually, then mark it done from Settings.
            </Text>

            {pendingEmails.map((item) => (
              <View key={item.id} style={styles.linkCard}>
                <View style={styles.linkCardHeader}>
                  <View style={styles.mailIconWrap}>
                    <Mail size={16} color="#D97706" />
                  </View>
                  <View style={styles.linkCardMeta}>
                    <Text style={styles.linkCardSubject} numberOfLines={1}>
                      {item.merchant_hint || item.email_subject || 'Receipt email'}
                    </Text>
                    <Text style={styles.linkCardFrom} numberOfLines={1}>
                      {senderName(item.email_source)}
                      {item.email_received_at ? ` · ${formatDate(item.email_received_at)}` : ''}
                    </Text>
                  </View>
                </View>

                <View style={styles.searchHintBlock}>
                  <Text style={styles.searchHintLabel}>Find it in Gmail</Text>
                  <Text style={styles.searchHintText} numberOfLines={2}>
                    {buildPendingGmailSearch(item) || item.email_subject || 'Open Gmail and search for this receipt email.'}
                  </Text>
                </View>

                <View style={styles.linkCardActions}>
                  <TouchableOpacity
                    style={styles.openBtn}
                    onPress={() => router.push('/(tabs)')}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.openBtnText}>Open list</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.secondaryBtn}
                    onPress={() => openPendingGmail(item)}
                    activeOpacity={0.8}
                  >
                    <ExternalLink size={13} color="#92400E" />
                    <Text style={styles.secondaryBtnText}>Open Gmail</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {hasStats && (
          <View style={styles.statsRow}>
            {processedCount > 0 && (
              <Text style={styles.statChip}>
                {processedCount} processed
              </Text>
            )}
            {processedCount > 0 && skippedCount > 0 && (
              <Text style={styles.statDot}>·</Text>
            )}
            {skippedCount > 0 && (
              <Text style={styles.statChip}>
                {skippedCount} skipped
              </Text>
            )}
            {(processedCount > 0 || skippedCount > 0) && alreadyScanned > 0 && (
              <Text style={styles.statDot}>·</Text>
            )}
            {alreadyScanned > 0 && (
              <Text style={styles.statChip}>
                {alreadyScanned} already scanned
              </Text>
            )}
            {(processedCount > 0 || skippedCount > 0 || alreadyScanned > 0) && remainingCount > 0 && (
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
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    paddingVertical: 9,
    gap: 5,
  },
  secondaryBtnText: {
    fontFamily: 'DMSans-SemiBold',
    fontSize: 12,
    color: '#92400E',
  },
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
