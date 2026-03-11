import { MISSION_REWARD_XP, STATION_DIMENSIONS } from '@shared/constants';
import type { AgentConfig, StationZone } from '@shared/types';
import {
  STATION_AUDIO_ASSETS,
  STATION_BACKGROUND_TEXTURE_KEY,
  STATION_TILEMAP_KEY
} from '../assets/manifest';
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
import { ActionCenter } from '../ui/ActionCenter';
import { CommandDeck } from '../ui/CommandDeck';
import { HUD } from '../ui/HUD';
import { MissionDeck } from '../ui/MissionDeck';
import { Tooltip } from '../ui/Tooltip';
import { resolveCrewMotionMode } from './crewMotion';
import { zoneForCrewState, zoneTarget } from './zoneRouting';

const CREW_MOVE_SPEED_PX_PER_SECOND = 118;
const CREW_ROAM_SPEED_RANGE = {
  min: 24,
  max: 44
} as const;
const CREW_ROAM_TURN_INTERVAL_MS = {
  min: 1400,
  max: 4200
} as const;
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
const SPACE_GRADIENT_STEPS = 9;
const ZONE_REACHED_DISTANCE_PX = 16;

interface BackgroundStar {
  x: number;
  y: number;
  size: number;
  color: number;
  phase: number;
}

