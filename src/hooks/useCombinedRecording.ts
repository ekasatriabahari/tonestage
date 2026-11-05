import { useCallback, useEffect, useRef, useState } from 'react';
import { listAudioInputs } from '../native/audioInput';
import {
  type AudioCaptureResult,
  type AudioChoice,
  pickAudioInput,
} from '../native/avRecording';
import { beginAudioCapture, endAudioCapture } from '../native/avTest';
import { type BackingLog } from '../native/backingTrackLogic';
import { startBackingLog, stopBackingLog } from '../native/backingTrack';
import {
  buildManifest,
  MIN_FREE_BYTES_TO_RECORD,
  type StorageInfo,
} from '../native/session';
import {
  copyBackingTrackToSession,
  createSessionFolder,
  generateSessionThumbnail,
  readStorage,
  removeSession,
  saveSessionManifest,
} from '../native/sessions';
import type { MixerSettings } from '../native/mixerSettings';
import type { RecordingEvent, RecordingStats } from '../native/yiVideo';
import type { BackingTrack } from './useBackingTrack';

export type RecPhase =
  | 'idle'
  | 'starting'
  | 'recording'
  | 'stopping'
  | 'finished'
  | 'error';

type SessionRef = {
  id: string;
  createdMs: number;
  videoPath: string;
  audioPath: string;
  backingUri: string | null;
};

/**
 * One recording = one session folder holding the raw video, the clean guitar WAV and a manifest.
 * The backing track is NOT recorded: only which parts of it were playing (and when) is logged, plus
 * the mixer settings in use, so the export can rebuild exactly what you heard. Nothing here changes
 * the raw files, and a failed export never deletes them.
 */
