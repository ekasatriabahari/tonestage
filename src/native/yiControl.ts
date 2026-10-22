import NativeYiControl from '../../specs/NativeYiControl';
import { describeYiError, errorCode } from './yiErrors';

export const YI_CONTROL_PORT = 7878;
export const YI_ACTIVATION_TIMEOUT_MS = 10000;

export type ActivationResult = { ok: true } | { ok: false; message: string };

/** False when the native module is not part of this build (for example in unit tests). */
export function isYiControlAvailable(): boolean {
  return NativeYiControl != null;
}

/** Asks the camera to start its live view. Never throws; failures come back as an Indonesian message. */
export async function activateYiLiveView(host: string): Promise<ActivationResult> {
  if (NativeYiControl == null) {
    return { ok: false, message: describeYiError('MODULE_UNAVAILABLE') };
  }
  try {
    await NativeYiControl.activateLiveView(
      host,
      YI_CONTROL_PORT,
      YI_ACTIVATION_TIMEOUT_MS,
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, message: describeYiError(errorCode(error)) };
  }
}

export async function isYiControlActive(): Promise<boolean> {
  if (NativeYiControl == null) {
    return false;
  }
  try {
    return await NativeYiControl.isActive();
  } catch {
    return false;
  }
}

export async function deactivateYi(): Promise<void> {
  if (NativeYiControl == null) {
    return;
  }
  try {
    await NativeYiControl.deactivate();
  } catch {
    // Nothing useful to do: the connection is being dropped anyway.
  }
}