import NativeAudioInput from '../../specs/NativeAudioInput';
import { type AudioInputDevice, parseAudioDevices } from './audioDevices';

export type AudioInputResult =
  | { ok: true; raw: string; devices: AudioInputDevice[] }
  | { ok: false; message: string };

export function isAudioInputAvailable(): boolean {
  return NativeAudioInput != null;
}

/** Lists audio inputs. Never throws; `raw` lets callers skip re-rendering when nothing changed. */
export async function listAudioInputs(): Promise<AudioInputResult> {
  if (NativeAudioInput == null) {
    return {
      ok: false,
      message: 'Modul audio tidak tersedia di build ini.',
    };
  }
  try {
    const raw = await NativeAudioInput.getInputDevices();
    return { ok: true, raw, devices: parseAudioDevices(raw) };
  } catch {
    return {
      ok: false,
      message: 'Gagal membaca daftar perangkat audio dari Android.',
    };
  }
}