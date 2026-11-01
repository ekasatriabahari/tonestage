import type { AudioCaptureResult } from './avRecording';
import type { BackingLog } from './backingTrackLogic';
import type { MixerSettings } from './mixerSettings';
import type { RecordingStats } from './yiVideo';

/** What is stored in session.json. All times are on the phone's System.nanoTime() clock (microseconds). */
export type SessionManifest = {
  version: number;
  id: string;
  createdMs: number;
  video: { path: string; firstSampleUs: number; mediaDurationMs: number; frames: number; width: number; height: number };
  guitar: null | {
    path: string;
    startUs: number;
    sampleRate: number;
    channels: number;
    frames: number;
    source: string;
    timing: string;
    isUsb: boolean;
    deviceName: string;
    measuredRateHz: number;
  };
  backing: null | { uri: string; name: string; logStartUs: number; logEndUs: number; runs: BackingLog['runs']; mixer: Pick<MixerSettings, 'backingVolume' | 'backingMuted' | 'masterVolume' | 'eq'> };
  mix: { guitarVolume: number; guitarMuted: boolean };
  offsets: { videoLatencyMs: number; backingOffsetMs: number };
};

export function buildManifest(args: {
  id: string;
  createdMs: number;
  video: RecordingStats;
  audio: AudioCaptureResult | null;
  audioDevice: { name: string; isUsb: boolean } | null;
  backing: { uri: string; name: string; log: BackingLog } | null;
  mixer: MixerSettings;
}): SessionManifest {
  const { video, audio, backing, mixer } = args;
  return {
    version: 1,
    id: args.id,
    createdMs: args.createdMs,
    video: {
      path: video.path,
      firstSampleUs: video.firstSampleUs,
      mediaDurationMs: video.mediaDurationMs,
      frames: video.frames,
      width: video.width,
      height: video.height,
    },
    guitar:
      audio === null
        ? null
        : {
            path: audio.path,
            startUs: audio.startUs,
            sampleRate: audio.sampleRate,
            channels: audio.channels,
            frames: audio.frames,
            source: audio.source,
            timing: audio.timing,
            isUsb: args.audioDevice !== null && args.audioDevice.isUsb,
            deviceName: args.audioDevice === null ? '' : args.audioDevice.name,
            measuredRateHz: audio.measuredRateHz,
          },
    backing:
      backing === null || backing.log.runs.length === 0
        ? null
        : {
            uri: backing.uri,
            name: backing.name,
            logStartUs: backing.log.logStartUs,
            logEndUs: backing.log.logEndUs,
            runs: backing.log.runs,
            mixer: { backingVolume: mixer.backingVolume, backingMuted: mixer.backingMuted, masterVolume: mixer.masterVolume, eq: mixer.eq },
          },
    mix: { guitarVolume: mixer.guitarVolume, guitarMuted: mixer.guitarMuted },
    offsets: { videoLatencyMs: 0, backingOffsetMs: 0 },
  };
}

export type SessionExportInfo = { path: string; name: string; bytes: number };

export type SessionInfo = {
  id: string;
  createdMs: number;
  videoBytes: number;
  guitarBytes: number;
  exports: SessionExportInfo[];
  /** null when the manifest is missing (the recording did not finish). */
  manifest: Record<string, unknown> | null;
  rawDeleted: boolean;
};

const num = (v: unknown): number => (typeof v === 'number' ? v : 0);

/** Never throws; bad data gives an empty list. */
export function parseSessionList(json: string): SessionInfo[] {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) {
    return [];
  }
  const sessions: SessionInfo[] = [];
  for (const item of data) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const e = item as Record<string, unknown>;
    if (typeof e.id !== 'string' || e.id === '') {
      continue;
    }
    const manifest = typeof e.manifest === 'object' && e.manifest !== null ? (e.manifest as Record<string, unknown>) : null;
    const exports: SessionExportInfo[] = [];
    if (Array.isArray(e.exports)) {
      for (const x of e.exports) {
        if (typeof x === 'object' && x !== null && typeof (x as Record<string, unknown>).path === 'string') {
          const r = x as Record<string, unknown>;
          exports.push({ path: String(r.path), name: typeof r.name === 'string' ? r.name : '', bytes: num(r.bytes) });
        }
      }
    }
    sessions.push({
      id: e.id,
      createdMs: num(e.createdMs),
      videoBytes: num(e.videoBytes),
      guitarBytes: num(e.guitarBytes),
      exports,
      manifest,
      rawDeleted: manifest !== null && manifest.rawDeleted === true,
    });
  }
  return sessions;
}

