import type { CrewState } from '@shared/types';
import type { CrewUnit } from '../entities/CrewUnit';

const PIXEL_FONT_FAMILY = '"Courier New", "Consolas", monospace';
const CONTROLS_PANEL_EXPANDED_HEIGHT = 68;
const CONTROLS_PANEL_COLLAPSED_HEIGHT = 24;

interface LabelBundle {
  panel: Phaser.GameObjects.Graphics;
  name: Phaser.GameObjects.Text;
  detail: Phaser.GameObjects.Text;
}

interface PixelPanelStyle {
  fill: number;
  border: number;
  accent: number;
  borderThickness: number;
  alpha: number;
}

interface AddAgentButtonStyle {
  hovered: boolean;
  pressed: boolean;
}

/**
 * Floating HUD layer for crew names and state icons.
 */
export class HUD {
  private readonly scene: Phaser.Scene;
  private readonly labels = new Map<string, LabelBundle>();
  private readonly controlsPanel: Phaser.GameObjects.Graphics;
  private readonly controlsTitle: Phaser.GameObjects.Text;
  private readonly controlsBody: Phaser.GameObjects.Text;
  private readonly controlsCollapseButton: Phaser.GameObjects.Graphics;
  private readonly controlsCollapseLabel: Phaser.GameObjects.Text;
  private readonly controlsCollapseHitArea: Phaser.GameObjects.Rectangle;
  private readonly addAgentButton: Phaser.GameObjects.Graphics;
  private readonly addAgentLabel: Phaser.GameObjects.Text;
  private readonly addAgentHint: Phaser.GameObjects.Text;
  private readonly addAgentHitArea: Phaser.GameObjects.Rectangle;
  private readonly selectedPanel: Phaser.GameObjects.Graphics;
  private readonly selectedTitle: Phaser.GameObjects.Text;
  private readonly selectedBody: Phaser.GameObjects.Text;
  private readonly onAddAgent: () => void;
  private addAgentHovered = false;
  private addAgentPressedAt = 0;
  private controlsCollapsed = false;
  private selectedAgentId: string | null = null;

