import { useEffect, useState } from 'react';
import {
  PermissionsAndroid,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandHeader } from '../components/BrandHeader';
import { PhoneCameraPreview } from '../components/PhoneCameraPreview';
import { RecordingPanel } from '../components/RecordingPanel';
import { MiniStudioPanel } from '../components/MiniStudioPanel';
import { YiLivePreview } from '../components/YiLivePreview';
import type { BackingTrack } from '../hooks/useBackingTrack';
import { useCombinedRecording } from '../hooks/useCombinedRecording';
import { useYiActivation, type YiState } from '../hooks/useYiActivation';
import { isYiControlAvailable } from '../native/yiControl';
import { colors } from '../theme/colors';
import {
  DEFAULT_YI_RTSP_URL,
  extractRtspHost,
  validateRtspUrl,
} from '../utils/rstpUrl';

type CameraSource = 'yi' | 'front' | 'back';
type StatusView = { color: string; text: string; detail?: string };

function describeState(state: YiState): StatusView {
  switch (state.kind) {
    case 'activating':
      return { color: colors.accent, text: 'Yi: mengaktifkan siaran langsung...' };
    case 'active':
      return {
        color: colors.success,
        text: 'Yi: perintah aktivasi diterima',
        detail: 'Status video aktual ditampilkan pada kotak pratinjau.',
      };
    case 'error':
      return { color: colors.danger, text: 'Yi: gagal diaktifkan', detail: state.message };
    case 'lost':
      return { color: colors.danger, text: 'Yi: koneksi kontrol terputus', detail: 'Periksa Wi-Fi kamera, lalu hubungkan lagi.' };
    default:
      return { color: colors.inkMuted, text: 'Yi: tidak terhubung' };
  }
}

