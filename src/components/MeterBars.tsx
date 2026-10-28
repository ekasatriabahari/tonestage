import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  clipCount,
  levelFraction,
  levelZone,
  METER_FLOOR_DB,
  type MeterChannel,
  type MeterState,
  type MeterZone,
} from '../native/audioMeter';
import { formatDbfs } from '../native/audioProbe';
import { colors } from '../theme/colors';

const ZONE_COLOR: Record<MeterZone, string> = {
  ok: colors.success,
  warm: colors.accent,
  hot: colors.record,
};

function dbText(db: number): string {
  return db <= METER_FLOOR_DB ? 'senyap' : formatDbfs(Math.pow(10, db / 20));
}

function Bar({ label, channel }: { label: string; channel: MeterChannel }) {
  const fill = `${(levelFraction(channel.db) * 100).toFixed(1)}%` as const;
  const hold = `${(levelFraction(channel.holdDb) * 100).toFixed(1)}%` as const;
  return (
    <View style={styles.channel}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: fill, backgroundColor: ZONE_COLOR[levelZone(channel.db)] }]} />
        <View style={[styles.hold, { left: hold }]} />
      </View>
      <Text style={styles.value}>{dbText(channel.holdDb)}</Text>
    </View>
  );
}

/** Level bars (peak, held peak, clipping) for any source that produces a MeterState. */
export function MeterBars({
  meter,
  onReset,
}: {
  meter: MeterState | null;
  onReset?: () => void;
}) {
  if (meter === null || meter.channels.length === 0) {
    return null;
  }
  const clips = clipCount(meter);
  return (
    <View style={styles.wrap}>
      {meter.channels.map((c, i) => (
        <Bar key={i} label={`K${i + 1}`} channel={c} />
      ))}
      <View style={styles.clipRow}>
        <Text style={[styles.clip, clips > 0 && styles.clipHot]}>
          {clips > 0 ? `Sampel di batas penuh: ${clips} (sejak mulai/reset)` : 'Tidak ada sampel di batas penuh'}
        </Text>
        {clips > 0 && onReset !== undefined ? (
          <Pressable onPress={onReset} accessibilityRole="button" style={styles.resetButton}>
            <Text style={styles.resetText}>Reset</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  channel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { color: colors.ink, fontSize: 12, fontWeight: '700', width: 24 },
  track: {
    flex: 1,
    height: 12,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 6,
    overflow: 'hidden',
  },
  fill: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  hold: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: colors.ink },
  value: { color: colors.inkMuted, fontSize: 12, width: 78, textAlign: 'right' },
  clipRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  clip: { color: colors.inkMuted, fontSize: 12, flexShrink: 1 },
  resetButton: { borderColor: colors.record, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4 },
  resetText: { color: colors.record, fontSize: 12, fontWeight: '700' },
  clipHot: { color: colors.record, fontWeight: '700' },
});