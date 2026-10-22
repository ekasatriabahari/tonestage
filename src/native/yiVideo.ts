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