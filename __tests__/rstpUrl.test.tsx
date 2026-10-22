import {
  DEFAULT_YI_RTSP_URL,
  extractRtspHost,
  validateRtspUrl,
} from '../src/utils/rstpUrl';

describe('validateRtspUrl', () => {
  it('accepts the default Yi address', () => {
    expect(validateRtspUrl(DEFAULT_YI_RTSP_URL)).toBeNull();
  });

  it('accepts a custom port and path, ignoring surrounding spaces', () => {
    expect(validateRtspUrl('  rtsp://192.168.42.1:554/live/ch0  ')).toBeNull();
  });

  it('accepts a URL without a path', () => {
    expect(validateRtspUrl('rtsp://camera.local')).toBeNull();
  });

  it('rejects empty input', () => {
    expect(validateRtspUrl('   ')).not.toBeNull();
  });

  it('rejects other schemes and missing hosts', () => {
    expect(validateRtspUrl('http://192.168.42.1/live')).not.toBeNull();
    expect(validateRtspUrl('rtsp://')).not.toBeNull();
    expect(validateRtspUrl('192.168.42.1/live')).not.toBeNull();
  });

  it('rejects out-of-range ports', () => {
    expect(validateRtspUrl('rtsp://192.168.42.1:0/live')).not.toBeNull();
    expect(validateRtspUrl('rtsp://192.168.42.1:70000/live')).not.toBeNull();
  });
});

describe('extractRtspHost', () => {
  it('returns the camera address', () => {
    expect(extractRtspHost(DEFAULT_YI_RTSP_URL)).toBe('192.168.42.1');
    expect(extractRtspHost(' rtsp://192.168.42.1:554/live ')).toBe('192.168.42.1');
  });

  it('returns null for invalid URLs', () => {
    expect(extractRtspHost('http://192.168.42.1/live')).toBeNull();
    expect(extractRtspHost('')).toBeNull();
  });
});