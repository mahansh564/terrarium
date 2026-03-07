import {
  DEFAULT_PERSISTED_CREW_STATE,
  DEFAULT_STATION_CONFIG,
  PERSIST_DEBOUNCE_MS,
  PERSISTED_SCHEMA_VERSION
} from '@shared/constants';
import type {
  AgentConfig,
  AgentEvent,
  ExtensionToWebviewMessage,
  HealthSignal,
  PersistedCrewState,
  PersistedStatsFile,
  StationConfig,
  WebviewToExtensionMessage
} from '@shared/types';

/**
 * Callback that posts a typed message from webview to extension host.
 */
export type PostToExtension = (message: WebviewToExtensionMessage) => void;

/**
 * Listener callback for state changes.
 */
export type StationStateListener = () => void;

/**
 * Central in-memory state store for the webview runtime.
 */
export class StationState {
  private config: StationConfig = { ...DEFAULT_STATION_CONFIG };

  private persisted: PersistedStatsFile = {
    version: PERSISTED_SCHEMA_VERSION,
    crew: {}
  };

  private readonly eventQueue: AgentEvent[] = [];
  private readonly healthQueue: HealthSignal[] = [];
  private readonly listeners = new Set<StationStateListener>();
  private persistDebounceHandle: number | null = null;

  /**
   * Creates the state store.
   *
   * @param postToExtension Message transport callback.
   */
  constructor(private readonly postToExtension: PostToExtension) {}

  /**
   * Subscribes to store updates.
   *
   * @param listener State-change listener.
   * @returns Unsubscribe function.
   */
  subscribe(listener: StationStateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Applies incoming extension-host message to store state.
   *
   * @param message Incoming extension-to-webview message.
   */
  handleMessage(message: ExtensionToWebviewMessage): void {
    switch (message.type) {
      case 'init':
        this.config = message.payload.config;
        this.persisted = sanitizePersisted(message.payload.persisted);
        this.ensureAgentStates(this.config.agents);
        this.emit();
        break;
      case 'agent_added': {
        const withoutOld = this.config.agents.filter((agent) => agent.id !== message.payload.id);
        this.config = {
          ...this.config,
          agents: [...withoutOld, message.payload]
        };
        this.ensureAgentStates(this.config.agents);
        this.emit();
        break;
      }
      case 'agent_event':
        this.eventQueue.push(message.payload);
        this.ensureStateForAgent(message.payload.agentId);
        break;
      case 'health_signal':
        this.healthQueue.push(message.payload);
        break;
      case 'state_sync':
        this.persisted = sanitizePersisted(message.payload);
        this.emit();
        break;
      case 'reset':
        this.persisted = {
          version: PERSISTED_SCHEMA_VERSION,
          crew: {}
        };
        this.eventQueue.length = 0;
        this.healthQueue.length = 0;
        this.ensureAgentStates(this.config.agents);
        this.emit();
        break;
      default:
        break;
    }
  }

  /**
   * Returns current station config snapshot.
   *
   * @returns Current config object.
   */
  getConfig(): StationConfig {
    return this.config;
  }

  /**
   * Returns persisted crew state by agent id.
   *
   * @param agentId Agent identifier.
   * @returns Persisted stats for this agent.
   */
  getCrewState(agentId: string): PersistedCrewState {
    return this.persisted.crew[agentId] ?? {
      ...DEFAULT_PERSISTED_CREW_STATE,
      updatedAt: Date.now()
    };
  }

  /**
   * Returns all persisted crew states.
   *
   * @returns Clone of persisted state map.
   */
  getPersistedSnapshot(): PersistedStatsFile {
    return {
      version: PERSISTED_SCHEMA_VERSION,
      crew: { ...this.persisted.crew }
    };
  }

  /**
   * Drains currently queued agent events.
   *
   * @returns Events accumulated since last drain.
   */
  drainAgentEvents(): AgentEvent[] {
    return this.eventQueue.splice(0, this.eventQueue.length);
  }

  /**
   * Drains currently queued health signals.
   *
   * @returns Health signals accumulated since last drain.
   */
  drainHealthSignals(): HealthSignal[] {
    return this.healthQueue.splice(0, this.healthQueue.length);
  }

  /**
   * Stores latest crew stats and debounces persistence message.
   *
   * @param agentId Agent identifier.
   * @param nextState Latest crew state snapshot.
   */
  updateCrewState(agentId: string, nextState: PersistedCrewState): void {
    this.persisted.crew[agentId] = nextState;
    this.schedulePersist();
  }

  private ensureAgentStates(agents: AgentConfig[]): void {
    for (const agent of agents) {
      this.ensureStateForAgent(agent.id);
    }
  }

  private ensureStateForAgent(agentId: string): void {
    if (this.persisted.crew[agentId] !== undefined) {
      return;
    }

    this.persisted.crew[agentId] = {
      ...DEFAULT_PERSISTED_CREW_STATE,
      updatedAt: Date.now()
    };
  }

  private schedulePersist(): void {
    if (this.persistDebounceHandle !== null) {
      window.clearTimeout(this.persistDebounceHandle);
    }

    this.persistDebounceHandle = window.setTimeout(() => {
      this.persistDebounceHandle = null;
      this.postToExtension({
        type: 'persist_state',
        payload: this.getPersistedSnapshot()
      });
    }, PERSIST_DEBOUNCE_MS);
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

function sanitizePersisted(value: PersistedStatsFile): PersistedStatsFile {
  return {
    version: PERSISTED_SCHEMA_VERSION,
    crew: { ...value.crew }
  };
}
