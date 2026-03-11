import { describe, expect, it } from 'vitest';
import {
  CURSOR_RUNTIME_RUNNING_RECENCY_MS,
  synthesizeCursorRuntimeComposerEvents
} from '../src/extension/cursorRuntimeEvents';

describe('cursor runtime composer event synthesis', () => {
  it('emits a running pulse for recently active added composers', () => {
    const now = 2_000_000;
    const events = synthesizeCursorRuntimeComposerEvents({
      previousComposers: [],
      addedComposers: [
        {
          composerId: 'composer-1',
          unifiedMode: 'agent',
          name: 'Checkout Agent',
          lastUpdatedAt: now - 2_000
        }
      ],
      updatedComposers: [],
      now
    });

    expect(events).toEqual([
      {
        kind: 'terminal',
        ts: now - 2_000,
        agentId: 'cursor-composer-1',
        agentName: 'Checkout Agent',
        command: 'cursor-runtime-running-pulse',
        metadata: {
          source: 'cursor_composer_storage',
          composerId: 'composer-1'
        }
      }
    ]);
  });

  it('emits input_request when blocking is true and idle when blocking resolves', () => {
    const now = 5_000_000;
    const becameBlockedEvents = synthesizeCursorRuntimeComposerEvents({
      previousComposers: [{ composerId: 'composer-2', unifiedMode: 'agent', hasBlockingPendingActions: false }],
      addedComposers: [],
      updatedComposers: [
        {
          composerId: 'composer-2',
          unifiedMode: 'agent',
          hasBlockingPendingActions: true
        }
      ],
      now
    });

    expect(becameBlockedEvents).toEqual([
      {
        kind: 'input_request',
        ts: now,
        agentId: 'cursor-composer-2',
        agentName: 'Cursor Agent (composer)',
        prompt: 'Cursor agent requires user input.',
        metadata: {
          source: 'cursor_composer_storage',
          composerId: 'composer-2'
        }
      }
    ]);

    const resolvedBlockingEvents = synthesizeCursorRuntimeComposerEvents({
      previousComposers: [{ composerId: 'composer-2', unifiedMode: 'agent', hasBlockingPendingActions: true }],
      addedComposers: [],
      updatedComposers: [{ composerId: 'composer-2', unifiedMode: 'agent', hasBlockingPendingActions: false }],
      now
    });

    expect(resolvedBlockingEvents).toEqual([
      {
        kind: 'idle',
        ts: now,
        agentId: 'cursor-composer-2',
        agentName: 'Cursor Agent (composer)',
        reason: 'Cursor blocking input request resolved.',
        metadata: {
          source: 'cursor_composer_storage',
          composerId: 'composer-2'
        }
      }
    ]);
  });

  it('uses createdAt fallback when lastUpdatedAt is unavailable', () => {
    const now = 100_000;
    const events = synthesizeCursorRuntimeComposerEvents({
      previousComposers: [],
      addedComposers: [
        {
          composerId: 'composer-3',
          unifiedMode: 'agent',
          createdAt: now - CURSOR_RUNTIME_RUNNING_RECENCY_MS + 1
        }
      ],
      updatedComposers: [],
      now
    });

    expect(events[0]?.kind).toBe('terminal');
    expect(events[0]?.ts).toBe(now - CURSOR_RUNTIME_RUNNING_RECENCY_MS + 1);
  });

  it('maps blocking and resolved events to visible configured agent identity when provided', () => {
    const now = 9_000_000;
    const resolveAgentIdentity = () => ({
      agentId: 'configured-cursor-agent',
      agentName: 'Configured Cursor Agent'
    });

    const becameBlockedEvents = synthesizeCursorRuntimeComposerEvents({
      previousComposers: [{ composerId: 'composer-9', unifiedMode: 'agent', hasBlockingPendingActions: false }],
      addedComposers: [],
      updatedComposers: [{ composerId: 'composer-9', unifiedMode: 'agent', hasBlockingPendingActions: true }],
      resolveAgentIdentity,
      now
    });

    const resolvedBlockingEvents = synthesizeCursorRuntimeComposerEvents({
      previousComposers: [{ composerId: 'composer-9', unifiedMode: 'agent', hasBlockingPendingActions: true }],
      addedComposers: [],
      updatedComposers: [{ composerId: 'composer-9', unifiedMode: 'agent', hasBlockingPendingActions: false }],
      resolveAgentIdentity,
      now
    });

    expect(becameBlockedEvents).toEqual([
      {
        kind: 'input_request',
        ts: now,
        agentId: 'configured-cursor-agent',
        agentName: 'Configured Cursor Agent',
        prompt: 'Cursor agent requires user input.',
        metadata: {
          source: 'cursor_composer_storage',
          composerId: 'composer-9'
        }
      }
    ]);

    expect(resolvedBlockingEvents).toEqual([
      {
        kind: 'idle',
        ts: now,
        agentId: 'configured-cursor-agent',
        agentName: 'Configured Cursor Agent',
        reason: 'Cursor blocking input request resolved.',
        metadata: {
          source: 'cursor_composer_storage',
          composerId: 'composer-9'
        }
      }
    ]);
  });
});