  /**
   * Creates HUD manager.
   *
   * @param scene Scene where HUD should render.
   * @param onAddAgent Callback invoked when add-agent control is used.
   */
  constructor(scene: Phaser.Scene, onAddAgent: () => void) {
    this.scene = scene;
    this.onAddAgent = onAddAgent;

    this.controlsPanel = scene.add.graphics();
    this.controlsPanel.setDepth(60);

    this.controlsTitle = scene.add.text(0, 0, 'ORBITAL COMMANDS', {
      fontFamily: PIXEL_FONT_FAMILY,
      fontStyle: 'bold',
      fontSize: '13px',
      color: '#f2f6ff'
    });
    this.controlsTitle.setDepth(61);
    this.controlsTitle.setLetterSpacing(1.1);
    this.controlsTitle.setShadow(0, 1, '#00061b', 2, false, true);

    this.controlsBody = scene.add.text(0, 0, '', {
      fontFamily: PIXEL_FONT_FAMILY,
      fontSize: '11px',
      color: '#9ffbff',
      lineSpacing: 3
    });
    this.controlsBody.setDepth(61);
    this.controlsBody.setShadow(0, 1, '#00061b', 2, false, true);

    this.controlsCollapseButton = scene.add.graphics();
    this.controlsCollapseButton.setDepth(62);
    this.controlsCollapseLabel = scene.add.text(0, 0, '', {
      fontFamily: PIXEL_FONT_FAMILY,
      fontStyle: 'bold',
      fontSize: '10px',
      color: '#d8e8ff'
    });
    this.controlsCollapseLabel.setDepth(63);
    this.controlsCollapseLabel.setShadow(0, 1, '#00061b', 2, false, true);
    this.controlsCollapseHitArea = scene.add.rectangle(0, 0, 1, 1, 0x000000, 0);
    this.controlsCollapseHitArea.setDepth(64);
    this.controlsCollapseHitArea.setInteractive({ useHandCursor: true });
    this.controlsCollapseHitArea.on('pointerdown', () => {
      this.controlsCollapsed = !this.controlsCollapsed;
    });

    this.addAgentButton = scene.add.graphics();
    this.addAgentButton.setDepth(63);
    this.addAgentLabel = scene.add.text(0, 0, '+ ADD AGENT', {
      fontFamily: PIXEL_FONT_FAMILY,
      fontStyle: 'bold',
      fontSize: '11px',
      color: '#f2fbff'
    });
    this.addAgentLabel.setDepth(64);
    this.addAgentLabel.setLetterSpacing(0.6);
    this.addAgentLabel.setShadow(0, 1, '#00061b', 2, false, true);
    this.addAgentHint = scene.add.text(0, 0, '[N]', {
      fontFamily: PIXEL_FONT_FAMILY,
      fontSize: '10px',
      color: '#b5f4ff'
    });
    this.addAgentHint.setDepth(64);
    this.addAgentHint.setShadow(0, 1, '#00061b', 2, false, true);
    this.addAgentHitArea = scene.add.rectangle(0, 0, 1, 1, 0x000000, 0);
    this.addAgentHitArea.setDepth(65);
    this.addAgentHitArea.setInteractive({ useHandCursor: true });
    this.addAgentHitArea.on('pointerover', () => {
      this.addAgentHovered = true;
    });
    this.addAgentHitArea.on('pointerout', () => {
      this.addAgentHovered = false;
    });
    this.addAgentHitArea.on('pointerdown', () => {
      this.addAgentPressedAt = this.scene.time.now;
      this.onAddAgent();
    });

    this.selectedPanel = scene.add.graphics();
    this.selectedPanel.setDepth(60);

    this.selectedTitle = scene.add.text(0, 0, '', {
      fontFamily: PIXEL_FONT_FAMILY,
      fontStyle: 'bold',
      fontSize: '13px',
      color: '#fff7d0'
    });
    this.selectedTitle.setDepth(61);
    this.selectedTitle.setLetterSpacing(1.1);
    this.selectedTitle.setShadow(0, 1, '#0c1532', 2, false, true);

    this.selectedBody = scene.add.text(0, 0, '', {
      fontFamily: PIXEL_FONT_FAMILY,
      fontSize: '11px',
      color: '#deedff',
      lineSpacing: 3
    });
    this.selectedBody.setDepth(61);
    this.selectedBody.setShadow(0, 1, '#0c1532', 2, false, true);
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

      const name = this.scene.add.text(0, 0, crew.getAgent().name.toUpperCase(), {
        fontFamily: PIXEL_FONT_FAMILY,
        fontStyle: 'bold',
        fontSize: '12px',
        color: '#f4f8ff'
      });
      name.setDepth(41);
      name.setOrigin(0.5, 1);
      name.setLetterSpacing(0.8);
      name.setShadow(0, 1, '#0a1638', 2, false, true);

      const detail = this.scene.add.text(0, 0, '', {
        fontFamily: PIXEL_FONT_FAMILY,
        fontSize: '10px',
        color: '#9fe8ff'
      });
      detail.setDepth(41);
      detail.setOrigin(0.5, 1);
      detail.setShadow(0, 1, '#0a1638', 2, false, true);

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
      const nameText = crew.getAgent().name.toUpperCase();
      const requestMarker = snapshot.requestingInput ? ' INPUT?' : '';
      const detailText = `${stateIcon(state)} LV ${snapshot.level}${requestMarker}`;
      const labelWidth = Math.max(132, this.measureLabelWidth(nameText, detailText));
      const panelX = Math.round(x - labelWidth / 2);
      const panelY = Math.round(y - 66);

      bundle.name.setText(nameText);
      bundle.detail.setText(detailText);
      bundle.name.setPosition(Math.round(x), panelY + 20);
      bundle.detail.setPosition(Math.round(x), panelY + 36);

      const isSelected = agentId === this.selectedAgentId;
      const stateColor = stateAccentColor(state);

      drawPixelPanel(bundle.panel, panelX, panelY, labelWidth, 40, {
        fill: isSelected ? 0x23307d : 0x141d55,
        border: isSelected ? 0xbdf7ff : stateColor,
        accent: isSelected ? 0xfcffce : 0x8ec8ff,
        borderThickness: isSelected ? 2 : 1,
        alpha: isSelected ? 0.98 : 0.92
      });

      bundle.panel.fillStyle(stateColor, 0.88);
      bundle.panel.fillRect(panelX + 4, panelY + 4, 3, 32);
      drawStateGlyph(bundle.panel, panelX + 10, panelY + 17, snapshot.state, stateColor);

      const activePips = Math.min(4, Math.max(1, Math.ceil(snapshot.level / 2)));
      for (let pip = 0; pip < 4; pip += 1) {
        const filled = pip < activePips;
        const pipColor = snapshot.requestingInput && pip === 3 ? 0xff9fb2 : stateColor;
        bundle.panel.fillStyle(pipColor, filled ? 0.82 : 0.22);
        bundle.panel.fillRect(panelX + labelWidth - 14, panelY + 6 + pip * 8, 8, 5);
      }
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
    this.controlsCollapseButton.destroy();
    this.controlsCollapseLabel.destroy();
    this.controlsCollapseHitArea.destroy();
    this.addAgentButton.destroy();
    this.addAgentLabel.destroy();
    this.addAgentHint.destroy();
    this.addAgentHitArea.destroy();
    this.selectedPanel.destroy();
    this.selectedTitle.destroy();
    this.selectedBody.destroy();
  }

