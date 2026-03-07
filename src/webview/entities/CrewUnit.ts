import {
  LEVEL_THRESHOLDS,
  MOOD_BOUNDS,
  MOOD_DELTA_PER_ACTION,
  STATE_DURATIONS,
  XP_PER_ACTION
} from '@shared/constants';
import type {
  AgentAction,
  AgentConfig,
  AgentEvent,
  CrewState,
  PersistedCrewState
} from '@shared/types';

/**
 * Internal runtime snapshot for crew logic.
 */
export interface CrewSnapshot {
  /** Current finite-state-machine state. */
  state: CrewState;
  /** Accumulated XP. */
  xp: number;
  /** Current level. */
  level: number;
  /** Mood score. */
  mood: number;
  /** Last update timestamp in milliseconds. */
  updatedAt: number;
  /** Whether the crew unit is actively requesting user input. */
  requestingInput: boolean;
}

/**
 * Maps an action to the target crew state.
 *
 * @param action Normalized agent action.
 * @returns Crew state mapped from action semantics.
 */
export function deriveStateFromAction(action: AgentAction): CrewState {
  switch (action) {
    case 'read':
      return 'scanning';
    case 'write':
      return 'repairing';
    case 'test_run':
    case 'terminal':
      return 'alert';
    case 'idle':
      return 'docked';
    case 'error':
    case 'test_fail':
      return 'damaged';
    case 'test_pass':
    case 'complete':
    case 'deploy':
      return 'celebrating';
    case 'input_request':
      return 'requesting_input';
    default:
      return 'standby';
  }
}

/**
 * Applies one action to crew progress metrics.
 *
 * @param snapshot Existing crew snapshot.
 * @param action Incoming action.
 * @param now Current timestamp in milliseconds.
 * @returns Updated crew snapshot.
 */
export function applyActionToSnapshot(
  snapshot: CrewSnapshot,
  action: AgentAction,
  now: number
): CrewSnapshot {
  const xp = snapshot.xp + XP_PER_ACTION[action];
  const moodUnclamped = snapshot.mood + MOOD_DELTA_PER_ACTION[action];

  return {
    ...snapshot,
    state: deriveStateFromAction(action),
    xp,
    level: levelFromXp(xp),
    mood: clamp(moodUnclamped, MOOD_BOUNDS.min, MOOD_BOUNDS.max),
    updatedAt: now
  };
}

/**
 * Computes crew level from XP value.
 *
 * @param xp Experience points.
 * @returns Derived level.
 */
export function levelFromXp(xp: number): number {
  let level = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i += 1) {
    const threshold = LEVEL_THRESHOLDS[i];
    if (threshold !== undefined && xp >= threshold) {
      level = i + 1;
    }
  }

  return level;
}

/**
 * Crew unit entity with sprite and finite-state-machine behavior.
 */
export class CrewUnit {
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly selectionRing: Phaser.GameObjects.Arc;
  private readonly commsHalo: Phaser.GameObjects.Arc;
  private readonly commsCore: Phaser.GameObjects.Arc;
  private readonly commsText: Phaser.GameObjects.Text;
  private snapshot: CrewSnapshot;
  private selected = false;
  private manualMovement = false;

