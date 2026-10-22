import {
  describeDeviceType,
  formatChannels,
  formatSampleRates,
  isRateListed,
  parseAudioDevices,
  splitDevices,
} from '../src/native/audioDevices';

const SAMPLE = JSON.stringify([
  {
    id: 7,
    name: 'Pocket Master',
    type: 'USB_DEVICE',
    isUsb: true,
    address: 'card=1;device=0',
    channelCounts: [2],
    sampleRates: [44100, 48000],
    encodings: ['PCM 16-bit'],
  },
  { id: 3, name: '', type: 'BUILTIN_MIC', isUsb: false, address: '', channelCounts: [], sampleRates: [], encodings: [] },
]);

describe('parseAudioDevices', () => {
  it('parses devices exactly as reported', () => {
    const devices = parseAudioDevices(SAMPLE);
    expect(devices).toHaveLength(2);
    expect(devices[0]).toMatchObject({ id: 7, isUsb: true, channelCounts: [2], sampleRates: [44100, 48000] });
    expect(devices[1].sampleRates).toEqual([]);
  });

  it('drops entries without a numeric id and tolerates missing fields', () => {
    const devices = parseAudioDevices(JSON.stringify([{ name: 'x' }, null, 5, { id: 1 }]));
    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({ id: 1, name: '', type: 'UNKNOWN', isUsb: false, channelCounts: [] });
  });

  it('returns an empty list for non-array JSON and throws on invalid JSON', () => {
    expect(parseAudioDevices('{}')).toEqual([]);
    expect(() => parseAudioDevices('not json')).toThrow();
  });
});

describe('formatting', () => {
  it('says "tidak dilaporkan" for empty lists instead of inventing values', () => {
    expect(formatChannels([])).toBe('tidak dilaporkan');
    expect(formatSampleRates([])).toBe('tidak dilaporkan');
    expect(formatSampleRates([44100, 48000])).toBe('44100 Hz, 48000 Hz');
  });

  it('reports whether a rate is listed, or null when nothing was reported', () => {
    expect(isRateListed([], 44100)).toBeNull();
    expect(isRateListed([48000], 44100)).toBe(false);
    expect(isRateListed([44100, 48000], 44100)).toBe(true);
  });

  it('labels known types and passes unknown types through', () => {
    expect(describeDeviceType('USB_DEVICE')).toBe('Perangkat USB');
    expect(describeDeviceType('TYPE_99')).toBe('TYPE_99');
    expect(describeDeviceType('toString')).toBe('toString');
  });
});

describe('splitDevices', () => {
  it('separates USB devices from the rest', () => {
    const { usb, other } = splitDevices(parseAudioDevices(SAMPLE));
    expect(usb.map(d => d.id)).toEqual([7]);
    expect(other.map(d => d.id)).toEqual([3]);
  });
});