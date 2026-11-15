import { useCallback, useEffect, useState } from 'react';
import { type NativeSyntheticEvent, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import CameraVideoView from '../../specs/CameraVideoViewNativeComponent';
import {
  describeRecordingError,
  parsePlayerEvent,
  parseRecordingStats,
  previewAspectRatio,
  type PlayerStatePayload,
  type RecordingEvent,
  type VideoState,
} from '../native/yiVideo';
import { colors } from '../theme/colors';

type Props = {
  lensFacing: 'front' | 'back';
  recordingPath?: string;
  recordingPaused?: boolean;
  onVideoReady?: (ready: boolean) => void;
  onRecordingEvent?: (event: RecordingEvent) => void;
};

export function PhoneCameraPreview({
  lensFacing,
  recordingPath = '',
  recordingPaused = false,
  onVideoReady,
  onRecordingEvent,
}: Props) {
  const [video, setVideo] = useState<VideoState>({ kind: 'preparing' });
  const { width, height } = useWindowDimensions();
  const isPortrait = height >= width;

  useEffect(() => {
    setVideo({ kind: 'preparing' });
    onVideoReady?.(false);
  }, [lensFacing, onVideoReady]);

  useEffect(() => () => onVideoReady?.(false), [onVideoReady]);

  const onPlayerState = useCallback((event: NativeSyntheticEvent<PlayerStatePayload>) => {
    const payload = event.nativeEvent;
    if (payload.state === 'playing') onVideoReady?.(true);
    else if (payload.state === 'error' || payload.state === 'preparing') onVideoReady?.(false);
    if (payload.state === 'recording') {
      onRecordingEvent?.({ kind: 'started' });
      return;
    }
    if (payload.state === 'recorded') {
      try {
        const stats = parseRecordingStats(payload.message);
        onRecordingEvent?.(stats.ok
          ? { kind: 'finished', stats }
          : { kind: 'failed', message: describeRecordingError(stats.error) });
      } catch {
        onRecordingEvent?.({ kind: 'failed', message: 'Hasil rekaman kamera HP tidak dapat dibaca.' });
      }
      return;
    }
    setVideo(parsePlayerEvent(payload));
  }, [onRecordingEvent, onVideoReady]);

  const ratio = isPortrait ? 9 / 16 : 16 / 9;
  return (
    <View style={[styles.box, { aspectRatio: ratio }]}>
      <CameraVideoView
        style={styles.fill}
        lensFacing={lensFacing}
        recordingPath={recordingPath}
        recordingPaused={recordingPaused}
        onPlayerState={onPlayerState}
      />
      {video.kind === 'preparing' ? (
        <View style={styles.overlay}>
          <Text style={styles.overlayText}>Menyiapkan kamera HP...</Text>
        </View>
      ) : null}
      {video.kind === 'error' ? (
        <View style={styles.overlay}>
          <Text style={styles.overlayText}>Kamera tidak dapat digunakan</Text>
          <Text style={styles.errorText}>{video.code}</Text>
        </View>
      ) : null}
      {video.kind === 'playing' ? (
        <View style={styles.badge}>
          <View style={[styles.dot, recordingPath !== '' && styles.recordDot]} />
          <Text style={styles.badgeText}>
            {video.width > 0 ? `${video.width}×${video.height}` : 'Kamera HP'}
            {recordingPath !== '' ? '  REC' : ''}
            {recordingPaused && recordingPath !== '' ? '  PAUSED' : ''}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: '100%', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 20, backgroundColor: colors.surface },
  overlayText: { color: colors.inkMuted, fontSize: 14, textAlign: 'center' },
  errorText: { color: colors.danger, fontSize: 12, textAlign: 'center' },
  badge: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(11,12,15,0.7)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  recordDot: { backgroundColor: colors.record },
  badgeText: { color: colors.ink, fontSize: 12, fontWeight: '600' },
});
