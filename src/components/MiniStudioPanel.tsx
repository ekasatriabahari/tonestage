import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TapBar } from './TapBar';
import type { BackingTrack } from '../hooks/useBackingTrack';
import { useAudioInputs } from '../hooks/useAudioInputs';
import { formatClock } from '../native/backingTrackLogic';
import { colors } from '../theme/colors';

function LevelControl({
  label,
  value,
  onChange,
  muted,
  onToggleMute,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  muted?: boolean;
  onToggleMute?: () => void;
}) {
  return (
    <View style={styles.level}>
      <View style={styles.levelHeader}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{Math.round(value * 100)}%</Text>
      </View>
      <View style={styles.levelRow}>
        <View style={styles.bar}>
          <TapBar fraction={value} onChange={onChange} />
        </View>
        {onToggleMute ? (
          <Pressable
            onPress={onToggleMute}
            accessibilityRole="switch"
            accessibilityState={{ checked: muted === true }}
            style={[styles.mute, muted && styles.muteOn]}>
            <Text style={[styles.muteText, muted && styles.muteTextOn]}>{muted ? 'Mute' : 'Suara'}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** Compact controls for the camera-first Mini Studio screen. */
export function MiniStudioPanel({ backing, active }: { backing: BackingTrack; active: boolean }) {
  const { state: inputs } = useAudioInputs(active);
  const usb = inputs.kind === 'ready' ? inputs.devices.find(device => device.isUsb) : undefined;
  const status = backing.status;
  const playing = status?.state === 'playing';
  const duration = backing.loaded?.durationMs ?? 0;
  const position = status?.positionMs ?? 0;

  return (
    <View style={styles.card}>
      <View style={styles.statusRow}>
        <View style={[styles.dot, { backgroundColor: usb ? colors.success : colors.inkMuted }]} />
        <View style={styles.statusText}>
          <Text style={styles.title}>Input gitar / SPM</Text>
          <Text style={styles.detail}>
            {inputs.kind === 'loading'
              ? 'Memeriksa perangkat audio...'
              : inputs.kind === 'error'
                ? inputs.message
                : usb
                  ? `${usb.name || 'Perangkat USB'} terdeteksi`
                  : 'SPM belum terdeteksi. Sambungkan melalui USB OTG.'}
          </Text>
        </View>
      </View>

      <View style={styles.divider} />
      <View style={styles.trackHeader}>
        <View style={styles.trackInfo}>
          <Text style={styles.title}>Backing track</Text>
          <Text numberOfLines={1} style={styles.detail}>
            {backing.loaded?.name ?? 'Belum ada file — pilih di tab Backing'}
          </Text>
        </View>
        <Text style={styles.time}>{formatClock(position)} / {formatClock(duration)}</Text>
      </View>
      <TapBar
        fraction={duration > 0 ? position / duration : 0}
        onChange={fraction => backing.seekTo(fraction * duration)}
        disabled={duration <= 0}
      />
      <View style={styles.transport}>
        <Pressable onPress={backing.stop} disabled={!backing.loaded} style={styles.transportButton}>
          <Text style={styles.transportText}>Stop</Text>
        </Pressable>
        <Pressable
          onPress={playing ? backing.pause : backing.play}
          disabled={!backing.loaded}
          style={[styles.playButton, !backing.loaded && styles.disabled]}>
          <Text style={styles.playText}>{playing ? 'Jeda backing' : 'Putar backing'}</Text>
        </Pressable>
      </View>

      <View style={styles.divider} />
      <Text style={styles.title}>Mixer cepat</Text>
      <LevelControl label="Volume gitar" value={backing.guitarVolume} onChange={backing.setGuitarVolume} muted={backing.guitarMuted} onToggleMute={backing.toggleGuitarMute} />
      <LevelControl label="Volume backing" value={backing.volume} onChange={backing.setVolume} muted={backing.muted} onToggleMute={backing.toggleMute} />
      <LevelControl label="Master backing" value={backing.masterVolume} onChange={backing.setMasterVolume} />
      <Text style={styles.note}>Volume dan mute hanya memengaruhi hasil campuran export. File WAV gitar mentah tetap bersih.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  statusText: { flex: 1, gap: 2 },
  title: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  detail: { color: colors.inkMuted, fontSize: 12, lineHeight: 17 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 2 },
  trackHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  trackInfo: { flex: 1, gap: 2 },
  time: { color: colors.ink, fontSize: 11, fontWeight: '600' },
  transport: { flexDirection: 'row', gap: 8 },
  transportButton: { borderColor: colors.accent, borderWidth: 1, borderRadius: 9, paddingHorizontal: 16, paddingVertical: 10 },
  transportText: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  playButton: { flex: 1, backgroundColor: colors.accent, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  playText: { color: colors.background, fontSize: 12, fontWeight: '700' },
  disabled: { opacity: 0.4 },
  level: { gap: 5 },
  levelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { color: colors.inkMuted, fontSize: 12, fontWeight: '600' },
  value: { color: colors.ink, fontSize: 12, fontWeight: '700' },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bar: { flex: 1 },
  mute: { minWidth: 62, borderColor: colors.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, alignItems: 'center' },
  muteOn: { borderColor: colors.record, backgroundColor: colors.surfaceRaised },
  muteText: { color: colors.inkMuted, fontSize: 11, fontWeight: '700' },
  muteTextOn: { color: colors.record },
  note: { color: colors.inkMuted, fontSize: 11, lineHeight: 16 },
});
