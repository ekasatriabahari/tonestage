import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { BrandMark } from '../components/BrandMark';
import { colors } from '../theme/colors';

// Keep these values aligned with versionName and versionCode in android/app/build.gradle.
const APP_VERSION = '1.0';
const APP_BUILD = '1';
const APP_AUTHOR = 'Eka Satria Bahari';

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

export function AboutScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.brand}>
        <BrandMark size={88} />
        <Text style={styles.appName}>Tone Stage</Text>
        <Text style={styles.tagline}>Your Sound. Your Stage.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>App Information</Text>
        <InfoRow label="Version" value={APP_VERSION} />
        <View style={styles.separator} />
        <InfoRow label="Build" value={APP_BUILD} />
        <View style={styles.separator} />
        <InfoRow label="Package" value="com.tonestage.app" />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Credits</Text>
        <InfoRow label="Author" value={APP_AUTHOR} />
        <View style={styles.separator} />
        <InfoRow label="Platform" value="Android" />
      </View>

      <Text style={styles.copyright}>© {new Date().getFullYear()} Tone Stage</Text>
      <Text style={styles.footer}>Capture your sound. Create your stage.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32, gap: 14 },
  brand: { alignItems: 'center', paddingTop: 12, paddingBottom: 12, gap: 7 },
  appName: { color: colors.ink, fontSize: 25, fontWeight: '800', letterSpacing: 0.4, marginTop: 5 },
  tagline: { color: colors.inkMuted, fontSize: 12 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 6 },
  sectionTitle: { color: colors.accent, fontSize: 13, fontWeight: '800', paddingVertical: 10 },
  infoRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  label: { color: colors.inkMuted, fontSize: 13 },
  value: { color: colors.ink, fontSize: 13, fontWeight: '600', textAlign: 'right', flexShrink: 1 },
  separator: { height: 1, backgroundColor: colors.border },
  copyright: { color: colors.inkMuted, fontSize: 11, textAlign: 'center', marginTop: 8 },
  footer: { color: colors.inkMuted, fontSize: 11, textAlign: 'center' },
});
