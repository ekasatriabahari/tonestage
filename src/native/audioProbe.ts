/** One tried input configuration, exactly as measured by native code (see AudioCapture.kt). */
export type ProbeEntry = {
  sampleRate: number;
  channels: number;
  source: string;
  ok: boolean;
  error: string;
  actualSampleRate: number;
  actualChannels: number;
  routedToSelected: boolean;
  frames: number;
  peaks: number[];
};

export type RecordResult = {
  ok: boolean;
  error: string;
  path: string;
  source: string;
  sampleRate: number;
  channels: number;
  routedToSelected: boolean;
  frames: number;
  peaks: number[];
  rms: number[];
  clipped: number[];
};

function numbers(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((v): v is number => typeof v === 'number')
    : [];
}

const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Throws on invalid JSON. Entries that are not objects are dropped. */
export function parseProbe(json: string): ProbeEntry[] {
  const data: unknown = JSON.parse(json);
  const list =
    typeof data === 'object' && data !== null
      ? (data as { results?: unknown }).results
      : undefined;
  if (!Array.isArray(list)) {
    return [];
  }
  const entries: ProbeEntry[] = [];
  for (const item of list) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const e = item as Record<string, unknown>;
    entries.push({
      sampleRate: num(e.sampleRate),
      channels: num(e.channels),
      source: str(e.source),
      ok: e.ok === true,
      error: str(e.error),
      actualSampleRate: num(e.actualSampleRate),
      actualChannels: num(e.actualChannels),
      routedToSelected: e.routedToSelected === true,
      frames: num(e.frames),
      peaks: numbers(e.peaks),
    });
  }
  return entries;
}

/** Throws on invalid JSON. */
export function parseRecord(json: string): RecordResult {
  const data: unknown = JSON.parse(json);
  const e = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  return {
    ok: e.ok === true,
    error: str(e.error),
    path: str(e.path),
    source: str(e.source),
    sampleRate: num(e.sampleRate),
    channels: num(e.channels),
    routedToSelected: e.routedToSelected === true,
    frames: num(e.frames),
    peaks: numbers(e.peaks),
    rms: numbers(e.rms),
    clipped: numbers(e.clipped),
  };
}

/** Level (0.0 to 1.0 of full scale) as dBFS text. Exactly 0 means digital silence. */
export function formatDbfs(level: number): string {
  if (!(level > 0)) {
    return 'senyap';
  }
  return `${(20 * Math.log10(level)).toFixed(1)} dBFS`;
}

export function describeAudioTestError(code: string): string {
  switch (code) {
    case 'INIT_FAILED':
      return 'Android menolak pengaturan ini untuk perekaman.';
    case 'PREFERRED_DEVICE_REJECTED':
      return 'Android menolak memilih perangkat USB ini sebagai sumber.';
    case 'START_FAILED':
      return 'Perekaman tidak dapat dimulai.';
    case 'NO_DATA':
      return 'Perangkat tidak mengirim data audio.';
    case 'NO_PERMISSION':
      return 'Izin mikrofon belum diberikan.';
    case 'DEVICE_NOT_FOUND':
      return 'Perangkat tidak lagi terhubung.';
    case 'UNSUPPORTED':
      return 'Fitur ini membutuhkan Android 10 atau yang lebih baru.';
    case 'FILE_NOT_FOUND':
      return 'File rekaman tidak ditemukan.';
    case 'MODULE_UNAVAILABLE':
      return 'Modul audio tidak tersedia di build ini.';
    case '':
      return '';
    default:
      return code.startsWith('READ_ERROR')
        ? `Pembacaan audio gagal (${code}).`
        : `Gagal (kode: ${code}).`;
  }
}