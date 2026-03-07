import { appendFile, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import type { AgentEvent } from '../src/shared/types';
import { AgentWatcherManager } from '../src/extension/agentWatcher';

const activeWatchers: AgentWatcherManager[] = [];

afterEach(() => {
  for (const watcher of activeWatchers.splice(0)) {
    watcher.dispose();
  }
});

describe('AgentWatcherManager', () => {
  it('streams appended JSONL lines', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'codeorbit-'));
    const transcript = join(dir, 'agent.jsonl');
    await writeFile(transcript, '', 'utf8');

    const events: AgentEvent[] = [];

    const watcher = new AgentWatcherManager((event) => {
      events.push(event);
    });

    activeWatchers.push(watcher);

    watcher.updateAgents([
      {
        id: 'codex',
        name: 'Codex',
        transcriptPath: transcript,
        crewRole: 'engineer'
      }
    ]);

    await appendFile(
      transcript,
      `${JSON.stringify({ ts: Date.now(), agentId: 'codex', action: 'write', path: 'a.ts' })}\n`,
      'utf8'
    );

    await waitFor(() => events.length === 1, 3000);

    expect(events[0]?.kind).toBe('write');
    expect(events[0]?.agentId).toBe('codex');
  });
});

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();

  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Timed out waiting for condition.');
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 25);
    });
  }
}
