import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { BrandMark } from './BrandMark';

export function BrandHeader() {
  return (
    <View style={styles.row}>
      <BrandMark size={44} />
      <View style={styles.texts}>
        <Text style={styles.name}>ToneStage</Text>
        <Text style={styles.tagline}>Your Sound. Your Stage.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  texts: { flexShrink: 1 },
  name: { color: colors.ink, fontSize: 24, fontWeight: '700', letterSpacing: 0.3 },
  tagline: { color: colors.inkMuted, fontSize: 13, marginTop: 2 },
});