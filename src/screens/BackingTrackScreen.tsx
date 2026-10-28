import { useState } from 'react';
import {
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandHeader } from '../components/BrandHeader';
import { MeterBars } from '../components/MeterBars';
import { useBackingTrack } from '../hooks/useBackingTrack';
import {
  describeBackingError,
  describeOutputType,
  formatClock,
  fractionOf,
  outputWarning,
  positionFromFraction,
} from '../native/backingTrackLogic';
import { isBackingTrackAvailable } from '../native/backingTrack';
import { colors } from '../theme/colors';

type Props = { active: boolean };

const STATE_LABEL: Record<string, string> = {
  idle: 'Belum ada file',
  stopped: 'Berhenti',
  playing: 'Memutar',
  paused: 'Jeda',
  ended: 'Selesai',
  error: 'Kesalahan',
};

/** A thin bar you tap to choose a value (0 to 1). */
function TapBar({
  fraction,
  onChange,
  disabled,
}: {
  fraction: number;
  onChange: (fraction: number) => void;
  disabled?: boolean;
}) {
  const [width, setWidth] = useState(0);
  const fill = `${(Math.min(1, Math.max(0, fraction)) * 100).toFixed(1)}%` as const;
  return (
    <Pressable
      disabled={disabled}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      onPress={e => {
        if (width > 0) {
          onChange(e.nativeEvent.locationX / width);
        }
      }}
      accessibilityRole="adjustable"
      style={[styles.tapBar, disabled && styles.disabled]}>
      <View style={[styles.tapFill, { width: fill }]} />
    </Pressable>
  );
}

/**
 * Backing-track player. The player runs in native code and keeps playing when you switch tabs;
 * this screen only shows its status while it is visible.
 */
export function BackingTrackScreen({ active }: Props) {
  const insets = useSafeAreaInsets();
  const bt = useBackingTrack(active);
  const available = isBackingTrackAvailable();
  const status = bt.status;
  const state = status === null ? 'idle' : status.state;
  const loaded = bt.loaded !== null;
  const playing = state === 'playing';
  const duration = loaded ? bt.loaded?.durationMs ?? 0 : 0;
  const position = status === null ? 0 : status.positionMs;
  const routedName = status !== null && status.routedDeviceId >= 0 ? status.routedDeviceName || `ID ${status.routedDeviceId}` : null;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}>
      <BrandHeader />

      {!available ? (
        <Text style={styles.error}>{describeBackingError('MODULE_UNAVAILABLE')}</Text>
      ) : null}

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
              {formatClock(bt.loaded.durationMs)} | {bt.loaded.sampleRate} Hz |{' '}
              {bt.loaded.channels === 1 ? 'mono' : 'stereo'} | {bt.loaded.mime}
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
            {status !== null && status.state === 'error'
              ? describeBackingError(status.error)
              : STATE_LABEL[state] ?? state}
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
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Volume backing track</Text>
        <View style={styles.volumeRow}>
          <Pressable onPress={() => bt.setVolume(bt.volume - 0.1)} accessibilityRole="button" style={styles.smallButton}>
            <Text style={styles.smallText}>-</Text>
          </Pressable>
          <View style={styles.volumeBar}>
            <TapBar fraction={bt.volume} onChange={bt.setVolume} />
          </View>
          <Pressable onPress={() => bt.setVolume(bt.volume + 0.1)} accessibilityRole="button" style={styles.smallButton}>
            <Text style={styles.smallText}>+</Text>
          </Pressable>
        </View>
        <View style={styles.timeRow}>
          <Text style={styles.detail}>{Math.round(bt.volume * 100)}%</Text>
          <Pressable onPress={bt.toggleMute} accessibilityRole="switch" accessibilityState={{ checked: bt.muted }} style={[styles.chip, bt.muted && styles.chipOn]}>
            <Text style={[styles.chipText, bt.muted && styles.chipTextOn]}>{bt.muted ? 'Mute: aktif' : 'Mute: mati'}</Text>
          </Pressable>
        </View>
        <MeterBars meter={bt.meter} onReset={bt.resetClip} />
        <Text style={styles.note}>
          Level diukur pada sinyal yang dikirim ke output setelah volume dan mute diterapkan. Batang merah berarti puncak di atas -3 dBFS (konvensi tampilan). "Sampel di batas penuh" menghitung sampel yang tepat di 0 dBFS dan terus bertambah sampai Anda menekan Reset.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Output</Text>
        <Pressable
          onPress={() => bt.selectOutput(-1)}
          accessibilityRole="radio"
          accessibilityState={{ selected: bt.outputId < 0 }}
          style={[styles.option, bt.outputId < 0 && styles.optionOn]}>
          <Text style={[styles.optionText, bt.outputId < 0 && styles.optionTextOn]}>Default sistem Android</Text>
        </Pressable>
        {bt.devices.map(d => (
          <View key={d.id} style={styles.deviceGroup}>
            <Pressable
              onPress={() => bt.selectOutput(d.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: bt.outputId === d.id }}
              style={[styles.option, bt.outputId === d.id && styles.optionOn]}>
              <Text style={[styles.optionText, bt.outputId === d.id && styles.optionTextOn]}>
                {d.name || describeOutputType(d.type)} ({describeOutputType(d.type)})
              </Text>
            </Pressable>
            {bt.outputId === d.id && outputWarning(d) !== null ? (
              <Text style={styles.warn}>{outputWarning(d)}</Text>
            ) : null}
          </View>
        ))}
        <Text style={styles.detail}>
          Terarah ke: {routedName !== null ? routedName : playing ? 'belum diketahui' : 'diketahui saat memutar'}
        </Text>
        <Text style={styles.note}>
          Pilihan di atas hanya preferensi: Android bisa memakai rute lain. "Terarah ke" menunjukkan rute yang benar-benar dipakai.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
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
  warn: { color: colors.accent, fontSize: 12, lineHeight: 17, marginTop: 4 },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  time: { color: colors.ink, fontSize: 13, fontWeight: '600' },
  stateText: { color: colors.accent, fontSize: 12, fontWeight: '700', flexShrink: 1, textAlign: 'center' },
  tapBar: { height: 22, justifyContent: 'center', backgroundColor: colors.surfaceRaised, borderRadius: 11, overflow: 'hidden' },
  tapFill: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: colors.accent, opacity: 0.8 },
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  smallButton: { borderColor: colors.accent, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  smallText: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  playButton: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 22, paddingVertical: 12 },
  playText: { color: colors.background, fontSize: 15, fontWeight: '700' },
  volumeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  volumeBar: { flex: 1 },
  chip: { borderColor: colors.border, borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { borderColor: colors.record, backgroundColor: colors.surfaceRaised },
  chipText: { color: colors.inkMuted, fontSize: 12, fontWeight: '700' },
  chipTextOn: { color: colors.record },
  deviceGroup: { gap: 0 },
  option: { borderColor: colors.border, borderWidth: 1, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 },
  optionOn: { borderColor: colors.accent, backgroundColor: colors.surfaceRaised },
  optionText: { color: colors.inkMuted, fontSize: 13 },
  optionTextOn: { color: colors.ink, fontWeight: '600' },
});