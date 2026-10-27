import {
  clampVolume,
  describeBackingError,
  describeOutputType,
  formatClock,
  fractionOf,
  outputWarning,
  parseBackingStatus,
  parseLoadedTrack,
  parseOutputDevices,
  parsePickedFile,
  positionFromFraction,
  statusToMeterSnapshot,
} from '../src/native/backingTrackLogic';

const STATUS = {
  state: 'playing', error: '', name: 'song.mp3', durationMs: 200000, positionMs: 31000, sampleRate: 44100, channels: 2,
  hasAnchor: true, anchorFileUs: 31000000, anchorNanoUs: 9000000, frames: 6615, peaks: [0.5, 0.4], rms: [0.1, 0.09],
  clippedTotal: [0, 0], routedDeviceId: 12, routedDeviceName: 'Speaker', requestedDeviceId: -1,
};

describe('parsing', () => {
  it('keeps measured status values', () => {
    expect(parseBackingStatus(JSON.stringify(STATUS))).toMatchObject({ state: 'playing', positionMs: 31000, hasAnchor: true, anchorFileUs: 31000000, routedDeviceId: 12 });
  });

  it('never reports playing, an anchor or a route unless told so', () => {
    const empty = parseBackingStatus('{}');
    expect(empty).toMatchObject({ state: 'idle', hasAnchor: false, positionMs: 0, routedDeviceId: -1, requestedDeviceId: -1 });
    expect(parseBackingStatus(JSON.stringify({ state: 'flying' })).state).toBe('idle');
    expect(parseBackingStatus(JSON.stringify({ hasAnchor: 'yes' })).hasAnchor).toBe(false);
    expect(() => parseBackingStatus('nope')).toThrow();
  });

  it('parses picked files, loaded tracks and output devices', () => {
    expect(parsePickedFile(JSON.stringify({ ok: true, uri: 'content://x', name: 'a.mp3' }))).toMatchObject({ ok: true, uri: 'content://x' });
    expect(parsePickedFile('{}').ok).toBe(false);
    expect(parseLoadedTrack(JSON.stringify({ ok: true, name: 'a.wav', durationMs: 5000, sampleRate: 48000, channels: 2, mime: 'audio/raw' }))).toMatchObject({ ok: true, durationMs: 5000 });
    const devices = parseOutputDevices(JSON.stringify([{ id: 2, name: 'Speaker', type: 'BUILTIN_SPEAKER', isUsb: false }, { name: 'no id' }, null, { id: 9, type: 'USB_DEVICE', isUsb: true }]));
    expect(devices.map(d => d.id)).toEqual([2, 9]);
    expect(devices[1]).toMatchObject({ name: '', isUsb: true });
    expect(parseOutputDevices('{}')).toEqual([]);
  });
});

describe('time and position', () => {
  it('formats clocks', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(65000)).toBe('1:05');
    expect(formatClock(3725000)).toBe('1:02:05');
    expect(formatClock(-5)).toBe('0:00');
    expect(formatClock(NaN)).toBe('0:00');
  });

  it('converts between position and bar fraction safely', () => {
    expect(fractionOf(50000, 200000)).toBe(0.25);
    expect(fractionOf(500, 0)).toBe(0);
    expect(fractionOf(999999, 1000)).toBe(1);
    expect(positionFromFraction(0.5, 200000)).toBe(100000);
    expect(positionFromFraction(2, 200000)).toBe(200000);
    expect(positionFromFraction(-1, 200000)).toBe(0);
    expect(positionFromFraction(NaN, 200000)).toBe(0);
    expect(positionFromFraction(0.5, 0)).toBe(0);
  });

  it('clamps volume to 0..1', () => {
    expect(clampVolume(0.756)).toBe(0.76);
    expect(clampVolume(-1)).toBe(0);
    expect(clampVolume(3)).toBe(1);
    expect(clampVolume(NaN)).toBe(0);
  });
});

describe('meter and messages', () => {
  it('feeds the shared meter only while playing', () => {
    expect(statusToMeterSnapshot(parseBackingStatus(JSON.stringify(STATUS)))).toMatchObject({ running: true, frames: 6615, peaks: [0.5, 0.4] });
    expect(statusToMeterSnapshot(parseBackingStatus(JSON.stringify({ ...STATUS, state: 'paused', frames: 0 }))).running).toBe(false);
  });

  it('says nothing when the picker is dismissed, and explains real errors', () => {
    expect(describeBackingError('CANCELLED')).toBe('');
    expect(describeBackingError('OPEN_FAILED')).toContain('tidak dapat dibuka');
    expect(describeBackingError('UNSUPPORTED_WAV_FORMAT')).toContain('16-bit');
    expect(describeBackingError('ZZZ')).toContain('ZZZ');
  });

  it('labels output types and warns only where it is warranted', () => {
    expect(describeOutputType('BLUETOOTH_A2DP')).toBe('Bluetooth (A2DP)');
    expect(describeOutputType('TYPE_99')).toBe('TYPE_99');
    expect(describeOutputType('toString')).toBe('toString');
    const bt = { id: 1, name: 'BT', type: 'BLUETOOTH_A2DP', isUsb: false, address: '' };
    const usb = { id: 2, name: 'SPM', type: 'USB_DEVICE', isUsb: true, address: '' };
    const speaker = { id: 3, name: '', type: 'BUILTIN_SPEAKER', isUsb: false, address: '' };
    expect(outputWarning(bt)).toContain('jeda');
    expect(outputWarning(usb)).toContain('Belum diverifikasi');
    expect(outputWarning(speaker)).toBeNull();
  });
});