import type { AgentConfig } from '@shared/types';
import type { CursorComposerRecord } from './cursorComposerStorageSync';

const CURSOR_RUNTIME_AGENT_COLOR = '#58A6FF';
const CURSOR_RUNTIME_AGENT_ID_PREFIX = 'cursor-';

/**
 * Visible agent identity used when routing runtime composer signals.
 */
export interface CursorRuntimeVisibleAgentIdentity {
  /** Agent id that should receive synthetic runtime events. */
  agentId: string;
  /** Display name shown alongside synthetic runtime events. */
  agentName: string;
}

/**
 * Resolves a display name for a Cursor composer-backed runtime agent.
 *
 * @param composer Cursor composer metadata.
 * @returns Cursor-provided name, or a deterministic fallback.
 */
export function resolveCursorComposerDisplayName(
  composer: Pick<CursorComposerRecord, 'composerId' | 'name'>
): string {
  const trimmed = composer.name?.trim() ?? '';
  if (trimmed.length > 0) {
    return trimmed;
  }

  return `Cursor Agent (${composer.composerId.slice(0, 8)})`;
}

/**
 * Builds runtime agent id for one Cursor composer.
 *
 * @param composerId Cursor composer identifier.
 * @returns Runtime CodeOrbit agent id.
 */
export function toCursorRuntimeAgentId(composerId: string): string {
  return `${CURSOR_RUNTIME_AGENT_ID_PREFIX}${composerId}`;
}

/**
 * Builds transcript path for one Cursor composer.
 *
 * @param transcriptRootPath Cursor transcript root (`.../agent-transcripts`).
 * @param composerId Cursor composer identifier.
 * @returns Composer transcript path.
 */
export function toCursorComposerTranscriptPath(
  transcriptRootPath: string,
  composerId: string
): string {
  return `${transcriptRootPath}/${composerId}/${composerId}.jsonl`;
}

/**
 * Resolves the visible CodeOrbit agent identity for a Cursor composer.
 *
 * When a configured agent already points at the same transcript file, that
 * configured id/name is used so runtime synthetic events target the rendered
 * crew unit instead of a hidden runtime duplicate.
 *
 * @param agents Existing configured/persisted agents.
 * @param transcriptRootPath Cursor transcript root (`.../agent-transcripts`).
 * @param composer Cursor composer metadata.
 * @returns Visible agent identity for synthetic runtime events.
 */
export function resolveVisibleCursorAgentIdentity(
  agents: readonly AgentConfig[],
  transcriptRootPath: string,
  composer: Pick<CursorComposerRecord, 'composerId' | 'name'>
): CursorRuntimeVisibleAgentIdentity {
  const composerTranscriptPath = normalizePathForCompare(
    toCursorComposerTranscriptPath(transcriptRootPath, composer.composerId)
  );
  for (const agent of agents) {
    if (normalizePathForCompare(agent.transcriptPath) !== composerTranscriptPath) {
      continue;
    }

    return {
      agentId: agent.id,
      agentName: agent.name
    };
  }

  return {
    agentId: toCursorRuntimeAgentId(composer.composerId),
    agentName: resolveCursorComposerDisplayName(composer)
  };
}

/**
 * Merges runtime Cursor agents into configured agents while hiding transcript-path duplicates.
 *
 * @param agents Existing configured/persisted agents.
 * @param transcriptRootPath Cursor transcript root (`.../agent-transcripts`).
 * @param runtimeComposers Active Cursor composers to mirror as runtime agents.
 * @returns Combined list of configured and runtime Cursor agents.
 */
export function mergeRuntimeCursorAgents(
  agents: AgentConfig[],
  transcriptRootPath: string,
  runtimeComposers: readonly CursorComposerRecord[]
): AgentConfig[] {
  const runtimeAgents: AgentConfig[] = [];
  const knownIds = new Set(agents.map((agent) => agent.id));
  const knownTranscriptPaths = new Set(
    agents.map((agent) => normalizePathForCompare(agent.transcriptPath))
  );

  for (const composer of runtimeComposers) {
    const runtimeAgentId = toCursorRuntimeAgentId(composer.composerId);
    if (knownIds.has(runtimeAgentId)) {
      continue;
    }

    const transcriptPath = normalizePathForCompare(
      toCursorComposerTranscriptPath(transcriptRootPath, composer.composerId)
    );
    if (knownTranscriptPaths.has(transcriptPath)) {
      continue;
    }

    runtimeAgents.push({
      id: runtimeAgentId,
      name: resolveCursorComposerDisplayName(composer),
      sourceAdapter: 'jsonl',
      transcriptPath,
      crewRole: 'analyst',
      color: CURSOR_RUNTIME_AGENT_COLOR
    });

    knownIds.add(runtimeAgentId);
    knownTranscriptPaths.add(transcriptPath);
  }

  return runtimeAgents.length > 0 ? [...agents, ...runtimeAgents] : agents;
}

function normalizePathForCompare(pathValue: string): string {
  return process.platform === 'win32' ? pathValue.toLowerCase() : pathValue;
}
