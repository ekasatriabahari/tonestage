import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioInputDevice } from '../native/audioDevices';
import { listAudioInputs } from '../native/audioInput';

export type AudioInputsState =
  | { kind: 'loading' }
  | { kind: 'ready'; devices: AudioInputDevice[] }
  | { kind: 'error'; message: string };

const POLL_INTERVAL_MS = 2000;

/**
 * Keeps the list of audio inputs up to date while `enabled` (re-checks every 2 s, so plugging
 * in or removing the USB device shows up without pressing anything).
 */
export function useAudioInputs(enabled: boolean) {
  const [state, setState] = useState<AudioInputsState>({ kind: 'loading' });
  const lastRaw = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await listAudioInputs();
    if (!result.ok) {
      lastRaw.current = null;
      setState({ kind: 'error', message: result.message });
      return;
    }
    if (result.raw !== lastRaw.current) {
      lastRaw.current = result.raw;
      setState({ kind: 'ready', devices: result.devices });
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    refresh();
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [enabled, refresh]);

  return { state, refresh };
}