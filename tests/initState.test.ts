import { describe, expect, it } from 'vitest';
import { overlayPendingInputRequestsOnPersistedState } from '../src/extension/initState';
import type { AgentConfig, PersistedStatsFile } from '../src/shared/types';

describe('init state overlay', () => {
  it('forces requesting_input for visible pending requests while preserving xp, level, and mood', () => {
    const persisted: PersistedStatsFile = {
      version: 2,
      crew: {
        codex: {
          xp: 120,
          level: 3,
          mood: 8,
          lastState: 'repairing',
          updatedAt: 1_000
        }
      }
    };
    const configuredAgents: AgentConfig[] = [
      {
        id: 'codex',
        name: 'Codex',
        transcriptPath: '/tmp/codex.jsonl',
        crewRole: 'engineer'
      }
    ];

    const next = overlayPendingInputRequestsOnPersistedState({
      persisted,
      configuredAgents,
      pendingRequests: [
        {
          agentId: 'codex',
          agentName: 'Codex',
          prompt: 'Need approval',
          requestedAt: 5_000,
          updatedAt: 6_000
        }
      ],
      now: 7_000
    });

    expect(next).not.toBe(persisted);
    expect(next.crew.codex).toEqual({
      xp: 120,
      level: 3,
      mood: 8,
      lastState: 'requesting_input',
      updatedAt: 7_000
    });
  });

  it('ignores pending requests for non-rendered agents', () => {
    const persisted: PersistedStatsFile = {
      version: 2,
      crew: {
        codex: {
          xp: 20,
          level: 1,
          mood: 2,
          lastState: 'standby',
          updatedAt: 100
        }
      }
    };
    const configuredAgents: AgentConfig[] = [
      {
        id: 'codex',
        name: 'Codex',
        transcriptPath: '/tmp/codex.jsonl',
        crewRole: 'engineer'
      }
    ];

    const next = overlayPendingInputRequestsOnPersistedState({
      persisted,
      configuredAgents,
      pendingRequests: [
        {
          agentId: 'cursor-hidden',
          prompt: 'Need input',
          requestedAt: 10,
          updatedAt: 11
        }
      ],
      now: 200
    });

    expect(next).toBe(persisted);
    expect(next.crew.codex?.lastState).toBe('standby');
  });
});
