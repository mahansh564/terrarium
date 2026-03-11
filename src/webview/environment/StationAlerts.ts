import type { HealthSignal, ProjectMetricsSnapshot } from '@shared/types';

/**
 * Supported station alert render modes.
 */
type AlertMode = 'clear' | 'scan' | 'alarm' | 'power' | 'jump';

/**
 * Station overlay system reacting to project health signals.
 */
export class StationAlerts {
  private readonly scanLayer: Phaser.GameObjects.Graphics;
  private readonly alarmLayer: Phaser.GameObjects.Graphics;
  private readonly jumpLayer: Phaser.GameObjects.Graphics;
  private readonly powerLayer: Phaser.GameObjects.Graphics;
  private enabled = true;
  private mode: AlertMode = 'clear';
  private modeUntil = 0;
  private metricsStress = 0;

  /**
   * Creates station alert graphics.
   *
   * @param scene Scene where alerts should render.
   */
  constructor(private readonly scene: Phaser.Scene) {
    this.scanLayer = scene.add.graphics();
    this.alarmLayer = scene.add.graphics();
    this.jumpLayer = scene.add.graphics();
    this.powerLayer = scene.add.graphics();

    this.scanLayer.setDepth(28);
    this.powerLayer.setDepth(29);
    this.alarmLayer.setDepth(30);
    this.jumpLayer.setDepth(31);
  }

  /**
   * Enables or disables station effects.
   *
   * @param enabled Whether station effects should render and react to signals.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;

    if (!enabled) {
      this.mode = 'clear';
      this.modeUntil = 0;
      this.clearLayers();
    }
  }

  /**
   * Applies an incoming health signal to alert state.
   *
   * @param signal Health signal payload.
   */
  applySignal(signal: HealthSignal): void {
    if (!this.enabled) {
      return;
    }

    switch (signal.type) {
      case 'critical':
      case 'negative':
        this.mode = 'alarm';
        this.modeUntil = signal.ts + 9000;
        break;
      case 'positive':
        this.mode = 'power';
        this.modeUntil = signal.ts + 8000;
        break;
      case 'milestone':
        this.mode = 'jump';
        this.modeUntil = signal.ts + 10000;
        break;
      case 'neutral':
      default:
        this.mode = 'scan';
        this.modeUntil = signal.ts + 4500;
        break;
    }
  }

  /**
   * Applies local project metrics to ambient alert stress.
   *
   * @param metrics Latest project metrics snapshot.
   */
  applyMetrics(metrics: ProjectMetricsSnapshot): void {
    const dirtyScore = metrics.dirtyFileCount === null ? 0 : Math.min(1, metrics.dirtyFileCount / 24);
    const streakScore = Math.min(1, metrics.failureStreak / 4);
    const failing = metrics.lastTestFailAt !== null && metrics.lastTestPassAt !== null
      ? metrics.lastTestFailAt > metrics.lastTestPassAt
      : metrics.lastTestFailAt !== null;
    const failBias = failing ? 0.3 : 0;
    this.metricsStress = Math.max(0, Math.min(1, dirtyScore * 0.5 + streakScore * 0.35 + failBias));
  }

  /**
   * Advances station alert rendering.
   *
   * @param now Current timestamp in milliseconds.
   */
  update(now: number): void {
    this.clearLayers();

    if (!this.enabled) {
      return;
    }

    if (this.modeUntil !== 0 && now > this.modeUntil) {
      this.mode = 'clear';
      this.modeUntil = 0;
    }

    switch (this.mode) {
      case 'scan':
        this.drawScanSweep(now);
        break;
      case 'alarm':
        this.drawAlarm(now);
        break;
      case 'power':
        this.drawPowerGlow(now);
        break;
      case 'jump':
        this.drawJumpLane(now);
        break;
      case 'clear':
      default:
        break;
    }

    if (this.metricsStress > 0.08) {
      const stressPulse = 0.02 + this.metricsStress * 0.12;
      this.powerLayer.fillStyle(0xff9aa6, stressPulse);
      this.powerLayer.fillRect(0, 0, 960, 540);
    }
  }

  private drawScanSweep(now: number): void {
    const sweepX = (now / 3) % 1080 - 120;
    this.scanLayer.fillStyle(0x9fc4ff, 0.1);
    this.scanLayer.fillTriangle(sweepX, 0, sweepX + 120, 0, sweepX - 80, 540);
  }

  private drawAlarm(now: number): void {
    const pulse = 0.16 + (Math.sin(now * 0.02) + 1) * 0.07;
    this.alarmLayer.fillStyle(0xff3a62, pulse);
    this.alarmLayer.fillRect(0, 0, 960, 540);

    this.alarmLayer.lineStyle(3, 0xffe08c, 0.65);
    const offset = (now / 20) % 120;
    for (let i = -1; i < 10; i += 1) {
      const x = i * 120 + offset;
      this.alarmLayer.beginPath();
      this.alarmLayer.moveTo(x, 0);
      this.alarmLayer.lineTo(x - 80, 540);
      this.alarmLayer.strokePath();
    }
  }

  private drawPowerGlow(now: number): void {
    const pulse = 0.1 + (Math.sin(now * 0.006) + 1) * 0.06;
    this.powerLayer.fillStyle(0x879dff, pulse);
    this.powerLayer.fillRect(0, 0, 960, 540);
    this.powerLayer.fillStyle(0xcce7ff, pulse + 0.03);
    this.powerLayer.fillCircle(830, 90, 54);
  }

  private drawJumpLane(now: number): void {
    const centerX = 480;
    const centerY = 270;
    const colors = [0x9abbff, 0x9ef4ff, 0xfff2a4, 0xffa8be];

    for (let i = 0; i < colors.length; i += 1) {
      const color = colors[i] ?? 0xffffff;
      this.jumpLayer.lineStyle(4, color, 0.72);
      this.jumpLayer.strokeEllipse(centerX, centerY, 700 - i * 60, 220 - i * 18);
    }

    this.jumpLayer.fillStyle(0xffffff, 0.2);
    for (let i = 0; i < 24; i += 1) {
      const x = (i * 43 + now / 6) % 980;
      const y = 50 + ((i * 37 + now / 5) % 440);
      this.jumpLayer.fillCircle(x, y, i % 3 === 0 ? 2 : 1);
    }
  }

  private clearLayers(): void {
    this.scanLayer.clear();
    this.alarmLayer.clear();
    this.jumpLayer.clear();
    this.powerLayer.clear();
  }
}
