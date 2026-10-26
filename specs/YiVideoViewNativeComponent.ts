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
  /** true: save the incoming stream to an MP4; false: stop and report the result. */
  recording?: boolean;
  onPlayerState?: CodegenTypes.BubblingEventHandler<PlayerStateEvent> | null;
}

export default codegenNativeComponent<NativeProps>(
  'YiVideoView',
) as HostComponent<NativeProps>;