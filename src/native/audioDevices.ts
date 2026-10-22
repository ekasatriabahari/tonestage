/** One audio input device as reported by Android's AudioManager (see AudioInputModule.kt). */
export type AudioInputDevice = {
  id: number;
  name: string;
  type: string;
  isUsb: boolean;
  address: string;
  channelCounts: number[];
  sampleRates: number[];
  encodings: string[];
};

function numberList(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((v): v is number => typeof v === 'number')
    : [];
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : [];
}

/** Parses the JSON from native code. Entries without a numeric id are dropped. Throws on invalid JSON. */
export function parseAudioDevices(json: string): AudioInputDevice[] {
  const data: unknown = JSON.parse(json);
  if (!Array.isArray(data)) {
    return [];
  }
  const devices: AudioInputDevice[] = [];
  for (const item of data) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const d = item as Record<string, unknown>;
    if (typeof d.id !== 'number') {
      continue;
    }
    devices.push({
      id: d.id,
      name: typeof d.name === 'string' ? d.name : '',
      type: typeof d.type === 'string' ? d.type : 'UNKNOWN',
      isUsb: d.isUsb === true,
      address: typeof d.address === 'string' ? d.address : '',
      channelCounts: numberList(d.channelCounts),
      sampleRates: numberList(d.sampleRates),
      encodings: stringList(d.encodings),
    });
  }
  return devices;
}

const TYPE_LABELS: Record<string, string> = {
  BUILTIN_MIC: 'Mikrofon bawaan ponsel',
  USB_DEVICE: 'Perangkat USB',
  USB_ACCESSORY: 'Aksesori USB',
  USB_HEADSET: 'Headset USB',
  WIRED_HEADSET: 'Headset berkabel',
  LINE_ANALOG: 'Line analog',
  BLUETOOTH_SCO: 'Bluetooth (SCO)',
  TELEPHONY: 'Telepon',
};

export function describeDeviceType(type: string): string {
  return Object.prototype.hasOwnProperty.call(TYPE_LABELS, type)
    ? TYPE_LABELS[type]
    : type;
}

/** An empty list means Android did not report values. That is NOT proof that everything is supported. */
export function formatChannels(counts: number[]): string {
  return counts.length === 0 ? 'tidak dilaporkan' : counts.join(', ');
}

export function formatSampleRates(rates: number[]): string {
  return rates.length === 0
    ? 'tidak dilaporkan'
    : rates.map(r => `${r} Hz`).join(', ');
}

export function formatEncodings(encodings: string[]): string {
  return encodings.length === 0 ? 'tidak dilaporkan' : encodings.join(', ');
}

/** For a reported, non-empty rate list: is this specific rate listed? Null when nothing was reported. */
export function isRateListed(rates: number[], rate: number): boolean | null {
  return rates.length === 0 ? null : rates.includes(rate);
}

export function splitDevices(devices: AudioInputDevice[]): {
  usb: AudioInputDevice[];
  other: AudioInputDevice[];
} {
  return {
    usb: devices.filter(d => d.isUsb),
    other: devices.filter(d => !d.isUsb),
  };
}