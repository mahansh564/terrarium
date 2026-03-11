import { randomUUID } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import {
  clampLocalMetricsPollMs,
  clampMaxFps,
  DEFAULT_STATION_CONFIG,
  DEFAULT_LOCAL_METRICS_POLL_MS,
  normalizeSimulationSpeed,
  PERSISTED_SCHEMA_VERSION
} from '@shared/constants';
import type {
  AgentAction,
  AgentConfig,
  AgentEvent,
  ExtensionToWebviewMessage,
  HealthSignal,
  ProjectMetricsSnapshot,
  PersistedStatsFile,
  StationConfig,
  WebviewToExtensionMessage
} from '@shared/types';
import { ActionCenterTracker } from './actionCenter';
import { AgentWatcherManager } from './agentWatcher';
import { ExtensionWebviewBridge } from './bridge';
import {
  CommandCooldownGate,
  type CursorNativeAddAgentBridgeConfig,
  DEFAULT_CURSOR_NATIVE_ADD_AGENT_COMMAND_IDS,
  DEFAULT_CURSOR_NATIVE_ADD_AGENT_COOLDOWN_MS,
  DEFAULT_CURSOR_STORAGE_FALLBACK_POLL_MS,
  isCursorHost,
  isCursorNativeAddAgentCommand,
  normalizeCursorCommandIds,
  normalizeCursorCooldownMs,
  normalizeCursorStorageFallbackPollMs
} from './cursorNativeBridge';
import {
  CursorComposerStorageSync,
  type CursorComposerRecord
} from './cursorComposerStorageSync';
import { overlayPendingInputRequestsOnPersistedState } from './initState';
import { synthesizeCursorRuntimeComposerEvents } from './cursorRuntimeEvents';
import { mergeRuntimeCursorAgents, resolveVisibleCursorAgentIdentity } from './cursorRuntimeAgents';
import { LocalProjectMetricsMonitor } from './localMetrics';
import { MissionTracker } from './missions';
import { WorkspaceStatsStore } from './persistence';

const PANEL_VIEW_TYPE = 'codeorbit.panel';

let activePanel: vscode.WebviewPanel | null = null;
type WebviewMessageProbe = (message: ExtensionToWebviewMessage) => void;
let testMessageProbe: WebviewMessageProbe | null = null;
let testMessageDispatcher: ((message: WebviewToExtensionMessage) => Promise<void>) | null = null;

interface CommandExecutionEvent {
  command: string;
  arguments?: readonly unknown[];
}

interface CommandsWithExecutionEvents {
  onDidExecuteCommand(
    listener: (event: CommandExecutionEvent) => void,
    thisArgs?: unknown,
    disposables?: vscode.Disposable[]
  ): vscode.Disposable;
}

interface LocalMetricsConfig {
  enabled: boolean;
  pollMs: number;
}

/**
 * Extension API returned from activation for integration testing.
 */
export interface CodeOrbitExtensionApi {
  /** Registers a temporary observer for extension-to-webview messages. */
  __setWebviewMessageProbeForTest: (probe: WebviewMessageProbe | null) => void;
  /** Dispatches a webview message into the extension message handler. */
  __dispatchWebviewMessageForTest: (message: WebviewToExtensionMessage) => Promise<void>;
  /** Indicates whether the station panel is currently open. */
  __isPanelOpenForTest: () => boolean;
  /** Invokes extension deactivation hook for lifecycle tests. */
  __deactivateForTest: () => void;
}

/**
 * Extension activation entrypoint.
 *
 * @param context VS Code extension activation context.
 */
