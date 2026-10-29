import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandHeader } from '../components/BrandHeader';
import { EqPanel } from '../components/EqPanel';
import { MeterBars } from '../components/MeterBars';
import { OutputPicker } from '../components/OutputPicker';
import { TapBar } from '../components/TapBar';
import { useAudioInputs } from '../hooks/useAudioInputs';
import { useAudioMeter } from '../hooks/useAudioMeter';
import type { BackingTrack } from '../hooks/useBackingTrack';
import { describeDeviceType } from '../native/audioDevices';
import { describeOutputType, formatClock } from '../native/backingTrackLogic';
import { describeSimultaneousIo, monitoringNotes } from '../native/mixerLogic';
import { colors } from '../theme/colors';

type Props = { bt: BackingTrack; active: boolean };

function VolumeRow({
  volume,
  muted,
  onVolume,
  onToggleMute,
  muteLabel,
}: {
  volume: number;
  muted: boolean;
  onVolume: (v: number) => void;
  onToggleMute?: () => void;
  muteLabel?: string;
}) {
  return (
    <View style={styles.gap}>
      <View style={styles.volumeRow}>
        <Pressable onPress={() => onVolume(volume - 0.1)} accessibilityRole="button" style={styles.smallButton}>
          <Text style={styles.smallText}>-</Text>
        </Pressable>
        <View style={styles.volumeBar}>
          <TapBar fraction={volume} onChange={onVolume} />
        </View>
        <Pressable onPress={() => onVolume(volume + 0.1)} accessibilityRole="button" style={styles.smallButton}>
          <Text style={styles.smallText}>+</Text>
        </Pressable>
      </View>
      <View style={styles.rowBetween}>
        <Text style={styles.detail}>{Math.round(volume * 100)}%</Text>
        {onToggleMute !== undefined ? (
          <Pressable
            onPress={onToggleMute}
            accessibilityRole="switch"
            accessibilityState={{ checked: muted }}
            style={[styles.chip, muted && styles.chipOn]}>
            <Text style={[styles.chipText, muted && styles.chipTextOn]}>{muted ? `${muteLabel ?? 'Mute'}: aktif` : `${muteLabel ?? 'Mute'}: mati`}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Mixer: guitar (USB input), backing track, and master/monitor output. The levels of the guitar
 * are the levels of the SOURCE, as they are recorded. The mixer volume, mute and EQ never change the
 * clean guitar recording.
 */
export function MixerScreen({ bt, active }: Props) {
  const insets = useSafeAreaInsets();
  const { state: inputs } = useAudioInputs(active);
  const usb = inputs.kind === 'ready' ? inputs.devices.find(d => d.isUsb) : undefined;
  const guitar = useAudioMeter(usb === undefined ? -1 : usb.id, active);
  const guitarRunning = guitar.status.kind === 'running';

  const status = bt.status;
  const playing = status !== null && status.state === 'playing';
  const routed =
    status !== null && status.routedDeviceId >= 0 ? bt.devices.find(d => d.id === status.routedDeviceId) : undefined;
  const routedName = status !== null && status.routedDeviceId >= 0 ? status.routedDeviceName || `ID ${status.routedDeviceId}` : null;
  const routedIsUsb = routed !== undefined && routed.isUsb;

  const io = describeSimultaneousIo({
    inputRunning: guitarRunning,
    inputIsUsb: usb !== undefined,
    outputPlaying: playing,
    routedName,
    routedIsUsb,
  });
  const notes = monitoringNotes(bt.avgLatency, routed === undefined ? null : routed.type, routedIsUsb);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}>
      <BrandHeader />

      {/* ---- Guitar ------------------------------------------------------------------------- */}
      <View style={styles.card}>
        <Text style={styles.title}>Gitar (input USB)</Text>
        <Text style={styles.detail}>
          {usb === undefined
            ? 'Tidak ada perangkat USB terdeteksi. Sambungkan SPM dengan kabel OTG.'
            : `${usb.name || 'Perangkat USB'} (${describeDeviceType(usb.type)})`}
        </Text>
        <Pressable
          onPress={guitarRunning ? guitar.stop : guitar.start}
          disabled={usb === undefined || guitar.status.kind === 'starting'}
          accessibilityRole="button"
          style={[styles.primary, (usb === undefined || guitar.status.kind === 'starting') && styles.disabled]}>
          <Text style={styles.primaryText}>
            {guitar.status.kind === 'starting' ? 'Memulai...' : guitarRunning ? 'Hentikan meter gitar' : 'Mulai meter gitar'}
          </Text>
        </Pressable>
        {guitar.status.kind === 'error' ? <Text style={styles.error}>{guitar.status.message}</Text> : null}
        {guitar.status.kind === 'running' ? (
          <Text style={styles.detail}>
            Dipakai Android: {guitar.status.sampleRate} Hz, {guitar.status.channels} kanal, sumber {guitar.status.source}. Terarah ke
            perangkat ini: {guitar.status.routedToSelected ? 'ya' : 'belum terkonfirmasi'}.
          </Text>
        ) : null}
        <MeterBars meter={guitarRunning ? guitar.meter : null} onReset={guitar.resetClip} />
        <Text style={styles.note}>
          Level ini adalah level SUMBER (yang akan direkam) dan tidak terpengaruh volume atau mute di bawah. Mute dan volume gitar
          hanya memengaruhi campuran ekspor nanti, bukan file rekaman gitar bersih.
        </Text>
        <Text style={styles.subtitle}>Volume gitar di campuran</Text>
        <VolumeRow
          volume={bt.guitarVolume}
          muted={bt.guitarMuted}
          onVolume={bt.setGuitarVolume}
          onToggleMute={bt.toggleGuitarMute}
        />
      </View>

      {/* ---- Backing track ---------------------------------------------------------------------- */}
      <View style={styles.card}>
        <Text style={styles.title}>Backing track</Text>
        <Text style={styles.detail}>
          {bt.loaded === null
            ? 'Belum ada file. Pilih di tab Backing.'
            : `${bt.loaded.name} | ${formatClock(status === null ? 0 : status.positionMs)} / ${formatClock(bt.loaded.durationMs)}`}
        </Text>
        <Text style={styles.subtitle}>Volume</Text>
        <VolumeRow volume={bt.volume} muted={bt.muted} onVolume={bt.setVolume} onToggleMute={bt.toggleMute} />
        <MeterBars meter={bt.meter} onReset={bt.resetClip} />
        <Text style={styles.note}>
          Level diukur setelah EQ, volume, dan master. Batang merah berarti puncak di atas -3 dBFS (konvensi tampilan). "Sampel di
          batas penuh" menghitung sampel tepat di 0 dBFS sampai Anda menekan Reset.
        </Text>
        <EqPanel eq={bt.eq} onChange={bt.setEq} />
      </View>

      {/* ---- Master / monitor ----------------------------------------------------------------------- */}
      <View style={styles.card}>
        <Text style={styles.title}>Master dan output pemantauan</Text>
        <Text style={styles.subtitle}>Volume master (output backing track)</Text>
        <VolumeRow volume={bt.masterVolume} muted={false} onVolume={bt.setMasterVolume} />
        <Text style={styles.subtitle}>Output</Text>
        <OutputPicker devices={bt.devices} selectedId={bt.outputId} onSelect={bt.selectOutput} />
        <Text style={styles.detail}>
          Terarah ke:{' '}
          {routedName !== null
            ? `${routedName}${routed !== undefined ? ` (${describeOutputType(routed.type)})` : ''}`
            : playing
              ? 'belum diketahui'
              : 'diketahui saat memutar'}
        </Text>
        <Text style={styles.note}>
          Pilihan output hanya preferensi: Android bisa memakai rute lain. "Terarah ke" menunjukkan rute yang benar-benar dipakai.
        </Text>

        <Text style={styles.subtitle}>Input dan output bersamaan</Text>
        <Text style={[styles.detail, io.level === 'ok' && styles.ok]}>{io.text}</Text>

        <Text style={styles.subtitle}>Catatan pemantauan</Text>
        {notes.map(note => (
          <Text key={note.text} style={note.level === 'warn' ? styles.warn : styles.detail}>
            {note.text}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 },
  title: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  subtitle: { color: colors.accent, fontSize: 12, fontWeight: '700', marginTop: 6 },
  gap: { gap: 6 },
  detail: { color: colors.inkMuted, fontSize: 12, lineHeight: 17 },
  note: { color: colors.inkMuted, fontSize: 11, lineHeight: 16 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 18 },
  warn: { color: colors.accent, fontSize: 12, lineHeight: 17 },
  ok: { color: colors.success },
  primary: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  primaryText: { color: colors.background, fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.4 },
  volumeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  volumeBar: { flex: 1 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  smallButton: { borderColor: colors.accent, borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  smallText: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  chip: { borderColor: colors.border, borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { borderColor: colors.record, backgroundColor: colors.surfaceRaised },
  chipText: { color: colors.inkMuted, fontSize: 12, fontWeight: '700' },
  chipTextOn: { color: colors.record },
});