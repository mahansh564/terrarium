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
 * Last known live activity details for a crew unit.
 */
export interface CrewActivitySnapshot {
  /** Last normalized action that updated activity, or null before first event. */
  action: AgentAction | null;
  /** Human-readable activity summary for hover/inspection UI. */
  description: string;
  /** Timestamp of latest activity update in epoch milliseconds. */
  updatedAt: number;
  /** Optional source tag from event metadata. */
  source?: string;
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
 * Applies an explicit XP reward to an existing snapshot.
 *
 * @param snapshot Existing crew snapshot.
 * @param xpReward XP reward amount.
 * @param now Current timestamp.
 * @returns Updated snapshot with XP/level/mood deltas.
 */
export function applyRewardToSnapshot(
  snapshot: CrewSnapshot,
  xpReward: number,
  now: number
): CrewSnapshot {
  const reward = Math.max(0, Math.round(xpReward));
  const xp = snapshot.xp + reward;
  return {
    ...snapshot,
    xp,
    level: levelFromXp(xp),
    mood: clamp(snapshot.mood + Math.max(1, Math.ceil(reward / 3)), MOOD_BOUNDS.min, MOOD_BOUNDS.max),
    updatedAt: now
  };
}

/**
 * Derives whether the crew should keep showing an input-request beacon.
 *
 * @param previous Previous requesting-input value.
 * @param action Optional incoming action. Pass null when there is no new event.
 * @param metadataSource Optional event metadata source identifier.
 * @returns Next requesting-input value.
 */
export function deriveRequestingInputFlag(
  previous: boolean,
  action: AgentAction | null,
  metadataSource?: string
): boolean {
  if (action === null) {
    return previous;
  }

  if (action === 'input_request') {
    return true;
  }

  if (previous && action === 'terminal' && metadataSource === 'cursor_composer_storage') {
    return true;
  }

  return false;
}

/**
 * Formats one normalized event into a concise live-activity description.
 *
 * @param event Incoming normalized event.
 * @returns Human-readable activity text.
 */
export function describeAgentEventActivity(event: AgentEvent): string {
  switch (event.kind) {
    case 'read':
      return event.path !== undefined
        ? `Reading ${shortenMiddle(event.path, 52)}`
        : 'Reading workspace files';
    case 'write':
      return event.path !== undefined
        ? `Writing ${shortenMiddle(event.path, 52)}`
        : 'Writing code changes';
    case 'test_run':
      return event.suite !== undefined
        ? `Running tests (${shortenMiddle(event.suite, 34)})`
        : 'Running tests';
    case 'test_pass':
      return event.passed !== undefined ? `Tests passed (${event.passed})` : 'Tests passed';
    case 'test_fail':
      return event.failed !== undefined ? `Tests failed (${event.failed})` : 'Tests failed';
    case 'terminal': {
      if (event.command === 'cursor-runtime-running-pulse') {
        const runtimeName = asMetadataString(event, 'composerName');
        return runtimeName !== undefined
          ? `Cursor runtime active: ${shortenMiddle(runtimeName, 30)}`
          : 'Cursor runtime active';
      }

      return event.command !== undefined
        ? `Running command: ${shortenMiddle(normalizeInline(event.command), 48)}`
        : 'Running terminal command';
    }
    case 'idle':
      return event.reason !== undefined
        ? `Idle: ${shortenMiddle(normalizeInline(event.reason), 52)}`
        : 'Idle / waiting';
    case 'input_request':
      return event.prompt !== undefined
        ? `Needs input: ${shortenMiddle(normalizeInline(event.prompt), 52)}`
        : 'Awaiting user input';
    case 'error':
      return event.errorMessage !== undefined
        ? `Error: ${shortenMiddle(normalizeInline(event.errorMessage), 50)}`
        : 'Agent encountered an error';
    case 'complete':
      return event.taskId !== undefined
        ? `Completed task: ${shortenMiddle(event.taskId, 38)}`
        : 'Completed current task';
    case 'deploy':
      return event.environment !== undefined
        ? `Deploying to ${shortenMiddle(event.environment, 36)}`
        : 'Deploying changes';
    default:
      return 'Activity update received';
  }
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
 * Derives initial live-activity details from persisted crew state.
 *
 * @param persisted Persisted crew state loaded from workspace.
 * @returns Initial live-activity snapshot for tooltip and inspection UI.
 */
export function deriveInitialCrewActivity(persisted: PersistedCrewState): CrewActivitySnapshot {
  if (persisted.lastState === 'requesting_input') {
    return {
      action: 'input_request',
      description: 'Needs input: Pending request',
      updatedAt: persisted.updatedAt
    };
  }

  return {
    action: null,
    description: 'Awaiting live events.',
    updatedAt: persisted.updatedAt
  };
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
  private activity: CrewActivitySnapshot;
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
    this.sprite.setScale(1.35);
    this.sprite.setDepth(20);
    this.sprite.setInteractive({ useHandCursor: true });

    this.selectionRing = scene.add.circle(x, y + 14, 14, 0x7f8eff, 0.16);
    this.selectionRing.setStrokeStyle(2, 0xa4f6ff, 0.95);
    this.selectionRing.setScale(1.4, 0.58);
    this.selectionRing.setDepth(18);
    this.selectionRing.setVisible(false);

    this.commsHalo = scene.add.circle(x + 17, y - 25, 8, 0xff4c72, 0.36);
    this.commsHalo.setStrokeStyle(2, 0xffc5d2, 0.96);
    this.commsHalo.setDepth(33);
    this.commsHalo.setVisible(false);

    this.commsCore = scene.add.circle(x + 17, y - 25, 4.5, 0xffdce4, 1);
    this.commsCore.setDepth(34);
    this.commsCore.setVisible(false);

    this.commsText = scene.add.text(x + 17, y - 25, '?', {
      fontFamily: '"Trebuchet MS", "Lucida Sans Unicode", sans-serif',
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#6f0018'
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
    this.activity = deriveInitialCrewActivity(persisted);

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
    const metadataSource =
      typeof event.metadata?.source === 'string' ? event.metadata.source : undefined;

    this.snapshot = {
      ...next,
      requestingInput: deriveRequestingInputFlag(
        this.snapshot.requestingInput,
        event.kind,
        metadataSource
      )
    };
    this.activity = {
      action: event.kind,
      description: describeAgentEventActivity(event),
      updatedAt: event.ts,
      ...(metadataSource !== undefined ? { source: metadataSource } : {})
    };
    this.playStateAnimation(this.snapshot.state);
    this.updateCommsBeacon(event.ts);
    return true;
  }

  /**
   * Applies a mission reward XP bonus to this crew unit.
   *
   * @param xpReward XP reward amount.
   * @param now Current timestamp.
   * @returns True when state changed.
   */
  applyMissionReward(xpReward: number, now: number): boolean {
    if (xpReward <= 0) {
      return false;
    }

    this.snapshot = applyRewardToSnapshot(this.snapshot, xpReward, now);
    this.playStateAnimation(this.snapshot.state);
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
   * Returns latest live-activity summary for hover/details UI.
   *
   * @returns Activity snapshot clone.
   */
  getActivity(): CrewActivitySnapshot {
    return { ...this.activity };
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

    const pulse = 1 + Math.sin(now * 0.026) * 0.34;
    const blink = Math.sin(now * 0.04) > 0 ? 1 : 0.28;

    this.commsHalo.setScale(1.15 * pulse);
    this.commsHalo.setAlpha(0.5 + Math.sin(now * 0.02) * 0.24);
    this.commsCore.setScale(1.08 + Math.sin(now * 0.05) * 0.2);
    this.commsCore.setAlpha(0.55 + blink * 0.45);
    this.commsText.setScale(1 + Math.sin(now * 0.055) * 0.14);
    this.commsText.setAlpha(0.7 + blink * 0.3);
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

function shortenMiddle(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  const keep = Math.max(6, Math.floor((maxLength - 3) / 2));
  const left = value.slice(0, keep);
  const right = value.slice(value.length - keep);
  return `${left}...${right}`;
}

function normalizeInline(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function asMetadataString(event: AgentEvent, key: string): string | undefined {
  const value = event.metadata?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