export async function activate(context: vscode.ExtensionContext): Promise<CodeOrbitExtensionApi> {
  const bridge = new ExtensionWebviewBridge();
  const statsStore = new WorkspaceStatsStore(context);
  let persistedState = await statsStore.load();
  let cursorBridgeConfig = readCursorNativeAddAgentBridgeConfig();
  let cursorBridgeGate = new CommandCooldownGate(cursorBridgeConfig.cooldownMs);
  let cursorStorageSync: CursorComposerStorageSync | null = null;
  let cursorRuntimeComposers: readonly CursorComposerRecord[] = [];
  let cursorStorageSyncGeneration = 0;
  let lastStorageSyncWarningAt = Number.NEGATIVE_INFINITY;
  let lastLocalMetricsWarningAt = Number.NEGATIVE_INFINITY;
  let messageSubscription: vscode.Disposable | null = null;
  const actionCenterTracker = new ActionCenterTracker();
  const missionTracker = new MissionTracker();
  let localMetricsConfig = readLocalMetricsConfig();
  let projectMetrics: ProjectMetricsSnapshot = createEmptyProjectMetricsSnapshot();
  let localMetricsMonitor: LocalProjectMetricsMonitor | null = null;
  let localMetricsWorkspacePath: string | null = null;

  const postActionCenterSync = async (): Promise<void> => {
    await postIfPanelOpen(bridge, {
      type: 'action_center_sync',
      payload: actionCenterTracker.snapshot()
    });
  };

  const postMissionSync = async (): Promise<void> => {
    await postIfPanelOpen(bridge, {
      type: 'mission_sync',
      payload: missionTracker.snapshot()
    });
  };

  const postProjectMetrics = async (): Promise<void> => {
    await postIfPanelOpen(bridge, {
      type: 'project_metrics',
      payload: projectMetrics
    });
  };

  const showLocalMetricsWarning = (message: string): void => {
    const now = Date.now();
    if (now - lastLocalMetricsWarningAt < 30_000) {
      return;
    }
    lastLocalMetricsWarningAt = now;
    void vscode.window.showWarningMessage(`CodeOrbit local metrics warning: ${message}`);
  };

  const refreshLocalMetricsMonitor = (): void => {
    localMetricsConfig = readLocalMetricsConfig();
    const workspacePath = getPrimaryWorkspaceFolderPath();
    if (!localMetricsConfig.enabled || workspacePath === null) {
      localMetricsMonitor?.stop();
      localMetricsMonitor = null;
      localMetricsWorkspacePath = null;
      projectMetrics = {
        ...projectMetrics,
        ts: Date.now(),
        dirtyFileCount: null
      };
      void postProjectMetrics();
      return;
    }

    if (localMetricsMonitor === null || localMetricsWorkspacePath !== workspacePath) {
      localMetricsMonitor?.stop();
      localMetricsMonitor = new LocalProjectMetricsMonitor({
        workspacePath,
        pollMs: localMetricsConfig.pollMs,
        onSnapshot: (snapshot) => {
          projectMetrics = snapshot;
          void postProjectMetrics();
        },
        onError: (error) => {
          showLocalMetricsWarning(error.message);
        }
      });
      localMetricsWorkspacePath = workspacePath;
      localMetricsMonitor.start();
      return;
    }

    localMetricsMonitor.setPollMs(localMetricsConfig.pollMs);
  };

  const publishAgentEvent = (event: AgentEvent): void => {
    localMetricsMonitor?.applyAgentEvent(event);

    const actionCenterChanged = actionCenterTracker.applyEvent(event);
    const missionChanged = missionTracker.applyEvent(event);

    void postIfPanelOpen(bridge, {
      type: 'agent_event',
      payload: event
    });

    if (actionCenterChanged) {
      void postActionCenterSync();
    }

    if (missionChanged) {
      void postMissionSync();
    }

    const signal = toHealthSignal(event.kind, event.agentId, event.ts);
    if (signal !== null) {
      void postIfPanelOpen(bridge, {
        type: 'health_signal',
        payload: signal
      });
    }
  };

  const watcher = new AgentWatcherManager(
    (event) => {
      publishAgentEvent(event);
    },
    (error) => {
      void vscode.window.showWarningMessage(`CodeOrbit watcher warning: ${error.message}`);
    }
  );

  const resolveRuntimeAgentConfigs = (): AgentConfig[] =>
    withRuntimeCursorAgents(readAgentConfigs(), {
      bridgeEnabled: cursorBridgeConfig.enabled,
      cursorHost: isCursorHost(vscode.env.appName),
      workspaceFolderPath: getPrimaryWorkspaceFolderPath(),
      runtimeComposers: cursorRuntimeComposers
    });

  const postCurrentInit = async (): Promise<void> => {
    const config = readStationConfig(resolveRuntimeAgentConfigs());
    const persisted = overlayPendingInputRequestsOnPersistedState({
      persisted: persistedState,
      configuredAgents: config.agents,
      pendingRequests: actionCenterTracker.snapshot()
    });

    await postIfPanelOpen(bridge, {
      type: 'init',
      payload: {
        config,
        persisted
      }
    });
    await postActionCenterSync();
    await postMissionSync();
    await postProjectMetrics();
  };

  const applyRuntimePreferenceUpdates = async (payload: {
    stationEffectsEnabled?: boolean;
    audioEnabled?: boolean;
    simulationSpeed?: number;
  }): Promise<void> => {
    const settings = vscode.workspace.getConfiguration('codeorbit');
    const updates: Thenable<void>[] = [];

    if (payload.stationEffectsEnabled !== undefined) {
      updates.push(
        settings.update(
          'stationEffectsEnabled',
          payload.stationEffectsEnabled,
          vscode.ConfigurationTarget.Workspace
        )
      );
    }

    if (payload.audioEnabled !== undefined) {
      updates.push(
        settings.update('audioEnabled', payload.audioEnabled, vscode.ConfigurationTarget.Workspace)
      );
    }

    if (payload.simulationSpeed !== undefined) {
      updates.push(
        settings.update(
          'simulationSpeed',
          payload.simulationSpeed,
          vscode.ConfigurationTarget.Workspace
        )
      );
    }

    if (updates.length > 0) {
      await Promise.all(updates);
    }
  };

  const handleMessage = async (message: WebviewToExtensionMessage): Promise<void> => {
    switch (message.type) {
      case 'ready': {
        await postCurrentInit();
        break;
      }
      case 'persist_state': {
        persistedState = message.payload;
        statsStore.saveDebounced(message.payload);
        break;
      }
      case 'open_add_agent': {
        await vscode.commands.executeCommand('codeorbit.addAgent');
        break;
      }
      case 'update_runtime_preferences': {
        await applyRuntimePreferenceUpdates(message.payload);
        break;
      }
      default:
        break;
    }
  };
  testMessageDispatcher = handleMessage;

  const openPanel = (): vscode.WebviewPanel => {
    if (activePanel !== null) {
      activePanel.reveal(vscode.ViewColumn.Beside, true);
      return activePanel;
    }

    const panel = vscode.window.createWebviewPanel(
      PANEL_VIEW_TYPE,
      'CodeOrbit: Station',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')]
      }
    );

    panel.webview.html = createWebviewHtml(panel.webview, context.extensionUri);
    bridge.attachPanel(panel);

    messageSubscription = bridge.onMessage((message) => {
      void handleMessage(message);
    });

    panel.onDidDispose(() => {
      bridge.detachPanel();
      messageSubscription?.dispose();
      messageSubscription = null;
      activePanel = null;
    });

    activePanel = panel;
    panel.reveal(vscode.ViewColumn.Beside, true);
    return panel;
  };

  const reloadWatchers = (): void => {
    watcher.updateAgents(resolveRuntimeAgentConfigs());
  };

  const updateCursorRuntimeComposers = (composers: readonly CursorComposerRecord[]): void => {
    cursorRuntimeComposers = composers;
    reloadWatchers();
    void postCurrentInit();
  };

  const clearCursorRuntimeComposers = (): void => {
    if (cursorRuntimeComposers.length === 0) {
      return;
    }

    updateCursorRuntimeComposers([]);
  };

  const handleCursorNativeAddAgentCommand = async (commandId: string): Promise<void> => {
    if (!cursorBridgeConfig.enabled) {
      return;
    }

    if (!isCursorHost(vscode.env.appName)) {
      return;
    }

    if (!isCursorNativeAddAgentCommand(commandId, cursorBridgeConfig.commandIds)) {
      return;
    }

    if (!cursorBridgeGate.shouldAccept()) {
      return;
    }

    if (cursorStorageSync !== null) {
      cursorStorageSync.requestRefresh();
      return;
    }

    await refreshCursorStorageSync();
  };

  const showStorageSyncWarning = (message: string): void => {
    const now = Date.now();
    if (now - lastStorageSyncWarningAt < 30000) {
      return;
    }

    lastStorageSyncWarningAt = now;
    void vscode.window.showWarningMessage(`CodeOrbit Cursor sync warning: ${message}`);
  };

  const refreshCursorStorageSync = async (): Promise<void> => {
    const generation = ++cursorStorageSyncGeneration;
    cursorStorageSync?.dispose();
    cursorStorageSync = null;

    if (!cursorBridgeConfig.enabled || !cursorBridgeConfig.storageFallbackEnabled) {
      clearCursorRuntimeComposers();
      return;
    }

    if (!isCursorHost(vscode.env.appName)) {
      clearCursorRuntimeComposers();
      return;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder === undefined || workspaceFolder.uri.scheme !== 'file') {
      clearCursorRuntimeComposers();
      return;
    }

    const runtime = new CursorComposerStorageSync({
      workspaceFolderPath: workspaceFolder.uri.fsPath,
      pollMs: cursorBridgeConfig.storageFallbackPollMs,
      onComposerSync: async (event) => {
        if (generation !== cursorStorageSyncGeneration) {
          return;
        }

        const configuredAgents = readAgentConfigs();
        const transcriptRootPath = resolveCursorProjectTranscriptPath(workspaceFolder.uri.fsPath);
        const syntheticEvents = synthesizeCursorRuntimeComposerEvents({
          previousComposers: cursorRuntimeComposers,
          addedComposers: event.added,
          updatedComposers: event.updated,
          ...(transcriptRootPath !== null
            ? {
                resolveAgentIdentity: (composer: CursorComposerRecord) =>
                  resolveVisibleCursorAgentIdentity(configuredAgents, transcriptRootPath, composer)
              }
            : {})
        });
        updateCursorRuntimeComposers(event.all);
        for (const syntheticEvent of syntheticEvents) {
          publishAgentEvent(syntheticEvent);
        }
      },
      onError: (error) => {
        showStorageSyncWarning(error.message);
      }
    });

    const started = await runtime.start();
    if (generation !== cursorStorageSyncGeneration) {
      runtime.dispose();
      return;
    }

    if (!started) {
      clearCursorRuntimeComposers();
      return;
    }

    cursorStorageSync = runtime;
  };

  reloadWatchers();
  refreshLocalMetricsMonitor();
  await refreshCursorStorageSync();

  const commandNamespace = vscode.commands;
  const cursorCommandListener = hasCommandExecutionEvents(commandNamespace)
    ? commandNamespace.onDidExecuteCommand((event: CommandExecutionEvent) => {
        void handleCursorNativeAddAgentCommand(event.command).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          void vscode.window.showWarningMessage(
            `CodeOrbit could not sync Cursor agent action: ${message}`
          );
        });
      })
    : null;

  context.subscriptions.push(
    watcher,
    vscode.commands.registerCommand('codeorbit.open', () => {
      openPanel();
    }),
    vscode.commands.registerCommand('codeorbit.addAgent', async () => {
      const addedAgent = await addAgentConfiguration();
      if (addedAgent === null) {
        return;
      }

      reloadWatchers();
      await postIfPanelOpen(bridge, { type: 'agent_added', payload: addedAgent });
    }),
    vscode.commands.registerCommand('codeorbit.resetEcosystem', async () => {
      persistedState = {
        version: PERSISTED_SCHEMA_VERSION,
        crew: {}
      };
      actionCenterTracker.reset();
      missionTracker.reset();

      await statsStore.reset();
      await postIfPanelOpen(bridge, { type: 'reset' });
      await postIfPanelOpen(bridge, { type: 'state_sync', payload: persistedState });
      await postActionCenterSync();
      await postMissionSync();
      void vscode.window.showInformationMessage('CodeOrbit station has been reset.');
    }),
    vscode.commands.registerCommand('codeorbit.toggleStationEffects', async () => {
      const settings = vscode.workspace.getConfiguration('codeorbit');
      const current = settings.get<boolean>(
        'stationEffectsEnabled',
        DEFAULT_STATION_CONFIG.stationEffectsEnabled
      );
      await settings.update(
        'stationEffectsEnabled',
        !current,
        vscode.ConfigurationTarget.Workspace
      );
    }),
    vscode.commands.registerCommand('codeorbit.toggleAudio', async () => {
      const settings = vscode.workspace.getConfiguration('codeorbit');
      const current = settings.get<boolean>('audioEnabled', DEFAULT_STATION_CONFIG.audioEnabled);
      await settings.update('audioEnabled', !current, vscode.ConfigurationTarget.Workspace);
    }),
    vscode.commands.registerCommand('codeorbit.cycleSimulationSpeed', async () => {
      const settings = vscode.workspace.getConfiguration('codeorbit');
      const current = settings.get<number>(
        'simulationSpeed',
        DEFAULT_STATION_CONFIG.simulationSpeed
      );
      const options = [0.75, 1, 1.25];
      const currentIndex = options.indexOf(current ?? 1);
      const next = options[(currentIndex + 1 + options.length) % options.length] ?? 1;
      await settings.update('simulationSpeed', next, vscode.ConfigurationTarget.Workspace);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      const agentsChanged = event.affectsConfiguration('codeorbit.agents');
      const runtimeChanged =
        event.affectsConfiguration('codeorbit.maxFps') ||
        event.affectsConfiguration('codeorbit.stationEffectsEnabled') ||
        event.affectsConfiguration('codeorbit.audioEnabled') ||
        event.affectsConfiguration('codeorbit.simulationSpeed');
      const localMetricsChanged =
        event.affectsConfiguration('codeorbit.localMetrics.enabled') ||
        event.affectsConfiguration('codeorbit.localMetrics.pollMs');
      const cursorBridgeChanged =
        event.affectsConfiguration('codeorbit.cursorNativeAddAgentBridge.enabled') ||
        event.affectsConfiguration('codeorbit.cursorNativeAddAgentBridge.commandIds') ||
        event.affectsConfiguration('codeorbit.cursorNativeAddAgentBridge.cooldownMs') ||
        event.affectsConfiguration('codeorbit.cursorNativeAddAgentBridge.storageFallbackEnabled') ||
        event.affectsConfiguration('codeorbit.cursorNativeAddAgentBridge.storageFallbackPollMs');

      if (!agentsChanged && !runtimeChanged && !cursorBridgeChanged && !localMetricsChanged) {
        return;
      }

      if (agentsChanged) {
        reloadWatchers();
      }

      if (cursorBridgeChanged) {
        cursorBridgeConfig = readCursorNativeAddAgentBridgeConfig();
        cursorBridgeGate = new CommandCooldownGate(cursorBridgeConfig.cooldownMs);
        void refreshCursorStorageSync();
        reloadWatchers();
      }

      if (localMetricsChanged) {
        refreshLocalMetricsMonitor();
      }

      if (agentsChanged || runtimeChanged || cursorBridgeChanged || localMetricsChanged) {
        void postCurrentInit();
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void refreshCursorStorageSync();
      refreshLocalMetricsMonitor();
      reloadWatchers();
      void postCurrentInit();
    }),
    {
      dispose: () => {
        messageSubscription?.dispose();
        watcher.dispose();
        cursorStorageSync?.dispose();
        cursorStorageSync = null;
        localMetricsMonitor?.stop();
        localMetricsMonitor = null;
        localMetricsWorkspacePath = null;
        cursorStorageSyncGeneration += 1;
        testMessageDispatcher = null;
        testMessageProbe = null;
        void statsStore.dispose();
      }
    }
  );

  if (cursorCommandListener !== null) {
    context.subscriptions.push(cursorCommandListener);
  }

  return {
    __setWebviewMessageProbeForTest,
    __dispatchWebviewMessageForTest,
    __isPanelOpenForTest,
    __deactivateForTest: deactivate
  };
}

