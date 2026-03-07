import { STATION_DIMENSIONS } from '@shared/constants';
import type { AgentConfig } from '@shared/types';
import { STATION_AUDIO_ASSETS, STATION_TILEMAP_KEY } from '../assets/manifest';
import { CrewFactory } from '../entities/CrewFactory';
import { CrewUnit } from '../entities/CrewUnit';
import { OrbitalCycle } from '../environment/OrbitalCycle';
import { StationAlerts } from '../environment/StationAlerts';
import { StationInfrastructure } from '../environment/StationInfrastructure';
import {
  pickTileTextureFallback,
  readTilemapAsset,
  resolveTileFromMap
} from '../environment/tilemap';
import {
  advanceSelection,
  clampPosition,
  resolveMovementVector,
  selectAgentByIndex
} from '../input/controls';
import { getStationState } from '../state/context';
import { HUD } from '../ui/HUD';
import { Tooltip } from '../ui/Tooltip';

const CREW_MOVE_SPEED_PX_PER_SECOND = 118;
const CREW_MOVEMENT_BOUNDS = {
  minX: 28,
  maxX: STATION_DIMENSIONS.width - 28,
  minY: 104,
  maxY: STATION_DIMENSIONS.height - 36
} as const;
const QUICK_SELECT_KEYCODES = [
  Phaser.Input.Keyboard.KeyCodes.ONE,
  Phaser.Input.Keyboard.KeyCodes.TWO,
  Phaser.Input.Keyboard.KeyCodes.THREE,
  Phaser.Input.Keyboard.KeyCodes.FOUR,
  Phaser.Input.Keyboard.KeyCodes.FIVE,
  Phaser.Input.Keyboard.KeyCodes.SIX,
  Phaser.Input.Keyboard.KeyCodes.SEVEN,
  Phaser.Input.Keyboard.KeyCodes.EIGHT,
  Phaser.Input.Keyboard.KeyCodes.NINE
] as const;

/**
 * Main gameplay scene rendering crew and station systems.
 */
export class StationScene extends Phaser.Scene {
  private readonly crewUnits = new Map<string, CrewUnit>();
  private readonly crewFactory = new CrewFactory();
  private stationAlerts!: StationAlerts;
  private stationInfrastructure!: StationInfrastructure;
  private orbitalCycle!: OrbitalCycle;
  private hud!: HUD;
  private tooltip!: Tooltip;
  private ambientTrack: Phaser.Sound.BaseSound | null = null;
  private unsubscribe: (() => void) | null = null;
  private selectedAgentId: string | null = null;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  private movementKeys: {
    up: Phaser.Input.Keyboard.Key | null;
    down: Phaser.Input.Keyboard.Key | null;
    left: Phaser.Input.Keyboard.Key | null;
    right: Phaser.Input.Keyboard.Key | null;
  } = {
    up: null,
    down: null,
    left: null,
    right: null
  };
  private quickSelectKeys: Phaser.Input.Keyboard.Key[] = [];
  private escapeKey: Phaser.Input.Keyboard.Key | null = null;
  private tabSelectionHandler: ((event: KeyboardEvent) => void) | null = null;

  /**
   * Creates the station scene.
   */
  constructor() {
    super('StationScene');
  }

