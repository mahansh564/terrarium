import type { CrewState } from '@shared/types';
import { STATION_DIMENSIONS } from '@shared/constants';
import type { CrewUnit } from '../entities/CrewUnit';

const TOOLTIP_PADDING = 8;
const TOOLTIP_GAP = 6;
const TOOLTIP_MARGIN = 8;
const PIXEL_FONT_FAMILY = '"Courier New", "Consolas", monospace';

/**
 * Resolves which agent tooltip should be visible.
 *
 * @param hoveredAgentId Agent currently hovered by pointer.
 * @param selectedAgentId Agent currently selected by click.
 * @returns Visible agent id or null when tooltip should be hidden.
 */
export function resolveTooltipAgentId(
  hoveredAgentId: string | null,
  selectedAgentId: string | null
): string | null {
  return hoveredAgentId ?? selectedAgentId;
}

/**
 * Floating tooltip panel for hover and selection details.
 */
export class Tooltip {
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private readonly body: Phaser.GameObjects.Text;
  private hoveredAgentId: string | null = null;
  private selectedAgentId: string | null = null;

  /**
   * Creates tooltip UI elements.
   *
   * @param scene Scene where tooltip should render.
   */
  constructor(private readonly scene: Phaser.Scene) {
    this.panel = scene.add.graphics();
    this.panel.setDepth(52);

    this.title = scene.add.text(0, 0, '', {
      fontFamily: PIXEL_FONT_FAMILY,
      fontStyle: 'bold',
      fontSize: '13px',
      color: '#f4f8ff'
    });
    this.title.setDepth(53);
    this.title.setLetterSpacing(1.1);
    this.title.setVisible(false);
    this.title.setShadow(0, 1, '#000a27', 3, false, true);

    this.body = scene.add.text(0, 0, '', {
      fontFamily: PIXEL_FONT_FAMILY,
      fontSize: '11px',
      color: '#b6d4ff',
      lineSpacing: 3
    });
    this.body.setDepth(53);
    this.body.setVisible(false);
    this.body.setShadow(0, 1, '#000a27', 2, false, true);
  }

  /**
   * Syncs tracked hover/selection references with active crew units.
   *
   * @param crewUnits Active crew map.
   */
  syncCrewUnits(crewUnits: Map<string, CrewUnit>): void {
    if (this.hoveredAgentId !== null && !crewUnits.has(this.hoveredAgentId)) {
      this.hoveredAgentId = null;
    }

    if (this.selectedAgentId !== null && !crewUnits.has(this.selectedAgentId)) {
      this.selectedAgentId = null;
    }
  }

  /**
   * Sets currently hovered crew id.
   *
   * @param agentId Hovered agent id or null.
   */
  setHoveredAgent(agentId: string | null): void {
    this.hoveredAgentId = agentId;
  }

  /**
   * Clears hover state when leaving a specific crew unit.
   *
   * @param agentId Agent id being exited.
   */
  clearHoveredAgent(agentId: string): void {
    if (this.hoveredAgentId === agentId) {
      this.hoveredAgentId = null;
    }
  }

  /**
   * Sets selected crew id.
   *
   * @param agentId Selected agent id or null.
   */
  setSelectedAgent(agentId: string | null): void {
    this.selectedAgentId = agentId;
  }

  /**
   * Updates tooltip content and screen position.
   *
   * @param crewUnits Active crew map.
   */
  update(crewUnits: Map<string, CrewUnit>): void {
    const visibleAgentId = resolveTooltipAgentId(this.hoveredAgentId, this.selectedAgentId);
    if (visibleAgentId === null) {
      this.hide();
      return;
    }

    const crew = crewUnits.get(visibleAgentId);
    if (crew === undefined) {
      this.hide();
      return;
    }

    const pinned = this.selectedAgentId === visibleAgentId && this.hoveredAgentId === null;
    const snapshot = crew.getSnapshot();
    const activity = crew.getActivity();
    const moodLabel = snapshot.mood > 0 ? `+${snapshot.mood}` : `${snapshot.mood}`;
    const requestLine = snapshot.requestingInput ? '\nSTATUS: REQUESTING INPUT' : '';
    const streamLine = activity.source === 'cursor_composer_storage' ? 'STREAM: CURSOR LIVE' : '';

    this.title.setText(`${crew.getAgent().name.toUpperCase()}${pinned ? ' [PINNED]' : ''}`);
    this.body.setText(
      `STATE: ${snapshot.state.toUpperCase()}\nNOW: ${activity.description}\nLAST EVENT: ${formatLastEvent(activity.action, activity.updatedAt)}\nLEVEL: ${snapshot.level}  XP: ${snapshot.xp}\nMOOD: ${moodLabel}${requestLine}${streamLine.length > 0 ? `\n${streamLine}` : ''}\nTAB: CYCLE  ARROW/WASD: MOVE  ESC: CLEAR`
    );
    this.title.setVisible(true);
    this.body.setVisible(true);

    const width = Math.max(this.title.width, this.body.width) + TOOLTIP_PADDING * 2;
    const height = this.title.height + this.body.height + TOOLTIP_PADDING * 2 + TOOLTIP_GAP;
    const position = this.computePosition(crew, width, height);

    this.title.setPosition(position.x + TOOLTIP_PADDING, position.y + TOOLTIP_PADDING);
    this.body.setPosition(
      position.x + TOOLTIP_PADDING,
      position.y + TOOLTIP_PADDING + this.title.height + TOOLTIP_GAP
    );

    drawPixelTooltip(
      this.panel,
      position.x,
      position.y,
      width,
      height,
      stateAccentColor(snapshot.state),
      snapshot.requestingInput,
      snapshot.state
    );
  }

