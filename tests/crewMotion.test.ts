import { describe, expect, it } from 'vitest';
import {
  CREW_RUNNING_ACTIVITY_RECENCY_MS,
  resolveCrewMotionMode,
  shouldAutoMoveCrew
} from '../src/webview/scenes/crewMotion';

describe('crew movement gating', () => {
  it('moves autonomously when crew is running and recent', () => {
    const now = 20_000;
    expect(
      shouldAutoMoveCrew(
        {
          state: 'repairing',
          updatedAt: now - 2_000
        },
        now
      )
    ).toBe(true);
  });

  it('stays idle when crew is not in an active running state', () => {
    const now = 20_000;
    expect(
      shouldAutoMoveCrew(
        {
          state: 'docked',
          updatedAt: now - 500
        },
        now
      )
    ).toBe(false);

    expect(
      shouldAutoMoveCrew(
        {
          state: 'alert',
          updatedAt: now - CREW_RUNNING_ACTIVITY_RECENCY_MS - 1
        },
        now
      )
    ).toBe(false);
  });

  it('prioritizes selected manual movement over autonomous movement', () => {
    const now = 30_000;
    const runningSnapshot = {
      state: 'scanning' as const,
      updatedAt: now - 100
    };

    expect(
      resolveCrewMotionMode({
        isSelected: true,
        manualInputActive: true,
        snapshot: runningSnapshot,
        now
      })
    ).toBe('manual');

    expect(
      resolveCrewMotionMode({
        isSelected: true,
        manualInputActive: false,
        snapshot: runningSnapshot,
        now
      })
    ).toBe('autonomous');
  });
});
