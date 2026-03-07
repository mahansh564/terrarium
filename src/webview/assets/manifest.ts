import ambientStationAudioUrl from '../../assets/audio/ambient-station.wav?url';
import analystIdleUrl from '../../assets/sprites/crew/analyst/idle.svg?url';
import analystWalkAUrl from '../../assets/sprites/crew/analyst/walk-a.svg?url';
import analystWalkBUrl from '../../assets/sprites/crew/analyst/walk-b.svg?url';
import engineerIdleUrl from '../../assets/sprites/crew/engineer/idle.svg?url';
import engineerWalkAUrl from '../../assets/sprites/crew/engineer/walk-a.svg?url';
import engineerWalkBUrl from '../../assets/sprites/crew/engineer/walk-b.svg?url';
import pilotIdleUrl from '../../assets/sprites/crew/pilot/idle.svg?url';
import pilotWalkAUrl from '../../assets/sprites/crew/pilot/walk-a.svg?url';
import pilotWalkBUrl from '../../assets/sprites/crew/pilot/walk-b.svg?url';
import securityIdleUrl from '../../assets/sprites/crew/security/idle.svg?url';
import securityWalkAUrl from '../../assets/sprites/crew/security/walk-a.svg?url';
import securityWalkBUrl from '../../assets/sprites/crew/security/walk-b.svg?url';
import tileConduitUrl from '../../assets/sprites/tiles/tile-conduit.svg?url';
import tileDeckUrl from '../../assets/sprites/tiles/tile-deck.svg?url';
import tileGrateUrl from '../../assets/sprites/tiles/tile-grate.svg?url';
import tileViewportUrl from '../../assets/sprites/tiles/tile-viewport.svg?url';
import stationTilemapUrl from '../../assets/tilemaps/station.json?url';

/**
 * Static image asset descriptor for Phaser loaders.
 */
export interface SvgAsset {
  /** Texture key registered in Phaser cache. */
  key: string;
  /** Resolved asset URL emitted by Vite. */
  url: string;
  /** Desired rasterized width in pixels. */
  width: number;
  /** Desired rasterized height in pixels. */
  height: number;
}

/**
 * Static audio asset descriptor for Phaser loaders.
 */
export interface AudioAsset {
  /** Audio key registered in Phaser cache. */
  key: string;
  /** Resolved asset URL emitted by Vite. */
  url: string;
}

/**
 * Tile textures used by station background rendering.
 */
export const TILE_TEXTURE_ASSETS: readonly SvgAsset[] = [
  { key: 'tile-deck', url: tileDeckUrl, width: 16, height: 16 },
  { key: 'tile-grate', url: tileGrateUrl, width: 16, height: 16 },
  { key: 'tile-conduit', url: tileConduitUrl, width: 16, height: 16 },
  { key: 'tile-viewport', url: tileViewportUrl, width: 16, height: 16 }
];

/**
 * Crew frame textures used for idle and walk animations.
 */
export const CREW_TEXTURE_ASSETS: readonly SvgAsset[] = [
  { key: 'crew-engineer-idle', url: engineerIdleUrl, width: 32, height: 32 },
  { key: 'crew-engineer-walk-a', url: engineerWalkAUrl, width: 32, height: 32 },
  { key: 'crew-engineer-walk-b', url: engineerWalkBUrl, width: 32, height: 32 },
  { key: 'crew-pilot-idle', url: pilotIdleUrl, width: 32, height: 32 },
  { key: 'crew-pilot-walk-a', url: pilotWalkAUrl, width: 32, height: 32 },
  { key: 'crew-pilot-walk-b', url: pilotWalkBUrl, width: 32, height: 32 },
  { key: 'crew-analyst-idle', url: analystIdleUrl, width: 32, height: 32 },
  { key: 'crew-analyst-walk-a', url: analystWalkAUrl, width: 32, height: 32 },
  { key: 'crew-analyst-walk-b', url: analystWalkBUrl, width: 32, height: 32 },
  { key: 'crew-security-idle', url: securityIdleUrl, width: 32, height: 32 },
  { key: 'crew-security-walk-a', url: securityWalkAUrl, width: 32, height: 32 },
  { key: 'crew-security-walk-b', url: securityWalkBUrl, width: 32, height: 32 }
];

/**
 * Tilemap JSON asset key used by background renderer.
 */
export const STATION_TILEMAP_KEY = 'tilemap-station';

/**
 * Tilemap JSON URL emitted by Vite.
 */
export const STATION_TILEMAP_URL = stationTilemapUrl;

/**
 * Ambient audio tracks available to the station scene.
 */
export const STATION_AUDIO_ASSETS: readonly AudioAsset[] = [
  { key: 'ambient-station', url: ambientStationAudioUrl }
];
