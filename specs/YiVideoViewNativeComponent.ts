import type { CodegenTypes, HostComponent, ViewProps } from 'react-native';
import { codegenNativeComponent } from 'react-native';

type PlayerStateEvent = {
  // 'preparing' | 'playing' | 'error'. For 'error', `message` holds a short error code.
  state: string;
  width: CodegenTypes.Int32;
  height: CodegenTypes.Int32;
  message: string;
};

export interface NativeProps extends ViewProps {
  /** RTSP URL to play. Set to an empty string (or unmount) to stop. */
  source?: string;
  onPlayerState?: CodegenTypes.BubblingEventHandler<PlayerStateEvent> | null;
}

export default codegenNativeComponent<NativeProps>(
  'YiVideoView',
) as HostComponent<NativeProps>;