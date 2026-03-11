import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  diffCursorComposerRecords,
  extractActiveAgentComposers,
  findWorkspaceStorageDirectory,
  parseFileUriPath,
  readWorkspaceFolderPathFromWorkspaceJson
} from '../src/extension/cursorComposerStorageSync';

describe('cursor composer storage sync helpers', () => {
  it('extracts active agent-mode composer records', () => {
    const raw = JSON.stringify({
      allComposers: [
        {
          composerId: 'agent-1',
          unifiedMode: 'agent',
          name: '  Checkout Fix  ',
          createdAt: 100,
          lastUpdatedAt: 120,
          hasBlockingPendingActions: true
        },
        { composerId: 'chat-1', unifiedMode: 'chat' },
        { composerId: 'archived-agent', unifiedMode: 'agent', isArchived: true },
        { composerId: 'agent-2', unifiedMode: 'agent' },
        { composerId: 'agent-3', unifiedMode: 'agent' },
        { composerId: '', unifiedMode: 'agent' }
      ],
      selectedComposerIds: ['agent-1', 'chat-1'],
      lastFocusedComposerIds: ['agent-2', 'chat-1']
    });

    expect(extractActiveAgentComposers(raw)).toEqual([
      {
        composerId: 'agent-1',
        unifiedMode: 'agent',
        name: 'Checkout Fix',
        createdAt: 100,
        lastUpdatedAt: 120,
        hasBlockingPendingActions: true
      },
      {
        composerId: 'agent-2',
        unifiedMode: 'agent'
      }
    ]);
  });

  it('includes agent composers that appear only in last-focused ids', () => {
    const raw = JSON.stringify({
      allComposers: [
        { composerId: 'agent-1', unifiedMode: 'agent' },
        { composerId: 'agent-2', unifiedMode: 'agent' }
      ],
      selectedComposerIds: ['agent-1'],
      lastFocusedComposerIds: ['agent-2']
    });

    expect(extractActiveAgentComposers(raw)).toEqual([
      { composerId: 'agent-1', unifiedMode: 'agent' },
      { composerId: 'agent-2', unifiedMode: 'agent' }
    ]);
  });

  it('includes draft agent composers even when they are not in selected/focused ids', () => {
    const raw = JSON.stringify({
      allComposers: [
        { composerId: 'selected-agent', unifiedMode: 'agent' },
        { composerId: 'draft-agent', unifiedMode: 'agent', isDraft: true },
        { composerId: 'hidden-agent', unifiedMode: 'agent' }
      ],
      selectedComposerIds: ['selected-agent'],
      lastFocusedComposerIds: []
    });

    expect(extractActiveAgentComposers(raw)).toEqual([
      { composerId: 'selected-agent', unifiedMode: 'agent' },
      { composerId: 'draft-agent', unifiedMode: 'agent' }
    ]);
  });

  it('falls back to non-archived agent composers when open ids are unavailable', () => {
    const raw = JSON.stringify({
      allComposers: [
        { composerId: 'agent-1', unifiedMode: 'agent' },
        { composerId: 'agent-2', unifiedMode: 'agent' }
      ]
    });

    expect(extractActiveAgentComposers(raw)).toEqual([
      { composerId: 'agent-1', unifiedMode: 'agent' },
      { composerId: 'agent-2', unifiedMode: 'agent' }
    ]);
  });

  it('falls back to non-archived agent composers when open ids are empty', () => {
    const raw = JSON.stringify({
      allComposers: [
        { composerId: 'agent-1', unifiedMode: 'agent' },
        { composerId: 'agent-2', unifiedMode: 'agent' }
      ],
      selectedComposerIds: [],
      lastFocusedComposerIds: []
    });

    expect(extractActiveAgentComposers(raw)).toEqual([
      { composerId: 'agent-1', unifiedMode: 'agent' },
      { composerId: 'agent-2', unifiedMode: 'agent' }
    ]);
  });

  it('returns empty set for invalid composer json', () => {
    expect(extractActiveAgentComposers('not-json')).toEqual([]);
  });

  it('diffs composer snapshots', () => {
    const previous = [
      { composerId: 'agent-1', unifiedMode: 'agent', name: 'Checkout Fix', lastUpdatedAt: 100 },
      { composerId: 'agent-2', unifiedMode: 'agent', hasBlockingPendingActions: true }
    ] as const;

    const next = [
      { composerId: 'agent-1', unifiedMode: 'agent', name: 'Checkout Flow Fix', lastUpdatedAt: 101 },
      { composerId: 'agent-3', unifiedMode: 'agent' }
    ] as const;

    expect(diffCursorComposerRecords(previous, next)).toEqual({
      added: [{ composerId: 'agent-3', unifiedMode: 'agent' }],
      updated: [
        { composerId: 'agent-1', unifiedMode: 'agent', name: 'Checkout Flow Fix', lastUpdatedAt: 101 }
      ],
      removed: [{ composerId: 'agent-2', unifiedMode: 'agent', hasBlockingPendingActions: true }]
    });
  });

  it('parses file URI paths', () => {
    expect(parseFileUriPath('file:///Users/test/My%20Project')).toContain('/Users/test/My Project');
    expect(parseFileUriPath('https://example.com')).toBeNull();
  });

  it('reads workspace folder path from workspace json', () => {
    const root = mkdtempSync(join(tmpdir(), 'codeorbit-ws-json-'));
    try {
      const workspaceJsonPath = join(root, 'workspace.json');
      writeFileSync(
        workspaceJsonPath,
        JSON.stringify({ folder: 'file:///Users/example/Desktop/My%20Repo' }),
        'utf8'
      );

      expect(readWorkspaceFolderPathFromWorkspaceJson(workspaceJsonPath)).toBe(
        '/Users/example/Desktop/My Repo'
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('finds matching workspace storage directory', () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'codeorbit-cursor-storage-'));
    try {
      const matchingDir = join(storageRoot, 'abc123');
      const otherDir = join(storageRoot, 'def456');
      mkdirSync(matchingDir, { recursive: true });
      mkdirSync(otherDir, { recursive: true });

      writeFileSync(
        join(matchingDir, 'workspace.json'),
        JSON.stringify({ folder: 'file:///Users/example/Desktop/Projects/orbit' }),
        'utf8'
      );
      writeFileSync(
        join(otherDir, 'workspace.json'),
        JSON.stringify({ folder: 'file:///Users/example/Desktop/Projects/other' }),
        'utf8'
      );

      expect(
        findWorkspaceStorageDirectory(storageRoot, '/Users/example/Desktop/Projects/orbit')
      ).toBe(matchingDir);
    } finally {
      rmSync(storageRoot, { recursive: true, force: true });
    }
  });
});
