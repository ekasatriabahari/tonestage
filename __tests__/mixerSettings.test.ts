import { DEFAULT_MIXER, parseMixerSettings, serializeMixerSettings } from '../src/native/mixerSettings';
import { EXAMPLE_GUITAR_SPACE } from '../src/native/eq';
import { averageLatency, describeSimultaneousIo, monitoringNotes, pushLatency } from '../src/native/mixerLogic';

describe('mixer settings', () => {
  it('round-trips', () => {
    const s = { ...DEFAULT_MIXER, backingVolume: 0.65, backingMuted: true, masterVolume: 0.9, guitarVolume: 0.5, guitarMuted: true, eq: EXAMPLE_GUITAR_SPACE };
    expect(parseMixerSettings(serializeMixerSettings(s))).toEqual(s);
  });

  it('falls back to defaults for empty, damaged or odd data, without throwing', () => {
    expect(parseMixerSettings('')).toEqual(DEFAULT_MIXER);
    expect(parseMixerSettings('nope')).toEqual(DEFAULT_MIXER);
    expect(parseMixerSettings('[]')).toEqual(DEFAULT_MIXER);
    expect(parseMixerSettings(JSON.stringify({ backingVolume: 'loud', masterVolume: 7 }))).toMatchObject({ backingVolume: 0.8, masterVolume: 1 });
  });

  it('never allows more than 100% volume', () => {
    expect(parseMixerSettings(JSON.stringify({ backingVolume: 5 })).backingVolume).toBe(1);
    expect(parseMixerSettings(JSON.stringify({ guitarVolume: -3 })).guitarVolume).toBe(0);
  });
});

describe('latency tracking and notes', () => {
  it('keeps the last readings and ignores invalid ones', () => {
    let h: number[] = [];
    for (let i = 1; i <= 25; i++) {
      h = pushLatency(h, i);
    }
    expect(h).toHaveLength(20);
    expect(h[0]).toBe(6);
    expect(pushLatency(h, -1)).toBe(h);
    expect(pushLatency(h, NaN)).toBe(h);
    expect(averageLatency([100, 200])).toBe(150);
    expect(averageLatency([])).toBeNull();
  });

  it('warns about high latency and Bluetooth, and never promises zero delay', () => {
    const high = monitoringNotes(180, 'BLUETOOTH_A2DP', false);
    expect(high.some(n => n.level === 'warn' && n.text.includes('tinggi'))).toBe(true);
    expect(high.some(n => n.level === 'warn' && n.text.includes('Bluetooth'))).toBe(true);
    expect(high[high.length - 1].text).toContain('tidak menjanjikan nol jeda');
    const low = monitoringNotes(60, 'USB_DEVICE', true);
    expect(low.some(n => n.level === 'warn')).toBe(false);
    expect(low.some(n => n.text.includes('Belum diverifikasi'))).toBe(true);
    expect(monitoringNotes(null, null, false)).toHaveLength(1);
  });

  it('describes input and output running at the same time only when both really are', () => {
    const base = { inputRunning: true, inputIsUsb: true, outputPlaying: true, routedName: 'SPM', routedIsUsb: true };
    expect(describeSimultaneousIo(base).level).toBe('ok');
    expect(describeSimultaneousIo({ ...base, inputRunning: false }).text).toContain('Untuk menguji');
    expect(describeSimultaneousIo({ ...base, outputPlaying: false }).level).toBe('info');
    const other = describeSimultaneousIo({ ...base, routedIsUsb: false, routedName: 'Headphone' });
    expect(other.level).toBe('info');
    expect(other.text).toContain('bukan USB');
  });
});