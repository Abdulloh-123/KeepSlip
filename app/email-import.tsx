// TEST PHASE: Gmail sync runs synchronously (streaming Option 1).
// BEFORE SHIP: Replace with background job + polling (Option 2). See TODOS.md.
import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { Camera, Upload, Mail, ChevronRight, Calendar } from 'lucide-react-native';
import * as AuthSession from 'expo-auth-session';
import {
  useGmailAuth,
  saveGmailToken,
  syncGmailReceipts,
  isGmailConnected,
  getGmailToken,
} from '@/lib/gmail';
import { supabase, uploadReceiptImage } from '@/lib/supabase';
import type { ReceiptInsert } from '@/types/receipt';

type Step = 'choose' | 'period' | 'processing';

const PERIOD_OPTIONS = [
  { label: 'Last 30 days',   days: 30 },
  { label: 'Last 2 months',  days: 60 },
  { label: 'Last 6 months',  days: 180 },
  { label: 'Last year',      days: 365 },
] as const;

export default function AddReceiptSheet() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [step, setStep] = useState<Step>('choose');
  const [status, setStatus] = useState('');
  const { request, promptAsync, clientId, redirectUri } = useGmailAuth();

  async function startGmailImport(lookbackDays: number) {
    setStep('processing');
    setStatus('Connecting to Gmail…');

    try {
      const connected = await isGmailConnected();
      let token: string | null = null;

      if (!connected) {
        const result = await promptAsync();
        if (result.type !== 'success') { setStep('period'); return; }

        const code = (result as any).params?.code ?? result.authentication?.accessToken;
        if (!code) { setStep('period'); return; }

        if (result.authentication?.accessToken) {
          token = result.authentication.accessToken;
          await saveGmailToken(token, result.authentication?.expiresIn);
        } else {
          const tokenResponse = await AuthSession.exchangeCodeAsync(
            { clientId, code: (result as any).params.code, redirectUri },
            { tokenEndpoint: 'https://oauth2.googleapis.com/token' }
          );
          token = tokenResponse.accessToken;
          await saveGmailToken(token, tokenResponse.expiresIn ?? null);
        }
        if (!token) { setStep('period'); return; }
      } else {
        token = await getGmailToken();
      }

      setStatus('Scanning Gmail — this may take a moment.\nDon\'t close this screen.');
      const result = await syncGmailReceipts(token!, lookbackDays);

      await AsyncStorage.setItem('email_import_link_only', JSON.stringify(result.link_only));

      router.replace({
        pathname: '/email-import-results',
        params: {
          imported:        String(result.imported),
          already_scanned: String(result.already_scanned),
          remaining:       String(result.remaining),
        },
      });
    } catch (e: any) {
      Alert.alert('Import failed', e.message ?? 'Something went wrong.');
      setStep('period');
    }
  }

  function handleCameraScan() {
    router.push('/scan');
  }

  async function handleFilePick() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/*', 'application/pdf'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    await processFile(asset.uri, asset.mimeType ?? 'application/pdf');
  }

  async function processFile(uri: string, mimeType: string) {
    setStep('processing');
    setStatus('Uploading…');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const storagePath = await uploadReceiptImage(user.id, uri, mimeType);
      setStatus('Reading receipt with AI…');

      const { data, error } = await supabase.functions.invoke('ocr-receipt', {
        body: { storage_path: storagePath, mime_type: mimeType },
      });
      if (error) throw error;

      const receipt: ReceiptInsert = {
        source: 'manual_scan',
        merchant_name: data.merchant_name ?? 'Unknown',
        date: data.date ?? new Date().toISOString().slice(0, 10),
        total_amount: data.total_amount ?? 0,
        currency: data.currency ?? 'AUD',
        category: data.category ?? null,
        is_business: false,
        line_items: data.line_items ?? [],
        image_url: mimeType.includes('image') ? storagePath : null,
        pdf_url: mimeType.includes('pdf') ? storagePath : null,
        email_source: null,
        attachment_type: mimeType.includes('image') ? 'image' : 'pdf',
        raw_text: null,
      };

      const { data: inserted, error: insertError } = await supabase
        .from('receipts')
        .insert({ ...receipt, user_id: user.id })
        .select()
        .single();
      if (insertError) throw insertError;

      router.replace(`/receipt/${inserted.id}`);
    } catch (e: any) {
      Alert.alert('Scan failed', e.message ?? 'Could not read receipt.');
      setStep('choose');
    }
  }

  // ── Processing screen ──────────────────────────────────────────────────────
  if (step === 'processing') {
    return (
      <View style={styles.processingContainer}>
        <ActivityIndicator size="large" color="#0D9488" />
        <Text style={styles.statusText}>{status}</Text>
      </View>
    );
  }

  // ── Period picker ──────────────────────────────────────────────────────────
  if (step === 'period') {
    return (
      <View style={styles.screen}>
        <TouchableOpacity style={styles.backdrop} onPress={() => setStep('choose')} activeOpacity={1} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>
          <View style={styles.titleWrap}>
            <Text style={styles.title}>How far back?</Text>
          </View>
          <Text style={styles.periodSubtitle}>
            We'll scan your Inbox and Updates for this period, oldest emails first.
          </Text>
          {PERIOD_OPTIONS.map((opt, i) => (
            <View key={opt.days}>
              {i > 0 && <View style={styles.separator} />}
              <TouchableOpacity
                style={styles.row}
                onPress={() => startGmailImport(opt.days)}
                activeOpacity={0.7}
              >
                <Calendar size={24} color="#0D9488" />
                <Text style={styles.rowLabel}>{opt.label}</Text>
                <ChevronRight size={20} color="#D1D5DB" />
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={styles.cancelWrap} onPress={() => setStep('choose')} activeOpacity={0.7}>
            <Text style={styles.cancelText}>Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Choose action ──────────────────────────────────────────────────────────
  return (
    <View style={styles.screen}>
      <TouchableOpacity style={styles.backdrop} onPress={() => router.back()} activeOpacity={1} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.handleWrap}>
          <View style={styles.handle} />
        </View>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>Add Receipt</Text>
        </View>

        <TouchableOpacity style={styles.row} onPress={handleCameraScan} activeOpacity={0.7}>
          <Camera size={24} color="#0D9488" />
          <Text style={styles.rowLabel}>Scan Receipt</Text>
          <ChevronRight size={20} color="#D1D5DB" />
        </TouchableOpacity>
        <View style={styles.separator} />
        <TouchableOpacity style={styles.row} onPress={handleFilePick} activeOpacity={0.7}>
          <Upload size={24} color="#0D9488" />
          <Text style={styles.rowLabel}>Upload File</Text>
          <ChevronRight size={20} color="#D1D5DB" />
        </TouchableOpacity>
        <View style={styles.separator} />
        <TouchableOpacity style={styles.row} onPress={() => setStep('period')} activeOpacity={0.7}>
          <Mail size={24} color="#0D9488" />
          <Text style={styles.rowLabel}>Import from Email</Text>
          <ChevronRight size={20} color="#D1D5DB" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelWrap} onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 12,
  },
  handleWrap: {
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
  },
  titleWrap: {
    height: 52,
    justifyContent: 'center',
    paddingLeft: 24,
  },
  title: {
    fontFamily: 'CabinetGrotesk-Bold',
    fontSize: 20,
    color: '#0C0C0C',
  },
  periodSubtitle: {
    fontFamily: 'DMSans-Regular',
    fontSize: 13,
    color: '#6B7280',
    paddingHorizontal: 24,
    paddingBottom: 8,
    lineHeight: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 64,
    paddingLeft: 24,
    paddingRight: 20,
    gap: 12,
  },
  rowLabel: {
    flex: 1,
    fontFamily: 'DMSans-SemiBold',
    fontSize: 16,
    color: '#0C0C0C',
  },
  separator: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },
  cancelWrap: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontFamily: 'DMSans-Medium',
    fontSize: 16,
    color: '#6B7280',
  },
  processingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    gap: 16,
    paddingHorizontal: 32,
  },
  statusText: {
    fontFamily: 'DMSans-Medium',
    fontSize: 16,
    color: '#374151',
    textAlign: 'center',
    lineHeight: 24,
  },
});
