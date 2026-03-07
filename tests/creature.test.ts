import { describe, expect, it } from 'vitest';
import {
  applyActionToSnapshot,
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
});