interface CrewRoamState {
  vx: number;
  vy: number;
  nextTurnAt: number;
  zone: StationZone;
}

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
  private actionCenter!: ActionCenter;
  private missionDeck!: MissionDeck;
  private commandDeck!: CommandDeck;
  private ambientTrack: Phaser.Sound.BaseSound | null = null;
  private unsubscribe: (() => void) | null = null;
  private selectedAgentId: string | null = null;
  private followSelectedAgent = false;
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
  private addAgentKey: Phaser.Input.Keyboard.Key | null = null;
  private tabSelectionHandler: ((event: KeyboardEvent) => void) | null = null;
  private dynamicSkyLayer: Phaser.GameObjects.Graphics | null = null;
  private viewportFrame: Phaser.GameObjects.Graphics | null = null;
  private readonly starPoints: BackgroundStar[] = [];
  private readonly crewRoamStates = new Map<string, CrewRoamState>();

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
    this.hud = new HUD(this, () => {
      state.requestAddAgent();
    });
    this.tooltip = new Tooltip(this);
    this.actionCenter = new ActionCenter(this, (agentId) => {
      this.setSelectedAgent(agentId);
    });
    this.missionDeck = new MissionDeck(this);
    this.commandDeck = new CommandDeck(this, {
      onToggleEffects: () => {
        const config = state.getConfig();
        state.updateRuntimePreferences({
          stationEffectsEnabled: !config.stationEffectsEnabled
        });
      },
      onToggleAudio: () => {
        const config = state.getConfig();
        state.updateRuntimePreferences({
          audioEnabled: !config.audioEnabled
        });
      },
      onCycleSpeed: () => {
        const options = [0.75, 1, 1.25];
        const current = state.getConfig().simulationSpeed;
        const currentIndex = options.indexOf(current);
        const next = options[(currentIndex + 1 + options.length) % options.length] ?? 1;
        state.updateRuntimePreferences({ simulationSpeed: next });
      },
      onToggleFollow: () => {
        this.followSelectedAgent = !this.followSelectedAgent;
        if (!this.followSelectedAgent) {
          this.cameras.main.stopFollow();
        }
      }
    });
    this.stationAlerts.setEnabled(state.getConfig().stationEffectsEnabled);
    this.startAmbientTrack();
    this.syncAmbientTrackState(state.getConfig().audioEnabled);

    this.syncCrewUnits(state.getConfig().agents);
    this.hud.syncCrewUnits(this.crewUnits);
    this.hud.setSelectedAgent(this.selectedAgentId);
    this.tooltip.syncCrewUnits(this.crewUnits);
    this.tooltip.setSelectedAgent(this.selectedAgentId);
    this.setupKeyboardControls();

    this.unsubscribe = state.subscribe(() => {
      const config = state.getConfig();
      this.stationAlerts.setEnabled(config.stationEffectsEnabled);
      this.syncAmbientTrackState(config.audioEnabled);
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
      this.dynamicSkyLayer?.destroy();
      this.viewportFrame?.destroy();
      this.hud.destroy();
      this.tooltip.destroy();
      this.actionCenter.destroy();
      this.missionDeck.destroy();
      this.commandDeck.destroy();
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
    const simulationSpeed = state.getConfig().simulationSpeed;
    const scaledDelta = delta * simulationSpeed;
    this.handleKeyboardSelection();
    const selectedManualMovement = this.handleSelectedCrewMovement(scaledDelta);
    this.updateAmbientCrewMovement(time, scaledDelta, selectedManualMovement);

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

    const missionRewards = state.drainMissionRewards();
    for (const mission of missionRewards) {
      this.applyMissionReward(mission.rewardXp, time);
      this.missionDeck.triggerBoost(`${mission.title} +${mission.rewardXp}XP`, time);
      this.stationAlerts.applySignal({
        type: 'milestone',
        source: 'complete',
        agentId: this.selectedAgentId ?? 'mission',
        ts: time
      });
    }

    const signals = state.drainHealthSignals();
    for (const signal of signals) {
      this.stationAlerts.applySignal(signal);
      this.stationInfrastructure.applySignal(signal);
    }

    const projectMetrics = state.getProjectMetricsSnapshot();
    this.stationAlerts.applyMetrics(projectMetrics);
    this.stationInfrastructure.applyMetrics(projectMetrics);

    for (const [agentId, crew] of this.crewUnits) {
      if (crew.tick(time)) {
        state.updateCrewState(agentId, crew.toPersistedState());
      }
    }

    this.stationAlerts.update(time);
    this.stationInfrastructure.update(scaledDelta);
    this.orbitalCycle.update(time);
    this.updateBackdropEffects(time);
    this.updateCameraFollow();
    this.hud.setSelectedAgent(this.selectedAgentId);
    this.hud.update(this.crewUnits);
    this.tooltip.update(this.crewUnits);
    this.actionCenter.update(state.getActionCenterSnapshot(), time);
    this.missionDeck.update(state.getMissionSnapshot(), time);
    this.commandDeck.update(
      {
        stationEffectsEnabled: state.getConfig().stationEffectsEnabled,
        audioEnabled: state.getConfig().audioEnabled,
        simulationSpeed,
        followSelectedAgent: this.followSelectedAgent
      },
      time
    );
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
      this.crewRoamStates.delete(agentId);
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
    const background = this.add.image(
      STATION_DIMENSIONS.width / 2,
      STATION_DIMENSIONS.height / 2,
      STATION_BACKGROUND_TEXTURE_KEY
    );
    background.setDepth(-5);
    background.setDisplaySize(STATION_DIMENSIONS.width, STATION_DIMENSIONS.height);
    background.setAlpha(0.92);

    const backdrop = this.add.graphics();
    backdrop.setDepth(-4);
    backdrop.fillStyle(0x030519, 0.72);
    backdrop.fillRect(0, 0, STATION_DIMENSIONS.width, STATION_DIMENSIONS.height);
    for (let i = 0; i < SPACE_GRADIENT_STEPS; i += 1) {
      const bandHeight = STATION_DIMENSIONS.height / SPACE_GRADIENT_STEPS;
      const alpha = 0.08 + i * 0.015;
      backdrop.fillStyle(0x1e2b8f, alpha);
      backdrop.fillRect(0, Math.floor(i * bandHeight), STATION_DIMENSIONS.width, Math.ceil(bandHeight));
    }
    this.drawPixelStars(backdrop);
    this.drawOrbitalBodies(backdrop);
    this.dynamicSkyLayer = this.add.graphics();
    this.dynamicSkyLayer.setDepth(-3);

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
        image.setAlpha(0.93);
      }
    }

    const atmosphere = this.add.graphics();
    atmosphere.setDepth(1);
    atmosphere.fillStyle(0x0a0f3a, 0.38);
    atmosphere.fillRect(0, 0, STATION_DIMENSIONS.width, STATION_DIMENSIONS.height);
    atmosphere.fillStyle(0x89a9ff, 0.16);
    atmosphere.fillRect(0, 0, STATION_DIMENSIONS.width, 78);
    atmosphere.fillStyle(0x0d164f, 0.45);
    atmosphere.fillRect(0, STATION_DIMENSIONS.height - 108, STATION_DIMENSIONS.width, 108);
    atmosphere.lineStyle(2, 0x9ad4ff, 0.28);
    for (let y = 0; y < STATION_DIMENSIONS.height; y += 22) {
      atmosphere.beginPath();
      atmosphere.moveTo(0, y);
      atmosphere.lineTo(STATION_DIMENSIONS.width, y);
      atmosphere.strokePath();
    }

    this.drawViewportFrame();
  }

  private drawPixelStars(graphics: Phaser.GameObjects.Graphics): void {
    const starColors = [0xd3deff, 0xf3f6ff, 0xb2fff8, 0xfff8bc];
    this.starPoints.length = 0;

    for (let i = 0; i < 120; i += 1) {
      const x = (i * 79 + (i % 5) * 31) % STATION_DIMENSIONS.width;
      const y = (i * 47 + (i % 3) * 17) % 220;
      const color = starColors[i % starColors.length] ?? 0xffffff;
      const size = i % 9 === 0 ? 2 : 1;
      this.starPoints.push({ x, y, size, color, phase: i * 0.53 });
      graphics.fillStyle(color, i % 6 === 0 ? 0.95 : 0.8);
      graphics.fillRect(x, y, size, size);
      if (size > 1) {
        graphics.fillRect(x - 1, y, 1, 1);
        graphics.fillRect(x + 2, y, 1, 1);
        graphics.fillRect(x, y - 1, 1, 1);
        graphics.fillRect(x, y + 2, 1, 1);
      }
    }
  }

  private drawOrbitalBodies(graphics: Phaser.GameObjects.Graphics): void {
    graphics.fillStyle(0x8da4ff, 0.34);
    graphics.fillCircle(STATION_DIMENSIONS.width - 120, 84, 28);
    graphics.fillStyle(0xd4e1ff, 0.48);
    graphics.fillCircle(STATION_DIMENSIONS.width - 114, 78, 17);
    graphics.lineStyle(2, 0x7ee7ff, 0.45);
    graphics.strokeEllipse(STATION_DIMENSIONS.width - 120, 84, 84, 26);

    graphics.fillStyle(0x5f4cff, 0.24);
    graphics.fillCircle(116, 88, 18);
    graphics.fillStyle(0xa299ff, 0.36);
    graphics.fillCircle(112, 84, 11);
  }

  private updateBackdropEffects(now: number): void {
    if (this.dynamicSkyLayer === null) {
      return;
    }

    this.dynamicSkyLayer.clear();

    for (let i = 0; i < this.starPoints.length; i += 1) {
      const star = this.starPoints[i];
      if (star === undefined || i % 2 !== 0) {
        continue;
      }

      const twinkle = 0.3 + Math.sin(now * 0.002 + star.phase) * 0.36;
      if (twinkle <= 0.25) {
        continue;
      }

      this.dynamicSkyLayer.fillStyle(star.color, Math.min(0.96, twinkle));
      this.dynamicSkyLayer.fillRect(star.x, star.y, star.size, star.size);
      if (star.size > 1 && twinkle > 0.66) {
        this.dynamicSkyLayer.fillRect(star.x - 1, star.y, 1, 1);
        this.dynamicSkyLayer.fillRect(star.x + 2, star.y, 1, 1);
        this.dynamicSkyLayer.fillRect(star.x, star.y - 1, 1, 1);
        this.dynamicSkyLayer.fillRect(star.x, star.y + 2, 1, 1);
      }
    }

    const cometX = ((now / 4) % (STATION_DIMENSIONS.width + 180)) - 120;
    const cometY = 28 + Math.sin(now * 0.0007) * 26;
    for (let i = 0; i < 18; i += 1) {
      const alpha = 0.62 - i * 0.03;
      if (alpha <= 0) {
        continue;
      }

      this.dynamicSkyLayer.fillStyle(0xe1f6ff, alpha);
      this.dynamicSkyLayer.fillRect(cometX - i * 3, cometY + i, i < 3 ? 2 : 1, 1);
    }

    const droneX = 86 + Math.sin(now * 0.0012) * 16;
    const droneY = 66 + Math.cos(now * 0.0014) * 10;
    this.dynamicSkyLayer.fillStyle(0xc4dcff, 0.9);
    this.dynamicSkyLayer.fillRect(droneX, droneY, 6, 2);
    this.dynamicSkyLayer.fillRect(droneX + 2, droneY - 1, 2, 1);
    this.dynamicSkyLayer.fillStyle(0x92f6ff, 0.95);
    this.dynamicSkyLayer.fillRect(droneX - 2, droneY + 1, 2, 1);
    this.dynamicSkyLayer.fillRect(droneX + 6, droneY + 1, 2, 1);

    const moonX = STATION_DIMENSIONS.width - 86 + Math.sin(now * 0.0009) * 8;
    const moonY = 154 + Math.cos(now * 0.0008) * 6;
    this.dynamicSkyLayer.fillStyle(0xc9cfff, 0.45);
    this.dynamicSkyLayer.fillRect(moonX + 2, moonY, 4, 4);
    this.dynamicSkyLayer.fillRect(moonX + 1, moonY + 1, 6, 2);
    this.dynamicSkyLayer.fillStyle(0xedf5ff, 0.48);
    this.dynamicSkyLayer.fillRect(moonX + 2, moonY + 1, 2, 1);
  }

  private drawViewportFrame(): void {
    this.viewportFrame = this.add.graphics();
    this.viewportFrame.setDepth(50);

    const frame = this.viewportFrame;
    frame.fillStyle(0x141b5a, 0.68);
    frame.fillRect(0, 0, STATION_DIMENSIONS.width, 6);
    frame.fillRect(0, STATION_DIMENSIONS.height - 6, STATION_DIMENSIONS.width, 6);
    frame.fillRect(0, 0, 6, STATION_DIMENSIONS.height);
    frame.fillRect(STATION_DIMENSIONS.width - 6, 0, 6, STATION_DIMENSIONS.height);

    frame.fillStyle(0x9eb8ff, 0.75);
    frame.fillRect(7, 7, STATION_DIMENSIONS.width - 14, 1);
    frame.fillRect(7, STATION_DIMENSIONS.height - 8, STATION_DIMENSIONS.width - 14, 1);
    frame.fillRect(7, 7, 1, STATION_DIMENSIONS.height - 14);
    frame.fillRect(STATION_DIMENSIONS.width - 8, 7, 1, STATION_DIMENSIONS.height - 14);

    frame.fillStyle(0xe6f2ff, 0.95);
    frame.fillRect(8, 8, 8, 2);
    frame.fillRect(STATION_DIMENSIONS.width - 16, 8, 8, 2);
    frame.fillRect(8, STATION_DIMENSIONS.height - 10, 8, 2);
    frame.fillRect(STATION_DIMENSIONS.width - 16, STATION_DIMENSIONS.height - 10, 8, 2);
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

  private syncAmbientTrackState(enabled: boolean): void {
    if (this.ambientTrack === null) {
      return;
    }

    if (enabled && !this.ambientTrack.isPlaying) {
      this.ambientTrack.play();
      return;
    }

    if (!enabled && this.ambientTrack.isPlaying) {
      this.ambientTrack.stop();
    }
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
    this.addAgentKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.N);
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

    if (this.addAgentKey !== null && Phaser.Input.Keyboard.JustDown(this.addAgentKey)) {
      getStationState().requestAddAgent();
      return;
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

  private handleSelectedCrewMovement(delta: number): boolean {
    if (this.selectedAgentId === null) {
      return false;
    }

    const selectedCrew = this.crewUnits.get(this.selectedAgentId);
    if (selectedCrew === undefined) {
      this.setSelectedAgent(null);
      return false;
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
      return false;
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
    return true;
  }

  private updateAmbientCrewMovement(now: number, delta: number, selectedManualMovement: boolean): void {
    const distanceFactor = delta / 1000;

    for (const [agentId, crew] of this.crewUnits) {
      const motionMode = resolveCrewMotionMode({
        isSelected: agentId === this.selectedAgentId,
        manualInputActive: selectedManualMovement,
        snapshot: crew.getSnapshot(),
        now
      });
      if (motionMode === 'manual') {
        continue;
      }
      if (motionMode === 'idle') {
        crew.setManualMovement(false);
        continue;
      }

      const current = crew.getPosition();
      const zone = zoneForCrewState(crew.getSnapshot().state);
      const roamState = this.getOrCreateRoamState(agentId, zone, now);
      const target = zoneTarget(agentId, zone);
      const dx = target.x - current.x;
      const dy = target.y - current.y;
      const distanceToZone = Math.hypot(dx, dy);
      if (distanceToZone > ZONE_REACHED_DISTANCE_PX) {
        const speed = Phaser.Math.Between(CREW_ROAM_SPEED_RANGE.min, CREW_ROAM_SPEED_RANGE.max);
        roamState.vx = (dx / Math.max(1, distanceToZone)) * speed;
        roamState.vy = (dy / Math.max(1, distanceToZone)) * speed;
      } else if (now >= roamState.nextTurnAt) {
        this.retargetRoamState(roamState, zone, now);
      }

      let next = clampPosition(
        {
          x: current.x + roamState.vx * distanceFactor,
          y: current.y + roamState.vy * distanceFactor
        },
        CREW_MOVEMENT_BOUNDS
      );
      const nextDistance = Math.hypot(target.x - next.x, target.y - next.y);
      if (nextDistance > 170) {
        next = clampPosition(
          {
            x: current.x + (dx / Math.max(1, distanceToZone)) * CREW_ROAM_SPEED_RANGE.max * distanceFactor,
            y: current.y + (dy / Math.max(1, distanceToZone)) * CREW_ROAM_SPEED_RANGE.max * distanceFactor
          },
          CREW_MOVEMENT_BOUNDS
        );
      }

      crew.setManualMovement(true);
      crew.setPosition(next.x, next.y);
    }
  }

  private getOrCreateRoamState(agentId: string, zone: StationZone, now: number): CrewRoamState {
    const existing = this.crewRoamStates.get(agentId);
    if (existing !== undefined) {
      if (existing.zone !== zone) {
        this.retargetRoamState(existing, zone, now);
      }
      return existing;
    }

    const hash = hashString(agentId);
    const initialAngle = ((hash % 360) * Math.PI) / 180;
    const speedSpread = CREW_ROAM_SPEED_RANGE.max - CREW_ROAM_SPEED_RANGE.min;
    const initialSpeed = CREW_ROAM_SPEED_RANGE.min + (hash % (speedSpread + 1));
    const initialState: CrewRoamState = {
      vx: Math.cos(initialAngle) * initialSpeed,
      vy: Math.sin(initialAngle) * initialSpeed,
      nextTurnAt: now + this.randomTurnIntervalMs(),
      zone
    };

    this.crewRoamStates.set(agentId, initialState);
    return initialState;
  }

  private retargetRoamState(state: CrewRoamState, zone: StationZone, now: number): void {
    const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const speed = Phaser.Math.Between(CREW_ROAM_SPEED_RANGE.min, CREW_ROAM_SPEED_RANGE.max);
    state.vx = Math.cos(angle) * speed;
    state.vy = Math.sin(angle) * speed;
    state.zone = zone;
    state.nextTurnAt = now + this.randomTurnIntervalMs();
  }

  private randomTurnIntervalMs(): number {
    return Phaser.Math.Between(CREW_ROAM_TURN_INTERVAL_MS.min, CREW_ROAM_TURN_INTERVAL_MS.max);
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
    if (!this.followSelectedAgent) {
      this.cameras.main.setZoom(1);
      this.cameras.main.setScroll(0, 0);
    }
  }

  private applyMissionReward(rewardXp: number, now: number): void {
    const reward = Math.max(1, rewardXp || MISSION_REWARD_XP);
    const state = getStationState();
    for (const [agentId, crew] of this.crewUnits) {
      if (crew.applyMissionReward(reward, now)) {
        state.updateCrewState(agentId, crew.toPersistedState());
      }
    }
  }

  private updateCameraFollow(): void {
    const camera = this.cameras.main;
    if (!this.followSelectedAgent || this.selectedAgentId === null) {
      camera.setZoom(1);
      camera.setScroll(0, 0);
      return;
    }

    const crew = this.crewUnits.get(this.selectedAgentId);
    if (crew === undefined) {
      camera.setZoom(1);
      camera.setScroll(0, 0);
      return;
    }

    const zoom = 1.12;
    camera.setZoom(zoom);
    const { x, y } = crew.getPosition();
    const viewportWidth = camera.width / zoom;
    const viewportHeight = camera.height / zoom;
    const targetScrollX = clamp(x - viewportWidth / 2, 0, STATION_DIMENSIONS.width - viewportWidth);
    const targetScrollY = clamp(y - viewportHeight / 2, 0, STATION_DIMENSIONS.height - viewportHeight);
    camera.scrollX = Phaser.Math.Linear(camera.scrollX, targetScrollX, 0.12);
    camera.scrollY = Phaser.Math.Linear(camera.scrollY, targetScrollY, 0.12);
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

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }

  return Math.abs(hash);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
