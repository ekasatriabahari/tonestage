import { useCallback, useEffect, useMemo, useState } from 'react';
import { type MeterState, nextMeterState, resetClipping } from '../native/audioMeter';
import {
  lastBackingFile,
  listBackingOutputs,
  loadBackingTrack,
  loadMixerJson,
  pauseBacking,
  pickBackingFile,
  playBacking,
  readBackingStatus,
  saveMixerJson,
  seekBacking,
  setBackingEq,
  setBackingGain,
  setBackingMaster,
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
import { type EqSettings, serializeEq } from '../native/eq';
import { averageLatency, pushLatency } from '../native/mixerLogic';
import { DEFAULT_MIXER, parseMixerSettings, serializeMixerSettings } from '../native/mixerSettings';

const STATUS_POLL_MS = 150;
const DEVICE_POLL_MS = 2000;
const SAVE_DELAY_MS = 600;

/**
 * State for the backing track and the mixer settings. Playback itself lives in native code and
 * keeps running when a screen is hidden; this hook only reads the status while `active` is true.
 * Mixer settings are saved on the phone and restored the next time the app starts.
 */
export function useBackingTrack(active: boolean) {
  const [loaded, setLoaded] = useState<LoadedTrack | null>(null);
  const [lastFile, setLastFile] = useState<{ uri: string; name: string } | null>(null);
  const [status, setStatus] = useState<BackingStatus | null>(null);
  const [devices, setDevices] = useState<OutputDevice[]>([]);
  const [outputId, setOutputId] = useState(-1);
  const [volume, setVolumeState] = useState(DEFAULT_MIXER.backingVolume);
  const [muted, setMuted] = useState(DEFAULT_MIXER.backingMuted);
  const [masterVolume, setMasterVolumeState] = useState(DEFAULT_MIXER.masterVolume);
  const [guitarVolume, setGuitarVolumeState] = useState(DEFAULT_MIXER.guitarVolume);
  const [guitarMuted, setGuitarMuted] = useState(DEFAULT_MIXER.guitarMuted);
  const [eq, setEqState] = useState<EqSettings>(DEFAULT_MIXER.eq);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [meter, setMeter] = useState<MeterState | null>(null);
  const [latencyHistory, setLatencyHistory] = useState<number[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    lastBackingFile().then(setLastFile);
  }, []);

  // Restore the saved mixer settings once.
  useEffect(() => {
    loadMixerJson().then(json => {
      if (json !== null && json !== '') {
        const saved = parseMixerSettings(json);
        setVolumeState(saved.backingVolume);
        setMuted(saved.backingMuted);
        setMasterVolumeState(saved.masterVolume);
        setGuitarVolumeState(saved.guitarVolume);
        setGuitarMuted(saved.guitarMuted);
        setEqState(saved.eq);
      }
      setSettingsLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const poll = async () => {
      const s = await readBackingStatus();
      if (s === null) {
        return;
      }
      setStatus(s);
      setMeter(prev => nextMeterState(prev, statusToMeterSnapshot(s), Date.now()));
      if (s.state === 'playing') {
        setLatencyHistory(prev => pushLatency(prev, s.outputLatencyMs));
      } else if (s.state !== 'paused') {
        setLatencyHistory(prev => (prev.length === 0 ? prev : []));
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

  // Volume, mute, master and EQ are applied in native code whenever they change or a file is loaded.
  useEffect(() => {
    setBackingGain(volume, muted);
  }, [volume, muted, loaded]);

  useEffect(() => {
    setBackingMaster(masterVolume);
  }, [masterVolume, loaded]);

  useEffect(() => {
    setBackingEq(serializeEq(eq));
  }, [eq, loaded]);

  // Save the settings shortly after the last change (not before the saved ones were restored).
  useEffect(() => {
    if (!settingsLoaded) {
      return undefined;
    }
    const id = setTimeout(() => {
      saveMixerJson(
        serializeMixerSettings({
          backingVolume: volume,
          backingMuted: muted,
          masterVolume,
          guitarVolume,
          guitarMuted,
          eq,
        }),
      );
    }, SAVE_DELAY_MS);
    return () => clearTimeout(id);
  }, [settingsLoaded, volume, muted, masterVolume, guitarVolume, guitarMuted, eq]);

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
  const setMasterVolume = useCallback((v: number) => setMasterVolumeState(clampVolume(v)), []);
  const setGuitarVolume = useCallback((v: number) => setGuitarVolumeState(clampVolume(v)), []);
  const toggleMute = useCallback(() => setMuted(m => !m), []);
  const toggleGuitarMute = useCallback(() => setGuitarMuted(m => !m), []);
  const setEq = useCallback((next: EqSettings) => setEqState(next), []);

  const resetClip = useCallback(() => {
    setMeter(prev => (prev === null ? prev : resetClipping(prev)));
  }, []);

  const selectOutput = useCallback(async (id: number) => {
    if (await setBackingOutput(id)) {
      setOutputId(id);
    } else {
      setMessage(describeBackingError('DEVICE_NOT_FOUND'));
    }
  }, []);

  const avgLatency = useMemo(() => averageLatency(latencyHistory), [latencyHistory]);

  return {
    loaded,
    lastFile,
    status,
    devices,
    outputId,
    volume,
    muted,
    masterVolume,
    guitarVolume,
    guitarMuted,
    eq,
    avgLatency,
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
    setMasterVolume,
    setGuitarVolume,
    setEq,
    toggleMute,
    toggleGuitarMute,
    resetClip,
    selectOutput,
  };
}

export type BackingTrack = ReturnType<typeof useBackingTrack>;