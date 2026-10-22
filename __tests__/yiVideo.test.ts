import {
  describeVideoError,
  parsePlayerEvent,
  previewAspectRatio,
} from '../src/native/yiVideo';

describe('parsePlayerEvent', () => {
  it('reports playing only with the size from native', () => {
    expect(
      parsePlayerEvent({ state: 'playing', width: 640, height: 480, message: '' }),
    ).toEqual({ kind: 'playing', width: 640, height: 480 });
  });

  it('reports errors with their code', () => {
    expect(
      parsePlayerEvent({ state: 'error', width: 0, height: 0, message: 'NO_WIFI' }),
    ).toEqual({ kind: 'error', code: 'NO_WIFI' });
  });

  it('treats preparing and unknown states as preparing, never as playing', () => {
    expect(parsePlayerEvent({ state: 'preparing', width: 0, height: 0, message: '' })).toEqual({
      kind: 'preparing',
    });
    expect(parsePlayerEvent({ state: 'whatever', width: 0, height: 0, message: '' })).toEqual({
      kind: 'preparing',
    });
  });
});

describe('describeVideoError', () => {
  it('explains our own codes', () => {
    expect(describeVideoError('NO_WIFI')).toContain('Wi-Fi');
    expect(describeVideoError('STREAM_ENDED')).toContain('berhenti');
  });

  it('groups Media3 network and format errors', () => {
    expect(describeVideoError('ERROR_CODE_IO_NETWORK_CONNECTION_FAILED')).toContain('aliran video');
    expect(describeVideoError('ERROR_CODE_PARSING_CONTAINER_MALFORMED')).toContain('Format video');
  });

  it('shows the code for anything unknown', () => {
    expect(describeVideoError('ERROR_CODE_SOMETHING_NEW')).toContain('ERROR_CODE_SOMETHING_NEW');
    expect(describeVideoError('')).toContain('tidak diketahui');
  });
});

describe('previewAspectRatio', () => {
  it('uses the real video shape once playing', () => {
    expect(previewAspectRatio({ kind: 'playing', width: 640, height: 480 })).toBeCloseTo(4 / 3);
  });

  it('falls back to 16:9 before the size is known', () => {
    expect(previewAspectRatio({ kind: 'preparing' })).toBeCloseTo(16 / 9);
    expect(previewAspectRatio({ kind: 'playing', width: 0, height: 0 })).toBeCloseTo(16 / 9);
    expect(previewAspectRatio({ kind: 'error', code: 'X' })).toBeCloseTo(16 / 9);
  });
});