export function useCombinedRecording(backing: BackingTrack) {
  const [videoReady, setVideoReady] = useState(false);
  const [phase, setPhase] = useState<RecPhase>('idle');
  const [videoRecordingPath, setVideoRecordingPath] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [audioChoice, setAudioChoice] = useState<AudioChoice | null>(null);
  const [since, setSince] = useState(0);
  const [videoStats, setVideoStats] = useState<RecordingStats | null>(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const [audioResult, setAudioResult] = useState<AudioCaptureResult | null>(
    null,
  );
  const [audioError, setAudioError] = useState<string | null>(null);
  const [backingLog, setBackingLog] = useState<BackingLog | null>(null);
  const [logDone, setLogDone] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [storage, setStorage] = useState<StorageInfo | null>(null);

  const audioActive = useRef(false);
  const logActive = useRef(false);
  const saving = useRef(false);
  const session = useRef<SessionRef | null>(null);
  const mixer = useRef<MixerSettings | null>(null);
  const latest = useRef(backing);
  useEffect(() => {
    latest.current = backing;
  }, [backing]);

  useEffect(() => {
    readStorage().then(setStorage);
  }, [phase]);

  const reset = useCallback(() => {
    setMessage(null);
    setVideoStats(null);
    setVideoFailed(false);
    setAudioResult(null);
    setAudioError(null);
    setBackingLog(null);
    setLogDone(false);
    setSavedId(null);
    saving.current = false;
  }, []);

  const finishAudio = useCallback(async () => {
    if (!audioActive.current) {
      return;
    }
    audioActive.current = false;
    const result = await endAudioCapture();
    if (result.ok) {
      setAudioResult(result.result);
    } else {
      setAudioError(result.message);
    }
  }, []);

  const finishLog = useCallback(async () => {
    if (logActive.current) {
      logActive.current = false;
      setBackingLog(await stopBackingLog());
    }
    setLogDone(true);
  }, []);

  const start = useCallback(async () => {
    reset();
    setPhase('starting');
    const fail = async (text: string) => {
      await finishAudio();
      await finishLog();
      const current = session.current;
      if (current !== null) {
        await saveSessionManifest(current.id, JSON.stringify({
          version: 2,
          id: current.id,
          createdMs: current.createdMs,
          status: 'interrupted',
          title: 'Guitar Cover',
          video: { path: current.videoPath },
          guitar: { path: current.audioPath },
        }));
      }
      setMessage(text);
      setPhase('error');
    };

    const space = await readStorage();
    if (space !== null && space.availableBytes < MIN_FREE_BYTES_TO_RECORD) {
      await fail(
        'Ruang penyimpanan hampir habis. Hapus sesi lama di tab Proyek, lalu coba lagi.',
      );
      return;
    }
    const listing = await listAudioInputs();
    if (!listing.ok) {
      await fail(listing.message);
      return;
    }
    const choice = pickAudioInput(listing.devices);
    if (choice === null) {
      await fail('Tidak ada input audio yang dapat dipakai.');
      return;
    }
    const created = await createSessionFolder();
    if (!created.ok) {
      await fail(created.message);
      return;
    }
    const b = latest.current;
    let projectBackingUri: string | null = null;
    if (b.loadedUri !== null && b.loaded !== null) {
      projectBackingUri = await copyBackingTrackToSession(created.id, b.loadedUri, b.loaded.name);
      if (projectBackingUri === null) {
        await removeSession(created.id);
        await fail('Backing track tidak dapat disalin ke project. Pilih ulang file lalu coba lagi.');
        return;
      }
    }
    session.current = { ...created, backingUri: projectBackingUri };
    // The mixer settings in use when recording starts are the ones the export will use.
    mixer.current = {
      backingVolume: b.volume,
      backingMuted: b.muted,
      masterVolume: b.masterVolume,
      guitarVolume: b.guitarVolume,
      guitarMuted: b.guitarMuted,
      eq: b.eq,
      exportDefaults: { ...b.exportDefaults },
    };
    await startBackingLog();
    logActive.current = true;
    const began = await beginAudioCapture(choice.id, created.audioPath);
    if (!began.ok) {
      await fail(began.message);
      return;
    }
    audioActive.current = true;
    setAudioChoice(choice);
    setVideoRecordingPath(created.videoPath);
  }, [reset, finishAudio, finishLog]);

  const stop = useCallback(async () => {
    if (phase !== 'starting' && phase !== 'recording') {
      return;
    }
    setPhase('stopping');
    setVideoRecordingPath(''); // the preview then reports the video result
    await finishAudio();
    await finishLog();
  }, [phase, finishAudio, finishLog]);

  const onVideoEvent = useCallback((event: RecordingEvent) => {
    if (event.kind === 'started') {
      setPhase(p => (p === 'starting' ? 'recording' : p));
      setSince(Date.now());
    } else if (event.kind === 'finished') {
      setVideoStats(event.stats);
      setVideoRecordingPath('');
    } else {
      setVideoFailed(true);
      setMessage(event.message);
      setVideoRecordingPath('');
    }
  }, []);

  // When the video result, the audio result and the playback log are all in: save the manifest.
  useEffect(() => {
    if (phase !== 'stopping' || saving.current) {
      return;
    }
    const videoDone = videoStats !== null || videoFailed;
    const audioDone = audioResult !== null || audioError !== null;
    if (!videoDone || !audioDone || !logDone) {
      return;
    }
    const current = session.current;
    if (videoStats === null || current === null || mixer.current === null) {
      if (current !== null) {
        saveSessionManifest(current.id, JSON.stringify({
          version: 2,
          id: current.id,
          createdMs: current.createdMs,
          status: 'interrupted',
          title: 'Guitar Cover',
          video: { path: current.videoPath },
          guitar: { path: current.audioPath },
        }));
      }
      setPhase('error');
      return;
    }
    saving.current = true;
    const b = latest.current;
    const manifest = buildManifest({
      id: current.id,
      createdMs: current.createdMs,
      video: videoStats,
      audio: audioResult,
      audioDevice: audioChoice,
      backing:
        backingLog !== null && current.backingUri !== null
          ? {
              uri: current.backingUri,
              name: b.loaded === null ? '' : b.loaded.name,
              log: backingLog,
            }
          : null,
      mixer: mixer.current,
    });
    (async () => {
      // Thumbnail is derived from the raw video; the source is never modified.
      await generateSessionThumbnail(current.id);
      const ok = await saveSessionManifest(current.id, JSON.stringify(manifest));
      if (ok) {
        setSavedId(current.id);
        setPhase('finished');
      } else {
        setMessage('Manifest sesi tidak dapat disimpan. File mentah masih ada di tab Proyek.');
        setPhase('error');
      }
    })();
  }, [
    phase,
    videoStats,
    videoFailed,
    audioResult,
    audioError,
    logDone,
    audioChoice,
    backingLog,
  ]);

  /** Stops everything, for example when the camera connection is lost. Files already written stay. */
  const abort = useCallback(
    async (reason: string) => {
      if (
        phase !== 'starting' &&
        phase !== 'recording' &&
        phase !== 'stopping'
      ) {
        return;
      }
      setVideoRecordingPath('');
      await finishAudio();
      await finishLog();
      setMessage(reason);
      setPhase('error');
    },
    [phase, finishAudio, finishLog],
  );

  // Release the microphone and the log if the screen goes away mid-recording.
  useEffect(() => {
    return () => {
      if (audioActive.current) {
        audioActive.current = false;
        endAudioCapture();
      }
      if (logActive.current) {
        logActive.current = false;
        stopBackingLog();
      }
    };
  }, []);

  return {
    videoReady,
    setVideoReady,
    phase,
    videoRecordingPath,
    message,
    audioChoice,
    since,
    videoStats,
    audioResult,
    audioError,
    savedId,
    storage,
    start,
    stop,
    onVideoEvent,
    abort,
  };
}

export type CombinedRecording = ReturnType<typeof useCombinedRecording>;
