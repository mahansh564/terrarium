import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  DEFAULT_LOCAL_METRICS_POLL_MS,
  MIN_LOCAL_METRICS_POLL_MS
} from '@shared/constants';
import type { AgentEvent, ProjectMetricsSnapshot } from '@shared/types';

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 1500;

/**
 * Options for local workspace project-metrics monitoring.
 */
export interface LocalProjectMetricsMonitorOptions {
  /** Absolute workspace path used as git command cwd. */
  workspacePath: string;
  /** Initial polling interval in milliseconds. */
  pollMs: number;
  /** Callback fired whenever a new metrics snapshot is produced. */
  onSnapshot: (snapshot: ProjectMetricsSnapshot) => void;
  /** Optional callback for non-fatal poll errors. */
  onError?: (error: Error) => void;
}

/**
 * Monitors local workspace health signals and emits typed project-metrics snapshots.
 */
export class LocalProjectMetricsMonitor {
  private readonly workspacePath: string;
  private readonly onSnapshot: (snapshot: ProjectMetricsSnapshot) => void;
  private readonly onError: ((error: Error) => void) | undefined;
  private pollMs: number;
  private timer: NodeJS.Timeout | null = null;
  private polling = false;
  private lastSnapshot: ProjectMetricsSnapshot = {
    ts: Date.now(),
    dirtyFileCount: null,
    lastTestPassAt: null,
    lastTestFailAt: null,
    failureStreak: 0
  };

  /**
   * Creates a local metrics monitor.
   *
   * @param options Runtime options.
   */
  constructor(options: LocalProjectMetricsMonitorOptions) {
    this.workspacePath = options.workspacePath;
    this.onSnapshot = options.onSnapshot;
    this.onError = options.onError;
    this.pollMs = sanitizePollMs(options.pollMs);
  }

  /**
   * Starts periodic git dirty-file polling and emits an initial snapshot.
   */
  start(): void {
    if (this.timer !== null) {
      return;
    }

    this.timer = setInterval(() => {
      void this.refreshDirtyFileCount();
    }, this.pollMs);
    void this.refreshDirtyFileCount();
  }

  /**
   * Stops polling.
   */
  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Updates monitor polling interval while preserving running state.
   *
   * @param pollMs Next polling interval.
   */
  setPollMs(pollMs: number): void {
    this.pollMs = sanitizePollMs(pollMs);
    if (this.timer !== null) {
      this.stop();
      this.start();
    }
  }

  /**
   * Applies transcript-derived test outcomes into metrics state.
   *
   * @param event Incoming agent event.
   */
  applyAgentEvent(event: AgentEvent): void {
    if (event.kind === 'test_fail') {
      this.lastSnapshot = {
        ...this.lastSnapshot,
        ts: Date.now(),
        lastTestFailAt: event.ts,
        failureStreak: this.lastSnapshot.failureStreak + 1
      };
      this.onSnapshot(this.lastSnapshot);
      return;
    }

    if (event.kind === 'test_pass') {
      this.lastSnapshot = {
        ...this.lastSnapshot,
        ts: Date.now(),
        lastTestPassAt: event.ts,
        failureStreak: 0
      };
      this.onSnapshot(this.lastSnapshot);
    }
  }

  /**
   * Returns the latest metrics snapshot.
   *
   * @returns Current metrics snapshot.
   */
  getSnapshot(): ProjectMetricsSnapshot {
    return this.lastSnapshot;
  }

  private async refreshDirtyFileCount(): Promise<void> {
    if (this.polling) {
      return;
    }
    this.polling = true;
    try {
      const dirtyFileCount = await readDirtyFileCount(this.workspacePath);
      this.lastSnapshot = {
        ...this.lastSnapshot,
        ts: Date.now(),
        dirtyFileCount
      };
      this.onSnapshot(this.lastSnapshot);
    } catch (error) {
      this.lastSnapshot = {
        ...this.lastSnapshot,
        ts: Date.now(),
        dirtyFileCount: null
      };
      this.onSnapshot(this.lastSnapshot);
      if (error instanceof Error) {
        this.onError?.(error);
      } else {
        this.onError?.(new Error(String(error)));
      }
    } finally {
      this.polling = false;
    }
  }
}

async function readDirtyFileCount(workspacePath: string): Promise<number | null> {
  const { stdout } = await execFileAsync('git', ['status', '--porcelain'], {
    cwd: workspacePath,
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: 1024 * 1024
  });
  const trimmed = stdout.trim();
  if (trimmed.length === 0) {
    return 0;
  }
  return trimmed.split('\n').length;
}

function sanitizePollMs(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_LOCAL_METRICS_POLL_MS;
  }
  return Math.max(MIN_LOCAL_METRICS_POLL_MS, Math.round(value));
}
