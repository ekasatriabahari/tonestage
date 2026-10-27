import { useCallback, useEffect, useState } from 'react';
import { type MeterState, nextMeterState } from '../native/audioMeter';
import {
  lastBackingFile,
  listBackingOutputs,
  loadBackingTrack,
  pauseBacking,
  pickBackingFile,
  playBacking,
  readBackingStatus,
  seekBacking,
  setBackingGain,
  setBackingOutput,
  stopBacking,
} from '../native/backingTrack';
import {
  type BackingStatus,
  clampVolume,
  describeBackingError,
  type LoadedTrack,
  type OutputDevice,
  statusToMeterSnapshot,
} from '../native/backingTrackLogic';

const STATUS_POLL_MS = 150;
const DEVICE_POLL_MS = 2000;

/**
 * State for the backing-track screen. Playback itself lives in native code and keeps running
 * when the screen is hidden; this hook only reads the status while `active` is true.
 */
export function useBackingTrack(active: boolean) {
  const [loaded, setLoaded] = useState<LoadedTrack | null>(null);
  const [lastFile, setLastFile] = useState<{ uri: string; name: string } | null>(null);
  const [status, setStatus] = useState<BackingStatus | null>(null);
  const [devices, setDevices] = useState<OutputDevice[]>([]);
  const [outputId, setOutputId] = useState(-1);
  const [volume, setVolumeState] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [meter, setMeter] = useState<MeterState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    lastBackingFile().then(setLastFile);
  }, []);

  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const poll = async () => {
      const s = await readBackingStatus();
      if (s !== null) {
        setStatus(s);
        setMeter(prev => nextMeterState(prev, statusToMeterSnapshot(s), Date.now()));
      }
    };
    poll();
    const id = setInterval(poll, STATUS_POLL_MS);
    return () => clearInterval(id);
  }, [active]);

  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const poll = async () => {
      const list = await listBackingOutputs();
      if (list !== null) {
        setDevices(list);
      }
    };
    poll();
    const id = setInterval(poll, DEVICE_POLL_MS);
    return () => clearInterval(id);
  }, [active]);

  // Volume and mute are applied in native code whenever they change or a file is loaded.
  useEffect(() => {
    setBackingGain(volume, muted);
  }, [volume, muted, loaded]);

  const loadFromUri = useCallback(async (uri: string) => {
    const result = await loadBackingTrack(uri);
    if (result.ok) {
      setLoaded(result.track);
      setMessage(null);
    } else {
      setLoaded(null);
      setMessage(result.message);
    }
  }, []);

  const pick = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    const picked = await pickBackingFile();
    if (picked.ok) {
      await loadFromUri(picked.uri);
      setLastFile({ uri: picked.uri, name: picked.name });
    } else if (picked.message !== '') {
      setMessage(picked.message);
    }
    setBusy(false);
  }, [loadFromUri]);

  const useLast = useCallback(async () => {
    if (lastFile === null) {
      return;
    }
    setBusy(true);
    await loadFromUri(lastFile.uri);
    setBusy(false);
  }, [lastFile, loadFromUri]);

  const play = useCallback(async () => {
    if (!(await playBacking())) {
      setMessage(describeBackingError('PLAYBACK_FAILED'));
    }
  }, []);

  const pause = useCallback(async () => {
    await pauseBacking();
  }, []);

  const stop = useCallback(async () => {
    await stopBacking();
  }, []);

  const seekTo = useCallback(async (positionMs: number) => {
    await seekBacking(positionMs);
  }, []);

  const seekBy = useCallback(
    async (deltaMs: number) => {
      const current = status === null ? 0 : status.positionMs;
      const limit = loaded === null ? 0 : loaded.durationMs;
      await seekBacking(Math.min(limit, Math.max(0, current + deltaMs)));
    },
    [status, loaded],
  );

  const setVolume = useCallback((v: number) => setVolumeState(clampVolume(v)), []);
  const toggleMute = useCallback(() => setMuted(m => !m), []);

  const selectOutput = useCallback(async (id: number) => {
    if (await setBackingOutput(id)) {
      setOutputId(id);
    } else {
      setMessage(describeBackingError('DEVICE_NOT_FOUND'));
    }
  }, []);

  return {
    loaded,
    lastFile,
    status,
    devices,
    outputId,
    volume,
    muted,
    meter,
    message,
    busy,
    pick,
    useLast,
    play,
    pause,
    stop,
    seekTo,
    seekBy,
    setVolume,
    toggleMute,
    selectOutput,
  };
}