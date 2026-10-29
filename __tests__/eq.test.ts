import {
  type EqBand,
  DEFAULT_EQ,
  EXAMPLE_GUITAR_SPACE,
  bandResponseDb,
  clampBand,
  eqResponseDb,
  formatFreq,
  responseCurve,
  sanitizeEq,
  stepFrequency,
  stepGain,
  stepQ,
} from '../src/native/eq';

const peak = (freq: number, gainDb: number, q: number): EqBand => ({ kind: 'peak', enabled: true, freq, gainDb, q });
const hpf = (freq: number): EqBand => ({ kind: 'hpf', enabled: true, freq, gainDb: 0, q: 0.7071 });

// Reference values computed with scipy.signal.freqz from the same biquad coefficients (44.1 kHz).
describe('response matches the filter design', () => {
  it('peak bands give exactly the requested gain at their centre', () => {
    expect(bandResponseDb(peak(300, -2, 1), 300)).toBeCloseTo(-2, 2);
    expect(bandResponseDb(peak(3000, -4, 0.9), 3000)).toBeCloseTo(-4, 2);
    expect(bandResponseDb(peak(1000, 6, 2), 1000)).toBeCloseTo(6, 2);
  });

  it('matches scipy away from the centre', () => {
    expect(bandResponseDb(peak(300, -2, 1), 1000)).toBeCloseTo(-0.1967, 2);
    expect(bandResponseDb(peak(300, -2, 1), 80)).toBeCloseTo(-0.1533, 2);
    expect(bandResponseDb(peak(3000, -4, 0.9), 1000)).toBeCloseTo(-0.587, 2);
    expect(bandResponseDb(peak(3000, -4, 0.9), 6000)).toBeCloseTo(-1.288, 2);
  });

  it('high-pass is -3 dB at its cutoff and flat well above it', () => {
    expect(bandResponseDb(hpf(80), 80)).toBeCloseTo(-3.0104, 2);
    expect(bandResponseDb(hpf(80), 50)).toBeCloseTo(-8.7817, 2);
    expect(bandResponseDb(hpf(80), 100)).toBeCloseTo(-1.491, 2);
    expect(Math.abs(bandResponseDb(hpf(80), 1000))).toBeLessThan(0.01);
  });

  it('is 0 dB when a band is off, neutral, or the whole EQ is bypassed', () => {
    expect(bandResponseDb({ ...peak(300, -2, 1), enabled: false }, 300)).toBe(0);
    expect(bandResponseDb(peak(300, 0, 1), 300)).toBe(0);
    expect(eqResponseDb({ ...EXAMPLE_GUITAR_SPACE, enabled: false }, 3000)).toBe(0);
    expect(eqResponseDb(DEFAULT_EQ, 3000)).toBe(0);
  });

  it('adds the bands of the example preset', () => {
    const total = eqResponseDb(EXAMPLE_GUITAR_SPACE, 3000);
    expect(total).toBeCloseTo(-4 + bandResponseDb(peak(300, -2, 1), 3000), 2);
    expect(total).toBeLessThan(-4);
  });

  it('draws a log-spaced curve from 20 Hz to 20 kHz', () => {
    const curve = responseCurve(EXAMPLE_GUITAR_SPACE, 40);
    expect(curve).toHaveLength(40);
    expect(curve[0].freq).toBeCloseTo(20, 5);
    expect(curve[39].freq).toBeCloseTo(20000, 3);
    expect(curve.every(p => Number.isFinite(p.db))).toBe(true);
  });
});

describe('settings handling', () => {
  it('clamps values to the limits', () => {
    expect(clampBand(peak(5, -99, 99))).toMatchObject({ freq: 20, gainDb: -18, q: 10 });
    expect(clampBand(peak(99999, 99, 0))).toMatchObject({ freq: 20000, gainDb: 9, q: 0.2 });
    expect(clampBand(hpf(80)).gainDb).toBe(0);
  });

  it('sanitizes anything into three valid bands', () => {
    expect(sanitizeEq(null)).toEqual(DEFAULT_EQ);
    expect(sanitizeEq('x')).toEqual(DEFAULT_EQ);
    const odd = sanitizeEq({ enabled: true, bands: [{ enabled: true, freq: 'a' }, null, { enabled: true, freq: 5000, gainDb: -3, q: 2 }, { extra: 1 }] });
    expect(odd.enabled).toBe(true);
    expect(odd.bands).toHaveLength(3);
    expect(odd.bands[0]).toMatchObject({ kind: 'hpf', enabled: true, freq: 80 });
    expect(odd.bands[2]).toMatchObject({ kind: 'peak', enabled: true, freq: 5000, gainDb: -3, q: 2 });
    expect(sanitizeEq({ enabled: 'yes' }).enabled).toBe(false);
  });

  it('steps frequency, gain and Q within limits', () => {
    expect(stepFrequency(300, 6)).toBe(600);
    expect(stepFrequency(300, -6)).toBe(150);
    expect(stepFrequency(25, -12)).toBe(20);
    expect(stepFrequency(19000, 6)).toBe(20000);
    expect(stepGain(-2, -0.5)).toBe(-2.5);
    expect(stepGain(-18, -5)).toBe(-18);
    expect(stepGain(9, 5)).toBe(9);
    expect(stepQ(1, 0.1)).toBe(1.1);
    expect(stepQ(0.2, -1)).toBe(0.2);
  });

  it('formats frequencies', () => {
    expect(formatFreq(300)).toBe('300 Hz');
    expect(formatFreq(3000)).toBe('3 kHz');
    expect(formatFreq(2500)).toBe('2.5 kHz');
    expect(formatFreq(12000)).toBe('12 kHz');
  });
});