  /**
   * Initializes visual layers and subscribes to state changes.
   */
  create(): void {
    const state = getStationState();

    this.drawBackground();

    this.stationAlerts = new StationAlerts(this);
    this.stationInfrastructure = new StationInfrastructure(this);
    this.orbitalCycle = new OrbitalCycle(this);
    this.hud = new HUD(this);
    this.tooltip = new Tooltip(this);
    this.stationAlerts.setEnabled(state.getConfig().stationEffectsEnabled);
    this.startAmbientTrack();

    this.syncCrewUnits(state.getConfig().agents);
    this.hud.syncCrewUnits(this.crewUnits);
    this.hud.setSelectedAgent(this.selectedAgentId);
    this.tooltip.syncCrewUnits(this.crewUnits);
    this.tooltip.setSelectedAgent(this.selectedAgentId);
    this.setupKeyboardControls();

    this.unsubscribe = state.subscribe(() => {
      this.stationAlerts.setEnabled(state.getConfig().stationEffectsEnabled);
      this.syncCrewUnits(state.getConfig().agents);
      this.hud.syncCrewUnits(this.crewUnits);
      this.hud.setSelectedAgent(this.selectedAgentId);
      this.tooltip.syncCrewUnits(this.crewUnits);
      this.tooltip.setSelectedAgent(this.selectedAgentId);
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.unsubscribe !== null) {
        this.unsubscribe();
      }

      if (this.ambientTrack !== null) {
        this.ambientTrack.stop();
        this.ambientTrack.destroy();
        this.ambientTrack = null;
      }

      this.teardownKeyboardControls();
      this.hud.destroy();
      this.tooltip.destroy();
    });
  }

  /**
   * Updates crew and station systems on each frame.
   *
   * @param time Current timestamp.
   * @param delta Delta frame time.
   */
  update(time: number, delta: number): void {
    const state = getStationState();
    this.handleKeyboardSelection();
    this.handleSelectedCrewMovement(delta);

    const events = state.drainAgentEvents();
    for (const event of events) {
      const crew = this.crewUnits.get(event.agentId);
      if (crew === undefined) {
        continue;
      }

      if (crew.applyEvent(event)) {
        state.updateCrewState(event.agentId, crew.toPersistedState());
      }
    }

    const signals = state.drainHealthSignals();
    for (const signal of signals) {
      this.stationAlerts.applySignal(signal);
      this.stationInfrastructure.applySignal(signal);
    }

    for (const [agentId, crew] of this.crewUnits) {
      if (crew.tick(time)) {
        state.updateCrewState(agentId, crew.toPersistedState());
      }
    }

    this.stationAlerts.update(time);
    this.stationInfrastructure.update(delta);
    this.orbitalCycle.update(time);
    this.hud.setSelectedAgent(this.selectedAgentId);
    this.hud.update(this.crewUnits);
    this.tooltip.update(this.crewUnits);
  }

  private syncCrewUnits(configuredAgents: AgentConfig[]): void {
    const agents = configuredAgents.length > 0 ? configuredAgents : [demoAgent()];
    const incomingIds = new Set(agents.map((agent) => agent.id));

    for (const [agentId, crew] of this.crewUnits) {
      if (incomingIds.has(agentId)) {
        continue;
      }

      if (this.selectedAgentId === agentId) {
        this.setSelectedAgent(null);
      }
      crew.destroy();
      this.crewUnits.delete(agentId);
    }

    for (let index = 0; index < agents.length; index += 1) {
      const agent = agents[index];
      if (agent === undefined) {
        continue;
      }

      if (this.crewUnits.has(agent.id)) {
        continue;
      }

      const crew = this.crewFactory.create(this, {
        agent,
        index,
        total: agents.length,
        persisted: getStationState().getCrewState(agent.id)
      });

      this.crewUnits.set(agent.id, crew);
      this.bindCrewTooltipInteractions(crew);
    }
  }

  private bindCrewTooltipInteractions(crew: CrewUnit): void {
    const agentId = crew.getAgent().id;

    crew.onPointerOver(() => {
      this.tooltip.setHoveredAgent(agentId);
    });

    crew.onPointerOut(() => {
      this.tooltip.clearHoveredAgent(agentId);
    });

    crew.onPointerDown(() => {
      const nextSelected = this.selectedAgentId === agentId ? null : agentId;
      this.setSelectedAgent(nextSelected);
      this.tooltip.setHoveredAgent(agentId);
    });
  }

  private drawBackground(): void {
    const loadedTilemap = readTilemapAsset(this.cache.json.get(STATION_TILEMAP_KEY));
    const tileSize = loadedTilemap?.tileSize ?? STATION_DIMENSIONS.tileSize;
    const columns = loadedTilemap?.width ?? Math.ceil(STATION_DIMENSIONS.width / tileSize);
    const rows = loadedTilemap?.height ?? Math.ceil(STATION_DIMENSIONS.height / tileSize);

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < columns; col += 1) {
        const textureKey =
          loadedTilemap !== null
            ? resolveTileFromMap(loadedTilemap, row, col)
            : pickTileTextureFallback(row, col);
        const image = this.add.image(
          col * tileSize + tileSize / 2,
          row * tileSize + tileSize / 2,
          textureKey
        );
        image.setDepth(0);
      }
    }

    const atmosphere = this.add.graphics();
    atmosphere.setDepth(1);
    atmosphere.fillStyle(0x142334, 0.26);
    atmosphere.fillRect(0, 0, STATION_DIMENSIONS.width, STATION_DIMENSIONS.height);
    atmosphere.fillStyle(0x66dfff, 0.11);
    atmosphere.fillRect(0, 0, STATION_DIMENSIONS.width, 92);
    atmosphere.fillStyle(0x0b1728, 0.55);
    atmosphere.fillRect(0, STATION_DIMENSIONS.height - 88, STATION_DIMENSIONS.width, 88);
  }

  private startAmbientTrack(): void {
    const track = STATION_AUDIO_ASSETS[0];
    if (track === undefined) {
      return;
    }

    try {
      this.ambientTrack = this.sound.add(track.key, {
        loop: true,
        volume: 0.08
      });
    } catch {
      this.ambientTrack = null;
      return;
    }

    const playTrack = (): void => {
      if (this.ambientTrack !== null && !this.ambientTrack.isPlaying) {
        this.ambientTrack.play();
      }
    };

    if (this.sound.locked) {
      this.sound.once('unlocked', playTrack);
      return;
    }

    playTrack();
  }

  private setupKeyboardControls(): void {
    const keyboard = this.input.keyboard;
    if (keyboard === undefined || keyboard === null) {
      return;
    }

    this.cursors = keyboard.createCursorKeys();
    this.movementKeys = {
      up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D)
    };
    this.escapeKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.quickSelectKeys = QUICK_SELECT_KEYCODES.map((keycode) => keyboard.addKey(keycode));
    this.tabSelectionHandler = (event: KeyboardEvent) => {
      event.preventDefault();
      this.cycleSelection(event.shiftKey ? -1 : 1);
    };
    keyboard.on('keydown-TAB', this.tabSelectionHandler);
  }

  private teardownKeyboardControls(): void {
    const keyboard = this.input.keyboard;
    if (keyboard === undefined || keyboard === null || this.tabSelectionHandler === null) {
      return;
    }

    keyboard.off('keydown-TAB', this.tabSelectionHandler);
    this.tabSelectionHandler = null;
  }

  private handleKeyboardSelection(): void {
    if (this.escapeKey !== null && Phaser.Input.Keyboard.JustDown(this.escapeKey)) {
      this.setSelectedAgent(null);
    }

    const agentIds = this.getAgentIds();
    for (let index = 0; index < this.quickSelectKeys.length; index += 1) {
      const key = this.quickSelectKeys[index];
      if (key === undefined || !Phaser.Input.Keyboard.JustDown(key)) {
        continue;
      }

      this.setSelectedAgent(selectAgentByIndex(agentIds, index));
      return;
    }
  }

  private handleSelectedCrewMovement(delta: number): void {
    if (this.selectedAgentId === null) {
      return;
    }

    const selectedCrew = this.crewUnits.get(this.selectedAgentId);
    if (selectedCrew === undefined) {
      this.setSelectedAgent(null);
      return;
    }

    const vector = resolveMovementVector({
      left: this.isPressed(this.cursors?.left) || this.isPressed(this.movementKeys.left),
      right: this.isPressed(this.cursors?.right) || this.isPressed(this.movementKeys.right),
      up: this.isPressed(this.cursors?.up) || this.isPressed(this.movementKeys.up),
      down: this.isPressed(this.cursors?.down) || this.isPressed(this.movementKeys.down)
    });

    const moving = vector.x !== 0 || vector.y !== 0;
    selectedCrew.setManualMovement(moving);
    if (!moving) {
      return;
    }

    const distance = (CREW_MOVE_SPEED_PX_PER_SECOND * delta) / 1000;
    const current = selectedCrew.getPosition();
    const next = clampPosition(
      {
        x: current.x + vector.x * distance,
        y: current.y + vector.y * distance
      },
      CREW_MOVEMENT_BOUNDS
    );
    selectedCrew.setPosition(next.x, next.y);
  }

  private setSelectedAgent(agentId: string | null): void {
    const nextAgentId = agentId !== null && this.crewUnits.has(agentId) ? agentId : null;
    if (this.selectedAgentId === nextAgentId) {
      return;
    }

    if (this.selectedAgentId !== null) {
      const current = this.crewUnits.get(this.selectedAgentId);
      if (current !== undefined) {
        current.setSelected(false);
        current.setManualMovement(false);
      }
    }

    this.selectedAgentId = nextAgentId;
    if (nextAgentId !== null) {
      const next = this.crewUnits.get(nextAgentId);
      if (next !== undefined) {
        next.setSelected(true);
      }
    }

    this.hud.setSelectedAgent(this.selectedAgentId);
    this.tooltip.setSelectedAgent(this.selectedAgentId);
  }

  private cycleSelection(direction: 1 | -1): void {
    const nextAgentId = advanceSelection(this.getAgentIds(), this.selectedAgentId, direction);
    this.setSelectedAgent(nextAgentId);
  }

  private getAgentIds(): string[] {
    return [...this.crewUnits.keys()];
  }

  private isPressed(key: Phaser.Input.Keyboard.Key | null | undefined): boolean {
    return key?.isDown === true;
  }
}

function demoAgent(): AgentConfig {
  return {
    id: 'demo-agent',
    name: 'Demo Agent',
    transcriptPath: '',
    crewRole: 'engineer'
  };
}
