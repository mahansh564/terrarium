import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync, watch, type FSWatcher } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SQLITE3_COMMAND = 'sqlite3';
const SQLITE_TIMEOUT_MS = 1500;
const SQLITE_MAX_BUFFER_BYTES = 8 * 1024 * 1024;
const DB_CHANGE_DEBOUNCE_MS = 120;

/**
 * Active Cursor composer metadata used for runtime CodeOrbit agent overlays.
 */
export interface CursorComposerRecord {
  /** Stable Cursor composer identifier. */
  composerId: string;
  /** Cursor composer mode (agent/chat/etc). */
  unifiedMode: string;
  /** Optional Cursor-defined composer display name. */
  name?: string;
  /** Whether this composer is archived in Cursor. */
  isArchived?: boolean;
  /** Optional creation timestamp (epoch ms). */
  createdAt?: number;
  /** Optional last update timestamp (epoch ms). */
  lastUpdatedAt?: number;
  /** Whether Cursor indicates the composer is blocked pending user action. */
  hasBlockingPendingActions?: boolean;
}

/**
 * Callback payload emitted when active Cursor agent composers change.
 */
export interface CursorComposerStorageSyncEvent {
  /** Newly observed active agent-mode composers. */
  added: readonly CursorComposerRecord[];
  /** Existing active composers whose metadata changed. */
  updated: readonly CursorComposerRecord[];
  /** Active composers that were removed/archived/switched out of agent mode. */
  removed: readonly CursorComposerRecord[];
  /** Complete active agent-mode composer set after this sync pass. */
  all: readonly CursorComposerRecord[];
}

/**
 * Constructor options for Cursor workspace storage synchronization.
 */
export interface CursorComposerStorageSyncOptions {
  /** Absolute path of the currently open workspace folder. */
  workspaceFolderPath: string;
  /** Poll interval in milliseconds to supplement filesystem events. */
  pollMs: number;
  /** Callback fired when active Cursor composer state changes. */
  onComposerSync: (event: CursorComposerStorageSyncEvent) => void | Promise<void>;
  /** Optional error callback for non-fatal sync failures. */
  onError?: (error: Error) => void;
  /** Optional override for Cursor User/workspaceStorage root path. */
  storageRootOverride?: string;
}

/**
 * Watches Cursor workspace storage state and emits events for newly created agent composers.
 */
export class CursorComposerStorageSync {
  private readonly options: CursorComposerStorageSyncOptions;
  private readonly knownComposers = new Map<string, CursorComposerRecord>();
  private watcher: FSWatcher | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private dbPath: string | null = null;
  private checking = false;
  private pendingCheck = false;

  /**
   * Creates a new storage sync runtime.
   *
   * @param options Runtime options.
   */
  constructor(options: CursorComposerStorageSyncOptions) {
    this.options = options;
  }

  /**
   * Starts watching Cursor workspace storage for agent composer changes.
   */
  async start(): Promise<boolean> {
    try {
      const hasSqlite = await isSqlite3Available();
      if (!hasSqlite) {
        this.emitError(new Error('`sqlite3` is not available on PATH, skipping Cursor storage sync.'));
        return false;
      }

      const storageRoot =
        this.options.storageRootOverride ?? resolveCursorWorkspaceStorageRoot(process.platform);
      if (storageRoot === null || !existsSync(storageRoot)) {
        this.emitError(
          new Error('Could not locate Cursor workspace storage root for deep add-agent sync.')
        );
        return false;
      }

      const workspaceStorageDir = findWorkspaceStorageDirectory(
        storageRoot,
        this.options.workspaceFolderPath
      );
      if (workspaceStorageDir === null) {
        this.emitError(
          new Error(
            `Could not map workspace "${this.options.workspaceFolderPath}" to Cursor workspace storage.`
          )
        );
        return false;
      }

      const dbPath = join(workspaceStorageDir, 'state.vscdb');
      if (!existsSync(dbPath)) {
        this.emitError(new Error(`Cursor workspace storage DB is missing: ${dbPath}`));
        return false;
      }

      this.dbPath = dbPath;
      const initialComposers = await readActiveAgentComposers(dbPath);
      this.knownComposers.clear();
      for (const composer of initialComposers) {
        this.knownComposers.set(composer.composerId, composer);
      }
      await this.options.onComposerSync({
        added: initialComposers,
        updated: [],
        removed: [],
        all: initialComposers
      });

      this.watcher = watch(dirname(dbPath), (_eventType, filename) => {
        if (typeof filename !== 'string') {
          return;
        }

        if (!filename.startsWith('state.vscdb')) {
          return;
        }

        this.scheduleCheck();
      });

      this.pollTimer = setInterval(() => {
        this.scheduleCheck();
      }, this.options.pollMs);
      return true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.emitError(new Error(`Cursor storage sync failed to start: ${message}`));
      return false;
    }
  }

