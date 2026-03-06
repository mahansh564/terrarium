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
  CreatureState,
  PersistedCreatureState
} from '@shared/types';

/**
 * Internal runtime snapshot for creature logic.
 */
export interface CreatureSnapshot {
  /** Current finite-state-machine state. */
  state: CreatureState;
  /** Accumulated XP. */
  xp: number;
  /** Current level. */
  level: number;
  /** Mood score. */
  mood: number;
  /** Last update timestamp in milliseconds. */
  updatedAt: number;
}

/**
 * Maps an action to the target creature state.
 *
 * @param action Normalized agent action.
 * @returns Creature state mapped from action semantics.
 */
export function deriveStateFromAction(action: AgentAction): CreatureState {
  switch (action) {
    case 'read':
      return 'foraging';
    case 'write':
      return 'working';
    case 'test_run':
    case 'terminal':
      return 'alert';
    case 'idle':
      return 'resting';
    case 'error':
    case 'test_fail':
      return 'distressed';
    case 'test_pass':
    case 'complete':
    case 'deploy':
      return 'celebrating';
    default:
      return 'idle';
  }
}

/**
 * Applies one action to creature progress metrics.
 *
 * @param snapshot Existing creature snapshot.
 * @param action Incoming action.
 * @param now Current timestamp in milliseconds.
 * @returns Updated creature snapshot.
 */
export function applyActionToSnapshot(
  snapshot: CreatureSnapshot,
  action: AgentAction,
  now: number
): CreatureSnapshot {
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
 * Computes creature level from XP value.
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
 * Creature entity with sprite and finite-state-machine behavior.
 */
export class Creature {
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly selectionRing: Phaser.GameObjects.Arc;
  private snapshot: CreatureSnapshot;
  private selected = false;
  private manualMovement = false;

  /**
   * Creates a creature entity.
   *
   * @param scene Phaser scene hosting this creature.
   * @param agent Agent config represented by this creature.
   * @param x Spawn x coordinate.
   * @param y Spawn y coordinate.
   * @param textureKey Creature base texture key.
   * @param persisted Persisted state loaded from workspace.
   */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly agent: AgentConfig,
    x: number,
    y: number,
    textureKey: string,
    persisted: PersistedCreatureState
  ) {
    this.sprite = scene.add.sprite(x, y, `${textureKey}-idle`);
    this.sprite.setOrigin(0.5, 0.5);
    this.sprite.setScale(2);
    this.sprite.setDepth(20);
    this.sprite.setInteractive({ useHandCursor: true });

    this.selectionRing = scene.add.circle(x, y + 14, 14, 0x51f6ff, 0.14);
    this.selectionRing.setStrokeStyle(2, 0xc8ff7a, 0.9);
    this.selectionRing.setScale(1.4, 0.58);
    this.selectionRing.setDepth(18);
    this.selectionRing.setVisible(false);

    if (agent.color !== undefined) {
      this.sprite.setTint(parseHexColor(agent.color));
    }

    this.snapshot = {
      state: persisted.lastState,
      xp: persisted.xp,
      level: persisted.level,
      mood: persisted.mood,
      updatedAt: persisted.updatedAt
    };

    this.playStateAnimation(this.snapshot.state);
  }

  /**
   * Applies one normalized event to this creature.
   *
   * @param event Event payload.
   */
  applyEvent(event: AgentEvent): boolean {
    const next = applyActionToSnapshot(this.snapshot, event.kind, event.ts);
    this.snapshot = next;
    this.playStateAnimation(next.state);
    return true;
  }

  /**
   * Performs per-frame updates for fallback FSM transitions.
   *
   * @param now Current timestamp.
   */
  tick(now: number): boolean {
    this.updateSelectionRing(now);

    const duration = STATE_DURATIONS[this.snapshot.state];
    if (now - this.snapshot.updatedAt <= duration) {
      return false;
    }

    const fallbackState: CreatureState = this.snapshot.mood < -40 ? 'resting' : 'idle';
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
  toPersistedState(): PersistedCreatureState {
    return {
      xp: this.snapshot.xp,
      level: this.snapshot.level,
      mood: this.snapshot.mood,
      lastState: this.snapshot.state,
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
   * Updates creature world position.
   *
   * @param x Next x coordinate.
   * @param y Next y coordinate.
   */
  setPosition(x: number, y: number): void {
    this.sprite.setPosition(x, y);
    this.selectionRing.setPosition(x, y + 14);
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
   * Returns current creature state label.
   *
   * @returns FSM state.
   */
  getState(): CreatureState {
    return this.snapshot.state;
  }

  /**
   * Returns current progress metrics.
   *
   * @returns Creature snapshot clone.
   */
  getSnapshot(): CreatureSnapshot {
    return { ...this.snapshot };
  }

  /**
   * Sets whether this creature is selected by the user.
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
   * Registers a callback fired when pointer hovers this creature.
   *
   * @param handler Hover callback.
   */
  onPointerOver(handler: () => void): void {
    this.sprite.on(Phaser.Input.Events.POINTER_OVER, handler);
  }

  /**
   * Registers a callback fired when pointer leaves this creature.
   *
   * @param handler Hover-end callback.
   */
  onPointerOut(handler: () => void): void {
    this.sprite.on(Phaser.Input.Events.POINTER_OUT, handler);
  }

  /**
   * Registers a callback fired when this creature is clicked.
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
    this.sprite.destroy();
  }

  private playStateAnimation(state: CreatureState): void {
    if (this.manualMovement) {
      this.sprite.play(`${this.agent.creatureType}-walk`, true);
      return;
    }

    const animationKey = `${this.agent.creatureType}-${state}`;
    const hasAnimation = this.scene.anims.exists(animationKey);

    if (hasAnimation) {
      this.sprite.play(animationKey, true);
      return;
    }

    if (state === 'resting' || state === 'idle') {
      this.sprite.setTexture(`creature-${this.agent.creatureType}-idle`);
      this.sprite.stop();
      return;
    }

    this.sprite.play(`${this.agent.creatureType}-walk`, true);
  }

  private updateSelectionRing(now: number): void {
    if (!this.selected) {
      return;
    }

    const pulse = 1 + Math.sin(now * 0.01) * 0.08;
    this.selectionRing.setScale(1.4 * pulse, 0.58 * pulse);
    this.selectionRing.setAlpha(0.84 + Math.sin(now * 0.014) * 0.12);
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
