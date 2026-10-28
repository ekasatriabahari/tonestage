import NativeAudioInput from '../../specs/NativeAudioInput';
import { ensureMicPermission } from './audioTest';
import {
  type AudioCaptureResult,
  type AudioCaptureStart,
  describeAvError,
  type MergeResult,
  parseAudioCaptureResult,
  parseAudioCaptureStart,
  parseMergeResult,
} from './avRecording';

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

/**
 * Starts recording the chosen input to a WAV file. 44100 Hz stereo is tried first (the rate the
 * Pocket Master is reported to use), then 48000 Hz stereo.
 */
export async function beginAudioCapture(
  deviceId: number,
): Promise<{ ok: true; info: AudioCaptureStart } | Failure> {
  if (NativeAudioInput == null) {
    return { ok: false, message: describeAvError('MODULE_UNAVAILABLE') };
  }
  if (!(await ensureMicPermission())) {
    return { ok: false, message: describeAvError('NO_PERMISSION') };
  }
  let lastError = 'INIT_FAILED';
  for (const rate of [44100, 48000]) {
    try {
      const info = parseAudioCaptureStart(
        await NativeAudioInput.startAudioCapture(deviceId, rate, 2),
      );
      if (info.ok) {
        return { ok: true, info };
      }
      lastError = info.error;
    } catch (error) {
      return { ok: false, message: describeAvError(errorCode(error)) };
    }
  }
  return { ok: false, message: describeAvError(lastError) };
}

/** Stops the audio recording. A recording that produced no usable file is reported as a failure. */
export async function endAudioCapture(): Promise<
  { ok: true; result: AudioCaptureResult } | Failure
> {
  if (NativeAudioInput == null) {
    return { ok: false, message: describeAvError('MODULE_UNAVAILABLE') };
  }
  try {
    const result = parseAudioCaptureResult(await NativeAudioInput.stopAudioCapture());
    if (!result.ok) {
      return { ok: false, message: describeAvError(result.error) };
    }
    return { ok: true, result };
  } catch (error) {
    return { ok: false, message: describeAvError(errorCode(error)) };
  }
}

export async function mergeAv(
  videoPath: string,
  audioPath: string,
  videoStartUs: number,
  audioStartUs: number,
  videoLatencyMs: number,
): Promise<{ ok: true; result: MergeResult } | Failure> {
  if (NativeAudioInput == null) {
    return { ok: false, message: describeAvError('MODULE_UNAVAILABLE') };
  }
  try {
    const result = parseMergeResult(
      await NativeAudioInput.mergeRecording(
        videoPath,
        audioPath,
        videoStartUs,
        audioStartUs,
        videoLatencyMs,
      ),
    );
    if (!result.ok) {
      return { ok: false, message: describeAvError(result.error) };
    }
    return { ok: true, result };
  } catch (error) {
    return { ok: false, message: describeAvError(errorCode(error)) };
  }
}