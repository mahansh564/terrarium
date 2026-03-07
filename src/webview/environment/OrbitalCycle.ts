/**
 * Orbital cycle overlay synced to local system clock.
 */
export class OrbitalCycle {
  private readonly overlay: Phaser.GameObjects.Rectangle;
  private readonly stars: Phaser.GameObjects.Graphics;

  /**
   * Creates orbital visual overlays.
   *
   * @param scene Scene hosting this system.
   */
  constructor(private readonly scene: Phaser.Scene) {
    this.overlay = scene.add.rectangle(480, 270, 960, 540, 0x08131f, 0.0);
    this.overlay.setDepth(20);

    this.stars = scene.add.graphics();
    this.stars.setDepth(21);
  }

  /**
   * Updates tint and stars according to local hour.
   *
   * @param now Current timestamp.
   */
  update(now: number): void {
    const hour = new Date().getHours();

    if (hour >= 6 && hour < 17) {
      this.overlay.setFillStyle(0xc7d9ef, 0.05);
      this.renderStars(0.05, now);
      return;
    }

    if (hour >= 17 && hour < 20) {
      this.overlay.setFillStyle(0xffb978, 0.16);
      this.renderStars(0.2, now);
      return;
    }

    this.overlay.setFillStyle(0x06101c, 0.42);
    this.renderStars(0.85, now);
  }

  private renderStars(intensity: number, now: number): void {
    this.stars.clear();
    if (intensity <= 0) {
      return;
    }

    this.stars.fillStyle(0xdaf4ff, 0.6 * intensity);
    for (let i = 0; i < 32; i += 1) {
      const x = (i * 31 + (now / 24) * (1 + (i % 4))) % 960;
      const y = 18 + ((i * 47 + now / 18) % 170);
      this.stars.fillCircle(x, y, i % 3 === 0 ? 2 : 1);
    }
  }
}
