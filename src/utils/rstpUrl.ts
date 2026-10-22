/** Commonly reported RTSP address of the Xiaomi Yi Action Camera Gen 1. Not guaranteed for every firmware. */
export const DEFAULT_YI_RTSP_URL = 'rtsp://192.168.42.1/live';

const RTSP_PATTERN = /^rtsp:\/\/([A-Za-z0-9.-]+)(?::(\d+))?(\/\S*)?$/;

/**
 * Checks only the *format* of an RTSP URL. It does not prove the camera is reachable.
 * Returns an Indonesian error message, or null when the format is acceptable.
 */
export function validateRtspUrl(raw: string): string | null {
  const url = raw.trim();
  if (url.length === 0) {
    return 'Alamat RTSP tidak boleh kosong.';
  }
  const match = RTSP_PATTERN.exec(url);
  if (match === null) {
    return 'Format harus rtsp://alamat[:port]/jalur, contoh rtsp://192.168.42.1/live.';
  }
  const portText = match[2];
  if (portText !== undefined) {
    const port = Number(portText);
    if (port < 1 || port > 65535) {
      return 'Port harus antara 1 dan 65535.';
    }
  }
  return null;
}

/** Returns the host part of a valid RTSP URL (the camera address), or null if the URL is invalid. */
export function extractRtspHost(raw: string): string | null {
  if (validateRtspUrl(raw) !== null) {
    return null;
  }
  const match = RTSP_PATTERN.exec(raw.trim());
  return match === null ? null : match[1];
}