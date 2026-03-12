import { describe, expect, it } from 'vitest';
import {
  applyActionToSnapshot,
  deriveInitialCrewActivity,
  describeAgentEventActivity,
  deriveRequestingInputFlag,
  deriveStateFromAction,
  levelFromXp,
  type CrewSnapshot
} from '../src/webview/entities/CrewUnit';

describe('CrewUnit state machine', () => {
  it('maps actions to expected states', () => {
    expect(deriveStateFromAction('read')).toBe('scanning');
    expect(deriveStateFromAction('write')).toBe('repairing');
    expect(deriveStateFromAction('test_fail')).toBe('damaged');
    expect(deriveStateFromAction('complete')).toBe('celebrating');
    expect(deriveStateFromAction('input_request')).toBe('requesting_input');
  });

  it('updates xp mood and level for positive actions', () => {
    const initial = {
      state: 'standby' as const,
      xp: 48,
      level: 1,
      mood: 0,
      updatedAt: 0,
      requestingInput: false
    };

    const next = applyActionToSnapshot(initial, 'test_pass', 1000);

    expect(next.state).toBe('celebrating');
    expect(next.xp).toBeGreaterThan(initial.xp);
    expect(next.level).toBeGreaterThanOrEqual(2);
    expect(next.mood).toBeGreaterThan(initial.mood);
    expect(next.updatedAt).toBe(1000);
  });

  it('clamps mood to lower bound for repeated failures', () => {
    let snapshot: CrewSnapshot = {
      state: 'standby' as const,
      xp: 0,
      level: 1,
      mood: 0,
      updatedAt: 0,
      requestingInput: false
    };

    for (let i = 0; i < 30; i += 1) {
      snapshot = applyActionToSnapshot(snapshot, 'error', i + 1);
    }

    expect(snapshot.mood).toBeGreaterThanOrEqual(-100);
    expect(snapshot.state).toBe('damaged');
  });

  it('computes levels from thresholds', () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(60)).toBeGreaterThanOrEqual(2);
    expect(levelFromXp(1200)).toBeGreaterThanOrEqual(8);
  });

  it('keeps requesting-input only for input requests or when no event arrives', () => {
    expect(deriveRequestingInputFlag(false, 'input_request')).toBe(true);
    expect(deriveRequestingInputFlag(true, 'idle')).toBe(false);
    expect(deriveRequestingInputFlag(true, 'terminal')).toBe(false);
    expect(deriveRequestingInputFlag(true, 'terminal', 'cursor_composer_storage')).toBe(true);
    expect(deriveRequestingInputFlag(true, null)).toBe(true);
  });

  it('formats rich live-activity descriptions for hover details', () => {
    expect(
      describeAgentEventActivity({
        kind: 'read',
        ts: 1,
        agentId: 'codex',
        path: 'src/extension/activate.ts'
      })
    ).toContain('Reading');

    expect(
      describeAgentEventActivity({
        kind: 'terminal',
        ts: 2,
        agentId: 'cursor-live',
        command: 'cursor-runtime-running-pulse',
        metadata: {
          source: 'cursor_composer_storage',
          composerName: 'Checkout Agent'
        }
      })
    ).toContain('Cursor runtime active');

    expect(
      describeAgentEventActivity({
        kind: 'input_request',
        ts: 3,
        agentId: 'codex',
        prompt: 'Need approval to run deploy script'
      })
    ).toContain('Needs input');
  });

  it('derives initial activity from persisted state', () => {
    const requestingInput = deriveInitialCrewActivity({
      xp: 200,
      level: 4,
      mood: 10,
      lastState: 'requesting_input',
      updatedAt: 1_700_000_100_000
    });
    expect(requestingInput.action).toBe('input_request');
    expect(requestingInput.description).toBe('Needs input: Pending request');
    expect(requestingInput.updatedAt).toBe(1_700_000_100_000);

    const standby = deriveInitialCrewActivity({
      xp: 120,
      level: 3,
      mood: 5,
      lastState: 'standby',
      updatedAt: 1_700_000_200_000
    });
    expect(standby.action).toBeNull();
    expect(standby.description).toBe('Awaiting live events.');
    expect(standby.updatedAt).toBe(1_700_000_200_000);
  });
});
