import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandHeader } from '../components/BrandHeader';
import { LevelMeterPanel } from '../components/LevelMeterPanel';
import { SpmTestPanel } from '../components/SpmTestPanel';
import { useAudioInputs } from '../hooks/useAudioInputs';
import {
  type AudioInputDevice,
  describeDeviceType,
  formatChannels,
  formatEncodings,
  formatSampleRates,
  isRateListed,
  splitDevices,
} from '../native/audioDevices';
import { colors } from '../theme/colors';

type Props = { active: boolean };

function RateLine({ rates, rate }: { rates: number[]; rate: number }) {
  const listed = isRateListed(rates, rate);
  if (listed === null) {
    return null;
  }
  return (
    <Text style={styles.detail}>
      {rate} Hz: {listed ? 'tercantum' : 'tidak tercantum'}
    </Text>
  );
}

function DeviceCard({ device }: { device: AudioInputDevice }) {
  return (
    <View style={[styles.card, device.isUsb && styles.cardUsb]}>
      <View style={styles.cardHeader}>
        <Text style={styles.deviceName}>{device.name || '(tanpa nama)'}</Text>
        <Text style={[styles.tag, device.isUsb ? styles.tagUsb : styles.tagOther]}>
          {device.isUsb ? 'USB' : 'Lainnya'}
        </Text>
      </View>
      <Text style={styles.detail}>Tipe: {describeDeviceType(device.type)}</Text>
      <Text style={styles.detail}>ID Android: {device.id}</Text>
      {device.address !== '' ? (
        <Text style={styles.detail}>Alamat: {device.address}</Text>
      ) : null}
      <Text style={styles.detail}>Jumlah kanal: {formatChannels(device.channelCounts)}</Text>
      <Text style={styles.detail}>Laju sampel: {formatSampleRates(device.sampleRates)}</Text>
      <RateLine rates={device.sampleRates} rate={44100} />
      <RateLine rates={device.sampleRates} rate={48000} />
      <Text style={styles.detail}>Format: {formatEncodings(device.encodings)}</Text>
      {device.sampleRates.length === 0 ? (
        <Text style={styles.note}>
          Android tidak melaporkan daftar nilai; ini bukan jaminan bahwa semua nilai didukung.
          Nilai sebenarnya baru diketahui saat perekaman diuji.
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Audio screen: shows what Android really reports about audio inputs, and lets you test
 * recording from a USB input (the microphone permission is requested only when you start a test).
 */
export function AudioScreen({ active }: Props) {
  const insets = useSafeAreaInsets();
  const { state, refresh } = useAudioInputs(active);

  const devices = state.kind === 'ready' ? state.devices : [];
  const { usb, other } = splitDevices(devices);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}>
      <BrandHeader />

      <View style={styles.statusBlock}>
        {state.kind === 'loading' ? (
          <Text style={styles.helpText}>Memeriksa perangkat audio...</Text>
        ) : null}
        {state.kind === 'error' ? (
          <Text style={styles.errorText}>{state.message}</Text>
        ) : null}
        {state.kind === 'ready' ? (
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: usb.length > 0 ? colors.success : colors.inkMuted },
              ]}
            />
            <Text style={styles.statusText}>
              {usb.length > 0
                ? `${usb.length} perangkat audio USB terdeteksi`
                : 'Belum ada perangkat audio USB terdeteksi'}
            </Text>
          </View>
        ) : null}
        {state.kind === 'ready' && usb.length === 0 ? (
          <Text style={styles.helpText}>
            Sambungkan Sonicake Pocket Master ke ponsel dengan kabel USB/OTG, lalu daftar ini akan
            terbarui otomatis. Jika tidak muncul, coba kabel atau port lain.
          </Text>
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>Perangkat USB</Text>
      {usb.length === 0 ? (
        <Text style={styles.helpText}>Tidak ada.</Text>
      ) : (
        usb.map(d => (
          <View key={d.id} style={styles.usbGroup}>
            <DeviceCard device={d} />
            <LevelMeterPanel device={d} active={active} />
            <SpmTestPanel device={d} />
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>Input lain</Text>
      <Text style={styles.helpText}>
        Ditampilkan hanya sebagai informasi. Mikrofon ponsel tidak dipakai sebagai input gitar.
      </Text>
      {other.length === 0 ? (
        <Text style={styles.helpText}>Tidak ada.</Text>
      ) : (
        other.map(d => (
          <View key={d.id} style={styles.usbGroup}>
            <DeviceCard device={d} />
            {d.type === 'BUILTIN_MIC' ? (
              <LevelMeterPanel device={d} active={active} testOnly />
            ) : null}
          </View>
        ))
      )}

      <Pressable onPress={refresh} accessibilityRole="button" style={styles.refreshButton}>
        <Text style={styles.refreshText}>Periksa ulang sekarang</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  statusBlock: { gap: 6 },
  usbGroup: { gap: 8 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { color: colors.ink, fontSize: 14, flexShrink: 1 },
  sectionTitle: { color: colors.ink, fontSize: 16, fontWeight: '700', marginTop: 8 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 4,
  },
  cardUsb: { borderColor: colors.accent },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  deviceName: { color: colors.ink, fontSize: 15, fontWeight: '600', flexShrink: 1 },
  tag: { fontSize: 11, fontWeight: '700', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  tagUsb: { color: colors.background, backgroundColor: colors.accent },
  tagOther: { color: colors.inkMuted, backgroundColor: colors.surfaceRaised },
  detail: { color: colors.inkMuted, fontSize: 13, lineHeight: 18 },
  note: { color: colors.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  helpText: { color: colors.inkMuted, fontSize: 13, lineHeight: 18 },
  errorText: { color: colors.danger, fontSize: 13, lineHeight: 18 },
  refreshButton: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  refreshText: { color: colors.accent, fontSize: 15, fontWeight: '700' },
});