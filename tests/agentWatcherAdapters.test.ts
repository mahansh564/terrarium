import { afterEach, describe, expect, it } from 'vitest';
import type { AgentConfig } from '../src/shared/types';
import { AgentWatcherManager } from '../src/extension/agentWatcher';
import type {
  AgentSourceAdapter,
  AgentSourceAdapterInstance,
  AgentSourceAdapterOptions
} from '../src/extension/adapters/types';

const activeWatchers: AgentWatcherManager[] = [];

afterEach(() => {
  for (const watcher of activeWatchers.splice(0)) {
    watcher.dispose();
  }
});

describe('AgentWatcherManager adapters', () => {
  it('uses configured adapter and updates existing adapter instance for stable source', () => {
    const adapter = new RecordingAdapter('stub');
    const watcher = new AgentWatcherManager(
      () => undefined,
      undefined,
      { adapters: [adapter] }
    );

    activeWatchers.push(watcher);

    const baseAgent = createAgent({
      sourceAdapter: 'stub',
      transcriptPath: 'in-memory://events'
    });

    watcher.updateAgents([baseAgent]);
    watcher.updateAgents([{ ...baseAgent, name: 'Renamed Agent' }]);

    expect(adapter.instances).toHaveLength(1);
    expect(adapter.instances[0]?.updatedAgents).toHaveLength(1);
    expect(adapter.instances[0]?.updatedAgents[0]?.name).toBe('Renamed Agent');
  });

  it('falls back to jsonl adapter when configured adapter id is unknown', () => {
    const fallbackAdapter = new RecordingAdapter('jsonl');
    const reportedErrors: Error[] = [];

    const watcher = new AgentWatcherManager(
      () => undefined,
      (error) => {
        reportedErrors.push(error);
      },
      { adapters: [fallbackAdapter] }
    );

    activeWatchers.push(watcher);

    watcher.updateAgents([
      createAgent({
        sourceAdapter: 'custom-source',
        transcriptPath: 'in-memory://events'
      })
    ]);

    expect(fallbackAdapter.instances).toHaveLength(1);
    expect(reportedErrors).toHaveLength(1);
    expect(reportedErrors[0]?.message).toContain('custom-source');
  });

  it('recreates source instance when adapter id changes', () => {
    const firstAdapter = new RecordingAdapter('stub');
    const secondAdapter = new RecordingAdapter('alt');

    const watcher = new AgentWatcherManager(
      () => undefined,
      undefined,
      { adapters: [firstAdapter, secondAdapter] }
    );

    activeWatchers.push(watcher);

    const base = createAgent({
      sourceAdapter: 'stub',
      transcriptPath: 'in-memory://events'
    });

    watcher.updateAgents([base]);
    watcher.updateAgents([{ ...base, sourceAdapter: 'alt' }]);

    expect(firstAdapter.instances).toHaveLength(1);
    expect(firstAdapter.instances[0]?.disposed).toBe(true);
    expect(secondAdapter.instances).toHaveLength(1);
  });
});

class RecordingAdapter implements AgentSourceAdapter {
  readonly instances: RecordingAdapterInstance[] = [];

  /**
   * Creates a test adapter.
   *
   * @param id Adapter identifier.
   */
  constructor(public readonly id: string) {}

  /**
   * Creates a test lifecycle instance and stores it for assertions.
   *
   * @param options Adapter options.
   * @returns Recording lifecycle instance.
   */
  createInstance(options: AgentSourceAdapterOptions): AgentSourceAdapterInstance {
    const instance = new RecordingAdapterInstance(options.agent);
    this.instances.push(instance);
    return instance;
  }
}

class RecordingAdapterInstance implements AgentSourceAdapterInstance {
  readonly updatedAgents: AgentConfig[] = [];
  disposed = false;

  /**
   * Creates a test instance.
   *
   * @param _initialAgent Initial agent config.
   */
  constructor(_initialAgent: AgentConfig) {}

  /**
   * Stores updated agent config.
   *
   * @param agent Updated config.
   */
  updateAgent(agent: AgentConfig): void {
    this.updatedAgents.push(agent);
  }

  /**
   * Marks instance as disposed.
   */
  dispose(): void {
    this.disposed = true;
  }
}

function createAgent(overrides: Partial<AgentConfig>): AgentConfig {
  return {
    id: 'agent-1',
    name: 'Agent One',
    transcriptPath: '/tmp/agent-1',
    crewRole: 'engineer',
    ...overrides
  };
}
