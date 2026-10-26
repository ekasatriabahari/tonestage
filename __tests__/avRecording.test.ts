import {
  clampLatencyMs,
  describeAvError,
  parseAudioCaptureResult,
  parseAudioCaptureStart,
  parseMergeResult,
  pickAudioInput,
  summarizeAudioCapture,
  summarizeMerge,
} from '../src/native/avRecording';
import type { AudioInputDevice } from '../src/native/audioDevices';

const dev = (over: Partial<AudioInputDevice>): AudioInputDevice => ({
  id: 1, name: '', type: 'UNKNOWN', isUsb: false, address: '', channelCounts: [], sampleRates: [], encodings: [], ...over,
});

const AUDIO = {
  ok: true, error: '', path: '/cache/audio_1.wav', source: 'UNPROCESSED', sampleRate: 44100, channels: 2,
  frames: 441000, peaks: [0.5, 0.25], rms: [0.1, 0.05], clippedTotal: [0, 2], routedToSelected: true,
  timing: 'timestamp', startUs: 123456789, measuredRateHz: 44102.2, rateSpanMs: 9000,
};

describe('parsing', () => {
  it('keeps measured values and never marks anything ok unless true', () => {
    expect(parseAudioCaptureResult(JSON.stringify(AUDIO))).toMatchObject({ ok: true, frames: 441000, timing: 'timestamp', startUs: 123456789 });
    expect(parseAudioCaptureResult('{}')).toMatchObject({ ok: false, path: '', frames: 0, peaks: [] });
    expect(parseAudioCaptureStart(JSON.stringify({ ok: 'yes' })).ok).toBe(false);
    expect(parseMergeResult('{}')).toMatchObject({ ok: false, path: '', durationMs: 0 });
    expect(() => parseMergeResult('nope')).toThrow();
  });
});

describe('clampLatencyMs', () => {
  it('rounds and limits the delay', () => {
    expect(clampLatencyMs(499.6)).toBe(500);
    expect(clampLatencyMs(-5000)).toBe(-1000);
    expect(clampLatencyMs(99999)).toBe(3000);
    expect(clampLatencyMs(NaN)).toBe(0);
    expect(clampLatencyMs(Infinity)).toBe(0);
  });
});

describe('pickAudioInput', () => {
  it('prefers USB, then the phone microphone, otherwise null', () => {
    const usb = dev({ id: 7, name: 'Pocket Master', type: 'USB_DEVICE', isUsb: true });
    const mic = dev({ id: 3, name: 'Mic', type: 'BUILTIN_MIC' });
    expect(pickAudioInput([mic, usb])).toEqual({ id: 7, name: 'Pocket Master', isUsb: true });
    expect(pickAudioInput([mic])).toEqual({ id: 3, name: 'Mic', isUsb: false });
    expect(pickAudioInput([dev({ type: 'TELEPHONY' })])).toBeNull();
    expect(pickAudioInput([])).toBeNull();
  });
});

describe('summaries', () => {
  it('reports only measured audio values, including timing quality and clipping', () => {
    const lines = summarizeAudioCapture(parseAudioCaptureResult(JSON.stringify(AUDIO)));
    expect(lines).toContain('Format: 44100 Hz, 2 kanal, sumber UNPROCESSED');
    expect(lines.some(l => l.includes('10.00 dtk'))).toBe(true);
    expect(lines.some(l => l.includes('Clipping: 2'))).toBe(true);
    expect(lines.some(l => l.includes('tepat'))).toBe(true);
    expect(lines.some(l => l.includes('Peringatan'))).toBe(false);
  });

  it('warns about estimated timing and unconfirmed routing', () => {
    const lines = summarizeAudioCapture(parseAudioCaptureResult(JSON.stringify({ ...AUDIO, timing: 'estimated', routedToSelected: false, clippedTotal: [0, 0] })));
    expect(lines.some(l => l.includes('perkiraan'))).toBe(true);
    expect(lines.some(l => l.includes('Peringatan'))).toBe(true);
    expect(lines.some(l => l.includes('Clipping'))).toBe(false);
  });

  it('describes the merge, with the sign of the audio start gap', () => {
    const m = parseMergeResult(JSON.stringify({ ok: true, path: '/c/av.mp4', durationMs: 17250, videoSamples: 518, audioSamples: 742, videoLatencyMs: 500, audioStartsAfterVideoMs: 800 }));
    const lines = summarizeMerge(m);
    expect(lines.some(l => l.includes('17.25 dtk') && l.includes('518') && l.includes('742'))).toBe(true);
    expect(lines.some(l => l.includes('500 ms'))).toBe(true);
    expect(lines.some(l => l.includes('800 ms setelah'))).toBe(true);
    expect(summarizeMerge({ ...m, audioStartsAfterVideoMs: -120 }).some(l => l.includes('120 ms sebelum'))).toBe(true);
  });
});

describe('measured sample rate', () => {
  it('reports the real rate, its error in ppm and a 10-minute projection', () => {
    const lines = summarizeAudioCapture(parseAudioCaptureResult(JSON.stringify(AUDIO)));
    const line = lines.find(l => l.startsWith('Laju sampel terukur')) ?? '';
    expect(line).toContain('44102.20 Hz');
    expect(line).toContain('+50 ppm');
    expect(line).toContain('9.0 dtk');
    expect(line).toContain('+30 ms');
  });

  it('says there is not enough data for very short recordings, and shows negative drift with a sign', () => {
    const short = summarizeAudioCapture(parseAudioCaptureResult(JSON.stringify({ ...AUDIO, measuredRateHz: 0, rateSpanMs: 0 })));
    expect(short.some(l => l.includes('belum cukup data'))).toBe(true);
    const slow = summarizeAudioCapture(parseAudioCaptureResult(JSON.stringify({ ...AUDIO, measuredRateHz: 44097.8, rateSpanMs: 20000 })));
    expect(slow.some(l => l.includes('-50 ppm') && l.includes('-30 ms'))).toBe(true);
  });
});

describe('describeAvError', () => {
  it('explains known codes and falls back to the audio error texts', () => {
    expect(describeAvError('BAD_WAV')).toContain('audio');
    expect(describeAvError('MERGE_FAILED')).toContain('gagal');
    expect(describeAvError('NO_PERMISSION')).toContain('Izin mikrofon');
    expect(describeAvError('SOMETHING')).toContain('SOMETHING');
  });
});