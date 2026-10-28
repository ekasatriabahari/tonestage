import {
  clipCount,
  levelFraction,
  levelZone,
  METER_FLOOR_DB,
  nextMeterState,
  parseMeterSnapshot,
  parseMeterStart,
  resetClipping,
  toDb,
  type MeterSnapshot,
} from '../src/native/audioMeter';

const snap = (over: Partial<MeterSnapshot> = {}): MeterSnapshot => ({
  running: true,
  error: '',
  routedToSelected: true,
  frames: 2205,
  peaks: [0.5, 0.25],
  rms: [0.1, 0.05],
  clippedTotal: [0, 0],
  ...over,
});

describe('parsing', () => {
  it('reads snapshots and never invents a running meter', () => {
    expect(parseMeterSnapshot(JSON.stringify({ running: true, frames: 10, peaks: [0.5], rms: [0.1], clippedTotal: [0] }))).toMatchObject({ running: true, peaks: [0.5] });
    expect(parseMeterSnapshot('{}')).toMatchObject({ running: false, peaks: [], frames: 0 });
    expect(parseMeterSnapshot(JSON.stringify({ running: 'yes' })).running).toBe(false);
    expect(() => parseMeterSnapshot('nope')).toThrow();
  });

  it('reads the start result and defaults to not ok', () => {
    expect(parseMeterStart(JSON.stringify({ ok: true, source: 'UNPROCESSED', sampleRate: 44100, channels: 2 }))).toMatchObject({ ok: true, sampleRate: 44100 });
    expect(parseMeterStart('{}').ok).toBe(false);
  });
});

describe('scale', () => {
  it('converts levels to dB with a floor', () => {
    expect(toDb(1)).toBeCloseTo(0);
    expect(toDb(0.5)).toBeCloseTo(-6.02, 1);
    expect(toDb(0)).toBe(METER_FLOOR_DB);
    expect(toDb(1e-9)).toBe(METER_FLOOR_DB);
  });

  it('maps -60..0 dBFS to 0..1', () => {
    expect(levelFraction(-60)).toBe(0);
    expect(levelFraction(-30)).toBeCloseTo(0.5);
    expect(levelFraction(0)).toBe(1);
    expect(levelFraction(5)).toBe(1);
    expect(levelFraction(-90)).toBe(0);
  });

  it('colours by zone', () => {
    expect(levelZone(-20)).toBe('ok');
    expect(levelZone(-12)).toBe('warm');
    expect(levelZone(-3.1)).toBe('warm');
    expect(levelZone(-3)).toBe('hot');
  });
});

describe('nextMeterState', () => {
  it('shows the measured peak and RMS on the first snapshot', () => {
    const s = nextMeterState(null, snap(), 1000);
    expect(s.channels).toHaveLength(2);
    expect(s.channels[0].db).toBeCloseTo(-6.02, 1);
    expect(s.channels[1].db).toBeCloseTo(-12.04, 1);
    expect(s.channels[0].holdDb).toBeCloseTo(-6.02, 1);
    expect(s.channels[0].rmsDb).toBeCloseTo(-20, 0);
  });

  it('rises instantly and falls at a limited speed', () => {
    const loud = nextMeterState(null, snap(), 1000);
    const quiet = nextMeterState(loud, snap({ frames: 0, peaks: [0, 0], rms: [0, 0] }), 1500);
    // 0.5 s later, falling at 24 dB per second: 12 dB lower than -6.02
    expect(quiet.channels[0].db).toBeCloseTo(-6.02 - 12, 0);
    expect(quiet.channels[0].db).toBeGreaterThan(METER_FLOOR_DB);
  });

  it('holds the peak for 1.5 s, then lets it fall', () => {
    const loud = nextMeterState(null, snap(), 1000);
    const none = snap({ frames: 0, peaks: [0, 0], rms: [0, 0] });
    const held = nextMeterState(loud, none, 2000);
    expect(held.channels[0].holdDb).toBeCloseTo(-6.02, 1);
    let state = held;
    state = nextMeterState(state, none, 3000);
    expect(state.channels[0].holdDb).toBeLessThan(-6.02);
  });

  it('counts clipping, and a reset starts counting again from zero', () => {
    let s = nextMeterState(null, snap({ clippedTotal: [0, 0] }), 1000);
    expect(clipCount(s)).toBe(0);
    s = nextMeterState(s, snap({ clippedTotal: [3, 1] }), 1060);
    expect(clipCount(s)).toBe(4);
    s = resetClipping(s);
    expect(clipCount(s)).toBe(0);
    s = nextMeterState(s, snap({ clippedTotal: [5, 1] }), 1120);
    expect(clipCount(s)).toBe(2);
  });

  it('keeps showing nothing (floor) when there is no audio and no history', () => {
    const s = nextMeterState(null, snap({ frames: 0, peaks: [0, 0], rms: [0, 0] }), 1000);
    expect(s.channels[0].db).toBe(METER_FLOOR_DB);
  });
});