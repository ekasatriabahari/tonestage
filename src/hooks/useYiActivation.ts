import { useCallback, useEffect, useState } from 'react';
import {
  activateYiLiveView,
  deactivateYi,
  isYiControlActive,
} from '../native/yiControl';

export type YiState =
  | { kind: 'idle' }
  | { kind: 'activating' }
  | { kind: 'active' }
  | { kind: 'error'; message: string }
  | { kind: 'lost' };

const POLL_INTERVAL_MS = 2000;

/**
 * Tracks the camera control connection. "active" means the camera accepted the start
 * command and the control connection is still open. It does NOT mean video is playing.
 */
export function useYiActivation() {
  const [state, setState] = useState<YiState>({ kind: 'idle' });
  const kind = state.kind;

  const activate = useCallback(async (host: string) => {
    setState({ kind: 'activating' });
    const result = await activateYiLiveView(host);
    setState(
      result.ok
        ? { kind: 'active' }
        : { kind: 'error', message: result.message },
    );
  }, []);

  const deactivate = useCallback(async () => {
    await deactivateYi();
    setState({ kind: 'idle' });
  }, []);

  // While active, check that the control connection is still open.
  useEffect(() => {
    if (kind !== 'active') {
      return undefined;
    }
    const id = setInterval(async () => {
      if (!(await isYiControlActive())) {
        setState({ kind: 'lost' });
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [kind]);

  // Release the control connection when the screen goes away.
  useEffect(() => {
    return () => {
      deactivateYi();
    };
  }, []);

  return { state, activate, deactivate };
}