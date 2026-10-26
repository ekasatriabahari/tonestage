import { useCallback, useEffect, useState } from 'react';
import {
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import YiVideoView from '../../specs/YiVideoViewNativeComponent';
import { exportRecordedFile } from '../native/audioTest';
import {
  describeRecordingError,
  describeVideoError,
  parsePlayerEvent,
  parseRecordingStats,
  previewAspectRatio,
  summarizeRecording,
  type PlayerStatePayload,
  type RecordingStats,
  type VideoState,
} from '../native/yiVideo';
import { colors } from '../theme/colors';

// The camera may need a moment after the start command before RTSP answers, so one error
// is followed by a single automatic retry. Every state is still shown to the user as it is.
const MAX_AUTO_RETRIES = 1;
const RETRY_DELAY_MS = 1500;

type RecState =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'recording'; since: number }
  | { kind: 'done'; stats: RecordingStats }
  | { kind: 'error'; message: string };

function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

type Props = { source: string };

/** Live preview. Mount it only while the camera control connection is active. */
export function YiLivePreview({ source }: Props) {
  const [video, setVideo] = useState<VideoState>({ kind: 'preparing' });
  const [attempt, setAttempt] = useState(0);
  const [wantRecording, setWantRecording] = useState(false);
  const [rec, setRec] = useState<RecState>({ kind: 'idle' });
  const [now, setNow] = useState(Date.now());
  const [savedTo, setSavedTo] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (video.kind !== 'error' || attempt >= MAX_AUTO_RETRIES) {
      return undefined;
    }
    const id = setTimeout(() => {
      setVideo({ kind: 'preparing' });
      setWantRecording(false);
      setAttempt(a => a + 1);
    }, RETRY_DELAY_MS);
    return () => clearTimeout(id);
  }, [video.kind, attempt]);

  useEffect(() => {
    if (rec.kind !== 'recording') {
      return undefined;
    }
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [rec.kind]);

  const onPlayerState = useCallback(
    (event: NativeSyntheticEvent<PlayerStatePayload>) => {
      const payload = event.nativeEvent;
      if (payload.state === 'recording') {
        setRec({ kind: 'recording', since: Date.now() });
        setNow(Date.now());
        return;
      }
      if (payload.state === 'recorded') {
        setWantRecording(false);
        try {
          const stats = parseRecordingStats(payload.message);
          setRec(
            stats.ok
              ? { kind: 'done', stats }
              : { kind: 'error', message: describeRecordingError(stats.error) },
          );
        } catch {
          setRec({ kind: 'error', message: 'Hasil rekaman tidak dapat dibaca.' });
        }
        return;
      }
      setVideo(parsePlayerEvent(payload));
    },
    [],
  );

  const toggleRecording = () => {
    if (wantRecording) {
      setWantRecording(false); // native then stops and reports the result
      return;
    }
    setSavedTo(null);
    setSaveError(null);
    setRec({ kind: 'starting' });
    setWantRecording(true);
  };

  const saveRecording = async (path: string) => {
    setSaveError(null);
    const result = await exportRecordedFile(path);
    if (result.ok) {
      setSavedTo(result.location);
    } else {
      setSaveError(result.message);
    }
  };

  const willRetry = video.kind === 'error' && attempt < MAX_AUTO_RETRIES;
  const canToggle = video.kind === 'playing';
  const recordLabel = !wantRecording
    ? 'Rekam video uji (tanpa audio)'
    : rec.kind === 'recording'
      ? `Berhenti rekam (${clock(now - rec.since)})`
      : 'Menunggu keyframe... (ketuk untuk batal)';

  return (
    <View style={styles.wrap}>
      <View style={[styles.box, { aspectRatio: previewAspectRatio(video) }]}>
        <YiVideoView
          key={attempt}
          source={source}
          recording={wantRecording}
          onPlayerState={onPlayerState}
          style={styles.fill}
        />
        {video.kind === 'preparing' || willRetry ? (
          <View style={styles.overlay}>
            <Text style={styles.overlayText}>
              {willRetry ? 'Mencoba lagi...' : 'Memuat video dari kamera...'}
            </Text>
          </View>
        ) : null}
        {video.kind === 'error' && !willRetry ? (
          <View style={styles.overlay}>
            <Text style={styles.overlayTitle}>Pratinjau gagal</Text>
            <Text style={styles.overlayError}>{describeVideoError(video.code)}</Text>
            <Text style={styles.overlayCode}>Kode: {video.code || 'tidak ada'}</Text>
          </View>
        ) : null}
        {video.kind === 'playing' ? (
          <View style={styles.badge}>
            <View style={[styles.badgeDot, wantRecording && rec.kind === 'recording' && styles.badgeDotRec]} />
            <Text style={styles.badgeText}>
              {video.width > 0 ? `Langsung ${video.width}x${video.height}` : 'Langsung'}
              {wantRecording && rec.kind === 'recording' ? '  REC' : ''}
            </Text>
          </View>
        ) : null}
      </View>

      <Pressable
        onPress={toggleRecording}
        disabled={!canToggle && !wantRecording}
        accessibilityRole="button"
        style={[
          styles.recordButton,
          wantRecording && styles.recordButtonActive,
          !canToggle && !wantRecording && styles.recordButtonDisabled,
        ]}>
        <Text style={[styles.recordText, wantRecording && styles.recordTextActive]}>
          {recordLabel}
        </Text>
      </Pressable>

      {rec.kind === 'error' ? <Text style={styles.recError}>{rec.message}</Text> : null}

      {rec.kind === 'done' ? (
        <View style={styles.result}>
          <Text style={styles.resultTitle}>Hasil rekaman uji video</Text>
          {summarizeRecording(rec.stats).map(line => (
            <Text key={line} style={styles.resultLine}>
              {line}
            </Text>
          ))}
          <Text style={styles.resultNote}>
            Hanya video, tanpa audio. File asli: {rec.stats.path}
          </Text>
          <Pressable
            onPress={() => saveRecording(rec.stats.path)}
            accessibilityRole="button"
            style={styles.saveButton}>
            <Text style={styles.saveText}>Simpan ke folder Unduhan</Text>
          </Pressable>
          {savedTo !== null ? (
            <Text style={styles.saved}>
              Tersimpan: {savedTo}. Buka lewat aplikasi file manager ponsel.
            </Text>
          ) : null}
          {saveError !== null ? <Text style={styles.recError}>{saveError}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  box: {
    width: '100%',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 6,
    backgroundColor: colors.surface,
  },
  overlayText: { color: colors.inkMuted, fontSize: 14, textAlign: 'center' },
  overlayTitle: { color: colors.ink, fontSize: 16, fontWeight: '600' },
  overlayError: {
    color: colors.danger,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  overlayCode: { color: colors.inkMuted, fontSize: 11, textAlign: 'center' },
  badge: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(11,12,15,0.7)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  badgeDotRec: { backgroundColor: colors.record },
  badgeText: { color: colors.ink, fontSize: 12, fontWeight: '600' },
  recordButton: {
    borderColor: colors.record,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  recordButtonActive: { backgroundColor: colors.record },
  recordButtonDisabled: { opacity: 0.4 },
  recordText: { color: colors.record, fontSize: 14, fontWeight: '700' },
  recordTextActive: { color: colors.ink },
  recError: { color: colors.danger, fontSize: 13, lineHeight: 18 },
  result: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 4,
  },
  resultTitle: { color: colors.ink, fontSize: 15, fontWeight: '700', marginBottom: 2 },
  resultLine: { color: colors.inkMuted, fontSize: 12, lineHeight: 17 },
  resultNote: { color: colors.inkMuted, fontSize: 10, marginTop: 4 },
  saveButton: {
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 6,
  },
  saveText: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  saved: { color: colors.success, fontSize: 12, lineHeight: 17 },
});