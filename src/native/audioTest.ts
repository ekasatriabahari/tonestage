import { PermissionsAndroid } from 'react-native';
import NativeAudioInput from '../../specs/NativeAudioInput';
import {
  describeAudioTestError,
  parseProbe,
  parseRecord,
  type ProbeEntry,
  type RecordResult,
} from './audioProbe';

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