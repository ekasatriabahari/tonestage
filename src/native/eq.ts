/**
 * Equalizer for the backing track (the guitar is never filtered). The design formulas are the
 * ones used by the native filter (BiquadEq.kt), so the curve drawn here is the curve that is applied.
 */
export type EqKind = 'hpf' | 'peak';

export type EqBand = {
  kind: EqKind;
  enabled: boolean;
  freq: number;
  gainDb: number;
  q: number;
};

export type EqSettings = { enabled: boolean; bands: EqBand[] };

export const EQ_LIMITS = {
  freqMin: 20,
  freqMax: 20000,
  gainMin: -18,
  gainMax: 9,
  qMin: 0.2,
  qMax: 10,
} as const;

const HPF_Q = 0.7071;

export const DEFAULT_EQ: EqSettings = {
  enabled: false,
  bands: [
    { kind: 'hpf', enabled: false, freq: 80, gainDb: 0, q: HPF_Q },
    { kind: 'peak', enabled: false, freq: 300, gainDb: 0, q: 1 },
    { kind: 'peak', enabled: false, freq: 3000, gainDb: 0, q: 1 },
  ],
};

/**
 * A starting point for "leave room for the guitar", NOT a rule: how much and where to cut depends
 * on the song and on your guitar sound, so adjust it by ear (and compare with the bypass button).
 */
export const EXAMPLE_GUITAR_SPACE: EqSettings = {
  enabled: true,
  bands: [
    { kind: 'hpf', enabled: false, freq: 80, gainDb: 0, q: HPF_Q },
    { kind: 'peak', enabled: true, freq: 300, gainDb: -2, q: 1 },
    { kind: 'peak', enabled: true, freq: 3000, gainDb: -4, q: 0.9 },
  ],
};

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const finite = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

export function clampBand(b: EqBand): EqBand {
  return {
    kind: b.kind,
    enabled: b.enabled,
    freq: clamp(b.freq, EQ_LIMITS.freqMin, EQ_LIMITS.freqMax),
    gainDb: b.kind === 'hpf' ? 0 : clamp(b.gainDb, EQ_LIMITS.gainMin, EQ_LIMITS.gainMax),
    q: clamp(b.q, EQ_LIMITS.qMin, EQ_LIMITS.qMax),
  };
}

/** Turns anything (for example parsed JSON) into valid settings with exactly the default bands. */
export function sanitizeEq(value: unknown): EqSettings {
  const source = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  const list = Array.isArray(source.bands) ? source.bands : [];
  const bands = DEFAULT_EQ.bands.map((fallback, i) => {
    const raw = (typeof list[i] === 'object' && list[i] !== null ? list[i] : {}) as Record<string, unknown>;
    return clampBand({
      kind: fallback.kind,
      enabled: raw.enabled === true,
      freq: finite(raw.freq, fallback.freq),
      gainDb: finite(raw.gainDb, fallback.gainDb),
      q: finite(raw.q, fallback.q),
    });
  });
  return { enabled: source.enabled === true, bands };
}

export function serializeEq(settings: EqSettings): string {
  return JSON.stringify(settings);
}

/** Moves a frequency by whole sixths of an octave, keeping three significant digits. */
export function stepFrequency(freq: number, steps: number): number {
  const moved = freq * Math.pow(2, steps / 6);
  return Number(clamp(moved, EQ_LIMITS.freqMin, EQ_LIMITS.freqMax).toPrecision(3));
}

export function stepGain(gainDb: number, deltaDb: number): number {
  return clamp(Math.round((gainDb + deltaDb) * 2) / 2, EQ_LIMITS.gainMin, EQ_LIMITS.gainMax);
}

export function stepQ(q: number, delta: number): number {
  return clamp(Math.round((q + delta) * 10) / 10, EQ_LIMITS.qMin, EQ_LIMITS.qMax);
}

export function formatFreq(freq: number): string {
  return freq >= 1000 ? `${(freq / 1000).toFixed(freq >= 10000 ? 1 : 2).replace(/\.?0+$/, '')} kHz` : `${Math.round(freq)} Hz`;
}

/** Magnitude (dB) of one band at one frequency, from the same biquad design as the native filter. */
export function bandResponseDb(band: EqBand, freq: number, sampleRate: number = 44100): number {
  if (!band.enabled) {
    return 0;
  }
  const fs = sampleRate;
  const f0 = clamp(band.freq, 20, fs * 0.45);
  const q = clamp(band.q, 0.2, 10);
  const w0 = (2 * Math.PI * f0) / fs;
  const cosW = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  let c: number[];
  if (band.kind === 'hpf') {
    c = [(1 + cosW) / 2, -(1 + cosW), (1 + cosW) / 2, 1 + alpha, -2 * cosW, 1 - alpha];
  } else {
    const g = clamp(band.gainDb, EQ_LIMITS.gainMin, EQ_LIMITS.gainMax);
    if (Math.abs(g) < 0.05) {
      return 0;
    }
    const a = Math.pow(10, g / 40);
    c = [1 + alpha * a, -2 * cosW, 1 - alpha * a, 1 + alpha / a, -2 * cosW, 1 - alpha / a];
  }
  const b0 = c[0] / c[3];
  const b1 = c[1] / c[3];
  const b2 = c[2] / c[3];
  const a1 = c[4] / c[3];
  const a2 = c[5] / c[3];
  const w = (2 * Math.PI * clamp(freq, 1, fs / 2 - 1)) / fs;
  const cw = Math.cos(w);
  const c2w = Math.cos(2 * w);
  const num = b0 * b0 + b1 * b1 + b2 * b2 + 2 * (b0 * b1 + b1 * b2) * cw + 2 * b0 * b2 * c2w;
  const den = 1 + a1 * a1 + a2 * a2 + 2 * (a1 + a1 * a2) * cw + 2 * a2 * c2w;
  return 10 * Math.log10(Math.max(num, 1e-20) / Math.max(den, 1e-20));
}

/** Total response of the whole EQ (0 dB everywhere when it is bypassed). */
export function eqResponseDb(settings: EqSettings, freq: number, sampleRate: number = 44100): number {
  if (!settings.enabled) {
    return 0;
  }
  return settings.bands.reduce((sum, band) => sum + bandResponseDb(band, freq, sampleRate), 0);
}

/** Log-spaced points from 20 Hz to 20 kHz for drawing the curve. */
export function responseCurve(
  settings: EqSettings,
  points: number = 40,
  sampleRate: number = 44100,
): { freq: number; db: number }[] {
  const out: { freq: number; db: number }[] = [];
  for (let i = 0; i < points; i++) {
    const freq = 20 * Math.pow(1000, i / (points - 1));
    out.push({ freq, db: eqResponseDb(settings, freq, sampleRate) });
  }
  return out;
}

export function bandLabel(band: EqBand, index: number): string {
  if (band.kind === 'hpf') {
    return 'Potong bawah (high-pass)';
  }
  return `Pita ${index}`;
}