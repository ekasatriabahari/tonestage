import type { MeterSnapshot } from './audioMeter';

export type BackingState = 'idle' | 'stopped' | 'playing' | 'paused' | 'ended' | 'error';

export type PickedFile = { ok: boolean; error: string; uri: string; name: string };

export type LoadedTrack = {
  ok: boolean;
  error: string;
  name: string;
  durationMs: number;
  sampleRate: number;
  channels: number;
  mime: string;
};

export type BackingStatus = {
  state: BackingState;
  error: string;
  name: string;
  durationMs: number;
  positionMs: number;
  sampleRate: number;
  channels: number;
  /** While playing: file position at system time t is anchorFileUs + (t - anchorNanoUs). */
  hasAnchor: boolean;
  anchorFileUs: number;
  anchorNanoUs: number;
  frames: number;
  peaks: number[];
  rms: number[];
  clippedTotal: number[];
  routedDeviceId: number;
  routedDeviceName: string;
  requestedDeviceId: number;
  /** Estimated delay from writing a frame to hearing it (ms); -1 when unknown. */
  outputLatencyMs: number;
};

export type OutputDevice = {
  id: number;
  name: string;
  type: string;
  isUsb: boolean;
  address: string;
};

const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const numbers = (v: unknown): number[] =>
  Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : [];

function asRecord(json: string): Record<string, unknown> {
  const data: unknown = JSON.parse(json);
  return (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
}

/** All parsers throw on invalid JSON; anything missing becomes an empty value, never invented data. */
export function parsePickedFile(json: string): PickedFile {
  const e = asRecord(json);
  return { ok: e.ok === true, error: str(e.error), uri: str(e.uri), name: str(e.name) };
}

export function parseLoadedTrack(json: string): LoadedTrack {
  const e = asRecord(json);
  return {
    ok: e.ok === true,
    error: str(e.error),
    name: str(e.name),
    durationMs: num(e.durationMs),
    sampleRate: num(e.sampleRate),
    channels: num(e.channels),
    mime: str(e.mime),
  };
}

const STATES: BackingState[] = ['idle', 'stopped', 'playing', 'paused', 'ended', 'error'];

export function parseBackingStatus(json: string): BackingStatus {
  const e = asRecord(json);
  const state = STATES.find(s => s === e.state) ?? 'idle';
  return {
    state,
    error: str(e.error),
    name: str(e.name),
    durationMs: num(e.durationMs),
    positionMs: num(e.positionMs),
    sampleRate: num(e.sampleRate),
    channels: num(e.channels),
    hasAnchor: e.hasAnchor === true,
    anchorFileUs: num(e.anchorFileUs),
    anchorNanoUs: num(e.anchorNanoUs),
    frames: num(e.frames),
    peaks: numbers(e.peaks),
    rms: numbers(e.rms),
    clippedTotal: numbers(e.clippedTotal),
    routedDeviceId: typeof e.routedDeviceId === 'number' ? e.routedDeviceId : -1,
    routedDeviceName: str(e.routedDeviceName),
    requestedDeviceId: typeof e.requestedDeviceId === 'number' ? e.requestedDeviceId : -1,
    outputLatencyMs: typeof e.outputLatencyMs === 'number' ? e.outputLatencyMs : -1,
  };
}

export function parseOutputDevices(json: string): OutputDevice[] {
  const data: unknown = JSON.parse(json);
  if (!Array.isArray(data)) {
    return [];
  }
  const devices: OutputDevice[] = [];
  for (const item of data) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const d = item as Record<string, unknown>;
    if (typeof d.id !== 'number') {
      continue;
    }
    devices.push({
      id: d.id,
      name: str(d.name),
      type: str(d.type) || 'UNKNOWN',
      isUsb: d.isUsb === true,
      address: str(d.address),
    });
  }
  return devices;
}

