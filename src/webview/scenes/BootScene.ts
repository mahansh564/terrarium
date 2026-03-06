import {
  CREATURE_TEXTURE_ASSETS,
  TERRARIUM_AUDIO_ASSETS,
  TERRARIUM_TILEMAP_KEY,
  TERRARIUM_TILEMAP_URL,
  TILE_TEXTURE_ASSETS
} from '../assets/manifest';
import { toPhaserSafeDataUri } from '../assets/dataUri';

/**
 * Boot scene responsible for preloading terrarium assets.
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

    for (const creatureTexture of CREATURE_TEXTURE_ASSETS) {
      this.load.svg(creatureTexture.key, toPhaserSafeDataUri(creatureTexture.url), {
        width: creatureTexture.width,
        height: creatureTexture.height
      });
    }

    this.load.json(TERRARIUM_TILEMAP_KEY, toPhaserSafeDataUri(TERRARIUM_TILEMAP_URL));

    for (const track of TERRARIUM_AUDIO_ASSETS) {
      this.load.audio(track.key, [toPhaserSafeDataUri(track.url)]);
    }
  }

  /**
   * Creates runtime animation metadata and starts the main scene.
   */
  create(): void {
    this.createCreatureAnimations();
    this.scene.start('TerrariumScene');
  }

  private createCreatureAnimations(): void {
    const creatureTypes = ['fox', 'otter', 'slime', 'bird'] as const;

    for (const type of creatureTypes) {
      if (!this.anims.exists(`${type}-walk`)) {
        this.anims.create({
          key: `${type}-walk`,
          frames: [
            { key: `creature-${type}-walk-a` },
            { key: `creature-${type}-walk-b` },
            { key: `creature-${type}-walk-a` },
            { key: `creature-${type}-walk-b` }
          ],
          frameRate: 8,
          repeat: -1
        });
      }

      for (const state of ['working', 'foraging', 'alert', 'celebrating', 'distressed'] as const) {
        const stateKey = `${type}-${state}`;
        if (this.anims.exists(stateKey)) {
          continue;
        }

        this.anims.create({
          key: stateKey,
          frames: [
            { key: `creature-${type}-walk-a` },
            { key: `creature-${type}-walk-b` },
            { key: `creature-${type}-walk-a` },
            { key: `creature-${type}-walk-b` }
          ],
          frameRate: state === 'alert' ? 11 : 8,
          repeat: -1
        });
      }
    }
  }
}