export function formatBytes(bytes: number): string {
  if (!(bytes >= 0)) {
    return '-';
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// Video about 62 KB/s plus 16-bit stereo 44.1 kHz audio 176 KB/s.
const BYTES_PER_SECOND = 250_000;

/** Rough recording time left. An estimate only; an export needs extra temporary space. */
export function estimateRecordMinutes(availableBytes: number): number {
  return availableBytes > 0 ? Math.floor(availableBytes / BYTES_PER_SECOND / 60) : 0;
}

export const MIN_FREE_BYTES_TO_RECORD = 200 * 1024 * 1024;

export type StorageInfo = { availableBytes: number; totalBytes: number };

export function parseStorage(json: string): StorageInfo | null {
  try {
    const e = JSON.parse(json) as Record<string, unknown>;
    return { availableBytes: num(e.availableBytes), totalBytes: num(e.totalBytes) };
  } catch {
    return null;
  }
}

export function formatDateTime(ms: number): string {
  if (!(ms > 0)) {
    return '-';
  }
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Short facts about a session, from what was measured. */
export function summarizeSession(s: SessionInfo): string[] {
  const lines: string[] = [];
  const m = s.manifest;
  if (m === null) {
    lines.push('Tanpa manifest: rekaman tidak selesai dengan benar. File mentah mungkin masih ada.');
  } else {
    const video = (typeof m.video === 'object' && m.video !== null ? m.video : {}) as Record<string, unknown>;
    const guitar = typeof m.guitar === 'object' && m.guitar !== null ? (m.guitar as Record<string, unknown>) : null;
    const backing = typeof m.backing === 'object' && m.backing !== null ? (m.backing as Record<string, unknown>) : null;
    lines.push(`Video: ${num(video.width)}x${num(video.height)}, ${(num(video.mediaDurationMs) / 1000).toFixed(1)} dtk`);
    if (guitar === null) {
      lines.push('Gitar: tidak direkam');
    } else {
      lines.push(
        `Gitar: ${guitar.isUsb === true ? 'USB' : 'mikrofon ponsel (uji)'}, ${num(guitar.sampleRate)} Hz, waktu ${guitar.timing === 'timestamp' ? 'tepat' : 'perkiraan'}`,
      );
    }
    if (backing === null) {
      lines.push('Backing track: tidak diputar saat merekam');
    } else {
      const runs = Array.isArray(backing.runs) ? backing.runs.length : 0;
      lines.push(`Backing track: ${String(backing.name ?? '')} (${runs} bagian diputar)`);
    }
  }
  lines.push(`File: video ${formatBytes(s.videoBytes)}, gitar ${formatBytes(s.guitarBytes)}${s.rawDeleted ? ' (file mentah sudah dihapus)' : ''}`);
  return lines;
}

export type ExportOptions = { videoLatencyMs: number; backingOffsetMs: number; includeBacking: boolean };

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = { videoLatencyMs: 0, backingOffsetMs: 0, includeBacking: true };

export const OFFSET_MIN_MS = -1000;
export const OFFSET_MAX_MS = 3000;

export function clampOffsetMs(ms: number): number {
  return Number.isFinite(ms) ? Math.min(OFFSET_MAX_MS, Math.max(OFFSET_MIN_MS, Math.round(ms))) : 0;
}

export type ExportResult = {
  ok: boolean;
  error: string;
  path: string;
  name: string;
  bytes: number;
  durationMs: number;
  peakDb: number;
  gainReductionDb: number;
  includedGuitar: boolean;
  includedBacking: boolean;
  backingRuns: number;
};

/** Throws on invalid JSON. */
export function parseExportResult(json: string): ExportResult {
  const e = JSON.parse(json) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    ok: e.ok === true,
    error: s(e.error),
    path: s(e.path),
    name: s(e.name),
    bytes: num(e.bytes),
    durationMs: num(e.durationMs),
    peakDb: typeof e.peakDb === 'number' ? e.peakDb : -200,
    gainReductionDb: num(e.gainReductionDb),
    includedGuitar: e.includedGuitar === true,
    includedBacking: e.includedBacking === true,
    backingRuns: num(e.backingRuns),
  };
}

export type ExportProgress = { stage: string; percent: number; exporting: boolean };

export function parseExportProgress(json: string): ExportProgress {
  try {
    const e = JSON.parse(json) as Record<string, unknown>;
    return { stage: typeof e.stage === 'string' ? e.stage : 'idle', percent: Math.min(100, Math.max(0, num(e.percent))), exporting: e.exporting === true };
  } catch {
    return { stage: 'idle', percent: 0, exporting: false };
  }
}

const STAGES: Record<string, string> = {
  prepare: 'Menyiapkan',
  backing: 'Memproses backing track',
  mix: 'Mencampur gitar dan backing track',
  encode: 'Menyandikan AAC dan menulis MP4',
};

export function describeStage(stage: string): string {
  return Object.prototype.hasOwnProperty.call(STAGES, stage) ? STAGES[stage] : stage;
}

export function describeExportError(code: string): string {
  switch (code) {
    case 'RAW_MISSING':
      return 'File video mentah tidak ada lagi (sudah dihapus?).';
    case 'NO_VIDEO':
      return 'Sesi ini tidak punya video.';
    case 'NO_AUDIO':
      return 'Sesi ini tidak punya audio (gitar maupun backing track).';
    case 'EMPTY':
      return 'Rekaman kosong.';
    case 'STORAGE_LOW':
      return 'Ruang penyimpanan kurang untuk ekspor. Hapus file mentah atau ekspor lama.';
    case 'CANCELLED':
      return 'Ekspor dibatalkan.';
    case 'BUSY':
      return 'Ekspor lain masih berjalan.';
    case 'SESSION_NOT_FOUND':
      return 'Sesi tidak ditemukan.';
    case 'EXPORT_FAILED':
      return 'Ekspor gagal. File mentah masih aman; coba lagi.';
    case 'MERGE_FAILED':
      return 'Penyandian atau penulisan MP4 gagal. File mentah masih aman; coba lagi.';
    default:
      return `Ekspor gagal (kode: ${code || 'tidak diketahui'}). File mentah masih aman.`;
  }
}