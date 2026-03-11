import { describe, expect, it } from 'vitest';
import type { AgentConfig } from '../src/shared/types';
import {
  mergeRuntimeCursorAgents,
  resolveVisibleCursorAgentIdentity
} from '../src/extension/cursorRuntimeAgents';

describe('runtime cursor agent overlay', () => {
  it('maps Cursor composers to runtime agents with Cursor names and fallback names', () => {
    const configuredAgents: AgentConfig[] = [
      {
        id: 'codex',
        name: 'Codex',
        transcriptPath: '/workspace/transcripts/codex.jsonl',
        crewRole: 'engineer'
      }
    ];

    const merged = mergeRuntimeCursorAgents(configuredAgents, '/cursor/project/agent-transcripts', [
      { composerId: 'abc1234567', unifiedMode: 'agent', name: 'Checkout Flow Fix' },
      { composerId: 'def8901234', unifiedMode: 'agent' }
    ]);

    expect(merged).toEqual([
      configuredAgents[0],
      {
        id: 'cursor-abc1234567',
        name: 'Checkout Flow Fix',
        sourceAdapter: 'jsonl',
        transcriptPath: '/cursor/project/agent-transcripts/abc1234567/abc1234567.jsonl',
        crewRole: 'analyst',
        color: '#58A6FF'
      },
      {
        id: 'cursor-def8901234',
        name: 'Cursor Agent (def89012)',
        sourceAdapter: 'jsonl',
        transcriptPath: '/cursor/project/agent-transcripts/def8901234/def8901234.jsonl',
        crewRole: 'analyst',
        color: '#58A6FF'
      }
    ]);
  });

  it('hides runtime duplicates when transcript path already exists in configured agents', () => {
    const configuredAgents: AgentConfig[] = [
      {
        id: 'existing-cursor-custom',
        name: 'My Cursor Agent',
        transcriptPath: '/cursor/project/agent-transcripts/abc1234567/abc1234567.jsonl',
        crewRole: 'analyst'
      }
    ];

    const merged = mergeRuntimeCursorAgents(configuredAgents, '/cursor/project/agent-transcripts', [
      { composerId: 'abc1234567', unifiedMode: 'agent', name: 'Checkout Flow Fix' },
      { composerId: 'def8901234', unifiedMode: 'agent', name: 'Inventory Rewrite' }
    ]);

    expect(merged).toEqual([
      configuredAgents[0],
      {
        id: 'cursor-def8901234',
        name: 'Inventory Rewrite',
        sourceAdapter: 'jsonl',
        transcriptPath: '/cursor/project/agent-transcripts/def8901234/def8901234.jsonl',
        crewRole: 'analyst',
        color: '#58A6FF'
      }
    ]);
  });

  it('includes runtime agents from focused composers even when not currently selected', () => {
    const configuredAgents: AgentConfig[] = [];
    const runtimeComposers = [
      { composerId: 'new-unselected-agent', unifiedMode: 'agent', name: 'Fresh Agent' }
    ] as const;

    const merged = mergeRuntimeCursorAgents(
      configuredAgents,
      '/cursor/project/agent-transcripts',
      runtimeComposers
    );

    expect(merged).toEqual([
      {
        id: 'cursor-new-unselected-agent',
        name: 'Fresh Agent',
        sourceAdapter: 'jsonl',
        transcriptPath:
          '/cursor/project/agent-transcripts/new-unselected-agent/new-unselected-agent.jsonl',
        crewRole: 'analyst',
        color: '#58A6FF'
      }
    ]);
  });

  it('resolves duplicate composer transcript path to configured visible agent identity', () => {
    const configuredAgents: AgentConfig[] = [
      {
        id: 'existing-cursor-custom',
        name: 'My Cursor Agent',
        transcriptPath: '/cursor/project/agent-transcripts/abc1234567/abc1234567.jsonl',
        crewRole: 'analyst'
      }
    ];

    const identity = resolveVisibleCursorAgentIdentity(
      configuredAgents,
      '/cursor/project/agent-transcripts',
      { composerId: 'abc1234567', name: 'Composer Name' }
    );

    expect(identity).toEqual({
      agentId: 'existing-cursor-custom',
      agentName: 'My Cursor Agent'
    });
  });

  it('falls back to runtime cursor identity when no configured transcript match exists', () => {
    const identity = resolveVisibleCursorAgentIdentity([], '/cursor/project/agent-transcripts', {
      composerId: 'def8901234',
      name: 'Inventory Rewrite'
    });

    expect(identity).toEqual({
      agentId: 'cursor-def8901234',
      agentName: 'Inventory Rewrite'
    });
  });
});
