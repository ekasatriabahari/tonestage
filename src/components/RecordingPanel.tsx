import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CombinedRecording } from '../hooks/useCombinedRecording';
import {
  LATENCY_MAX_MS,
  LATENCY_MIN_MS,
  summarizeAudioCapture,
  summarizeMerge,
} from '../native/avRecording';
import { summarizeRecording } from '../native/yiVideo';
import { colors } from '../theme/colors';

type Props = { rec: CombinedRecording };

function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

const STEPS = [-100, -10, 10, 100];

/** Records video (and optionally audio) together, then merges them into one MP4. */
export function RecordingPanel({ rec }: Props) {
  const [now, setNow] = useState(Date.now());
  const recording = rec.phase === 'recording';

  useEffect(() => {
    if (!recording) {
      return undefined;
    }
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [recording]);

  const idleLike = rec.phase === 'idle' || rec.phase === 'finished' || rec.phase === 'error';
  const canPress = idleLike ? rec.videoReady : rec.phase !== 'stopping';
  const active = rec.phase === 'starting' || rec.phase === 'recording';
  const label =
    rec.phase === 'recording'
      ? `Berhenti rekam (${clock(now - rec.since)})`
      : rec.phase === 'starting'
        ? 'Menunggu keyframe... (ketuk untuk batal)'
        : rec.phase === 'stopping'
          ? 'Menyelesaikan...'
          : rec.includeAudio
            ? 'Rekam video + audio'
            : 'Rekam video saja';

  return (
    <View style={styles.wrap}>
      <View style={styles.optionRow}>
        <Pressable
          onPress={() => rec.setIncludeAudio(!rec.includeAudio)}
          disabled={!idleLike}
          accessibilityRole="switch"
          accessibilityState={{ checked: rec.includeAudio }}
          style={[styles.chip, rec.includeAudio && styles.chipOn, !idleLike && styles.disabled]}>
          <Text style={[styles.chipText, rec.includeAudio && styles.chipTextOn]}>
            {rec.includeAudio ? 'Audio: ya' : 'Audio: tidak'}
          </Text>
        </Pressable>
        <Text style={styles.help}>
          {rec.audioChoice !== null && rec.includeAudio
            ? rec.audioChoice.isUsb
              ? `Sumber: ${rec.audioChoice.name} (USB)`
              : `Sumber: ${rec.audioChoice.name} (mikrofon ponsel, hanya untuk uji)`
            : 'Sumber: perangkat USB bila ada, jika tidak mikrofon ponsel'}
        </Text>
      </View>

      <Pressable
        onPress={active ? rec.stop : rec.start}
        disabled={!canPress}
        accessibilityRole="button"
        style={[styles.recordButton, active && styles.recordButtonActive, !canPress && styles.disabled]}>
        <Text style={[styles.recordText, active && styles.recordTextActive]}>{label}</Text>
      </Pressable>

      {rec.message !== null ? <Text style={styles.error}>{rec.message}</Text> : null}
      {rec.audioError !== null ? <Text style={styles.error}>Audio: {rec.audioError}</Text> : null}

      {rec.videoStats !== null || rec.audioResult !== null ? (
        <View style={styles.result}>
          <Text style={styles.resultTitle}>Hasil rekaman</Text>

          {rec.videoStats !== null ? (
            <>
              <Text style={styles.sectionLabel}>Video</Text>
              {summarizeRecording(rec.videoStats).map(line => (
                <Text key={line} style={styles.line}>
                  {line}
                </Text>
              ))}
            </>
          ) : null}

          {rec.audioResult !== null ? (
            <>
              <Text style={styles.sectionLabel}>Audio</Text>
              {summarizeAudioCapture(rec.audioResult).map(line => (
                <Text key={line} style={styles.line}>
                  {line}
                </Text>
              ))}
            </>
          ) : null}

          {rec.videoStats !== null && rec.audioResult !== null ? (
            <>
              <Text style={styles.sectionLabel}>Gabungan</Text>
              {rec.merging ? <Text style={styles.line}>Menggabungkan...</Text> : null}
              {rec.merge !== null
                ? summarizeMerge(rec.merge).map(line => (
                    <Text key={line} style={styles.line}>
                      {line}
                    </Text>
                  ))
                : null}

              <Text style={styles.help}>
                Penundaan video: seberapa lambat gambar dibanding suaranya (jeda kamera dan Wi-Fi).
                Jika di hasil gabungan suara tepukan terdengar LEBIH DULU daripada gerak tangan,
                naikkan nilainya. Jika terdengar lebih lambat, turunkan. Rekaman mentah disimpan,
                jadi Anda bisa menggabungkan ulang tanpa merekam lagi.
              </Text>
              <Text style={styles.latency}>{rec.latencyMs} ms</Text>
              <View style={styles.stepRow}>
                {STEPS.map(step => (
                  <Pressable
                    key={step}
                    onPress={() => rec.adjustLatency(step)}
                    disabled={rec.merging}
                    accessibilityRole="button"
                    style={[styles.stepButton, rec.merging && styles.disabled]}>
                    <Text style={styles.stepText}>{step > 0 ? `+${step}` : `${step}`}</Text>
                  </Pressable>
                ))}
                <Pressable
                  onPress={() => rec.setLatency(0)}
                  disabled={rec.merging}
                  accessibilityRole="button"
                  style={[styles.stepButton, rec.merging && styles.disabled]}>
                  <Text style={styles.stepText}>0</Text>
                </Pressable>
              </View>
              <Text style={styles.small}>
                Rentang {LATENCY_MIN_MS} sampai {LATENCY_MAX_MS} ms.
              </Text>

              <Pressable
                onPress={rec.remerge}
                disabled={rec.merging}
                accessibilityRole="button"
                style={[styles.actionButton, rec.merging && styles.disabled]}>
                <Text style={styles.actionText}>
                  {rec.merging ? 'Menggabungkan...' : `Gabungkan ulang (${rec.latencyMs} ms)`}
                </Text>
              </Pressable>
            </>
          ) : null}

          <Pressable onPress={rec.saveAll} accessibilityRole="button" style={styles.actionButton}>
            <Text style={styles.actionText}>Simpan semua ke folder Unduhan</Text>
          </Pressable>
          {rec.saved.map(location => (
            <Text key={location} style={styles.saved}>
              Tersimpan: {location}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chip: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.surfaceRaised },
  chipText: { color: colors.inkMuted, fontSize: 12, fontWeight: '700' },
  chipTextOn: { color: colors.accent },
  help: { color: colors.inkMuted, fontSize: 12, lineHeight: 17, flexShrink: 1 },
  disabled: { opacity: 0.4 },
  recordButton: {
    borderColor: colors.record,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  recordButtonActive: { backgroundColor: colors.record },
  recordText: { color: colors.record, fontSize: 14, fontWeight: '700' },
  recordTextActive: { color: colors.ink },
  error: { color: colors.danger, fontSize: 13, lineHeight: 18 },
  result: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 4,
  },
  resultTitle: { color: colors.ink, fontSize: 15, fontWeight: '700', marginBottom: 2 },
  sectionLabel: { color: colors.accent, fontSize: 12, fontWeight: '700', marginTop: 8 },
  line: { color: colors.inkMuted, fontSize: 12, lineHeight: 17 },
  latency: { color: colors.ink, fontSize: 20, fontWeight: '700', textAlign: 'center', marginTop: 6 },
  stepRow: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  stepButton: {
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  stepText: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  small: { color: colors.inkMuted, fontSize: 10, textAlign: 'center' },
  actionButton: {
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  actionText: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  saved: { color: colors.success, fontSize: 11, lineHeight: 16 },
});