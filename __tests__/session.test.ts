import {
  buildManifest,
  clampOffsetMs,
  describeExportError,
  describeStage,
  estimateRecordMinutes,
  formatBytes,
  parseExportProgress,
  parseExportResult,
  parseSessionList,
  parseStorage,
  summarizeSession,
} from '../src/native/session';
import { parseBackingLog } from '../src/native/backingTrackLogic';
import { latencyBreakdown } from '../src/native/mixerLogic';
import { DEFAULT_MIXER } from '../src/native/mixerSettings';
import { parseAudioCaptureResult } from '../src/native/avRecording';
import { parseRecordingStats } from '../src/native/yiVideo';

const video = parseRecordingStats(JSON.stringify({ ok: true, path: '/f/sessions/s_1/video.mp4', width: 640, height: 480, frames: 300, mediaDurationMs: 10000, firstSampleUs: 5_000_000 }));
const audio = parseAudioCaptureResult(JSON.stringify({ ok: true, path: '/f/sessions/s_1/guitar.wav', sampleRate: 44100, channels: 2, frames: 441000, startUs: 4_900_000, timing: 'timestamp', source: 'UNPROCESSED' }));
const log = parseBackingLog(JSON.stringify({ logStartUs: 4_000_000, logEndUs: 16_000_000, runs: [{ startNanoUs: 6_000_000, startFileUs: 30_000_000, endNanoUs: 14_000_000 }, { startNanoUs: 15_000_000, startFileUs: 0, endNanoUs: -1 }, { startNanoUs: 9, startFileUs: 0, endNanoUs: 3 }, null] }));

describe('backing log', () => {
  it('keeps only finished runs that go forward in time', () => {
    expect(log.runs).toEqual([{ startNanoUs: 6_000_000, startFileUs: 30_000_000, endNanoUs: 14_000_000 }]);
    expect(parseBackingLog('{}')).toEqual({ logStartUs: 0, logEndUs: 0, runs: [] });
    expect(() => parseBackingLog('nope')).toThrow();
  });
});

describe('manifest', () => {
  it('stores what was measured, and the mixer settings used while recording', () => {
    const m = buildManifest({ id: 's_1', createdMs: 1, video, audio, audioDevice: { name: 'SPM', isUsb: true }, backing: { uri: 'content://a', name: 'a.mp3', log }, mixer: { ...DEFAULT_MIXER, backingVolume: 0.7, guitarMuted: true } });
    expect(m.video.firstSampleUs).toBe(5_000_000);
    expect(m.guitar).toMatchObject({ startUs: 4_900_000, isUsb: true, deviceName: 'SPM', timing: 'timestamp' });
    expect(m.backing).toMatchObject({ uri: 'content://a', mixer: { backingVolume: 0.7 } });
    expect(m.backing?.runs).toHaveLength(1);
    expect(m.mix).toEqual({ guitarVolume: 1, guitarMuted: true });
    expect(m.offsets).toEqual({ videoLatencyMs: 0, backingOffsetMs: 0 });
  });

  it('has no backing entry when nothing was playing, and no guitar entry without audio', () => {
    const empty = parseBackingLog('{"runs":[]}');
    const m = buildManifest({ id: 's_2', createdMs: 2, video, audio: null, audioDevice: null, backing: { uri: 'x', name: 'x', log: empty }, mixer: DEFAULT_MIXER });
    expect(m.backing).toBeNull();
    expect(m.guitar).toBeNull();
  });
});

describe('session list', () => {
  const json = JSON.stringify([
    { id: 's_2', createdMs: 2000, videoBytes: 1048576, guitarBytes: 2097152, exports: [{ path: '/f/e.mp4', name: 'e.mp4', bytes: 5242880 }, { name: 'no path' }], manifest: { video: { width: 640, height: 480, mediaDurationMs: 12000 }, guitar: { isUsb: true, sampleRate: 44100, timing: 'timestamp' }, backing: { name: 'a.mp3', runs: [{}, {}] } } },
    { id: 's_1', manifest: null },
    { nope: true },
    null,
  ]);

  it('parses sessions and drops invalid entries', () => {
    const list = parseSessionList(json);
    expect(list.map(s => s.id)).toEqual(['s_2', 's_1']);
    expect(list[0].exports).toHaveLength(1);
    expect(parseSessionList('nope')).toEqual([]);
    expect(parseSessionList('{}')).toEqual([]);
  });

  it('summarizes only what is known, and says when the recording did not finish', () => {
    const list = parseSessionList(json);
    const lines = summarizeSession(list[0]);
    expect(lines).toContain('Video: 640x480, 12.0 dtk');
    expect(lines.some(l => l.startsWith('Gitar: USB') && l.includes('tepat'))).toBe(true);
    expect(lines.some(l => l.includes('2 bagian diputar'))).toBe(true);
    expect(summarizeSession(list[1])[0]).toContain('Tanpa manifest');
    expect(summarizeSession({ ...list[0], rawDeleted: true }).some(l => l.includes('sudah dihapus'))).toBe(true);
  });
});

describe('storage and formatting', () => {
  it('formats bytes and estimates the recording time left', () => {
    expect(formatBytes(512 * 1024)).toBe('512 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3.0 GB');
    expect(formatBytes(-1)).toBe('-');
    expect(estimateRecordMinutes(1_500_000_000)).toBe(100);
    expect(estimateRecordMinutes(0)).toBe(0);
    expect(parseStorage('{"availableBytes":10,"totalBytes":20}')).toEqual({ availableBytes: 10, totalBytes: 20 });
    expect(parseStorage('nope')).toBeNull();
  });

  it('clamps offsets', () => {
    expect(clampOffsetMs(120.4)).toBe(120);
    expect(clampOffsetMs(-5000)).toBe(-1000);
    expect(clampOffsetMs(99999)).toBe(3000);
    expect(clampOffsetMs(NaN)).toBe(0);
  });
});

describe('export results and messages', () => {
  it('parses results and never marks failure as ok', () => {
    const ok = parseExportResult(JSON.stringify({ ok: true, path: '/e.mp4', durationMs: 9000, peakDb: -3.2, gainReductionDb: -1.5, includedGuitar: true, includedBacking: true, backingRuns: 2 }));
    expect(ok).toMatchObject({ ok: true, gainReductionDb: -1.5, backingRuns: 2 });
    expect(parseExportResult('{}')).toMatchObject({ ok: false, path: '', peakDb: -200 });
    expect(() => parseExportResult('nope')).toThrow();
  });

  it('parses progress safely and names the stages', () => {
    expect(parseExportProgress('{"stage":"mix","percent":250,"exporting":true}')).toEqual({ stage: 'mix', percent: 100, exporting: true });
    expect(parseExportProgress('nope')).toEqual({ stage: 'idle', percent: 0, exporting: false });
    expect(describeStage('backing')).toContain('backing track');
    expect(describeStage('toString')).toBe('toString');
  });

  it('explains errors and says the raw files are safe', () => {
    expect(describeExportError('STORAGE_LOW')).toContain('Ruang');
    expect(describeExportError('EXPORT_FAILED')).toContain('masih aman');
    expect(describeExportError('ZZZ')).toContain('ZZZ');
  });
});

describe('latency breakdown', () => {
  it('splits the delay into the player buffer and the rest', () => {
    expect(latencyBreakdown(272, 150)).toEqual({ bufferMs: 150, restMs: 122 });
    expect(latencyBreakdown(100, 150)).toEqual({ bufferMs: 150, restMs: 0 });
    expect(latencyBreakdown(null, 150)).toBeNull();
    expect(latencyBreakdown(200, -1)).toBeNull();
  });
});