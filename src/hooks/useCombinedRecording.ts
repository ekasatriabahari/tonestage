import { useCallback, useEffect, useRef, useState } from 'react';
import { listAudioInputs } from '../native/audioInput';
import { exportRecordedFile } from '../native/audioTest';
import {
  type AudioCaptureResult,
  type AudioChoice,
  clampLatencyMs,
  type MergeResult,
  pickAudioInput,
} from '../native/avRecording';
import { beginAudioCapture, endAudioCapture, mergeAv } from '../native/avTest';
import type { RecordingEvent, RecordingStats } from '../native/yiVideo';

export type RecPhase = 'idle' | 'starting' | 'recording' | 'stopping' | 'finished' | 'error';

/**
 * Orchestrates one recording: video (native view, controlled by the `videoRecording` flag) and
 * optionally audio (native module), then merges them into one MP4. The raw video and audio files
 * are kept so the merge can be repeated with a different video delay.
 */
export function useCombinedRecording() {
  const [videoReady, setVideoReady] = useState(false);
  const [includeAudio, setIncludeAudio] = useState(true);
  const [phase, setPhase] = useState<RecPhase>('idle');
  const [videoRecording, setVideoRecording] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [audioChoice, setAudioChoice] = useState<AudioChoice | null>(null);
  const [since, setSince] = useState(0);
  const [videoStats, setVideoStats] = useState<RecordingStats | null>(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const [audioResult, setAudioResult] = useState<AudioCaptureResult | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [merge, setMerge] = useState<MergeResult | null>(null);
  const [merging, setMerging] = useState(false);
  const [latencyMs, setLatencyState] = useState(0);
  const [saved, setSaved] = useState<string[]>([]);
  const audioActive = useRef(false);
  const autoMerged = useRef(false);

  const reset = useCallback(() => {
    setMessage(null);
    setVideoStats(null);
    setVideoFailed(false);
    setAudioResult(null);
    setAudioError(null);
    setMerge(null);
    setSaved([]);
    autoMerged.current = false;
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

  const start = useCallback(async () => {
    reset();
    setPhase('starting');
    if (includeAudio) {
      const listing = await listAudioInputs();
      if (!listing.ok) {
        setMessage(listing.message);
        setPhase('error');
        return;
      }
      const choice = pickAudioInput(listing.devices);
      if (choice === null) {
        setMessage('Tidak ada input audio yang dapat dipakai.');
        setPhase('error');
        return;
      }
      setAudioChoice(choice);
      const began = await beginAudioCapture(choice.id);
      if (!began.ok) {
        setMessage(began.message);
        setPhase('error');
        return;
      }
      audioActive.current = true;
    }
    setVideoRecording(true);
  }, [includeAudio, reset]);

  const stop = useCallback(async () => {
    if (phase !== 'starting' && phase !== 'recording') {
      return;
    }
    setPhase('stopping');
    setVideoRecording(false); // the preview then reports the video result
    await finishAudio();
  }, [phase, finishAudio]);

  const onVideoEvent = useCallback((event: RecordingEvent) => {
    if (event.kind === 'started') {
      setPhase(p => (p === 'starting' ? 'recording' : p));
      setSince(Date.now());
    } else if (event.kind === 'finished') {
      setVideoStats(event.stats);
      setVideoRecording(false);
    } else {
      setVideoFailed(true);
      setMessage(event.message);
      setVideoRecording(false);
    }
  }, []);

  // Once the video result and (if wanted) the audio result are both in, finish and merge.
  useEffect(() => {
    if (phase !== 'stopping') {
      return;
    }
    const videoDone = videoStats !== null || videoFailed;
    const audioDone = !includeAudio || audioResult !== null || audioError !== null;
    if (!videoDone || !audioDone) {
      return;
    }
    if (videoStats === null) {
      setPhase('error');
      return;
    }
    setPhase('finished');
    if (includeAudio && audioResult !== null && !autoMerged.current) {
      autoMerged.current = true;
      setMerging(true);
      mergeAv(
        videoStats.path,
        audioResult.path,
        videoStats.firstSampleUs,
        audioResult.startUs,
        latencyMs,
      ).then(result => {
        setMerging(false);
        if (result.ok) {
          setMerge(result.result);
        } else {
          setMessage(result.message);
        }
      });
    }
  }, [phase, videoStats, videoFailed, audioResult, audioError, includeAudio, latencyMs]);

  /** Redo the merge from the saved raw files with another video delay. */
  const remerge = useCallback(async () => {
    if (videoStats === null || audioResult === null || merging) {
      return;
    }
    setMerging(true);
    setMessage(null);
    const result = await mergeAv(
      videoStats.path,
      audioResult.path,
      videoStats.firstSampleUs,
      audioResult.startUs,
      latencyMs,
    );
    setMerging(false);
    if (result.ok) {
      setMerge(result.result);
      setSaved([]);
    } else {
      setMessage(result.message);
    }
  }, [videoStats, audioResult, latencyMs, merging]);

  const adjustLatency = useCallback((deltaMs: number) => {
    setLatencyState(prev => clampLatencyMs(prev + deltaMs));
  }, []);

  const setLatency = useCallback((ms: number) => {
    setLatencyState(clampLatencyMs(ms));
  }, []);

  const saveAll = useCallback(async () => {
    const paths: string[] = [];
    if (merge !== null && merge.path !== '') {
      paths.push(merge.path);
    }
    if (videoStats !== null && videoStats.path !== '') {
      paths.push(videoStats.path);
    }
    if (audioResult !== null && audioResult.path !== '') {
      paths.push(audioResult.path);
    }
    const locations: string[] = [];
    for (const path of paths) {
      const result = await exportRecordedFile(path);
      if (result.ok) {
        locations.push(result.location);
      } else {
        setMessage(result.message);
      }
    }
    setSaved(locations);
  }, [merge, videoStats, audioResult]);

  /** Stops everything, for example when the camera connection is lost. */
  const abort = useCallback(
    async (reason: string) => {
      if (phase !== 'starting' && phase !== 'recording' && phase !== 'stopping') {
        return;
      }
      setVideoRecording(false);
      await finishAudio();
      setMessage(reason);
      setPhase('error');
    },
    [phase, finishAudio],
  );

  // Release the microphone if the screen goes away mid-recording.
  useEffect(() => {
    return () => {
      if (audioActive.current) {
        audioActive.current = false;
        endAudioCapture();
      }
    };
  }, []);

  return {
    videoReady,
    setVideoReady,
    includeAudio,
    setIncludeAudio,
    phase,
    videoRecording,
    message,
    audioChoice,
    since,
    videoStats,
    audioResult,
    audioError,
    merge,
    merging,
    latencyMs,
    saved,
    start,
    stop,
    onVideoEvent,
    remerge,
    adjustLatency,
    setLatency,
    saveAll,
    abort,
  };
}

export type CombinedRecording = ReturnType<typeof useCombinedRecording>;