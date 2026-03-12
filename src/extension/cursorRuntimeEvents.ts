import type { AgentEvent } from '@shared/types';
import type { CursorComposerRecord } from './cursorComposerStorageSync';
import { resolveCursorComposerDisplayName } from './cursorRuntimeAgents';

/**
 * Recency window used to infer active running activity from Cursor composer metadata.
 */
export const CURSOR_RUNTIME_RUNNING_RECENCY_MS = 15_000;

/**
 * Input payload used to synthesize runtime Cursor fallback events.
 */
export interface CursorRuntimeEventSynthesisOptions {
  /** Previous active Cursor composer snapshot. */
  previousComposers: readonly CursorComposerRecord[];
  /** Current active Cursor composer snapshot after latest sync pass. */
  currentComposers?: readonly CursorComposerRecord[];
  /** Newly added Cursor composers from the latest sync pass. */
  addedComposers: readonly CursorComposerRecord[];
  /** Updated Cursor composers from the latest sync pass. */
  updatedComposers: readonly CursorComposerRecord[];
  /** Optional resolver that maps composer identity to visible agent identity. */
  resolveAgentIdentity?: (
    composer: CursorComposerRecord
  ) => {
    agentId: string;
    agentName?: string;
  };
  /** Current epoch milliseconds. Defaults to Date.now(). */
  now?: number;
  /** Running recency window override in milliseconds. */
  runningRecencyMs?: number;
}

/**
 * Synthesizes activity events for Cursor runtime agents when transcript updates are absent or delayed.
 *
 * @param options Synthesis options.
 * @returns Ordered list of synthetic runtime events.
 */
export function synthesizeCursorRuntimeComposerEvents(
  options: CursorRuntimeEventSynthesisOptions
): AgentEvent[] {
  const now = options.now ?? Date.now();
  const runningRecencyMs = options.runningRecencyMs ?? CURSOR_RUNTIME_RUNNING_RECENCY_MS;
  const previousById = new Map(
    options.previousComposers.map((composer) => [composer.composerId, composer])
  );
  const changedComposerIds = new Set<string>();
  const inspectedComposers: CursorComposerRecord[] = [];
  for (const composer of [...options.addedComposers, ...options.updatedComposers]) {
    if (changedComposerIds.has(composer.composerId)) {
      continue;
    }

    changedComposerIds.add(composer.composerId);
    inspectedComposers.push(composer);
  }
  for (const composer of options.currentComposers ?? []) {
    if (changedComposerIds.has(composer.composerId)) {
      continue;
    }

    if (!isComposerRecentlyActive(composer, now, runningRecencyMs)) {
      continue;
    }

    inspectedComposers.push(composer);
  }
  const events: AgentEvent[] = [];

  for (const composer of inspectedComposers) {
    const previous = previousById.get(composer.composerId);
    const identity = options.resolveAgentIdentity?.(composer);
    const fallbackName = resolveCursorComposerDisplayName(composer);
    const agentId = identity?.agentId ?? toRuntimeAgentId(composer.composerId);
    const agentName = identity?.agentName ?? fallbackName;
    const ts = toComposerTimestamp(composer, now);
    const previousBlocking = previous?.hasBlockingPendingActions === true;
    const nextBlocking = composer.hasBlockingPendingActions === true;
    const recentlyActive = isComposerRecentlyActive(composer, now, runningRecencyMs);
    const metadata = createCursorRuntimeMetadata(composer);

    if (recentlyActive) {
      events.push({
        kind: 'terminal',
        ts,
        agentId,
        ...(agentName.length > 0 ? { agentName } : {}),
        command: 'cursor-runtime-running-pulse',
        metadata
      });
    }

    if (nextBlocking && !previousBlocking) {
      events.push({
        kind: 'input_request',
        ts,
        agentId,
        ...(agentName.length > 0 ? { agentName } : {}),
        prompt: 'Cursor agent requires user input.',
        metadata
      });
      continue;
    }

    if (previousBlocking && !nextBlocking) {
      events.push({
        kind: 'idle',
        ts,
        agentId,
        ...(agentName.length > 0 ? { agentName } : {}),
        reason: 'Cursor blocking input request resolved.',
        metadata
      });
    }
  }

  return events;
}

/**
 * Checks whether a composer appears to be actively running based on Cursor timestamps.
 *
 * @param composer Cursor composer metadata.
 * @param now Current epoch milliseconds.
 * @param runningRecencyMs Running recency window.
 * @returns True when composer activity falls within the recency window.
 */
export function isComposerRecentlyActive(
  composer: CursorComposerRecord,
  now: number,
  runningRecencyMs: number
): boolean {
  const candidateTs = composer.lastUpdatedAt ?? composer.createdAt;
  if (candidateTs === undefined) {
    return false;
  }

  if (candidateTs > now) {
    return true;
  }

  return now - candidateTs <= runningRecencyMs;
}

function toRuntimeAgentId(composerId: string): string {
  return `cursor-${composerId}`;
}

function toComposerTimestamp(composer: CursorComposerRecord, now: number): number {
  const candidateTs = composer.lastUpdatedAt ?? composer.createdAt;
  return candidateTs !== undefined ? candidateTs : now;
}

function createCursorRuntimeMetadata(composer: CursorComposerRecord): Record<string, string> {
  const composerName = composer.name?.trim() ?? '';
  return {
    source: 'cursor_composer_storage',
    composerId: composer.composerId,
    ...(composerName.length > 0 ? { composerName } : {})
  };
}
