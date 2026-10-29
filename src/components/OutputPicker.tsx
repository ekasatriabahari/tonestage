import { Pressable, StyleSheet, Text, View } from 'react-native';
import { describeOutputType, type OutputDevice, outputWarning } from '../native/backingTrackLogic';
import { colors } from '../theme/colors';

type Props = {
  devices: OutputDevice[];
  selectedId: number;
  onSelect: (id: number) => void;
};

/** Lists the outputs Android reports. The choice is a preference; the real route is shown elsewhere. */
export function OutputPicker({ devices, selectedId, onSelect }: Props) {
  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => onSelect(-1)}
        accessibilityRole="radio"
        accessibilityState={{ selected: selectedId < 0 }}
        style={[styles.option, selectedId < 0 && styles.optionOn]}>
        <Text style={[styles.text, selectedId < 0 && styles.textOn]}>Default sistem Android</Text>
      </Pressable>
      {devices.map(d => (
        <View key={d.id}>
          <Pressable
            onPress={() => onSelect(d.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected: selectedId === d.id }}
            style={[styles.option, selectedId === d.id && styles.optionOn]}>
            <Text style={[styles.text, selectedId === d.id && styles.textOn]}>
              {d.name || describeOutputType(d.type)} ({describeOutputType(d.type)})
            </Text>
          </Pressable>
          {selectedId === d.id && outputWarning(d) !== null ? (
            <Text style={styles.warn}>{outputWarning(d)}</Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  option: { borderColor: colors.border, borderWidth: 1, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 },
  optionOn: { borderColor: colors.accent, backgroundColor: colors.surfaceRaised },
  text: { color: colors.inkMuted, fontSize: 13 },
  textOn: { color: colors.ink, fontWeight: '600' },
  warn: { color: colors.accent, fontSize: 12, lineHeight: 17, marginTop: 4 },
});