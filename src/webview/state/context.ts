import type { WebviewToExtensionMessage } from '@shared/types';
import { StationState } from './StationState';

let stationState: StationState | null = null;

/**
 * Initializes singleton station state for the active webview runtime.
 *
 * @param postMessage Message callback used to notify extension host.
 * @returns Initialized state instance.
 */
export function initializeStationState(
  postMessage: (message: WebviewToExtensionMessage) => void
): StationState {
  stationState = new StationState(postMessage);
  return stationState;
}

/**
 * Returns current singleton station state instance.
 *
 * @returns Initialized station state.
 */
export function getStationState(): StationState {
  if (stationState === null) {
    throw new Error('Station state not initialized.');
  }

  return stationState;
}