  /**
   * Releases tooltip resources.
   */
  destroy(): void {
    this.panel.destroy();
    this.title.destroy();
    this.body.destroy();
  }

  private computePosition(crew: CrewUnit, width: number, height: number): { x: number; y: number } {
    const { x, y } = crew.getPosition();
    const anchorX = x + 26;
    const anchorY = y - 106;

    return {
      x: clamp(anchorX, TOOLTIP_MARGIN, STATION_DIMENSIONS.width - width - TOOLTIP_MARGIN),
      y: clamp(anchorY, TOOLTIP_MARGIN, STATION_DIMENSIONS.height - height - TOOLTIP_MARGIN)
    };
  }

  private hide(): void {
    this.panel.clear();
    this.title.setVisible(false);
    this.body.setVisible(false);
  }
}

function drawPixelTooltip(
  panel: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  accentColor: number,
  urgent: boolean,
  state: CrewState
): void {
  panel.clear();
  panel.fillStyle(0x10184f, 0.95);
  panel.fillRect(x, y, width, height);

  panel.fillStyle(accentColor, 0.95);
  panel.fillRect(x, y, width, 2);
  panel.fillRect(x, y + height - 2, width, 2);
  panel.fillRect(x, y, 2, height);
  panel.fillRect(x + width - 2, y, 2, height);

  panel.fillStyle(accentColor, 0.8);
  panel.fillRect(x + 4, y + 4, 3, height - 8);

  panel.fillStyle(0xcfe6ff, 0.17);
  panel.fillRect(x + 2, y + 2, width - 4, 12);
  panel.fillStyle(0xcfe6ff, 0.08);
  for (let stripeY = y + 16; stripeY < y + height - 3; stripeY += 6) {
    panel.fillRect(x + 2, stripeY, width - 4, 1);
  }

  panel.fillStyle(0xe8f8ff, 0.95);
  panel.fillRect(x - 1, y - 1, 3, 3);
  panel.fillRect(x + width - 2, y - 1, 3, 3);
  panel.fillRect(x - 1, y + height - 2, 3, 3);
  panel.fillRect(x + width - 2, y + height - 2, 3, 3);

  panel.fillStyle(urgent ? 0xffa4b5 : 0xd9ecff, 0.95);
  panel.fillRect(x + width - 12, y + 6, 6, 3);
  panel.fillRect(x + width - 10, y + 4, 2, 7);
  drawTooltipStateGlyph(panel, x + width - 16, y + 16, state, accentColor);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatLastEvent(action: string | null, updatedAt: number): string {
  if (action === null) {
    return 'NONE';
  }

  const ageMs = Math.max(0, Date.now() - updatedAt);
  const ageSeconds = Math.floor(ageMs / 1000);
  const ageLabel =
    ageSeconds < 60 ? `${ageSeconds}s AGO` : `${Math.floor(ageSeconds / 60)}m AGO`;
  return `${action.toUpperCase()}  ${ageLabel}`;
}

function stateAccentColor(state: CrewState): number {
  switch (state) {
    case 'repairing':
      return 0x88ffc5;
    case 'scanning':
      return 0x95d7ff;
    case 'docked':
      return 0xb2bfd8;
    case 'alert':
      return 0xffdf8a;
    case 'celebrating':
      return 0xc0ffd6;
    case 'damaged':
      return 0xff98ae;
    case 'requesting_input':
      return 0xb7ffff;
    case 'standby':
    default:
      return 0xa7b8e0;
  }
}

function drawTooltipStateGlyph(
  panel: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  state: CrewState,
  color: number
): void {
  panel.fillStyle(color, 0.95);
  if (state === 'alert' || state === 'damaged') {
    panel.fillRect(x + 1, y, 2, 5);
    panel.fillRect(x + 1, y + 6, 2, 1);
    return;
  }

  if (state === 'repairing') {
    panel.fillRect(x, y + 1, 4, 1);
    panel.fillRect(x + 1, y, 2, 3);
    return;
  }

  if (state === 'celebrating') {
    panel.fillRect(x + 1, y, 2, 1);
    panel.fillRect(x, y + 1, 4, 1);
    panel.fillRect(x + 1, y + 2, 2, 3);
    return;
  }

  panel.fillRect(x + 1, y, 2, 5);
}
