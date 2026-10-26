import { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandHeader } from '../components/BrandHeader';
import { RecordingPanel } from '../components/RecordingPanel';
import { YiLivePreview } from '../components/YiLivePreview';
import { useCombinedRecording } from '../hooks/useCombinedRecording';
import { useYiActivation, type YiState } from '../hooks/useYiActivation';
import { isYiControlAvailable } from '../native/yiControl';
import { colors } from '../theme/colors';
import {
  DEFAULT_YI_RTSP_URL,
  extractRtspHost,
  validateRtspUrl,
} from '../utils/rstpUrl';

type StatusView = { color: string; text: string; detail?: string };

/** Status text must only claim what is actually known. "active" is NOT "video playing". */
function describeState(state: YiState): StatusView {
  switch (state.kind) {
    case 'activating':
      return { color: colors.accent, text: 'Kamera: mengaktifkan siaran langsung...' };
    case 'active':
      return {
        color: colors.success,
        text: 'Kamera: perintah aktivasi diterima',
        detail:
          'Koneksi kontrol tetap terbuka selama pratinjau berjalan. Status video ditampilkan pada kotak pratinjau.',
      };
    case 'error':
      return { color: colors.danger, text: 'Kamera: gagal diaktifkan', detail: state.message };
    case 'lost':
      return {
        color: colors.danger,
        text: 'Kamera: koneksi kontrol terputus',
        detail: 'Periksa Wi-Fi kamera, lalu tekan Hubungkan lagi.',
      };
    default:
      return { color: colors.inkMuted, text: 'Kamera: tidak terhubung' };
  }
}

/**
 * Camera screen, step 3: sends the activation command, then shows the live preview.
 * "perintah aktivasi diterima" does NOT mean video is playing; only the preview box reports that.
 */
export function CameraScreen() {
  const insets = useSafeAreaInsets();
  const [url, setUrl] = useState(DEFAULT_YI_RTSP_URL);
  const { state, activate, deactivate } = useYiActivation();
  const rec = useCombinedRecording();
  const { abort } = rec;
  const cameraActive = state.kind === 'active';

  // If the camera connection drops during a recording, stop everything and say so.
  useEffect(() => {
    if (!cameraActive) {
      abort('Koneksi kamera terputus, rekaman dihentikan.');
    }
  }, [cameraActive, abort]);

  const urlError = validateRtspUrl(url);
  const host = extractRtspHost(url);
  const moduleAvailable = isYiControlAvailable();
  const status = describeState(state);

  const busy = state.kind === 'activating';
  const isActive = state.kind === 'active';
  const canPress = !busy && moduleAvailable && (isActive || host !== null);
  const buttonLabel = busy ? 'Memproses...' : isActive ? 'Putuskan' : 'Hubungkan';

  const onPressMain = () => {
    if (isActive) {
      deactivate();
    } else if (host !== null) {
      activate(host);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}>
      <BrandHeader />

      {state.kind === 'active' && host !== null ? (
        <>
          <YiLivePreview
            source={url.trim()}
            recording={rec.videoRecording}
            onVideoReady={rec.setVideoReady}
            onRecordingEvent={rec.onVideoEvent}
          />
          <RecordingPanel rec={rec} />
        </>
      ) : (
        <View style={styles.preview}>
          <Text style={styles.previewTitle}>Pratinjau kamera belum aktif</Text>
          <Text style={styles.previewHint}>
            Tekan Hubungkan untuk mengaktifkan siaran langsung dan memulai
            pratinjau.
          </Text>
        </View>
      )}

      <View style={styles.statusBlock}>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: status.color }]} />
          <Text style={styles.statusText}>{status.text}</Text>
        </View>
        {status.detail !== undefined ? (
          <Text style={state.kind === 'active' ? styles.helpText : styles.errorText}>
            {status.detail}
          </Text>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Alamat RTSP</Text>
        <TextInput
          value={url}
          onChangeText={setUrl}
          editable={!busy && !isActive}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder={DEFAULT_YI_RTSP_URL}
          placeholderTextColor={colors.inkMuted}
          selectionColor={colors.accent}
          style={[styles.input, urlError !== null && styles.inputError]}
        />
        {urlError !== null ? (
          <Text style={styles.errorText}>{urlError}</Text>
        ) : (
          <Text style={styles.helpText}>
            Format alamat valid. Alamat kamera diambil dari sini untuk mengirim
            perintah aktivasi.
          </Text>
        )}

        <Pressable
          onPress={() => setUrl(DEFAULT_YI_RTSP_URL)}
          disabled={busy || isActive}
          accessibilityRole="button"
          style={styles.linkButton}>
          <Text style={styles.linkText}>Pakai alamat bawaan Yi</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={onPressMain}
        disabled={!canPress}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canPress }}
        style={[styles.primaryButton, !canPress && styles.primaryButtonDisabled]}>
        <Text style={[styles.primaryButtonText, !canPress && styles.primaryButtonTextDisabled]}>
          {buttonLabel}
        </Text>
      </Pressable>
      <Text style={styles.helpText}>
        {moduleAvailable
          ? 'Sambungkan ponsel ke Wi-Fi kamera Yi (namanya mirip YDXJ_...), lalu tekan Hubungkan. Koneksi kontrol harus tetap terbuka agar video terus tampil.'
          : 'Modul kontrol kamera tidak tersedia di build ini.'}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 16, paddingBottom: 24, gap: 16 },
  preview: {
    aspectRatio: 16 / 9,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 6,
  },
  previewTitle: { color: colors.ink, fontSize: 16, fontWeight: '600' },
  previewHint: {
    color: colors.inkMuted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  statusBlock: { gap: 6 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { color: colors.ink, fontSize: 14, flexShrink: 1 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  label: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  input: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.ink,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inputError: { borderColor: colors.danger },
  errorText: { color: colors.danger, fontSize: 13, lineHeight: 18 },
  helpText: { color: colors.inkMuted, fontSize: 13, lineHeight: 18 },
  linkButton: { alignSelf: 'flex-start', paddingVertical: 6 },
  linkText: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonDisabled: { backgroundColor: colors.surfaceRaised },
  primaryButtonText: { color: colors.background, fontSize: 16, fontWeight: '700' },
  primaryButtonTextDisabled: { color: colors.inkMuted },
});