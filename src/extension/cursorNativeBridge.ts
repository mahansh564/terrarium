/**
 * Default Cursor command ids that represent creating a new agent/chat session.
 */
export const DEFAULT_CURSOR_NATIVE_ADD_AGENT_COMMAND_IDS = Object.freeze([
  'glass.newAgent',
  'composer.newAgentChat',
  'composer.createNew',
  'composer.createNewComposerTab'
]);

/**
 * Default cooldown between bridged native Cursor add-agent triggers.
 */
export const DEFAULT_CURSOR_NATIVE_ADD_AGENT_COOLDOWN_MS = 1200;
const MIN_CURSOR_NATIVE_ADD_AGENT_COOLDOWN_MS = 250;
/**
 * Default polling interval for Cursor workspace-storage deep sync.
 */
export const DEFAULT_CURSOR_STORAGE_FALLBACK_POLL_MS = 1000;
const MIN_CURSOR_STORAGE_FALLBACK_POLL_MS = 500;

/**
 * Runtime settings for bridging Cursor's native add-agent actions to CodeOrbit.
 */
export interface CursorNativeAddAgentBridgeConfig {
  /** Enables or disables the command bridge. */
  enabled: boolean;
  /** Cursor command ids that should trigger CodeOrbit's add-agent flow. */
  commandIds: readonly string[];
  /** Debounce window to avoid duplicate prompts from one native action. */
  cooldownMs: number;
  /** Enables deep sync via Cursor workspace storage composer state. */
  storageFallbackEnabled: boolean;
  /** Polling interval for deep sync. */
  storageFallbackPollMs: number;
}

/**
 * Checks whether the current host application appears to be Cursor.
 *
 * @param appName Value from `vscode.env.appName`.
 * @returns True when app name indicates a Cursor build.
 */
export function isCursorHost(appName: string): boolean {
  return appName.toLowerCase().includes('cursor');
}

/**
 * Checks whether a command id should be treated as a native Cursor add-agent trigger.
 *
 * @param commandId Command id that was executed.
 * @param commandIds Configured bridge command ids.
 * @returns True when the command id matches one of the configured trigger ids.
 */
export function isCursorNativeAddAgentCommand(
  commandId: string,
  commandIds: readonly string[]
): boolean {
  const normalizedCommandId = commandId.trim();
  if (normalizedCommandId.length === 0) {
    return false;
  }

  return commandIds.includes(normalizedCommandId);
}

/**
 * Lightweight cooldown gate used to suppress duplicate command-trigger handling.
 */
export class CommandCooldownGate {
  private readonly cooldownMs: number;
  private lastAcceptedAt = Number.NEGATIVE_INFINITY;

  /**
   * Creates a new gate.
   *
   * @param cooldownMs Minimum milliseconds between accepted calls.
   */
  constructor(cooldownMs: number) {
    this.cooldownMs = normalizeCursorCooldownMs(cooldownMs);
  }

  /**
   * Attempts to accept a call at the given time.
   *
   * @param now Epoch milliseconds for the current attempt.
   * @returns True when the call is accepted; false when blocked by cooldown.
   */
  shouldAccept(now = Date.now()): boolean {
    if (now - this.lastAcceptedAt < this.cooldownMs) {
      return false;
    }

    this.lastAcceptedAt = now;
    return true;
  }
}

/**
 * Normalizes a raw command id list from user settings.
 *
 * @param value Raw setting value.
 * @param fallback Defaults used when value is empty/invalid.
 * @returns Deduplicated list of non-empty command ids.
 */
export function normalizeCursorCommandIds(
  value: unknown,
  fallback: readonly string[]
): readonly string[] {
  const entries = Array.isArray(value) ? value : fallback;
  const normalized = entries.flatMap((entry): string[] => {
    if (typeof entry !== 'string') {
      return [];
    }

    const trimmed = entry.trim();
    return trimmed.length > 0 ? [trimmed] : [];
  });

  const deduped = Array.from(new Set(normalized));
  return deduped.length > 0 ? deduped : [...fallback];
}

/**
 * Normalizes a cooldown value and applies sane minimum/default bounds.
 *
 * @param value Raw cooldown value.
 * @returns Valid cooldown milliseconds.
 */
export function normalizeCursorCooldownMs(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    return DEFAULT_CURSOR_NATIVE_ADD_AGENT_COOLDOWN_MS;
  }

  return Math.max(MIN_CURSOR_NATIVE_ADD_AGENT_COOLDOWN_MS, Math.round(value));
}

/**
 * Normalizes deep sync poll interval and applies minimum/default bounds.
 *
 * @param value Raw polling interval.
 * @returns Valid polling interval milliseconds.
 */
export function normalizeCursorStorageFallbackPollMs(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    return DEFAULT_CURSOR_STORAGE_FALLBACK_POLL_MS;
  }

  return Math.max(MIN_CURSOR_STORAGE_FALLBACK_POLL_MS, Math.round(value));
}