  /**
   * Stops all active watchers and timers.
   */
  dispose(): void {
    this.watcher?.close();
    this.watcher = null;

    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /**
   * Forces an immediate sync attempt instead of waiting for debounce/polling.
   */
  requestRefresh(): void {
    void this.checkForChanges();
  }

  private scheduleCheck(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      void this.checkForChanges();
    }, DB_CHANGE_DEBOUNCE_MS);
  }

  private async checkForChanges(): Promise<void> {
    if (this.dbPath === null) {
      return;
    }

    if (this.checking) {
      this.pendingCheck = true;
      return;
    }

    this.checking = true;
    try {
      const activeComposers = await readActiveAgentComposers(this.dbPath);
      const previousComposers = Array.from(this.knownComposers.values());
      const diff = diffCursorComposerRecords(previousComposers, activeComposers);
      const hasChanges = diff.added.length > 0 || diff.updated.length > 0 || diff.removed.length > 0;
      const shouldEmitHeartbeat = activeComposers.length > 0;
      if (hasChanges || shouldEmitHeartbeat) {
        this.knownComposers.clear();
        for (const composer of activeComposers) {
          this.knownComposers.set(composer.composerId, composer);
        }

        await this.options.onComposerSync({
          ...diff,
          all: activeComposers
        });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.emitError(new Error(`Cursor storage sync check failed: ${message}`));
    } finally {
      this.checking = false;
      if (this.pendingCheck) {
        this.pendingCheck = false;
        this.scheduleCheck();
      }
    }
  }

  private emitError(error: Error): void {
    this.options.onError?.(error);
  }
}

/**
 * Resolves Cursor `User/workspaceStorage` directory for the current platform.
 *
 * @param platform Node platform value.
 * @returns Absolute storage path, or null when home/appdata context is unavailable.
 */
export function resolveCursorWorkspaceStorageRoot(platform: NodeJS.Platform): string | null {
  const home = process.env.HOME;
  const appData = process.env.APPDATA;

  switch (platform) {
    case 'darwin':
      return home !== undefined
        ? join(home, 'Library', 'Application Support', 'Cursor', 'User', 'workspaceStorage')
        : null;
    case 'win32':
      return appData !== undefined
        ? join(appData, 'Cursor', 'User', 'workspaceStorage')
        : home !== undefined
          ? join(home, 'AppData', 'Roaming', 'Cursor', 'User', 'workspaceStorage')
          : null;
    default:
      return home !== undefined ? join(home, '.config', 'Cursor', 'User', 'workspaceStorage') : null;
  }
}

/**
 * Finds the Cursor workspace storage directory that corresponds to the given workspace path.
 *
 * @param storageRoot Cursor User/workspaceStorage root directory.
 * @param workspaceFolderPath Absolute workspace folder path.
 * @returns Matching workspace storage directory, or null when not found.
 */
