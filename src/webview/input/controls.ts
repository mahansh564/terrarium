/**
 * Boolean directional input payload used by keyboard controls.
 */
export interface DirectionalInputState {
  /** Whether left movement is currently pressed. */
  left: boolean;
  /** Whether right movement is currently pressed. */
  right: boolean;
  /** Whether upward movement is currently pressed. */
  up: boolean;
  /** Whether downward movement is currently pressed. */
  down: boolean;
}

/**
 * 2D vector used for normalized movement and positions.
 */
export interface Vector2D {
  /** Horizontal component. */
  x: number;
  /** Vertical component. */
  y: number;
}

/**
 * Axis-aligned movement bounds for a creature.
 */
export interface MovementBounds {
  /** Minimum x coordinate. */
  minX: number;
  /** Maximum x coordinate. */
  maxX: number;
  /** Minimum y coordinate. */
  minY: number;
  /** Maximum y coordinate. */
  maxY: number;
}

/**
 * Builds a normalized movement vector from directional booleans.
 *
 * @param input Current directional keyboard state.
 * @returns Normalized movement vector, or zero-vector when idle.
 */
export function resolveMovementVector(input: DirectionalInputState): Vector2D {
  const horizontal = Number(input.right) - Number(input.left);
  const vertical = Number(input.down) - Number(input.up);
  if (horizontal === 0 && vertical === 0) {
    return { x: 0, y: 0 };
  }

  const magnitude = Math.hypot(horizontal, vertical);
  return {
    x: horizontal / magnitude,
    y: vertical / magnitude
  };
}

/**
 * Computes the next selected agent id while cycling through active ids.
 *
 * @param agentIds Ordered list of active agent ids.
 * @param currentSelectedAgentId Currently selected agent id.
 * @param direction Selection direction.
 * @returns Next selected id, or null when no creatures exist.
 */
export function advanceSelection(
  agentIds: readonly string[],
  currentSelectedAgentId: string | null,
  direction: 1 | -1
): string | null {
  const count = agentIds.length;
  if (count === 0) {
    return null;
  }

  const currentIndex =
    currentSelectedAgentId === null ? -1 : agentIds.indexOf(currentSelectedAgentId);
  const fallbackIndex = direction > 0 ? 0 : count - 1;
  const nextIndex =
    currentIndex === -1
      ? fallbackIndex
      : (currentIndex + direction + count) % count;

  return agentIds[nextIndex] ?? null;
}

/**
 * Selects an agent id by numeric keyboard index.
 *
 * @param agentIds Ordered list of active agent ids.
 * @param zeroBasedIndex Zero-based selection index.
 * @returns Selected agent id, or null if index is out of range.
 */
export function selectAgentByIndex(agentIds: readonly string[], zeroBasedIndex: number): string | null {
  return agentIds[zeroBasedIndex] ?? null;
}

/**
 * Clamps a creature position to movement bounds.
 *
 * @param position Candidate position.
 * @param bounds Allowed movement bounds.
 * @returns Clamped position.
 */
export function clampPosition(position: Vector2D, bounds: MovementBounds): Vector2D {
  return {
    x: clamp(position.x, bounds.minX, bounds.maxX),
    y: clamp(position.y, bounds.minY, bounds.maxY)
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
