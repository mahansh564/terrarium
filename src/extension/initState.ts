import { DEFAULT_PERSISTED_CREW_STATE } from '@shared/constants';
import type { AgentConfig, PendingInputRequest, PersistedStatsFile } from '@shared/types';

/**
 * Input payload for init persisted-state overlay.
 */
export interface InitPersistedStateOverlayOptions {
  /** Persisted state loaded from workspace storage. */
  persisted: PersistedStatsFile;
  /** Current runtime-config agents visible in station rendering. */
  configuredAgents: readonly AgentConfig[];
  /** Unresolved input requests from Action Center tracker. */
  pendingRequests: readonly PendingInputRequest[];
  /** Epoch milliseconds used for updatedAt overrides. Defaults to Date.now(). */
  now?: number;
}

/**
 * Overlays unresolved input requests onto persisted crew states for init payloads.
 *
 * This does not mutate the original persisted object.
 *
 * @param options Overlay options.
 * @returns Persisted payload with requesting-input state forced for visible pending agents.
 */
export function overlayPendingInputRequestsOnPersistedState(
  options: InitPersistedStateOverlayOptions
): PersistedStatsFile {
  if (options.pendingRequests.length === 0 || options.configuredAgents.length === 0) {
    return options.persisted;
  }

  const visibleAgentIds = new Set(options.configuredAgents.map((agent) => agent.id));
  if (visibleAgentIds.size === 0) {
    return options.persisted;
  }

  const now = options.now ?? Date.now();
  const nextCrew = { ...options.persisted.crew };
  let changed = false;

  for (const request of options.pendingRequests) {
    if (!visibleAgentIds.has(request.agentId)) {
      continue;
    }

    const existing = nextCrew[request.agentId] ?? {
      ...DEFAULT_PERSISTED_CREW_STATE
    };
    const nextUpdatedAt = Math.max(now, request.updatedAt);
    const needsUpdate =
      existing.lastState !== 'requesting_input' || existing.updatedAt !== nextUpdatedAt;
    if (!needsUpdate) {
      continue;
    }

    nextCrew[request.agentId] = {
      ...existing,
      lastState: 'requesting_input',
      updatedAt: nextUpdatedAt
    };
    changed = true;
  }

  if (!changed) {
    return options.persisted;
  }

  return {
    ...options.persisted,
    crew: nextCrew
  };
}
