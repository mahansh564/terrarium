import type { HealthSignal, ProjectMetricsSnapshot } from '@shared/types';

interface ModuleNode {
  core: Phaser.GameObjects.Arc;
  ring: Phaser.GameObjects.Arc;
  life: number;
}

/**
 * Infrastructure system that lights and dims module nodes with health outcomes.
 */
export class StationInfrastructure {
  private readonly nodes: ModuleNode[] = [];
  private charge = 0;
  private stressAccumulator = 0;

  /**
   * Creates infrastructure system.
   *
   * @param scene Scene where infrastructure should render.
   */
  constructor(private readonly scene: Phaser.Scene) {}

  /**
   * Applies health signal to infrastructure model.
   *
   * @param signal Incoming health signal.
   */
  applySignal(signal: HealthSignal): void {
    if (signal.type === 'positive' || signal.type === 'milestone') {
      this.charge = Math.min(100, this.charge + 10);
      this.spawnNode();
      return;
    }

    if (signal.type === 'negative' || signal.type === 'critical') {
      this.charge = Math.max(0, this.charge - 14);
      this.dimNode();
    }
  }

  /**
   * Applies latest project metrics to infrastructure pressure.
   *
   * @param metrics Latest project metrics snapshot.
   */
  applyMetrics(metrics: ProjectMetricsSnapshot): void {
    const dirtyScore = metrics.dirtyFileCount === null ? 0 : Math.min(1, metrics.dirtyFileCount / 30);
    const failureScore = Math.min(1, metrics.failureStreak / 4);
    const pressure = dirtyScore * 0.55 + failureScore * 0.45;
    this.charge = Math.max(0, Math.min(100, this.charge - Math.round(pressure * 6)));
    this.stressAccumulator += pressure;
  }

  /**
   * Advances infrastructure animations and cleanup.
   *
   * @param delta Delta frame time.
   */
  update(delta: number): void {
    if (this.stressAccumulator >= 1.2) {
      this.dimNode();
      this.stressAccumulator = 0;
    }

    for (let i = this.nodes.length - 1; i >= 0; i -= 1) {
      const node = this.nodes[i];
      if (node === undefined) {
        continue;
      }

      node.life -= delta;
      const alpha = Math.max(0.18, Math.min(1, node.life / 22000));
      node.core.setAlpha(alpha);
      node.ring.setAlpha(alpha * 0.8);

      if (node.life <= 0) {
        node.core.destroy();
        node.ring.destroy();
        this.nodes.splice(i, 1);
      }
    }
  }

  private spawnNode(): void {
    if (this.nodes.length >= 72) {
      return;
    }

    const x = Phaser.Math.Between(26, 934);
    const y = Phaser.Math.Between(320, 510);
    const radius = Phaser.Math.Between(3, 6);

    const core = this.scene.add.circle(x, y, radius, 0xa8bcff, 0.96);
    const ring = this.scene.add.circle(x, y, radius + 4, 0xa8bcff, 0.2);
    ring.setStrokeStyle(1, 0xd5e6ff, 0.82);
    core.setDepth(8);
    ring.setDepth(7);

    this.nodes.push({
      core,
      ring,
      life: 18000 + this.charge * 180
    });
  }

  private dimNode(): void {
    const node = this.nodes.pop();
    if (node === undefined) {
      return;
    }

    node.core.setFillStyle(0x6b6d91, 0.75);
    node.ring.setStrokeStyle(1, 0x3d3f5a, 0.7);
    node.life = Math.min(node.life, 2500);
    this.nodes.unshift(node);
  }
}
