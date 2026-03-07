import type { AgentConfig } from '@shared/types';
import { JsonlSourceAdapter, JSONL_SOURCE_ADAPTER_ID } from './jsonlAdapter';
import type { AgentSourceAdapter } from './types';

/**
 * Resolved adapter metadata for one agent.
 */
export interface ResolvedSourceAdapter {
  /** Resolved adapter id. */
  adapterId: string;
  /** Adapter implementation used by watcher manager. */
  adapter: AgentSourceAdapter;
}

/**
 * Registry that resolves configured source adapter ids to implementations.
 */
export class AgentSourceAdapterRegistry {
  private readonly adapters = new Map<string, AgentSourceAdapter>();

  /**
   * Creates a registry with optional additional adapters.
   *
   * @param adapters Additional or overriding adapters.
   */
  constructor(adapters: AgentSourceAdapter[] = []) {
    this.register(new JsonlSourceAdapter());
    for (const adapter of adapters) {
      this.register(adapter);
    }
  }

  /**
   * Registers an adapter implementation by id.
   *
   * @param adapter Adapter implementation.
   */
  register(adapter: AgentSourceAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  /**
   * Resolves the adapter for an agent, with fallback to built-in JSONL adapter.
   *
   * @param agent Agent configuration.
   * @param onError Optional callback for unknown adapter warnings.
   * @returns Resolved adapter and id.
   */
  resolve(agent: AgentConfig, onError?: (error: Error) => void): ResolvedSourceAdapter {
    const requestedId = normalizeAdapterId(agent.sourceAdapter) ?? JSONL_SOURCE_ADAPTER_ID;
    const requestedAdapter = this.adapters.get(requestedId);

    if (requestedAdapter !== undefined) {
      return {
        adapterId: requestedId,
        adapter: requestedAdapter
      };
    }

    const fallbackAdapter = this.adapters.get(JSONL_SOURCE_ADAPTER_ID);
    if (fallbackAdapter === undefined) {
      throw new Error(`Built-in source adapter "${JSONL_SOURCE_ADAPTER_ID}" is not registered.`);
    }

    onError?.(
      new Error(
        `CodeOrbit source adapter "${requestedId}" is not registered for agent "${agent.id}". Falling back to "${JSONL_SOURCE_ADAPTER_ID}".`
      )
    );

    return {
      adapterId: JSONL_SOURCE_ADAPTER_ID,
      adapter: fallbackAdapter
    };
  }
}

function normalizeAdapterId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}
