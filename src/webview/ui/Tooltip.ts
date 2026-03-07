import { STATION_DIMENSIONS } from '@shared/constants';
import type { CrewUnit } from '../entities/CrewUnit';

const TOOLTIP_PADDING = 8;
const TOOLTIP_GAP = 6;
const TOOLTIP_MARGIN = 8;

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
      fontFamily: '"Trebuchet MS", "Lucida Sans Unicode", sans-serif',
      fontStyle: 'bold',
      fontSize: '13px',
      color: '#f7feff'
    });
    this.title.setDepth(53);
    this.title.setVisible(false);
    this.title.setShadow(0, 1, '#021522', 3, false, true);

    this.body = scene.add.text(0, 0, '', {
      fontFamily: '"Trebuchet MS", "Lucida Sans Unicode", sans-serif',
      fontSize: '11px',
      color: '#d7f9ff',
      lineSpacing: 2
    });
    this.body.setDepth(53);
    this.body.setVisible(false);
    this.body.setShadow(0, 1, '#021522', 2, false, true);
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
    const moodLabel = snapshot.mood > 0 ? `+${snapshot.mood}` : `${snapshot.mood}`;
    const requestLine = snapshot.requestingInput ? '\nREQUESTING INPUT' : '';

    this.title.setText(`${crew.getAgent().name}${pinned ? ' [selected]' : ''}`);
    this.body.setText(
      `State: ${snapshot.state}\nLevel: ${snapshot.level}  XP: ${snapshot.xp}\nMood: ${moodLabel}${requestLine}\nTab: cycle  Arrow/WASD: move  Esc: clear`
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

    this.panel.clear();
    this.panel.fillStyle(0x143649, 0.95);
    this.panel.lineStyle(2, 0x83ffe4, 0.95);
    this.panel.fillRoundedRect(position.x, position.y, width, height, 6);
    this.panel.strokeRoundedRect(position.x, position.y, width, height, 6);
    this.panel.fillStyle(0xffffff, 0.08);
    this.panel.fillRoundedRect(position.x + 1, position.y + 1, width - 2, 12, 6);
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
