import { DEFAULT_EQ, type EqSettings, sanitizeEq } from './eq';

export type MixerSettings = {
  backingVolume: number;
  backingMuted: boolean;
  masterVolume: number;
  /** Used for the exported mix, never for the clean guitar recording itself. */
  guitarVolume: number;
  guitarMuted: boolean;
  eq: EqSettings;
  /** Offsets that new exports start with (found by listening; they depend on the setup). */
  exportDefaults: { videoLatencyMs: number; backingOffsetMs: number };
};

export const DEFAULT_MIXER: MixerSettings = {
  backingVolume: 0.8,
  backingMuted: false,
  masterVolume: 1,
  guitarVolume: 1,
  guitarMuted: false,
  eq: DEFAULT_EQ,
  exportDefaults: { videoLatencyMs: 0, backingOffsetMs: 100 },
};

const unit = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, Math.round(v * 100) / 100)) : fallback;

const offset = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(3000, Math.max(-1000, Math.round(v))) : fallback;

/** Never throws: an empty or damaged value gives the defaults. */
export function parseMixerSettings(json: string): MixerSettings {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return DEFAULT_MIXER;
  }
  const e = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  return {
    backingVolume: unit(e.backingVolume, DEFAULT_MIXER.backingVolume),
    backingMuted: e.backingMuted === true,
    masterVolume: unit(e.masterVolume, DEFAULT_MIXER.masterVolume),
    guitarVolume: unit(e.guitarVolume, DEFAULT_MIXER.guitarVolume),
    guitarMuted: e.guitarMuted === true,
    eq: sanitizeEq(e.eq),
    exportDefaults: {
      videoLatencyMs: offset((e.exportDefaults as Record<string, unknown> | undefined)?.videoLatencyMs, DEFAULT_MIXER.exportDefaults.videoLatencyMs),
      // Older installs have no backing offset saved yet; migrate them to the measured +100 ms baseline.
      backingOffsetMs: offset((e.exportDefaults as Record<string, unknown> | undefined)?.backingOffsetMs, DEFAULT_MIXER.exportDefaults.backingOffsetMs),
    },
  };
}

export function serializeMixerSettings(s: MixerSettings): string {
  return JSON.stringify(s);
}