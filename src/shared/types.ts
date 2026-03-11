/**
 * Supported activity kinds emitted by transcript parsers.
 */
export type AgentAction =
  | 'read'
  | 'write'
  | 'test_run'
  | 'test_pass'
  | 'test_fail'
  | 'terminal'
  | 'idle'
  | 'error'
  | 'complete'
  | 'deploy'
  | 'input_request';

/**
 * Runtime behavior states for crew units.
 */
export type CrewState =
  | 'standby'
  | 'scanning'
  | 'repairing'
  | 'docked'
  | 'alert'
  | 'celebrating'
  | 'damaged'
  | 'requesting_input';

/**
 * Serialized scalar metadata allowed in event payloads.
 */
export type EventMetadataValue = string | number | boolean | null;

/**
 * Common fields shared by all normalized agent events.
 */
export interface AgentEventBase {
  /** Normalized action kind. */
  kind: AgentAction;
  /** Unix epoch timestamp in milliseconds. */
  ts: number;
  /** Stable agent identifier. */
  agentId: string;
  /** Optional display name for the agent. */
  agentName?: string;
  /** Optional metadata emitted by event source. */
  metadata?: Record<string, EventMetadataValue>;
}

/**
 * Event emitted when an agent reads files.
 */
export interface ReadAgentEvent extends AgentEventBase {
  kind: 'read';
  path?: string;
}

/**
 * Event emitted when an agent writes code.
 */
export interface WriteAgentEvent extends AgentEventBase {
  kind: 'write';
  path?: string;
  bytesWritten?: number;
}

/**
 * Event emitted when an agent starts running tests.
 */
export interface TestRunAgentEvent extends AgentEventBase {
  kind: 'test_run';
  suite?: string;
}

/**
 * Event emitted when tests pass.
 */
export interface TestPassAgentEvent extends AgentEventBase {
  kind: 'test_pass';
  passed?: number;
}

/**
 * Event emitted when tests fail.
 */
export interface TestFailAgentEvent extends AgentEventBase {
  kind: 'test_fail';
  failed?: number;
}

/**
 * Event emitted when an agent executes a terminal command.
 */
export interface TerminalAgentEvent extends AgentEventBase {
  kind: 'terminal';
  command?: string;
  exitCode?: number;
}

/**
 * Event emitted when an agent is idle.
 */
export interface IdleAgentEvent extends AgentEventBase {
  kind: 'idle';
  reason?: string;
}

/**
 * Event emitted when an agent asks for user input.
 */
export interface InputRequestAgentEvent extends AgentEventBase {
  kind: 'input_request';
  prompt?: string;
}

/**
 * Event emitted when an agent encounters an error.
 */
export interface ErrorAgentEvent extends AgentEventBase {
  kind: 'error';
  errorMessage?: string;
}

/**
 * Event emitted when a task is completed.
 */
export interface CompleteAgentEvent extends AgentEventBase {
  kind: 'complete';
  taskId?: string;
}

/**
 * Event emitted when a deployment occurs.
 */
export interface DeployAgentEvent extends AgentEventBase {
  kind: 'deploy';
  environment?: string;
}

/**
 * Discriminated union of all normalized agent events.
 */
export type AgentEvent =
  | ReadAgentEvent
  | WriteAgentEvent
  | TestRunAgentEvent
  | TestPassAgentEvent
  | TestFailAgentEvent
  | TerminalAgentEvent
  | IdleAgentEvent
  | InputRequestAgentEvent
  | ErrorAgentEvent
  | CompleteAgentEvent
  | DeployAgentEvent;

/**
 * Crew roles available in v1.
 */
export type CrewRole = 'engineer' | 'pilot' | 'analyst' | 'security';

/**
 * Station movement intent zones used by autonomous crew navigation.
 */
export type StationZone =
  | 'console_bay'
  | 'module_bay'
  | 'dock'
  | 'diagnostics'
  | 'central_hub'
  | 'patrol';

/**
 * User-configured transcript source and crew role settings for an agent.
 */
export interface AgentConfig {
  /** Stable identifier for this tracked agent. */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Source adapter id used to read this transcript source. */
  sourceAdapter?: string;
  /** Absolute transcript path (file or directory). */
  transcriptPath: string;
  /** Crew role used for rendering. */
  crewRole: CrewRole;
  /** Optional hex color override for tinting. */
  color?: string;
}

/**
 * Extension and webview runtime configuration values.
 */
export interface StationConfig {
  /** Maximum frame rate for rendering. */
  maxFps: number;
  /** Configured tracked agents. */
  agents: AgentConfig[];
  /** Whether station environment effects should be enabled. */
  stationEffectsEnabled: boolean;
  /** Whether ambient audio playback should be enabled. */
  audioEnabled: boolean;
  /** Simulation speed multiplier for non-manual movement/ambient systems. */
  simulationSpeed: number;
}

