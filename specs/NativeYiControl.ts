import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/**
 * Control connection to the Xiaomi Yi Action Camera Gen 1 (raw TCP JSON on port 7878).
 * Implemented in Kotlin: android/app/src/main/java/com/tonestage/app/yi/
 * Codegen turns this file into the abstract class NativeYiControlSpec.
 */
export interface Spec extends TurboModule {
  /**
   * Opens the control connection over the phone's Wi-Fi network, authenticates and
   * asks the camera to start its live view. Resolves with the camera's session token.
   * Rejects with a code: NO_WIFI, TIMEOUT, CONNECTION_FAILED, CLOSED, BAD_REPLY, REJECTED.
   */
  activateLiveView(
    host: string,
    port: number,
    timeoutMs: number,
  ): Promise<number>;

  /** True while the control connection is open. */
  isActive(): Promise<boolean>;

  /** Closes the control connection. */
  deactivate(): Promise<void>;
}

export default TurboModuleRegistry.get<Spec>('NativeYiControl');