import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandHeader } from '../components/BrandHeader';
import { colors } from '../theme/colors';

export type SettingsPage = 'audio' | 'backing' | 'mixer' | 'sync' | 'about' | null;

const ITEMS: { id: Exclude<SettingsPage, null>; icon: string; title: string; description: string }[] = [
  { id: 'audio', icon: '⌁', title: 'USB Audio', description: 'Deteksi perangkat USB dan uji input gitar' },
  { id: 'backing', icon: '♫', title: 'Backing Track', description: 'Pemutar dan pengaturan sumber backing' },
  { id: 'mixer', icon: '☷', title: 'Mixer & EQ', description: 'Level gitar, EQ, output, dan monitoring' },
  { id: 'sync', icon: '⟷', title: 'Audio Sync', description: 'Kalibrasi sinkronisasi audio dan video' },
  { id: 'about', icon: 'ⓘ', title: 'About Tone Stage', description: 'Informasi aplikasi, versi, dan pengembang' },
];

export function SettingsScreen({ onOpen }: { onOpen: (page: Exclude<SettingsPage, null>) => void }) {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}>
      <BrandHeader />
      <Text style={styles.heading}>Settings</Text>
      <Text style={styles.intro}>Pengaturan perangkat, audio, dan recording Tone Stage.</Text>
      {ITEMS.map(item => (
        <Pressable key={item.id} onPress={() => onOpen(item.id)} accessibilityRole="button" style={styles.item}>
          <View style={styles.iconBox}><Text style={styles.icon}>{item.icon}</Text></View>
          <View style={styles.itemText}>
            <Text style={styles.itemTitle}>{item.title}</Text>
            <Text style={styles.itemDescription}>{item.description}</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      ))}
      <View style={styles.footer}>
        <Text style={styles.footerTitle}>TONE STAGE</Text>
        <Text style={styles.footerText}>Capture your sound. Create your stage.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 16, paddingBottom: 28, gap: 12 },
  heading: { color: colors.ink, fontSize: 24, fontWeight: '800', marginTop: 4 },
  intro: { color: colors.inkMuted, fontSize: 13, lineHeight: 19, marginBottom: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 14 },
  iconBox: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  icon: { color: colors.accent, fontSize: 24, fontWeight: '700' },
  itemText: { flex: 1, gap: 3 },
  itemTitle: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  itemDescription: { color: colors.inkMuted, fontSize: 11, lineHeight: 16 },
  chevron: { color: colors.inkMuted, fontSize: 26, fontWeight: '300' },
  footer: { alignItems: 'center', paddingTop: 24, gap: 4 },
  footerTitle: { color: colors.inkMuted, fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  footerText: { color: colors.inkMuted, fontSize: 11 },
});
