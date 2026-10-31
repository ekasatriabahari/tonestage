import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/**
 * Recording sessions and export (Milestones 4 and 5). Implemented in Kotlin:
 * android/app/src/main/java/com/tonestage/app/session/
 *
 * A session folder in the app's private storage holds the raw camera video, the clean guitar WAV
 * and a manifest of what was measured. Raw files are kept until deleted, so an export can be repeated.
 */
export interface Spec extends TurboModule {
  /** Creates a session folder. JSON {ok, error, id, createdMs, videoPath, audioPath}. */
  createSession(): Promise<string>;

  /** Stores the manifest (JSON text) of a session. Resolves false if the session does not exist. */
  saveManifest(id: string, json: string): Promise<boolean>;

  /** All sessions, newest first: JSON [{id, createdMs, manifest, videoBytes, guitarBytes, exports}]. */
  listSessions(): Promise<string>;

  deleteSession(id: string): Promise<boolean>;

  /** Deletes the raw video and guitar files but keeps exports and the manifest. */
  deleteRaw(id: string): Promise<boolean>;

  /** Free and total space for the app's files: JSON {availableBytes, totalBytes}. */
  storageInfo(): Promise<string>;

  /**
   * Mixes and exports a session to MP4. options JSON {videoLatencyMs, backingOffsetMs,
   * includeBacking}. Resolves with JSON {ok, error, path, durationMs, peakDb, gainReductionDb, ...}.
   * Progress can be read with getExportProgress while it runs.
   */
  exportSession(id: string, optionsJson: string): Promise<string>;

  /** JSON {stage: 'idle' | 'prepare' | 'backing' | 'mix' | 'encode', percent, exporting}. */
  getExportProgress(): Promise<string>;

  cancelExport(): Promise<void>;

  /** Copies a file of a session to the public Download/ToneStage folder. Resolves with its location. */
  saveToDownloads(path: string): Promise<string>;
}

export default TurboModuleRegistry.get<Spec>('NativeSessions');