export function findWorkspaceStorageDirectory(
  storageRoot: string,
  workspaceFolderPath: string
): string | null {
  const normalizedTarget = normalizePathForCompare(workspaceFolderPath);
  const entries = readdirSync(storageRoot, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const candidateDir = join(storageRoot, entry.name);
    const workspaceJsonPath = join(candidateDir, 'workspace.json');
    if (!existsSync(workspaceJsonPath)) {
      continue;
    }

    const candidateWorkspacePath = readWorkspaceFolderPathFromWorkspaceJson(workspaceJsonPath);
    if (candidateWorkspacePath === null) {
      continue;
    }

    if (normalizePathForCompare(candidateWorkspacePath) === normalizedTarget) {
      return candidateDir;
    }
  }

  return null;
}

/**
 * Parses Cursor workspace JSON and returns the folder path.
 *
 * @param workspaceJsonPath Absolute path to Cursor workspace.json.
 * @returns Workspace folder path or null if unavailable.
 */
export function readWorkspaceFolderPathFromWorkspaceJson(workspaceJsonPath: string): string | null {
  try {
    const raw = readFileSync(workspaceJsonPath, 'utf8');
    const parsed = JSON.parse(raw) as { folder?: unknown };
    if (typeof parsed.folder !== 'string') {
      return null;
    }

    return parseFileUriPath(parsed.folder);
  } catch {
    return null;
  }
}

/**
 * Parses a `file://` URI and returns a filesystem path.
 *
 * @param value Raw URI.
 * @returns Filesystem path, or null when URI is invalid/not a file URI.
 */
export function parseFileUriPath(value: string): string | null {
  try {
    if (!value.startsWith('file://')) {
      return null;
    }

    return fileURLToPath(value);
  } catch {
    return null;
  }
}

/**
 * Extracts active `unifiedMode: "agent"` composers from Cursor `composer.composerData` JSON.
 *
 * @param rawComposerData Raw JSON string from Cursor storage.
 * @returns Active agent-mode composer records keyed by composer id order of appearance.
 */
export function extractActiveAgentComposers(rawComposerData: string): CursorComposerRecord[] {
  const records = new Map<string, CursorComposerRecord>();

  try {
    const parsed = JSON.parse(rawComposerData) as {
      allComposers?: Array<{
        composerId?: unknown;
        unifiedMode?: unknown;
        name?: unknown;
        isArchived?: unknown;
        isDraft?: unknown;
        createdAt?: unknown;
        lastUpdatedAt?: unknown;
        hasBlockingPendingActions?: unknown;
      }>;
      selectedComposerIds?: unknown;
      lastFocusedComposerIds?: unknown;
    };
    const allComposers = Array.isArray(parsed.allComposers) ? parsed.allComposers : [];
    const openComposerIds = toOpenComposerIdSet(parsed);

    for (const composer of allComposers) {
      if (composer.unifiedMode !== 'agent' || composer.isArchived === true) {
        continue;
      }

      if (typeof composer.composerId !== 'string') {
        continue;
      }

      const composerId = composer.composerId.trim();
      if (composerId.length === 0) {
        continue;
      }

      const isDraft = composer.isDraft === true;
      // Cursor keeps historical sessions in allComposers; selected/focused ids and drafts represent active tabs.
      if (openComposerIds !== null && !openComposerIds.has(composerId) && !isDraft) {
        continue;
      }

      const name = typeof composer.name === 'string' ? composer.name.trim() : '';
      const createdAt = toOptionalEpochMs(composer.createdAt);
      const lastUpdatedAt = toOptionalEpochMs(composer.lastUpdatedAt);
      const hasBlockingPendingActions =
        typeof composer.hasBlockingPendingActions === 'boolean'
          ? composer.hasBlockingPendingActions
          : undefined;

      records.set(composerId, {
        composerId,
        unifiedMode: 'agent',
        ...(name.length > 0 ? { name } : {}),
        ...(createdAt !== undefined ? { createdAt } : {}),
        ...(lastUpdatedAt !== undefined ? { lastUpdatedAt } : {}),
        ...(hasBlockingPendingActions !== undefined ? { hasBlockingPendingActions } : {})
      });
    }
  } catch {
    return [];
  }

  return Array.from(records.values());
}

/**
 * Diffs two active-composer snapshots.
 *
 * @param previous Previous active snapshot.
 * @param next Next active snapshot.
 * @returns Added, updated, and removed composer records.
 */
