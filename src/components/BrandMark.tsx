import { StyleSheet, View } from 'react-native';
import { colors } from '../theme/colors';

// Bar heights relative to the mark size, matching the waveform in the splash logo.
const BAR_HEIGHTS = [0.22, 0.4, 0.58, 0.34, 0.18];
const CENTER_BAR = 2;

type Props = { size?: number };

/** Small in-app version of the ToneStage logo (waveform + record dot), built from plain Views. */
export function BrandMark({ size = 44 }: Props) {
  const barWidth = Math.max(2, Math.round(size * 0.08));
  const dot = Math.max(4, Math.round(size * 0.14));

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="Logo ToneStage"
      style={[
        styles.badge,
        { width: size, height: size, borderRadius: size * 0.28 },
      ]}>
      <View
        style={[
          styles.dot,
          { width: dot, height: dot, borderRadius: dot / 2, top: size * 0.12 },
        ]}
      />
      <View style={[styles.bars, { gap: barWidth, marginTop: size * 0.12 }]}>
        {BAR_HEIGHTS.map((h, i) => (
          <View
            key={i}
            style={{
              width: barWidth,
              height: size * h,
              borderRadius: barWidth / 2,
              backgroundColor: i === CENTER_BAR ? colors.accent : colors.ink,
            }}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: colors.surface,
    borderColor: colors.accent,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    backgroundColor: colors.record,
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});