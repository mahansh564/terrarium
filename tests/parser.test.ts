import { describe, expect, it } from 'vitest';
import { normalizeAction, parseAgentEventLine, parseTimestamp } from '../src/extension/parser';

describe('parser', () => {
  it('parses valid write event', () => {
    const line = JSON.stringify({
      ts: 1710000000000,
      agentId: 'codex',
      action: 'write',
      path: 'src/main.ts',
      bytesWritten: 120
    });

    const parsed = parseAgentEventLine(line);
    expect(parsed).not.toBeNull();
    expect(parsed?.kind).toBe('write');
    expect(parsed?.agentId).toBe('codex');
    expect(parsed?.ts).toBe(1710000000000);

    if (parsed?.kind === 'write') {
      expect(parsed.path).toBe('src/main.ts');
      expect(parsed.bytesWritten).toBe(120);
    }
  });

  it('returns null for malformed json', () => {
    const parsed = parseAgentEventLine('{bad-json');
    expect(parsed).toBeNull();
  });

  it('returns null for unknown action', () => {
    const line = JSON.stringify({ ts: Date.now(), agentId: 'codex', action: 'unknown' });
    const parsed = parseAgentEventLine(line);
    expect(parsed).toBeNull();
  });

  it('normalizes action variants', () => {
    expect(normalizeAction('Writing')).toBe('write');
    expect(normalizeAction('TEST_PASS')).toBe('test_pass');
    expect(normalizeAction('crash')).toBe('error');
    expect(normalizeAction('needs_input')).toBe('input_request');
  });

  it('normalizes timestamps in seconds and ISO strings', () => {
    expect(parseTimestamp(1710000000)).toBe(1710000000000);
    const isoTs = parseTimestamp('2024-01-01T00:00:00.000Z');
    expect(isoTs).toBeTypeOf('number');
  });

  it('uses fallback agent identity when missing', () => {
    const line = JSON.stringify({ ts: 1710000000000, action: 'read', path: 'README.md' });
    const parsed = parseAgentEventLine(line, { id: 'fallback-agent', name: 'Fallback Agent' });

    expect(parsed).not.toBeNull();
    expect(parsed?.agentId).toBe('fallback-agent');
    expect(parsed?.agentName).toBe('Fallback Agent');
  });

  it('returns null when agent id missing and no fallback', () => {
    const line = JSON.stringify({ ts: 1710000000000, action: 'read' });
    expect(parseAgentEventLine(line)).toBeNull();
  });

  it('parses explicit input request event', () => {
    const line = JSON.stringify({
      ts: 1710000000000,
      agentId: 'codex',
      action: 'input_request',
      prompt: 'Please choose deployment environment.'
    });

    const parsed = parseAgentEventLine(line);
    expect(parsed).not.toBeNull();
    expect(parsed?.kind).toBe('input_request');
    if (parsed?.kind === 'input_request') {
      expect(parsed.prompt).toContain('deployment environment');
    }
  });
});