  private updateControlsPanel(): void {
    const x = 12;
    const y = 12;
    const width = 398;
    const height = this.controlsCollapsed
      ? CONTROLS_PANEL_COLLAPSED_HEIGHT
      : CONTROLS_PANEL_EXPANDED_HEIGHT;

    drawPixelPanel(this.controlsPanel, x, y, width, height, {
      fill: 0x131d5a,
      border: 0x9ab8ff,
      accent: 0xd2e5ff,
      borderThickness: 2,
      alpha: 0.95
    });

    this.controlsTitle.setText('ORBITAL COMMANDS');
    this.controlsTitle.setPosition(x + 10, y + 7);
    drawCollapseToggle(
      this.controlsCollapseButton,
      x + width - 32,
      y + 5,
      this.controlsCollapsed
    );
    this.controlsCollapseLabel.setText(this.controlsCollapsed ? '[+]' : '[-]');
    this.controlsCollapseLabel.setPosition(x + width - 27, y + 8);
    this.controlsCollapseHitArea.setPosition(x + width - 20, y + 12);
    this.controlsCollapseHitArea.setSize(24, 14);

    if (this.controlsCollapsed) {
      this.controlsBody.setVisible(false);
      this.addAgentButton.clear();
      this.addAgentButton.setVisible(false);
      this.addAgentLabel.setVisible(false);
      this.addAgentHint.setVisible(false);
      this.addAgentHitArea.setVisible(false);
      this.addAgentHitArea.disableInteractive();
      this.addAgentHovered = false;
      return;
    }

    this.controlsBody.setVisible(true);
    this.controlsBody.setText('SELECT: TAB / SHIFT+TAB / 1..9\nMOVE: ARROW OR WASD   CLEAR: ESC   ADD: N');
    this.controlsBody.setPosition(x + 10, y + 27);

    const buttonWidth = 122;
    const buttonHeight = 38;
    const buttonX = x + width - buttonWidth - 10;
    const buttonY = y + 16;
    const pressed = this.scene.time.now - this.addAgentPressedAt <= 120;
    this.addAgentButton.setVisible(true);
    drawAddAgentButton(this.addAgentButton, buttonX, buttonY, buttonWidth, buttonHeight, {
      hovered: this.addAgentHovered,
      pressed
    });
    this.addAgentLabel.setVisible(true);
    this.addAgentLabel.setPosition(buttonX + 13, buttonY + 9);
    this.addAgentHint.setVisible(true);
    this.addAgentHint.setPosition(buttonX + 45, buttonY + 23);
    this.addAgentHitArea.setVisible(false);
    this.addAgentHitArea.setPosition(buttonX + buttonWidth / 2, buttonY + buttonHeight / 2);
    this.addAgentHitArea.setSize(buttonWidth, buttonHeight);
    this.addAgentHitArea.setInteractive({ useHandCursor: true });

    const scanlineY = y + 22 + Math.floor((this.scene.time.now / 120) % 32);
    this.controlsPanel.fillStyle(0xcde5ff, 0.18);
    this.controlsPanel.fillRect(x + 3, scanlineY, width - 6, 1);
    drawPixelRocket(this.controlsPanel, x + 238, y + 8, 0xbfd0ff, 0xff8ca8);
    drawPixelStars(this.controlsPanel, x + 150, y + 10, 0xf4fbff);
    drawPixelSparkles(this.controlsPanel, x + 256, y + 8, 0xf3f8ff);
  }

