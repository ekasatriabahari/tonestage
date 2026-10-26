/** Payload sent by the native YiVideoView (see specs/YiVideoViewNativeComponent.ts). */
export type PlayerStatePayload = {
  state: string;
  width: number;
  height: number;
  message: string;
};

export type VideoState =
  | { kind: 'preparing' }
  | { kind: 'playing'; width: number; height: number }
  | { kind: 'error'; code: string };

/** "playing" is only reported by native code after the first video frame was really rendered. */
export function parsePlayerEvent(payload: PlayerStatePayload): VideoState {
  switch (payload.state) {
    case 'playing':
      return { kind: 'playing', width: payload.width, height: payload.height };
    case 'error':
      return { kind: 'error', code: payload.message };
    default:
      return { kind: 'preparing' };
  }
}

/** Indonesian explanation for a native player error code (Media3 error names or our own). */
export function describeVideoError(code: string): string {
  if (code === 'NO_WIFI') {
    return 'Ponsel tidak terhubung ke Wi-Fi kamera.';
  }
  if (code === 'STREAM_ENDED') {
    return 'Kamera berhenti mengirim video.';
  }
  if (code.startsWith('ERROR_CODE_IO_') || code.startsWith('ERROR_CODE_TIMEOUT')) {
    return 'Tidak dapat mengambil aliran video dari kamera.';
  }
  if (code.startsWith('ERROR_CODE_DECOD') || code.startsWith('ERROR_CODE_PARSING')) {
    return 'Format video dari kamera tidak dapat diputar.';
  }
  return `Pemutaran gagal (kode: ${code || 'tidak diketahui'}).`;
}

/** Aspect ratio for the preview box: the real video shape once known, 16:9 before that. */
export function previewAspectRatio(state: VideoState): number {
  if (state.kind === 'playing' && state.width > 0 && state.height > 0) {
    return state.width / state.height;
  }
  return 16 / 9;
}

/** Result of a test recording of the camera stream, as measured by native code (StreamRecorder.kt). */
export type RecordingStats = {
  ok: boolean;
  error: string;
  path: string;
  width: number;
  height: number;
  frames: number;
  keyFrames: number;
  bytes: number;
  mediaDurationMs: number;
  wallMs: number;
  waitedForKeyframeMs: number;
  skippedBeforeStart: number;
  nonMonotonic: number;
  csdFromFormat: boolean;
  /** Time of the first video sample on the System.nanoTime() clock (microseconds). */
  firstSampleUs: number;
};

/** What the preview reports about a video recording. */
export type RecordingEvent =
  | { kind: 'started' }
  | { kind: 'finished'; stats: RecordingStats }
  | { kind: 'failed'; message: string };

const num = (v: unknown): number => (typeof v === 'number' ? v : 0);

/** Throws on invalid JSON. Missing fields become 0 / false / '', never invented values. */
export function parseRecordingStats(json: string): RecordingStats {
  const data: unknown = JSON.parse(json);
  const e = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  return {
    ok: e.ok === true,
    error: typeof e.error === 'string' ? e.error : '',
    path: typeof e.path === 'string' ? e.path : '',
    width: num(e.width),
    height: num(e.height),
    frames: num(e.frames),
    keyFrames: num(e.keyFrames),
    bytes: num(e.bytes),
    mediaDurationMs: num(e.mediaDurationMs),
    wallMs: num(e.wallMs),
    waitedForKeyframeMs: num(e.waitedForKeyframeMs),
    skippedBeforeStart: num(e.skippedBeforeStart),
    nonMonotonic: num(e.nonMonotonic),
    csdFromFormat: e.csdFromFormat === true,
    firstSampleUs: num(e.firstSampleUs),
  };
}

export function describeRecordingError(code: string): string {
  switch (code) {
    case 'NO_KEYFRAME':
      return 'Tidak ada keyframe yang diterima sebelum rekaman dihentikan. Coba rekam lebih lama.';
    case 'NO_FRAMES':
      return 'Tidak ada frame video yang berhasil ditulis.';
    case 'NO_FORMAT':
      return 'Ukuran video dari kamera tidak diketahui.';
    case 'UNSUPPORTED_SAMPLE_FORMAT':
      return 'Format data video dari kamera tidak dikenali.';
    case 'MUXER_START_FAILED':
    case 'MUXER_WRITE_FAILED':
    case 'MUXER_STOP_FAILED':
      return `Penulisan file MP4 gagal (kode: ${code}).`;
    default:
      return `Perekaman gagal (kode: ${code || 'tidak diketahui'}).`;
  }
}

/** Human-readable lines for a finished recording. Only measured values are shown. */
export function summarizeRecording(s: RecordingStats): string[] {
  const lines: string[] = [];
  lines.push(`Resolusi: ${s.width}x${s.height}`);
  const mediaSec = s.mediaDurationMs / 1000;
  const wallSec = s.wallMs / 1000;
  if (mediaSec > 0) {
    lines.push(
      `Frame: ${s.frames} (${s.keyFrames} keyframe), rata-rata ${(s.frames / mediaSec).toFixed(1)} fps`,
    );
  } else {
    lines.push(`Frame: ${s.frames} (${s.keyFrames} keyframe)`);
  }
  lines.push(
    `Durasi isi file: ${mediaSec.toFixed(2)} dtk | waktu nyata: ${wallSec.toFixed(2)} dtk | selisih: ${(mediaSec - wallSec).toFixed(2)} dtk`,
  );
  const kb = Math.round(s.bytes / 1024);
  lines.push(
    mediaSec > 0
      ? `Ukuran video: ${kb} KB (rata-rata ${Math.round((s.bytes * 8) / mediaSec / 1000)} kbps)`
      : `Ukuran video: ${kb} KB`,
  );
  lines.push(`Menunggu keyframe pertama: ${s.waitedForKeyframeMs} ms`);
  if (s.skippedBeforeStart > 0) {
    lines.push(`Frame dilewati sebelum keyframe pertama: ${s.skippedBeforeStart}`);
  }
  if (s.nonMonotonic > 0) {
    lines.push(`Timestamp mundur yang dikoreksi: ${s.nonMonotonic} kali`);
  }
  lines.push(
    s.csdFromFormat
      ? 'Parameter video (SPS/PPS) dilengkapi dari data SDP kamera.'
      : 'Parameter video (SPS/PPS) ditemukan di dalam aliran video.',
  );
  return lines;
}