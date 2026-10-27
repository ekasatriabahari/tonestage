import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/**
 * Local backing-track player (Milestone 3a). Implemented in Kotlin:
 * android/app/src/main/java/com/tonestage/app/backing/
 *
 * The file is decoded to PCM and played through AudioTrack, so the player can report exactly
 * when each frame leaves the output (on the System.nanoTime() clock, like the video and the
 * guitar recording) and can measure its own level. The backing track is never mixed into the
 * guitar recording.
 */
export interface Spec extends TurboModule {
  /** Opens Android's document picker. Resolves with JSON {ok, error, uri, name}; error CANCELLED if dismissed. */
  pickFile(): Promise<string>;

  /** The file picked last time, if Android still allows reading it. JSON {ok, uri, name}. */
  getLastFile(): Promise<string>;

  /** Reads the file's format. JSON {ok, error, name, durationMs, sampleRate, channels, mime}. */
  load(uri: string): Promise<string>;

  play(): Promise<void>;
  pause(): Promise<void>;
  /** Stops and returns to the start. */
  stop(): Promise<void>;
  seekTo(positionMs: number): Promise<void>;

  /** volume is 0.0 to 1.0 (linear). */
  setGain(volume: number, muted: boolean): Promise<void>;

  /** Current output devices as JSON [{id, name, type, isUsb, address}]. */
  getOutputDevices(): Promise<string>;

  /** Prefers this output device; a negative id means "system default". */
  setOutputDevice(deviceId: number): Promise<void>;

  /**
   * JSON {state, error, name, durationMs, positionMs, sampleRate, channels, hasAnchor,
   * anchorFileUs, anchorNanoUs, frames, peaks, rms, clippedTotal, routedDeviceId,
   * routedDeviceName, requestedDeviceId}. While playing, the file position at system time t
   * (microseconds, System.nanoTime) is anchorFileUs + (t - anchorNanoUs) when hasAnchor.
   */
  getStatus(): Promise<string>;

  unload(): Promise<void>;
}

export default TurboModuleRegistry.get<Spec>('NativeBackingTrack');