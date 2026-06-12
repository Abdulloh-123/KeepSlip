import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { X, CheckCircle } from 'lucide-react-native';
import { supabase, uploadReceiptImage } from '@/lib/supabase';
import { ERROR_COPY } from '@/lib/errors';
import { trackError, trackEvent } from '@/lib/analytics';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const FRAME_W = SCREEN_W * 0.82;
const FRAME_H = FRAME_W * 1.55; // receipt aspect ratio

type Phase = 'camera' | 'processing' | 'success' | 'error';

export default function ScanScreen() {
  const router = useRouter();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>('camera');
  const [status, setStatus] = useState('');
  const [insertedId, setInsertedId] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ merchant: string; amount: number } | null>(null);

  useEffect(() => {
    void trackEvent('scan_screen_opened', {}, 'scan');
  }, []);

  async function handleRequestPermission() {
    try {
      const response = await requestPermission();
      void trackEvent('camera_permission_result', {
        granted: response.granted,
      }, 'scan');
    } catch (error) {
      void trackError(error, { screen: 'scan', properties: { phase: 'camera_permission' } });
    }
  }

  async function handleCapture() {
    if (!cameraRef.current) return;
    setPhase('processing');
    setStatus('Uploading…');

    try {
      void trackEvent('receipt_scan_started', {}, 'scan');
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85, skipProcessing: false });
      if (!photo) throw new Error('Capture failed');

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const storagePath = await uploadReceiptImage(user.id, photo.uri, 'image/jpeg');
      setStatus('Reading receipt with AI…');

      const { data, error } = await supabase.functions.invoke('ocr-receipt', {
        body: { storage_path: storagePath, mime_type: 'image/jpeg' },
      });
      if (error) throw error;
      if (!data?.receipt_id) throw new Error('Receipt was not saved');

      setSummary({
        merchant: data.merchant_name ?? 'Unknown',
        amount: Number(data.total_amount ?? 0),
      });
      setInsertedId(data.receipt_id);
      setPhase('success');
      void trackEvent('receipt_scan_succeeded', {
        has_amount: Number(data.total_amount ?? 0) > 0,
      }, 'scan');
    } catch (error) {
      void trackError(error, { screen: 'scan', properties: { phase: 'capture_or_ocr' } });
      void trackEvent('receipt_scan_failed', {}, 'scan');
      setStatus(ERROR_COPY.scan);
      setPhase('error');
    }
  }

  if (!permission) return <View style={styles.screen} />;

  if (!permission.granted) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.permTitle}>Camera access needed</Text>
        <Text style={styles.permSub}>Allow camera to scan receipts.</Text>
        <TouchableOpacity style={styles.actionBtn} onPress={handleRequestPermission} activeOpacity={0.85}>
          <Text style={styles.actionBtnText}>Allow Camera</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (phase === 'processing') {
    return (
      <View style={[styles.screen, styles.center, { backgroundColor: '#fff' }]}>
        <ActivityIndicator size="large" color="#0D9488" />
        <Text style={styles.processingText}>{status}</Text>
      </View>
    );
  }

  if (phase === 'success') {
    return (
      <View style={[styles.screen, styles.center, { backgroundColor: '#fff' }]}>
        <View style={styles.successIconWrap}>
          <CheckCircle size={72} color="#0D9488" strokeWidth={1.5} />
        </View>
        <Text style={styles.successTitle}>Receipt Saved!</Text>
        {summary && (
          <Text style={styles.successSub}>
            {summary.merchant} — ${summary.amount.toFixed(2)}
          </Text>
        )}
        <TouchableOpacity
          style={styles.viewBtn}
          onPress={() => router.replace(`/receipt/${insertedId}`)}
          activeOpacity={0.85}
        >
          <Text style={styles.viewBtnText}>View Receipt</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.replace('/(tabs)')} activeOpacity={0.7}>
          <Text style={styles.doneText}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (phase === 'error') {
    return (
      <View style={[styles.screen, styles.center, { backgroundColor: '#fff' }]}>
        <Text style={styles.errorTitle}>Scan failed</Text>
        <Text style={styles.errorBody}>{status || ERROR_COPY.scan}</Text>
        <TouchableOpacity
          style={styles.viewBtn}
          onPress={() => setPhase('camera')}
          activeOpacity={0.85}
        >
          <Text style={styles.viewBtnText}>Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={styles.doneText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* Camera fill */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        onCameraReady={() => {}}
        onMountError={(error) => {
          void trackError(error, { screen: 'scan', properties: { phase: 'camera_mount' } });
          Alert.alert('Camera unavailable', 'We could not start the camera. Please try again.');
          router.back();
        }}
      />

      {/* Dark overlay with receipt-shaped cutout */}
      <View style={styles.overlay} pointerEvents="none">
        <View style={[styles.darkBand, { height: (SCREEN_H - FRAME_H) / 2 }]} />
        <View style={styles.middleRow}>
          <View style={[styles.darkBand, { width: (SCREEN_W - FRAME_W) / 2 }]} />
          <View style={styles.frame}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
          <View style={[styles.darkBand, { width: (SCREEN_W - FRAME_W) / 2 }]} />
        </View>
        <View style={[styles.darkBand, { flex: 1 }]} />
      </View>

      {/* Top bar */}
      <View style={styles.topBar}>
        <Text style={styles.topTitle}>Scan Receipt</Text>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <X size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Hint below frame */}
      <View style={styles.hintArea} pointerEvents="none">
        <Text style={styles.hintText}>Align receipt inside the frame</Text>
      </View>

      {/* Capture button */}
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.captureBtn} onPress={handleCapture} activeOpacity={0.85}>
          <View style={styles.captureInner} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const CORNER = 28;
const THICK = 3;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 40 },
  overlay: { ...StyleSheet.absoluteFillObject, flexDirection: 'column' },
  darkBand: { backgroundColor: 'rgba(0,0,0,0.55)' },
  middleRow: { flexDirection: 'row', height: FRAME_H },
  frame: { width: FRAME_W, height: FRAME_H, borderRadius: 4 },
  corner: { position: 'absolute', width: CORNER, height: CORNER },
  cornerTL: { top: 0, left: 0, borderTopWidth: THICK, borderLeftWidth: THICK, borderColor: '#fff', borderTopLeftRadius: 4 },
  cornerTR: { top: 0, right: 0, borderTopWidth: THICK, borderRightWidth: THICK, borderColor: '#fff', borderTopRightRadius: 4 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: THICK, borderLeftWidth: THICK, borderColor: '#fff', borderBottomLeftRadius: 4 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: THICK, borderRightWidth: THICK, borderColor: '#fff', borderBottomRightRadius: 4 },
  topBar: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  topTitle: { fontFamily: 'DMSans-SemiBold', fontSize: 18, color: '#fff' },
  closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  hintArea: {
    position: 'absolute',
    top: (SCREEN_H + FRAME_H) / 2 + 14,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  hintText: { fontFamily: 'DMSans-Regular', fontSize: 13, color: 'rgba(255,255,255,0.75)' },
  bottomBar: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  captureBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  captureInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' },
  permTitle: { fontFamily: 'DMSans-SemiBold', fontSize: 18, color: '#111827', textAlign: 'center' },
  permSub: { fontFamily: 'DMSans-Regular', fontSize: 14, color: '#6B7280', textAlign: 'center' },
  actionBtn: { backgroundColor: '#0D9488', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, marginTop: 4 },
  actionBtnText: { fontFamily: 'DMSans-Bold', fontSize: 16, color: '#fff' },
  cancelText: { fontFamily: 'DMSans-Medium', fontSize: 14, color: '#9CA3AF' },
  processingText: { fontFamily: 'DMSans-Medium', fontSize: 16, color: '#374151' },
  errorTitle: {
    fontFamily: 'CabinetGrotesk-Bold',
    fontSize: 28,
    color: '#111827',
    textAlign: 'center',
  },
  errorBody: {
    fontFamily: 'DMSans-Regular',
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
  },
  successIconWrap: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  successTitle: {
    fontFamily: 'CabinetGrotesk-Bold',
    fontSize: 28,
    color: '#111827',
  },
  successSub: {
    fontFamily: 'DMSans-Regular',
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  viewBtn: {
    backgroundColor: '#0D9488',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 40,
    marginTop: 8,
  },
  viewBtnText: {
    fontFamily: 'DMSans-SemiBold',
    fontSize: 16,
    color: '#fff',
  },
  doneText: {
    fontFamily: 'DMSans-Medium',
    fontSize: 15,
    color: '#9CA3AF',
    marginTop: 4,
  },
});