  private updateSelectedPanel(crewUnits: Map<string, CrewUnit>): void {
    const width = 322;
    const x = this.scene.scale.width - width - 12;
    const y = 12;
    const selectedCrew = this.selectedAgentId === null ? undefined : crewUnits.get(this.selectedAgentId);

    drawPixelPanel(this.selectedPanel, x, y, width, 76, {
      fill: 0x211d68,
      border: selectedCrew === undefined ? 0x90a5de : stateAccentColor(selectedCrew.getSnapshot().state),
      accent: 0xfff5bd,
      borderThickness: 2,
      alpha: 0.95
    });

    if (selectedCrew === undefined) {
      this.selectedTitle.setText('NO CREW SELECTED');
      this.selectedBody.setText('CLICK ANY UNIT OR PRESS TAB\nTO TAKE MANUAL CONTROL');
    } else {
      const snapshot = selectedCrew.getSnapshot();
      const moodLabel = snapshot.mood >= 0 ? `+${snapshot.mood}` : `${snapshot.mood}`;
      const requestLine = snapshot.requestingInput ? '\nSTATUS: REQUESTING INPUT' : '';

      this.selectedTitle.setText(`${selectedCrew.getAgent().name.toUpperCase()} [SELECTED]`);
      this.selectedBody.setText(
        `STATE: ${snapshot.state.toUpperCase()}  LEVEL: ${snapshot.level}\nXP: ${snapshot.xp}  MOOD: ${moodLabel}${requestLine}`
      );

      const moodRatio = Math.max(0, Math.min(1, (snapshot.mood + 100) / 200));
      this.selectedPanel.fillStyle(0x110f37, 0.85);
      this.selectedPanel.fillRect(x + 10, y + 64, width - 20, 6);
      this.selectedPanel.fillStyle(snapshot.mood >= 0 ? 0x9affcb : 0xff9fb0, 0.92);
      this.selectedPanel.fillRect(x + 10, y + 64, Math.round((width - 20) * moodRatio), 6);
      drawPixelSatellite(this.selectedPanel, x + width - 30, y + 8, 0xc7ddff);
      drawPixelPlanet(this.selectedPanel, x + width - 46, y + 46, snapshot.mood >= 0 ? 0x9dd6ff : 0xffa3b3);
    }

    this.selectedTitle.setPosition(x + 10, y + 7);
    this.selectedBody.setPosition(x + 10, y + 28);
  }

  private measureLabelWidth(name: string, detail: string): number {
    const roughCharacterWidth = 8;
    const widestText = Math.max(name.length, detail.length);
    return widestText * roughCharacterWidth + 24;
  }
}

