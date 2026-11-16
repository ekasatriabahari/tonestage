import type { CodegenTypes, HostComponent, ViewProps } from 'react-native';
import { codegenNativeComponent } from 'react-native';

type PlayerStateEvent = {
  state: string;
  width: CodegenTypes.Int32;
  height: CodegenTypes.Int32;
  message: string;
};

export interface NativeProps extends ViewProps {
  lensFacing?: string;
  recordingPath?: string;
  recordingPaused?: boolean;
  onPlayerState?: CodegenTypes.BubblingEventHandler<PlayerStateEvent> | null;
}

export default codegenNativeComponent<NativeProps>('CameraVideoView') as HostComponent<NativeProps>;
