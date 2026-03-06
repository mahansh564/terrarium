import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import {
  clampMaxFps,
  DEFAULT_TERRARIUM_CONFIG,
  PERSISTED_SCHEMA_VERSION
} from '@shared/constants';
import type {
  AgentAction,
  AgentConfig,
  ExtensionToWebviewMessage,
  HealthSignal,
  PersistedStatsFile,
  TerrariumConfig,
  WebviewToExtensionMessage
} from '@shared/types';
import { AgentWatcherManager } from './agentWatcher';
import { ExtensionWebviewBridge } from './bridge';
import { WorkspaceStatsStore } from './persistence';

const PANEL_VIEW_TYPE = 'codeterrarium.panel';

let activePanel: vscode.WebviewPanel | null = null;
type WebviewMessageProbe = (message: ExtensionToWebviewMessage) => void;
let testMessageProbe: WebviewMessageProbe | null = null;
let testMessageDispatcher: ((message: WebviewToExtensionMessage) => Promise<void>) | null = null;

/**
 * Extension API returned from activation for integration testing.
 */
export interface CodeTerrariumExtensionApi {
  /** Registers a temporary observer for extension-to-webview messages. */
  __setWebviewMessageProbeForTest: (probe: WebviewMessageProbe | null) => void;
  /** Dispatches a webview message into the extension message handler. */
  __dispatchWebviewMessageForTest: (message: WebviewToExtensionMessage) => Promise<void>;
  /** Indicates whether the terrarium panel is currently open. */
  __isPanelOpenForTest: () => boolean;
  /** Invokes extension deactivation hook for lifecycle tests. */
  __deactivateForTest: () => void;
}

/**
 * Extension activation entrypoint.
 *
 * @param context VS Code extension activation context.
 */
export async function activate(context: vscode.ExtensionContext): Promise<CodeTerrariumExtensionApi> {
  const bridge = new ExtensionWebviewBridge();
  const statsStore = new WorkspaceStatsStore(context);
  let persistedState = await statsStore.load();
  let messageSubscription: vscode.Disposable | null = null;

  const watcher = new AgentWatcherManager(
    (event) => {
      void postIfPanelOpen(bridge, {
        type: 'agent_event',
        payload: event
      });

      const signal = toHealthSignal(event.kind, event.agentId, event.ts);
      if (signal !== null) {
        void postIfPanelOpen(bridge, {
          type: 'health_signal',
          payload: signal
        });
      }
    },
    (error) => {
      void vscode.window.showWarningMessage(`CodeTerrarium watcher warning: ${error.message}`);
    }
  );

  const handleMessage = async (message: WebviewToExtensionMessage): Promise<void> => {
    switch (message.type) {
      case 'ready': {
        await postIfPanelOpen(bridge, {
          type: 'init',
          payload: {
            config: readTerrariumConfig(),
            persisted: persistedState
          }
        });
        break;
      }
      case 'persist_state': {
        persistedState = message.payload;
        statsStore.saveDebounced(message.payload);
        break;
      }
      case 'open_add_agent': {
        await vscode.commands.executeCommand('codeterrarium.addAgent');
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

    const panel = vscode.window.createWebviewPanel(PANEL_VIEW_TYPE, 'CodeTerrarium', vscode.ViewColumn.Beside, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')]
    });

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
    watcher.updateAgents(readAgentConfigs());
  };

  reloadWatchers();

  context.subscriptions.push(
    watcher,
    vscode.commands.registerCommand('codeterrarium.open', () => {
      openPanel();
    }),
    vscode.commands.registerCommand('codeterrarium.addAgent', async () => {
      const addedAgent = await addAgentConfiguration();
      if (addedAgent === null) {
        return;
      }

      reloadWatchers();
      await postIfPanelOpen(bridge, { type: 'agent_added', payload: addedAgent });
    }),
    vscode.commands.registerCommand('codeterrarium.resetEcosystem', async () => {
      persistedState = {
        version: PERSISTED_SCHEMA_VERSION,
        creatures: {}
      };

      await statsStore.reset();
      await postIfPanelOpen(bridge, { type: 'reset' });
      await postIfPanelOpen(bridge, { type: 'state_sync', payload: persistedState });
      void vscode.window.showInformationMessage('CodeTerrarium ecosystem has been reset.');
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      const agentsChanged = event.affectsConfiguration('codeterrarium.agents');
      const runtimeChanged =
        event.affectsConfiguration('codeterrarium.maxFps') ||
        event.affectsConfiguration('codeterrarium.weatherEnabled');

      if (!agentsChanged && !runtimeChanged) {
        return;
      }

      if (agentsChanged) {
        reloadWatchers();
      }

      void postIfPanelOpen(bridge, {
        type: 'init',
        payload: {
          config: readTerrariumConfig(),
          persisted: persistedState
        }
      });
    }),
    {
      dispose: () => {
        messageSubscription?.dispose();
        watcher.dispose();
        testMessageDispatcher = null;
        testMessageProbe = null;
        void statsStore.dispose();
      }
    }
  );

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
 * Indicates whether the terrarium panel is currently open.
 *
 * @returns True when a panel is open.
 */
export function __isPanelOpenForTest(): boolean {
  return activePanel !== null;
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
  <title>CodeTerrarium</title>
  <style>
    html, body, #app {
      margin: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #101619;
    }
  </style>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function readTerrariumConfig(): TerrariumConfig {
  const settings = vscode.workspace.getConfiguration('codeterrarium');

  return {
    maxFps: clampMaxFps(settings.get<number>('maxFps', DEFAULT_TERRARIUM_CONFIG.maxFps)),
    agents: readAgentConfigs(),
    weatherEnabled: settings.get<boolean>('weatherEnabled', DEFAULT_TERRARIUM_CONFIG.weatherEnabled)
  };
}

function readAgentConfigs(): AgentConfig[] {
  const settings = vscode.workspace.getConfiguration('codeterrarium');
  const rawAgents = settings.get<unknown[]>('agents', []);

  return rawAgents
    .flatMap((entry): AgentConfig[] => {
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
      const creatureType = normalizeCreatureType(record.creatureType);
      const color = typeof record.color === 'string' ? record.color : undefined;

      if (id.length === 0 || transcriptPath.length === 0 || creatureType === null) {
        return [];
      }

      return [
        {
          id,
          name,
          ...(sourceAdapter !== undefined ? { sourceAdapter } : {}),
          transcriptPath,
          creatureType,
          ...(color !== undefined ? { color } : {})
        }
      ];
    });
}

async function addAgentConfiguration(): Promise<AgentConfig | null> {
  const name = await vscode.window.showInputBox({
    title: 'CodeTerrarium: Agent Name',
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

  const pickedCreatureType = await vscode.window.showQuickPick(['fox', 'otter', 'slime', 'bird'], {
    title: 'Choose Creature Type',
    canPickMany: false,
    ignoreFocusOut: true
  });

  if (pickedCreatureType === undefined) {
    return null;
  }

  const creatureType = normalizeCreatureType(pickedCreatureType);
  if (creatureType === null) {
    return null;
  }

  const normalizedName = name.trim();
  const newAgent: AgentConfig = {
    id: slugify(normalizedName),
    name: normalizedName,
    transcriptPath: pathUri.fsPath,
    creatureType
  };

  const settings = vscode.workspace.getConfiguration('codeterrarium');
  const existingAgents = readAgentConfigs();
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
    default:
      return null;
  }
}

function normalizeCreatureType(value: unknown): AgentConfig['creatureType'] | null {
  if (value === 'fox' || value === 'otter' || value === 'slime' || value === 'bird') {
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
