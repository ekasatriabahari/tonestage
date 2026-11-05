import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandHeader } from '../components/BrandHeader';
import type { SessionsState } from '../hooks/useSessions';
import {
  describeStage,
  estimateRecordMinutes,
  formatBytes,
  formatDateTime,
  OFFSET_MAX_MS,
  OFFSET_MIN_MS,
  summarizeSession,
} from '../native/session';
import { isSessionsAvailable } from '../native/sessions';
import { colors } from '../theme/colors';

const STEPS = [-100, -10, -5, -1, 1, 5, 10, 100];

function Offset({
  label,
  help,
  value,
  onChange,
  disabled,
}: {
  label: string;
  help: string;
  value: number;
  onChange: (ms: number) => void;
  disabled: boolean;
}) {
  return (
    <View style={styles.offset}>
      <Text style={styles.subtitle}>
        {label}: {value} ms
      </Text>
      <View style={styles.stepRow}>
        {STEPS.map(step => (
          <Pressable key={step} onPress={() => onChange(value + step)} disabled={disabled} accessibilityRole="button" style={[styles.stepButton, disabled && styles.disabled]}>
            <Text style={styles.stepText}>{step > 0 ? `+${step}` : `${step}`}</Text>
          </Pressable>
        ))}
        <Pressable onPress={() => onChange(0)} disabled={disabled} accessibilityRole="button" style={[styles.stepButton, disabled && styles.disabled]}>
          <Text style={styles.stepText}>0</Text>
        </Pressable>
      </View>
      <Text style={styles.note}>{help}</Text>
    </View>
  );
}

