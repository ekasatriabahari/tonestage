import NativeSessions from '../../specs/NativeSessions';
import {
  describeExportError,
  type ExportOptions,
  type ExportProgress,
  type ExportResult,
  parseExportProgress,
  parseExportResult,
  parseSessionList,
  parseStorage,
  type SessionInfo,
  type StorageInfo,
} from './session';

type Failure = { ok: false; message: string };

function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: unknown }).code;
    if (typeof code === 'string') {
      return code;
    }
  }
  return 'UNKNOWN';
}

const UNAVAILABLE: Failure = { ok: false, message: 'Modul sesi tidak tersedia di build ini.' };

export function isSessionsAvailable(): boolean {
  return NativeSessions != null;
}

export type CreatedSession = { ok: true; id: string; createdMs: number; videoPath: string; audioPath: string };

export async function createSessionFolder(): Promise<CreatedSession | Failure> {
  if (NativeSessions == null) {
    return UNAVAILABLE;
  }
  try {
    const e = JSON.parse(await NativeSessions.createSession()) as Record<string, unknown>;
    if (e.ok !== true || typeof e.id !== 'string') {
      return { ok: false, message: 'Folder sesi tidak dapat dibuat.' };
    }
    return {
      ok: true,
      id: e.id,
      createdMs: typeof e.createdMs === 'number' ? e.createdMs : Date.now(),
      videoPath: String(e.videoPath),
      audioPath: String(e.audioPath),
    };
  } catch {
    return { ok: false, message: 'Folder sesi tidak dapat dibuat.' };
  }
}

export async function copyBackingTrackToSession(id: string, uri: string, displayName: string): Promise<string | null> {
  if (NativeSessions == null) return null;
  try {
    return await NativeSessions.copyBackingTrack(id, uri, displayName);
  } catch {
    return null;
  }
}

export async function generateSessionThumbnail(id: string): Promise<string | null> {
  if (NativeSessions == null) return null;
  try {
    const path = await NativeSessions.generateThumbnail(id);
    return path === '' ? null : path;
  } catch {
    return null;
  }
}

export async function saveSessionManifest(id: string, json: string): Promise<boolean> {
  if (NativeSessions == null) {
    return false;
  }
  try {
    return await NativeSessions.saveManifest(id, json);
  } catch {
    return false;
  }
}

export async function loadSessions(): Promise<SessionInfo[] | null> {
  if (NativeSessions == null) {
    return null;
  }
  try {
    return parseSessionList(await NativeSessions.listSessions());
  } catch {
    return null;
  }
}

export async function removeSession(id: string): Promise<boolean> {
  if (NativeSessions == null) {
    return false;
  }
  try {
    return await NativeSessions.deleteSession(id);
  } catch {
    return false;
  }
}

export async function removeRawFiles(id: string): Promise<boolean> {
  if (NativeSessions == null) {
    return false;
  }
  try {
    return await NativeSessions.deleteRaw(id);
  } catch {
    return false;
  }
}

export async function readStorage(): Promise<StorageInfo | null> {
  if (NativeSessions == null) {
    return null;
  }
  try {
    return parseStorage(await NativeSessions.storageInfo());
  } catch {
    return null;
  }
}

/** Runs the export. A failed export is a failure with an Indonesian message; the raw files stay. */
export async function runExport(
  id: string,
  options: ExportOptions,
): Promise<{ ok: true; result: ExportResult } | Failure> {
  if (NativeSessions == null) {
    return UNAVAILABLE;
  }
  try {
    const result = parseExportResult(await NativeSessions.exportSession(id, JSON.stringify(options)));
    return result.ok ? { ok: true, result } : { ok: false, message: describeExportError(result.error) };
  } catch (error) {
    return { ok: false, message: describeExportError(errorCode(error)) };
  }
}

export async function readExportProgress(): Promise<ExportProgress | null> {
  if (NativeSessions == null) {
    return null;
  }
  try {
    return parseExportProgress(await NativeSessions.getExportProgress());
  } catch {
    return null;
  }
}

export async function cancelExportRun(): Promise<void> {
  if (NativeSessions == null) {
    return;
  }
  try {
    await NativeSessions.cancelExport();
  } catch {
    // Nothing useful to do.
  }
}

export async function saveSessionFile(path: string): Promise<{ ok: true; location: string } | Failure> {
  if (NativeSessions == null) {
    return UNAVAILABLE;
  }
  try {
    return { ok: true, location: await NativeSessions.saveToDownloads(path) };
  } catch (error) {
    return {
      ok: false,
      message: errorCode(error) === 'UNSUPPORTED' ? 'Fitur ini membutuhkan Android 10 atau yang lebih baru.' : 'File tidak dapat disimpan ke Unduhan.',
    };
  }
}