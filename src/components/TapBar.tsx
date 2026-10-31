import { useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import { colors } from '../theme/colors';

/** A thin bar you tap to choose a value (0 to 1). */
export function TapBar({
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
      style={[styles.bar, disabled && styles.disabled]}>
      <View style={[styles.fill, { width: fill }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { height: 22, justifyContent: 'center', backgroundColor: colors.surfaceRaised, borderRadius: 11, overflow: 'hidden' },
  fill: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: colors.accent, opacity: 0.8 },
  disabled: { opacity: 0.4 },
});