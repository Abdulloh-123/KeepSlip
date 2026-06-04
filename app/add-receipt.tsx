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
import * as DocumentPicker from 'expo-document-picker';
import { Camera, Upload, ChevronRight } from 'lucide-react-native';
import { supabase, uploadReceiptImage } from '@/lib/supabase';
import type { ReceiptInsert } from '@/types/receipt';

type Step = 'choose' | 'processing';

export default function AddReceiptSheet() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [step, setStep] = useState<Step>('choose');
  const [status, setStatus] = useState('');

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
    setStatus('Uploading...');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const storagePath = await uploadReceiptImage(user.id, uri, mimeType);
      setStatus('Reading receipt with AI...');

      const { data, error } = await supabase.functions.invoke('ocr-receipt', {
        body: { storage_path: storagePath, mime_type: mimeType },
      });
      if (error) throw error;

      const isImage = mimeType.includes('image');
      const isPdf = mimeType.includes('pdf');
      const receipt: ReceiptInsert = {
        source: 'manual_scan',
        merchant_name: data.merchant_name ?? 'Unknown',
        date: data.date ?? new Date().toISOString().slice(0, 10),
        total_amount: data.total_amount ?? 0,
        currency: data.currency ?? 'AUD',
        category: data.category ?? null,
        is_business: false,
        line_items: data.line_items ?? [],
        image_url: isImage ? storagePath : null,
        pdf_url: isPdf ? storagePath : null,
        email_source: null,
        attachment_type: isImage ? 'image' : 'pdf',
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
      Alert.alert('Upload failed', e.message ?? 'Could not read receipt.');
      setStep('choose');
    }
  }

  if (step === 'processing') {
    return (
      <View style={styles.processingContainer}>
        <ActivityIndicator size="large" color="#0D9488" />
        <Text style={styles.statusText}>{status}</Text>
      </View>
    );
  }

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
          <Text style={styles.rowLabel}>Upload File or Photo</Text>
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
