import { describe, expect, it } from 'vitest';
import { MissionTracker } from '../src/extension/missions';

describe('MissionTracker', () => {
  it('completes run-tests mission on test_run events', () => {
    const tracker = new MissionTracker();
    tracker.applyEvent({
      kind: 'test_run',
      agentId: 'codex',
      ts: 100
    });

    const mission = tracker.snapshot().find((entry) => entry.id === 'run_tests');
    expect(mission?.status).toBe('completed');
    expect(mission?.completedAt).toBe(100);
  });

  it('requires failure before completing recover-from-failure mission', () => {
    const tracker = new MissionTracker();
    tracker.applyEvent({
      kind: 'test_pass',
      agentId: 'codex',
      ts: 100
    });
    expect(
      tracker.snapshot().find((entry) => entry.id === 'recover_from_failure')?.status
    ).toBe('idle');

    tracker.applyEvent({
      kind: 'test_fail',
      agentId: 'codex',
      ts: 120
    });
    tracker.applyEvent({
      kind: 'test_pass',
      agentId: 'codex',
      ts: 160
    });
    const mission = tracker.snapshot().find((entry) => entry.id === 'recover_from_failure');
    expect(mission?.status).toBe('completed');
    expect(mission?.completedAt).toBe(160);
  });

  it('updates completion timestamp for repeat complete-task events', () => {
    const tracker = new MissionTracker();
    tracker.applyEvent({
      kind: 'complete',
      agentId: 'codex',
      ts: 200
    });
    tracker.applyEvent({
      kind: 'deploy',
      agentId: 'codex',
      ts: 260
    });

    const mission = tracker.snapshot().find((entry) => entry.id === 'complete_task');
    expect(mission?.status).toBe('completed');
    expect(mission?.completedAt).toBe(260);
  });
});
