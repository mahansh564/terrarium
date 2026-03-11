import type { MissionState } from '@shared/types';

const PANEL_WIDTH = 300;

/**
 * Mission cards panel with lightweight reward-loop boost banner.
 */
export class MissionDeck {
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private readonly body: Phaser.GameObjects.Text;
  private readonly boostBanner: Phaser.GameObjects.Text;
  private boostUntil = 0;
  private boostLabel = '';

  /**
   * Creates a mission panel.
   *
   * @param scene Scene hosting the panel.
   */
  constructor(private readonly scene: Phaser.Scene) {
    this.panel = scene.add.graphics();
    this.panel.setDepth(60);

    this.title = scene.add.text(0, 0, 'MISSION CARDS', {
      fontFamily: '"Courier New", "Consolas", monospace',
      fontStyle: 'bold',
      fontSize: '13px',
      color: '#fff7d0'
    });
    this.title.setDepth(61);
    this.title.setLetterSpacing(1.1);
    this.title.setShadow(0, 1, '#0c1532', 2, false, true);

    this.body = scene.add.text(0, 0, '', {
      fontFamily: '"Courier New", "Consolas", monospace',
      fontSize: '11px',
      color: '#deedff',
      lineSpacing: 4
    });
    this.body.setDepth(61);
    this.body.setShadow(0, 1, '#0c1532', 2, false, true);

    this.boostBanner = scene.add.text(0, 0, '', {
      fontFamily: '"Courier New", "Consolas", monospace',
      fontStyle: 'bold',
      fontSize: '10px',
      color: '#f6ffe9'
    });
    this.boostBanner.setDepth(61);
    this.boostBanner.setVisible(false);
    this.boostBanner.setShadow(0, 1, '#0c1532', 2, false, true);
  }

  /**
   * Triggers a short-lived boost banner.
   *
   * @param label Boost label text.
   * @param now Current timestamp.
   * @param durationMs Banner duration.
   */
  triggerBoost(label: string, now: number, durationMs = 8_000): void {
    this.boostLabel = label;
    this.boostUntil = now + durationMs;
  }

  /**
   * Updates mission panel content.
   *
   * @param missions Mission state list.
   * @param now Current timestamp.
   */
  update(missions: MissionState[], now: number): void {
    const x = this.scene.scale.width - PANEL_WIDTH - 12;
    const y = 362;
    const width = PANEL_WIDTH;
    const height = 160;
    this.panel.clear();
    drawPanel(this.panel, x, y, width, height);

    this.title.setPosition(x + 10, y + 8);
    this.body.setPosition(x + 12, y + 30);
    this.body.setText(formatMissions(missions));

    const boostActive = now < this.boostUntil;
    this.boostBanner.setVisible(boostActive);
    if (boostActive) {
      this.boostBanner.setText(`BOOST ACTIVE: ${this.boostLabel}`);
      this.boostBanner.setPosition(x + 12, y + height - 18);
      this.panel.fillStyle(0x98ffd6, 0.2);
      this.panel.fillRect(x + 8, y + height - 24, width - 16, 16);
    }
  }

  /**
   * Releases mission panel resources.
   */
  destroy(): void {
    this.panel.destroy();
    this.title.destroy();
    this.body.destroy();
    this.boostBanner.destroy();
  }
}

function drawPanel(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  graphics.fillStyle(0x201d67, 0.95);
  graphics.fillRect(x, y, width, height);
  graphics.fillStyle(0xb7ceff, 0.98);
  graphics.fillRect(x, y, width, 2);
  graphics.fillRect(x, y + height - 2, width, 2);
  graphics.fillRect(x, y, 2, height);
  graphics.fillRect(x + width - 2, y, 2, height);
  graphics.fillStyle(0xfff0ba, 0.12);
  graphics.fillRect(x + 2, y + 2, width - 4, 10);
}

function formatMissions(missions: MissionState[]): string {
  if (missions.length === 0) {
    return 'No missions synchronized.';
  }

  return missions
    .slice(0, 3)
    .map((mission) => {
      const status =
        mission.status === 'completed'
          ? 'DONE'
          : mission.status === 'active'
            ? 'ACTIVE'
            : 'IDLE';
      const progressPct = Math.round(Math.max(0, Math.min(1, mission.progress)) * 100);
      return `[${status}] ${mission.title}\n${progressPct}%  REWARD +${mission.rewardXp} XP`;
    })
    .join('\n\n');
}
