import { describe, expect, it } from 'vitest';
import { STATION_QUEUE_MAX_ITEMS } from '../src/shared/constants';
import { StationState } from '../src/webview/state/StationState';
import type { WebviewToExtensionMessage } from '../src/shared/types';

function createStateHarness(): {
  state: StationState;
  postedMessages: WebviewToExtensionMessage[];
} {
  const postedMessages: WebviewToExtensionMessage[] = [];
  return {
    postedMessages,
    state: new StationState((message) => {
      postedMessages.push(message);
    })
  };
}

describe('StationState', () => {
  it('requests add-agent flow through extension bridge message', () => {
    const { state, postedMessages } = createStateHarness();

    state.requestAddAgent();

    expect(postedMessages).toEqual([{ type: 'open_add_agent' }]);
  });

  it('keeps agent list in sync when the same agent id is re-added', () => {
    const { state } = createStateHarness();

    state.handleMessage({
      type: 'init',
      payload: {
        config: {
          maxFps: 24,
          stationEffectsEnabled: true,
          audioEnabled: true,
          simulationSpeed: 1,
          agents: [
            {
              id: 'codex',
              name: 'Codex',
              transcriptPath: '/tmp/codex.jsonl',
              crewRole: 'engineer'
            }
          ]
        },
        persisted: {
          version: 2,
          crew: {}
        }
      }
    });

    state.handleMessage({
      type: 'agent_added',
      payload: {
        id: 'codex',
        name: 'Codex v2',
        transcriptPath: '/tmp/codex-v2.jsonl',
        crewRole: 'pilot'
      }
    });

    const config = state.getConfig();
    expect(config.agents).toHaveLength(1);
    expect(config.agents[0]).toEqual({
      id: 'codex',
      name: 'Codex v2',
      transcriptPath: '/tmp/codex-v2.jsonl',
      crewRole: 'pilot'
    });
  });

  it('caps internal event queue size to avoid unbounded growth', () => {
    const { state } = createStateHarness();

    for (let index = 0; index < STATION_QUEUE_MAX_ITEMS + 40; index += 1) {
      state.handleMessage({
        type: 'agent_event',
        payload: {
          kind: 'read',
          ts: index,
          agentId: 'codex'
        }
      });
    }

    const drained = state.drainAgentEvents();
    expect(drained).toHaveLength(STATION_QUEUE_MAX_ITEMS);
    expect(drained[0]?.ts).toBe(40);
  });

  it('queues mission rewards when mission completion timestamp increases', () => {
    const { state } = createStateHarness();

    state.handleMessage({
      type: 'mission_sync',
      payload: [
        {
          id: 'run_tests',
          title: 'Run Tests',
          description: 'desc',
          status: 'completed',
          progress: 1,
          rewardXp: 6,
          completedAt: 100
        }
      ]
    });

    expect(state.drainMissionRewards()).toHaveLength(1);

    state.handleMessage({
      type: 'mission_sync',
      payload: [
        {
          id: 'run_tests',
          title: 'Run Tests',
          description: 'desc',
          status: 'completed',
          progress: 1,
          rewardXp: 6,
          completedAt: 100
        }
      ]
    });

    expect(state.drainMissionRewards()).toHaveLength(0);
  });
});
