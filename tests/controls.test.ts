import { describe, expect, it } from 'vitest';
import {
  advanceSelection,
  clampPosition,
  resolveMovementVector,
  selectAgentByIndex
} from '../src/webview/input/controls';

describe('webview keyboard controls', () => {
  it('returns zero vector when no movement keys are pressed', () => {
    expect(resolveMovementVector({ left: false, right: false, up: false, down: false })).toEqual({
      x: 0,
      y: 0
    });
  });

  it('normalizes diagonal movement vectors', () => {
    const vector = resolveMovementVector({ left: false, right: true, up: true, down: false });
    expect(vector.x).toBeCloseTo(Math.SQRT1_2);
    expect(vector.y).toBeCloseTo(-Math.SQRT1_2);
  });

  it('cycles selection in both directions and wraps around', () => {
    const agentIds = ['a', 'b', 'c'];

    expect(advanceSelection(agentIds, null, 1)).toBe('a');
    expect(advanceSelection(agentIds, null, -1)).toBe('c');
    expect(advanceSelection(agentIds, 'b', 1)).toBe('c');
    expect(advanceSelection(agentIds, 'a', -1)).toBe('c');
  });

  it('selects agents by quick-select index', () => {
    const agentIds = ['a', 'b', 'c'];

    expect(selectAgentByIndex(agentIds, 0)).toBe('a');
    expect(selectAgentByIndex(agentIds, 2)).toBe('c');
    expect(selectAgentByIndex(agentIds, 4)).toBeNull();
  });

  it('clamps movement positions to configured bounds', () => {
    expect(
      clampPosition(
        {
          x: -20,
          y: 999
        },
        {
          minX: 10,
          maxX: 50,
          minY: 40,
          maxY: 70
        }
      )
    ).toEqual({
      x: 10,
      y: 70
    });
  });
});
