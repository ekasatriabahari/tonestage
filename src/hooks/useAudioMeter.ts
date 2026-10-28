import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type MeterState,
  nextMeterState,
  resetClipping,
} from '../native/audioMeter';
import { describeAudioTestError } from '../native/audioProbe';
import {
  readAudioMeter,
  startAudioMeter,
  stopAudioMeter,
} from '../native/audioTest';

export type MeterStatus =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | {
      kind: 'running';
      sampleRate: number;
      channels: number;
      source: string;
      routedToSelected: boolean;
    }
  | { kind: 'error'; message: string };

const POLL_MS = 60;

/**
 * Live level meter for one input device. It runs only after start() is called, and it stops
 * by itself when the tab is hidden, the device disappears or another test takes the device.
 */
export function useAudioMeter(deviceId: number, active: boolean) {
  const [status, setStatus] = useState<MeterStatus>({ kind: 'idle' });
  const [meter, setMeter] = useState<MeterState | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  const stop = useCallback(async () => {
    clearTimer();
    await stopAudioMeter();
    setStatus({ kind: 'idle' });
    setMeter(null);
  }, [clearTimer]);

  const start = useCallback(async () => {
    clearTimer();
    setStatus({ kind: 'starting' });
    setMeter(null);
    const result = await startAudioMeter(deviceId);
    if (!result.ok) {
      setStatus({ kind: 'error', message: result.message });
      return;
    }
    setStatus({
      kind: 'running',
      sampleRate: result.sampleRate,
      channels: result.channels,
      source: result.source,
      routedToSelected: false,
    });
    timer.current = setInterval(async () => {
      const snap = await readAudioMeter();
      if (snap === null) {
        return;
      }
      if (!snap.running) {
        clearTimer();
        setMeter(null);
        setStatus({
          kind: 'error',
          message:
            snap.error !== ''
              ? describeAudioTestError(snap.error)
              : 'Meter dihentikan (perangkat dipakai oleh uji lain).',
        });
        return;
      }
      setMeter(prev => nextMeterState(prev, snap, Date.now()));
      setStatus(prev =>
        prev.kind === 'running' && prev.routedToSelected !== snap.routedToSelected
          ? { ...prev, routedToSelected: snap.routedToSelected }
          : prev,
      );
    }, POLL_MS);
  }, [deviceId, clearTimer]);

  const resetClip = useCallback(() => {
    setMeter(prev => (prev === null ? prev : resetClipping(prev)));
  }, []);

  // Leaving the Audio tab releases the input.
  useEffect(() => {
    if (!active) {
      stop();
    }
  }, [active, stop]);

  useEffect(() => {
    return () => {
      clearTimer();
      stopAudioMeter();
    };
  }, [clearTimer]);

  return { status, meter, start, stop, resetClip };
}