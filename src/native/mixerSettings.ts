import { DEFAULT_EQ, type EqSettings, sanitizeEq } from './eq';

export type MixerSettings = {
  backingVolume: number;
  backingMuted: boolean;
  masterVolume: number;
  /** Used for the exported mix, never for the clean guitar recording itself. */
  guitarVolume: number;
  guitarMuted: boolean;
  eq: EqSettings;
};

export const DEFAULT_MIXER: MixerSettings = {
  backingVolume: 0.8,
  backingMuted: false,
  masterVolume: 1,
  guitarVolume: 1,
  guitarMuted: false,
  eq: DEFAULT_EQ,
};

const unit = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, Math.round(v * 100) / 100)) : fallback;

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
  };
}

export function serializeMixerSettings(s: MixerSettings): string {
  return JSON.stringify(s);
}