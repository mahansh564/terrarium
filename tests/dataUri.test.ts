import { describe, expect, it } from 'vitest';
import { toPhaserSafeDataUri } from '../src/webview/assets/dataUri';

describe('toPhaserSafeDataUri', () => {
  it('leaves non-data URLs untouched', () => {
    expect(toPhaserSafeDataUri('/assets/sprite.svg')).toBe('/assets/sprite.svg');
  });

  it('leaves already-base64 data URLs untouched', () => {
    const uri = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=';
    expect(toPhaserSafeDataUri(uri)).toBe(uri);
  });

  it('converts URL-encoded data URIs to base64', () => {
    const uri = 'data:image/svg+xml,%3Csvg%3E%3C%2Fsvg%3E';
    expect(toPhaserSafeDataUri(uri)).toBe('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=');
  });

  it('preserves metadata fields while converting', () => {
    const uri = 'data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E';
    expect(toPhaserSafeDataUri(uri)).toBe(
      'data:image/svg+xml;charset=utf-8;base64,PHN2Zz48L3N2Zz4='
    );
  });
});
