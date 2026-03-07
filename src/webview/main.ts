import Phaser from 'phaser';
import { clampMaxFps, MAX_FPS, STATION_DIMENSIONS } from '@shared/constants';
import type { ExtensionToWebviewMessage, WebviewToExtensionMessage } from '@shared/types';
import { BootScene } from './scenes/BootScene';
import { StationScene } from './scenes/StationScene';
import { getStationState, initializeStationState } from './state/context';

interface VsCodeApi {
  /**
   * Posts a message from webview to extension host.
   */
  postMessage(message: WebviewToExtensionMessage): void;
}

declare function acquireVsCodeApi<T = unknown>(): T;

const vscodeApi = acquireVsCodeApi<VsCodeApi>();
installCrashOverlay();

initializeStationState((message) => {
  vscodeApi.postMessage(message);
});

window.addEventListener('message', (event: MessageEvent<ExtensionToWebviewMessage>) => {
  getStationState().handleMessage(event.data);
});

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: STATION_DIMENSIONS.width,
  height: STATION_DIMENSIONS.height,
  backgroundColor: '#101619',
  pixelArt: true,
  fps: {
    target: MAX_FPS,
    limit: MAX_FPS,
    forceSetTimeOut: true
  },
  scene: [BootScene, StationScene]
});

const state = getStationState();
const applyRuntimeFps = (): void => {
  const fps = clampMaxFps(state.getConfig().maxFps);
  game.loop.targetFps = fps;
  game.loop.fpsLimit = fps;
};

const unsubscribe = state.subscribe(() => {
  applyRuntimeFps();
});

window.addEventListener('beforeunload', () => {
  unsubscribe();
});

applyRuntimeFps();

vscodeApi.postMessage({ type: 'ready' });

function installCrashOverlay(): void {
  const showOverlay = (message: string): void => {
    const existing = document.getElementById('codeorbit-error-overlay');
    if (existing !== null) {
      existing.textContent = message;
      return;
    }

    const overlay = document.createElement('pre');
    overlay.id = 'codeorbit-error-overlay';
    overlay.textContent = message;
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.margin = '0';
    overlay.style.padding = '14px';
    overlay.style.whiteSpace = 'pre-wrap';
    overlay.style.background = '#1d2430';
    overlay.style.color = '#ffcece';
    overlay.style.fontFamily = 'monospace';
    overlay.style.fontSize = '12px';
    overlay.style.zIndex = '99999';
    document.body.appendChild(overlay);
  };

  window.addEventListener('error', (event) => {
    const detail =
      event.error instanceof Error
        ? `${event.error.message}\n${event.error.stack ?? ''}`
        : `${event.message} (${event.filename}:${event.lineno})`;
    showOverlay(`CodeOrbit webview crashed:\n${detail}`);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const detail = event.reason instanceof Error ? event.reason.message : String(event.reason);
    showOverlay(`CodeOrbit webview unhandled rejection:\n${detail}`);
  });
}
