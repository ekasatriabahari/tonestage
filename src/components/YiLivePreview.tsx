import { useCallback, useEffect, useState } from 'react';
import {
  type NativeSyntheticEvent,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import YiVideoView from '../../specs/YiVideoViewNativeComponent';
import {
  describeVideoError,
  parsePlayerEvent,
  previewAspectRatio,
  type PlayerStatePayload,
  type VideoState,
} from '../native/yiVideo';
import { colors } from '../theme/colors';

// The camera may need a moment after the start command before RTSP answers, so one error
// is followed by a single automatic retry. Every state is still shown to the user as it is.
const MAX_AUTO_RETRIES = 1;
const RETRY_DELAY_MS = 1500;

type Props = { source: string };

/** Live preview. Mount it only while the camera control connection is active. */
export function YiLivePreview({ source }: Props) {
  const [video, setVideo] = useState<VideoState>({ kind: 'preparing' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (video.kind !== 'error' || attempt >= MAX_AUTO_RETRIES) {
      return undefined;
    }
    const id = setTimeout(() => {
      setVideo({ kind: 'preparing' });
      setAttempt(a => a + 1);
    }, RETRY_DELAY_MS);
    return () => clearTimeout(id);
  }, [video.kind, attempt]);

  const onPlayerState = useCallback(
    (event: NativeSyntheticEvent<PlayerStatePayload>) => {
      setVideo(parsePlayerEvent(event.nativeEvent));
    },
    [],
  );

  const willRetry = video.kind === 'error' && attempt < MAX_AUTO_RETRIES;

  return (
    <View style={[styles.box, { aspectRatio: previewAspectRatio(video) }]}>
      <YiVideoView
        key={attempt}
        source={source}
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
          <View style={styles.badgeDot} />
          <Text style={styles.badgeText}>
            {video.width > 0 ? `Langsung ${video.width}x${video.height}` : 'Langsung'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: colors.record,
  },
  badgeText: { color: colors.ink, fontSize: 12, fontWeight: '600' },
});