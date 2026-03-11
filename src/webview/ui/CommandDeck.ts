/**
 * Runtime command-deck UI state.
 */
export interface CommandDeckState {
  stationEffectsEnabled: boolean;
  audioEnabled: boolean;
  simulationSpeed: number;
  followSelectedAgent: boolean;
}

interface CommandDeckCallbacks {
  onToggleEffects: () => void;
  onToggleAudio: () => void;
  onCycleSpeed: () => void;
  onToggleFollow: () => void;
}

interface DeckButton {
  readonly key: 'effects' | 'audio' | 'speed' | 'follow';
  readonly background: Phaser.GameObjects.Graphics;
  readonly label: Phaser.GameObjects.Text;
  readonly hitArea: Phaser.GameObjects.Rectangle;
  hovered: boolean;
}

const PANEL_X = 12;
const PANEL_Y = 86;
const PANEL_WIDTH = 398;
const PANEL_HEIGHT = 52;

/**
 * Command deck panel with runtime toggles and simulation controls.
 */
export class CommandDeck {
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private readonly buttons: DeckButton[] = [];

  /**
   * Creates a command deck panel.
   *
   * @param scene Scene hosting the panel.
   * @param callbacks Callback handlers for command actions.
   */
  constructor(
    private readonly scene: Phaser.Scene,
    callbacks: CommandDeckCallbacks
  ) {
    this.panel = scene.add.graphics();
    this.panel.setDepth(60);

    this.title = scene.add.text(PANEL_X + 10, PANEL_Y + 6, 'COMMAND DECK', {
      fontFamily: '"Courier New", "Consolas", monospace',
      fontStyle: 'bold',
      fontSize: '11px',
      color: '#f3f7ff'
    });
    this.title.setDepth(61);
    this.title.setShadow(0, 1, '#00061b', 2, false, true);

    this.buttons.push(
      this.createButton('effects', callbacks.onToggleEffects),
      this.createButton('audio', callbacks.onToggleAudio),
      this.createButton('speed', callbacks.onCycleSpeed),
      this.createButton('follow', callbacks.onToggleFollow)
    );
  }

  /**
   * Updates command deck visuals with current runtime state.
   *
   * @param state Runtime command-deck state.
   * @param now Current timestamp.
   */
  update(state: CommandDeckState, now: number): void {
    this.panel.clear();
    this.panel.fillStyle(0x141d56, 0.94);
    this.panel.fillRect(PANEL_X, PANEL_Y, PANEL_WIDTH, PANEL_HEIGHT);
    this.panel.fillStyle(0x95bbff, 0.96);
    this.panel.fillRect(PANEL_X, PANEL_Y, PANEL_WIDTH, 2);
    this.panel.fillRect(PANEL_X, PANEL_Y + PANEL_HEIGHT - 2, PANEL_WIDTH, 2);
    this.panel.fillRect(PANEL_X, PANEL_Y, 2, PANEL_HEIGHT);
    this.panel.fillRect(PANEL_X + PANEL_WIDTH - 2, PANEL_Y, 2, PANEL_HEIGHT);

    const labels = {
      effects: `FX ${state.stationEffectsEnabled ? 'ON' : 'OFF'}`,
      audio: `AUDIO ${state.audioEnabled ? 'ON' : 'OFF'}`,
      speed: `SPEED x${state.simulationSpeed.toFixed(2)}`,
      follow: `FOLLOW ${state.followSelectedAgent ? 'ON' : 'OFF'}`
    };

    for (let i = 0; i < this.buttons.length; i += 1) {
      const button = this.buttons[i];
      if (button === undefined) {
        continue;
      }

      const width = 90;
      const height = 24;
      const x = PANEL_X + 10 + i * (width + 6);
      const y = PANEL_Y + 22;
      button.background.clear();
      const pulse = 0.95 + Math.sin(now * 0.012 + i) * 0.04;
      const fill = button.hovered ? 0x2152a1 : 0x193b7a;
      button.background.fillStyle(fill, pulse);
      button.background.fillRect(x, y, width, height);
      button.background.fillStyle(0xbbe5ff, button.hovered ? 1 : 0.88);
      button.background.fillRect(x, y, width, 2);
      button.background.fillRect(x, y + height - 2, width, 2);
      button.background.fillRect(x, y, 2, height);
      button.background.fillRect(x + width - 2, y, 2, height);

      button.label.setText(labels[button.key]);
      button.label.setPosition(x + 7, y + 6);
      button.hitArea.setPosition(x + width / 2, y + height / 2);
      button.hitArea.setSize(width, height);
    }
  }

  /**
   * Releases command deck resources.
   */
  destroy(): void {
    this.panel.destroy();
    this.title.destroy();
    for (const button of this.buttons) {
      button.background.destroy();
      button.label.destroy();
      button.hitArea.destroy();
    }
    this.buttons.length = 0;
  }

  private createButton(
    key: DeckButton['key'],
    onClick: () => void
  ): DeckButton {
    const background = this.scene.add.graphics();
    background.setDepth(61);

    const label = this.scene.add.text(0, 0, '', {
      fontFamily: '"Courier New", "Consolas", monospace',
      fontStyle: 'bold',
      fontSize: '10px',
      color: '#eff9ff'
    });
    label.setDepth(62);
    label.setShadow(0, 1, '#00061b', 2, false, true);

    const hitArea = this.scene.add.rectangle(0, 0, 1, 1, 0x000000, 0);
    hitArea.setDepth(63);
    const button: DeckButton = {
      key,
      background,
      label,
      hitArea,
      hovered: false
    };
    hitArea.setInteractive({ useHandCursor: true });
    hitArea.on('pointerover', () => {
      button.hovered = true;
    });
    hitArea.on('pointerout', () => {
      button.hovered = false;
    });
    hitArea.on('pointerdown', () => {
      onClick();
    });
    return button;
  }
}
