import { PermissionsAndroid } from 'react-native';
import NativeAudioInput from '../../specs/NativeAudioInput';
import {
  describeAudioTestError,
  parseProbe,
  parseRecord,
  type ProbeEntry,
  type RecordResult,
} from './audioProbe';
import { type MeterSnapshot, parseMeterSnapshot, parseMeterStart } from './audioMeter';

type Failure = { ok: false; message: string };

function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: unknown }).code;
    if (typeof code === 'string') {
      return code;
    }
  }
  return 'UNKNOWN';
}

/** Asks for the microphone permission if needed. Resolves true only when it is granted. */
export async function ensureMicPermission(): Promise<boolean> {
  try {
    const status = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Izin mikrofon',
        message:
          'ToneStage memerlukan izin ini untuk merekam gitar dari perangkat audio USB Anda.',
        buttonPositive: 'Izinkan',
        buttonNegative: 'Tolak',
      },
    );
    return status === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

export async function probeAudioInput(
  deviceId: number,
): Promise<{ ok: true; entries: ProbeEntry[] } | Failure> {
  if (NativeAudioInput == null) {
    return { ok: false, message: describeAudioTestError('MODULE_UNAVAILABLE') };
  }
  if (!(await ensureMicPermission())) {
    return { ok: false, message: describeAudioTestError('NO_PERMISSION') };
  }
  try {
    const json = await NativeAudioInput.probeInput(deviceId);
    return { ok: true, entries: parseProbe(json) };
  } catch (error) {
    return { ok: false, message: describeAudioTestError(errorCode(error)) };
  }
}

export async function recordAudioTest(
  deviceId: number,
  sampleRate: number,
  channels: number,
  seconds: number,
): Promise<{ ok: true; result: RecordResult } | Failure> {
  if (NativeAudioInput == null) {
    return { ok: false, message: describeAudioTestError('MODULE_UNAVAILABLE') };
  }
  if (!(await ensureMicPermission())) {
    return { ok: false, message: describeAudioTestError('NO_PERMISSION') };
  }
  try {
    const json = await NativeAudioInput.recordTest(deviceId, sampleRate, channels, seconds);
    return { ok: true, result: parseRecord(json) };
  } catch (error) {
    return { ok: false, message: describeAudioTestError(errorCode(error)) };
  }
}

export async function playAudioTest(path: string): Promise<boolean> {
  if (NativeAudioInput == null) {
    return false;
  }
  try {
    await NativeAudioInput.playTest(path);
    return true;
  } catch {
    return false;
  }
}

export async function stopAudioTestPlayback(): Promise<void> {
  if (NativeAudioInput == null) {
    return;
  }
  try {
    await NativeAudioInput.stopPlayback();
  } catch {
    // Nothing useful to do.
  }
}

/** Copies a test recording to Download/ToneStage. Resolves with a readable location. */
export async function exportAudioTest(
  path: string,
): Promise<{ ok: true; location: string } | Failure> {
  if (NativeAudioInput == null) {
    return { ok: false, message: describeAudioTestError('MODULE_UNAVAILABLE') };
  }
  try {
    const location = await NativeAudioInput.exportTest(path);
    return { ok: true, location };
  } catch (error) {
    return { ok: false, message: describeAudioTestError(errorCode(error)) };
  }
}

export type MeterStartResult =
  | { ok: true; sampleRate: number; channels: number; source: string }
  | Failure;

/**
 * Starts the live meter. 44100 Hz stereo is tried first (the rate the Pocket Master is reported to
 * use), then 48000 Hz stereo. The values Android really uses are returned.
 */
export async function startAudioMeter(deviceId: number): Promise<MeterStartResult> {
  if (NativeAudioInput == null) {
    return { ok: false, message: describeAudioTestError('MODULE_UNAVAILABLE') };
  }
  if (!(await ensureMicPermission())) {
    return { ok: false, message: describeAudioTestError('NO_PERMISSION') };
  }
  let lastError = 'INIT_FAILED';
  for (const rate of [44100, 48000]) {
    try {
      const start = parseMeterStart(await NativeAudioInput.startMeter(deviceId, rate, 2));
      if (start.ok) {
        return {
          ok: true,
          sampleRate: start.sampleRate,
          channels: start.channels,
          source: start.source,
        };
      }
      lastError = start.error;
    } catch (error) {
      return { ok: false, message: describeAudioTestError(errorCode(error)) };
    }
  }
  return { ok: false, message: describeAudioTestError(lastError) };
}

/** Null when the snapshot cannot be read. */
export async function readAudioMeter(): Promise<MeterSnapshot | null> {
  if (NativeAudioInput == null) {
    return null;
  }
  try {
    return parseMeterSnapshot(await NativeAudioInput.getMeterLevels());
  } catch {
    return null;
  }
}

export async function stopAudioMeter(): Promise<void> {
  if (NativeAudioInput == null) {
    return;
  }
  try {
    await NativeAudioInput.stopMeter();
  } catch {
    // Nothing useful to do.
  }
}

/** Same export action, used for video test recordings too (the native side picks the file type). */
export const exportRecordedFile = exportAudioTest;