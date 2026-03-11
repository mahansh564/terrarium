import { describe, expect, it } from 'vitest';
import {
  isExtensionToWebviewMessage,
  isWebviewToExtensionMessage
} from '../src/extension/bridge';

describe('bridge type guards', () => {
  it('accepts valid extension->webview messages', () => {
    expect(
      isExtensionToWebviewMessage({
        type: 'agent_event',
        payload: {
          kind: 'write',
          ts: Date.now(),
          agentId: 'codex'
        }
      })
    ).toBe(true);
  });

  it('rejects invalid extension->webview messages', () => {
    expect(isExtensionToWebviewMessage({ type: 'agent_event' })).toBe(false);
    expect(isExtensionToWebviewMessage({ type: 'unknown' })).toBe(false);
  });

  it('accepts valid webview->extension messages', () => {
    expect(isWebviewToExtensionMessage({ type: 'ready' })).toBe(true);
    expect(isWebviewToExtensionMessage({ type: 'open_add_agent' })).toBe(true);
    expect(
      isWebviewToExtensionMessage({
        type: 'update_runtime_preferences',
        payload: {
          stationEffectsEnabled: false,
          simulationSpeed: 1.25
        }
      })
    ).toBe(true);
    expect(
      isWebviewToExtensionMessage({
        type: 'persist_state',
        payload: {
          version: 2,
          crew: {
            codex: {
              xp: 1,
              level: 1,
              mood: 0,
              lastState: 'standby',
              updatedAt: Date.now()
            }
          }
        }
      })
    ).toBe(true);
  });

  it('rejects invalid webview->extension messages', () => {
    expect(isWebviewToExtensionMessage({ type: 'persist_state', payload: {} })).toBe(false);
    expect(isWebviewToExtensionMessage({ type: 'foo' })).toBe(false);
  });
});
