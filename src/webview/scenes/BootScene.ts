import {
  CREW_TEXTURE_ASSETS,
  STATION_AUDIO_ASSETS,
  STATION_TILEMAP_KEY,
  STATION_TILEMAP_URL,
  TILE_TEXTURE_ASSETS
} from '../assets/manifest';
import { toPhaserSafeDataUri } from '../assets/dataUri';

/**
 * Boot scene responsible for preloading station assets.
 */
export class BootScene extends Phaser.Scene {
  /**
   * Creates a new boot scene.
   */
  constructor() {
    super('BootScene');
  }

  /**
   * Preloads static textures, tilemap, and ambient audio assets.
   */
  preload(): void {
    for (const tile of TILE_TEXTURE_ASSETS) {
      this.load.svg(tile.key, toPhaserSafeDataUri(tile.url), {
        width: tile.width,
        height: tile.height
      });
    }

    for (const crewTexture of CREW_TEXTURE_ASSETS) {
      this.load.svg(crewTexture.key, toPhaserSafeDataUri(crewTexture.url), {
        width: crewTexture.width,
        height: crewTexture.height
      });
    }

    this.load.json(STATION_TILEMAP_KEY, toPhaserSafeDataUri(STATION_TILEMAP_URL));

    for (const track of STATION_AUDIO_ASSETS) {
      this.load.audio(track.key, [toPhaserSafeDataUri(track.url)]);
    }
  }

  /**
   * Creates runtime animation metadata and starts the main scene.
   */
  create(): void {
    this.createCrewAnimations();
    this.scene.start('StationScene');
  }

  private createCrewAnimations(): void {
    const crewRoles = ['engineer', 'pilot', 'analyst', 'security'] as const;
    const animatedStates = [
      'scanning',
      'repairing',
      'alert',
      'celebrating',
      'damaged',
      'requesting_input'
    ] as const;

    for (const role of crewRoles) {
      if (!this.anims.exists(`${role}-walk`)) {
        this.anims.create({
          key: `${role}-walk`,
          frames: [
            { key: `crew-${role}-walk-a` },
            { key: `crew-${role}-walk-b` },
            { key: `crew-${role}-walk-a` },
            { key: `crew-${role}-walk-b` }
          ],
          frameRate: 8,
          repeat: -1
        });
      }

      for (const state of animatedStates) {
        const stateKey = `${role}-${state}`;
        if (this.anims.exists(stateKey)) {
          continue;
        }

        this.anims.create({
          key: stateKey,
          frames: [
            { key: `crew-${role}-walk-a` },
            { key: `crew-${role}-walk-b` },
            { key: `crew-${role}-walk-a` },
            { key: `crew-${role}-walk-b` }
          ],
          frameRate: state === 'alert' ? 11 : 8,
          repeat: -1
        });
      }
    }
  }
}
