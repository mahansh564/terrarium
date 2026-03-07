import { describe, expect, it } from 'vitest';
import { resolveTooltipAgentId } from '../src/webview/ui/Tooltip';

describe('resolveTooltipAgentId', () => {
  it('prefers hovered crew unit over selected crew unit', () => {
    expect(resolveTooltipAgentId('hovered', 'selected')).toBe('hovered');
  });

  it('falls back to selected crew unit when no hover exists', () => {
    expect(resolveTooltipAgentId(null, 'selected')).toBe('selected');
  });

  it('returns null when neither hover nor selection exists', () => {
    expect(resolveTooltipAgentId(null, null)).toBeNull();
  });
});
