import ambientStationAudioUrl from '../../assets/audio/ambient-station.wav?url';
import analystIdleUrl from '../../assets/sprites/crew/inspo/analyst-idle.png?url';
import analystWalkAUrl from '../../assets/sprites/crew/inspo/analyst-walk-a.png?url';
import analystWalkBUrl from '../../assets/sprites/crew/inspo/analyst-walk-b.png?url';
import engineerIdleUrl from '../../assets/sprites/crew/inspo/engineer-idle.png?url';
import engineerWalkAUrl from '../../assets/sprites/crew/inspo/engineer-walk-a.png?url';
import engineerWalkBUrl from '../../assets/sprites/crew/inspo/engineer-walk-b.png?url';
import pilotIdleUrl from '../../assets/sprites/crew/inspo/pilot-idle.png?url';
import pilotWalkAUrl from '../../assets/sprites/crew/inspo/pilot-walk-a.png?url';
import pilotWalkBUrl from '../../assets/sprites/crew/inspo/pilot-walk-b.png?url';
import securityIdleUrl from '../../assets/sprites/crew/inspo/security-idle.png?url';
import securityWalkAUrl from '../../assets/sprites/crew/inspo/security-walk-a.png?url';
import securityWalkBUrl from '../../assets/sprites/crew/inspo/security-walk-b.png?url';
import stationBackgroundUrl from '../../assets/backgrounds/station-background-celestial.png?url';
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
 * Static raster image asset descriptor for Phaser loaders.
 */
export interface ImageAsset {
  /** Texture key registered in Phaser cache. */
  key: string;
  /** Resolved asset URL emitted by Vite. */
  url: string;
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
export const CREW_TEXTURE_ASSETS: readonly ImageAsset[] = [
  { key: 'crew-engineer-idle', url: engineerIdleUrl },
  { key: 'crew-engineer-walk-a', url: engineerWalkAUrl },
  { key: 'crew-engineer-walk-b', url: engineerWalkBUrl },
  { key: 'crew-pilot-idle', url: pilotIdleUrl },
  { key: 'crew-pilot-walk-a', url: pilotWalkAUrl },
  { key: 'crew-pilot-walk-b', url: pilotWalkBUrl },
  { key: 'crew-analyst-idle', url: analystIdleUrl },
  { key: 'crew-analyst-walk-a', url: analystWalkAUrl },
  { key: 'crew-analyst-walk-b', url: analystWalkBUrl },
  { key: 'crew-security-idle', url: securityIdleUrl },
  { key: 'crew-security-walk-a', url: securityWalkAUrl },
  { key: 'crew-security-walk-b', url: securityWalkBUrl }
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
 * Background texture key used by station scene.
 */
export const STATION_BACKGROUND_TEXTURE_KEY = 'station-background';

/**
 * Background texture URL emitted by Vite.
 */
export const STATION_BACKGROUND_TEXTURE_URL = stationBackgroundUrl;

/**
 * Ambient audio tracks available to the station scene.
 */
export const STATION_AUDIO_ASSETS: readonly AudioAsset[] = [
  { key: 'ambient-station', url: ambientStationAudioUrl }
];
