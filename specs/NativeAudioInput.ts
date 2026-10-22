import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/**
 * Audio input inspection and test recording (Milestone 2). Implemented in Kotlin:
 * android/app/src/main/java/com/tonestage/app/audio/
 */
export interface Spec extends TurboModule {
  /**
   * Lists the audio INPUT devices Android currently reports, as a JSON string holding an array
   * of {id, name, type, isUsb, address, channelCounts, sampleRates, encodings}.
   * Needs no microphone permission because nothing is recorded.
   */
  getInputDevices(): Promise<string>;

  /**
   * Tries to open the device with 44100/48000 Hz x mono/stereo (PCM 16-bit), reading about
   * 1.2 s each. Resolves with a JSON string {results: [...]}. Needs the microphone permission.
   * Rejects with NO_PERMISSION, DEVICE_NOT_FOUND or AUDIO_ERROR.
   */
  probeInput(deviceId: number): Promise<string>;

  /**
   * Records `seconds` of audio from the device into a WAV file in the app cache folder.
   * Resolves with a JSON string {ok, error, path, sampleRate, channels, frames, peaks, rms, clipped, ...}.
   */
  recordTest(
    deviceId: number,
    sampleRate: number,
    channelCount: number,
    seconds: number,
  ): Promise<string>;

  /** Plays a WAV file (for listening to a test recording). */
  playTest(path: string): Promise<void>;

  stopPlayback(): Promise<void>;

  /**
   * Copies a test recording into the public Download/ToneStage folder so it can be played or
   * copied outside the app. Resolves with a readable location. Needs Android 10 or newer
   * (rejects with UNSUPPORTED otherwise).
   */
  exportTest(path: string): Promise<string>;
}

export default TurboModuleRegistry.get<Spec>('NativeAudioInput');