function drawCollapseToggle(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  collapsed: boolean
): void {
  graphics.clear();
  graphics.fillStyle(collapsed ? 0x1a3f7b : 0x24508e, 0.95);
  graphics.fillRect(x, y, 20, 14);
  graphics.fillStyle(0xbbe1ff, 0.96);
  graphics.fillRect(x, y, 20, 2);
  graphics.fillRect(x, y + 12, 20, 2);
  graphics.fillRect(x, y, 2, 14);
  graphics.fillRect(x + 18, y, 2, 14);
}

function drawPixelPanel(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  style: PixelPanelStyle
): void {
  graphics.clear();
  graphics.fillStyle(style.fill, style.alpha);
  graphics.fillRect(x, y, width, height);

  graphics.fillStyle(style.accent, 0.16);
  graphics.fillRect(x + 2, y + 2, width - 4, 10);
  graphics.fillStyle(style.accent, 0.08);
  for (let stripeY = y + 14; stripeY < y + height - 4; stripeY += 6) {
    graphics.fillRect(x + 2, stripeY, width - 4, 1);
  }

  graphics.fillStyle(style.border, 0.96);
  graphics.fillRect(x, y, width, style.borderThickness);
  graphics.fillRect(x, y + height - style.borderThickness, width, style.borderThickness);
  graphics.fillRect(x, y, style.borderThickness, height);
  graphics.fillRect(x + width - style.borderThickness, y, style.borderThickness, height);

  graphics.fillStyle(style.accent, 0.95);
  graphics.fillRect(x - 1, y - 1, 3, 3);
  graphics.fillRect(x + width - 2, y - 1, 3, 3);
  graphics.fillRect(x - 1, y + height - 2, 3, 3);
  graphics.fillRect(x + width - 2, y + height - 2, 3, 3);
}

function drawAddAgentButton(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  style: AddAgentButtonStyle
): void {
  graphics.clear();
  const fill = style.pressed ? 0x19336f : style.hovered ? 0x174082 : 0x163876;
  const border = style.hovered ? 0xb8f8ff : 0x96c3ff;
  const accent = style.hovered ? 0xeefeff : 0xcde8ff;
  graphics.fillStyle(fill, 0.98);
  graphics.fillRect(x, y, width, height);
  graphics.fillStyle(accent, 0.16);
  graphics.fillRect(x + 2, y + 2, width - 4, 8);
  graphics.fillStyle(accent, 0.1);
  graphics.fillRect(x + 2, y + 13, width - 4, 1);
  graphics.fillRect(x + 2, y + 20, width - 4, 1);
  graphics.fillRect(x + 2, y + 27, width - 4, 1);
  graphics.fillStyle(border, 0.98);
  graphics.fillRect(x, y, width, 2);
  graphics.fillRect(x, y + height - 2, width, 2);
  graphics.fillRect(x, y, 2, height);
  graphics.fillRect(x + width - 2, y, 2, height);
  graphics.fillStyle(0xf8ffd5, 0.95);
  graphics.fillRect(x + 7, y + 7, 8, 2);
  graphics.fillRect(x + 10, y + 4, 2, 8);
}

function drawPixelSparkles(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  color: number
): void {
  graphics.fillStyle(color, 0.95);
  graphics.fillRect(x, y, 2, 2);
  graphics.fillRect(x + 4, y + 4, 1, 1);
  graphics.fillRect(x + 7, y, 1, 1);
  graphics.fillRect(x + 2, y + 7, 1, 1);
}

function drawPixelStars(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  color: number
): void {
  graphics.fillStyle(color, 0.9);
  graphics.fillRect(x, y, 1, 1);
  graphics.fillRect(x + 6, y + 2, 1, 1);
  graphics.fillRect(x + 11, y - 1, 1, 1);
  graphics.fillRect(x + 14, y + 3, 1, 1);
}

