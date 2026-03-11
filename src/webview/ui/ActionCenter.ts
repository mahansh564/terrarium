import type { PendingInputRequest } from '@shared/types';

interface ActionCenterRow {
  readonly background: Phaser.GameObjects.Graphics;
  readonly title: Phaser.GameObjects.Text;
  readonly detail: Phaser.GameObjects.Text;
  readonly hitArea: Phaser.GameObjects.Rectangle;
  agentId: string | null;
}

const ACTION_CENTER_WIDTH = 300;
const ROW_HEIGHT = 58;
const MAX_ROWS = 4;
const STALE_AGE_MS = 60_000;

/**
 * Right-side Action Center panel for unresolved input requests.
 */
export class ActionCenter {
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private readonly emptyText: Phaser.GameObjects.Text;
  private readonly rows: ActionCenterRow[] = [];

  /**
   * Creates an Action Center panel.
   *
   * @param scene Scene hosting the panel.
   * @param onSelectAgent Callback fired when a request row is clicked.
   */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly onSelectAgent: (agentId: string) => void
  ) {
    this.panel = scene.add.graphics();
    this.panel.setDepth(60);

    this.title = scene.add.text(0, 0, 'ACTION CENTER', {
      fontFamily: '"Courier New", "Consolas", monospace',
      fontStyle: 'bold',
      fontSize: '13px',
      color: '#f2f6ff'
    });
    this.title.setDepth(61);
    this.title.setLetterSpacing(1.1);
    this.title.setShadow(0, 1, '#00061b', 2, false, true);

    this.emptyText = scene.add.text(0, 0, 'No unresolved input requests.', {
      fontFamily: '"Courier New", "Consolas", monospace',
      fontSize: '11px',
      color: '#9fb6df'
    });
    this.emptyText.setDepth(61);
    this.emptyText.setShadow(0, 1, '#00061b', 2, false, true);
  }

  /**
   * Renders unresolved requests and live status metadata.
   *
   * @param entries Pending unresolved requests.
   * @param now Current timestamp.
   */
  update(entries: PendingInputRequest[], now: number): void {
    const x = this.scene.scale.width - ACTION_CENTER_WIDTH - 12;
    const y = 96;
    const displayEntries = entries.slice(0, MAX_ROWS);
    const height = 42 + Math.max(1, displayEntries.length) * ROW_HEIGHT;

    this.panel.clear();
    drawPanel(this.panel, x, y, ACTION_CENTER_WIDTH, height);
    this.title.setPosition(x + 10, y + 8);

    this.ensureRowCount(displayEntries.length);
    const hasEntries = displayEntries.length > 0;
    this.emptyText.setVisible(!hasEntries);
    if (!hasEntries) {
      this.emptyText.setPosition(x + 12, y + 50);
    }

    for (let i = 0; i < this.rows.length; i += 1) {
      const row = this.rows[i];
      if (row === undefined) {
        continue;
      }

      const entry = displayEntries[i];
      const rowY = y + 34 + i * ROW_HEIGHT;
      const visible = entry !== undefined;
      row.background.setVisible(visible);
      row.title.setVisible(visible);
      row.detail.setVisible(visible);
      row.hitArea.setVisible(false);
      row.hitArea.disableInteractive();
      row.agentId = null;
      if (!visible || entry === undefined) {
        continue;
      }

      row.background.clear();
      const ageMs = Math.max(0, now - entry.updatedAt);
      const stale = ageMs >= STALE_AGE_MS;
      row.background.fillStyle(stale ? 0x4f2334 : 0x203162, 0.95);
      row.background.fillRect(x + 8, rowY, ACTION_CENTER_WIDTH - 16, ROW_HEIGHT - 6);
      row.background.fillStyle(stale ? 0xff9eb8 : 0xa8f6ff, 0.85);
      row.background.fillRect(x + 8, rowY, 3, ROW_HEIGHT - 6);
      row.background.fillStyle(0xcde5ff, 0.12);
      row.background.fillRect(x + 11, rowY + 2, ACTION_CENTER_WIDTH - 22, 10);

      const agentName = (entry.agentName ?? entry.agentId).toUpperCase();
      const status = stale ? 'STALE' : 'PENDING';
      row.title.setText(`${agentName}  [${status}]`);
      row.title.setPosition(x + 16, rowY + 8);
      row.detail.setText(`${formatAge(ageMs)}  ${trimPrompt(entry.prompt, 56)}`);
      row.detail.setPosition(x + 16, rowY + 27);

      row.hitArea.setPosition(x + ACTION_CENTER_WIDTH / 2, rowY + (ROW_HEIGHT - 6) / 2);
      row.hitArea.setSize(ACTION_CENTER_WIDTH - 16, ROW_HEIGHT - 6);
      row.hitArea.setInteractive({ useHandCursor: true });
      row.agentId = entry.agentId;
    }
  }

  /**
   * Releases Action Center display resources.
   */
  destroy(): void {
    this.panel.destroy();
    this.title.destroy();
    this.emptyText.destroy();
    for (const row of this.rows) {
      row.background.destroy();
      row.title.destroy();
      row.detail.destroy();
      row.hitArea.destroy();
    }
    this.rows.length = 0;
  }

  private ensureRowCount(count: number): void {
    while (this.rows.length < count) {
      const background = this.scene.add.graphics();
      background.setDepth(61);

      const title = this.scene.add.text(0, 0, '', {
        fontFamily: '"Courier New", "Consolas", monospace',
        fontStyle: 'bold',
        fontSize: '11px',
        color: '#eff8ff'
      });
      title.setDepth(62);
      title.setShadow(0, 1, '#091031', 2, false, true);

      const detail = this.scene.add.text(0, 0, '', {
        fontFamily: '"Courier New", "Consolas", monospace',
        fontSize: '10px',
        color: '#b7d7ff'
      });
      detail.setDepth(62);
      detail.setShadow(0, 1, '#091031', 2, false, true);

      const hitArea = this.scene.add.rectangle(0, 0, 1, 1, 0x000000, 0);
      hitArea.setDepth(63);
      hitArea.on('pointerdown', () => {
        const row = this.rows.find((candidate) => candidate.hitArea === hitArea);
        if (row?.agentId !== null && row?.agentId !== undefined) {
          this.onSelectAgent(row.agentId);
        }
      });

      this.rows.push({
        background,
        title,
        detail,
        hitArea,
        agentId: null
      });
    }
  }
}

function drawPanel(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  graphics.fillStyle(0x141d56, 0.95);
  graphics.fillRect(x, y, width, height);
  graphics.fillStyle(0x9ab8ff, 0.96);
  graphics.fillRect(x, y, width, 2);
  graphics.fillRect(x, y + height - 2, width, 2);
  graphics.fillRect(x, y, 2, height);
  graphics.fillRect(x + width - 2, y, 2, height);
  graphics.fillStyle(0xd2e5ff, 0.16);
  graphics.fillRect(x + 2, y + 2, width - 4, 12);
}

function formatAge(ageMs: number): string {
  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m`;
}

function trimPrompt(value: string, maxLength: number): string {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength - 3)}...`;
}
