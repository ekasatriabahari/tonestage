import {
  describeAudioTestError,
  formatDbfs,
  parseProbe,
  parseRecord,
} from '../src/native/audioProbe';

const PROBE = JSON.stringify({
  results: [
    { sampleRate: 48000, channels: 2, source: 'UNPROCESSED', ok: true, error: '', actualSampleRate: 48000, actualChannels: 2, routedToSelected: true, frames: 57600, peaks: [0.25, 0] },
    { sampleRate: 44100, channels: 1, source: '', ok: false, error: 'INIT_FAILED', actualSampleRate: 0, actualChannels: 0, routedToSelected: false, frames: 0, peaks: [0] },
  ],
});

describe('parseProbe', () => {
  it('keeps exactly what native code measured', () => {
    const entries = parseProbe(PROBE);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ ok: true, sampleRate: 48000, channels: 2, routedToSelected: true, peaks: [0.25, 0] });
    expect(entries[1]).toMatchObject({ ok: false, error: 'INIT_FAILED' });
  });

  it('never marks anything ok unless it is explicitly true', () => {
    const entries = parseProbe(JSON.stringify({ results: [{ sampleRate: 48000, channels: 1, ok: 'yes' }] }));
    expect(entries[0].ok).toBe(false);
  });

  it('handles missing or odd data without inventing results', () => {
    expect(parseProbe('{}')).toEqual([]);
    expect(parseProbe('[]')).toEqual([]);
    expect(parseProbe(JSON.stringify({ results: [null, 3, 'x'] }))).toEqual([]);
    expect(() => parseProbe('nope')).toThrow();
  });
});

describe('parseRecord', () => {
  it('parses a recording result', () => {
    const r = parseRecord(JSON.stringify({ ok: true, path: '/cache/a.wav', sampleRate: 48000, channels: 2, frames: 240000, peaks: [0.5, 0], rms: [0.1, 0], clipped: [0, 0], routedToSelected: true, source: 'MIC' }));
    expect(r).toMatchObject({ ok: true, path: '/cache/a.wav', channels: 2, routedToSelected: true, clipped: [0, 0] });
  });

  it('defaults to not ok', () => {
    expect(parseRecord('{}')).toMatchObject({ ok: false, path: '', peaks: [] });
  });
});

describe('formatDbfs', () => {
  it('reports silence, full scale and normal levels', () => {
    expect(formatDbfs(0)).toBe('senyap');
    expect(formatDbfs(-1)).toBe('senyap');
    expect(formatDbfs(NaN)).toBe('senyap');
    expect(formatDbfs(1)).toBe('0.0 dBFS');
    expect(formatDbfs(0.5)).toBe('-6.0 dBFS');
  });
});

describe('describeAudioTestError', () => {
  it('explains known codes, and shows unknown ones', () => {
    expect(describeAudioTestError('NO_PERMISSION')).toContain('Izin mikrofon');
    expect(describeAudioTestError('INIT_FAILED')).toContain('menolak');
    expect(describeAudioTestError('READ_ERROR_-3')).toContain('READ_ERROR_-3');
    expect(describeAudioTestError('SOMETHING')).toContain('SOMETHING');
    expect(describeAudioTestError('')).toBe('');
  });
});