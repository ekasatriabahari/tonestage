import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AudioInputDevice } from '../native/audioDevices';
import {
  describeAudioTestError,
  formatDbfs,
  type ProbeEntry,
  type RecordResult,
} from '../native/audioProbe';
import {
  exportAudioTest,
  playAudioTest,
  probeAudioInput,
  recordAudioTest,
  stopAudioTestPlayback,
} from '../native/audioTest';
import { colors } from '../theme/colors';

const RECORD_SECONDS = 5;

type Props = { device: AudioInputDevice };

function channelLevels(label: string, values: number[]): string {
  if (values.length === 0) {
    return `${label}: -`;
  }
  return `${label}: ${values.map((v, i) => `K${i + 1} ${formatDbfs(v)}`).join(' | ')}`;
}

/**
 * Hardware test for a USB audio input. Everything shown comes from a real attempt to open the
 * device; nothing is assumed about its format, channels or routing.
 */
export function SpmTestPanel({ device }: Props) {
  const [busy, setBusy] = useState<'probe' | 'record' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [entries, setEntries] = useState<ProbeEntry[] | null>(null);
  const [recording, setRecording] = useState<RecordResult | null>(null);
  const [playing, setPlaying] = useState(false);
  const [savedTo, setSavedTo] = useState<string | null>(null);

  const runProbe = async () => {
    setBusy('probe');
    setMessage(null);
    setRecording(null);
    const result = await probeAudioInput(device.id);
    if (result.ok) {
      setEntries(result.entries);
    } else {
      setEntries(null);
      setMessage(result.message);
    }
    setBusy(null);
  };

  const runRecord = async (entry: ProbeEntry) => {
    setBusy('record');
    setMessage(null);
    setPlaying(false);
    setSavedTo(null);
    await stopAudioTestPlayback();
    const result = await recordAudioTest(
      device.id,
      entry.sampleRate,
      entry.channels,
      RECORD_SECONDS,
    );
    if (result.ok) {
      setRecording(result.result);
      if (!result.result.ok) {
        setMessage(describeAudioTestError(result.result.error));
      }
    } else {
      setMessage(result.message);
    }
    setBusy(null);
  };

  const togglePlayback = async () => {
    if (recording === null || recording.path === '') {
      return;
    }
    if (playing) {
      await stopAudioTestPlayback();
      setPlaying(false);
      return;
    }
    const started = await playAudioTest(recording.path);
    setPlaying(started);
    if (!started) {
      setMessage('Rekaman tidak dapat diputar.');
    }
  };

  const saveToDownloads = async () => {
    if (recording === null || recording.path === '') {
      return;
    }
    setMessage(null);
    const result = await exportAudioTest(recording.path);
    if (result.ok) {
      setSavedTo(result.location);
    } else {
      setMessage(result.message);
    }
  };

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Uji perekaman SPM</Text>
      <Text style={styles.help}>
        Sambungkan gitar ke SPM, lalu petik gitar terus-menerus selama uji berjalan. Pilihan
        pengaturan di bawah muncul dari hasil percobaan nyata ke perangkat ini.
      </Text>

      <Pressable
        onPress={runProbe}
        disabled={busy !== null}
        accessibilityRole="button"
        style={[styles.button, busy !== null && styles.buttonDisabled]}>
        <Text style={styles.buttonText}>
          {busy === 'probe' ? 'Menguji... petik gitar terus' : '1. Uji pengaturan input (±6 detik)'}
        </Text>
      </Pressable>

      {message !== null ? <Text style={styles.error}>{message}</Text> : null}

      {entries !== null ? (
        <View style={styles.list}>
          {entries.length === 0 ? (
            <Text style={styles.help}>Tidak ada hasil dari perangkat.</Text>
          ) : null}
          {entries.map(e => (
            <View key={`${e.sampleRate}-${e.channels}`} style={styles.row}>
              <Text style={styles.rowTitle}>
                {e.sampleRate} Hz, {e.channels === 1 ? 'mono' : 'stereo'}:{' '}
                <Text style={e.ok ? styles.ok : styles.fail}>
                  {e.ok ? 'berhasil dibuka' : 'gagal'}
                </Text>
              </Text>
              {e.ok ? (
                <>
                  <Text style={styles.detail}>
                    Dipakai Android: {e.actualSampleRate} Hz, {e.actualChannels} kanal, sumber{' '}
                    {e.source}
                  </Text>
                  <Text style={styles.detail}>
                    Terarah ke perangkat ini: {e.routedToSelected ? 'ya' : 'TIDAK'}
                  </Text>
                  <Text style={styles.detail}>{channelLevels('Puncak', e.peaks)}</Text>
                  <Pressable
                    onPress={() => runRecord(e)}
                    disabled={busy !== null}
                    accessibilityRole="button"
                    style={[styles.smallButton, busy !== null && styles.buttonDisabled]}>
                    <Text style={styles.smallButtonText}>
                      {busy === 'record'
                        ? 'Merekam...'
                        : `2. Rekam ${RECORD_SECONDS} detik dengan pengaturan ini`}
                    </Text>
                  </Pressable>
                </>
              ) : (
                <Text style={styles.detail}>{describeAudioTestError(e.error)}</Text>
              )}
            </View>
          ))}
        </View>
      ) : null}

      {recording !== null && recording.ok ? (
        <View style={styles.row}>
          <Text style={styles.rowTitle}>Hasil rekaman uji</Text>
          <Text style={styles.detail}>
            {recording.sampleRate} Hz, {recording.channels} kanal, sumber {recording.source},{' '}
            {recording.frames} frame
          </Text>
          <Text style={styles.detail}>{channelLevels('Puncak', recording.peaks)}</Text>
          <Text style={styles.detail}>{channelLevels('RMS', recording.rms)}</Text>
          <Text style={styles.detail}>
            Terpotong (clipping): {recording.clipped.map((c, i) => `K${i + 1} ${c}`).join(' | ')}
          </Text>
          <Text style={styles.path}>{recording.path}</Text>
          <Pressable
            onPress={togglePlayback}
            accessibilityRole="button"
            style={styles.smallButton}>
            <Text style={styles.smallButtonText}>{playing ? 'Berhenti' : 'Putar rekaman'}</Text>
          </Pressable>
          <Pressable
            onPress={saveToDownloads}
            accessibilityRole="button"
            style={styles.smallButton}>
            <Text style={styles.smallButtonText}>Simpan ke folder Unduhan</Text>
          </Pressable>
          {savedTo !== null ? (
            <Text style={styles.ok}>
              Tersimpan: {savedTo}. Buka lewat aplikasi file manager ponsel.
            </Text>
          ) : null}
          <Text style={styles.help}>
            Suara bisa keluar dari output SPM (headphone SPM), bukan speaker ponsel, karena
            Android dapat mengarahkan output ke perangkat USB.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  title: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  help: { color: colors.inkMuted, fontSize: 12, lineHeight: 17 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 18 },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.background, fontSize: 14, fontWeight: '700' },
  list: { gap: 8 },
  row: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: 10,
    padding: 10,
    gap: 3,
  },
  rowTitle: { color: colors.ink, fontSize: 13, fontWeight: '600' },
  ok: { color: colors.success },
  fail: { color: colors.danger },
  detail: { color: colors.inkMuted, fontSize: 12, lineHeight: 17 },
  path: { color: colors.inkMuted, fontSize: 10 },
  smallButton: {
    backgroundColor: colors.background,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  smallButtonText: { color: colors.accent, fontSize: 13, fontWeight: '700' },
});