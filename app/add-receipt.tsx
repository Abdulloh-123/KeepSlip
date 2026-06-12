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
import * as ImagePicker from 'expo-image-picker';
import { Camera, Upload, ChevronRight, ImagePlus } from 'lucide-react-native';
import { supabase, uploadReceiptImage } from '@/lib/supabase';
import { ERROR_COPY } from '@/lib/errors';
import { trackError, trackEvent } from '@/lib/analytics';

type Step = 'choose' | 'processing' | 'error';
type UploadMethod = 'files' | 'photos';

export default function AddReceiptSheet() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [step, setStep] = useState<Step>('choose');
  const [status, setStatus] = useState('');

  function handleCameraScan() {
    void trackEvent('receipt_add_method_selected', { method: 'camera' }, 'add_receipt');
    router.replace('/scan');
  }

  async function handleFilePick() {
    try {
      void trackEvent('receipt_add_method_selected', { method: 'files' }, 'add_receipt');
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      await processFile(asset.uri, asset.mimeType ?? 'application/pdf', 'files');
    } catch (error) {
      void trackError(error, { screen: 'add_receipt', properties: { method: 'files' } });
      setStatus(ERROR_COPY.upload);
      setStep('error');
    }
  }

  async function handlePhotoPick() {
    try {
      void trackEvent('receipt_add_method_selected', { method: 'photos' }, 'add_receipt');
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      void trackEvent('photo_permission_result', {
        granted: permission.granted,
      }, 'add_receipt');
      if (!permission.granted) {
        Alert.alert('Photos access needed', 'Allow photo library access to upload receipt photos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
        exif: false,
      });
      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      const mimeType = asset.mimeType ?? inferImageMimeType(asset.uri);
      await processFile(asset.uri, mimeType, 'photos');
    } catch (error) {
      void trackError(error, { screen: 'add_receipt', properties: { method: 'photos' } });
      setStatus(ERROR_COPY.upload);
      setStep('error');
    }
  }

  function inferImageMimeType(uri: string) {
    const lower = uri.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    return 'image/jpeg';
  }

  async function processFile(uri: string, mimeType: string, method: UploadMethod) {
    setStep('processing');
    setStatus('Uploading...');
    try {
      void trackEvent('receipt_upload_started', {
        method,
        file_type: mimeType.includes('pdf') ? 'pdf' : 'image',
      }, 'add_receipt');
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const storagePath = await uploadReceiptImage(user.id, uri, mimeType);
      setStatus('Reading receipt with AI...');

      const { data, error } = await supabase.functions.invoke('ocr-receipt', {
        body: { storage_path: storagePath, mime_type: mimeType },
      });
      if (error) throw error;
      if (!data?.receipt_id) throw new Error('Receipt was not saved');

      void trackEvent('receipt_upload_succeeded', {
        method,
        file_type: mimeType.includes('pdf') ? 'pdf' : 'image',
      }, 'add_receipt');
      router.replace(`/receipt/${data.receipt_id}`);
    } catch (error) {
      void trackError(error, {
        screen: 'add_receipt',
        properties: {
          method,
          file_type: mimeType.includes('pdf') ? 'pdf' : 'image',
        },
      });
      void trackEvent('receipt_upload_failed', { method }, 'add_receipt');
      setStatus(ERROR_COPY.upload);
      setStep('error');
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

  if (step === 'error') {
    return (
      <View style={styles.processingContainer}>
        <Text style={styles.errorTitle}>Upload failed</Text>
        <Text style={styles.statusText}>{status || ERROR_COPY.upload}</Text>
        <TouchableOpacity
          style={styles.primaryAction}
          onPress={() => setStep('choose')}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryActionText}>Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
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
        <TouchableOpacity style={styles.row} onPress={handlePhotoPick} activeOpacity={0.7}>
          <ImagePlus size={24} color="#0D9488" />
          <Text style={styles.rowLabel}>Choose from Photos</Text>
          <ChevronRight size={20} color="#D1D5DB" />
        </TouchableOpacity>
        <View style={styles.separator} />
        <TouchableOpacity style={styles.row} onPress={handleFilePick} activeOpacity={0.7}>
          <Upload size={24} color="#0D9488" />
          <Text style={styles.rowLabel}>Upload from Files</Text>
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
  errorTitle: {
    fontFamily: 'CabinetGrotesk-Bold',
    fontSize: 28,
    color: '#111827',
    textAlign: 'center',
  },
  primaryAction: {
    backgroundColor: '#0D9488',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 36,
    marginTop: 4,
  },
  primaryActionText: {
    fontFamily: 'DMSans-SemiBold',
    fontSize: 16,
    color: '#fff',
  },
});
