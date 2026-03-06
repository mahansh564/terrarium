import type { CreatureState } from '@shared/types';
import type { Creature } from '../entities/Creature';

interface LabelBundle {
  panel: Phaser.GameObjects.Graphics;
  name: Phaser.GameObjects.Text;
  detail: Phaser.GameObjects.Text;
}

/**
 * Floating HUD layer for creature names and state icons.
 */
export class HUD {
  private readonly labels = new Map<string, LabelBundle>();
  private readonly controlsPanel: Phaser.GameObjects.Graphics;
  private readonly controlsTitle: Phaser.GameObjects.Text;
  private readonly controlsBody: Phaser.GameObjects.Text;
  private readonly selectedPanel: Phaser.GameObjects.Graphics;
  private readonly selectedTitle: Phaser.GameObjects.Text;
  private readonly selectedBody: Phaser.GameObjects.Text;
  private selectedAgentId: string | null = null;

  /**
   * Creates HUD manager.
   *
   * @param scene Scene where HUD should render.
   */
  constructor(private readonly scene: Phaser.Scene) {
    this.controlsPanel = scene.add.graphics();
    this.controlsPanel.setDepth(60);

    this.controlsTitle = scene.add.text(0, 0, 'Control Deck', {
      fontFamily: '"Trebuchet MS", "Lucida Sans Unicode", sans-serif',
      fontStyle: 'bold',
      fontSize: '13px',
      color: '#f8feff'
    });
    this.controlsTitle.setDepth(61);
    this.controlsTitle.setShadow(0, 1, '#082734', 2, false, true);

    this.controlsBody = scene.add.text(0, 0, '', {
      fontFamily: '"Trebuchet MS", "Lucida Sans Unicode", sans-serif',
      fontSize: '11px',
      color: '#d8ffff',
      lineSpacing: 2
    });
    this.controlsBody.setDepth(61);
    this.controlsBody.setShadow(0, 1, '#082734', 2, false, true);

    this.selectedPanel = scene.add.graphics();
    this.selectedPanel.setDepth(60);

    this.selectedTitle = scene.add.text(0, 0, '', {
      fontFamily: '"Trebuchet MS", "Lucida Sans Unicode", sans-serif',
      fontStyle: 'bold',
      fontSize: '13px',
      color: '#fffef7'
    });
    this.selectedTitle.setDepth(61);
    this.selectedTitle.setShadow(0, 1, '#3c2d06', 2, false, true);

    this.selectedBody = scene.add.text(0, 0, '', {
      fontFamily: '"Trebuchet MS", "Lucida Sans Unicode", sans-serif',
      fontSize: '11px',
      color: '#fff6d7',
      lineSpacing: 2
    });
    this.selectedBody.setDepth(61);
    this.selectedBody.setShadow(0, 1, '#3c2d06', 2, false, true);
  }

  /**
   * Updates currently selected creature id for HUD highlighting.
   *
   * @param agentId Selected agent id, or null.
   */
  setSelectedAgent(agentId: string | null): void {
    this.selectedAgentId = agentId;
  }

  /**
   * Synchronizes label objects with active creature set.
   *
   * @param creatures Active creature map by agent id.
   */
  syncCreatures(creatures: Map<string, Creature>): void {
    for (const [agentId, creature] of creatures) {
      if (this.labels.has(agentId)) {
        continue;
      }

      const panel = this.scene.add.graphics();
      panel.setDepth(40);

      const name = this.scene.add.text(0, 0, creature.getAgent().name, {
        fontFamily: '"Trebuchet MS", "Lucida Sans Unicode", sans-serif',
        fontStyle: 'bold',
        fontSize: '12px',
        color: '#f7feff'
      });
      name.setDepth(41);
      name.setOrigin(0.5, 1);
      name.setShadow(0, 1, '#062233', 2, false, true);

      const detail = this.scene.add.text(0, 0, '', {
        fontFamily: '"Trebuchet MS", "Lucida Sans Unicode", sans-serif',
        fontSize: '10px',
        color: '#d3f7ff'
      });
      detail.setDepth(41);
      detail.setOrigin(0.5, 1);
      detail.setShadow(0, 1, '#062233', 2, false, true);

      this.labels.set(agentId, { panel, name, detail });
    }

    for (const [agentId, bundle] of this.labels) {
      if (creatures.has(agentId)) {
        continue;
      }

      bundle.panel.destroy();
      bundle.name.destroy();
      bundle.detail.destroy();
      this.labels.delete(agentId);
    }

    if (this.selectedAgentId !== null && !creatures.has(this.selectedAgentId)) {
      this.selectedAgentId = null;
    }
  }

