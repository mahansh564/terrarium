import { STATION_DIMENSIONS } from '@shared/constants';
import type { AgentConfig, PersistedCrewState } from '@shared/types';
import { CrewUnit } from './CrewUnit';

/**
 * Factory options for creating crew entities.
 */
export interface CreateCrewOptions {
  /** Agent represented by this crew unit. */
  agent: AgentConfig;
  /** Index of agent among total active agents. */
  index: number;
  /** Total number of active agents. */
  total: number;
  /** Persisted state to hydrate into crew entity. */
  persisted: PersistedCrewState;
}

/**
 * Spawns crew units with deterministic positions and texture selection.
 */
export class CrewFactory {
  /**
   * Creates one crew unit instance for a configured agent.
   *
   * @param scene Scene that owns the entity.
   * @param options Spawn options.
   * @returns Spawned crew unit instance.
   */
  create(scene: Phaser.Scene, options: CreateCrewOptions): CrewUnit {
    const spawn = this.computeSpawn(options.agent.id, options.index, options.total);
    const textureKey = `crew-${options.agent.crewRole}`;

    return new CrewUnit(scene, options.agent, spawn.x, spawn.y, textureKey, options.persisted);
  }

  /**
   * Computes deterministic spawn coordinates.
   *
   * @param agentId Agent id used for deterministic distribution.
   * @param index Index among active agents.
   * @param total Total active agents.
   * @returns Spawn position.
   */
  computeSpawn(agentId: string, index: number, total: number): { x: number; y: number } {
    const hash = hashString(agentId);
    const segmentWidth = STATION_DIMENSIONS.width / Math.max(total, 1);
    const baseX = segmentWidth * index + segmentWidth / 2;
    const xJitter = (hash % 41) - 20;
    const yBase = STATION_DIMENSIONS.height * 0.72;
    const yJitter = (hash % 27) - 13;

    return {
      x: clamp(baseX + xJitter, 48, STATION_DIMENSIONS.width - 48),
      y: clamp(yBase + yJitter, 220, STATION_DIMENSIONS.height - 52)
    };
  }
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }

  return Math.abs(hash);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
