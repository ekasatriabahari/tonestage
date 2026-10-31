import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  bandLabel,
  DEFAULT_EQ,
  type EqBand,
  type EqSettings,
  EXAMPLE_GUITAR_SPACE,
  formatFreq,
  responseCurve,
  stepFrequency,
  stepGain,
  stepQ,
} from '../native/eq';
import { colors } from '../theme/colors';

type Props = { eq: EqSettings; onChange: (eq: EqSettings) => void };

const CURVE_POINTS = 40;
const CURVE_HEIGHT = 64;
const CURVE_RANGE_DB = 12; // the curve area shows -12 dB to +12 dB

function Stepper({
  label,
  value,
  onMinus,
  onPlus,
  disabled,
}: {
  label: string;
  value: string;
  onMinus: () => void;
  onPlus: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={[styles.stepper, disabled && styles.dim]}>
      <Text style={styles.stepLabel}>{label}</Text>
      <Pressable onPress={onMinus} disabled={disabled} accessibilityRole="button" style={styles.stepButton}>
        <Text style={styles.stepText}>-</Text>
      </Pressable>
      <Text style={styles.stepValue}>{value}</Text>
      <Pressable onPress={onPlus} disabled={disabled} accessibilityRole="button" style={styles.stepButton}>
        <Text style={styles.stepText}>+</Text>
      </Pressable>
    </View>
  );
}

/** Equalizer for the backing track. Shows the response that the native filter really applies. */
export function EqPanel({ eq, onChange }: Props) {
  const curve = responseCurve(eq, CURVE_POINTS);
  const mid = CURVE_HEIGHT / 2;

  const setBand = (index: number, patch: Partial<EqBand>) => {
    onChange({ ...eq, bands: eq.bands.map((b, i) => (i === index ? { ...b, ...patch } : b)) });
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>EQ backing track</Text>
        <Pressable
          onPress={() => onChange({ ...eq, enabled: !eq.enabled })}
          accessibilityRole="switch"
          accessibilityState={{ checked: eq.enabled }}
          style={[styles.chip, eq.enabled && styles.chipOn]}>
          <Text style={[styles.chipText, eq.enabled && styles.chipTextOn]}>
            {eq.enabled ? 'EQ: aktif' : 'EQ: bypass'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.curve}>
        <View style={[styles.zeroLine, { top: mid }]} />
        {curve.map(point => {
          const clipped = Math.max(-CURVE_RANGE_DB, Math.min(CURVE_RANGE_DB, point.db));
          const h = Math.max(1, (Math.abs(clipped) / CURVE_RANGE_DB) * mid);
          return (
            <View key={point.freq} style={styles.column}>
              <View
                style={[
                  styles.curveBar,
                  { height: h, top: clipped < 0 ? mid : mid - h, backgroundColor: clipped < 0 ? colors.accent : colors.success },
                ]}
              />
            </View>
          );
        })}
      </View>
      <View style={styles.axis}>
        <Text style={styles.axisText}>20 Hz</Text>
        <Text style={styles.axisText}>200 Hz</Text>
        <Text style={styles.axisText}>2 kHz</Text>
        <Text style={styles.axisText}>20 kHz</Text>
      </View>
      <Text style={styles.small}>Skala kurva: -12 dB sampai +12 dB (garis tengah = 0 dB).</Text>

      {eq.bands.map((band, index) => (
        <View key={index} style={styles.band}>
          <View style={styles.headerRow}>
            <Text style={styles.bandTitle}>{bandLabel(band, index)}</Text>
            <Pressable
              onPress={() => setBand(index, { enabled: !band.enabled })}
              accessibilityRole="switch"
              accessibilityState={{ checked: band.enabled }}
              style={[styles.chip, band.enabled && styles.chipOn]}>
              <Text style={[styles.chipText, band.enabled && styles.chipTextOn]}>{band.enabled ? 'aktif' : 'mati'}</Text>
            </Pressable>
          </View>
          <Stepper
            label="Frekuensi"
            value={formatFreq(band.freq)}
            onMinus={() => setBand(index, { freq: stepFrequency(band.freq, -1) })}
            onPlus={() => setBand(index, { freq: stepFrequency(band.freq, 1) })}
          />
          {band.kind === 'peak' ? (
            <>
              <Stepper
                label="Gain"
                value={`${band.gainDb > 0 ? '+' : ''}${band.gainDb.toFixed(1)} dB`}
                onMinus={() => setBand(index, { gainDb: stepGain(band.gainDb, -0.5) })}
                onPlus={() => setBand(index, { gainDb: stepGain(band.gainDb, 0.5) })}
              />
              <Stepper
                label="Lebar (Q)"
                value={band.q.toFixed(1)}
                onMinus={() => setBand(index, { q: stepQ(band.q, -0.1) })}
                onPlus={() => setBand(index, { q: stepQ(band.q, 0.1) })}
              />
            </>
          ) : null}
        </View>
      ))}

      <View style={styles.presetRow}>
        <Pressable onPress={() => onChange(EXAMPLE_GUITAR_SPACE)} accessibilityRole="button" style={styles.actionButton}>
          <Text style={styles.actionText}>Contoh: beri ruang untuk gitar</Text>
        </Pressable>
        <Pressable onPress={() => onChange(DEFAULT_EQ)} accessibilityRole="button" style={styles.actionButton}>
          <Text style={styles.actionText}>Reset</Text>
        </Pressable>
      </View>
      <Text style={styles.small}>
        EQ hanya untuk backing track; rekaman gitar bersih tidak disentuh. Contoh di atas hanya titik awal, bukan aturan: seberapa
        dalam dan di mana memotong bergantung pada lagu dan suara gitar Anda, jadi atur dengan telinga dan bandingkan dengan
        tombol bypass. Menaikkan (boost) pita bisa menyebabkan clipping, jadi perhatikan meter.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  chip: { borderColor: colors.border, borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.surfaceRaised },
  chipText: { color: colors.inkMuted, fontSize: 12, fontWeight: '700' },
  chipTextOn: { color: colors.accent },
  curve: { height: CURVE_HEIGHT, flexDirection: 'row', backgroundColor: colors.surfaceRaised, borderRadius: 8, overflow: 'hidden' },
  zeroLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: colors.border },
  column: { flex: 1 },
  curveBar: { position: 'absolute', left: 1, right: 1, borderRadius: 1 },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
  axisText: { color: colors.inkMuted, fontSize: 10 },
  small: { color: colors.inkMuted, fontSize: 11, lineHeight: 16 },
  band: { backgroundColor: colors.surfaceRaised, borderRadius: 10, padding: 10, gap: 6 },
  bandTitle: { color: colors.ink, fontSize: 13, fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dim: { opacity: 0.4 },
  stepLabel: { color: colors.inkMuted, fontSize: 12, width: 78 },
  stepButton: { borderColor: colors.accent, borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  stepText: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  stepValue: { color: colors.ink, fontSize: 13, fontWeight: '600', minWidth: 84, textAlign: 'center' },
  presetRow: { flexDirection: 'row', gap: 8 },
  actionButton: { flex: 1, borderColor: colors.accent, borderWidth: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  actionText: { color: colors.accent, fontSize: 12, fontWeight: '700' },
});