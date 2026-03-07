import type { CrewState } from '@shared/types';
import type { CrewUnit } from '../entities/CrewUnit';

interface LabelBundle {
  panel: Phaser.GameObjects.Graphics;
  name: Phaser.GameObjects.Text;
  detail: Phaser.GameObjects.Text;
}

/**
 * Floating HUD layer for crew names and state icons.
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

    this.controlsTitle = scene.add.text(0, 0, 'Station Controls', {
      fontFamily: '"Trebuchet MS", "Lucida Sans Unicode", sans-serif',
      fontStyle: 'bold',
      fontSize: '13px',
      color: '#eefcff'
    });
    this.controlsTitle.setDepth(61);
    this.controlsTitle.setShadow(0, 1, '#041a2b', 2, false, true);

    this.controlsBody = scene.add.text(0, 0, '', {
      fontFamily: '"Trebuchet MS", "Lucida Sans Unicode", sans-serif',
      fontSize: '11px',
      color: '#caf6ff',
      lineSpacing: 2
    });
    this.controlsBody.setDepth(61);
    this.controlsBody.setShadow(0, 1, '#041a2b', 2, false, true);

    this.selectedPanel = scene.add.graphics();
    this.selectedPanel.setDepth(60);

    this.selectedTitle = scene.add.text(0, 0, '', {
      fontFamily: '"Trebuchet MS", "Lucida Sans Unicode", sans-serif',
      fontStyle: 'bold',
      fontSize: '13px',
      color: '#fffef7'
    });
    this.selectedTitle.setDepth(61);
    this.selectedTitle.setShadow(0, 1, '#14202e', 2, false, true);

    this.selectedBody = scene.add.text(0, 0, '', {
      fontFamily: '"Trebuchet MS", "Lucida Sans Unicode", sans-serif',
      fontSize: '11px',
      color: '#e9f5ff',
      lineSpacing: 2
    });
    this.selectedBody.setDepth(61);
    this.selectedBody.setShadow(0, 1, '#14202e', 2, false, true);
  }

  /**
   * Updates currently selected crew id for HUD highlighting.
   *
   * @param agentId Selected agent id, or null.
   */
  setSelectedAgent(agentId: string | null): void {
    this.selectedAgentId = agentId;
  }

  /**
   * Synchronizes label objects with active crew set.
   *
   * @param crewUnits Active crew map by agent id.
   */
  syncCrewUnits(crewUnits: Map<string, CrewUnit>): void {
    for (const [agentId, crew] of crewUnits) {
      if (this.labels.has(agentId)) {
        continue;
      }

      const panel = this.scene.add.graphics();
      panel.setDepth(40);

      const name = this.scene.add.text(0, 0, crew.getAgent().name, {
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
      if (crewUnits.has(agentId)) {
        continue;
      }

      bundle.panel.destroy();
      bundle.name.destroy();
      bundle.detail.destroy();
      this.labels.delete(agentId);
    }

    if (this.selectedAgentId !== null && !crewUnits.has(this.selectedAgentId)) {
      this.selectedAgentId = null;
    }
  }

  /**
   * Updates label positions and state icon content.
   *
   * @param crewUnits Active crew map by agent id.
   */
  update(crewUnits: Map<string, CrewUnit>): void {
    this.updateControlsPanel();
    this.updateSelectedPanel(crewUnits);

    for (const [agentId, crew] of crewUnits) {
      const bundle = this.labels.get(agentId);
      if (bundle === undefined) {
        continue;
      }

      const snapshot = crew.getSnapshot();
      const state = snapshot.state;
      const { x, y } = crew.getPosition();
      const nameText = crew.getAgent().name;
      const requestMarker = snapshot.requestingInput ? ' INPUT?' : '';
      const detailText = `${stateIcon(state)} Lv ${snapshot.level}${requestMarker}`;
      const labelWidth = Math.max(106, this.measureLabelWidth(nameText, detailText));
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
        bundle.panel.fillStyle(0x1d5f8e, 0.94);
        bundle.panel.lineStyle(2, 0xa6ffff, 1);
      } else {
        bundle.panel.fillStyle(0x132f43, 0.86);
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
    this.controlsPanel.fillStyle(0x1a4f73, 0.92);
    this.controlsPanel.lineStyle(2, 0x78f2ff, 0.94);
    this.controlsPanel.fillRoundedRect(x, y, width, height, 10);
    this.controlsPanel.strokeRoundedRect(x, y, width, height, 10);
    this.controlsPanel.fillStyle(0xffffff, 0.08);
    this.controlsPanel.fillRoundedRect(x + 1, y + 1, width - 2, 14, 10);

    this.controlsTitle.setText('Station Controls');
    this.controlsTitle.setPosition(x + 10, y + 7);
    this.controlsBody.setText('Select: Tab / Shift+Tab / 1..9\nMove: Arrow keys or WASD   Clear: Esc');
    this.controlsBody.setPosition(x + 10, y + 27);
  }

  private updateSelectedPanel(crewUnits: Map<string, CrewUnit>): void {
    const width = 290;
    const x = this.scene.scale.width - width - 12;
    const y = 12;
    const selectedCrew = this.selectedAgentId === null ? undefined : crewUnits.get(this.selectedAgentId);

    this.selectedPanel.clear();
    this.selectedPanel.fillStyle(0x22394f, 0.94);
    this.selectedPanel.lineStyle(2, 0xa8f7ff, 0.95);
    this.selectedPanel.fillRoundedRect(x, y, width, 74, 10);
    this.selectedPanel.strokeRoundedRect(x, y, width, 74, 10);
    this.selectedPanel.fillStyle(0xffffff, 0.08);
    this.selectedPanel.fillRoundedRect(x + 1, y + 1, width - 2, 14, 10);

    if (selectedCrew === undefined) {
      this.selectedTitle.setText('No Crew Selected');
      this.selectedBody.setText('Click one or press Tab to start controlling');
    } else {
      const snapshot = selectedCrew.getSnapshot();
      const moodLabel = snapshot.mood >= 0 ? `+${snapshot.mood}` : `${snapshot.mood}`;
      const requestLine = snapshot.requestingInput ? '\nREQUESTING INPUT' : '';

      this.selectedTitle.setText(`${selectedCrew.getAgent().name} [Selected]`);
      this.selectedBody.setText(
        `State: ${snapshot.state}  Level: ${snapshot.level}\nXP: ${snapshot.xp}  Mood: ${moodLabel}${requestLine}`
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

function stateIcon(state: CrewState): string {
  switch (state) {
    case 'repairing':
      return '[RPR]';
    case 'scanning':
      return '[SCN]';
    case 'docked':
      return '[DCK]';
    case 'alert':
      return '[ALR]';
    case 'celebrating':
      return '[OK]';
    case 'damaged':
      return '[DMG]';
    case 'requesting_input':
      return '[ASK]';
    case 'standby':
    default:
      return '[STB]';
  }
}

function stateAccentColor(state: CrewState): number {
  switch (state) {
    case 'repairing':
      return 0x53ff9f;
    case 'scanning':
      return 0x6de6ff;
    case 'docked':
      return 0x90a3c6;
    case 'alert':
      return 0xffdb4d;
    case 'celebrating':
      return 0x9affc5;
    case 'damaged':
      return 0xff7f87;
    case 'requesting_input':
      return 0xb4f8ff;
    case 'standby':
    default:
      return 0x95b7cd;
  }
}