/** m:ss (h:mm:ss for an hour or more). Negative or invalid values show 0:00. */
export function formatClock(ms: number): string {
  const total = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function fractionOf(positionMs: number, durationMs: number): number {
  if (!(durationMs > 0)) {
    return 0;
  }
  return Math.min(1, Math.max(0, positionMs / durationMs));
}

export function positionFromFraction(fraction: number, durationMs: number): number {
  if (!(durationMs > 0) || !Number.isFinite(fraction)) {
    return 0;
  }
  return Math.round(Math.min(1, Math.max(0, fraction)) * durationMs);
}

export function clampVolume(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, Math.round(v * 100) / 100)) : 0;
}

/** The backing-track level measurement in the shape the meter display already understands. */
export function statusToMeterSnapshot(s: BackingStatus): MeterSnapshot {
  return {
    running: s.state === 'playing',
    error: s.error,
    routedToSelected: true,
    frames: s.frames,
    peaks: s.peaks,
    rms: s.rms,
    clippedTotal: s.clippedTotal,
  };
}

/** Empty for CANCELLED: dismissing the picker is not an error. */
export function describeBackingError(code: string): string {
  switch (code) {
    case 'CANCELLED':
      return '';
    case 'NO_ACTIVITY':
    case 'BUSY':
    case 'PICK_FAILED':
      return 'Pemilih file tidak dapat dibuka. Coba lagi.';
    case 'OPEN_FAILED':
      return 'File tidak dapat dibuka. Pastikan file audio valid dan masih ada.';
    case 'NO_AUDIO_TRACK':
      return 'File ini tidak berisi audio.';
    case 'UNSUPPORTED_CHANNELS':
      return 'Hanya audio mono atau stereo yang didukung.';
    case 'UNSUPPORTED_WAV_FORMAT':
    case 'UNSUPPORTED_PCM_FORMAT':
      return 'Format audio ini belum didukung (hanya PCM 16-bit atau float).';
    case 'UNSUPPORTED_OUTPUT_FORMAT':
      return 'Perangkat output tidak menerima format audio ini.';
    case 'DECODER_BUFFER':
    case 'WRITE_FAILED':
    case 'PLAYBACK_FAILED':
      return `Pemutaran terhenti karena kesalahan (kode: ${code}).`;
    case 'DEVICE_NOT_FOUND':
      return 'Perangkat output tidak lagi terhubung.';
    case 'MODULE_UNAVAILABLE':
      return 'Modul pemutar backing track tidak tersedia di build ini.';
    default:
      return `Gagal (kode: ${code || 'tidak diketahui'}).`;
  }
}

const TYPE_LABELS: Record<string, string> = {
  BUILTIN_SPEAKER: 'Speaker ponsel',
  BUILTIN_EARPIECE: 'Earpiece ponsel',
  WIRED_HEADSET: 'Headset berkabel',
  WIRED_HEADPHONES: 'Headphone berkabel',
  LINE_ANALOG: 'Line analog',
  USB_DEVICE: 'Perangkat USB',
  USB_ACCESSORY: 'Aksesori USB',
  USB_HEADSET: 'Headset USB',
  BLUETOOTH_A2DP: 'Bluetooth (A2DP)',
  BLUETOOTH_SCO: 'Bluetooth (SCO)',
  HDMI: 'HDMI',
  TELEPHONY: 'Telepon',
};

export function describeOutputType(type: string): string {
  return Object.prototype.hasOwnProperty.call(TYPE_LABELS, type) ? TYPE_LABELS[type] : type;
}

/** A caution about an output device, or null. These are cautions, not measured facts. */
export function outputWarning(device: OutputDevice): string | null {
  if (device.type === 'BLUETOOTH_A2DP' || device.type === 'BLUETOOTH_SCO') {
    return 'Bluetooth biasanya punya jeda besar, tidak cocok untuk memantau gitar secara langsung. Untuk sekadar mendengar backing track tidak masalah.';
  }
  if (device.isUsb) {
    return 'Belum diverifikasi apakah audio bisa keluar lewat perangkat USB ini bersamaan dengan input gitar. Setelah memutar, lihat baris "Terarah ke" untuk rute yang benar-benar dipakai Android.';
  }
  return null;
}

