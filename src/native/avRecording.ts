import type { AudioInputDevice } from './audioDevices';
import { describeAudioTestError, formatDbfs } from './audioProbe';

export type AudioCaptureStart = {
  ok: boolean;
  error: string;
  source: string;
  sampleRate: number;
  channels: number;
};

/** Result of recording one input to WAV (AudioFileRecorder.kt). Times are on System.nanoTime(), in microseconds. */
export type AudioCaptureResult = {
  ok: boolean;
  error: string;
  path: string;
  source: string;
  sampleRate: number;
  channels: number;
  frames: number;
  peaks: number[];
  rms: number[];
  clippedTotal: number[];
  routedToSelected: boolean;
  timing: string;
  startUs: number;
  /** Real sample rate measured against the system clock (0 = not enough data). */
  measuredRateHz: number;
  rateSpanMs: number;
};

export type MergeResult = {
  ok: boolean;
  error: string;
  path: string;
  durationMs: number;
  videoSamples: number;
  audioSamples: number;
  videoLatencyMs: number;
  audioStartsAfterVideoMs: number;
};

const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const numbers = (v: unknown): number[] =>
  Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : [];

function asRecord(json: string): Record<string, unknown> {
  const data: unknown = JSON.parse(json);
  return (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
}

/** All parsers throw on invalid JSON; missing fields become empty values, never invented data. */
export function parseAudioCaptureStart(json: string): AudioCaptureStart {
  const e = asRecord(json);
  return {
    ok: e.ok === true,
    error: str(e.error),
    source: str(e.source),
    sampleRate: num(e.sampleRate),
    channels: num(e.channels),
  };
}

export function parseAudioCaptureResult(json: string): AudioCaptureResult {
  const e = asRecord(json);
  return {
    ok: e.ok === true,
    error: str(e.error),
    path: str(e.path),
    source: str(e.source),
    sampleRate: num(e.sampleRate),
    channels: num(e.channels),
    frames: num(e.frames),
    peaks: numbers(e.peaks),
    rms: numbers(e.rms),
    clippedTotal: numbers(e.clippedTotal),
    routedToSelected: e.routedToSelected === true,
    timing: str(e.timing),
    startUs: num(e.startUs),
    measuredRateHz: num(e.measuredRateHz),
    rateSpanMs: num(e.rateSpanMs),
  };
}

export function parseMergeResult(json: string): MergeResult {
  const e = asRecord(json);
  return {
    ok: e.ok === true,
    error: str(e.error),
    path: str(e.path),
    durationMs: num(e.durationMs),
    videoSamples: num(e.videoSamples),
    audioSamples: num(e.audioSamples),
    videoLatencyMs: num(e.videoLatencyMs),
    audioStartsAfterVideoMs: num(e.audioStartsAfterVideoMs),
  };
}

export const LATENCY_MIN_MS = -1000;
export const LATENCY_MAX_MS = 3000;

export function clampLatencyMs(ms: number): number {
  if (!Number.isFinite(ms)) {
    return 0;
  }
  return Math.min(LATENCY_MAX_MS, Math.max(LATENCY_MIN_MS, Math.round(ms)));
}

export type AudioChoice = { id: number; name: string; isUsb: boolean };

/**
 * The audio input to record: the first USB device if there is one, otherwise the phone's own
 * microphone (only useful for testing without the Pocket Master). Null when neither exists.
 */
export function pickAudioInput(devices: AudioInputDevice[]): AudioChoice | null {
  const usb = devices.find(d => d.isUsb);
  if (usb !== undefined) {
    return { id: usb.id, name: usb.name || 'Perangkat USB', isUsb: true };
  }
  const mic = devices.find(d => d.type === 'BUILTIN_MIC');
  if (mic !== undefined) {
    return { id: mic.id, name: mic.name || 'Mikrofon ponsel', isUsb: false };
  }
  return null;
}

function channelLevels(values: number[]): string {
  return values.map((v, i) => `K${i + 1} ${formatDbfs(v)}`).join(' | ');
}

/** Human-readable lines for a finished audio recording. Only measured values are shown. */
export function summarizeAudioCapture(a: AudioCaptureResult): string[] {
  const lines: string[] = [];
  lines.push(`Format: ${a.sampleRate} Hz, ${a.channels} kanal, sumber ${a.source}`);
  if (a.sampleRate > 0) {
    lines.push(`Durasi: ${(a.frames / a.sampleRate).toFixed(2)} dtk (${a.frames} frame)`);
  }
  if (a.peaks.length > 0) {
    lines.push(`Puncak: ${channelLevels(a.peaks)}`);
  }
  if (a.rms.length > 0) {
    lines.push(`RMS: ${channelLevels(a.rms)}`);
  }
  const clipped = a.clippedTotal.reduce((sum, c) => sum + c, 0);
  if (clipped > 0) {
    lines.push(`Clipping: ${clipped} sampel`);
  }
  lines.push(
    a.timing === 'timestamp'
      ? 'Pencatatan waktu: tepat (timestamp dari Android)'
      : a.timing === 'estimated'
        ? 'Pencatatan waktu: perkiraan (Android tidak memberi timestamp untuk perangkat ini)'
        : 'Pencatatan waktu: tidak tersedia',
  );
  if (a.rateSpanMs >= 2000 && a.measuredRateHz > 0 && a.sampleRate > 0) {
    const ppm = (a.measuredRateHz / a.sampleRate - 1) * 1e6;
    const per10Min = (ppm * 600) / 1000;
    lines.push(
      `Laju sampel terukur: ${a.measuredRateHz.toFixed(2)} Hz (${ppm >= 0 ? '+' : ''}${ppm.toFixed(0)} ppm dari ${a.sampleRate} Hz, diukur ${(a.rateSpanMs / 1000).toFixed(1)} dtk). Perkiraan pergeseran per 10 menit: ${per10Min >= 0 ? '+' : ''}${per10Min.toFixed(0)} ms`,
    );
  } else if (a.timing === 'timestamp') {
    lines.push('Laju sampel terukur: belum cukup data (rekam minimal beberapa detik).');
  }
  if (!a.routedToSelected) {
    lines.push('Peringatan: belum terkonfirmasi bahwa audio datang dari perangkat yang dipilih.');
  }
  return lines;
}

export function summarizeMerge(m: MergeResult): string[] {
  const lines: string[] = [];
  lines.push(
    `Durasi gabungan: ${(m.durationMs / 1000).toFixed(2)} dtk (video ${m.videoSamples} sampel, audio ${m.audioSamples} sampel AAC)`,
  );
  lines.push(`Penundaan video yang dipakai: ${m.videoLatencyMs} ms`);
  const gap = m.audioStartsAfterVideoMs;
  lines.push(
    `Audio mulai ${Math.abs(gap)} ms ${gap >= 0 ? 'setelah' : 'sebelum'} frame video pertama (sesudah koreksi)`,
  );
  return lines;
}

export function describeAvError(code: string): string {
  switch (code) {
    case 'BAD_WAV':
      return 'File audio tidak dapat dibaca.';
    case 'NO_VIDEO_TRACK':
    case 'NO_VIDEO_SAMPLES':
      return 'File video tidak berisi gambar yang dapat digabung.';
    case 'ENCODER_BUFFER':
    case 'ENCODER_STALLED':
    case 'NO_AUDIO_FORMAT':
      return `Penyandian audio AAC gagal (kode: ${code}).`;
    case 'MERGE_FAILED':
      return 'Penggabungan gagal. Coba rekam ulang.';
    case 'FILE_NOT_FOUND':
      return 'File rekaman tidak ditemukan.';
    case 'NOT_RECORDING':
      return 'Perekaman audio tidak sedang berjalan.';
    case 'FILE_ERROR':
      return 'File audio tidak dapat dibuat.';
    case 'CAPTURE_FAILED':
      return 'Perekaman audio terhenti karena kesalahan.';
    default:
      return describeAudioTestError(code);
  }
}