export function diffCursorComposerRecords(
  previous: readonly CursorComposerRecord[],
  next: readonly CursorComposerRecord[]
): Pick<CursorComposerStorageSyncEvent, 'added' | 'updated' | 'removed'> {
  const previousById = new Map(previous.map((composer) => [composer.composerId, composer]));
  const nextById = new Map(next.map((composer) => [composer.composerId, composer]));

  const added: CursorComposerRecord[] = [];
  const updated: CursorComposerRecord[] = [];
  const removed: CursorComposerRecord[] = [];

  for (const composer of next) {
    const existing = previousById.get(composer.composerId);
    if (existing === undefined) {
      added.push(composer);
      continue;
    }

    if (!areComposerRecordsEquivalent(existing, composer)) {
      updated.push(composer);
    }
  }

  for (const composer of previous) {
    if (!nextById.has(composer.composerId)) {
      removed.push(composer);
    }
  }

  return { added, updated, removed };
}

async function readActiveAgentComposers(dbPath: string): Promise<CursorComposerRecord[]> {
  const sql = "SELECT value FROM ItemTable WHERE key='composer.composerData' LIMIT 1;";
  const output = await runSqlite(dbPath, sql);
  const raw = output.trim();
  if (raw.length === 0) {
    return [];
  }

  return extractActiveAgentComposers(raw);
}

async function isSqlite3Available(): Promise<boolean> {
  try {
    await runExecFile(SQLITE3_COMMAND, ['-version']);
    return true;
  } catch {
    return false;
  }
}

function normalizePathForCompare(value: string): string {
  const real = safeRealpath(value);
  const normalized = real.replace(/\/+$/, '');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function safeRealpath(value: string): string {
  try {
    return realpathSync.native(value);
  } catch {
    return value;
  }
}

function runSqlite(dbPath: string, sql: string): Promise<string> {
  return runExecFile(SQLITE3_COMMAND, [dbPath, sql]);
}

function toOptionalEpochMs(value: unknown): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.trunc(value);
}

function toComposerIdSet(value: unknown): Set<string> {
  const ids = new Set<string>();
  if (!Array.isArray(value)) {
    return ids;
  }

  for (const entry of value) {
    if (typeof entry !== 'string') {
      continue;
    }

    const trimmed = entry.trim();
    if (trimmed.length === 0) {
      continue;
    }

    ids.add(trimmed);
  }

  return ids;
}

function toOpenComposerIdSet(value: {
  selectedComposerIds?: unknown;
  lastFocusedComposerIds?: unknown;
}): Set<string> | null {
  const selectedIds = toComposerIdSet(value.selectedComposerIds);
  const lastFocusedIds = toComposerIdSet(value.lastFocusedComposerIds);

  if (selectedIds.size === 0 && lastFocusedIds.size === 0) {
    return null;
  }

  return new Set<string>([...selectedIds, ...lastFocusedIds]);
}

function areComposerRecordsEquivalent(
  left: CursorComposerRecord,
  right: CursorComposerRecord
): boolean {
  return (
    left.composerId === right.composerId &&
    left.unifiedMode === right.unifiedMode &&
    (left.name ?? '') === (right.name ?? '') &&
    (left.isArchived ?? false) === (right.isArchived ?? false) &&
    (left.createdAt ?? null) === (right.createdAt ?? null) &&
    (left.lastUpdatedAt ?? null) === (right.lastUpdatedAt ?? null) &&
    (left.hasBlockingPendingActions ?? false) === (right.hasBlockingPendingActions ?? false)
  );
}

function runExecFile(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        timeout: SQLITE_TIMEOUT_MS,
        maxBuffer: SQLITE_MAX_BUFFER_BYTES
      },
      (error, stdout, stderr) => {
        if (error !== null) {
          reject(error);
          return;
        }

        if (typeof stderr === 'string' && stderr.trim().length > 0) {
          reject(new Error(stderr.trim()));
          return;
        }

        resolve(stdout);
      }
    );
  });
}