/** Recorded sessions: export to MP4 (again, with other offsets, as often as needed) and clean up. */
export function ProjectsScreen({
  sessions,
  defaults,
  onSaveDefaults,
}: {
  sessions: SessionsState;
  defaults: { videoLatencyMs: number; backingOffsetMs: number };
  onSaveDefaults: (videoLatencyMs: number, backingOffsetMs: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const busy = sessions.exportingId !== null;

  // First tap asks "sure?", second tap deletes.
  const tapDelete = (kind: 'raw' | 'all', id: string) => {
    const key = `${kind}:${id}`;
    if (confirm === key) {
      setConfirm(null);
      if (kind === 'raw') {
        sessions.deleteRaw(id);
      } else {
        sessions.deleteSession(id);
      }
    } else {
      setConfirm(key);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}>
      <BrandHeader />
      <Text style={styles.libraryTitle}>{selectedId === null ? 'Project Library' : 'Project Detail'}</Text>
      {selectedId !== null ? (
        <Pressable onPress={() => setSelectedId(null)} accessibilityRole="button" style={styles.secondary}>
          <Text style={styles.secondaryText}>Kembali ke Library</Text>
        </Pressable>
      ) : (
        <Text style={styles.note}>{sessions.sessions.length} project tersimpan di perangkat ini.</Text>
      )}
      {!isSessionsAvailable() ? <Text style={styles.error}>Modul sesi tidak tersedia di build ini.</Text> : null}
      {sessions.storage !== null ? (
        <Text style={styles.note}>
          Ruang kosong: {formatBytes(sessions.storage.availableBytes)} dari {formatBytes(sessions.storage.totalBytes)} (sekitar{' '}
          {estimateRecordMinutes(sessions.storage.availableBytes)} menit rekaman; perkiraan).
        </Text>
      ) : null}
      <Pressable onPress={sessions.refresh} accessibilityRole="button" style={styles.secondary}>
        <Text style={styles.secondaryText}>Muat ulang daftar</Text>
      </Pressable>
      {sessions.sessions.length === 0 ? <Text style={styles.note}>Belum ada sesi. Rekam di tab Kamera.</Text> : null}

      {sessions.sessions.filter(session => selectedId === null || session.id === selectedId).map(session => {
        const options = sessions.optionsFor(session.id);
        const thisExport = sessions.exportingId === session.id;
        const result = sessions.results[session.id];
        const error = sessions.errors[session.id];
        const saved = sessions.saved[session.id];
        const canExport = session.status === 'complete' && session.manifest !== null && !session.rawDeleted && !busy;
        const hasBacking = session.manifest !== null && typeof session.manifest.backing === 'object' && session.manifest.backing !== null;
        return (
          <View key={session.id} style={styles.card}>
            <Pressable onPress={() => setSelectedId(session.id)} accessibilityRole="button" style={styles.projectHeader}>
              {session.thumbnailPath !== '' ? (
                <Image source={{ uri: `file://${session.thumbnailPath}` }} style={styles.thumbnail} />
              ) : (
                <View style={[styles.thumbnail, styles.thumbnailEmpty]}>
                  <Text style={styles.thumbnailEmptyText}>TS</Text>
                </View>
              )}
              <View style={styles.projectHeading}>
                <Text style={styles.title}>Guitar Cover</Text>
                <Text style={styles.detail}>{formatDateTime(session.createdMs)}</Text>
                <Text style={[styles.status, session.status === 'complete' ? styles.statusComplete : styles.statusWarning]}>
                  {session.status === 'complete' ? 'Project siap' : session.status === 'interrupted' ? 'Rekaman terputus — raw dipertahankan' : session.status === 'recording' ? 'Sedang merekam' : 'Perlu pemulihan'}
                </Text>
              </View>
              <Text style={styles.openProject}>›</Text>
            </Pressable>
            {summarizeSession(session).map(line => (
              <Text key={line} style={styles.detail}>
                {line}
              </Text>
            ))}

            {session.status === 'complete' && session.manifest !== null && !session.rawDeleted ? (
              <>
                <Offset
                  label="Penundaan video"
                  help="Untuk GAMBAR vs SUARA (semua audio sekaligus). Jika suara tepukan terdengar LEBIH DULU daripada gerak tangan, naikkan; jika lebih lambat, turunkan. Ini tidak mengubah selisih gitar vs backing track."
                  value={options.videoLatencyMs}
                  onChange={ms => sessions.setOption(session.id, { videoLatencyMs: ms })}
                  disabled={busy}
                />
                {hasBacking ? (
                  <>
                    <Offset
                      label="Geser backing track"
                      help="Untuk GITAR vs BACKING TRACK. Jika backing track terdengar lebih awal dari gitar, naikkan (backing digeser lebih lambat); jika lebih lambat, turunkan. Jeda SPM (USB masuk dan keluar) biasanya tetap, jadi cukup dicari sekali."
                      value={options.backingOffsetMs}
                      onChange={ms => sessions.setOption(session.id, { backingOffsetMs: ms })}
                      disabled={busy}
                    />
                    <Pressable
                      onPress={() => sessions.setOption(session.id, { includeBacking: !options.includeBacking })}
                      disabled={busy}
                      accessibilityRole="switch"
                      accessibilityState={{ checked: options.includeBacking }}
                      style={[styles.chip, options.includeBacking && styles.chipOn]}>
                      <Text style={[styles.chipText, options.includeBacking && styles.chipTextOn]}>
                        {options.includeBacking ? 'Backing track: ikut diekspor' : 'Backing track: tidak diikutkan'}
                      </Text>
                    </Pressable>
                  </>
                ) : null}
                <Text style={styles.note}>
                  Rentang geser {OFFSET_MIN_MS} sampai {OFFSET_MAX_MS} ms. Bawaan tersimpan: video {defaults.videoLatencyMs} ms, backing {defaults.backingOffsetMs} ms.
                </Text>
                <Pressable
                  onPress={() => onSaveDefaults(options.videoLatencyMs, options.backingOffsetMs)}
                  disabled={busy}
                  accessibilityRole="button"
                  style={[styles.secondary, busy && styles.disabled]}>
                  <Text style={styles.secondaryText}>Simpan angka ini sebagai bawaan</Text>
                </Pressable>
                <Pressable onPress={() => sessions.exportOne(session.id)} disabled={!canExport} accessibilityRole="button" style={[styles.primary, !canExport && styles.disabled]}>
                  <Text style={styles.primaryText}>{thisExport ? 'Mengekspor...' : session.exports.length > 0 ? 'Ekspor ulang MP4' : 'Ekspor MP4'}</Text>
                </Pressable>
              </>
            ) : null}

            {thisExport && sessions.progress !== null ? (
              <View style={styles.progress}>
                <Text style={styles.detail}>
                  {describeStage(sessions.progress.stage)} ({sessions.progress.percent}%)
                </Text>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${sessions.progress.percent}%` }]} />
                </View>
                <Pressable onPress={sessions.cancel} accessibilityRole="button" style={styles.secondary}>
                  <Text style={styles.secondaryText}>Batalkan</Text>
                </Pressable>
              </View>
            ) : null}

            {error !== undefined && error !== '' ? <Text style={styles.error}>{error}</Text> : null}
            {result !== undefined ? (
              <Text style={styles.ok}>
                Ekspor selesai: {(result.durationMs / 1000).toFixed(1)} dtk, {formatBytes(result.bytes)}.{' '}
                {result.gainReductionDb < 0
                  ? `Campuran terlalu keras, dikecilkan ${Math.abs(result.gainReductionDb).toFixed(1)} dB agar tidak terpotong.`
                  : 'Tidak ada pengecilan level yang diperlukan.'}
              </Text>
            ) : null}

            {session.exports.map(e => (
              <View key={e.path} style={styles.exportRow}>
                <Text style={styles.detail}>
                  {e.name} ({formatBytes(e.bytes)})
                </Text>
                <Pressable onPress={() => sessions.saveFile(session.id, e.path)} accessibilityRole="button" style={styles.secondary}>
                  <Text style={styles.secondaryText}>Simpan ke Unduhan</Text>
                </Pressable>
              </View>
            ))}
            {saved !== undefined ? <Text style={styles.ok}>Tersimpan: {saved}. Buka lewat file manager.</Text> : null}

            <View style={styles.dangerRow}>
              {!session.rawDeleted && session.manifest !== null ? (
                <Pressable
                  onPress={() => tapDelete('raw', session.id)}
                  disabled={busy}
                  accessibilityRole="button"
                  style={[styles.danger, busy && styles.disabled]}>
                  <Text style={styles.dangerText}>{confirm === `raw:${session.id}` ? 'Yakin? Ketuk lagi' : 'Hapus file mentah'}</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => tapDelete('all', session.id)}
                disabled={busy}
                accessibilityRole="button"
                style={[styles.danger, busy && styles.disabled]}>
                <Text style={styles.dangerText}>{confirm === `all:${session.id}` ? 'Yakin? Ketuk lagi' : 'Hapus sesi'}</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  libraryTitle: { color: colors.ink, fontSize: 22, fontWeight: '800' },
  content: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 },
  projectHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumbnail: { width: 112, height: 72, borderRadius: 9, backgroundColor: colors.surfaceRaised },
  thumbnailEmpty: { alignItems: 'center', justifyContent: 'center' },
  thumbnailEmptyText: { color: colors.accent, fontSize: 24, fontWeight: '800' },
  projectHeading: { flex: 1, gap: 4 },
  openProject: { color: colors.accent, fontSize: 28, fontWeight: '600' },
  status: { fontSize: 11, fontWeight: '700' },
  statusComplete: { color: colors.success },
  statusWarning: { color: colors.record },
  title: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  subtitle: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  detail: { color: colors.inkMuted, fontSize: 12, lineHeight: 17, flexShrink: 1 },
  note: { color: colors.inkMuted, fontSize: 11, lineHeight: 16 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 18 },
  ok: { color: colors.success, fontSize: 12, lineHeight: 17 },
  disabled: { opacity: 0.4 },
  offset: { gap: 6 },
  stepRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stepButton: { borderColor: colors.accent, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  stepText: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  chip: { alignSelf: 'flex-start', borderColor: colors.border, borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.surfaceRaised },
  chipText: { color: colors.inkMuted, fontSize: 12, fontWeight: '700' },
  chipTextOn: { color: colors.accent },
  primary: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  primaryText: { color: colors.background, fontSize: 14, fontWeight: '700' },
  secondary: { borderColor: colors.accent, borderWidth: 1, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, alignItems: 'center' },
  secondaryText: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  progress: { gap: 6 },
  track: { height: 10, backgroundColor: colors.surfaceRaised, borderRadius: 5, overflow: 'hidden' },
  fill: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: colors.accent },
  exportRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  dangerRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  danger: { flex: 1, borderColor: colors.record, borderWidth: 1, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  dangerText: { color: colors.record, fontSize: 12, fontWeight: '700' },
});