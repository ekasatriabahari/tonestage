import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CombinedRecording } from '../hooks/useCombinedRecording';
import { summarizeAudioCapture } from '../native/avRecording';
import { estimateRecordMinutes, formatBytes } from '../native/session';
import { summarizeRecording } from '../native/yiVideo';
import { colors } from '../theme/colors';

type Props = { rec: CombinedRecording };

function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Records the camera video and the clean guitar into one session. Export is done in the Proyek tab. */
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
          ? 'Menyimpan sesi...'
          : 'Rekam sesi (video + gitar)';

  return (
    <View style={styles.wrap}>
      <Text style={styles.help}>
        Sumber gitar: perangkat USB bila ada; jika tidak, mikrofon ponsel (hanya untuk uji).
        {rec.audioChoice !== null ? ` Dipakai: ${rec.audioChoice.name}${rec.audioChoice.isUsb ? ' (USB)' : ' (mikrofon ponsel)'}.` : ''}
      </Text>
      {rec.storage !== null ? (
        <Text style={styles.help}>
          Ruang kosong: {formatBytes(rec.storage.availableBytes)} (sekitar {estimateRecordMinutes(rec.storage.availableBytes)} menit rekaman; perkiraan, ekspor butuh ruang tambahan).
        </Text>
      ) : null}

      <Pressable
        onPress={active ? rec.stop : rec.start}
        disabled={!canPress}
        accessibilityRole="button"
        style={[styles.recordButton, active && styles.recordButtonActive, !canPress && styles.disabled]}>
        <Text style={[styles.recordText, active && styles.recordTextActive]}>{label}</Text>
      </Pressable>

      {rec.message !== null ? <Text style={styles.error}>{rec.message}</Text> : null}
      {rec.audioError !== null ? <Text style={styles.error}>Audio: {rec.audioError}</Text> : null}

      {rec.phase === 'finished' && rec.videoStats !== null ? (
        <View style={styles.result}>
          <Text style={styles.resultTitle}>Sesi tersimpan</Text>
          <Text style={styles.saved}>Buka tab Proyek untuk mengekspor MP4. File mentah tetap aman sampai Anda menghapusnya.</Text>
          <Text style={styles.sectionLabel}>Video</Text>
          {summarizeRecording(rec.videoStats).map(line => (
            <Text key={line} style={styles.line}>{line}</Text>
          ))}
          {rec.audioResult !== null ? (
            <>
              <Text style={styles.sectionLabel}>Gitar</Text>
              {summarizeAudioCapture(rec.audioResult).map(line => (
                <Text key={line} style={styles.line}>{line}</Text>
              ))}
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  help: { color: colors.inkMuted, fontSize: 12, lineHeight: 17 },
  disabled: { opacity: 0.4 },
  recordButton: { borderColor: colors.record, borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  recordButtonActive: { backgroundColor: colors.record },
  recordText: { color: colors.record, fontSize: 14, fontWeight: '700' },
  recordTextActive: { color: colors.ink },
  error: { color: colors.danger, fontSize: 13, lineHeight: 18 },
  result: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 14, gap: 4 },
  resultTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  saved: { color: colors.success, fontSize: 12, lineHeight: 17 },
  sectionLabel: { color: colors.accent, fontSize: 12, fontWeight: '700', marginTop: 8 },
  line: { color: colors.inkMuted, fontSize: 12, lineHeight: 17 },
});