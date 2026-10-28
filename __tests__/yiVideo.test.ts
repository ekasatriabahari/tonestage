import {
  describeRecordingError,
  describeVideoError,
  parsePlayerEvent,
  parseRecordingStats,
  previewAspectRatio,
  summarizeRecording,
} from '../src/native/yiVideo';

describe('parsePlayerEvent', () => {
  it('reports playing only with the size from native', () => {
    expect(
      parsePlayerEvent({ state: 'playing', width: 640, height: 480, message: '' }),
    ).toEqual({ kind: 'playing', width: 640, height: 480 });
  });

  it('reports errors with their code', () => {
    expect(
      parsePlayerEvent({ state: 'error', width: 0, height: 0, message: 'NO_WIFI' }),
    ).toEqual({ kind: 'error', code: 'NO_WIFI' });
  });

  it('treats preparing and unknown states as preparing, never as playing', () => {
    expect(parsePlayerEvent({ state: 'preparing', width: 0, height: 0, message: '' })).toEqual({
      kind: 'preparing',
    });
    expect(parsePlayerEvent({ state: 'whatever', width: 0, height: 0, message: '' })).toEqual({
      kind: 'preparing',
    });
  });
});

describe('describeVideoError', () => {
  it('explains our own codes', () => {
    expect(describeVideoError('NO_WIFI')).toContain('Wi-Fi');
    expect(describeVideoError('STREAM_ENDED')).toContain('berhenti');
  });

  it('groups Media3 network and format errors', () => {
    expect(describeVideoError('ERROR_CODE_IO_NETWORK_CONNECTION_FAILED')).toContain('aliran video');
    expect(describeVideoError('ERROR_CODE_PARSING_CONTAINER_MALFORMED')).toContain('Format video');
  });

  it('shows the code for anything unknown', () => {
    expect(describeVideoError('ERROR_CODE_SOMETHING_NEW')).toContain('ERROR_CODE_SOMETHING_NEW');
    expect(describeVideoError('')).toContain('tidak diketahui');
  });
});

describe('previewAspectRatio', () => {
  it('uses the real video shape once playing', () => {
    expect(previewAspectRatio({ kind: 'playing', width: 640, height: 480 })).toBeCloseTo(4 / 3);
  });

  it('falls back to 16:9 before the size is known', () => {
    expect(previewAspectRatio({ kind: 'preparing' })).toBeCloseTo(16 / 9);
    expect(previewAspectRatio({ kind: 'playing', width: 0, height: 0 })).toBeCloseTo(16 / 9);
    expect(previewAspectRatio({ kind: 'error', code: 'X' })).toBeCloseTo(16 / 9);
  });
});

const STATS = {
  ok: true, error: '', path: '/cache/video_1.mp4', width: 640, height: 480, frames: 300, keyFrames: 10,
  bytes: 1536000, mediaDurationMs: 10000, wallMs: 10100, waitedForKeyframeMs: 800, skippedBeforeStart: 12,
  nonMonotonic: 0, csdFromFormat: false,
};

describe('parseRecordingStats', () => {
  it('keeps measured values', () => {
    expect(parseRecordingStats(JSON.stringify(STATS))).toMatchObject({ ok: true, frames: 300, keyFrames: 10, width: 640 });
  });

  it('is not ok unless explicitly true, and never invents numbers', () => {
    const empty = parseRecordingStats('{}');
    expect(empty).toMatchObject({ ok: false, frames: 0, path: '', mediaDurationMs: 0 });
    expect(parseRecordingStats(JSON.stringify({ ok: 'yes' })).ok).toBe(false);
    expect(() => parseRecordingStats('nope')).toThrow();
  });
});

describe('summarizeRecording', () => {
  it('reports resolution, fps, durations and their difference', () => {
    const lines = summarizeRecording(parseRecordingStats(JSON.stringify(STATS)));
    expect(lines).toContain('Resolusi: 640x480');
    expect(lines.some(l => l.includes('30.0 fps'))).toBe(true);
    expect(lines.some(l => l.includes('10.00 dtk') && l.includes('10.10 dtk') && l.includes('-0.10 dtk'))).toBe(true);
    expect(lines.some(l => l.includes('1500 KB') && l.includes('1229 kbps'))).toBe(true);
    expect(lines.some(l => l.includes('dilewati') && l.includes('12'))).toBe(true);
  });

  it('only mentions timestamp corrections when they happened', () => {
    expect(summarizeRecording(parseRecordingStats(JSON.stringify(STATS))).some(l => l.includes('mundur'))).toBe(false);
    expect(summarizeRecording(parseRecordingStats(JSON.stringify({ ...STATS, nonMonotonic: 3 }))).some(l => l.includes('3 kali'))).toBe(true);
  });

  it('does not divide by zero for a zero-length recording', () => {
    const lines = summarizeRecording(parseRecordingStats(JSON.stringify({ ...STATS, mediaDurationMs: 0, frames: 1 })));
    expect(lines.some(l => l.includes('NaN') || l.includes('Infinity'))).toBe(false);
  });
});

describe('describeRecordingError', () => {
  it('explains known codes and shows unknown ones', () => {
    expect(describeRecordingError('NO_KEYFRAME')).toContain('keyframe');
    expect(describeRecordingError('MUXER_WRITE_FAILED')).toContain('MUXER_WRITE_FAILED');
    expect(describeRecordingError('ZZZ')).toContain('ZZZ');
    expect(describeRecordingError('')).toContain('tidak diketahui');
  });
});