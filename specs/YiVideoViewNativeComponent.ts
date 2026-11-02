import type { CodegenTypes, HostComponent, ViewProps } from 'react-native';
import { codegenNativeComponent } from 'react-native';

type PlayerStateEvent = {
  // 'preparing' | 'playing' | 'error' | 'recording' | 'recorded'.
  // 'error': `message` holds a short error code. 'recorded': `message` holds the result as JSON.
  state: string;
  width: CodegenTypes.Int32;
  height: CodegenTypes.Int32;
  message: string;
};

export interface NativeProps extends ViewProps {
  /** RTSP URL to play. Set to an empty string (or unmount) to stop. */
  source?: string;
  /** Saves the incoming stream to this MP4 (inside the sessions folder); an empty string stops and reports the result. */
  recordingPath?: string;
  onPlayerState?: CodegenTypes.BubblingEventHandler<PlayerStateEvent> | null;
}

export default codegenNativeComponent<NativeProps>(
  'YiVideoView',
) as HostComponent<NativeProps>;