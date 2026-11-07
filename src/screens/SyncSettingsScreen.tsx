import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BrandHeader } from '../components/BrandHeader';
import { OFFSET_MAX_MS, OFFSET_MIN_MS } from '../native/session';
import { colors } from '../theme/colors';

const STEPS = [-100, -10, -5, -1, 1, 5, 10, 100];

function OffsetControl({
  title,
  description,
  value,
  onChange,
}: {
  title: string;
  description: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.value}>{value > 0 ? '+' : ''}{value} ms</Text>
      <View style={styles.steps}>
        {STEPS.map(step => (
          <Pressable key={step} onPress={() => onChange(value + step)} style={styles.step}>
            <Text style={styles.stepText}>{step > 0 ? '+' : ''}{step}</Text>
          </Pressable>
        ))}
        <Pressable onPress={() => onChange(0)} style={styles.step}>
          <Text style={styles.stepText}>Reset</Text>
        </Pressable>
      </View>
      <Text style={styles.note}>{description}</Text>
    </View>
  );
}

/** Global defaults for future sessions. Existing sessions retain their own manifest offsets. */
export function SyncSettingsScreen({
  defaults,
  onSave,
}: {
  defaults: { videoLatencyMs: number; backingOffsetMs: number };
  onSave: (videoLatencyMs: number, backingOffsetMs: number) => void;
}) {
  const [videoLatencyMs, setVideoLatencyMs] = useState(defaults.videoLatencyMs);
  const [backingOffsetMs, setBackingOffsetMs] = useState(defaults.backingOffsetMs);

  const clamp = (value: number) => Math.min(OFFSET_MAX_MS, Math.max(OFFSET_MIN_MS, Math.round(value)));
  const changed = videoLatencyMs !== defaults.videoLatencyMs || backingOffsetMs !== defaults.backingOffsetMs;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: 16 }]}>
      <BrandHeader />
      <Text style={styles.heading}>Sinkronisasi</Text>
      <Text style={styles.intro}>Nilai di sini menjadi bawaan untuk sesi rekaman baru. Sesi lama tetap memakai kalibrasi masing-masing.</Text>

      <OffsetControl
        title="Video latency"
        value={videoLatencyMs}
        onChange={value => setVideoLatencyMs(clamp(value))}
        description="Menggeser posisi gambar terhadap seluruh audio. Naikkan jika gambar tertinggal dari suara."
      />
      <OffsetControl
        title="Backing offset"
        value={backingOffsetMs}
        onChange={value => setBackingOffsetMs(clamp(value))}
        description="Menggeser backing terhadap gitar. Nilai positif menunda backing. Baseline hasil tes perangkat: +100 ms."
      />
      <Text style={styles.note}>Rentang pengaturan: {OFFSET_MIN_MS} hingga +{OFFSET_MAX_MS} ms. Offset diterapkan saat export; WAV gitar mentah tidak diubah.</Text>
      <Pressable
        onPress={() => onSave(videoLatencyMs, backingOffsetMs)}
        disabled={!changed}
        accessibilityRole="button"
        style={[styles.save, !changed && styles.disabled]}>
        <Text style={styles.saveText}>Simpan sebagai bawaan</Text>
      </Pressable>
      <Pressable
        onPress={() => { setVideoLatencyMs(0); setBackingOffsetMs(100); }}
        style={styles.reset}>
        <Text style={styles.resetText}>Kembalikan ke baseline (+100 ms)</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 16, paddingBottom: 24, gap: 14 },
  heading: { color: colors.ink, fontSize: 20, fontWeight: '800' },
  intro: { color: colors.inkMuted, fontSize: 13, lineHeight: 19 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  title: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  value: { color: colors.accent, fontSize: 24, fontWeight: '800' },
  steps: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  step: { borderColor: colors.accent, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  stepText: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  note: { color: colors.inkMuted, fontSize: 11, lineHeight: 16 },
  save: { backgroundColor: colors.accent, borderRadius: 10, alignItems: 'center', paddingVertical: 13 },
  saveText: { color: colors.background, fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.4 },
  reset: { alignItems: 'center', paddingVertical: 8 },
  resetText: { color: colors.inkMuted, fontSize: 12, fontWeight: '600' },
});
