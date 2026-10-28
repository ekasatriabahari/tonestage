import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAudioMeter } from '../hooks/useAudioMeter';
import type { AudioInputDevice } from '../native/audioDevices';
import {
  clipCount,
  levelFraction,
  levelZone,
  METER_FLOOR_DB,
  type MeterChannel,
  type MeterZone,
} from '../native/audioMeter';
import { formatDbfs } from '../native/audioProbe';
import { colors } from '../theme/colors';

type Props = { device: AudioInputDevice; active: boolean; testOnly?: boolean };

const ZONE_COLOR: Record<MeterZone, string> = {
  ok: colors.success,
  warm: colors.accent,
  hot: colors.record,
};

function dbText(db: number): string {
  return db <= METER_FLOOR_DB ? 'senyap' : formatDbfs(Math.pow(10, db / 20));
}

function ChannelBar({ label, channel }: { label: string; channel: MeterChannel }) {
  const fill = `${(levelFraction(channel.db) * 100).toFixed(1)}%` as const;
  const hold = `${(levelFraction(channel.holdDb) * 100).toFixed(1)}%` as const;
  return (
    <View style={styles.channel}>
      <Text style={styles.channelLabel}>{label}</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: fill, backgroundColor: ZONE_COLOR[levelZone(channel.db)] }]} />
        <View style={[styles.holdMark, { left: hold }]} />
      </View>
      <View style={styles.values}>
        <Text style={styles.valueMain}>{dbText(channel.holdDb)}</Text>
        <Text style={styles.valueSub}>RMS {dbText(channel.rmsDb)}</Text>
      </View>
    </View>
  );
}

/**
 * Live level meter for a USB input. It reads the real input and records nothing to a file.
 * Zones are a display convention: yellow from -12 dBFS, red from -3 dBFS.
 */
export function LevelMeterPanel({ device, active, testOnly = false }: Props) {
  const { status, meter, start, stop, resetClip } = useAudioMeter(device.id, active);
  const running = status.kind === 'running';
  const clips = meter === null ? 0 : clipCount(meter);

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Meter level langsung</Text>
      {testOnly ? (
        <Text style={styles.warn}>
          Hanya untuk menguji meter tanpa SPM. Mikrofon ponsel bukan input gitar.
        </Text>
      ) : null}
      <Text style={styles.help}>
        Menampilkan level sebenarnya dari perangkat ini dan tidak merekam ke file. Skala: kosong di
        -60 dBFS, penuh di 0 dBFS. Garis putih menahan puncak selama sekitar 1,5 detik.
      </Text>

      <Pressable
        onPress={running ? stop : start}
        disabled={status.kind === 'starting'}
        accessibilityRole="button"
        style={[styles.button, status.kind === 'starting' && styles.buttonDisabled]}>
        <Text style={styles.buttonText}>
          {status.kind === 'starting'
            ? 'Memulai...'
            : running
              ? 'Hentikan meter'
              : 'Mulai meter'}
        </Text>
      </Pressable>

      {status.kind === 'error' ? <Text style={styles.error}>{status.message}</Text> : null}

      {running ? (
        <Text style={styles.help}>
          Dipakai Android: {status.sampleRate} Hz, {status.channels} kanal, sumber {status.source}.
          Terarah ke perangkat ini: {status.routedToSelected ? 'ya' : 'belum terkonfirmasi'}.
        </Text>
      ) : null}

      {running && meter !== null ? (
        <View style={styles.bars}>
          {meter.channels.map((c, i) => (
            <ChannelBar key={i} label={`K${i + 1}`} channel={c} />
          ))}
          <View style={styles.clipRow}>
            <Text style={[styles.clipText, clips > 0 && styles.clipTextHot]}>
              {clips > 0 ? `CLIPPING: ${clips} sampel` : 'Tidak ada clipping'}
            </Text>
            {clips > 0 ? (
              <Pressable onPress={resetClip} accessibilityRole="button" style={styles.resetButton}>
                <Text style={styles.resetText}>Reset</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  title: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  help: { color: colors.inkMuted, fontSize: 12, lineHeight: 17 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 18 },
  warn: { color: colors.accent, fontSize: 12, lineHeight: 17 },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.background, fontSize: 14, fontWeight: '700' },
  bars: { gap: 10 },
  channel: { gap: 4 },
  channelLabel: { color: colors.ink, fontSize: 12, fontWeight: '700' },
  track: {
    height: 14,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 7,
    overflow: 'hidden',
  },
  fill: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  holdMark: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: colors.ink },
  values: { flexDirection: 'row', justifyContent: 'space-between' },
  valueMain: { color: colors.ink, fontSize: 13, fontWeight: '600' },
  valueSub: { color: colors.inkMuted, fontSize: 12 },
  clipRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  clipText: { color: colors.inkMuted, fontSize: 13 },
  clipTextHot: { color: colors.record, fontWeight: '700' },
  resetButton: {
    borderColor: colors.record,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  resetText: { color: colors.record, fontSize: 12, fontWeight: '700' },
});