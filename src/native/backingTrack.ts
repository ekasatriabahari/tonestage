import NativeBackingTrack from '../../specs/NativeBackingTrack';
import {
  type BackingStatus,
  describeBackingError,
  type LoadedTrack,
  type OutputDevice,
  parseBackingStatus,
  parseLoadedTrack,
  parseOutputDevices,
  parsePickedFile,
} from './backingTrackLogic';

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

const UNAVAILABLE: Failure = { ok: false, message: describeBackingError('MODULE_UNAVAILABLE') };

export function isBackingTrackAvailable(): boolean {
  return NativeBackingTrack != null;
}

/** Opens the document picker. A dismissed picker is reported as a failure with an empty message. */
export async function pickBackingFile(): Promise<{ ok: true; uri: string; name: string } | Failure> {
  if (NativeBackingTrack == null) {
    return UNAVAILABLE;
  }
  try {
    const file = parsePickedFile(await NativeBackingTrack.pickFile());
    return file.ok
      ? { ok: true, uri: file.uri, name: file.name }
      : { ok: false, message: describeBackingError(file.error) };
  } catch (error) {
    return { ok: false, message: describeBackingError(errorCode(error)) };
  }
}

export async function lastBackingFile(): Promise<{ uri: string; name: string } | null> {
  if (NativeBackingTrack == null) {
    return null;
  }
  try {
    const file = parsePickedFile(await NativeBackingTrack.getLastFile());
    return file.ok && file.uri !== '' ? { uri: file.uri, name: file.name } : null;
  } catch {
    return null;
  }
}

export async function loadBackingTrack(
  uri: string,
): Promise<{ ok: true; track: LoadedTrack } | Failure> {
  if (NativeBackingTrack == null) {
    return UNAVAILABLE;
  }
  try {
    const track = parseLoadedTrack(await NativeBackingTrack.load(uri));
    return track.ok ? { ok: true, track } : { ok: false, message: describeBackingError(track.error) };
  } catch (error) {
    return { ok: false, message: describeBackingError(errorCode(error)) };
  }
}

/** Transport and settings calls never throw; they return false when they did not work. */
async function call(action: (m: NonNullable<typeof NativeBackingTrack>) => Promise<void>): Promise<boolean> {
  if (NativeBackingTrack == null) {
    return false;
  }
  try {
    await action(NativeBackingTrack);
    return true;
  } catch {
    return false;
  }
}

export const playBacking = () => call(m => m.play());
export const pauseBacking = () => call(m => m.pause());
export const stopBacking = () => call(m => m.stop());
export const seekBacking = (positionMs: number) => call(m => m.seekTo(positionMs));
export const setBackingGain = (volume: number, muted: boolean) => call(m => m.setGain(volume, muted));
export const setBackingOutput = (deviceId: number) => call(m => m.setOutputDevice(deviceId));
export const unloadBacking = () => call(m => m.unload());
export const setBackingMaster = (volume: number) => call(m => m.setMasterGain(volume));
export const setBackingEq = (json: string) => call(m => m.setEq(json));

/** The saved mixer settings: '' when none were saved, null when they cannot be read. */
export async function loadMixerJson(): Promise<string | null> {
  if (NativeBackingTrack == null) {
    return null;
  }
  try {
    return await NativeBackingTrack.loadSettings();
  } catch {
    return null;
  }
}

export const saveMixerJson = (json: string) => call(m => m.saveSettings(json));

/** Null when the status cannot be read. */
export async function readBackingStatus(): Promise<BackingStatus | null> {
  if (NativeBackingTrack == null) {
    return null;
  }
  try {
    return parseBackingStatus(await NativeBackingTrack.getStatus());
  } catch {
    return null;
  }
}

export async function listBackingOutputs(): Promise<OutputDevice[] | null> {
  if (NativeBackingTrack == null) {
    return null;
  }
  try {
    return parseOutputDevices(await NativeBackingTrack.getOutputDevices());
  } catch {
    return null;
  }
}