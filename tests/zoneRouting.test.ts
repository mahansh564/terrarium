import { describe, expect, it } from 'vitest';
import { zoneForCrewState, zoneTarget } from '../src/webview/scenes/zoneRouting';

describe('zone routing', () => {
  it('maps crew states to intended station zones', () => {
    expect(zoneForCrewState('scanning')).toBe('console_bay');
    expect(zoneForCrewState('repairing')).toBe('module_bay');
    expect(zoneForCrewState('docked')).toBe('dock');
    expect(zoneForCrewState('alert')).toBe('diagnostics');
    expect(zoneForCrewState('damaged')).toBe('diagnostics');
    expect(zoneForCrewState('celebrating')).toBe('central_hub');
    expect(zoneForCrewState('standby')).toBe('patrol');
  });

  it('produces deterministic in-bounds zone targets', () => {
    const targetA = zoneTarget('codex', 'console_bay');
    const targetB = zoneTarget('codex', 'console_bay');
    expect(targetA).toEqual(targetB);
    expect(targetA.x).toBeGreaterThanOrEqual(28);
    expect(targetA.x).toBeLessThanOrEqual(960 - 28);
    expect(targetA.y).toBeGreaterThanOrEqual(104);
    expect(targetA.y).toBeLessThanOrEqual(540 - 36);
  });
});
