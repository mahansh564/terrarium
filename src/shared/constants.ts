import type {
  AgentAction,
  CrewState,
  PersistedCrewState,
  StationConfig
} from './types';

/**
 * Default render dimensions of the station webview canvas.
 */
export const STATION_DIMENSIONS = {
  width: 960,
  height: 540,
  tileSize: 16
} as const;

/**
 * Minimum frame rate that can be configured.
 */
export const MIN_FPS = 1 as const;

/**
 * Maximum frame rate used by webview rendering.
 */
export const MAX_FPS = 30 as const;

/**
 * State duration hints in milliseconds.
 */
export const STATE_DURATIONS: Readonly<Record<CrewState, number>> = {
  standby: 5000,
  scanning: 3000,
  repairing: 3500,
  docked: 6000,
  alert: 2500,
  celebrating: 3000,
  damaged: 3500,
  requesting_input: 7000
};

/**
 * XP gains per normalized action type.
 */
export const XP_PER_ACTION: Readonly<Record<AgentAction, number>> = {
  read: 2,
  write: 8,
  test_run: 3,
  test_pass: 12,
  test_fail: 4,
  terminal: 4,
  idle: 0,
  error: 1,
  complete: 25,
  deploy: 20,
  input_request: 1
};

/**
 * Mood changes per normalized action type.
 */
export const MOOD_DELTA_PER_ACTION: Readonly<Record<AgentAction, number>> = {
  read: 1,
  write: 2,
  test_run: 0,
  test_pass: 6,
  test_fail: -8,
  terminal: 0,
  idle: -1,
  error: -12,
  complete: 10,
  deploy: 8,
  input_request: -2
};

/**
 * XP thresholds required for level-up progression.
 */
export const LEVEL_THRESHOLDS = [0, 50, 120, 220, 360, 540, 760, 1020] as const;

/**
 * Baseline persisted state for newly discovered crew units.
 */
export const DEFAULT_PERSISTED_CREW_STATE: PersistedCrewState = {
  xp: 0,
  level: 1,
  mood: 0,
  lastState: 'standby',
  updatedAt: 0
};

/**
 * Default runtime config when settings are incomplete.
 */
export const DEFAULT_STATION_CONFIG: StationConfig = {
  maxFps: MAX_FPS,
  agents: [],
  stationEffectsEnabled: true
};

/**
 * Clamps a runtime FPS value to supported station boundaries.
 *
 * @param value Candidate frame rate.
 * @returns Sanitized frame rate.
 */
export function clampMaxFps(value: number): number {
  if (!Number.isFinite(value)) {
    return MAX_FPS;
  }

  return Math.max(MIN_FPS, Math.min(MAX_FPS, Math.round(value)));
}

/**
 * Boundaries for clamping mood values.
 */
export const MOOD_BOUNDS = {
  min: -100,
  max: 100
} as const;

/**
 * Persisted state schema version.
 */
export const PERSISTED_SCHEMA_VERSION = 2 as const;

/**
 * Debounce duration for writing state snapshots to disk.
 */
export const PERSIST_DEBOUNCE_MS = 350;