function drawPixelRocket(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  bodyColor: number,
  flameColor: number
): void {
  graphics.fillStyle(bodyColor, 0.95);
  graphics.fillRect(x + 2, y, 2, 1);
  graphics.fillRect(x + 1, y + 1, 4, 3);
  graphics.fillRect(x + 2, y + 4, 2, 3);
  graphics.fillStyle(0x8deaff, 0.95);
  graphics.fillRect(x + 2, y + 2, 2, 1);
  graphics.fillStyle(flameColor, 0.95);
  graphics.fillRect(x + 2, y + 7, 2, 2);
  graphics.fillStyle(0xfff1a3, 0.95);
  graphics.fillRect(x + 2, y + 8, 1, 1);
  graphics.fillRect(x + 3, y + 8, 1, 1);
}

function drawPixelPlanet(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  color: number
): void {
  graphics.fillStyle(color, 0.92);
  graphics.fillRect(x + 2, y + 1, 4, 4);
  graphics.fillRect(x + 1, y + 2, 6, 2);
  graphics.fillStyle(0xd8ebff, 0.62);
  graphics.fillRect(x + 3, y + 2, 2, 1);
  graphics.fillStyle(0x7ecbff, 0.82);
  graphics.fillRect(x, y + 3, 8, 1);
}

function drawPixelSatellite(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  color: number
): void {
  graphics.fillStyle(color, 0.95);
  graphics.fillRect(x + 2, y + 1, 2, 2);
  graphics.fillRect(x + 1, y + 2, 4, 1);
  graphics.fillRect(x, y + 2, 1, 1);
  graphics.fillRect(x + 5, y + 2, 1, 1);
  graphics.fillStyle(0xa7f2ff, 0.9);
  graphics.fillRect(x - 2, y + 1, 2, 2);
  graphics.fillRect(x + 6, y + 1, 2, 2);
}

function drawStateGlyph(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  state: CrewState,
  color: number
): void {
  graphics.fillStyle(color, 0.95);
  switch (state) {
    case 'repairing':
      graphics.fillRect(x, y, 4, 1);
      graphics.fillRect(x + 1, y + 1, 1, 3);
      graphics.fillRect(x + 3, y + 1, 1, 3);
      break;
    case 'scanning':
      graphics.fillRect(x, y + 1, 4, 1);
      graphics.fillRect(x + 1, y, 2, 1);
      graphics.fillRect(x + 1, y + 2, 2, 1);
      break;
    case 'alert':
      graphics.fillRect(x + 1, y, 2, 3);
      graphics.fillRect(x + 1, y + 4, 2, 1);
      break;
    case 'damaged':
      graphics.fillRect(x, y, 1, 5);
      graphics.fillRect(x + 3, y, 1, 5);
      graphics.fillRect(x + 1, y + 2, 2, 1);
      break;
    case 'celebrating':
      graphics.fillRect(x + 1, y, 2, 5);
      graphics.fillRect(x, y + 1, 4, 1);
      graphics.fillRect(x, y + 3, 4, 1);
      break;
    case 'requesting_input':
      graphics.fillRect(x + 1, y, 2, 3);
      graphics.fillRect(x + 2, y + 4, 1, 1);
      break;
    case 'docked':
      graphics.fillRect(x, y + 1, 4, 3);
      break;
    case 'standby':
    default:
      graphics.fillRect(x + 1, y, 2, 1);
      graphics.fillRect(x, y + 1, 1, 3);
      graphics.fillRect(x + 3, y + 1, 1, 3);
      graphics.fillRect(x + 1, y + 4, 2, 1);
      break;
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
      return '[OK ]';
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
      return 0x88ffc5;
    case 'scanning':
      return 0x92d4ff;
    case 'docked':
      return 0xa8b7dc;
    case 'alert':
      return 0xffdf8a;
    case 'celebrating':
      return 0xb8ffd9;
    case 'damaged':
      return 0xff8aa0;
    case 'requesting_input':
      return 0xafffff;
    case 'standby':
    default:
      return 0xa6b6dc;
  }
}
