import { TERRARIUM_DIMENSIONS } from '@shared/constants';
import type { AgentConfig } from '@shared/types';
import { TERRARIUM_AUDIO_ASSETS, TERRARIUM_TILEMAP_KEY } from '../assets/manifest';
import { Creature } from '../entities/Creature';
import { CreatureFactory } from '../entities/CreatureFactory';
import { DayNight } from '../environment/DayNight';
import { Flora } from '../environment/Flora';
import {
  pickTileTextureFallback,
  readTilemapAsset,
  resolveTileFromMap
} from '../environment/tilemap';
import { Weather } from '../environment/Weather';
import { HUD } from '../ui/HUD';
import { Tooltip } from '../ui/Tooltip';
import { getTerrariumState } from '../state/context';
import {
  advanceSelection,
  clampPosition,
  resolveMovementVector,
  selectAgentByIndex
} from '../input/controls';

const CREATURE_MOVE_SPEED_PX_PER_SECOND = 118;
const CREATURE_MOVEMENT_BOUNDS = {
  minX: 28,
  maxX: TERRARIUM_DIMENSIONS.width - 28,
  minY: 104,
  maxY: TERRARIUM_DIMENSIONS.height - 36
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
 * Main gameplay scene rendering creatures and ecosystem systems.
 */
export class TerrariumScene extends Phaser.Scene {
  private readonly creatures = new Map<string, Creature>();
  private readonly creatureFactory = new CreatureFactory();
  private weather!: Weather;
  private flora!: Flora;
  private dayNight!: DayNight;
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
   * Creates the terrarium scene.
   */
  constructor() {
    super('TerrariumScene');
  }

  /**
   * Initializes visual layers and subscribes to state changes.
   */
  create(): void {
    const state = getTerrariumState();

    this.drawBackground();

    this.weather = new Weather(this);
    this.flora = new Flora(this);
    this.dayNight = new DayNight(this);
    this.hud = new HUD(this);
    this.tooltip = new Tooltip(this);
    this.weather.setEnabled(state.getConfig().weatherEnabled);
    this.startAmbientTrack();

    this.syncCreatures(state.getConfig().agents);
    this.hud.syncCreatures(this.creatures);
    this.hud.setSelectedAgent(this.selectedAgentId);
    this.tooltip.syncCreatures(this.creatures);
    this.tooltip.setSelectedAgent(this.selectedAgentId);
    this.setupKeyboardControls();

    this.unsubscribe = state.subscribe(() => {
      this.weather.setEnabled(state.getConfig().weatherEnabled);
      this.syncCreatures(state.getConfig().agents);
      this.hud.syncCreatures(this.creatures);
      this.hud.setSelectedAgent(this.selectedAgentId);
      this.tooltip.syncCreatures(this.creatures);
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
   * Updates creatures and ecosystem systems on each frame.
   *
   * @param time Current timestamp.
   * @param delta Delta frame time.
   */
  update(time: number, delta: number): void {
    const state = getTerrariumState();
    this.handleKeyboardSelection();
    this.handleSelectedCreatureMovement(delta);

    const events = state.drainAgentEvents();
    for (const event of events) {
      const creature = this.creatures.get(event.agentId);
      if (creature === undefined) {
        continue;
      }

      if (creature.applyEvent(event)) {
        state.updateCreatureState(event.agentId, creature.toPersistedState());
      }
    }

    const signals = state.drainHealthSignals();
    for (const signal of signals) {
      this.weather.applySignal(signal);
      this.flora.applySignal(signal);
    }

    for (const [agentId, creature] of this.creatures) {
      if (creature.tick(time)) {
        state.updateCreatureState(agentId, creature.toPersistedState());
      }
    }

    this.weather.update(time);
    this.flora.update(delta);
    this.dayNight.update(time);
    this.hud.setSelectedAgent(this.selectedAgentId);
    this.hud.update(this.creatures);
    this.tooltip.update(this.creatures);
  }

  private syncCreatures(configuredAgents: AgentConfig[]): void {
    const agents = configuredAgents.length > 0 ? configuredAgents : [demoAgent()];
    const incomingIds = new Set(agents.map((agent) => agent.id));

    for (const [agentId, creature] of this.creatures) {
      if (incomingIds.has(agentId)) {
        continue;
      }

      if (this.selectedAgentId === agentId) {
        this.setSelectedAgent(null);
      }
      creature.destroy();
      this.creatures.delete(agentId);
    }

    for (let index = 0; index < agents.length; index += 1) {
      const agent = agents[index];
      if (agent === undefined) {
        continue;
      }

      if (this.creatures.has(agent.id)) {
        continue;
      }

      const creature = this.creatureFactory.create(this, {
        agent,
        index,
        total: agents.length,
        persisted: getTerrariumState().getCreatureState(agent.id)
      });

      this.creatures.set(agent.id, creature);
      this.bindCreatureTooltipInteractions(creature);
    }
  }

  private bindCreatureTooltipInteractions(creature: Creature): void {
    const agentId = creature.getAgent().id;

    creature.onPointerOver(() => {
      this.tooltip.setHoveredAgent(agentId);
    });

    creature.onPointerOut(() => {
      this.tooltip.clearHoveredAgent(agentId);
    });

    creature.onPointerDown(() => {
      const nextSelected = this.selectedAgentId === agentId ? null : agentId;
      this.setSelectedAgent(nextSelected);
      this.tooltip.setHoveredAgent(agentId);
    });
  }

  private drawBackground(): void {
    const loadedTilemap = readTilemapAsset(this.cache.json.get(TERRARIUM_TILEMAP_KEY));
    const tileSize = loadedTilemap?.tileSize ?? TERRARIUM_DIMENSIONS.tileSize;
    const columns = loadedTilemap?.width ?? Math.ceil(TERRARIUM_DIMENSIONS.width / tileSize);
    const rows = loadedTilemap?.height ?? Math.ceil(TERRARIUM_DIMENSIONS.height / tileSize);

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
    atmosphere.fillStyle(0x2c628e, 0.14);
    atmosphere.fillRect(0, 0, TERRARIUM_DIMENSIONS.width, TERRARIUM_DIMENSIONS.height);
    atmosphere.fillStyle(0x5fd2ff, 0.08);
    atmosphere.fillCircle(TERRARIUM_DIMENSIONS.width * 0.18, TERRARIUM_DIMENSIONS.height * 0.24, 110);
    atmosphere.fillStyle(0xfff59b, 0.06);
    atmosphere.fillCircle(TERRARIUM_DIMENSIONS.width * 0.79, TERRARIUM_DIMENSIONS.height * 0.17, 138);
  }

  private startAmbientTrack(): void {
    const track = TERRARIUM_AUDIO_ASSETS[0];
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

  private handleSelectedCreatureMovement(delta: number): void {
    if (this.selectedAgentId === null) {
      return;
    }

    const selectedCreature = this.creatures.get(this.selectedAgentId);
    if (selectedCreature === undefined) {
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
    selectedCreature.setManualMovement(moving);
    if (!moving) {
      return;
    }

    const distance = (CREATURE_MOVE_SPEED_PX_PER_SECOND * delta) / 1000;
    const current = selectedCreature.getPosition();
    const next = clampPosition(
      {
        x: current.x + vector.x * distance,
        y: current.y + vector.y * distance
      },
      CREATURE_MOVEMENT_BOUNDS
    );
    selectedCreature.setPosition(next.x, next.y);
  }

  private setSelectedAgent(agentId: string | null): void {
    const nextAgentId = agentId !== null && this.creatures.has(agentId) ? agentId : null;
    if (this.selectedAgentId === nextAgentId) {
      return;
    }

    if (this.selectedAgentId !== null) {
      const current = this.creatures.get(this.selectedAgentId);
      if (current !== undefined) {
        current.setSelected(false);
        current.setManualMovement(false);
      }
    }

    this.selectedAgentId = nextAgentId;
    if (nextAgentId !== null) {
      const next = this.creatures.get(nextAgentId);
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
    return [...this.creatures.keys()];
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
    creatureType: 'slime'
  };
}
