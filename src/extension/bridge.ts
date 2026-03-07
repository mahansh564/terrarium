import * as vscode from 'vscode';
import type {
  ExtensionToWebviewMessage,
  PersistedStatsFile,
  WebviewToExtensionMessage
} from '@shared/types';

/**
 * Runtime type guard for messages sent from extension to webview.
 *
 * @param message Unknown value to validate.
 * @returns True when payload matches an extension-to-webview message.
 */
export function isExtensionToWebviewMessage(
  message: unknown
): message is ExtensionToWebviewMessage {
  if (!isObject(message) || typeof message.type !== 'string') {
    return false;
  }

  switch (message.type) {
    case 'init':
    case 'agent_event':
    case 'agent_added':
    case 'state_sync':
    case 'health_signal':
      return 'payload' in message;
    case 'reset':
      return true;
    default:
      return false;
  }
}

/**
 * Runtime type guard for messages sent from webview to extension.
 *
 * @param message Unknown value to validate.
 * @returns True when payload matches a webview-to-extension message.
 */
export function isWebviewToExtensionMessage(
  message: unknown
): message is WebviewToExtensionMessage {
  if (!isObject(message) || typeof message.type !== 'string') {
    return false;
  }

  switch (message.type) {
    case 'ready':
    case 'open_add_agent':
      return true;
    case 'persist_state':
      return isPersistedStatsFile((message as { payload?: unknown }).payload);
    default:
      return false;
  }
}

/**
 * Typed bridge wrapper around VS Code webview messaging APIs.
 */
export class ExtensionWebviewBridge {
  private panel: vscode.WebviewPanel | null = null;

  /**
   * Attaches the active webview panel to this bridge.
   *
   * @param panel Active panel instance.
   */
  attachPanel(panel: vscode.WebviewPanel): void {
    this.panel = panel;
  }

  /**
   * Detaches the currently attached panel.
   */
  detachPanel(): void {
    this.panel = null;
  }

  /**
   * Registers a typed handler for incoming webview messages.
   *
   * @param handler Callback invoked for validated messages.
   * @returns Disposable subscription.
   */
  onMessage(handler: (message: WebviewToExtensionMessage) => void): vscode.Disposable {
    const panel = this.assertPanel();

    return panel.webview.onDidReceiveMessage((rawMessage: unknown) => {
      if (!isWebviewToExtensionMessage(rawMessage)) {
        return;
      }

      handler(rawMessage);
    });
  }

  /**
   * Sends a typed message to the attached webview panel.
   *
   * @param message Message payload to post.
   * @returns Promise resolving to true when message was posted.
   */
  async post(message: ExtensionToWebviewMessage): Promise<boolean> {
    const panel = this.assertPanel();
    return panel.webview.postMessage(message);
  }

  private assertPanel(): vscode.WebviewPanel {
    if (this.panel === null) {
      throw new Error('Webview panel is not attached to bridge.');
    }

    return this.panel;
  }
}

function isPersistedStatsFile(value: unknown): value is PersistedStatsFile {
  if (!isObject(value)) {
    return false;
  }

  if (value.version !== 2) {
    return false;
  }

  return isObject(value.crew);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
