import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandHeader } from '../components/BrandHeader';
import { colors } from '../theme/colors';

const PLANNED = ['Virtual pedal board', 'Amp & cabinet simulation', 'Effect chain and presets'];

export function PedalBoardScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 16 }]}>
      <BrandHeader />
      <View style={styles.content}>
        <View style={styles.logoCircle}>
          <Text style={styles.logo}>♫</Text>
          <View style={styles.spark}><Text style={styles.sparkText}>✦</Text></View>
        </View>
        <Text style={styles.eyebrow}>TONESTAGE LABS</Text>
        <Text style={styles.title}>Your sound. Your stage.</Text>
        <Text style={styles.subtitle}>Pedal Board sedang dipersiapkan.</Text>
        <Text style={styles.description}>
          Ubah ToneStage menjadi pedalboard digital. Rangkai efek gitar, bentuk karakter amplifier, dan simpan tone favoritmu langsung dari ponsel.
        </Text>
        <View style={styles.featureList}>
          {PLANNED.map((feature, index) => (
            <View key={feature} style={styles.feature}>
              <Text style={styles.featureMark}>✦</Text>
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}
        </View>
        <View style={styles.comingSoon}>
          <Text style={styles.comingSoonText}>COMING SOON</Text>
        </View>
        <Text style={styles.note}>Fitur recording dan project tetap bisa digunakan seperti biasa.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 16 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, paddingBottom: 28 },
  logoCircle: { width: 112, height: 112, borderRadius: 56, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  logo: { color: colors.accent, fontSize: 58, fontWeight: '800' },
  spark: { position: 'absolute', right: 12, top: 12, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  sparkText: { color: colors.accent, fontSize: 15 },
  eyebrow: { color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 3, marginBottom: 10 },
  title: { color: colors.ink, fontSize: 25, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: colors.accent, fontSize: 15, fontWeight: '700', marginTop: 10 },
  description: { color: colors.inkMuted, fontSize: 13, lineHeight: 21, textAlign: 'center', marginTop: 14, maxWidth: 320 },
  featureList: { alignSelf: 'stretch', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, gap: 12, marginTop: 22 },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureMark: { color: colors.accent, fontSize: 15 },
  featureText: { color: colors.ink, fontSize: 12, fontWeight: '600' },
  comingSoon: { borderWidth: 1, borderColor: colors.accent, borderRadius: 20, paddingHorizontal: 22, paddingVertical: 9, marginTop: 22 },
  comingSoonText: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  note: { color: colors.inkMuted, fontSize: 10, textAlign: 'center', marginTop: 16 },
});