/**
 * Individual crew stats persisted across sessions.
 */
export interface PersistedCrewState {
  /** Accumulated experience points. */
  xp: number;
  /** Derived crew level. */
  level: number;
  /** Mood score from -100 to 100. */
  mood: number;
  /** Last recorded finite-state-machine state. */
  lastState: CrewState;
  /** Last update timestamp in milliseconds. */
  updatedAt: number;
}

/**
 * Persisted workspace payload for all crew units.
 */
export interface PersistedStatsFile {
  /** Schema version for migrations. */
  version: 2;
  /** Per-agent crew state values. */
  crew: Record<string, PersistedCrewState>;
}

/**
 * Health signal kinds emitted to environment systems.
 */
export type HealthSignalType = 'neutral' | 'positive' | 'negative' | 'critical' | 'milestone';

/**
 * Aggregated environment health signal payload.
 */
export interface HealthSignal {
  /** Signal category. */
  type: HealthSignalType;
  /** Source event kind that generated this signal. */
  source: AgentAction;
  /** Agent that caused the signal. */
  agentId: string;
  /** Timestamp when signal occurred. */
  ts: number;
}

/**
 * Snapshot of local workspace project metrics used by station systems.
 */
export interface ProjectMetricsSnapshot {
  /** Timestamp when the snapshot was produced. */
  ts: number;
  /** Number of dirty files from `git status --porcelain`, or null when unavailable. */
  dirtyFileCount: number | null;
  /** Timestamp of latest observed passing test event, or null. */
  lastTestPassAt: number | null;
  /** Timestamp of latest observed failing test event, or null. */
  lastTestFailAt: number | null;
  /** Consecutive failing-test streak derived from transcript events. */
  failureStreak: number;
}

/**
 * Pending input-request entry shown in the Action Center.
 */
export interface PendingInputRequest {
  /** Agent that requested input. */
  agentId: string;
  /** Optional display name for the requesting agent. */
  agentName?: string;
  /** Latest request prompt. */
  prompt: string;
  /** Timestamp of the first unresolved request for this agent. */
  requestedAt: number;
  /** Timestamp of the latest unresolved request update for this agent. */
  updatedAt: number;
}

/**
 * Mission identifiers used by the station reward loop.
 */
export type MissionId = 'run_tests' | 'recover_from_failure' | 'complete_task';

/**
 * Mission lifecycle state.
 */
export type MissionStatus = 'idle' | 'active' | 'completed';

/**
 * Mission state synchronized to the webview.
 */
export interface MissionState {
  /** Stable mission identifier. */
  id: MissionId;
  /** Human-friendly mission title. */
  title: string;
  /** Short mission description. */
  description: string;
  /** Current mission lifecycle state. */
  status: MissionStatus;
  /** Mission progress in range [0, 1]. */
  progress: number;
  /** XP reward granted when this mission completes. */
  rewardXp: number;
  /** Completion timestamp when mission is completed. */
  completedAt?: number;
}

/**
 * Initialization message payload sent by extension host.
 */
export interface InitMessagePayload {
  /** Runtime config values resolved from settings. */
  config: StationConfig;
  /** Persisted crew stats loaded from workspace. */
  persisted: PersistedStatsFile;
}

/**
 * Messages sent from extension host into the webview.
 */
export type ExtensionToWebviewMessage =
  | {
      type: 'init';
      payload: InitMessagePayload;
    }
  | {
      type: 'agent_event';
      payload: AgentEvent;
    }
  | {
      type: 'agent_added';
      payload: AgentConfig;
    }
  | {
      type: 'state_sync';
      payload: PersistedStatsFile;
    }
  | {
      type: 'reset';
    }
  | {
      type: 'health_signal';
      payload: HealthSignal;
    }
  | {
      type: 'project_metrics';
      payload: ProjectMetricsSnapshot;
    }
  | {
      type: 'action_center_sync';
      payload: PendingInputRequest[];
    }
  | {
      type: 'mission_sync';
      payload: MissionState[];
    };

/**
 * Messages sent from webview to extension host.
 */
export type WebviewToExtensionMessage =
  | {
      type: 'ready';
    }
  | {
      type: 'persist_state';
      payload: PersistedStatsFile;
    }
  | {
      type: 'open_add_agent';
    }
  | {
      type: 'update_runtime_preferences';
      payload: {
        stationEffectsEnabled?: boolean;
        audioEnabled?: boolean;
        simulationSpeed?: number;
      };
    };
