import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandHeader } from '../components/BrandHeader';
import { TapBar } from '../components/TapBar';
import type { BackingTrack } from '../hooks/useBackingTrack';
import { isBackingTrackAvailable } from '../native/backingTrack';
import {
  describeBackingError,
  formatClock,
  fractionOf,
  positionFromFraction,
} from '../native/backingTrackLogic';
import { colors } from '../theme/colors';

const STATE_LABEL: Record<string, string> = {
  idle: 'Belum ada file',
  stopped: 'Berhenti',
  playing: 'Memutar',
  paused: 'Jeda',
  ended: 'Selesai',
  error: 'Kesalahan',
};

/**
 * Backing-track player: choose a file and control playback. Volume, EQ and the output device are in
 * the Mixer tab. The player runs in native code and keeps playing when you switch tabs.
 */
export function BackingTrackScreen({ bt }: { bt: BackingTrack }) {
  const insets = useSafeAreaInsets();
  const available = isBackingTrackAvailable();
  const status = bt.status;
  const state = status === null ? 'idle' : status.state;
  const loaded = bt.loaded !== null;
  const playing = state === 'playing';
  const duration = bt.loaded === null ? 0 : bt.loaded.durationMs;
  const position = status === null ? 0 : status.positionMs;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}>
      <BrandHeader />

      {!available ? <Text style={styles.error}>{describeBackingError('MODULE_UNAVAILABLE')}</Text> : null}

      <View style={styles.card}>
        <Text style={styles.title}>File</Text>
        <Pressable
          onPress={bt.pick}
          disabled={bt.busy || !available}
          accessibilityRole="button"
          style={[styles.primary, (bt.busy || !available) && styles.disabled]}>
          <Text style={styles.primaryText}>Pilih file audio (MP3 / WAV)</Text>
        </Pressable>
        {!loaded && bt.lastFile !== null ? (
          <Pressable onPress={bt.useLast} disabled={bt.busy} accessibilityRole="button" style={styles.secondary}>
            <Text style={styles.secondaryText}>Pakai file terakhir: {bt.lastFile.name}</Text>
          </Pressable>
        ) : null}
        {bt.loaded !== null ? (
          <View style={styles.fileInfo}>
            <Text style={styles.fileName}>{bt.loaded.name}</Text>
            <Text style={styles.detail}>
              {formatClock(bt.loaded.durationMs)} | {bt.loaded.sampleRate} Hz | {bt.loaded.channels === 1 ? 'mono' : 'stereo'} |{' '}
              {bt.loaded.mime}
            </Text>
          </View>
        ) : null}
        {bt.message !== null && bt.message !== '' ? <Text style={styles.error}>{bt.message}</Text> : null}
        <Text style={styles.note}>
          File asli tidak diubah. Backing track tidak pernah dicampur ke rekaman gitar saat merekam.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Pemutar</Text>
        <View style={styles.timeRow}>
          <Text style={styles.time}>{formatClock(position)}</Text>
          <Text style={styles.stateText}>
            {status !== null && status.state === 'error' ? describeBackingError(status.error) : STATE_LABEL[state] ?? state}
          </Text>
          <Text style={styles.time}>{formatClock(duration)}</Text>
        </View>
        <TapBar
          fraction={fractionOf(position, duration)}
          onChange={f => bt.seekTo(positionFromFraction(f, duration))}
          disabled={!loaded}
        />
        <View style={styles.transport}>
          <Pressable onPress={() => bt.seekBy(-10000)} disabled={!loaded} accessibilityRole="button" style={[styles.smallButton, !loaded && styles.disabled]}>
            <Text style={styles.smallText}>-10 dtk</Text>
          </Pressable>
          <Pressable
            onPress={playing ? bt.pause : bt.play}
            disabled={!loaded}
            accessibilityRole="button"
            style={[styles.playButton, !loaded && styles.disabled]}>
            <Text style={styles.playText}>{playing ? 'Jeda' : 'Putar'}</Text>
          </Pressable>
          <Pressable onPress={bt.stop} disabled={!loaded} accessibilityRole="button" style={[styles.smallButton, !loaded && styles.disabled]}>
            <Text style={styles.smallText}>Stop</Text>
          </Pressable>
          <Pressable onPress={() => bt.seekBy(10000)} disabled={!loaded} accessibilityRole="button" style={[styles.smallButton, !loaded && styles.disabled]}>
            <Text style={styles.smallText}>+10 dtk</Text>
          </Pressable>
        </View>
        <Text style={styles.note}>Ketuk bilah di atas untuk melompat ke posisi tertentu.</Text>
        <Text style={styles.detail}>
          Waktu keluar suara:{' '}
          {playing ? (status !== null && status.hasAnchor ? 'tercatat tepat (timestamp)' : 'belum tersedia') : 'aktif saat memutar'}
        </Text>
        <Text style={styles.note}>Volume, EQ, dan pilihan output ada di tab Mixer.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 },
  title: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  primary: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  primaryText: { color: colors.background, fontSize: 14, fontWeight: '700' },
  secondary: { borderColor: colors.accent, borderWidth: 1, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 },
  secondaryText: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  disabled: { opacity: 0.4 },
  fileInfo: { gap: 2 },
  fileName: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  detail: { color: colors.inkMuted, fontSize: 12, lineHeight: 17 },
  note: { color: colors.inkMuted, fontSize: 11, lineHeight: 16 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 18 },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  time: { color: colors.ink, fontSize: 13, fontWeight: '600' },
  stateText: { color: colors.accent, fontSize: 12, fontWeight: '700', flexShrink: 1, textAlign: 'center' },
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  smallButton: { borderColor: colors.accent, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  smallText: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  playButton: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 22, paddingVertical: 12 },
  playText: { color: colors.background, fontSize: 15, fontWeight: '700' },
});