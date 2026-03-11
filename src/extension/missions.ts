import { MISSION_REWARD_XP } from '@shared/constants';
import type { AgentEvent, MissionId, MissionState } from '@shared/types';

const RECOVER_FROM_FAILURE_ID: MissionId = 'recover_from_failure';

/**
 * Tracks station mission lifecycle based on incoming agent events.
 */
export class MissionTracker {
  private readonly missionStates = new Map<MissionId, MissionState>([
    [
      'run_tests',
      {
        id: 'run_tests',
        title: 'Run Tests',
        description: 'Trigger a test run to verify station systems.',
        status: 'active',
        progress: 0,
        rewardXp: MISSION_REWARD_XP
      }
    ],
    [
      RECOVER_FROM_FAILURE_ID,
      {
        id: RECOVER_FROM_FAILURE_ID,
        title: 'Recover From Failure',
        description: 'After a failing test, land a passing run.',
        status: 'idle',
        progress: 0,
        rewardXp: MISSION_REWARD_XP
      }
    ],
    [
      'complete_task',
      {
        id: 'complete_task',
        title: 'Complete Task',
        description: 'Ship a completion or deployment milestone.',
        status: 'active',
        progress: 0,
        rewardXp: MISSION_REWARD_XP
      }
    ]
  ]);

  private awaitingRecovery = false;

  /**
   * Applies an incoming event and updates mission states.
   *
   * @param event Incoming normalized event.
   * @returns True when mission state changed.
   */
  applyEvent(event: AgentEvent): boolean {
    let changed = false;
    if (event.kind === 'test_fail') {
      this.awaitingRecovery = true;
      changed = this.setMission(RECOVER_FROM_FAILURE_ID, {
        status: 'active',
        progress: 0.5
      }) || changed;
    }

    if (event.kind === 'test_run') {
      changed = this.completeMission('run_tests', event.ts) || changed;
    }

    if (event.kind === 'test_pass') {
      if (this.awaitingRecovery) {
        this.awaitingRecovery = false;
        changed = this.completeMission(RECOVER_FROM_FAILURE_ID, event.ts) || changed;
      }
    }

    if (event.kind === 'complete' || event.kind === 'deploy') {
      changed = this.completeMission('complete_task', event.ts) || changed;
    }

    return changed;
  }

  /**
   * Returns current mission snapshot list.
   *
   * @returns Mission states sorted by display priority.
   */
  snapshot(): MissionState[] {
    return [
      this.mustGetMission('run_tests'),
      this.mustGetMission(RECOVER_FROM_FAILURE_ID),
      this.mustGetMission('complete_task')
    ];
  }

  /**
   * Resets all missions to their initial state.
   */
  reset(): void {
    this.awaitingRecovery = false;
    this.clearMissionCompletion('run_tests', 'active', 0);
    this.clearMissionCompletion(RECOVER_FROM_FAILURE_ID, 'idle', 0);
    this.clearMissionCompletion('complete_task', 'active', 0);
  }

  private completeMission(id: MissionId, ts: number): boolean {
    return this.setMission(id, {
      status: 'completed',
      progress: 1,
      completedAt: ts
    });
  }

  private setMission(id: MissionId, patch: Partial<MissionState>): boolean {
    const current = this.mustGetMission(id);
    const next: MissionState = { ...current, ...patch };
    const changed =
      next.status !== current.status ||
      next.progress !== current.progress ||
      next.completedAt !== current.completedAt;
    if (changed) {
      this.missionStates.set(id, next);
    }
    return changed;
  }

  private mustGetMission(id: MissionId): MissionState {
    const mission = this.missionStates.get(id);
    if (mission === undefined) {
      throw new Error(`Mission "${id}" is not registered.`);
    }
    return mission;
  }

  private clearMissionCompletion(id: MissionId, status: MissionState['status'], progress: number): void {
    const current = this.mustGetMission(id);
    const { completedAt: _completedAt, ...rest } = current;
    this.missionStates.set(id, {
      ...rest,
      status,
      progress
    });
  }
}
