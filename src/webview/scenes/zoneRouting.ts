import { STATION_DIMENSIONS } from '@shared/constants';
import type { CrewState, StationZone } from '@shared/types';

const CREW_MOVEMENT_BOUNDS = {
  minX: 28,
  maxX: STATION_DIMENSIONS.width - 28,
  minY: 104,
  maxY: STATION_DIMENSIONS.height - 36
} as const;

const ZONE_TARGETS: Readonly<Record<StationZone, { x: number; y: number }>> = {
  console_bay: { x: 224, y: 186 },
  module_bay: { x: 732, y: 364 },
  dock: { x: 132, y: 430 },
  diagnostics: { x: 808, y: 178 },
  central_hub: { x: 480, y: 294 },
  patrol: { x: 480, y: 240 }
};

/**
 * Resolves a zone-intent destination for a crew state.
 *
 * @param state Crew finite-state-machine value.
 * @returns Station movement zone.
 */
export function zoneForCrewState(state: CrewState): StationZone {
  switch (state) {
    case 'scanning':
      return 'console_bay';
    case 'repairing':
      return 'module_bay';
    case 'docked':
      return 'dock';
    case 'alert':
    case 'damaged':
    case 'requesting_input':
      return 'diagnostics';
    case 'celebrating':
      return 'central_hub';
    case 'standby':
    default:
      return 'patrol';
  }
}

/**
 * Computes a deterministic zone target for one agent.
 *
 * @param agentId Agent id used for deterministic jitter.
 * @param zone Station zone.
 * @returns In-bounds target coordinate.
 */
export function zoneTarget(agentId: string, zone: StationZone): { x: number; y: number } {
  const base = ZONE_TARGETS[zone];
  const hash = hashString(`${agentId}:${zone}`);
  const jitterX = ((hash % 35) - 17) * 1.6;
  const jitterY = ((Math.floor(hash / 7) % 35) - 17) * 1.1;
  return {
    x: clamp(base.x + jitterX, CREW_MOVEMENT_BOUNDS.minX, CREW_MOVEMENT_BOUNDS.maxX),
    y: clamp(base.y + jitterY, CREW_MOVEMENT_BOUNDS.minY, CREW_MOVEMENT_BOUNDS.maxY)
  };
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }

  return Math.abs(hash);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