  /**
   * Creates a crew unit entity.
   *
   * @param scene Phaser scene hosting this crew unit.
   * @param agent Agent config represented by this crew unit.
   * @param x Spawn x coordinate.
   * @param y Spawn y coordinate.
   * @param textureKey Crew texture key prefix.
   * @param persisted Persisted state loaded from workspace.
   */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly agent: AgentConfig,
    x: number,
    y: number,
    textureKey: string,
    persisted: PersistedCrewState
  ) {
    this.sprite = scene.add.sprite(x, y, `${textureKey}-idle`);
    this.sprite.setOrigin(0.5, 0.5);
    this.sprite.setScale(2);
    this.sprite.setDepth(20);
    this.sprite.setInteractive({ useHandCursor: true });

    this.selectionRing = scene.add.circle(x, y + 14, 14, 0x66d9ff, 0.14);
    this.selectionRing.setStrokeStyle(2, 0x8fffe0, 0.9);
    this.selectionRing.setScale(1.4, 0.58);
    this.selectionRing.setDepth(18);
    this.selectionRing.setVisible(false);

    this.commsHalo = scene.add.circle(x + 17, y - 25, 8, 0x74e9ff, 0.18);
    this.commsHalo.setStrokeStyle(2, 0xb8fdff, 0.9);
    this.commsHalo.setDepth(33);
    this.commsHalo.setVisible(false);

    this.commsCore = scene.add.circle(x + 17, y - 25, 4, 0x74e9ff, 0.95);
    this.commsCore.setDepth(34);
    this.commsCore.setVisible(false);

    this.commsText = scene.add.text(x + 17, y - 25, '?', {
      fontFamily: '"Trebuchet MS", "Lucida Sans Unicode", sans-serif',
      fontSize: '11px',
      fontStyle: 'bold',
      color: '#00131f'
    });
    this.commsText.setOrigin(0.5);
    this.commsText.setDepth(35);
    this.commsText.setVisible(false);

    if (agent.color !== undefined) {
      this.sprite.setTint(parseHexColor(agent.color));
    }

    this.snapshot = {
      state: persisted.lastState,
      xp: persisted.xp,
      level: persisted.level,
      mood: persisted.mood,
      updatedAt: persisted.updatedAt,
      requestingInput: persisted.lastState === 'requesting_input'
    };

    this.playStateAnimation(this.snapshot.state);
    this.updateCommsBeacon(this.snapshot.updatedAt);
  }

  /**
   * Applies one normalized event to this crew unit.
   *
   * @param event Event payload.
   */
  applyEvent(event: AgentEvent): boolean {
    const next = applyActionToSnapshot(this.snapshot, event.kind, event.ts);
    let requestingInput = this.snapshot.requestingInput;

    if (event.kind === 'input_request') {
      requestingInput = true;
    } else if (event.kind !== 'idle') {
      requestingInput = false;
    }

    this.snapshot = {
      ...next,
      requestingInput
    };
    this.playStateAnimation(this.snapshot.state);
    this.updateCommsBeacon(event.ts);
    return true;
  }

  /**
   * Performs per-frame updates for fallback FSM transitions.
   *
   * @param now Current timestamp.
   */
  tick(now: number): boolean {
    this.updateSelectionRing(now);
    this.updateCommsBeacon(now);

    const duration = STATE_DURATIONS[this.snapshot.state];
    if (now - this.snapshot.updatedAt <= duration || this.snapshot.requestingInput) {
      return false;
    }

    const fallbackState: CrewState = this.snapshot.mood < -40 ? 'docked' : 'standby';
    this.snapshot = {
      ...this.snapshot,
      state: fallbackState,
      updatedAt: now
    };

    this.playStateAnimation(fallbackState);
    return true;
  }

  /**
   * Returns current persisted-state payload for extension storage.
   *
   * @returns Persisted state representation.
   */
  toPersistedState(): PersistedCrewState {
    return {
      xp: this.snapshot.xp,
      level: this.snapshot.level,
      mood: this.snapshot.mood,
      lastState: this.snapshot.requestingInput ? 'requesting_input' : this.snapshot.state,
      updatedAt: this.snapshot.updatedAt
    };
  }

  /**
   * Returns current world position.
   *
   * @returns Position tuple.
   */
  getPosition(): { x: number; y: number } {
    return {
      x: this.sprite.x,
      y: this.sprite.y
    };
  }

  /**
   * Updates crew unit world position.
   *
   * @param x Next x coordinate.
   * @param y Next y coordinate.
   */
  setPosition(x: number, y: number): void {
    this.sprite.setPosition(x, y);
    this.selectionRing.setPosition(x, y + 14);
    this.commsHalo.setPosition(x + 17, y - 25);
    this.commsCore.setPosition(x + 17, y - 25);
    this.commsText.setPosition(x + 17, y - 25);
  }

  /**
   * Returns represented agent config.
   *
   * @returns Agent config.
   */
  getAgent(): AgentConfig {
    return this.agent;
  }

  /**
   * Returns current crew state label.
   *
   * @returns FSM state.
   */
  getState(): CrewState {
    return this.snapshot.state;
  }

  /**
   * Returns current progress metrics.
   *
   * @returns Crew snapshot clone.
   */
  getSnapshot(): CrewSnapshot {
    return { ...this.snapshot };
  }

  /**
   * Sets whether this crew unit is selected by the user.
   *
   * @param selected True when selected.
   */
  setSelected(selected: boolean): void {
    this.selected = selected;
    this.selectionRing.setVisible(selected);
    if (!selected) {
      this.selectionRing.setScale(1);
      this.selectionRing.setAlpha(0.9);
    }
  }

  /**
   * Applies manual movement override for animation playback.
   *
   * @param active True while keyboard movement is active.
   */
  setManualMovement(active: boolean): void {
    if (this.manualMovement === active) {
      return;
    }

    this.manualMovement = active;
    this.playStateAnimation(this.snapshot.state);
  }

  /**
   * Registers a callback fired when pointer hovers this crew unit.
   *
   * @param handler Hover callback.
   */
  onPointerOver(handler: () => void): void {
    this.sprite.on(Phaser.Input.Events.POINTER_OVER, handler);
  }

  /**
   * Registers a callback fired when pointer leaves this crew unit.
   *
   * @param handler Hover-end callback.
   */
  onPointerOut(handler: () => void): void {
    this.sprite.on(Phaser.Input.Events.POINTER_OUT, handler);
  }

  /**
   * Registers a callback fired when this crew unit is clicked.
   *
   * @param handler Click callback.
   */
  onPointerDown(handler: () => void): void {
    this.sprite.on(Phaser.Input.Events.POINTER_DOWN, handler);
  }

  /**
   * Releases sprite resources.
   */
  destroy(): void {
    this.selectionRing.destroy();
    this.commsHalo.destroy();
    this.commsCore.destroy();
    this.commsText.destroy();
    this.sprite.destroy();
  }

  private playStateAnimation(state: CrewState): void {
    if (this.manualMovement) {
      this.sprite.play(`${this.agent.crewRole}-walk`, true);
      return;
    }

    const animationState = this.snapshot.requestingInput ? 'requesting_input' : state;
    const animationKey = `${this.agent.crewRole}-${animationState}`;
    const hasAnimation = this.scene.anims.exists(animationKey);

    if (hasAnimation) {
      this.sprite.play(animationKey, true);
      return;
    }

    if (animationState === 'docked' || animationState === 'standby') {
      this.sprite.setTexture(`crew-${this.agent.crewRole}-idle`);
      this.sprite.stop();
      return;
    }

    this.sprite.play(`${this.agent.crewRole}-walk`, true);
  }

  private updateSelectionRing(now: number): void {
    if (!this.selected) {
      return;
    }

    const pulse = 1 + Math.sin(now * 0.01) * 0.08;
    this.selectionRing.setScale(1.4 * pulse, 0.58 * pulse);
    this.selectionRing.setAlpha(0.84 + Math.sin(now * 0.014) * 0.12);
  }

  private updateCommsBeacon(now: number): void {
    const visible = this.snapshot.requestingInput;
    this.commsHalo.setVisible(visible);
    this.commsCore.setVisible(visible);
    this.commsText.setVisible(visible);
    if (!visible) {
      return;
    }

    const pulse = 1 + Math.sin(now * 0.02) * 0.2;
    this.commsHalo.setScale(pulse);
    this.commsHalo.setAlpha(0.28 + Math.sin(now * 0.015) * 0.12);
    this.commsCore.setScale(1 + Math.sin(now * 0.03) * 0.08);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseHexColor(value: string): number {
  const normalized = value.startsWith('#') ? value.slice(1) : value;
  const parsed = Number.parseInt(normalized, 16);
  if (Number.isNaN(parsed)) {
    return 0xffffff;
  }

  return parsed;
}
