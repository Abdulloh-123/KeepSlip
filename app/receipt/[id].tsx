import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Share,
  Modal,
  Image,
  StatusBar,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Share2, ExternalLink, Trash2, X, Copy } from 'lucide-react-native';
import * as WebBrowser from 'expo-web-browser';
import * as DocumentPicker from 'expo-document-picker';
import { supabase, fetchReceipt, deleteReceipt, getReceiptFileUrl, uploadReceiptImage, updateReceipt } from '@/lib/supabase';
import type { Receipt } from '@/types/receipt';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return 'Unknown';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  return d.toLocaleString('en-AU', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function deriveGmailQuery(receipt: Receipt): string {
  // Best: RFC 822 message ID links directly to the exact email
  if (receipt.email_rfc822_message_id) {
    return `rfc822msgid:${receipt.email_rfc822_message_id}`;
  }

  const parts: string[] = [];

  // Extract bare email address from "Name <email@domain.com>" format
  if (receipt.email_source) {
    const match = receipt.email_source.match(/<([^>]+)>/);
    const email = match ? match[1] : receipt.email_source.trim();
    if (email.includes('@')) parts.push(`from:${email}`);
  }

  // Date range: ±1 day around when the email arrived (or receipt date as fallback)
  const rawDate = receipt.email_received_at ?? receipt.date;
  if (rawDate) {
    const base = new Date(rawDate);
    if (!Number.isNaN(base.getTime())) {
      const fmt = (d: Date) =>
        `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
      const after = new Date(base); after.setDate(after.getDate() - 1);
      const before = new Date(base); before.setDate(before.getDate() + 2);
      parts.push(`after:${fmt(after)}`, `before:${fmt(before)}`);
    }
  }

  return parts.join(' ');
}


export default function ReceiptDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageViewer, setImageViewer] = useState<string | null>(null);
  const [showLinkInstructions, setShowLinkInstructions] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetchReceipt(id)
      .then(setReceipt)
      .finally(() => setLoading(false));
  }, [id]);

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
          await deleteReceipt(id!);
          router.back();
        },
      },
    ]);
  }

  async function handleViewOriginal() {
    if (!receipt) return;
    if (receipt.attachment_type === 'link_only') {
      setShowLinkInstructions(true);
      return;
    }
    try {
      const path = receipt.pdf_url ?? receipt.image_url!;
      const url = await getReceiptFileUrl(path);
      if (receipt.pdf_url) {
        await WebBrowser.openBrowserAsync(url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET });
      } else {
        setImageViewer(url);
      }
    } catch {
      Alert.alert('Error', 'Could not open file.');
    }
  }

  async function handleUploadReceipt() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/*', 'application/pdf'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const mimeType = asset.mimeType ?? 'image/jpeg';
      const storagePath = await uploadReceiptImage(user.id, asset.uri, mimeType);
      const isImage = mimeType.includes('image');

      const updated = await updateReceipt(receipt!.id, {
        image_url: isImage ? storagePath : null,
        pdf_url: !isImage ? storagePath : null,
        attachment_type: isImage ? 'image' : 'pdf',
      });

      setReceipt(updated);
      setShowLinkInstructions(false);
      Alert.alert('Uploaded', 'Receipt file saved.');
    } catch (e: any) {
      Alert.alert('Upload failed', e.message ?? 'Could not upload file.');
    } finally {
      setUploading(false);
    }
  }

  async function handleOpenSourceEmail() {
    if (!receipt) return;

    const query = deriveGmailQuery(receipt);
    const directWebUrl = receipt.email_message_id
      ? `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(receipt.email_message_id)}`
      : null;
    const webSearchUrl = `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(query)}`;

    const appCandidates = [
      `googlegmail:///search/${encodeURIComponent(query)}`,
      `googlegmail:///search?query=${encodeURIComponent(query)}`,
      directWebUrl ? `googlegmail:///all/${encodeURIComponent(receipt.email_message_id ?? '')}` : null,
      'googlegmail://',
    ].filter(Boolean) as string[];

    try {
      const hasGmailApp = await Linking.canOpenURL('googlegmail://');

      if (hasGmailApp) {
        for (const url of appCandidates) {
          const canOpen = await Linking.canOpenURL(url);
          if (canOpen) {
            await Linking.openURL(url);
            return;
          }
        }
      }

      await Linking.openURL(directWebUrl ?? webSearchUrl);
    } catch {
      Alert.alert('Could not open email', 'Please open Gmail and search using the keywords shown.');
    }
  }

  async function handleCopySearchQuery() {
    if (!receipt) return;
    const query = deriveGmailQuery(receipt);
    try {
      await Share.share({ message: query });
    } catch {}
  }

  if (loading) {
    return (
      <View style={[styles.loadingWrap, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#0D9488" />
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
  const LinkInstructionsModal = (
    <Modal visible={showLinkInstructions} transparent animationType="fade" onRequestClose={() => setShowLinkInstructions(false)}>
      <View style={styles.instructionsOverlay}>
        <View style={styles.instructionsCard}>
          <View style={styles.instructionsHeader}>
            <Text style={styles.instructionsTitle}>Get the Original Receipt</Text>
            <TouchableOpacity onPress={() => setShowLinkInstructions(false)} activeOpacity={0.7}>
              <X size={18} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <Text style={styles.instructionsBody}>
            This receipt was created from the details written in the email. To get the official
            receipt file, open that email in Gmail, open the receipt link, and download the file
            manually before uploading it here.
          </Text>
          <View style={styles.instructionsInfo}>
            <Text style={styles.instructionsLabel}>Search query</Text>
            <Text style={styles.instructionsValue}>{receipt ? deriveGmailQuery(receipt) : ''}</Text>
            <Text style={styles.instructionsLabel}>Received</Text>
            <Text style={styles.instructionsValue}>{formatDateTime(receipt?.email_received_at ?? null)}</Text>
            <Text style={styles.instructionsLabel}>Sender</Text>
            <Text style={styles.instructionsValue}>{receipt?.email_source ?? 'Unknown'}</Text>
          </View>
          <View style={styles.instructionsSteps}>
            <Text style={styles.stepLine}>1. Open Gmail and find the email using the search query above.</Text>
            <Text style={styles.stepLine}>2. Open the receipt link inside the email.</Text>
            <Text style={styles.stepLine}>3. Download the receipt file (PDF or image).</Text>
            <Text style={styles.stepLine}>4. Come back here and tap "Upload Receipt" below.</Text>
          </View>
          <TouchableOpacity
            style={styles.gmailButton}
            onPress={handleOpenSourceEmail}
            activeOpacity={0.8}
          >
            <Text style={styles.gmailButtonText}>Open Gmail</Text>
            <ExternalLink size={15} color="#0D9488" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.copyButton}
            onPress={handleCopySearchQuery}
            activeOpacity={0.8}
          >
            <Text style={styles.copyButtonText}>Copy Search Query</Text>
            <Copy size={15} color="#4B5563" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.uploadBtn}
            onPress={handleUploadReceipt}
            activeOpacity={0.8}
            disabled={uploading}
          >
            {uploading
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.uploadBtnText}>Upload Receipt</Text>
            }
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
  const tax = receipt.total_amount - subtotal;
  const hasLineItems = lineItems.length > 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {ImageViewerModal}
      {LinkInstructionsModal}
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
          {(receipt.image_url || receipt.pdf_url || receipt.attachment_type === 'link_only') && (
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
  gmailButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#99F6E4',
    backgroundColor: '#F0FDFA',
  },
  gmailButtonText: {
    fontFamily: 'DMSans-SemiBold',
    fontSize: 13,
    color: '#0D9488',
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  copyButtonText: {
    fontFamily: 'DMSans-SemiBold',
    fontSize: 13,
    color: '#4B5563',
  },
  uploadBtn: {
    height: 44,
    borderRadius: 10,
    backgroundColor: '#0D9488',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadBtnText: {
    fontFamily: 'DMSans-SemiBold',
    fontSize: 14,
    color: '#fff',
  },
  instructionsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  instructionsCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
  },
  instructionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  instructionsTitle: {
    fontFamily: 'DMSans-SemiBold',
    fontSize: 16,
    color: '#111827',
  },
  instructionsBody: {
    fontFamily: 'DMSans-Regular',
    fontSize: 13,
    lineHeight: 18,
    color: '#4B5563',
  },
  instructionsInfo: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
  },
  instructionsLabel: {
    fontFamily: 'DMSans-Medium',
    fontSize: 11,
    color: '#6B7280',
  },
  instructionsValue: {
    fontFamily: 'DMSans-Regular',
    fontSize: 12,
    color: '#111827',
  },
  instructionsSteps: {
    gap: 2,
  },
  stepLine: {
    fontFamily: 'DMSans-Regular',
    fontSize: 12,
    lineHeight: 18,
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