/**
 * Extension deactivation hook.
 */
export function deactivate(): void {
  if (activePanel !== null) {
    activePanel.dispose();
    activePanel = null;
  }

  testMessageDispatcher = null;
  testMessageProbe = null;
}

/**
 * Registers a temporary observer for extension-to-webview messages in integration tests.
 *
 * @param probe Observer callback, or null to clear.
 */
export function __setWebviewMessageProbeForTest(probe: WebviewMessageProbe | null): void {
  testMessageProbe = probe;
}

/**
 * Dispatches a webview message into the extension message handler during integration tests.
 *
 * @param message Webview-to-extension message payload.
 */
export async function __dispatchWebviewMessageForTest(
  message: WebviewToExtensionMessage
): Promise<void> {
  if (testMessageDispatcher === null) {
    throw new Error('Extension test dispatcher is not initialized. Activate the extension first.');
  }

  await testMessageDispatcher(message);
}

/**
 * Indicates whether the station panel is currently open.
 *
 * @returns True when a panel is open.
 */
export function __isPanelOpenForTest(): boolean {
  return activePanel !== null;
}

function hasCommandExecutionEvents(
  commands: typeof vscode.commands
): commands is typeof vscode.commands & CommandsWithExecutionEvents {
  return 'onDidExecuteCommand' in commands;
}

function createWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = randomUUID().replace(/-/g, '');
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'main.js'));
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} data:`,
    `script-src 'nonce-${nonce}'`,
    `style-src ${webview.cspSource} 'unsafe-inline'`
  ].join('; ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <title>CodeOrbit</title>
  <style>
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background:
        radial-gradient(circle at 16% 14%, rgba(121, 140, 255, 0.22) 0, rgba(121, 140, 255, 0) 36%),
        radial-gradient(circle at 80% 80%, rgba(116, 235, 255, 0.18) 0, rgba(116, 235, 255, 0) 30%),
        linear-gradient(180deg, #020329 0%, #030544 52%, #050b5e 100%);
    }

    body {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    #app {
      width: 100%;
      height: 100%;
      position: relative;
    }

    #app::before {
      content: '';
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 2;
      background:
        repeating-linear-gradient(180deg, rgba(206, 225, 255, 0.1) 0, rgba(206, 225, 255, 0.1) 1px, transparent 1px, transparent 3px),
        radial-gradient(circle at 15% 30%, rgba(235, 242, 255, 0.55) 0, rgba(235, 242, 255, 0) 2px),
        radial-gradient(circle at 68% 18%, rgba(175, 246, 255, 0.45) 0, rgba(175, 246, 255, 0) 2px),
        radial-gradient(circle at 88% 46%, rgba(255, 248, 192, 0.38) 0, rgba(255, 248, 192, 0) 2px);
      background-size: auto, auto, auto, auto;
      mix-blend-mode: screen;
      opacity: 0.18;
    }

    #app canvas {
      position: relative;
      z-index: 1;
      image-rendering: pixelated;
      image-rendering: crisp-edges;
      box-shadow: 0 0 0 2px rgba(145, 175, 255, 0.4), 0 0 36px rgba(110, 143, 255, 0.3), inset 0 0 0 2px rgba(225, 237, 255, 0.24);
    }
  </style>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function readStationConfig(agents = readAgentConfigs()): StationConfig {
  const settings = vscode.workspace.getConfiguration('codeorbit');

  return {
    maxFps: clampMaxFps(settings.get<number>('maxFps', DEFAULT_STATION_CONFIG.maxFps)),
    agents,
    stationEffectsEnabled: settings.get<boolean>(
      'stationEffectsEnabled',
      DEFAULT_STATION_CONFIG.stationEffectsEnabled
    ),
    audioEnabled: settings.get<boolean>('audioEnabled', DEFAULT_STATION_CONFIG.audioEnabled),
    simulationSpeed: normalizeSimulationSpeed(
      settings.get<number>('simulationSpeed', DEFAULT_STATION_CONFIG.simulationSpeed)
    )
  };
}

function readLocalMetricsConfig(): LocalMetricsConfig {
  const settings = vscode.workspace.getConfiguration('codeorbit');
  return {
    enabled: settings.get<boolean>('localMetrics.enabled', true),
    pollMs: clampLocalMetricsPollMs(
      settings.get<unknown>('localMetrics.pollMs', DEFAULT_LOCAL_METRICS_POLL_MS)
    )
  };
}

function createEmptyProjectMetricsSnapshot(): ProjectMetricsSnapshot {
  return {
    ts: Date.now(),
    dirtyFileCount: null,
    lastTestPassAt: null,
    lastTestFailAt: null,
    failureStreak: 0
  };
}

function readCursorNativeAddAgentBridgeConfig(): CursorNativeAddAgentBridgeConfig {
  const settings = vscode.workspace.getConfiguration('codeorbit');
  return {
    enabled: settings.get<boolean>('cursorNativeAddAgentBridge.enabled', true),
    commandIds: normalizeCursorCommandIds(
      settings.get<unknown>(
        'cursorNativeAddAgentBridge.commandIds',
        DEFAULT_CURSOR_NATIVE_ADD_AGENT_COMMAND_IDS
      ),
      DEFAULT_CURSOR_NATIVE_ADD_AGENT_COMMAND_IDS
    ),
    cooldownMs: normalizeCursorCooldownMs(
      settings.get<unknown>(
        'cursorNativeAddAgentBridge.cooldownMs',
        DEFAULT_CURSOR_NATIVE_ADD_AGENT_COOLDOWN_MS
      )
    ),
    storageFallbackEnabled: settings.get<boolean>(
      'cursorNativeAddAgentBridge.storageFallbackEnabled',
      true
    ),
    storageFallbackPollMs: normalizeCursorStorageFallbackPollMs(
      settings.get<unknown>(
        'cursorNativeAddAgentBridge.storageFallbackPollMs',
        DEFAULT_CURSOR_STORAGE_FALLBACK_POLL_MS
      )
    )
  };
}

function readAgentConfigs(): AgentConfig[] {
  const settings = vscode.workspace.getConfiguration('codeorbit');
  const rawAgents = settings.get<unknown[]>('agents', []);

  return rawAgents.flatMap((entry): AgentConfig[] => {
    if (typeof entry !== 'object' || entry === null) {
      return [];
    }

    const record = entry as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id : '';
    const name = typeof record.name === 'string' ? record.name : id;
    const sourceAdapter =
      typeof record.sourceAdapter === 'string' && record.sourceAdapter.trim().length > 0
        ? record.sourceAdapter.trim().toLowerCase()
        : undefined;
    const transcriptPath = typeof record.transcriptPath === 'string' ? record.transcriptPath : '';
    const crewRole = normalizeCrewRole(record.crewRole);
    const color = typeof record.color === 'string' ? record.color : undefined;

    if (id.length === 0 || transcriptPath.length === 0 || crewRole === null) {
      return [];
    }

    return [
      {
        id,
        name,
        ...(sourceAdapter !== undefined ? { sourceAdapter } : {}),
        transcriptPath,
        crewRole,
        ...(color !== undefined ? { color } : {})
      }
    ];
  });
}

interface CursorRuntimeAgentOptions {
  /** Whether Cursor bridging is enabled in settings. */
  bridgeEnabled: boolean;
  /** Whether the current host is Cursor. */
  cursorHost: boolean;
  /** Current primary workspace folder path when available. */
  workspaceFolderPath: string | null;
  /** Active Cursor composers mirrored from workspace storage sync. */
  runtimeComposers: readonly CursorComposerRecord[];
}

function withRuntimeCursorAgents(
  agents: AgentConfig[],
  options: CursorRuntimeAgentOptions
): AgentConfig[] {
  if (!options.bridgeEnabled || !options.cursorHost || options.workspaceFolderPath === null) {
    return agents;
  }

  const transcriptRootPath = resolveCursorProjectTranscriptPath(options.workspaceFolderPath);
  if (transcriptRootPath === null) {
    return agents;
  }

  return mergeRuntimeCursorAgents(agents, transcriptRootPath, options.runtimeComposers);
}

function getPrimaryWorkspaceFolderPath(): string | null {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (workspaceFolder === undefined || workspaceFolder.uri.scheme !== 'file') {
    return null;
  }

  return workspaceFolder.uri.fsPath;
}

function resolveCursorProjectTranscriptPath(workspaceFolderPath: string): string | null {
  const home = process.env.HOME;
  if (home === undefined) {
    return null;
  }

  const projectsRoot = join(home, '.cursor', 'projects');
  if (!isExistingDirectory(projectsRoot)) {
    return null;
  }

  const projectDirectory = join(projectsRoot, cursorProjectNameFromWorkspacePath(workspaceFolderPath));
  if (!isExistingDirectory(projectDirectory)) {
    return null;
  }

  const transcriptsDirectory = join(projectDirectory, 'agent-transcripts');
  return normalizePathForCompare(transcriptsDirectory);
}

function cursorProjectNameFromWorkspacePath(workspaceFolderPath: string): string {
  return workspaceFolderPath
    .replace(/^[a-z]:/i, '')
    .replace(/[\\/]+/g, '-')
    .replace(/[^a-z0-9-]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isExistingDirectory(pathValue: string): boolean {
  if (!existsSync(pathValue)) {
    return false;
  }

  try {
    return statSync(pathValue).isDirectory();
  } catch {
    return false;
  }
}

function normalizePathForCompare(pathValue: string): string {
  return process.platform === 'win32' ? pathValue.toLowerCase() : pathValue;
}

async function addAgentConfiguration(): Promise<AgentConfig | null> {
  const existingAgents = readAgentConfigs();
  const name = await vscode.window.showInputBox({
    title: 'CodeOrbit: Agent Name',
    prompt: 'Enter a display name for the agent',
    ignoreFocusOut: true,
    validateInput: (value) => (value.trim().length > 0 ? undefined : 'Name is required.')
  });

  if (name === undefined) {
    return null;
  }

  const selectedPath = await vscode.window.showOpenDialog({
    title: 'Select Transcript File or Directory',
    canSelectFiles: true,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'Use Transcript Path'
  });

  const pathUri = selectedPath?.[0];
  if (pathUri === undefined) {
    return null;
  }

  const pickedCrewRole = await vscode.window.showQuickPick(
    ['engineer', 'pilot', 'analyst', 'security'],
    {
      title: 'Choose Crew Role',
      canPickMany: false,
      ignoreFocusOut: true
    }
  );

  if (pickedCrewRole === undefined) {
    return null;
  }

  const crewRole = normalizeCrewRole(pickedCrewRole);
  if (crewRole === null) {
    return null;
  }

  const normalizedName = name.trim();
  const newAgent: AgentConfig = {
    id: slugify(normalizedName),
    name: normalizedName,
    transcriptPath: pathUri.fsPath,
    crewRole
  };

  const settings = vscode.workspace.getConfiguration('codeorbit');
  const nextAgents = [...existingAgents.filter((agent) => agent.id !== newAgent.id), newAgent];

  await settings.update('agents', nextAgents, vscode.ConfigurationTarget.Workspace);
  return newAgent;
}

async function postIfPanelOpen(
  bridge: ExtensionWebviewBridge,
  message: ExtensionToWebviewMessage
): Promise<void> {
  if (activePanel === null) {
    return;
  }

  testMessageProbe?.(message);
  await bridge.post(message);
}

function toHealthSignal(action: AgentAction, agentId: string, ts: number): HealthSignal | null {
  switch (action) {
    case 'test_fail':
      return { type: 'negative', source: action, agentId, ts };
    case 'error':
      return { type: 'critical', source: action, agentId, ts };
    case 'test_pass':
      return { type: 'positive', source: action, agentId, ts };
    case 'complete':
    case 'deploy':
      return { type: 'milestone', source: action, agentId, ts };
    case 'test_run':
      return { type: 'neutral', source: action, agentId, ts };
    case 'input_request':
    case 'read':
    case 'write':
    case 'terminal':
    case 'idle':
    default:
      return null;
  }
}

function normalizeCrewRole(value: unknown): AgentConfig['crewRole'] | null {
  if (value === 'engineer' || value === 'pilot' || value === 'analyst' || value === 'security') {
    return value;
  }

  return null;
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug.length > 0 ? slug : `agent-${randomUUID().slice(0, 8)}`;
}
