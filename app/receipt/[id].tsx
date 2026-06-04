import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Share,
  Modal,
  Image,
  StatusBar,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ExternalLink, Share2, Trash2, X } from 'lucide-react-native';
import * as WebBrowser from 'expo-web-browser';
import { fetchReceipt, deleteReceipt, getReceiptFileUrl } from '@/lib/supabase';
import { ERROR_COPY } from '@/lib/errors';
import type { Receipt } from '@/types/receipt';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' });
}

export default function ReceiptDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<'not-found' | 'failed' | null>(null);
  const [imageViewer, setImageViewer] = useState<string | null>(null);

  const loadReceipt = useCallback(async () => {
    if (!id) {
      setLoading(false);
      setLoadError('not-found');
      return;
    }

    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchReceipt(id);
      setReceipt(data);
    } catch (e: any) {
      setReceipt(null);
      setLoadError(e?.code === 'PGRST116' ? 'not-found' : 'failed');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadReceipt();
  }, [loadReceipt]);

  async function handleShare() {
    if (!receipt) return;
    try {
      await Share.share({
        message: `${receipt.merchant_name} — $${receipt.total_amount.toFixed(2)} on ${receipt.date}`,
      });
    } catch {}
  }

  async function handleDelete() {
    Alert.alert('Delete receipt', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteReceipt(id!);
            router.back();
          } catch {
            Alert.alert('Delete failed', ERROR_COPY.deleteReceipt);
          }
        },
      },
    ]);
  }

  async function handleViewOriginal() {
    if (!receipt) return;
    try {
      const path = receipt.pdf_url ?? receipt.image_url;
      if (!path) return;
      const url = await getReceiptFileUrl(path);
      if (receipt.pdf_url) {
        await WebBrowser.openBrowserAsync(url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET });
      } else {
        setImageViewer(url);
      }
    } catch {
      Alert.alert('File unavailable', ERROR_COPY.originalFile);
    }
  }

  if (loading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.skeletonHero}>
          <View style={styles.skeletonTopRow}>
            <View style={styles.skeletonCircle} />
            <View style={styles.skeletonTitle} />
            <View style={styles.skeletonCircle} />
          </View>
          <View style={styles.skeletonAmount} />
          <View style={styles.skeletonSub} />
        </View>
        <View style={styles.skeletonBody}>
          <View style={styles.skeletonTotalCard} />
          <View style={styles.skeletonTotalCard} />
        </View>
      </View>
    );
  }

  if (loadError === 'failed') {
    return (
      <View style={[styles.loadingWrap, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>{ERROR_COPY.loadReceipt}</Text>
        <TouchableOpacity onPress={loadReceipt} activeOpacity={0.7}>
          <Text style={styles.linkText}>Try again</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={styles.secondaryLinkText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!receipt) {
    return (
      <View style={[styles.loadingWrap, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Receipt not found</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.linkText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const lineItems = Array.isArray(receipt.line_items) ? receipt.line_items : [];
  const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);

  const ImageViewerModal = (
    <Modal visible={!!imageViewer} transparent animationType="fade" onRequestClose={() => setImageViewer(null)}>
      <StatusBar hidden />
      <View style={styles.viewerBg}>
        <Image
          source={{ uri: imageViewer ?? '' }}
          style={styles.viewerImage}
          resizeMode="contain"
        />
        <TouchableOpacity
          style={[styles.viewerClose, { top: insets.top + 12 }]}
          onPress={() => setImageViewer(null)}
          activeOpacity={0.8}
        >
          <X size={22} color="#fff" />
        </TouchableOpacity>
      </View>
    </Modal>
  );
  const tax = receipt.total_amount - subtotal;
  const hasLineItems = lineItems.length > 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {ImageViewerModal}
      {/* Teal hero header */}
      <View style={styles.heroHeader}>
        {/* App bar row */}
        <View style={styles.appBar}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
            <ArrowLeft size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.appBarTitle}>Receipt</Text>
          <TouchableOpacity onPress={handleShare} activeOpacity={0.7}>
            <Share2 size={20} color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
        </View>

        {/* Amount block */}
        <View style={styles.amtBlock}>
          {receipt.category && (
            <Text style={styles.categoryLabel}>{receipt.category.toUpperCase()}</Text>
          )}
          <Text style={styles.amtValue}>${receipt.total_amount.toFixed(2)}</Text>
          <Text style={styles.merchantDate}>
            {receipt.merchant_name} · {formatDate(receipt.date)}
          </Text>
          {/* Category chip */}
          {receipt.category && (
            <View style={styles.categoryChip}>
              <Text style={styles.categoryChipText}>{receipt.category}</Text>
            </View>
          )}
        </View>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* LINE ITEMS */}
        {hasLineItems && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>LINE ITEMS</Text>
              <Text style={styles.sectionCount}>{lineItems.length} items</Text>
            </View>
            <View style={styles.itemsCard}>
              {lineItems.map((item, i) => (
                <View key={i} style={[styles.lineRow, i < lineItems.length - 1 && styles.lineRowBorder]}>
                  <View style={styles.lineInfo}>
                    <Text style={styles.lineDesc}>{item.description}</Text>
                  </View>
                  <Text style={styles.lineAmt}>${item.amount.toFixed(2)}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Totals block */}
        <View style={styles.totalsCard}>
          {hasLineItems && subtotal > 0 && (
            <View style={[styles.totalRow, styles.totalRowBorder]}>
              <View style={styles.lineInfo}>
                <Text style={styles.totalLabel}>Subtotal</Text>
              </View>
              <Text style={styles.totalValue}>${subtotal.toFixed(2)}</Text>
            </View>
          )}
          {hasLineItems && tax > 0 && (
            <View style={[styles.totalRow, styles.totalRowBorder]}>
              <View style={styles.lineInfo}>
                <Text style={styles.totalLabel}>Tax</Text>
              </View>
              <Text style={styles.totalValue}>${tax.toFixed(2)}</Text>
            </View>
          )}
          <View style={[styles.totalRow, styles.totalRowHighlight]}>
            <View style={styles.lineInfo}>
              <Text style={styles.totalLabelBold}>Total</Text>
            </View>
            <Text style={styles.totalValueTeal}>${receipt.total_amount.toFixed(2)}</Text>
          </View>

          {/* View original */}
          {(receipt.image_url || receipt.pdf_url) && (
            <TouchableOpacity
              style={[styles.totalRow, styles.actionRowBorder]}
              onPress={handleViewOriginal}
              activeOpacity={0.7}
            >
              <View style={styles.lineInfo}>
                <Text style={styles.actionLabel}>See actual receipt</Text>
              </View>
              <ExternalLink size={16} color="#0D9488" />
            </TouchableOpacity>
          )}

          {/* Delete */}
          <TouchableOpacity
            style={[styles.totalRow, styles.deleteRow]}
            onPress={handleDelete}
            activeOpacity={0.7}
          >
            <View style={styles.lineInfo}>
              <Text style={styles.deleteLabel}>Delete receipt</Text>
            </View>
            <Trash2 size={16} color="#DC2626" />
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    gap: 12,
  },
  errorText: {
    fontFamily: 'DMSans-Medium',
    fontSize: 16,
    color: '#EF4444',
  },
  linkText: {
    fontFamily: 'DMSans-Medium',
    fontSize: 15,
    color: '#0D9488',
  },
  secondaryLinkText: {
    fontFamily: 'DMSans-Medium',
    fontSize: 15,
    color: '#6B7280',
  },
  skeletonHero: {
    backgroundColor: '#0D9488',
    paddingHorizontal: 20,
    paddingBottom: 28,
    gap: 14,
  },
  skeletonTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  skeletonCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.24)',
  },
  skeletonTitle: {
    width: 84,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.24)',
  },
  skeletonAmount: {
    width: 170,
    height: 42,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.24)',
    marginTop: 10,
  },
  skeletonSub: {
    width: 210,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  skeletonBody: {
    padding: 16,
    gap: 12,
  },
  skeletonTotalCard: {
    height: 92,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  heroHeader: {
    backgroundColor: '#0D9488',
    paddingBottom: 24,
  },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 4,
  },
  appBarTitle: {
    fontFamily: 'DMSans-SemiBold',
    fontSize: 17,
    color: '#fff',
  },
  amtBlock: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 4,
  },
  categoryLabel: {
    fontFamily: 'DMSans-Bold',
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 0.5,
  },
  amtValue: {
    fontFamily: 'CabinetGrotesk-Bold',
    fontSize: 44,
    color: '#fff',
    lineHeight: 52,
  },
  merchantDate: {
    fontFamily: 'DMSans-Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
  },
  categoryChip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 9999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginTop: 4,
  },
  categoryChipText: {
    fontFamily: 'DMSans-Medium',
    fontSize: 13,
    color: '#fff',
  },
  scroll: {
    flex: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: '#fff',
  },
  sectionLabel: {
    fontFamily: 'DMSans-Bold',
    fontSize: 11,
    color: '#6B7280',
    letterSpacing: 0.8,
  },
  sectionCount: {
    fontFamily: 'DMSans-Medium',
    fontSize: 12,
    color: '#9CA3AF',
  },
  itemsCard: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    paddingVertical: 12,
  },
  lineRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  lineInfo: {
    flex: 1,
    gap: 3,
  },
  lineDesc: {
    fontFamily: 'DMSans-Regular',
    fontSize: 15,
    color: '#374151',
  },
  lineAmt: {
    fontFamily: 'DMSans-SemiBold',
    fontSize: 14,
    color: '#111827',
  },
  totalsCard: {
    backgroundColor: '#F8FAFC',
    marginTop: 0,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  totalRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  totalRowHighlight: {
    height: 52,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  totalLabel: {
    fontFamily: 'DMSans-Regular',
    fontSize: 14,
    color: '#374151',
  },
  totalLabelBold: {
    fontFamily: 'DMSans-SemiBold',
    fontSize: 15,
    color: '#111827',
  },
  totalValue: {
    fontFamily: 'DMSans-Medium',
    fontSize: 13,
    color: '#374151',
  },
  totalValueTeal: {
    fontFamily: 'DMSans-Bold',
    fontSize: 16,
    color: '#0D9488',
  },
  actionRowBorder: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  actionLabel: {
    fontFamily: 'DMSans-Medium',
    fontSize: 14,
    color: '#374151',
  },
  deleteRow: {
    backgroundColor: '#FEF2F2',
    borderTopWidth: 1,
    borderTopColor: '#FECACA',
    height: 52,
  },
  deleteLabel: {
    fontFamily: 'DMSans-Medium',
    fontSize: 14,
    color: '#DC2626',
  },
  viewerBg: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: {
    width: '100%',
    height: '100%',
  },
  viewerClose: {
    position: 'absolute',
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
