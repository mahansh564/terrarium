import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import * as vscode from 'vscode';
import {
  DEFAULT_PERSISTED_CREW_STATE,
  PERSIST_DEBOUNCE_MS,
  PERSISTED_SCHEMA_VERSION
} from '@shared/constants';
import type { PersistedCrewState, PersistedStatsFile } from '@shared/types';

/**
 * Handles workspace-local persistence for crew stats.
 */
export class WorkspaceStatsStore {
  private readonly statsFilePath: string;
  private debounceHandle: NodeJS.Timeout | null = null;
  private pendingState: PersistedStatsFile | null = null;

  /**
   * Creates a persistence store bound to the active workspace.
   *
   * @param context Extension context for fallback storage path.
   */
  constructor(context: vscode.ExtensionContext) {
    const rootPath = resolveWorkspaceRootPath(context);
    this.statsFilePath = join(rootPath, '.codeorbit', 'stats.json');
  }

  /**
   * Loads persisted crew stats from workspace storage.
   *
   * @returns Persisted stats payload or an empty baseline object.
   */
  async load(): Promise<PersistedStatsFile> {
    try {
      const fileContent = await readFile(this.statsFilePath, 'utf8');
      const parsed = JSON.parse(fileContent) as unknown;
      return sanitizePersistedStatsFile(parsed);
    } catch {
      return emptyPersistedStatsFile();
    }
  }

  /**
   * Queues a debounced persistence write.
   *
   * @param state State snapshot to persist.
   */
  saveDebounced(state: PersistedStatsFile): void {
    this.pendingState = sanitizePersistedStatsFile(state);

    if (this.debounceHandle !== null) {
      clearTimeout(this.debounceHandle);
    }

    this.debounceHandle = setTimeout(() => {
      const latestState = this.pendingState;
      this.pendingState = null;
      this.debounceHandle = null;
      if (latestState !== null) {
        void this.saveImmediate(latestState);
      }
    }, PERSIST_DEBOUNCE_MS);
  }

  /**
   * Forces an immediate write to disk.
   *
   * @param state State snapshot to persist.
   */
  async saveImmediate(state: PersistedStatsFile): Promise<void> {
    const sanitized = sanitizePersistedStatsFile(state);
    const parentDir = dirname(this.statsFilePath);
    await mkdir(parentDir, { recursive: true });

    const tempFilePath = `${this.statsFilePath}.tmp`;
    await writeFile(tempFilePath, `${JSON.stringify(sanitized, null, 2)}\n`, 'utf8');
    await rename(tempFilePath, this.statsFilePath);
  }

  /**
   * Removes persisted stats file from workspace storage.
   */
  async reset(): Promise<void> {
    if (this.debounceHandle !== null) {
      clearTimeout(this.debounceHandle);
      this.debounceHandle = null;
    }

    this.pendingState = null;
    await rm(this.statsFilePath, { force: true });
  }

  /**
   * Flushes pending debounced writes before disposal.
   */
  async dispose(): Promise<void> {
    if (this.debounceHandle !== null) {
      clearTimeout(this.debounceHandle);
      this.debounceHandle = null;
    }

    if (this.pendingState !== null) {
      const stateToSave = this.pendingState;
      this.pendingState = null;
      await this.saveImmediate(stateToSave);
    }
  }
}

/**
 * Sanitizes untrusted persisted JSON into a strongly typed structure.
 *
 * @param value Untrusted parsed JSON value.
 * @returns Valid persisted stats file payload.
 */
export function sanitizePersistedStatsFile(value: unknown): PersistedStatsFile {
  if (typeof value !== 'object' || value === null) {
    return emptyPersistedStatsFile();
  }

  const record = value as Record<string, unknown>;
  const rawCrew =
    typeof record.crew === 'object' && record.crew !== null
      ? (record.crew as Record<string, unknown>)
      : {};

  const crew: Record<string, PersistedCrewState> = {};

  for (const [agentId, crewRaw] of Object.entries(rawCrew)) {
    crew[agentId] = sanitizePersistedCrewState(crewRaw);
  }

  return {
    version: PERSISTED_SCHEMA_VERSION,
    crew
  };
}

function sanitizePersistedCrewState(value: unknown): PersistedCrewState {
  if (typeof value !== 'object' || value === null) {
    return { ...DEFAULT_PERSISTED_CREW_STATE, updatedAt: Date.now() };
  }

  const record = value as Record<string, unknown>;
  const moodRaw = typeof record.mood === 'number' ? record.mood : DEFAULT_PERSISTED_CREW_STATE.mood;
  const stateRaw = typeof record.lastState === 'string' ? record.lastState : 'standby';

  return {
    xp: typeof record.xp === 'number' && Number.isFinite(record.xp) ? Math.max(0, record.xp) : 0,
    level:
      typeof record.level === 'number' && Number.isFinite(record.level)
        ? Math.max(1, Math.trunc(record.level))
        : 1,
    mood: Number.isFinite(moodRaw) ? Math.max(-100, Math.min(100, moodRaw)) : 0,
    lastState: isCrewState(stateRaw) ? stateRaw : 'standby',
    updatedAt:
      typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
        ? Math.trunc(record.updatedAt)
        : Date.now()
  };
}

function isCrewState(value: string): value is PersistedCrewState['lastState'] {
  return [
    'standby',
    'scanning',
    'repairing',
    'docked',
    'alert',
    'celebrating',
    'damaged',
    'requesting_input'
  ].includes(value);
}

function emptyPersistedStatsFile(): PersistedStatsFile {
  return {
    version: PERSISTED_SCHEMA_VERSION,
    crew: {}
  };
}

function resolveWorkspaceRootPath(context: vscode.ExtensionContext): string {
  const firstWorkspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (firstWorkspaceFolder !== undefined) {
    return firstWorkspaceFolder.uri.fsPath;
  }

  return context.globalStorageUri.fsPath;
}
