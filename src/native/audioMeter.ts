/** Snapshot from native code: levels since the previous poll (0.0 to 1.0 of full scale). */
export type MeterSnapshot = {
  running: boolean;
  error: string;
  routedToSelected: boolean;
  frames: number;
  peaks: number[];
  rms: number[];
  clippedTotal: number[];
};

export type MeterStart = {
  ok: boolean;
  error: string;
  source: string;
  sampleRate: number;
  channels: number;
};

function numbers(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((v): v is number => typeof v === 'number')
    : [];
}

const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

function asRecord(json: string): Record<string, unknown> {
  const data: unknown = JSON.parse(json);
  return (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
}

/** Throws on invalid JSON. Anything missing becomes "not running" / empty, never invented data. */
export function parseMeterSnapshot(json: string): MeterSnapshot {
  const e = asRecord(json);
  return {
    running: e.running === true,
    error: str(e.error),
    routedToSelected: e.routedToSelected === true,
    frames: num(e.frames),
    peaks: numbers(e.peaks),
    rms: numbers(e.rms),
    clippedTotal: numbers(e.clippedTotal),
  };
}

export function parseMeterStart(json: string): MeterStart {
  const e = asRecord(json);
  return {
    ok: e.ok === true,
    error: str(e.error),
    source: str(e.source),
    sampleRate: num(e.sampleRate),
    channels: num(e.channels),
  };
}

export const METER_FLOOR_DB = -90;
const METER_RANGE_DB = 60; // the bar shows -60 dBFS (empty) to 0 dBFS (full)
const FALL_DB_PER_S = 24;
const HOLD_MS = 1500;
const HOLD_FALL_DB_PER_S = 12;

export function toDb(level: number): number {
  return level > 0 ? Math.max(METER_FLOOR_DB, 20 * Math.log10(level)) : METER_FLOOR_DB;
}

/** 0 at -60 dBFS or lower, 1 at 0 dBFS. */
export function levelFraction(db: number): number {
  return Math.min(1, Math.max(0, (db + METER_RANGE_DB) / METER_RANGE_DB));
}

export type MeterZone = 'ok' | 'warm' | 'hot';

/** Display colour zone: hot from -3 dBFS, warm from -12 dBFS. A display convention only. */
export function levelZone(db: number): MeterZone {
  if (db >= -3) {
    return 'hot';
  }
  return db >= -12 ? 'warm' : 'ok';
}

export type MeterChannel = {
  db: number;
  holdDb: number;
  holdAt: number;
  rmsDb: number;
  clipTotal: number;
  clipBase: number;
};

export type MeterState = { channels: MeterChannel[]; lastAt: number };

/**
 * Combines the previous display state with a new snapshot: the bar rises instantly and falls
 * smoothly, the peak marker is held for 1.5 s, and clipping counts accumulate until reset.
 */
export function nextMeterState(
  prev: MeterState | null,
  snap: MeterSnapshot,
  now: number,
): MeterState {
  const count = Math.max(
    snap.peaks.length,
    snap.clippedTotal.length,
    prev === null ? 0 : prev.channels.length,
  );
  const dt = prev === null ? 0 : Math.max(0, (now - prev.lastAt) / 1000);
  const hasAudio = snap.frames > 0;
  const channels: MeterChannel[] = [];
  for (let i = 0; i < count; i++) {
    const p = prev === null ? undefined : prev.channels[i];
    const snapDb = hasAudio ? toDb(snap.peaks[i] ?? 0) : METER_FLOOR_DB;
    const fallen = p === undefined ? METER_FLOOR_DB : p.db - FALL_DB_PER_S * dt;
    const db = Math.max(snapDb, fallen, METER_FLOOR_DB);

    let holdDb = p === undefined ? METER_FLOOR_DB : p.holdDb;
    let holdAt = p === undefined ? now : p.holdAt;
    if (db >= holdDb) {
      holdDb = db;
      holdAt = now;
    } else if (now - holdAt > HOLD_MS) {
      holdDb = Math.max(db, holdDb - HOLD_FALL_DB_PER_S * dt);
    }

    const rmsSnap = hasAudio ? toDb(snap.rms[i] ?? 0) : METER_FLOOR_DB;
    const rmsFallen = p === undefined ? METER_FLOOR_DB : p.rmsDb - FALL_DB_PER_S * dt;
    channels.push({
      db,
      holdDb,
      holdAt,
      rmsDb: Math.max(rmsSnap, rmsFallen, METER_FLOOR_DB),
      clipTotal: snap.clippedTotal[i] ?? (p === undefined ? 0 : p.clipTotal),
      clipBase: p === undefined ? 0 : p.clipBase,
    });
  }
  return { channels, lastAt: now };
}

/** Clipped samples counted since the meter started or since the last reset. */
export function clipCount(state: MeterState): number {
  return state.channels.reduce((sum, c) => sum + Math.max(0, c.clipTotal - c.clipBase), 0);
}

export function resetClipping(state: MeterState): MeterState {
  return {
    ...state,
    channels: state.channels.map(c => ({ ...c, clipBase: c.clipTotal })),
  };
}