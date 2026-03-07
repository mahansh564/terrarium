import { describe, expect, it } from 'vitest';
import {
  pickTileTextureFallback,
  readTilemapAsset,
  resolveTileFromMap
} from '../src/webview/environment/tilemap';

describe('readTilemapAsset', () => {
  it('parses valid tilemap JSON payload', () => {
    const parsed = readTilemapAsset({
      tileSize: 16.9,
      width: 60.8,
      height: 34.2,
      legend: { g: 'tile-deck', r: 'tile-conduit' },
      rows: ['grg', 'rgg']
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.tileSize).toBe(16);
    expect(parsed?.width).toBe(60);
    expect(parsed?.height).toBe(34);
    expect(parsed?.legend.g).toBe('tile-deck');
  });

  it('returns null for invalid payloads', () => {
    expect(readTilemapAsset(null)).toBeNull();
    expect(readTilemapAsset({})).toBeNull();
    expect(
      readTilemapAsset({
        tileSize: 16,
        width: 60,
        height: 34,
        legend: {},
        rows: ['ggg']
      })
    ).toBeNull();
  });
});

describe('resolveTileFromMap', () => {
  it('maps symbols to texture keys', () => {
    const map = readTilemapAsset({
      tileSize: 16,
      width: 2,
      height: 2,
      legend: { g: 'tile-deck', w: 'tile-viewport' },
      rows: ['gw', 'wg']
    });

    if (map === null) {
      throw new Error('Expected map to parse.');
    }

    expect(resolveTileFromMap(map, 0, 0)).toBe('tile-deck');
    expect(resolveTileFromMap(map, 0, 1)).toBe('tile-viewport');
  });

  it('falls back to procedural tile when cell is missing', () => {
    const map = readTilemapAsset({
      tileSize: 16,
      width: 1,
      height: 1,
      legend: { g: 'tile-deck' },
      rows: ['g']
    });

    if (map === null) {
      throw new Error('Expected map to parse.');
    }

    expect(resolveTileFromMap(map, 9, 9)).toBe(pickTileTextureFallback(9, 9));
  });
});
