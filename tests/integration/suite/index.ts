import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { ExtensionToWebviewMessage, WebviewToExtensionMessage } from '../../../src/shared/types';

const EXTENSION_ID = 'anshulmahajan.codeterrarium';
const WAIT_TIMEOUT_MS = 8_000;
const POLL_INTERVAL_MS = 50;

interface CodeTerrariumTestExports {
  __dispatchWebviewMessageForTest: (message: WebviewToExtensionMessage) => Promise<void>;
  __setWebviewMessageProbeForTest: (
    probe: ((message: ExtensionToWebviewMessage) => void) | null
  ) => void;
  __isPanelOpenForTest: () => boolean;
  __deactivateForTest: () => void;
}

/**
 * Entry point executed by VS Code integration test host.
 */
export async function run(): Promise<void> {
  try {
    const extension = await activateExtension();
    const exports = asTestExports(extension.exports);
    const observedMessages: ExtensionToWebviewMessage[] = [];

    exports.__setWebviewMessageProbeForTest((message) => {
      observedMessages.push(message);
    });

    try {
      await testLifecycle(extension, exports);
      await testWebviewMessaging(exports, observedMessages);
    } finally {
      exports.__setWebviewMessageProbeForTest(null);
      exports.__deactivateForTest();
      await waitFor(
        () => exports.__isPanelOpenForTest() === false,
        'Terrarium panel should close when extension deactivates.'
      );
    }
  } catch (error: unknown) {
    console.error('CodeTerrarium integration suite failed.', error);
    throw error;
  }
}

async function activateExtension(): Promise<vscode.Extension<unknown>> {
  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  assert.ok(extension, `Expected extension ${EXTENSION_ID} to be installed for integration tests.`);

  assert.equal(
    extension.isActive,
    false,
    'Extension should activate lazily (inactive before command execution).'
  );

  await vscode.commands.executeCommand('codeterrarium.open');
  await waitFor(
    () => extension.isActive,
    'Extension did not activate after executing codeterrarium.open.'
  );

  return extension;
}

async function testLifecycle(
  extension: vscode.Extension<unknown>,
  exports: CodeTerrariumTestExports
): Promise<void> {
  const commands = await vscode.commands.getCommands(true);
  assert.ok(commands.includes('codeterrarium.open'), 'Expected open command to be registered.');
  assert.ok(commands.includes('codeterrarium.addAgent'), 'Expected addAgent command to be registered.');
  assert.ok(
    commands.includes('codeterrarium.resetEcosystem'),
    'Expected resetEcosystem command to be registered.'
  );

  assert.equal(extension.isActive, true, 'Extension should stay active after initial command.');
  assert.equal(exports.__isPanelOpenForTest(), true, 'Terrarium panel should be open after command.');
}

async function testWebviewMessaging(
  exports: CodeTerrariumTestExports,
  observedMessages: ExtensionToWebviewMessage[]
): Promise<void> {
  const beforeReady = observedMessages.length;
  await exports.__dispatchWebviewMessageForTest({ type: 'ready' });

  const initMessage = await waitForMessage(
    observedMessages,
    beforeReady,
    (message): message is Extract<ExtensionToWebviewMessage, { type: 'init' }> =>
      message.type === 'init',
    'Expected an init message in response to ready.'
  );

  assert.equal(
    initMessage.payload.persisted.version,
    1,
    'Persisted payload should include supported schema version.'
  );
  assert.equal(
    typeof initMessage.payload.config.maxFps,
    'number',
    'Init config should include maxFps.'
  );
  assert.equal(
    typeof initMessage.payload.config.weatherEnabled,
    'boolean',
    'Init config should include weatherEnabled.'
  );

  const beforeReset = observedMessages.length;
  await vscode.commands.executeCommand('codeterrarium.resetEcosystem');

  await waitFor(
    () =>
      observedMessages
        .slice(beforeReset)
        .some((message): message is Extract<ExtensionToWebviewMessage, { type: 'reset' }> =>
          message.type === 'reset'
        ),
    'Expected reset message after resetEcosystem command.'
  );

  const stateSync = await waitForMessage(
    observedMessages,
    beforeReset,
    (message): message is Extract<ExtensionToWebviewMessage, { type: 'state_sync' }> =>
      message.type === 'state_sync',
    'Expected state_sync message after resetEcosystem command.'
  );

  assert.deepEqual(
    stateSync.payload,
    { version: 1, creatures: {} },
    'Reset should sync empty persisted creature state.'
  );
}

async function waitFor(
  predicate: () => boolean,
  timeoutMessage: string,
  timeoutMs = WAIT_TIMEOUT_MS
): Promise<void> {
  const start = Date.now();

  while (Date.now() - start <= timeoutMs) {
    if (predicate()) {
      return;
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(timeoutMessage);
}

async function waitForMessage<TMessage extends ExtensionToWebviewMessage>(
  messages: ExtensionToWebviewMessage[],
  fromIndex: number,
  predicate: (message: ExtensionToWebviewMessage) => message is TMessage,
  timeoutMessage: string
): Promise<TMessage> {
  let matchedMessage: TMessage | null = null;

  await waitFor(() => {
    matchedMessage = messages.slice(fromIndex).find(predicate) ?? null;
    return matchedMessage !== null;
  }, timeoutMessage);

  if (matchedMessage === null) {
    throw new Error(timeoutMessage);
  }

  return matchedMessage;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function asTestExports(value: unknown): CodeTerrariumTestExports {
  assert.ok(isObject(value), 'Expected extension exports to be an object.');

  const exports = value as Partial<CodeTerrariumTestExports>;
  assert.equal(
    typeof exports.__dispatchWebviewMessageForTest,
    'function',
    'Missing __dispatchWebviewMessageForTest export.'
  );
  assert.equal(
    typeof exports.__setWebviewMessageProbeForTest,
    'function',
    'Missing __setWebviewMessageProbeForTest export.'
  );
  assert.equal(typeof exports.__isPanelOpenForTest, 'function', 'Missing __isPanelOpenForTest export.');
  assert.equal(typeof exports.__deactivateForTest, 'function', 'Missing __deactivateForTest export.');

  return exports as CodeTerrariumTestExports;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