export function CameraScreen({ backing, screenActive }: { backing: BackingTrack; screenActive: boolean }) {
  const insets = useSafeAreaInsets();
  const [url, setUrl] = useState(DEFAULT_YI_RTSP_URL);
  const [source, setSource] = useState<CameraSource>('yi');
  const [cameraPermission, setCameraPermission] = useState(false);
  const [cameraPermissionMessage, setCameraPermissionMessage] = useState<string | null>(null);
  const { state, activate, deactivate } = useYiActivation();
  const rec = useCombinedRecording(backing);
  const recordingLocked = ['starting', 'recording', 'paused', 'stopping'].includes(rec.phase);

  useEffect(() => {
    if (recordingLocked && !rec.videoReady) {
      rec.abort(source === 'yi'
        ? 'Koneksi atau stream Yi terputus, rekaman dihentikan.'
        : 'Kamera HP terputus, rekaman dihentikan.');
    }
  }, [recordingLocked, rec.videoReady, source, rec.abort]);

  const urlError = validateRtspUrl(url);
  const host = extractRtspHost(url);
  const moduleAvailable = isYiControlAvailable();
  const status = describeState(state);
  const busy = state.kind === 'activating';
  const isActive = state.kind === 'active';
  const canConnect = !busy && moduleAvailable && (isActive || host !== null);

  const chooseSource = async (next: CameraSource) => {
    if (recordingLocked) return;
    if (next === 'yi') {
      rec.setVideoReady(false);
      setSource('yi');
      return;
    }
    rec.setVideoReady(false);
    setSource(next);
    if (isActive) deactivate();
    try {
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
      if (result !== PermissionsAndroid.RESULTS.GRANTED) {
        setCameraPermissionMessage('Izin kamera diperlukan untuk menggunakan kamera HP.');
        return;
      }
      setCameraPermission(true);
      setCameraPermissionMessage(null);
      setSource(next);
    } catch {
      setCameraPermissionMessage('Izin kamera tidak dapat diminta. Periksa pengaturan aplikasi Android.');
    }
  };

  const onYiPress = () => {
    if (isActive) deactivate();
    else if (host !== null) activate(host);
  };

  const sourceOptions: { id: CameraSource; label: string }[] = [
    { id: 'yi', label: 'Yi Action Cam' },
    { id: 'front', label: 'Front Camera' },
    { id: 'back', label: 'Rear Camera' },
  ];

  return (
    <ScrollView
      style={styles.screen}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}>
      <BrandHeader />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Sumber Video</Text>
        <View style={styles.sourceRow}>
          {sourceOptions.map(option => {
            const selected = source === option.id;
            return (
              <Pressable
                key={option.id}
                onPress={() => chooseSource(option.id)}
                disabled={recordingLocked}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled: recordingLocked }}
                style={[styles.sourceOption, selected && styles.sourceOptionActive, recordingLocked && styles.sourceOptionDisabled]}>
                <Text style={[styles.sourceText, selected && styles.sourceTextActive]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {recordingLocked ? <Text style={styles.helpText}>Sumber kamera tidak dapat diganti saat sesi aktif.</Text> : null}
      </View>

      {source === 'yi' ? (
        <>
          {isActive && host !== null ? (
            <YiLivePreview
              source={url.trim()}
              recordingPath={rec.videoRecordingPath}
              recordingPaused={rec.videoRecordingPaused}
              onVideoReady={rec.setVideoReady}
              onRecordingEvent={rec.onVideoEvent}
            />
          ) : (
            <View style={styles.preview}>
              <Text style={styles.previewTitle}>Pratinjau Yi belum aktif</Text>
              <Text style={styles.previewHint}>Hubungkan ponsel ke Wi-Fi Yi Action Cam, lalu aktifkan kamera.</Text>
            </View>
          )}

          <Pressable
            onPress={onYiPress}
            disabled={!canConnect || recordingLocked}
            accessibilityRole="button"
            style={[styles.primaryButton, (!canConnect || recordingLocked) && styles.primaryButtonDisabled]}>
            <Text style={[styles.primaryButtonText, (!canConnect || recordingLocked) && styles.primaryButtonTextDisabled]}>
              {busy ? 'Memproses...' : isActive ? 'Putuskan Yi' : 'Hubungkan Yi'}
            </Text>
          </Pressable>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: status.color }]} />
            <Text style={styles.statusText}>{status.text}</Text>
          </View>
          {status.detail ? <Text style={styles.helpText}>{status.detail}</Text> : null}
          <Text style={styles.helpText}>
            {moduleAvailable
              ? 'Yi Action Cam menggunakan RTSP melalui Wi-Fi kamera. Pertahankan koneksi Wi-Fi selama preview dan recording.'
              : 'Modul kontrol kamera Yi tidak tersedia di build ini.'}
          </Text>

          <View style={styles.card}>
            <Text style={styles.label}>Alamat RTSP</Text>
            <TextInput
              value={url}
              onChangeText={setUrl}
              editable={!busy && !isActive && !recordingLocked}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder={DEFAULT_YI_RTSP_URL}
              placeholderTextColor={colors.inkMuted}
              selectionColor={colors.accent}
              style={[styles.input, urlError !== null && styles.inputError]}
            />
            {urlError !== null ? <Text style={styles.errorText}>{urlError}</Text> : null}
            <Pressable
              onPress={() => setUrl(DEFAULT_YI_RTSP_URL)}
              disabled={busy || isActive || recordingLocked}
              accessibilityRole="button"
              style={styles.linkButton}>
              <Text style={styles.linkText}>Pakai alamat bawaan Yi</Text>
            </Pressable>
          </View>
        </>
      ) : cameraPermission ? (
        <>
          <PhoneCameraPreview
            lensFacing={source}
            recordingPath={rec.videoRecordingPath}
            recordingPaused={rec.videoRecordingPaused}
            onVideoReady={rec.setVideoReady}
            onRecordingEvent={rec.onVideoEvent}
          />
          <Text style={styles.helpText}>
            {source === 'front' ? 'Menggunakan kamera depan ponsel.' : 'Menggunakan kamera belakang ponsel.'}
            {' '}Rekaman video disimpan tanpa audio kamera; audio gitar dan backing tetap diproses oleh sistem Tone Stage.
          </Text>
        </>
      ) : (
        <View style={styles.preview}>
          <Text style={styles.previewTitle}>Izin kamera diperlukan</Text>
          <Text style={styles.previewHint}>{cameraPermissionMessage ?? 'Pilih kamera HP untuk meminta izin dan menampilkan preview.'}</Text>
          <Pressable onPress={() => chooseSource(source)} style={styles.permissionButton}>
            <Text style={styles.permissionButtonText}>Izinkan kamera</Text>
          </Pressable>
        </View>
      )}

      <RecordingPanel rec={rec} />
      <MiniStudioPanel backing={backing} active={screenActive} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 16, paddingBottom: 24, gap: 14 },
  section: { gap: 8 },
  sectionTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  sourceRow: { flexDirection: 'row', gap: 6 },
  sourceOption: { flex: 1, minHeight: 42, borderColor: colors.border, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, backgroundColor: colors.surface },
  sourceOptionActive: { borderColor: colors.accent, backgroundColor: colors.surfaceRaised },
  sourceOptionDisabled: { opacity: 0.55 },
  sourceText: { color: colors.inkMuted, fontSize: 11, fontWeight: '600', textAlign: 'center' },
  sourceTextActive: { color: colors.accent },
  preview: { aspectRatio: 16 / 9, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 8 },
  previewTitle: { color: colors.ink, fontSize: 16, fontWeight: '600' },
  previewHint: { color: colors.inkMuted, fontSize: 13, textAlign: 'center', lineHeight: 18 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 9, height: 9, borderRadius: 5 },
  statusText: { color: colors.ink, fontSize: 13, flexShrink: 1 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 16, gap: 8 },
  label: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  input: { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderWidth: 1, borderRadius: 10, color: colors.ink, fontSize: 15, paddingHorizontal: 12, paddingVertical: 10 },
  inputError: { borderColor: colors.danger },
  errorText: { color: colors.danger, fontSize: 13, lineHeight: 18 },
  helpText: { color: colors.inkMuted, fontSize: 12, lineHeight: 17 },
  linkButton: { alignSelf: 'flex-start', paddingVertical: 6 },
  linkText: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  primaryButton: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  primaryButtonDisabled: { backgroundColor: colors.surfaceRaised },
  primaryButtonText: { color: colors.background, fontSize: 15, fontWeight: '700' },
  primaryButtonTextDisabled: { color: colors.inkMuted },
  permissionButton: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10, marginTop: 4 },
  permissionButtonText: { color: colors.background, fontSize: 13, fontWeight: '700' },
});
