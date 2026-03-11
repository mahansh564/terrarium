import type { CrewState } from '@shared/types';

/**
 * Running recency window used to decide whether crew should keep autonomously moving.
 */
export const CREW_RUNNING_ACTIVITY_RECENCY_MS = 15_000;

const RUNNING_STATES: readonly CrewState[] = [
  'scanning',
  'repairing',
  'alert',
  'celebrating',
  'damaged'
] as const;

/**
 * Minimal snapshot required to decide crew movement behavior.
 */
export interface CrewMotionSnapshot {
  /** Current finite-state-machine state. */
  state: CrewState;
  /** Last state update timestamp in epoch milliseconds. */
  updatedAt: number;
}

/**
 * Returns whether a crew snapshot should keep autonomous movement active.
 *
 * @param snapshot Current crew snapshot.
 * @param now Current epoch timestamp.
 * @param runningRecencyMs Running recency window.
 * @returns True when the crew appears active and recent.
 */
export function shouldAutoMoveCrew(
  snapshot: CrewMotionSnapshot,
  now: number,
  runningRecencyMs = CREW_RUNNING_ACTIVITY_RECENCY_MS
): boolean {
  if (!RUNNING_STATES.includes(snapshot.state)) {
    return false;
  }

  return now - snapshot.updatedAt <= runningRecencyMs;
}

/**
 * Resolves the movement mode for a crew member for the current frame.
 *
 * @param options Motion decision options.
 * @returns Resolved movement mode.
 */
export function resolveCrewMotionMode(options: {
  /** Whether this crew unit is currently selected. */
  isSelected: boolean;
  /** Whether selected-agent keyboard movement is currently active. */
  manualInputActive: boolean;
  /** Current crew activity snapshot. */
  snapshot: CrewMotionSnapshot;
  /** Current epoch timestamp. */
  now: number;
  /** Running recency window override. */
  runningRecencyMs?: number;
}): 'manual' | 'autonomous' | 'idle' {
  if (options.isSelected && options.manualInputActive) {
    return 'manual';
  }

  if (shouldAutoMoveCrew(options.snapshot, options.now, options.runningRecencyMs)) {
    return 'autonomous';
  }

  return 'idle';
}