  /**
   * Updates label positions and state icon content.
   *
   * @param creatures Active creature map by agent id.
   */
  update(creatures: Map<string, Creature>): void {
    this.updateControlsPanel();
    this.updateSelectedPanel(creatures);

    for (const [agentId, creature] of creatures) {
      const bundle = this.labels.get(agentId);
      if (bundle === undefined) {
        continue;
      }

      const snapshot = creature.getSnapshot();
      const state = snapshot.state;
      const { x, y } = creature.getPosition();
      const nameText = creature.getAgent().name;
      const detailText = `${stateIcon(state)}  Lv ${snapshot.level}`;
      const labelWidth = Math.max(82, this.measureLabelWidth(nameText, detailText));
      const panelX = x - labelWidth / 2;
      const panelY = y - 66;

      bundle.name.setText(nameText);
      bundle.detail.setText(detailText);
      bundle.name.setPosition(x, panelY + 22);
      bundle.detail.setPosition(x, panelY + 38);

      const isSelected = agentId === this.selectedAgentId;
      const stateColor = stateAccentColor(state);

      bundle.panel.clear();
      if (isSelected) {
        bundle.panel.fillStyle(0x2a679e, 0.94);
        bundle.panel.lineStyle(2, 0xfbff94, 1);
      } else {
        bundle.panel.fillStyle(0x163546, 0.86);
        bundle.panel.lineStyle(1, stateColor, 0.95);
      }
      bundle.panel.fillRoundedRect(panelX, panelY, labelWidth, 40, 8);
      bundle.panel.strokeRoundedRect(panelX, panelY, labelWidth, 40, 8);
      bundle.panel.fillStyle(0xffffff, 0.08);
      bundle.panel.fillRoundedRect(panelX + 1, panelY + 1, labelWidth - 2, 12, 8);
    }
  }

  /**
   * Releases HUD display resources.
   */
  destroy(): void {
    for (const bundle of this.labels.values()) {
      bundle.panel.destroy();
      bundle.name.destroy();
      bundle.detail.destroy();
    }
    this.labels.clear();

    this.controlsPanel.destroy();
    this.controlsTitle.destroy();
    this.controlsBody.destroy();
    this.selectedPanel.destroy();
    this.selectedTitle.destroy();
    this.selectedBody.destroy();
  }

  private updateControlsPanel(): void {
    const x = 12;
    const y = 12;
    const width = 320;
    const height = 66;

    this.controlsPanel.clear();
    this.controlsPanel.fillStyle(0x22577c, 0.92);
    this.controlsPanel.lineStyle(2, 0x7ef8ff, 0.94);
    this.controlsPanel.fillRoundedRect(x, y, width, height, 10);
    this.controlsPanel.strokeRoundedRect(x, y, width, height, 10);
    this.controlsPanel.fillStyle(0xffffff, 0.08);
    this.controlsPanel.fillRoundedRect(x + 1, y + 1, width - 2, 14, 10);

    this.controlsTitle.setText('Control Deck');
    this.controlsTitle.setPosition(x + 10, y + 7);
    this.controlsBody.setText('Select: Tab / Shift+Tab / 1..9\nMove: Arrow keys or WASD   Clear: Esc');
    this.controlsBody.setPosition(x + 10, y + 27);
  }

  private updateSelectedPanel(creatures: Map<string, Creature>): void {
    const width = 270;
    const x = this.scene.scale.width - width - 12;
    const y = 12;
    const selectedCreature =
      this.selectedAgentId === null ? undefined : creatures.get(this.selectedAgentId);

    this.selectedPanel.clear();
    this.selectedPanel.fillStyle(0x805823, 0.94);
    this.selectedPanel.lineStyle(2, 0xfff7a4, 0.95);
    this.selectedPanel.fillRoundedRect(x, y, width, 66, 10);
    this.selectedPanel.strokeRoundedRect(x, y, width, 66, 10);
    this.selectedPanel.fillStyle(0xffffff, 0.08);
    this.selectedPanel.fillRoundedRect(x + 1, y + 1, width - 2, 14, 10);

    if (selectedCreature === undefined) {
      this.selectedTitle.setText('No Creature Selected');
      this.selectedBody.setText('Click one or press Tab to start controlling');
    } else {
      const snapshot = selectedCreature.getSnapshot();
      const moodLabel = snapshot.mood >= 0 ? `+${snapshot.mood}` : `${snapshot.mood}`;

      this.selectedTitle.setText(`${selectedCreature.getAgent().name} [Selected]`);
      this.selectedBody.setText(
        `State: ${snapshot.state}  Level: ${snapshot.level}\nXP: ${snapshot.xp}  Mood: ${moodLabel}`
      );
    }

    this.selectedTitle.setPosition(x + 10, y + 7);
    this.selectedBody.setPosition(x + 10, y + 27);
  }

  private measureLabelWidth(name: string, detail: string): number {
    const roughCharacterWidth = 7;
    const widestText = Math.max(name.length, detail.length);
    return widestText * roughCharacterWidth + 20;
  }
}

function stateIcon(state: CreatureState): string {
  switch (state) {
    case 'working':
      return '[W]';
    case 'foraging':
      return '[R]';
    case 'resting':
      return '[Z]';
    case 'alert':
      return '[!]';
    case 'celebrating':
      return '[+]';
    case 'distressed':
      return '[-]';
    case 'idle':
    default:
      return '[o]';
  }
}

function stateAccentColor(state: CreatureState): number {
  switch (state) {
    case 'working':
      return 0x53ff9f;
    case 'foraging':
      return 0x6de6ff;
    case 'resting':
      return 0x8e8eff;
    case 'alert':
      return 0xffdb4d;
    case 'celebrating':
      return 0xffb84d;
    case 'distressed':
      return 0xff7f87;
    case 'idle':
    default:
      return 0x95b7cd;
  }
}
