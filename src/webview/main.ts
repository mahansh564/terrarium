import Phaser from 'phaser';
import { clampMaxFps, MAX_FPS, TERRARIUM_DIMENSIONS } from '@shared/constants';
import type { ExtensionToWebviewMessage, WebviewToExtensionMessage } from '@shared/types';
import { BootScene } from './scenes/BootScene';
import { TerrariumScene } from './scenes/TerrariumScene';
import { getTerrariumState, initializeTerrariumState } from './state/context';

interface VsCodeApi {
  /**
   * Posts a message from webview to extension host.
   */
  postMessage(message: WebviewToExtensionMessage): void;
}

declare function acquireVsCodeApi<T = unknown>(): T;

const vscodeApi = acquireVsCodeApi<VsCodeApi>();
installCrashOverlay();

initializeTerrariumState((message) => {
  vscodeApi.postMessage(message);
});

window.addEventListener('message', (event: MessageEvent<ExtensionToWebviewMessage>) => {
  getTerrariumState().handleMessage(event.data);
});

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: TERRARIUM_DIMENSIONS.width,
  height: TERRARIUM_DIMENSIONS.height,
  backgroundColor: '#101619',
  pixelArt: true,
  fps: {
    target: MAX_FPS,
    limit: MAX_FPS,
    forceSetTimeOut: true
  },
  scene: [BootScene, TerrariumScene]
});

const state = getTerrariumState();
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
    const existing = document.getElementById('codeterrarium-error-overlay');
    if (existing !== null) {
      existing.textContent = message;
      return;
    }

    const overlay = document.createElement('pre');
    overlay.id = 'codeterrarium-error-overlay';
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
    showOverlay(`CodeTerrarium webview crashed:\n${detail}`);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const detail = event.reason instanceof Error ? event.reason.message : String(event.reason);
    showOverlay(`CodeTerrarium webview unhandled rejection:\n${detail}`);
  });
}
