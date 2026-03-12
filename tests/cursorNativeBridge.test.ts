import { describe, expect, it } from 'vitest';
import {
  CommandCooldownGate,
  DEFAULT_CURSOR_NATIVE_ADD_AGENT_COMMAND_IDS,
  isCursorHost,
  isCursorNativeAddAgentCommand,
  normalizeCursorCommandIds,
  normalizeCursorStorageFallbackPollMs
} from '../src/extension/cursorNativeBridge';

describe('cursor native add-agent bridge helpers', () => {
  it('detects Cursor host names', () => {
    expect(isCursorHost('Cursor')).toBe(true);
    expect(isCursorHost('Cursor - Insiders')).toBe(true);
    expect(isCursorHost('Visual Studio Code')).toBe(false);
  });

  it('matches configured Cursor native command ids', () => {
    expect(
      isCursorNativeAddAgentCommand(
        'composer.newAgentChat',
        DEFAULT_CURSOR_NATIVE_ADD_AGENT_COMMAND_IDS
      )
    ).toBe(true);
    expect(
      isCursorNativeAddAgentCommand('workbench.action.quickOpen', [
        'composer.newAgentChat',
        'glass.newAgent'
      ])
    ).toBe(false);
  });

  it('normalizes and deduplicates command ids', () => {
    expect(
      normalizeCursorCommandIds(['  composer.newAgentChat  ', '', 1, 'glass.newAgent'], [
        'fallback.command'
      ])
    ).toEqual(['composer.newAgentChat', 'glass.newAgent']);

    expect(normalizeCursorCommandIds([], ['fallback.command'])).toEqual(['fallback.command']);
  });

  it('applies cooldown to suppress duplicate triggers', () => {
    const gate = new CommandCooldownGate(1000);

    expect(gate.shouldAccept(0)).toBe(true);
    expect(gate.shouldAccept(500)).toBe(false);
    expect(gate.shouldAccept(1000)).toBe(true);
    expect(gate.shouldAccept(1200)).toBe(false);
    expect(gate.shouldAccept(2500)).toBe(true);
  });

  it('enforces minimum cooldown', () => {
    const gate = new CommandCooldownGate(0);

    expect(gate.shouldAccept(100)).toBe(true);
    expect(gate.shouldAccept(300)).toBe(false);
    expect(gate.shouldAccept(351)).toBe(true);
  });

  it('normalizes storage fallback poll values', () => {
    expect(normalizeCursorStorageFallbackPollMs(undefined)).toBe(1000);
    expect(normalizeCursorStorageFallbackPollMs(200)).toBe(500);
    expect(normalizeCursorStorageFallbackPollMs(1600.2)).toBe(1600);
  });
});
