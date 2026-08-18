import Phaser from 'phaser';
import { session, GameStates } from '../game/state/gameSession.js';
import { getRace } from '../game/data/races.js';
import { getDifficulty, getEnemyWaveInterval } from '../game/data/difficulties.js';
import { createInputController } from '../game/input/createInputController.js';
import { getUnitDef } from '../game/unitDefs.js';
import ParticleManager from '../game/particles/ParticleManager.js';
import { spawnMuzzleFlash, spawnExplosion, spawnTargetImpact, spawnTracer } from '../game/particleEffects.js';
import { audioSystem } from '../game/audio/audioSystem.js';
import { createAudioManager } from '../game/audioManager.js';
import { installBattleVisualPolish } from '../game/battleVisualPolish.js';
import { getAnimationState } from '../game/animationState.js';
import { MARINE_ANIMATION_PROFILE, BASIC_UNIT_ANIMATION_PROFILES } from '../game/animationProfiles.js';
import { getDamageTier } from '../game/damageState.js';

const WORLD_WIDTH = 1680;
const WORLD_HEIGHT = 960;
const TOP_UI_HEIGHT = 70;
const BOTTOM_UI_HEIGHT = 190;
const TAP_DRAG_THRESHOLD = 18;
const CAMERA_SPEED = 560;
const MIN_ZOOM = 0.55;
const MAX_ZOOM = 1.6;
const ZOOM_STEP = 0.15;
const SEPARATION_FORCE = 2.5;

// Minimap settings
const MINIMAP_WIDTH = 160;
const MINIMAP_HEIGHT = 94; // ~1:1.75 aspect matching world
const MINIMAP_X = 16;
const MINIMAP_Y = TOP_UI_HEIGHT + 8;
const MOTION_SCALE_TARGETS = {
  idle: 1,
  move: 1.03,
  attack: 1.06,
  build: 1.02,
  train: 1.018
};
const FEEDBACK_TIMINGS = {
  selectionPulse: 520,
  tapFlash: 300,
  deselectRipple: 240,
  damageFlash: 40,
  completionGlow: 420,
  chargeImpact: 220,
  waveFadeIn: 220,
  waveHold: 1200,
  waveFadeOut: 360
};
const PLAYER_BUILD_SLOTS = [
  { x: 315, y: WORLD_HEIGHT / 2 - 150 },
  { x: 315, y: WORLD_HEIGHT / 2 + 150 },
  { x: 400, y: WORLD_HEIGHT / 2 - 80 },
  { x: 400, y: WORLD_HEIGHT / 2 + 80 },
  { x: 450, y: WORLD_HEIGHT / 2 }
];
const ENEMY_BUILD_SLOTS = [
  { x: WORLD_WIDTH - 315, y: WORLD_HEIGHT / 2 - 150 },
  { x: WORLD_WIDTH - 315, y: WORLD_HEIGHT / 2 + 150 },
  { x: WORLD_WIDTH - 400, y: WORLD_HEIGHT / 2 - 80 },
  { x: WORLD_WIDTH - 400, y: WORLD_HEIGHT / 2 + 80 },
  { x: WORLD_WIDTH - 450, y: WORLD_HEIGHT / 2 }
];

function clampCamera(camera) {
  const maxScrollX = Math.max(0, WORLD_WIDTH - camera.width / camera.zoom);
  const maxScrollY = Math.max(0, WORLD_HEIGHT - camera.height / camera.zoom);
  camera.scrollX = Phaser.Math.Clamp(camera.scrollX, 0, maxScrollX);
  camera.scrollY = Phaser.Math.Clamp(camera.scrollY, 0, maxScrollY);
}

export default class BattleScene extends Phaser.Scene {
  constructor() {
    super('BattleScene');
  }

  create() {
    this.race = getRace(session.raceId);
    this.aiDifficulty = getDifficulty(session.difficultyId);
    this.selectedEntity = null;
    this.selectedEntities = [];
    this.secondaryHighlights = [];
    this.selectionBoxGraphics = null;
    this.commandMode = 'select';
    this.paused = false;
    this.ended = false;
    this.endTapReady = false;
    this.nextId = 1;
    this.units = [];
    this.structures = [];
    this.resourceNodes = [];
    this.gasGeysers = [];
    this.constructions = [];
    this.playerBuildSlots = PLAYER_BUILD_SLOTS.map((slot) => ({ ...slot }));
    this.enemyBuildSlots = ENEMY_BUILD_SLOTS.map((slot) => ({ ...slot }));
    this.projectiles = [];
    this.playerMinerals = this.race.startMinerals;
    this.playerGas = this.race.startGas;
    this.playerSupplyUsed = this.race.startSupplyUsed;
    this.playerSupplyCap = this.race.startSupplyCap;
    this.enemyMinerals = this.aiDifficulty.enemyStartingMinerals;
    this.enemyGas = this.race.startGas;
    this.enemySupplyUsed = 4;
    this.enemySupplyCap = this.aiDifficulty.enemyStartingSupplyCap;
    this.enemyIncomeTimer = 0;
    this.enemySpawnTimer = 0;
    this.enemyWave = 0;
    this.enemyAttackTimer = 0;
    this.waveWarnActive = false;
    this.enemyTechBuilt = false;
    this.enemySignatureUnlocked = false;

  // Performance cache: tech building reference (avoids repeated scans).
    this._cachedTechBuilding = null;
    this._updateTechCache();
    this.inputController = createInputController(this);

    // Audio — programmatic SFX via Web Audio API (no external files).
    this.audioManager = createAudioManager(this.game);

    // Touch zoom state
    this.touchZoomState = null;
    this.lastPinchDist = 0;
    this.lastPinchCenter = { x: 0, y: 0 };

    // Mobile visual feedback — selection highlight ring
    this.selectionHighlight = null;
    this.selectionHighlightTween = null;

    // Tap feedback — brief flash at tap point (move/attack commands, empty taps)
    this.tapFeedback = null;

    this.cameras.main.setBackgroundColor(this.race.backdrop);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    // Start zoomed in on player side, then smoothly pan to center
    this.cameras.main.setZoom(0.7);
    this.cameras.main.scrollX = 200;
    this.cameras.main.scrollY = WORLD_HEIGHT / 2 - (this.scale.height * 0.7) / 2;

    // Smooth zoom out + pan to center after short delay
    this.time.delayedCall(800, () => {
      const cam = this.cameras.main;
      this.tweens.add({
        targets: { zoom: 0.7, scrollX: 200, scrollY: WORLD_HEIGHT / 2 - (this.scale.height * 0.7) / 2 },
        duration: 1800,
        ease: 'Sine.easeInOut',
        onUpdate: (tween) => {
          const p = tween.progress;
          cam.zoom = Phaser.Math.Linear(0.7, 0.95, p);
          cam.scrollX = Phaser.Math.Linear(200, WORLD_WIDTH / 2 - (this.scale.width * 0.95) / 2, p);
          cam.scrollY = Phaser.Math.Linear(
            WORLD_HEIGHT / 2 - (this.scale.height * 0.7) / 2,
            WORLD_HEIGHT / 2 - (this.scale.height * 0.95) / 2,
            p
          );
        }
      });
    });

    this.createBattleTextures();

    this.background = this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, this.race.backdrop, 1)
      .setDepth(-20);
    this.terrainTile = this.add.tileSprite(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, `${this.race.id}-terrain`)
      .setAlpha(0.24)
      .setDepth(-19);
    this.grid = this.add.grid(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, 48, 48, 0x0c1826, 0, 0x223548, 0.35)
      .setOrigin(0.5)
      .setAlpha(0.22)
      .setDepth(-18);

    this.middleLane = this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 220, WORLD_HEIGHT - 90, 0x0f172a, 0.18)
      .setStrokeStyle(1, 0x1f3b61, 0.35);

    this.playerZone = this.add.rectangle(0, WORLD_HEIGHT / 2, 360, WORLD_HEIGHT, this.race.accent, 0.08)
      .setOrigin(0, 0.5)
      .setDepth(-16);
    this.enemyZone = this.add.rectangle(WORLD_WIDTH, WORLD_HEIGHT / 2, 360, WORLD_HEIGHT, 0xf97316, 0.08)
      .setOrigin(1, 0.5)
      .setDepth(-16);

    this.createAtmosphere();

    this.drawDecor();
    this.createMap();
    this.createGasGeysers();
    this.spawnStartingForces();
    this.createBattleFieldTitle();
    this.createMinimap();
    // Twenty-pass battle visual layer: attached after all initial entities exist.
    this.visualPolish = installBattleVisualPolish(this);

    session.startBattle(this.race.id, this.race.name, {
      minerals: this.playerMinerals,
      gas: this.playerGas,
      supplyUsed: this.playerSupplyUsed,
      supplyCap: this.playerSupplyCap,
      enemyMinerals: this.enemyMinerals,
      difficultyId: this.aiDifficulty.id,
      difficultyLabel: this.aiDifficulty.label,
      objective: `Secure the frontier, build ${this.race.productionName}, and destroy the enemy ${this.race.commandCenterName}.`,
      message: `${this.race.name} command uplink online. ${this.aiDifficulty.label} AI active. Tap a unit, structure, or the battlefield to command the army.`,
      log: [`${this.race.name} deployed.`]
    });

    this.defaultWorker = this.units.find((unit) => unit.team === 'player' && unit.type === 'worker' && unit.hp > 0) ?? null;
    if (this.defaultWorker) {
      this.selectEntity(this.defaultWorker);
      session.setMessage(`Worker selected by default. Tap Move or Attack to command it, or use the HUD to train more ${this.race.workerName}s.`);
    } else if (this.playerCommandCenter) {
      this.selectEntity(this.playerCommandCenter);
      session.setMessage('Command Center selected by default. Use the HUD to grow your army.');
    }

    // Show a brief "how to play" hint banner that fades after 5 seconds
    this.showStartHint();

    this.scene.launch('HudScene', { battleScene: this });
    this.scene.bringToTop('HudScene');

    this.installPointerControls();
    this.installPinchZoom();

    // Particle effects system
    this.particleManager = new ParticleManager(this);
    this.particleManager.startIdleResourceSparks = (node) => this.particleManager.spawnIdleResourceSparks(node);

    this.scale.on('resize', this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.syncSession();
  }

  shutdown() {
    // Clean up audio systems on scene destroy.
    if (this.audioManager) {
      this.audioManager.destroy();
    }
    if (this._audioSystem) {
      this._audioSystem.destroy();
    }
    // Clean up visual feedback objects.
    if (this.selectionHighlight) this.selectionHighlight.destroy();
    if (this.tapFeedback) this.tapFeedback.destroy();
  }

  drawDecor() {
    const laneColor = this.race.accent;
    const enemyColor = 0xf97316;

    // Perimeter ridge plateaus (top and bottom two-tone elevation ridges)
    this.add.rectangle(WORLD_WIDTH / 2, 95, WORLD_WIDTH - 120, 10, 0x020617, 0.6).setDepth(1);
    this.add.rectangle(WORLD_WIDTH / 2, 100, WORLD_WIDTH - 120, 2, 0x38bdf8, 0.5).setDepth(2);
    this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT - 95, WORLD_WIDTH - 120, 10, 0x020617, 0.6).setDepth(1);
    this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT - 100, WORLD_WIDTH - 120, 2, enemyColor, 0.5).setDepth(2);

    // Tactical boundary rails
    this.add.rectangle(WORLD_WIDTH / 2, 110, WORLD_WIDTH - 200, 4, 0x1d4ed8, 0.45).setDepth(2);
    this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT - 110, WORLD_WIDTH - 200, 4, enemyColor, 0.45).setDepth(2);

    // Contested Lane two-tone ridge framing
    this.add.circle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 140, laneColor, 0.05).setDepth(2);
    this.add.circle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 240, 0x38bdf8, 0.03).setDepth(2);
    this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 246, WORLD_HEIGHT - 174, 0x020617, 0.4).setDepth(1);
    this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 240, WORLD_HEIGHT - 180, 0x0f172a, 0.2)
      .setStrokeStyle(2, 0x38bdf8, 0.5).setDepth(2);

    // Sector Alpha (Player Zone) two-tone framing & brackets
    this.add.rectangle(220, WORLD_HEIGHT / 2, 304, WORLD_HEIGHT - 136, 0x020617, 0.35).setDepth(1);
    this.add.rectangle(220, WORLD_HEIGHT / 2, 300, WORLD_HEIGHT - 140, laneColor, 0.07)
      .setStrokeStyle(1, laneColor, 0.35).setDepth(2);
    this.add.rectangle(70, WORLD_HEIGHT / 2 - 200, 30, 3, laneColor, 0.7).setDepth(2);
    this.add.rectangle(70, WORLD_HEIGHT / 2 + 200, 30, 3, laneColor, 0.7).setDepth(2);

    // Sector Omega (Enemy Zone) two-tone framing & brackets
    this.add.rectangle(WORLD_WIDTH - 220, WORLD_HEIGHT / 2, 304, WORLD_HEIGHT - 136, 0x020617, 0.35).setDepth(1);
    this.add.rectangle(WORLD_WIDTH - 220, WORLD_HEIGHT / 2, 300, WORLD_HEIGHT - 140, enemyColor, 0.07)
      .setStrokeStyle(1, enemyColor, 0.35).setDepth(2);
    this.add.rectangle(WORLD_WIDTH - 70, WORLD_HEIGHT / 2 - 200, 30, 3, enemyColor, 0.7).setDepth(2);
    this.add.rectangle(WORLD_WIDTH - 70, WORLD_HEIGHT / 2 + 200, 30, 3, enemyColor, 0.7).setDepth(2);

    // Contested-zone boundary markers — subtle faction-colored ground dividers
    this.add.line(370, WORLD_HEIGHT / 2, -5, -40, -5, 40, laneColor, 0.3).setDepth(2);
    this.add.line(WORLD_WIDTH - 370, WORLD_HEIGHT / 2, -5, -40, -5, 40, enemyColor, 0.3).setDepth(2);

    // Contested-lane guide chevrons — directional rhythm without gameplay coupling
    [560, 840, 1120].forEach((x) => {
      this.add.line(x, WORLD_HEIGHT / 2, -12, -8, 0, 0, 0x38bdf8, 0.22).setDepth(2);
      this.add.line(x, WORLD_HEIGHT / 2, 0, 0, -12, 8, 0x38bdf8, 0.22).setDepth(2);
    });
  }

  createAtmosphere() {
    const atmosphere = this.add.graphics().setDepth(-12);

    // A restrained sci-fi skybox: deterministic dust, distant beacons, and
    // lane lighting give the battlefield depth without obscuring gameplay.
    atmosphere.fillStyle(0x071526, 0.34);
    atmosphere.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    for (let i = 0; i < 54; i += 1) {
      const x = 36 + ((i * 277) % (WORLD_WIDTH - 72));
      const y = 92 + ((i * 149) % (WORLD_HEIGHT - 184));
      const radius = 1 + (i % 3);
      const color = i % 4 === 0 ? this.race.accent : (i % 3 === 0 ? 0x38bdf8 : 0x94a3b8);
      atmosphere.fillStyle(color, i % 4 === 0 ? 0.22 : 0.12);
      atmosphere.fillCircle(x, y, radius);
    }

    // Central command corridor: layered rings and directional chevrons.
    atmosphere.lineStyle(2, this.race.accent, 0.18);
    atmosphere.strokeCircle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 270);
    atmosphere.lineStyle(1, 0x7dd3fc, 0.13);
    atmosphere.strokeCircle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 292);
    atmosphere.lineStyle(2, 0xf97316, 0.15);
    atmosphere.lineBetween(430, WORLD_HEIGHT / 2, WORLD_WIDTH - 430, WORLD_HEIGHT / 2);

    for (let i = 0; i < 8; i += 1) {
      const x = 520 + i * 92;
      atmosphere.fillStyle(i % 2 === 0 ? this.race.accent : 0xf97316, 0.22);
      atmosphere.fillTriangle(x, WORLD_HEIGHT / 2 - 5, x + 16, WORLD_HEIGHT / 2, x, WORLD_HEIGHT / 2 + 5);
    }

    // Dark edge treatment keeps the playable center visually dominant.
    atmosphere.fillStyle(0x020617, 0.24);
    atmosphere.fillRect(0, 0, WORLD_WIDTH, 42);
    atmosphere.fillRect(0, WORLD_HEIGHT - 42, WORLD_WIDTH, 42);
    atmosphere.fillRect(0, 0, 42, WORLD_HEIGHT);
    atmosphere.fillRect(WORLD_WIDTH - 42, 0, 42, WORLD_HEIGHT);
  }

  createBattleTextures() {
    const palette = {
      navy: '#0f172a',
      navy2: '#1e293b',
      blue: '#2563eb',
      blue2: '#3b82f6',
      blue3: '#93c5fd',
      blue4: '#dbeafe',
      purple: '#7c3aed',
      purple2: '#a855f7',
      cyan: '#38bdf8',
      cyan2: '#0ea5e9',
      steel: '#64748b',
      steel2: '#e2e8f0',
      amber: '#f59e0b',
      lime: '#22c55e',
      mineral: '#67e8f9',
      mineral2: '#dbeafe',
      gas: '#c084fc',
      gas2: '#f0abfc',
      dark: '#020617',
      // Zerg palette (organic/bio)
      zergDark: '#1a0f08',
      zergRock: '#5c3a1e',
      zergMineral: '#f97316',
      zergMineral2: '#fb923c',
      zergGlow: '#fbbf24',
      zergGas: '#a855f7',
      zergGas2: '#c084fc',
      zergAmber: '#f59e0b',
      // Protoss palette (angular energy)
      protoDark: '#0c0918',
      protoRock: '#4a2d7a',
      protoMineral: '#a78bfa',
      protoMineral2: '#c4b5fd',
      protoGlow: '#818cf8',
      protoGas: '#c084fc',
      protoGas2: '#d8b4fe',
      protoAmber: '#fbbf24'
    };

    const makeTexture = (key, width, height, draw) => {
      if (this.textures.exists(key)) {
        return;
      }

      const texture = this.textures.createCanvas(key, width, height);
      const ctx = texture.context;
      ctx.clearRect(0, 0, width, height);
      draw(ctx, width, height, palette);
      texture.refresh();
      texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    };

    const fill = (ctx, x, y, w, h, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
    };

    const drawPanel = (ctx, x, y, w, h, outer, inner) => {
      fill(ctx, x, y, w, h, outer);
      fill(ctx, x + 2, y + 2, w - 4, h - 4, inner);
    };

    makeTexture('terran-command-center', 110, 72, (ctx, w, h, c) => {
      drawPanel(ctx, 10, 16, 90, 44, c.dark, c.navy2);
      fill(ctx, 16, 22, 78, 6, c.blue);
      fill(ctx, 18, 28, 74, 18, c.blue2);
      fill(ctx, 26, 8, 58, 18, c.blue3);
      fill(ctx, 34, 6, 42, 12, c.blue4);
      fill(ctx, 44, 12, 22, 4, c.cyan);
      fill(ctx, 26, 38, 58, 14, c.navy);
      fill(ctx, 20, 48, 70, 6, c.steel);
      fill(ctx, 12, 20, 8, 34, c.steel2);
      fill(ctx, 90, 20, 8, 34, c.steel2);
      fill(ctx, 15, 21, 4, 8, c.amber);
      fill(ctx, 91, 21, 4, 8, c.amber);
      fill(ctx, 50, 18, 10, 36, c.cyan2);
      fill(ctx, 52, 10, 6, 8, c.steel2);
      fill(ctx, 37, 24, 36, 4, c.dark);
      fill(ctx, 30, 34, 50, 3, c.cyan);
      fill(ctx, 24, 40, 62, 2, c.blue3);
    });

    makeTexture('terran-production', 88, 56, (ctx, w, h, c) => {
      drawPanel(ctx, 8, 12, 72, 36, c.dark, c.navy2);
      fill(ctx, 14, 16, 60, 6, c.blue);
      fill(ctx, 16, 22, 56, 10, c.blue2);
      fill(ctx, 20, 10, 48, 8, c.blue3);
      fill(ctx, 28, 8, 32, 4, c.blue4);
      fill(ctx, 18, 34, 52, 8, c.navy);
      fill(ctx, 12, 38, 64, 4, c.steel);
      fill(ctx, 10, 18, 4, 22, c.steel2);
      fill(ctx, 74, 18, 4, 22, c.steel2);
      fill(ctx, 22, 28, 10, 4, c.cyan);
      fill(ctx, 56, 28, 10, 4, c.cyan);
      fill(ctx, 40, 24, 8, 14, c.amber);
      fill(ctx, 34, 19, 20, 2, c.dark);
    });

    makeTexture('terran-tech-lab', 76, 52, (ctx, w, h, c) => {
      drawPanel(ctx, 7, 12, 62, 32, c.dark, c.navy2);
      fill(ctx, 14, 16, 48, 6, c.purple);
      fill(ctx, 16, 22, 44, 10, c.purple2);
      fill(ctx, 20, 8, 36, 8, c.blue3);
      fill(ctx, 26, 6, 24, 4, c.blue4);
      fill(ctx, 18, 32, 40, 6, c.navy);
      fill(ctx, 10, 36, 56, 4, c.steel);
      fill(ctx, 8, 18, 4, 18, c.steel2);
      fill(ctx, 64, 18, 4, 18, c.steel2);
      fill(ctx, 24, 28, 6, 4, c.gas2);
      fill(ctx, 46, 28, 6, 4, c.gas2);
      fill(ctx, 34, 20, 8, 14, c.cyan);
      fill(ctx, 30, 16, 16, 2, c.dark);
    });

    // --- Terran mineral (crystal cluster) 40x40 ---
    makeTexture('terran-mineral', 40, 40, (ctx, w, h, c) => {
      // Base rock platform
      fill(ctx, 6, 32, 28, 6, c.dark);
      fill(ctx, 8, 30, 24, 4, c.steel);
      // Left crystal (medium)
      fill(ctx, 8, 18, 9, 14, c.mineral2);
      fill(ctx, 10, 12, 7, 8, c.mineral);
      fill(ctx, 12, 8, 4, 6, c.blue4);
      // Center crystal (tallest)
      fill(ctx, 16, 10, 12, 18, c.mineral);
      fill(ctx, 18, 6, 8, 6, c.blue4);
      fill(ctx, 20, 4, 4, 4, c.blue3);
      fill(ctx, 21, 2, 2, 2, c.amber);
      // Right crystal (short)
      fill(ctx, 27, 16, 9, 14, c.cyan);
      fill(ctx, 29, 12, 5, 6, c.blue3);
      fill(ctx, 30, 10, 3, 4, c.blue4);
      // Highlights / facets
      fill(ctx, 17, 20, 4, 3, c.blue3);
      fill(ctx, 18, 24, 3, 3, c.blue4);
      fill(ctx, 28, 20, 3, 3, c.blue4);
      // Shadow edges
      fill(ctx, 6, 28, 3, 5, c.dark);
      fill(ctx, 31, 28, 3, 5, c.dark);
      // Sparkle on tallest crystal
      fill(ctx, 21, 0, 2, 2, c.amber);
    });

    // --- Terran gas (vented geyser) 36x36 ---
    makeTexture('terran-gas', 36, 36, (ctx, w, h, c) => {
      // Rock base
      fill(ctx, 4, 28, 28, 6, c.dark);
      fill(ctx, 6, 26, 24, 4, c.steel);
      // Left vent (tall)
      fill(ctx, 7, 14, 8, 14, c.gas2);
      fill(ctx, 9, 10, 5, 6, c.gas);
      fill(ctx, 10, 8, 3, 4, c.purple2);
      fill(ctx, 11, 6, 2, 3, c.gas);
      fill(ctx, 11, 4, 1, 2, c.gas2);
      // Right vent (shorter)
      fill(ctx, 19, 18, 8, 10, c.gas2);
      fill(ctx, 21, 14, 5, 6, c.gas);
      fill(ctx, 22, 12, 3, 4, c.purple2);
      // Center vent (medium)
      fill(ctx, 14, 16, 8, 12, c.gas);
      fill(ctx, 15, 12, 5, 6, c.purple2);
      fill(ctx, 17, 8, 3, 5, c.gas);
      // Bubbles / wisps
      fill(ctx, 8, 20, 3, 3, c.purple2);
      fill(ctx, 21, 22, 3, 3, c.purple2);
      fill(ctx, 15, 24, 6, 3, c.gas);
      // Steam wisps
      fill(ctx, 10, 6, 2, 3, c.purple2);
      fill(ctx, 23, 10, 2, 3, c.purple2);
      fill(ctx, 17, 4, 2, 3, c.gas);
      // Dark rim
      fill(ctx, 4, 26, 3, 4, c.dark);
      fill(ctx, 29, 26, 3, 4, c.dark);
    });

    // --- Zerg mineral (organic crystal cluster) 40x40 ---
    makeTexture('zerg-mineral', 40, 40, (ctx, w, h, c) => {
      // Organic base platform
      fill(ctx, 6, 32, 28, 6, c.zergDark);
      fill(ctx, 8, 30, 24, 4, c.zergRock);
      // Left crystal (organic bulb)
      fill(ctx, 9, 18, 8, 14, c.zergMineral2);
      fill(ctx, 11, 12, 5, 8, c.zergMineral);
      fill(ctx, 12, 9, 3, 5, c.zergGlow);
      fill(ctx, 13, 6, 2, 4, c.zergMineral);
      // Center crystal (tall, spiky)
      fill(ctx, 17, 8, 10, 20, c.zergMineral);
      fill(ctx, 19, 4, 6, 6, c.zergMineral2);
      fill(ctx, 20, 1, 4, 4, c.zergGlow);
      fill(ctx, 21, 0, 2, 2, c.zergAmber);
      // Right crystal (medium bulbous)
      fill(ctx, 27, 16, 8, 14, c.zergMineral2);
      fill(ctx, 29, 12, 5, 6, c.zergMineral);
      fill(ctx, 30, 9, 3, 4, c.zergGlow);
      // Organic detail bumps
      fill(ctx, 17, 20, 3, 3, c.zergGlow);
      fill(ctx, 19, 24, 3, 3, c.zergMineral2);
      fill(ctx, 28, 20, 3, 3, c.zergGlow);
      // Dark organic ridges
      fill(ctx, 6, 28, 3, 5, c.zergDark);
      fill(ctx, 31, 28, 3, 5, c.zergDark);
      // Amber glow dot (zerg signature)
      fill(ctx, 21, 0, 2, 2, c.zergAmber);
    });

    // --- Zerg gas (bio-geyser, pulsing organic vent) 36x36 ---
    makeTexture('zerg-gas', 36, 36, (ctx, w, h, c) => {
      // Organic base
      fill(ctx, 4, 28, 28, 6, c.zergDark);
      fill(ctx, 6, 26, 24, 4, c.zergRock);
      // Left vent (tall organic)
      fill(ctx, 7, 14, 8, 14, c.zergGas2);
      fill(ctx, 9, 10, 5, 6, c.zergGas);
      fill(ctx, 10, 7, 3, 5, c.zergGlow);
      fill(ctx, 11, 4, 2, 4, c.zergGas);
      // Right vent (short bulb)
      fill(ctx, 19, 18, 8, 10, c.zergGas2);
      fill(ctx, 21, 14, 5, 6, c.zergGas);
      fill(ctx, 22, 11, 3, 4, c.zergGlow);
      // Center vent (medium)
      fill(ctx, 14, 16, 8, 12, c.zergGas);
      fill(ctx, 15, 12, 5, 6, c.zergGlow);
      fill(ctx, 17, 8, 3, 5, c.zergGas);
      // Pulsing amber glow dots (zerg hallmark)
      fill(ctx, 10, 6, 2, 3, c.zergAmber);
      fill(ctx, 23, 10, 2, 3, c.zergAmber);
      fill(ctx, 17, 4, 2, 3, c.zergAmber);
      // Bubbles
      fill(ctx, 8, 20, 3, 3, c.zergGlow);
      fill(ctx, 21, 22, 3, 3, c.zergGlow);
      fill(ctx, 15, 24, 6, 3, c.zergGas);
      // Dark rim
      fill(ctx, 4, 26, 3, 4, c.zergDark);
      fill(ctx, 29, 26, 3, 4, c.zergDark);
    });

    // --- Protoss mineral (angular energy crystal) 40x40 ---
    makeTexture('protoss-mineral', 40, 40, (ctx, w, h, c) => {
      // Angular base platform
      fill(ctx, 6, 32, 28, 6, c.protoDark);
      fill(ctx, 8, 30, 24, 4, c.protoRock);
      // Left crystal (sharp angular)
      fill(ctx, 9, 16, 8, 14, c.protoMineral2);
      fill(ctx, 10, 10, 5, 8, c.protoMineral);
      fill(ctx, 12, 7, 3, 5, c.protoGlow);
      fill(ctx, 13, 4, 2, 4, c.protoMineral);
      // Center crystal (tall, faceted)
      fill(ctx, 16, 8, 12, 20, c.protoMineral);
      fill(ctx, 18, 4, 8, 6, c.protoMineral2);
      fill(ctx, 19, 1, 5, 4, c.protoGlow);
      fill(ctx, 20, 0, 3, 2, c.protoAmber);
      // Right crystal (sharp)
      fill(ctx, 27, 14, 8, 16, c.protoMineral2);
      fill(ctx, 29, 10, 5, 6, c.protoMineral);
      fill(ctx, 30, 7, 3, 4, c.protoGlow);
      // Angular facet highlights
      fill(ctx, 17, 18, 4, 3, c.protoGlow);
      fill(ctx, 18, 24, 3, 3, c.protoMineral2);
      fill(ctx, 28, 18, 3, 3, c.protoGlow);
      // Energy lines (protoss signature)
      fill(ctx, 16, 20, 8, 2, c.protoGlow);
      fill(ctx, 17, 24, 6, 2, c.protoMineral2);
      // Dark angular edges
      fill(ctx, 6, 28, 3, 5, c.protoDark);
      fill(ctx, 31, 28, 3, 5, c.protoDark);
    });

    // --- Protoss gas (energy geyser, clean angular vent) 36x36 ---
    makeTexture('protoss-gas', 36, 36, (ctx, w, h, c) => {
      // Angular base
      fill(ctx, 4, 28, 28, 6, c.protoDark);
      fill(ctx, 6, 26, 24, 4, c.protoRock);
      // Left vent (sharp)
      fill(ctx, 7, 14, 8, 14, c.protoGas2);
      fill(ctx, 9, 10, 5, 6, c.protoGas);
      fill(ctx, 10, 7, 3, 5, c.protoGlow);
      fill(ctx, 11, 4, 2, 4, c.protoGas);
      // Right vent (compact angular)
      fill(ctx, 19, 18, 8, 10, c.protoGas2);
      fill(ctx, 21, 14, 5, 6, c.protoGas);
      fill(ctx, 22, 11, 3, 4, c.protoGlow);
      // Center vent (medium)
      fill(ctx, 14, 16, 8, 12, c.protoGas);
      fill(ctx, 15, 12, 5, 6, c.protoGlow);
      fill(ctx, 17, 8, 3, 5, c.protoGas);
      // Energy glow accents (protoss hallmark)
      fill(ctx, 10, 6, 2, 3, c.protoGlow);
      fill(ctx, 23, 10, 2, 3, c.protoGlow);
      fill(ctx, 17, 4, 2, 3, c.protoGlow);
      // Energy beams (horizontal lines)
      fill(ctx, 8, 20, 4, 2, c.protoGlow);
      fill(ctx, 21, 22, 4, 2, c.protoGlow);
      fill(ctx, 15, 24, 6, 2, c.protoGas);
      // Dark angular edges
      fill(ctx, 4, 26, 3, 4, c.protoDark);
      fill(ctx, 29, 26, 3, 4, c.protoDark);
    });

    // --- Terran Supply Depot (64x48) ---
    makeTexture('terran-supply', 64, 48, (ctx, w, h, c) => {
      drawPanel(ctx, 6, 8, 52, 32, c.dark, c.navy2);
      fill(ctx, 10, 12, 44, 4, c.blue);
      fill(ctx, 12, 16, 40, 8, c.steel);
      fill(ctx, 14, 26, 36, 8, c.navy);
      fill(ctx, 10, 24, 44, 2, c.blue3);
      fill(ctx, 16, 18, 2, 6, c.steel2);
      fill(ctx, 30, 18, 2, 6, c.steel2);
      fill(ctx, 44, 18, 2, 6, c.steel2);
      fill(ctx, 14, 10, 6, 2, c.amber);
      fill(ctx, 44, 10, 6, 2, c.amber);
      fill(ctx, 8, 14, 3, 20, c.steel);
      fill(ctx, 53, 14, 3, 20, c.steel);
    });

    // --- Zerg Overgrowth (56x42) ---
    makeTexture('zerg-supply', 56, 42, (ctx, w, h, c) => {
      fill(ctx, 8, 30, 40, 6, c.zergDark);
      fill(ctx, 10, 28, 36, 4, c.zergRock);
      fill(ctx, 12, 16, 32, 14, c.zergMineral);
      fill(ctx, 16, 10, 24, 8, c.zergMineral2);
      fill(ctx, 20, 6, 16, 6, c.zergGlow);
      fill(ctx, 14, 20, 3, 8, c.zergGas);
      fill(ctx, 39, 20, 3, 8, c.zergGas);
      fill(ctx, 20, 14, 6, 4, c.zergAmber);
      fill(ctx, 30, 18, 4, 3, c.zergAmber);
      fill(ctx, 8, 26, 3, 6, c.zergDark);
      fill(ctx, 45, 26, 3, 6, c.zergDark);
    });

    // --- Protoss Assimilator (60x46) ---
    makeTexture('protoss-supply', 60, 46, (ctx, w, h, c) => {
      fill(ctx, 8, 32, 44, 6, c.protoDark);
      fill(ctx, 10, 30, 40, 4, c.protoRock);
      fill(ctx, 14, 18, 32, 14, c.protoMineral);
      fill(ctx, 18, 12, 24, 8, c.protoMineral2);
      fill(ctx, 22, 6, 16, 8, c.protoGlow);
      fill(ctx, 26, 2, 8, 6, c.protoAmber);
      fill(ctx, 20, 14, 2, 18, c.protoGlow);
      fill(ctx, 38, 14, 2, 18, c.protoGlow);
      fill(ctx, 24, 10, 12, 3, c.protoMineral2);
      fill(ctx, 8, 28, 3, 6, c.protoDark);
      fill(ctx, 49, 28, 3, 6, c.protoDark);
    });

    // --- Terran Bunker (72x54) ---
    makeTexture('terran-defense', 72, 54, (ctx, w, h, c) => {
      drawPanel(ctx, 8, 10, 56, 34, c.dark, c.navy2);
      fill(ctx, 12, 14, 48, 4, c.blue);
      fill(ctx, 14, 18, 44, 6, c.steel);
      fill(ctx, 16, 26, 40, 8, c.navy);
      fill(ctx, 12, 24, 48, 2, c.blue3);
      // Gun port (center)
      fill(ctx, 30, 28, 12, 6, c.dark);
      fill(ctx, 32, 30, 8, 4, c.blue);
      // Side armor plates
      fill(ctx, 10, 20, 3, 16, c.steel);
      fill(ctx, 59, 20, 3, 16, c.steel);
      // Warning lights
      fill(ctx, 14, 12, 6, 2, c.amber);
      fill(ctx, 52, 12, 6, 2, c.amber);
    });

    // --- Zerg Spore Colony (68x52) ---
    makeTexture('zerg-defense', 68, 52, (ctx, w, h, c) => {
      // Organic base
      fill(ctx, 10, 38, 48, 6, c.zergDark);
      fill(ctx, 12, 36, 44, 4, c.zergRock);
      // Spore dome (main body)
      fill(ctx, 14, 20, 40, 18, c.zergMineral);
      fill(ctx, 18, 14, 32, 8, c.zergMineral2);
      fill(ctx, 22, 10, 24, 6, c.zergGlow);
      fill(ctx, 28, 6, 12, 6, c.zergAmber);
      // Spore tendrils (attack indicators)
      fill(ctx, 16, 24, 3, 10, c.zergGas);
      fill(ctx, 28, 26, 3, 8, c.zergGas);
      fill(ctx, 40, 24, 3, 10, c.zergGas);
      // Pulsing nodes
      fill(ctx, 24, 18, 6, 4, c.zergAmber);
      fill(ctx, 38, 20, 4, 3, c.zergAmber);
      // Dark ridges
      fill(ctx, 10, 34, 3, 6, c.zergDark);
      fill(ctx, 55, 34, 3, 6, c.zergDark);
    });

    // --- Protoss Shield Generator (64x50) ---
    makeTexture('protoss-defense', 64, 50, (ctx, w, h, c) => {
      // Angular base platform
      fill(ctx, 8, 36, 48, 6, c.protoDark);
      fill(ctx, 10, 34, 44, 4, c.protoRock);
      // Shield dome (energy field)
      fill(ctx, 12, 20, 40, 16, c.protoMineral);
      fill(ctx, 16, 14, 32, 8, c.protoMineral2);
      fill(ctx, 20, 10, 24, 6, c.protoGlow);
      fill(ctx, 26, 6, 12, 6, c.protoAmber);
      // Energy arcs (shield field lines)
      fill(ctx, 18, 24, 2, 10, c.protoGlow);
      fill(ctx, 32, 26, 2, 8, c.protoGlow);
      fill(ctx, 44, 24, 2, 10, c.protoGlow);
      // Angular facet highlights
      fill(ctx, 24, 10, 16, 3, c.protoMineral2);
      // Dark edges
      fill(ctx, 8, 32, 3, 6, c.protoDark);
      fill(ctx, 53, 32, 3, 6, c.protoDark);
    });
  }

  createBattleFieldTitle() {
    this.banner = this.add.text(WORLD_WIDTH / 2, 24, `${this.race.name} advance`, {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: 'clamp(16px, 3vw, 24px)',
      fontStyle: '700',
      color: '#dbeafe',
      align: 'center'
    }).setOrigin(0.5, 0);
    this.banner.setScrollFactor(1);
  }

  // ── Minimap (top-left corner, shows units + camera viewport) ─────────
  createMinimap() {
    const mw = MINIMAP_WIDTH, mh = MINIMAP_HEIGHT;
    // Background panel
    this.minimapBg = this.add.rectangle(MINIMAP_X, MINIMAP_Y, mw, mh, 0x020617, 0.8)
      .setStrokeStyle(1, 0x334155, 0.6).setScrollFactor(0).setDepth(30);
    // Camera viewport rectangle (updated each frame)
    this.minimapViewport = this.add.rectangle(MINIMAP_X, MINIMAP_Y, mw * 0.3, mh * 0.4, 0x60a5fa, 0.12)
      .setStrokeStyle(1, 0x60a5fa, 0.5).setScrollFactor(0).setDepth(32);
    // Unit dots container (canvas texture for performance)
    this.minimapCanvas = this.add.graphics().setScrollFactor(0).setDepth(31);

    // Clickable overlay — tap to pan camera
    const minimapHit = this.add.rectangle(MINIMAP_X, MINIMAP_Y, mw, mh, 0x000000, 0)
      .setScrollFactor(0).setDepth(33).setInteractive({ useHandCursor: true });

    minimapHit.on('pointerdown', (pointer) => {
      const localX = pointer.x - MINIMAP_X;
      const localY = pointer.y - MINIMAP_Y;
      const worldX = (localX / MINIMAP_WIDTH) * WORLD_WIDTH;
      const worldY = (localY / MINIMAP_HEIGHT) * WORLD_HEIGHT;

      // Smoothly pan camera to clicked location
      const cam = this.cameras.main;
      const targetScrollX = Math.max(0, Math.min(worldX - cam.width / cam.zoom / 2, WORLD_WIDTH - cam.width / cam.zoom));
      const targetScrollY = Math.max(0, Math.min(worldY - cam.height / cam.zoom / 2, WORLD_HEIGHT - cam.height / cam.zoom));

      this.tweens.add({
        targets: { sx: cam.scrollX, sy: cam.scrollY },
        sx: targetScrollX,
        sy: targetScrollY,
        duration: 300,
        ease: 'Cubic.easeOut',
        onUpdate: (tween) => {
          cam.scrollX = tween.getValue('sx');
          cam.scrollY = tween.getValue('sy');
        }
      });
    });
  }

  updateMinimap() {
    if (!this.minimapCanvas || this.ended) return;
    const mw = MINIMAP_WIDTH, mh = MINIMAP_HEIGHT;
    const sx = mw / WORLD_WIDTH, sy = mh / WORLD_HEIGHT;

    this.minimapCanvas.clear();
    const ox = MINIMAP_X, oy = MINIMAP_Y;

    // Tactical anchors: base beacons and contested-lane spine
    this.minimapCanvas.lineStyle(1, 0x38bdf8, 0.35);
    this.minimapCanvas.lineBetween(ox + WORLD_WIDTH / 2 * sx, oy + 3, ox + WORLD_WIDTH / 2 * sx, oy + mh - 3);
    this.minimapCanvas.fillStyle(0x2563eb, 0.9);
    this.minimapCanvas.fillCircle(ox + 200 * sx, oy + WORLD_HEIGHT / 2 * sy, 4);
    this.minimapCanvas.fillStyle(0xf97316, 0.9);
    this.minimapCanvas.fillCircle(ox + (WORLD_WIDTH - 200) * sx, oy + WORLD_HEIGHT / 2 * sy, 4);

    // Resource nodes (small cyan dots)
    this.minimapCanvas.fillStyle(0x67e8f9, 0.5);
    this.resourceNodes.forEach((n) => {
      if (n.amount > 0) this.minimapCanvas.fillCircle(ox + n.x * sx, oy + n.y * sy, 1.5);
    });

    // Gas geysers (purple dots)
    this.minimapCanvas.fillStyle(0xa855f7, 0.4);
    this.gasGeysers.forEach((g) => {
      if (g.amount > 0) this.minimapCanvas.fillCircle(ox + g.x * sx, oy + g.y * sy, 1.5);
    });

    // Structures (small squares)
    this.structures.forEach((s) => {
      const color = s.team === 'player' ? 0x3b82f6 : (s.team === 'enemy' ? 0xf97316 : 0x64748b);
      this.minimapCanvas.fillStyle(color, s.hp > 0 ? 0.7 : 0);
      this.minimapCanvas.fillRect(ox + s.x * sx - 1.5, oy + s.y * sy - 1.5, 3, 3);
    });

    // Player units (blue dots)
    this.minimapCanvas.fillStyle(0x60a5fa, 0.7);
    this.playerUnits.forEach((u) => {
      if (u.hp > 0 && u.type !== 'worker') this.minimapCanvas.fillCircle(ox + u.x * sx, oy + u.y * sy, 1.5);
    });

    // Enemy units (orange dots) — only show when near player side or known
    this.minimapCanvas.fillStyle(0xf97316, 0.5);
    this.enemyUnits.forEach((u) => {
      if (u.hp > 0 && u.type !== 'worker') this.minimapCanvas.fillCircle(ox + u.x * sx, oy + u.y * sy, 1.5);
    });

    // Living workers (smaller economy dots)
    let workerDots = 0;
    this.minimapCanvas.fillStyle(0x86efac, 0.85);
    this.playerUnits.forEach((u) => {
      if (u.hp > 0 && u.type === 'worker') {
        this.minimapCanvas.fillCircle(ox + u.x * sx, oy + u.y * sy, 1.0);
        workerDots++;
      }
    });

    this.minimapCanvas.fillStyle(0xfdba74, 0.7);
    this.enemyUnits.forEach((u) => {
      if (u.hp > 0 && u.type === 'worker') {
        this.minimapCanvas.fillCircle(ox + u.x * sx, oy + u.y * sy, 1.0);
        workerDots++;
      }
    });
    this.minimapWorkerDots = workerDots;

    // Camera viewport rectangle
    const cam = this.cameras.main;
    const vw = (cam.width / cam.zoom) * sx, vh = (cam.height / cam.zoom) * sy;
    this.minimapViewport.setSize(vw, vh);
    this.minimapViewport.setPosition(ox + cam.scrollX * sx - vw / 2, oy + cam.scrollY * sy - vh / 2);
  }

  // ── Brief start-of-battle hint banner ─────────────────────────────
  showStartHint() {
    const { width, height } = this.scale;
    const cx = width / 2;

    // Hint background panel
    const hintBg = this.add.rectangle(cx, height - 140, Math.min(520, width - 60), 48, 0x1e3a5f, 0.9)
      .setStrokeStyle(1, 0x60a5fa, 0.5).setOrigin(0.5);

    // Hint text
    const hintText = this.add.text(cx, height - 140, 'Tap Move/Attack to command • HUD buttons build units & structures', {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: 'clamp(12px, 2.5vw, 16px)',
      fontStyle: '700',
      color: '#93c5fd'
    }).setOrigin(0.5);

    // Fade in, hold 4s, fade out
    this.tweens.addCounter({
      from: 0, to: 1, duration: 5500, ease: 'Sine.easeInOut',
      onUpdate: (tween) => {
        const p = tween.progress;
        let alpha;
        if (p < 0.1) alpha = p / 0.1; // fade in
        else if (p < 0.8) alpha = 1;   // hold
        else alpha = 1 - ((p - 0.8) / 0.2); // fade out
        hintBg.setAlpha(alpha * 0.9);
        hintText.setAlpha(alpha);
      },
      onComplete: () => { hintBg.destroy(); hintText.destroy(); }
    });
  }


  createMap() {
    const mineralSpots = [
      { x: WORLD_WIDTH / 2 - 130, y: WORLD_HEIGHT / 2 - 140 },
      { x: WORLD_WIDTH / 2 - 70, y: WORLD_HEIGHT / 2 - 40 },
      { x: WORLD_WIDTH / 2 - 135, y: WORLD_HEIGHT / 2 + 90 },
      { x: WORLD_WIDTH / 2 + 80, y: WORLD_HEIGHT / 2 - 120 },
      { x: WORLD_WIDTH / 2 + 150, y: WORLD_HEIGHT / 2 - 10 },
      { x: WORLD_WIDTH / 2 + 110, y: WORLD_HEIGHT / 2 + 110 }
    ];

    mineralSpots.forEach((spot, index) => {
      const node = this.createResourceNode(spot.x, spot.y, 900 + index * 60);
      // Start idle particle sparks for each mineral node
      if (this.particleManager) {
        this.particleManager.spawnIdleResourceSparks(node);
      }
    });
  }

  createGasGeysers() {
    const geysers = this.race.gasGeysers || [];
    const gasKey = this.race.id === 'zerg' ? 'zerg-gas'
      : this.race.id === 'protoss' ? 'protoss-gas'
      : 'terran-gas';
    const glowColor = this.race.id === 'zerg' ? 0xc084fc
      : this.race.id === 'protoss' ? 0x818cf8
      : 0xc084fc;

    geysers.forEach((g) => {
      const x = g.x * WORLD_WIDTH;
      const y = g.y * WORLD_HEIGHT;
      const amount = g.amount;

      const sprite = this.add.image(x, y, gasKey)
        .setDisplaySize(28, 28)
        .setAlpha(0.96);
      const glow = this.add.circle(x, y, 20, glowColor, 0.12)
        .setAlpha(0.15);
      const label = this.add.text(x, y + 20, `Gas • ${amount}`, {
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: '10px',
        fontStyle: '800',
        color: '#f3e8ff'
      }).setOrigin(0.5);

      const entity = {
        id: this.nextId += 1,
        type: 'gasGeyser',
        team: 'neutral',
        label: 'Gas Geyser',
        x,
        y,
        amount,
        maxAmount: amount,
        radius: 14,
        sprite,
        glow,
        labelText: label,
        assignedWorkers: 0,
        maxWorkers: 3
      };

      // Start continuous gas particle emission for this geyser
      if (this.particleManager) {
        this.particleManager.startGeyserEmission(entity);
      }

      this.gasGeysers.push(entity);
    });
  }

  spawnStartingForces() {
    this.playerCommandCenter = this.createStructure('player', 'commandCenter', 200, WORLD_HEIGHT / 2, { active: true });
    this.enemyCommandCenter = this.createStructure('enemy', 'commandCenter', WORLD_WIDTH - 200, WORLD_HEIGHT / 2, { active: true });

    this.playerUnits = [];
    this.enemyUnits = [];

    const playerWorkerOffsets = [
      { x: -35, y: -30 },
      { x: -10, y: 28 },
      { x: 26, y: -12 },
      { x: 36, y: 22 }
    ];

    // Assign first 2 workers to minerals, next 2 to gas
    playerWorkerOffsets.slice(0, Math.min(2, this.race.startWorkers)).forEach((offset, index) => {
      this.createUnit('player', 'worker', 250 + offset.x, WORLD_HEIGHT / 2 + offset.y, { autoHarvest: true, homeStructure: this.playerCommandCenter, initialDelay: index * 0.15, harvestType: 'minerals' });
    });

    // Assign remaining workers to gas if available
    const gasGeysers = this.gasGeysers;
    if (gasGeysers.length > 0) {
      const gasWorkers = playerWorkerOffsets.slice(2, this.race.startWorkers);
      gasWorkers.forEach((offset, index) => {
        const geyser = gasGeysers[index % gasGeysers.length];
        this.createUnit('player', 'worker', 250 + offset.x, WORLD_HEIGHT / 2 + offset.y, { autoHarvest: true, homeStructure: this.playerCommandCenter, initialDelay: index * 0.15, harvestType: 'gas', geyserId: geyser.id });
      });
    }

    for (let index = 0; index < this.race.startSoldiers; index += 1) {
      this.createUnit('player', 'soldier', 285 + index * 24, WORLD_HEIGHT / 2 + 56 + index * 16, { mode: 'guard' });
    }

    this.createStructure('player', 'production', 320, WORLD_HEIGHT / 2 - 150, { active: true, construction: false, buildProgress: 1, roleName: this.race.productionName });
    this.playerSupplyCap += this.race.structures.production.supplyBonus;

    // Enemy workers (2 workers, no gas assignment initially)
    this.createUnit('enemy', 'worker', WORLD_WIDTH - 250, WORLD_HEIGHT / 2 - 30, { autoHarvest: true, homeStructure: this.enemyCommandCenter, initialDelay: 0.1, harvestType: 'minerals' });
    this.createUnit('enemy', 'worker', WORLD_WIDTH - 220, WORLD_HEIGHT / 2 + 34, { autoHarvest: true, homeStructure: this.enemyCommandCenter, initialDelay: 0.3, harvestType: 'minerals' });

    // Enemy soldier
    this.createUnit('enemy', 'soldier', WORLD_WIDTH - 280, WORLD_HEIGHT / 2 + 78, { mode: 'guard', autoAggro: true, enemyKind: 'enemySoldier' });
  }

  createResourceNode(x, y, amount = 1000) {
    const mineralKey = this.race.id === 'zerg' ? 'zerg-mineral'
      : this.race.id === 'protoss' ? 'protoss-mineral'
      : 'terran-mineral';
    const glowColor = this.race.id === 'zerg' ? 0xfb923c
      : this.race.id === 'protoss' ? 0x818cf8
      : 0x60a5fa;

    const sprite = this.add.image(x, y, mineralKey)
      .setDisplaySize(24, 24)
      .setAlpha(0.96);
    const glow = this.add.circle(x, y, 20, glowColor, 0.12)
      .setAlpha(0.15);
    const label = this.add.text(x, y + 20, `Minerals • ${amount}`, {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: '10px',
      fontStyle: '800',
      color: '#eff6ff'
    }).setOrigin(0.5);

    const entity = {
      id: this.nextId += 1,
      type: 'resource',
      team: 'neutral',
      label: 'Mineral Field',
      x,
      y,
      amount,
      maxAmount: amount,
      radius: 12,
      sprite,
      glow,
      labelText: label
    };

    this.resourceNodes.push(entity);
    return entity;
  }

  createStructure(team, role, x, y, options = {}) {
    const baseDef = role === 'commandCenter' ? this.race.structures.commandCenter :
                    role === 'techBuilding' ? this.race.structures.techBuilding :
                    role === 'supplyStructure' ? this.race.structures.supplyStructure :
                    role === 'defenseStructure' ? this.race.structures.defenseStructure :
                    this.race.structures.production;
    const width = baseDef.width;
    const height = baseDef.height;
    const active = options.active ?? true;
    const construction = options.construction ?? false;
    const roleName = options.roleName ?? (role === 'commandCenter' ? this.race.commandCenterName : role === 'techBuilding' ? this.race.techBuildingName : role === 'supplyStructure' ? this.race.supplyStructureName : role === 'defenseStructure' ? this.race.defenseStructureName : this.race.productionName);
    const textureKey = role === 'commandCenter'
      ? (this.race.id === 'zerg' ? 'zerg-command-center' : this.race.id === 'protoss' ? 'protoss-command-center' : 'terran-command-center')
      : role === 'techBuilding'
        ? (this.race.id === 'zerg' ? 'zerg-tech' : this.race.id === 'protoss' ? 'protoss-tech' : 'terran-factory')
        : role === 'supplyStructure'
          ? (this.race.id === 'zerg' ? 'zerg-supply' : this.race.id === 'protoss' ? 'protoss-supply' : 'terran-supply')
          : role === 'defenseStructure'
            ? (this.race.id === 'zerg' ? 'zerg-defense' : this.race.id === 'protoss' ? 'protoss-defense' : 'terran-defense')
            : (this.race.id === 'zerg' ? 'zerg-production' : this.race.id === 'protoss' ? 'protoss-production' : 'terran-barracks');

    const shadow = this.add.rectangle(x + 4, y + height * 0.35, width + 10, height * 0.48, 0x000000, 0.38)
      .setDepth(4);

    const sDepth = 10 + Math.floor(y * 0.03);
    const sprite = this.add.image(x, y, textureKey)
      .setDisplaySize(width, height)
      .setAlpha(construction ? 0.7 : 0.98)
      .setDepth(sDepth);
    if (team === 'enemy') {
      sprite.setTint(0xc2410c);
    }
    const ridge = this.add.rectangle(x, y - height / 2 + 8, width - 18, 4, 0xffffff, construction ? 0.16 : 0.22).setDepth(sDepth + 1);
    const coreColor = team === 'enemy' ? 0xff6b35 : this.race.accent;
    const core = this.add.rectangle(x, y + height * 0.32, width * 0.35, 5, coreColor, construction ? 0.12 : 0.45)
      .setDepth(sDepth + 2);
    const labelText = this.add.text(x, y - 5, roleName, {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: 'clamp(10px, 2vw, 14px)',
      fontStyle: '700',
      color: '#ffffff',
      align: 'center',
      wordWrap: { width: width - 8 }
    }).setOrigin(0.5).setDepth(sDepth + 1);

    const hpBack = this.add.rectangle(x, y + height / 2 + 10, width + 8, 6, 0x0f172a, 1).setDepth(sDepth + 1);
    const hpFront = this.add.rectangle(x - (width + 8) / 2, y + height / 2 + 10, width + 8, 6, team === 'player' ? 0x22c55e : 0xfb7185, 1)
      .setOrigin(0, 0.5).setDepth(sDepth + 1);
    const critStructureIndicator = this.add.ellipse(x, y, width + 12, height + 12, 0xef4444, 0)
      .setStrokeStyle(2, 0xf87171, 0.9).setDepth(sDepth - 1).setVisible(false);
    const statusText = this.add.text(x, y + height / 2 + 24, construction ? 'Construction' : 'Operational', {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: 'clamp(10px, 1.9vw, 13px)',
      color: '#cbd5e1',
      align: 'center'
    }).setOrigin(0.5).setDepth(sDepth + 1);

    const entity = {
      id: this.nextId += 1,
      type: construction ? 'construction' : 'structure',
      team,
      role,
      roleName,
      x,
      y,
      width,
      height,
      active,
      hp: baseDef.maxHp,
      maxHp: baseDef.maxHp,
      supplyBonus: baseDef.supplyBonus,
      queue: [],
      buildProgress: options.buildProgress ?? 0,
      buildTimeRemaining: options.buildTimeRemaining ?? baseDef.buildTime,
      spawnOffset: role === 'commandCenter' ? { x: 74, y: 0 } : { x: 58, y: -6 },
      shadow,
      sprite,
      ridge,
      core,
      labelText,
      hpBack,
      hpFront,
      critStructureIndicator,
      statusText
    };

    this.structures.push(entity);
    if (construction) {
      this.constructions.push(entity);
    }
    return entity;
  }

  createUnit(team, kind, x, y, options = {}) {
    const def = getUnitDef(this.race, team, kind, options.enemyKind);
    let spriteKey;
    if (this.race.id === 'protoss') {
      if (kind === 'worker') spriteKey = 'protoss-probe';
      else if (kind === 'soldier') spriteKey = 'protoss-zealot';
      else if (kind === 'signature') spriteKey = 'protoss-dragoon';
      else spriteKey = 'protoss-zealot';
    } else if (this.race.id === 'zerg') {
      if (kind === 'worker') spriteKey = 'zerg-drone';
      else if (kind === 'soldier') spriteKey = 'zerg-zergling';
      else if (kind === 'signature') spriteKey = 'zerg-hydralisk';
      else spriteKey = 'zerg-zergling';
    } else {
      if (kind === 'worker') spriteKey = 'terran-scv';
      else if (kind === 'soldier') spriteKey = 'terran-marine';
      else if (kind === 'signature') spriteKey = 'terran-marauder';
      else spriteKey = 'terran-marine';
    }

    const shadow = this.add.ellipse(x, y + def.radius * 0.4, def.radius * 1.8, def.radius * 0.5, 0x000000, 0.5)
      .setDepth(4);
    const teamMarker = this.add.circle(x, y + def.radius * 0.15, def.radius * 0.45, team === 'player' ? this.race.accent : 0xf97316, 0.14)
      .setStrokeStyle(1, team === 'player' ? this.race.accent : 0xf97316, 0.36)
      .setDepth(5);
    const roleRing = this.add.circle(x, y, def.radius + 3, 0x000000, 0)
      .setStrokeStyle(1.5, team === 'player' ? this.race.accent : 0xf97316, kind === 'worker' ? 0.55 : 0.8)
      .setDepth(5);

    const uDepth = 10 + Math.floor(y * 0.03);
    const sprite = this.add.image(x, y, spriteKey);
    sprite.setDisplaySize(def.radius * 2, def.radius * 2).setDepth(uDepth);
    if (team === 'enemy') {
      sprite.setTint(0xc2410c);
    }

    const labelText = null;
    const hpBack = this.add.rectangle(x, y + def.radius + 8, def.radius * 2 + 8, 5, 0x0f172a, 1).setDepth(uDepth + 1);
    const hpFront = this.add.rectangle(x - (def.radius * 2 + 8) / 2, y + def.radius + 8, def.radius * 2 + 8, 5, team === 'player' ? 0x22c55e : 0xfb7185, 1)
      .setOrigin(0, 0.5).setDepth(uDepth + 1);
    const critIndicator = this.add.circle(x, y, def.radius + 4, 0xef4444, 0)
      .setStrokeStyle(2, 0xf87171, 0.9).setDepth(uDepth - 1).setVisible(false);

    const statusLabels = {
      guard: 'Guard',
      harvest: 'Harvest',
      gasHarvest: 'Mining Gas',
      construct: 'Constructing',
      move: 'Moving',
      attack: 'Attack Move',
      idle: 'Idle'
    };

    const statusText = this.add.text(x, y + def.radius + 20, statusLabels[options.mode] ?? (kind === 'worker' ? (options.harvestType === 'gas' ? 'Mining Gas' : 'Harvest') : 'Guard'), {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: 'clamp(9px, 1.6vw, 11px)',
      color: '#cbd5e1',
      align: 'center'
    }).setOrigin(0.5).setDepth(uDepth + 1);

    const entity = {
      id: this.nextId += 1,
      type: kind,
      team,
      label: def.label,
      x,
      y,
      vx: 0,
      vy: 0,
      shadow,
      teamMarker,
      roleRing,
      hp: def.hp,
      maxHp: def.maxHp,
      speed: def.speed,
      attack: def.attack,
      range: def.range,
      cooldownTime: def.cooldown,
      cooldown: options.initialCooldown ?? 0,
      // Shield properties (Protoss units)
      shield: def.shield ?? 0,
      maxShield: def.maxShield ?? 0,
      shieldRegenDelay: 5, // seconds of no damage before regen starts
      lastDamageTime: 0,
      // Charge ability (Zealot)
      chargeCooldown: def.chargeCooldown ?? 0,
      chargeDamage: def.chargeDamage ?? 0,
      chargeDashDist: def.chargeDashDist ?? 0,
      chargeTimer: 0,
      isCharging: false,
      chargeTargetX: x,
      chargeTargetY: y,
      supply: def.supply,
      cargo: 0,
      cargoTarget: kind === 'worker' ? (options.harvestType === 'gas' ? this.race.workerGasHarvest : this.race.workerHarvest) : 0,
      autoHarvest: options.autoHarvest ?? kind === 'worker',
      homeStructure: options.homeStructure ?? this.playerCommandCenter,
      targetX: x,
      targetY: y,
      targetEntity: null,
      order: options.mode ?? (kind === 'worker' ? (options.harvestType === 'gas' ? 'gasHarvest' : 'harvest') : 'guard'),
      harvestState: 'toNode',
      harvestNodeId: null,
      manual: false,
      buildTargetId: null,
      buildSite: null,
      sprite,
      labelText,
      hpBack,
      hpFront,
      critIndicator,
      statusText,
      motionScale: 1,
      motionState: 'idle',
      radius: def.radius,
      color: def.color,
      harvestType: options.harvestType ?? null,
      geyserId: options.geyserId ?? null,
      isSignature: options.isSignature ?? false,
      // Stimpack state (Terran Marine only)
      stimpackActive: false,
      stimpackRemaining: 0,
      stimpackCooldown: 0,
      stimpackOriginalSpeed: def.speed,
      stimpackOriginalAttack: def.attack,
      stimpackGlow: null
    };

    if (kind !== 'worker') {
      entity.energyHalo = this.add.circle(x, y, def.radius * 1.3, team === 'player' ? this.race.accent : 0xf97316, 0)
        .setStrokeStyle(2, team === 'player' ? this.race.accent : 0xf97316, 0)
        .setDepth(uDepth - 1);
    }

    if (team === 'player') {
      this.playerUnits.push(entity);
    } else {
      this.enemyUnits.push(entity);
    }
    this.units.push(entity);

    if (kind === 'worker') {
      entity.order = options.harvestType === 'gas' ? 'gasHarvest' : 'harvest';
    }

    return entity;
  }

  // Thin wrapper that delegates to the pure helper in src/game/unitDefs.js.
  getUnitDef(team, kind, enemyKind) {
    return getUnitDef(this.race, team, kind, enemyKind);
  }

  // --- Touch/mouse input for panning, box-select, and tapping ---
  installPointerControls() {
    this.dragState = null;

    this.input.on('pointerdown', (pointer) => {
      if (this.isUiPointer(pointer)) {
        return;
      }

      this.dragState = {
        startX: pointer.x,
        startY: pointer.y,
        camX: this.cameras.main.scrollX,
        camY: this.cameras.main.scrollY,
        moved: false,
        isTouch: Boolean(pointer.wasTouch || pointer.pointerType === 'touch'),
        isBoxSelect: false,
        startedOnEntity: Boolean(this.hitTest(pointer.worldX, pointer.worldY))
      };
    });

    this.input.on('pointermove', (pointer) => {
      if (!this.dragState || !pointer.isDown) {
        return;
      }

      const dx = pointer.x - this.dragState.startX;
      const dy = pointer.y - this.dragState.startY;

      if (!this.dragState.moved && Math.hypot(dx, dy) > TAP_DRAG_THRESHOLD && !this.dragState.startedOnEntity) {
        this.dragState.moved = true;
        if (!this.dragState.isTouch) {
          this.dragState.isBoxSelect = true;
        }
      }

      if (this.dragState.moved) {
        if (this.dragState.isBoxSelect) {
          if (!this.selectionBoxGraphics) {
            this.selectionBoxGraphics = this.add.graphics().setScrollFactor(0).setDepth(999);
          }
          this.selectionBoxGraphics.clear();
          const minX = Math.min(this.dragState.startX, pointer.x);
          const maxX = Math.max(this.dragState.startX, pointer.x);
          const minY = Math.min(this.dragState.startY, pointer.y);
          const maxY = Math.max(this.dragState.startY, pointer.y);
          const w = maxX - minX;
          const h = maxY - minY;
          this.selectionBoxGraphics.fillStyle(0x38bdf8, 0.15);
          this.selectionBoxGraphics.fillRect(minX, minY, w, h);
          this.selectionBoxGraphics.lineStyle(1.5, 0x38bdf8, 0.9);
          this.selectionBoxGraphics.strokeRect(minX, minY, w, h);
        } else {
          this.cameras.main.scrollX = this.dragState.camX - dx / this.cameras.main.zoom;
          this.cameras.main.scrollY = this.dragState.camY - dy / this.cameras.main.zoom;
          clampCamera(this.cameras.main);
        }
      }
    });

    this.input.on('pointerup', (pointer) => {
      if (!this.dragState) {
        return;
      }

      const wasDrag = this.dragState.moved;
      const wasBoxSelect = this.dragState.isBoxSelect;
      const startX = this.dragState.startX;
      const startY = this.dragState.startY;
      this.dragState = null;

      if (this.selectionBoxGraphics) {
        this.selectionBoxGraphics.destroy();
        this.selectionBoxGraphics = null;
      }

      if (wasBoxSelect) {
const pStart = { x: (startX / this.cameras.main.zoom) + this.cameras.main.scrollX, y: (startY / this.cameras.main.zoom) + this.cameras.main.scrollY };
const pEnd = { x: (pointer.x / this.cameras.main.zoom) + this.cameras.main.scrollX, y: (pointer.y / this.cameras.main.zoom) + this.cameras.main.scrollY };
const boxLeft = Math.min(pStart.x, pEnd.x);
const boxRight = Math.max(pStart.x, pEnd.x);
const boxTop = Math.min(pStart.y, pEnd.y);
const boxBottom = Math.max(pStart.y, pEnd.y);

        const selected = this.units.filter((unit) =>
          unit.team === 'player' &&
          unit.hp > 0 &&
          unit.type !== 'worker' &&
          unit.type !== 'structure' &&
          unit.type !== 'construction' &&
          unit.x >= boxLeft && unit.x <= boxRight &&
          unit.y >= boxTop && unit.y <= boxBottom
        );

        if (selected.length > 0) {
          this.selectEntities(selected);
        } else {
          this.clearSelection();
        }
        return;
      }

      if (!wasDrag) {
        if (this.ended) {
          if (this.endTapReady) {
            this.returnToMenu();
          }
          return;
        }

        if (!this.isUiPointer(pointer)) {
          this.handleTap(pointer.worldX, pointer.worldY);
        }
      }
    });
  }

  // --- Pinch-to-zoom for touch devices ---
  installPinchZoom() {
    const camera = this.cameras.main;

    this.input.on('pointerdown', (pointer) => {
      // Count active pointers (excluding UI area)
      const activePointers = this.input.activePointers.filter((p) => !this.isUiPointer(p));

      if (activePointers.length === 2 && !this.touchZoomState) {
        if (this.selectionBoxGraphics) {
          this.selectionBoxGraphics.destroy();
          this.selectionBoxGraphics = null;
        }
        if (this.dragState) {
          this.dragState = null;
        }
        // Start pinch zoom
        const p1 = activePointers[0];
        const p2 = activePointers[1];
        this.lastPinchDist = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
        this.lastPinchCenter = {
          x: (p1.x + p2.x) / 2,
          y: (p1.y + p2.y) / 2
        };
        this.touchZoomState = {
          startZoom: camera.zoom,
          startScrollX: camera.scrollX,
          startScrollY: camera.scrollY
        };
      }
    });

    this.input.on('pointermove', (pointer) => {
      if (!this.touchZoomState) {
        return;
      }

      const activePointers = this.input.activePointers.filter((p) => !this.isUiPointer(p));
      if (activePointers.length < 2) {
        this.touchZoomState = null;
        return;
      }

      const p1 = activePointers[0];
      const p2 = activePointers[1];
      const currentDist = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);

      if (this.lastPinchDist > 0) {
        const zoomDelta = (currentDist - this.lastPinchDist) / 300;
        const newZoom = Phaser.Math.Clamp(
          this.touchZoomState.startZoom + zoomDelta,
          MIN_ZOOM,
          MAX_ZOOM
        );

        // Zoom toward pinch center
        const zoomRatio = newZoom / this.touchZoomState.startZoom;
        const pinchWorldX = this.lastPinchCenter.x;
        const pinchWorldY = this.lastPinchCenter.y;

        camera.zoom = newZoom;
        camera.scrollX = this.touchZoomState.startScrollX + (pinchWorldX - this.touchZoomState.startScrollX) * (1 - zoomRatio);
        camera.scrollY = this.touchZoomState.startScrollY + (pinchWorldY - this.touchZoomState.startScrollY) * (1 - zoomRatio);

        clampCamera(camera);
      }

      this.lastPinchDist = currentDist;
    });

    this.input.on('pointerup', (pointer) => {
      const activePointers = this.input.activePointers.filter((p) => !this.isUiPointer(p));
      if (activePointers.length < 2) {
        this.touchZoomState = null;
        this.lastPinchDist = 0;
      }
    });

    // Double-tap to zoom in, double-tap to zoom out (on non-touch devices, double-click)
    this.input.on('doubletap', (pointer) => {
      if (this.isUiPointer(pointer)) return;

      const currentZoom = camera.zoom;
      const newZoom = Math.min(MAX_ZOOM, currentZoom + ZOOM_STEP);
      const zoomRatio = newZoom / currentZoom;

      camera.zoom = newZoom;
      camera.scrollX = camera.scrollX + (pointer.worldX - camera.scrollX) * (1 - zoomRatio);
      camera.scrollY = camera.scrollY + (pointer.worldY - camera.scrollY) * (1 - zoomRatio);
      clampCamera(camera);
    });

    this.input.on('tripletap', (pointer) => {
      if (this.isUiPointer(pointer)) return;

      const currentZoom = camera.zoom;
      const newZoom = Math.max(MIN_ZOOM, currentZoom - ZOOM_STEP * 2);
      const zoomRatio = newZoom / currentZoom;

      camera.zoom = newZoom;
      camera.scrollX = camera.scrollX + (pointer.worldX - camera.scrollX) * (1 - zoomRatio);
      camera.scrollY = camera.scrollY + (pointer.worldY - camera.scrollY) * (1 - zoomRatio);
      clampCamera(camera);
    });
  }

  isUiPointer(pointer) {
    return pointer.y <= TOP_UI_HEIGHT || pointer.y >= this.scale.height - BOTTOM_UI_HEIGHT;
  }

  hitTest(worldX, worldY) {
    for (let index = this.structures.length - 1; index >= 0; index -= 1) {
      const entity = this.structures[index];
      if (this.containsPoint(entity, worldX, worldY)) {
        return entity;
      }
    }

    for (let index = this.units.length - 1; index >= 0; index -= 1) {
      const entity = this.units[index];
      if (this.containsPoint(entity, worldX, worldY)) {
        return entity;
      }
    }

    return null;
  }

  containsPoint(entity, worldX, worldY) {
    if (entity.type === 'resource') {
      return Phaser.Math.Distance.Between(entity.x, entity.y, worldX, worldY) <= entity.radius + 6;
    }

    if (entity.type === 'gasGeyser') {
      return Phaser.Math.Distance.Between(entity.x, entity.y, worldX, worldY) <= entity.radius + 6;
    }

    if (entity.type === 'structure' || entity.type === 'construction') {
      return worldX >= entity.x - entity.width / 2 && worldX <= entity.x + entity.width / 2 && worldY >= entity.y - entity.height / 2 && worldY <= entity.y + entity.height / 2;
    }

    return Phaser.Math.Distance.Between(entity.x, entity.y, worldX, worldY) <= entity.radius + 8;
  }

  handleTap(worldX, worldY) {
    const hit = this.hitTest(worldX, worldY);
    const selected = this.selectedEntity;
    const commandableUnits = (this.selectedEntities?.length > 0 ? this.selectedEntities : (selected ? [selected] : [])).filter((u) => this.canDirectCommand(u));

    if (hit) {
      if (commandableUnits.length > 0 && hit.team === 'enemy') {
        commandableUnits.forEach((u) => this.issueAttackTarget(u, hit));
        this.showTapIndicator(hit.x, hit.y, 'attack');
        this.syncSession('Attack order issued.');
        return;
      }
      this.selectEntity(hit);
      return;
    }

    if (commandableUnits.length > 0) {
      if (commandableUnits.length === 1 && selected?.type === 'worker' && !selected.autoHarvest) {
        const geyser = this.gasGeysers.find((g) => Phaser.Math.Distance.Between(g.x, g.y, worldX, worldY) <= g.radius + 16 && g.assignedWorkers < g.maxWorkers);
        if (geyser) {
          this.assignWorkerToGas(selected, geyser);
          this.syncSession('Worker assigned to gas geyser.');
          return;
        }
      }

      if (this.commandMode === 'attack') {
        commandableUnits.forEach((u) => this.issueAttackMove(u, worldX, worldY));
        this.commandMode = 'select';
        this.showTapIndicator(worldX, worldY, 'attack');
        this.syncSession('Attack move issued.');
        return;
      }

      commandableUnits.forEach((u) => this.issueMove(u, worldX, worldY));
      this.commandMode = 'select';
      this.showTapIndicator(worldX, worldY, 'move');
      this.syncSession('Move order issued.');
      return;
    }

    if (!selected || this.commandMode === 'select') {
      this.showDeselectRipple(worldX, worldY);
    }
    this.clearSelection();
  }

  selectEntity(entity) {
    this.selectedEntities = entity ? [entity] : [];
    this.selectedEntity = entity || null;
    this.commandMode = 'select';
    if (entity) {
      this.visualPolish?.onSelect(entity);
      this.showSelectionHighlight(entity);
      this.syncSession(`Selected ${entity.label}.`);
      if (this.audioManager) this.audioManager.select(entity);
    } else {
      this.clearSelectionHighlight();
      this.syncSession('Selection cleared.');
    }
  }

  selectEntities(entities) {
    if (!entities || entities.length === 0) {
      this.clearSelection();
      return;
    }
    if (entities.length === 1) {
      this.selectEntity(entities[0]);
      return;
    }
    this.selectedEntities = [...entities];
    this.selectedEntity = entities[0];
    this.commandMode = 'select';
    this.visualPolish?.onSelect(this.selectedEntity);
    this.showMultiSelectionHighlights(this.selectedEntities);
    this.syncSession(`Selected squad of ${entities.length} units.`);
    if (this.audioManager) this.audioManager.select(this.selectedEntity);
  }

  clearSelection() {
    const previousSelection = this.selectedEntity;
    this.selectedEntity = null;
    this.selectedEntities = [];
    this.commandMode = 'select';
    this.clearSelectionHighlight();
    this.syncSession('Selection cleared.');
    // Audio feedback: deselect blip.
    if (this.audioManager) this.audioManager.deselect(previousSelection);
  }

  handleHudAction(action) {
    if (action === 'pause') {
      this.togglePause();
      return;
    }

    if (action === 'select') {
      this.commandMode = 'select';
      this.syncSession('Command mode cleared.');
      return;
    }

    const defaultWorker = this.findPlayerWorker();
    const defaultProduction = this.findPlayerProduction();

    if (!this.selectedEntity || this.selectedEntity.team !== 'player') {
      // Audio: error buzz for unavailable actions.
      if (this.audioManager) this.audioManager.error();
      this.commandMode = action === 'move' || action === 'attack' ? action : 'select';
      this.syncSession('Select one of your units or structures first.');
      return;
    }

    switch (action) {
      case 'move':
        this.commandMode = action;
        // Audio: low whoosh for move command.
        if (this.audioManager) this.audioManager.moveCommand();
        this.syncSession(`Command mode: ${action}. Tap the battlefield to issue the order.`);
        break;
      case 'attack':
        this.commandMode = action;
        // Audio: sharper whoosh for attack command.
        if (this.audioManager) this.audioManager.attackCommand();
        this.syncSession(`Command mode: ${action}. Tap the battlefield to issue the order.`);
        break;
      case 'train-worker':
        this.queueUnit(this.playerCommandCenter ?? defaultWorker, 'worker');
        break;
      case 'train-soldier':
        this.queueUnit(defaultProduction, 'soldier');
        break;
      case 'train-signature':
        this.queueUnit(defaultProduction, 'signature');
        break;
      case 'build-production':
        this.startConstructionForWorker(this.selectedEntity?.type === 'worker' && this.selectedEntity.team === 'player' ? this.selectedEntity : defaultWorker, 'production');
        break;
      case 'build-tech':
        this.startConstructionForWorker(this.selectedEntity?.type === 'worker' && this.selectedEntity.team === 'player' ? this.selectedEntity : defaultWorker, 'techBuilding');
        break;
      case 'build-supply':
        this.startConstructionForWorker(this.selectedEntity?.type === 'worker' && this.selectedEntity.team === 'player' ? this.selectedEntity : defaultWorker, 'supplyStructure');
        break;
      case 'build-defense':
        this.startConstructionForWorker(this.selectedEntity?.type === 'worker' && this.selectedEntity.team === 'player' ? this.selectedEntity : defaultWorker, 'defenseStructure');
        break;
      default:
        this.syncSession('Command unavailable.');
        break;
    }
  }

  togglePause() {
    this.paused = !this.paused;
    session.setMessage(this.paused ? 'Paused — tap Pause again to resume.' : 'Battle resumed.');
    this.syncSession(this.paused ? 'Paused.' : 'Resumed.');
  }

  findPlayerProduction() {
    return this.structures.find((structure) => structure.team === 'player' && structure.type === 'structure' && structure.role === 'production');
  }

  findPlayerWorker() {
    return this.units.find((unit) => unit.team === 'player' && unit.type === 'worker' && unit.hp > 0) ?? this.defaultWorker ?? null;
  }

  findPlayerTechBuilding() {
    // Use cache when possible, scan if cache is stale.
    if (this._cachedTechBuilding && this.structures.includes(this._cachedTechBuilding)) {
      return this._cachedTechBuilding;
    }
    this._updateTechCache();
    return this._cachedTechBuilding;
  }

  // Optimized: cache tech building reference to avoid repeated scans.
  _updateTechCache() {
    this._cachedTechBuilding = null;
    for (let i = 0; i < this.structures.length; i++) {
      const s = this.structures[i];
      if (s.team === 'player' && s.role === 'techBuilding' && s.type === 'structure') {
        this._cachedTechBuilding = s;
        return;
      }
    }
  }

  queueUnit(structure, kind) {
    if (!structure || structure.team !== 'player') {
      session.setMessage('Choose a valid production structure first.');
      return;
    }

    if (structure.role === 'commandCenter' && kind !== 'worker') {
      session.setMessage('Command Centers only train workers.');
      return;
    }

    if (structure.role === 'production' && kind === 'signature') {
      // Check if tech building exists
      if (!this.findPlayerTechBuilding()) {
        session.setMessage(`Build ${this.race.techBuildingName} first to unlock ${this.race.signatureName}.`);
        return;
      }
    }

    if (structure.role === 'production' && kind !== 'soldier' && kind !== 'signature') {
      session.setMessage('Production structures train combat units.');
      return;
    }

    const def = this.getUnitDef('player', kind);
    if (this.playerMinerals < def.cost) {
      session.setMessage('Not enough minerals.');
      return;
    }

    // Check gas cost
    if (def.gasCost && this.playerGas < def.gasCost) {
      session.setMessage(`Not enough gas (need ${def.gasCost}).`);
      return;
    }

    // Enforce supply cap
    if (this.playerSupplyUsed + def.supply > this.playerSupplyCap) {
      session.setMessage('Supply blocked. Build more production first.');
      return;
    }

    this.playerMinerals -= def.cost;
    if (def.gasCost) {
      this.playerGas -= def.gasCost;
    }
    structure.queue.push({ kind, progress: def.buildTime, def });
    session.pushLog(`${this.race.name} queued ${def.label}.`);
    session.setMessage(`${def.label} training started.`);
    this.syncSession(`${def.label} queued.`);
    if (this.audioManager) this.audioManager.buildStart();
  }

  startConstructionForWorker(worker, role) {
    if (!worker || worker.team !== 'player' || worker.type !== 'worker') {
      session.setMessage('Select a worker to begin construction.');
      return;
    }

    const slot = this.findBuildSlot(role, 'player');
    if (!slot) {
      session.setMessage('No build slot available.');
      return;
    }

    const def = this.race.structures[role];
    if (this.playerMinerals < def.cost) {
      const structName = role === 'techBuilding' ? this.race.techBuildingName : role === 'supplyStructure' ? this.race.supplyStructureName : role === 'defenseStructure' ? this.race.defenseStructureName : this.race.productionName;
      session.setMessage(`Not enough minerals to build ${structName}.`);
      return;
    }

    // Check gas cost for tech/defense buildings
    if (def.gasCost !== undefined && this.playerGas < def.gasCost) {
      session.setMessage(`Not enough gas to build ${this.race.techBuildingName}.`);
      return;
    }

    this.playerMinerals -= def.cost;
    if (def.gasCost !== undefined) {
      this.playerGas -= def.gasCost;
    }

    const structName = role === 'techBuilding' ? this.race.techBuildingName : role === 'supplyStructure' ? this.race.supplyStructureName : role === 'defenseStructure' ? this.race.defenseStructureName : this.race.productionName;
    const construction = this.createStructure('player', role, slot.x, slot.y, {
      active: false,
      construction: true,
      buildProgress: 0,
      buildTimeRemaining: def.buildTime,
      roleName: structName
    });
    construction.finalRole = role;
    construction.finalLabel = structName;
    construction.buildTimeRemaining = def.buildTime;
    construction.hp = def.maxHp * 0.55;
    construction.maxHp = def.maxHp;
    construction.sprite.setAlpha(0.32);
    construction.ridge.setAlpha(0.18);
    construction.statusText.setText('Under construction');

    worker.order = 'construct';
    worker.buildTargetId = construction.id;
    worker.targetX = construction.x;
    worker.targetY = construction.y;
    worker.manual = true;
    worker.statusText.setText('Constructing');
    session.pushLog(`${construction.finalLabel} construction started.`);
    session.setMessage(`Worker assigned to build ${construction.finalLabel}.`);
    this.syncSession(`${construction.finalLabel} under construction.`);
    if (this.audioManager) this.audioManager.buildStart();
  }

  findBuildSlot(role, team) {
    const slots = team === 'player' ? this.playerBuildSlots : this.enemyBuildSlots;
    const slot = slots.find((candidate) => {
      const hasConstruction = this.constructions.some((c) => Phaser.Math.Distance.Between(c.x, c.y, candidate.x, candidate.y) < 10);
      if (hasConstruction) return false;
      // Supply structures can be built in any free slot (no limit on count)
      if (role === 'supplyStructure') return true;
      const existingStructures = this.structures.filter((s) => s.team === team && s.role === role);
      const hasProduction = existingStructures.some((s) => Phaser.Math.Distance.Between(s.x, s.y, candidate.x, candidate.y) < 12);
      return !hasProduction;
    });
    return slot;
  }

  assignWorkerToGas(worker, geyser) {
    if (!worker || worker.type !== 'worker') return;
    if (geyser.assignedWorkers >= geyser.maxWorkers) {
      session.setMessage('Geyser is full (max 3 workers).');
      return;
    }

    // If worker is already assigned to this geyser, unassign
    if (worker.geyserId === geyser.id) {
      geyser.assignedWorkers = Math.max(0, geyser.assignedWorkers - 1);
      worker.geyserId = null;
      worker.harvestType = null;
      worker.order = 'harvest';
      worker.statusText.setText('Harvest');
      session.setMessage('Worker unassigned from gas.');
      return;
    }

    // Unassign from old geyser if any
    if (worker.geyserId) {
      const oldGeyser = this.gasGeysers.find((g) => g.id === worker.geyserId);
      if (oldGeyser) {
        oldGeyser.assignedWorkers = Math.max(0, oldGeyser.assignedWorkers - 1);
      }
    }

    geyser.assignedWorkers += 1;
    worker.geyserId = geyser.id;
    worker.harvestType = 'gas';
    worker.cargoTarget = this.race.workerGasHarvest;
    worker.order = 'gasHarvest';
    worker.statusText.setText('Mining Gas');
    session.pushLog(`${worker.label} assigned to gas geyser.`);
    session.setMessage(`${worker.label} assigned to gas.`);
    this.syncSession(`${worker.label} mining gas.`);
  }

  issueMove(entity, worldX, worldY) {
    if (entity.type === 'structure' || entity.type === 'construction') {
      session.setMessage('Structures cannot move.');
      if (this.audioManager) this.audioManager.error();
      return;
    }

    entity.targetX = worldX;
    entity.targetY = worldY;
    entity.order = 'move';
    entity.manual = true;
    entity.targetEntity = null;
    entity.statusText.setText('Moving');
    // Audio: low whoosh for move order on battlefield.
    if (this.audioManager) this.audioManager.moveCommand();
  }

  issueAttackMove(entity, worldX, worldY) {
    if (entity.type === 'structure' || entity.type === 'construction') {
      session.setMessage('Structures cannot attack-move.');
      if (this.audioManager) this.audioManager.error();
      return;
    }

    entity.targetX = worldX;
    entity.targetY = worldY;
    entity.order = 'attack';
    entity.manual = true;
    entity.targetEntity = null;
    entity.statusText.setText('Attack move');
    // Audio: sharp whoosh for attack-move on battlefield.
    if (this.audioManager) this.audioManager.attackCommand();
  }

  canDirectCommand(entity) {
    return !!(entity && entity.team === 'player' && entity.type !== 'structure' && entity.type !== 'construction');
  }

  issueAttackTarget(entity, target) {
    if (!this.canDirectCommand(entity) || !target) {
      if (this.audioManager) this.audioManager.error();
      return;
    }
    entity.targetX = target.x;
    entity.targetY = target.y;
    entity.order = 'attack';
    entity.manual = true;
    entity.targetEntity = target;
    if (entity.statusText) entity.statusText.setText('Attacking');
    if (this.audioManager) this.audioManager.attackCommand();
  }

  activateStimpack(unit) {
    if (!unit || unit.team !== 'player' || unit.type !== 'soldier') {
      session.setMessage('Only Terran Marines can use Stimpack.');
      return;
    }

    // Check if tech building exists (Stimpack requires Tech Lab)
    if (!this.findPlayerTechBuilding()) {
      session.setMessage(`Build ${this.race.techBuildingName} to unlock Stimpack.`);
      return;
    }

    const race = this.race;
    const unitDef = race.units.soldier;
    if (!unitDef.stimpack) {
      session.setMessage('This unit does not have Stimpack.');
      return;
    }

    const sp = unitDef.stimpack;

    // Check cooldown
    if (unit.stimpackCooldown > 0) {
      session.setMessage(`Stimpack on cooldown: ${unit.stimpackCooldown.toFixed(1)}s remaining.`);
      return;
    }

    // Check if already active
    if (unit.stimpackActive) {
      session.setMessage('Stimpack already active.');
      return;
    }

    // Check HP - cannot use if hp <= hpBurn (would kill the unit)
    if (unit.hp <= sp.hpBurn) {
      session.setMessage('Not enough HP to activate Stimpack.');
      return;
    }

    // Apply stimpack: burn HP, boost attack, reduce speed
    unit.hp -= sp.hpBurn;
    unit.stimpackActive = true;
    unit.stimpackRemaining = sp.duration;
    unit.speed = unit.stimpackOriginalSpeed * sp.speedMultiplier;
    unit.attack = Math.ceil(unit.stimpackOriginalAttack * sp.damageMultiplier);

    // Create visual glow effect
    if (unit.stimpackGlow) {
      unit.stimpackGlow.destroy();
    }
    unit.stimpackGlow = this.add.circle(unit.x, unit.y, unit.radius + 8, 0xff4444, 0.15)
      .setScrollFactor(1);

    session.pushLog(`${unit.label} activated Stimpack!`);
    session.setMessage('Stimpack activated — double damage, half speed.');
    this.syncSession(`Stimpack activated on ${unit.label}.`);
  }

  deactivateStimpack(unit) {
    if (!unit.stimpackActive) return;

    const race = this.race;
    const unitDef = race.units.soldier;
    const sp = unitDef.stimpack;

    // Restore original stats
    unit.speed = unit.stimpackOriginalSpeed;
    unit.attack = unit.stimpackOriginalAttack;
    unit.stimpackActive = false;
    unit.stimpackRemaining = 0;
    unit.stimpackCooldown = sp.cooldown;

    // Remove glow
    if (unit.stimpackGlow) {
      unit.stimpackGlow.destroy();
      unit.stimpackGlow = null;
    }

    session.pushLog(`${unit.label} Stimpack ended.`);
    this.syncSession(`Stimpack expired on ${unit.label}.`);
  }

  update(time, delta) {
    if (this.paused || this.ended) {
      return;
    }

    const dt = delta / 1000;
    this.visualPolish?.update(time, delta, dt);

    const keyboardVector = this.inputController.getKeyboardVector();
    if (keyboardVector.lengthSq() > 0) {
      this.cameras.main.scrollX += keyboardVector.x * CAMERA_SPEED * dt / this.cameras.main.zoom;
      this.cameras.main.scrollY += keyboardVector.y * CAMERA_SPEED * dt / this.cameras.main.zoom;
      clampCamera(this.cameras.main);
    }

    this.enemyIncomeTimer += dt;
    if (this.enemyIncomeTimer >= 1) {
      const ticks = Math.floor(this.enemyIncomeTimer);
      this.enemyIncomeTimer -= ticks;
      // Enemy income now scales with their worker count (not purely passive)
      // Optimized: count in single pass instead of two filter() calls.
      let enemyWorkerCount = 0;
      let enemyGasWorkerCount = 0;
      for (let i = 0; i < this.enemyUnits.length; i++) {
        const u = this.enemyUnits[i];
        if (u.type === 'worker' && u.hp > 0) {
          enemyWorkerCount++;
          if (u.harvestType === 'gas') enemyGasWorkerCount++;
        }
      }
      const workerIncome = enemyWorkerCount * this.race.workerHarvest;
      const passiveIncome = this.race.enemyIncomePerSecond * this.aiDifficulty.enemyIncomeMultiplier;
      this.enemyMinerals += (workerIncome + passiveIncome) * ticks;
      // Gas income for enemy workers assigned to gas
      this.enemyGas += enemyGasWorkerCount * this.race.workerGasHarvest * ticks;
    }

    this.enemySpawnTimer += dt;
    this.enemyAttackTimer += dt;

    // Enemy wave spawning frequency scales with the selected AI difficulty.
    const waveInterval = getEnemyWaveInterval(this.aiDifficulty, this.enemyWave);

    // Show edge warning flash 2 seconds before wave arrives
    if (!this.ended && !this.waveWarnActive) {
      const timeUntilWave = waveInterval - this.enemySpawnTimer;
      if (timeUntilWave <= 2 && timeUntilWave > 0) {
        this.waveWarnActive = true;
        this.showEdgeWarning();
        this.time.delayedCall(2000, () => { this.waveWarnActive = false; });
      }
    }

    if (this.enemySpawnTimer >= waveInterval) {
      this.enemySpawnTimer = 0;
      this.spawnEnemyWave();
    }

    this.updateConstructions(dt);
    this.updateStructures(dt);
    this.updateUnits(dt);
    this.separateUnits();
    this.updateEnemyAI(dt);
    this.resolveCombat(dt);
    this.reapDeadEntities();
    this.syncSession();
    this.updateMinimap();
    this.checkVictoryDefeat();
  }

  updateConstructions(dt) {
    this.constructions.forEach((construction) => {
      if (construction.type !== 'construction') {
        return;
      }

      construction.buildTimeRemaining = Math.max(0, construction.buildTimeRemaining - dt);
      const progress = 1 - construction.buildTimeRemaining / (construction.finalRole === 'techBuilding' ? this.race.structures.techBuilding.buildTime : this.race.structures.production.buildTime);
      construction.ridge.width = (construction.width - 18) * Math.max(0.15, progress);
      construction.statusText.setText(`Building ${construction.buildTimeRemaining.toFixed(1)}s`);
      construction._motionState = 'build';

      const worker = this.units.find((unit) => unit.team === 'player' && unit.type === 'worker' && unit.buildTargetId === construction.id);
      if (worker && Phaser.Math.Distance.Between(worker.x, worker.y, construction.x, construction.y) > 22) {
        this.moveEntityTowards(worker, construction.x, construction.y, dt);
      }

      if (worker && Phaser.Math.Distance.Between(worker.x, worker.y, construction.x, construction.y) <= 22) {
        worker.order = 'construct';
        worker.statusText.setText('Constructing');
      }

      this.applyMotionScale(construction, dt);

      if (construction.buildTimeRemaining <= 0) {
        construction.type = 'structure';
        construction.active = true;
        construction.buildProgress = 1;
        construction.statusText.setText('Operational');
        construction.sprite.setAlpha(0.94);
        construction.ridge.setAlpha(0.22);
        // Visual feedback: completion glow + audio
        this.showCompletionGlow(construction.x, construction.y, this.race.id);
        construction._motionState = 'idle';
        if (construction.team === 'player') {
          this.playerSupplyCap += construction.supplyBonus;
          // If a player tech building just completed, refresh the cache immediately.
          if (construction.finalRole === 'techBuilding') {
            this._updateTechCache();
          }
        } else {
          this.enemySupplyCap += construction.supplyBonus;
        }
        const ownerWorker = this.units.find((unit) => unit.buildTargetId === construction.id);
        if (ownerWorker) {
          ownerWorker.buildTargetId = null;
          ownerWorker.order = 'harvest';
          ownerWorker.manual = false;
          ownerWorker.statusText.setText('Harvest');
        }
        session.pushLog(`${construction.roleName} complete.`);
        session.setMessage(`${construction.roleName} complete.`);
      }
    });
  }

  updateStructures(dt) {
    const allStructures = this.structures.filter((structure) => structure.type === 'structure');

    allStructures.forEach((structure) => {
      if (structure.core) {
        if (structure.type === 'construction') {
          structure.core.setAlpha(0.12);
        } else {
          const phase = this.time.now * 0.0015 + structure.x * 0.05;
          structure.core
            .setAlpha(0.45 + Math.sin(phase) * 0.2)
            .setScale(1 + Math.sin(phase * 1.3) * 0.04);
        }
      }

      if (structure.queue.length > 0) {
        const item = structure.queue[0];
        item.progress -= dt;
        structure.statusText.setText(`Training ${item.def.label} ${(Math.max(0, item.progress)).toFixed(1)}s`);

        if (item.progress <= 0) {
          const spawnX = structure.x + structure.spawnOffset.x;
          const spawnY = structure.y + structure.spawnOffset.y + Phaser.Math.Between(-12, 12);
          this.createUnit(structure.team, item.kind, spawnX, spawnY, {
            homeStructure: structure,
            autoHarvest: item.kind === 'worker',
            mode: item.kind === 'worker' ? 'harvest' : 'guard',
            enemyKind: structure.team === 'enemy' ? (item.kind === 'signature' ? 'enemySignature' : 'enemySoldier') : undefined,
            isSignature: item.kind === 'signature'
          });
          if (structure.team === 'player') {
            this.playerSupplyUsed += item.def.supply;
          } else {
            this.enemySupplyUsed += item.def.supply;
          }
          structure.queue.shift();
          // Visual feedback: unit deployment glow
          this.showCompletionGlow(spawnX, spawnY, structure.team === 'player' ? this.race.id : 'enemy');
          session.pushLog(`${item.def.label} deployed.`);
          session.setMessage(`${item.def.label} deployed.`);
        }
      } else if (structure.type === 'structure') {
        structure.statusText.setText(structure.role === 'commandCenter' ? 'Operational' : structure.role === 'techBuilding' ? 'Online' : 'Idle');
        structure._motionState = 'idle';
      }

      if (structure.queue.length > 0) {
        structure._motionState = 'train';
      }

      this.applyMotionScale(structure, dt);

      // Defense structure combat behavior
      if (structure.role === 'defenseStructure') {
        this.updateDefenseStructure(structure, dt);
      }

      structure.hpFront.width = (structure.hp / structure.maxHp) * (structure.width + 8);
      structure.hpFront.setPosition(structure.x - (structure.width + 8) / 2, structure.y + structure.height / 2 + 10);
      if (structure.team === 'enemy' && !structure.construction && structure.hp / structure.maxHp < 0.25) {
        const pulse = 0.78 + Math.sin(this.time.now * 0.012) * 0.18;
        structure.critStructureIndicator.setPosition(structure.x, structure.y).setDepth(10 + Math.floor(structure.y * 0.03) - 1).setAlpha(pulse).setVisible(true);
      } else {
        structure.critStructureIndicator.setVisible(false);
      }
    });
  }

  updateDefenseStructure(structure, dt) {
    const def = this.race.structures.defenseStructure;
    if (!def) return;

    // Protoss Shield Generator: regen shields for nearby friendly units/structures
    if (def.shieldRadius) {
      structure._attackCooldown = Math.max(0, (structure._attackCooldown ?? 0) - dt);
      if (structure._attackCooldown <= 0) {
        structure._attackCooldown = 1; // tick every second
        let shielded = 0;
        // Shield nearby friendly units
        this.units.forEach((unit) => {
          if (unit.team === structure.team && unit.maxShield > 0 && unit.shield < unit.maxShield) {
            const dist = Phaser.Math.Distance.Between(structure.x, structure.y, unit.x, unit.y);
            if (dist <= def.shieldRadius) {
              unit.shield = Math.min(unit.maxShield, unit.shield + def.shieldRegenPerSecond);
              shielded++;
            }
          }
        });
        // Shield nearby friendly structures
        this.structures.forEach((s) => {
          if (s.team === structure.team && s.type === 'structure' && s.id !== structure.id) {
            const dist = Phaser.Math.Distance.Between(structure.x, structure.y, s.x, s.y);
            if (dist <= def.shieldRadius) {
              shielded++;
            }
          }
        });
        structure.statusText.setText(`Shielding ${shielded} units`);
        structure._motionState = 'attack';
      }
      return;
    }

    // Terran Bunker / Zerg Spore Colony: auto-attack enemies in range
    structure._attackCooldown = Math.max(0, (structure._attackCooldown ?? 0) - dt);
    if (structure._attackCooldown > 0) {
      structure.statusText.setText('Charging');
      return;
    }

    // Find nearest enemy in range
    let target = null;
    let bestDist = def.attackRange;

    for (let i = 0; i < this.enemyUnits.length; i++) {
      const u = this.enemyUnits[i];
      if (u.hp <= 0) continue;
      const d = Phaser.Math.Distance.Between(structure.x, structure.y, u.x, u.y);
      if (d < bestDist) {
        bestDist = d;
        target = u;
      }
    }

    // Also check enemy structures
    for (let i = 0; i < this.structures.length; i++) {
      const s = this.structures[i];
      if (s.team === 'enemy' && s.hp > 0) {
        const d = Phaser.Math.Distance.Between(structure.x, structure.y, s.x, s.y);
        if (d < bestDist) {
          bestDist = d;
          target = s;
        }
      }
    }

    if (target) {
      structure._attackCooldown = def.attackCooldown;
      structure._recoilTimer = 0.14;
      target.hp -= def.attackDamage;
      structure._motionState = 'attack';
      structure.statusText.setText('Firing');
      // Visual feedback: muzzle flash + damage number
      spawnMuzzleFlash(this, structure.x, structure.y, this.race?.id || 'terran');
      spawnTracer(this, structure.x, structure.y, target.x, target.y, this.race?.id || 'terran');
      spawnTargetImpact(this, target.x, target.y, this.race?.id || 'terran');
      this.showDamageFlash(target, def.attackDamage);
      if (this.audioManager) this.audioManager.attack(structure);
    } else {
      structure.statusText.setText('Defending');
      structure._motionState = 'idle';
    }
  }

  updateUnits(dt) {
    this.units.forEach((unit) => {
      if (unit.hp <= 0) {
        return;
      }

      unit.cooldown = Math.max(0, unit.cooldown - dt);
      unit._motionState = 'idle';

      const uDepth = 10 + Math.floor(unit.y * 0.03);
      unit.sprite.setPosition(unit.x, unit.y).setDepth(uDepth);
      if (unit.shadow) {
        unit.shadow.setPosition(unit.x, unit.y + unit.radius * 0.4);
      }
      if (unit.teamMarker) {
        unit.teamMarker.setPosition(unit.x, unit.y + unit.radius * 0.15).setDepth(uDepth - 1);
      }
      if (unit.roleRing) {
        unit.roleRing.setPosition(unit.x, unit.y).setDepth(uDepth - 1);
      }
      if (unit.energyHalo) {
        unit.energyHalo.setPosition(unit.x, unit.y).setDepth(uDepth - 1);
        const activeCombat = unit._motionState === 'attack' || unit.isCharging;
        const pulse = 0.15 + Math.sin(this.time.now * 0.006) * 0.08;
        unit.energyHalo
          .setAlpha(pulse + (activeCombat ? 0.45 : 0))
          .setScale(activeCombat ? 1.2 : 1);
      }
      unit.hpBack.setPosition(unit.x, unit.y + unit.radius + 8).setDepth(uDepth + 1);
      unit.hpFront.setPosition(unit.x - (unit.radius * 2 + 8) / 2, unit.y + unit.radius + 8).setDepth(uDepth + 1);
      unit.hpFront.width = (unit.hp / unit.maxHp) * (unit.radius * 2 + 8);
      const damageTier = getDamageTier(unit.hp, unit.maxHp);
      unit.damageTier = damageTier;
      if (damageTier !== 'healthy') {
        const pulse = damageTier === 'critical'
          ? 0.78 + Math.sin(this.time.now * 0.012) * 0.18
          : 0.3 + Math.sin(this.time.now * 0.006) * 0.08;
        unit.critIndicator.setPosition(unit.x, unit.y).setDepth(uDepth - 1).setAlpha(pulse).setVisible(true);
      } else {
        unit.critIndicator.setVisible(false);
      }
      unit.statusText.setPosition(unit.x, unit.y + unit.radius + 20).setDepth(uDepth + 1);

      if (unit.type === 'worker') {
        this.updateWorker(unit, dt);
      } else {
        this.updateCombatUnit(unit, dt);
      }

      this.applyMotionScale(unit, dt);
    });

    this.updateSelectionHighlightPosition();
  }

  updateWorker(worker, dt) {
    // Handle construction order
    if (worker.order === 'construct' && worker.buildTargetId) {
      const construction = this.constructions.find((entry) => entry.id === worker.buildTargetId);
      if (construction) {
        if (Phaser.Math.Distance.Between(worker.x, worker.y, construction.x, construction.y) > 20) {
          this.moveEntityTowards(worker, construction.x, construction.y, dt);
          worker.statusText.setText('Constructing');
          return;
        }

        worker.statusText.setText('Constructing');
        return;
      }

      worker.buildTargetId = null;
      worker.order = worker.harvestType === 'gas' ? 'gasHarvest' : 'harvest';
    }

    // Handle manual move order
    if (worker.manual && worker.order === 'move') {
      this.moveEntityTowards(worker, worker.targetX, worker.targetY, dt);
      if (Phaser.Math.Distance.Between(worker.x, worker.y, worker.targetX, worker.targetY) <= 6) {
        worker.manual = false;
        worker.order = worker.harvestType === 'gas' ? 'gasHarvest' : 'harvest';
        worker.statusText.setText(worker.harvestType === 'gas' ? 'Mining Gas' : 'Harvest');
      } else {
        worker.statusText.setText('Moving');
      }
      return;
    }

    // Handle gas harvesting
    if (worker.order === 'gasHarvest') {
      const geyser = this.gasGeysers.find((g) => g.id === worker.geyserId);
      if (!geyser || geyser.amount <= 0) {
        // If geyser depleted, switch to minerals
        worker.harvestType = null;
        worker.order = 'harvest';
        worker.statusText.setText('Harvest');
        return;
      }

      if (worker.cargo > 0) {
        const base = worker.homeStructure ?? this.playerCommandCenter;
        this.moveEntityTowards(worker, base.x + 38, base.y, dt);
        worker.statusText.setText('Returning');
        if (Phaser.Math.Distance.Between(worker.x, worker.y, base.x + 38, base.y) <= 24) {
          if (worker.team === 'player') {
            this.playerGas += worker.cargo;
          } else {
            this.enemyGas += worker.cargo;
          }
          worker.cargo = 0;
          worker.harvestState = 'toNode';
          worker.statusText.setText('Mining Gas');
        }
        return;
      }

      // Move to geyser
      if (Phaser.Math.Distance.Between(worker.x, worker.y, geyser.x, geyser.y) > 24) {
        this.moveEntityTowards(worker, geyser.x, geyser.y, dt);
        worker.statusText.setText('Mining Gas');
        return;
      }

      // Harvest gas
      const mined = Math.min(worker.cargoTarget * dt, geyser.amount);
      geyser.amount = Math.max(0, geyser.amount - mined);
      worker.cargo += mined;
      worker.statusText.setText('Mining Gas');
      geyser.sprite.setAlpha(Math.max(0.35, 0.45 + geyser.amount / geyser.maxAmount * 0.5));
      geyser.labelText.setText(geyser.amount > 0 ? `Gas • ${Math.ceil(geyser.amount)}` : 'Gas • Depleted');
      return;
    }

    // Handle mineral harvesting
    const carryAmount = this.race.workerHarvest;
    if (worker.cargo > 0) {
      const base = worker.homeStructure ?? this.playerCommandCenter;
      this.moveEntityTowards(worker, base.x + 38, base.y, dt);
      worker.statusText.setText('Returning');
      if (Phaser.Math.Distance.Between(worker.x, worker.y, base.x + 38, base.y) <= 24) {
        if (worker.team === 'player') {
          this.playerMinerals += worker.cargo;
        } else {
          this.enemyMinerals += worker.cargo;
        }
        worker.cargo = 0;
        worker.harvestState = 'toNode';
        worker.statusText.setText('Harvest');
      }
      return;
    }

    // Find nearest mineral node
    if (!worker.harvestNodeId || !this.resourceNodes.some((node) => node.id === worker.harvestNodeId && node.amount > 0)) {
      const nearestNode = this.findNearestResourceNode(worker.x, worker.y);
      worker.harvestNodeId = nearestNode?.id ?? null;
    }

    const node = this.resourceNodes.find((entry) => entry.id === worker.harvestNodeId);
    if (!node) {
      worker.statusText.setText('Idle');
      return;
    }

    if (Phaser.Math.Distance.Between(worker.x, worker.y, node.x, node.y) > 28) {
      this.moveEntityTowards(worker, node.x + 20, node.y + 12, dt);
      worker.statusText.setText('Harvest');
      return;
    }

    const mined = Math.min(carryAmount * dt, node.amount);
    node.amount = Math.max(0, node.amount - mined);
    worker.cargo += mined;
    worker.statusText.setText('Mining');
    node.sprite.setAlpha(Math.max(0.35, 0.45 + node.amount / node.maxAmount * 0.5));
    node.labelText.setText(node.amount > 0 ? `Minerals • ${Math.ceil(node.amount)}` : 'Minerals • Depleted');
  }

  updateCombatUnit(unit, dt) {
    if (unit.manual && unit.order === 'move') {
      this.moveEntityTowards(unit, unit.targetX, unit.targetY, dt);
      unit.statusText.setText('Moving');
      if (Phaser.Math.Distance.Between(unit.x, unit.y, unit.targetX, unit.targetY) <= 6) {
        unit.manual = false;
        unit.order = 'guard';
      }
      return;
    }

    let enemy = unit.targetEntity && unit.targetEntity.hp > 0 ? unit.targetEntity : null;
    if (!enemy) {
      enemy = this.findNearestEnemy(unit);
      unit.targetEntity = enemy;
    }

    if (!enemy) {
      unit.statusText.setText(unit.team === 'player' ? 'Guard' : 'Advance');
      return;
    }

    const distance = Phaser.Math.Distance.Between(unit.x, unit.y, enemy.x, enemy.y);
    if (distance > unit.range) {
      this.moveEntityTowards(unit, enemy.x, enemy.y, dt);
      unit.statusText.setText(unit.team === 'player' ? 'Advance' : 'Assault');
      return;
    }

    unit.statusText.setText('Engage');
    if (unit.cooldown <= 0) {
      unit._motionState = 'attack';
      unit._recoilTimer = 0.14;
      if (this.audioManager) this.audioManager.attack(unit);
    // High-signal attack moment: muzzle flash at attacker
    const attackRace = this.race?.id || 'terran';
    spawnMuzzleFlash(this, unit.x, unit.y, attackRace);
    enemy.hp -= unit.attack;
    unit.cooldown = unit.cooldownTime;
    // Visual feedback: damage flash on the target + floating number
    this.showDamageFlash(enemy, unit.attack);
      // Track damage for shield regen delay (Protoss units)
      if (unit.shield > 0 && unit.team === 'player') {
        unit.lastDamageTime = this.time.now / 1000;
      }
      // Apply charge bonus damage if this was a charge hit
      if (unit.isCharging && unit.chargeDamage > 0) {
        enemy.hp -= unit.chargeDamage;
        this.showChargeImpact(enemy.x, enemy.y);
        unit.isCharging = false;
      }
      if (enemy.type === 'structure' || enemy.type === 'construction') {
        enemy.statusText.setText(`${Math.max(0, enemy.hp)} hp`);
      }
    }
  }

  updateEnemyAI(dt) {
    const enemyProduction = this.structures.find((structure) => structure.team === 'enemy' && structure.role === 'production' && structure.type === 'structure');
    const enemyTech = this.structures.find((structure) => structure.team === 'enemy' && structure.role === 'techBuilding' && structure.type === 'structure');
    const enemyBase = this.enemyCommandCenter;

    // AI state tracking (persist across frames)
    if (!this._aiState) {
      this._aiState = {
        trainWorkerTimer: 0,
        attackTimer: 0,
        buildSupplyTimer: 0,
        nextAttackWave: 0,
        attackCooldown: 15, // seconds between coordinated attacks
        hasAttackedThisWave: false
      };
    }
    const ai = this._aiState;

    // Optimized: single-pass count of enemy workers, gas workers, mineral workers.
    let enemyWorkerCount = 0;
    let gasWorkerCount = 0;
    for (let i = 0; i < this.enemyUnits.length; i++) {
      const u = this.enemyUnits[i];
      if (u.type === 'worker' && u.hp > 0) {
        enemyWorkerCount++;
        if (u.harvestType === 'gas') gasWorkerCount++;
      }
    }
    const mineralWorkerCount = enemyWorkerCount - gasWorkerCount;

    // Count enemy combat units
    let enemyCombatCount = 0;
    for (let i = 0; i < this.enemyUnits.length; i++) {
      if (this.enemyUnits[i].team === 'enemy' && this.enemyUnits[i].type !== 'worker' && this.enemyUnits[i].hp > 0) {
        enemyCombatCount++;
      }
    }

    // Count existing supply structures
    let enemySupplyCount = 0;
    for (let i = 0; i < this.structures.length; i++) {
      if (this.structures[i].team === 'enemy' && this.structures[i].role === 'supplyStructure') enemySupplyCount++;
    }

    // --- ECONOMY MANAGEMENT ---

    // Train more workers over time (aim for 8-12 workers)
    ai.trainWorkerTimer += dt;
    const targetWorkers = Math.min(12, 6 + Math.floor(this.enemyWave / 3));
    if (enemyWorkerCount < targetWorkers && this.enemyMinerals >= this.race.units.worker.cost && ai.trainWorkerTimer > 5) {
      const cc = this.enemyCommandCenter;
      if (cc && cc.type === 'structure' && cc.queue.length < 2) {
        this.enemyMinerals -= this.race.units.worker.cost;
        cc.queue.push({ kind: 'worker', progress: this.race.units.worker.buildTime, def: this.race.units.worker });
        ai.trainWorkerTimer = 0;
      }
    }

    // Assign workers to gas if geysers available and not enough gas workers
    const availableGeysers = this.gasGeysers.filter((g) => g.amount > 0 && g.assignedWorkers < g.maxWorkers);
    if (availableGeysers.length > 0 && gasWorkerCount < availableGeysers.length && mineralWorkerCount > 2) {
      let mover = null;
      for (let i = this.enemyUnits.length - 1; i >= 0; i--) {
        const u = this.enemyUnits[i];
        if (u.type === 'worker' && u.hp > 0 && u.harvestType !== 'gas') {
          mover = u;
          break;
        }
      }
      if (mover) {
        const geyser = availableGeysers[0];
        mover.harvestType = 'gas';
        mover.order = 'gasHarvest';
        mover.geyserId = geyser.id;
        mover.statusText.setText('Mining Gas');
        geyser.assignedWorkers += 1;
      }
    }

    // --- BUILDING MANAGEMENT ---

    // Build supply structures when needed (check every 3 seconds)
    ai.buildSupplyTimer += dt;
    if (ai.buildSupplyTimer > 3) {
      ai.buildSupplyTimer = 0;
      const supplyNeeded = this.enemySupplyUsed + 4 > this.enemySupplyCap;
      if (supplyNeeded && this.enemyMinerals >= this.race.structures.supplyStructure.cost) {
        const slot = this.findBuildSlot('supplyStructure', 'enemy');
        if (slot) {
          const def = this.race.structures.supplyStructure;
          this.enemyMinerals -= def.cost;
          const construction = this.createStructure('enemy', 'supplyStructure', slot.x, slot.y, {
            active: false,
            construction: true,
            buildProgress: 0,
            buildTimeRemaining: def.buildTime,
            roleName: this.race.supplyStructureName
          });
          construction.finalRole = 'supplyStructure';
          construction.finalLabel = this.race.supplyStructureName;
          construction.buildTimeRemaining = def.buildTime;
          construction.hp = def.maxHp * 0.55;
          construction.maxHp = def.maxHp;
          construction.sprite.setAlpha(0.3);
          construction.ridge.setAlpha(0.18);
          construction.statusText.setText('Under construction');
          this.constructions.push(construction);
        }
      }
    }

    // Build tech building if they have minerals and gas, and no tech building yet
    if (!enemyTech && this.enemyWave >= this.aiDifficulty.enemyTechWave && this.enemyMinerals >= this.race.structures.techBuilding.cost && this.enemyGas >= (this.race.structures.techBuilding.gasCost || 0) && enemyProduction) {
      const slot = this.findBuildSlot('techBuilding', 'enemy');
      if (slot) {
        this.enemyMinerals -= this.race.structures.techBuilding.cost;
        if (this.race.structures.techBuilding.gasCost) {
          this.enemyGas -= this.race.structures.techBuilding.gasCost;
        }
        const construction = this.createStructure('enemy', 'techBuilding', slot.x, slot.y, {
          active: false,
          construction: true,
          buildProgress: 0,
          buildTimeRemaining: this.race.structures.techBuilding.buildTime,
          roleName: this.race.techBuildingName
        });
        construction.finalRole = 'techBuilding';
        construction.finalLabel = this.race.techBuildingName;
        construction.buildTimeRemaining = this.race.structures.techBuilding.buildTime;
        construction.hp = this.race.structures.techBuilding.maxHp * 0.55;
        construction.maxHp = this.race.structures.techBuilding.maxHp;
        construction.sprite.setAlpha(0.3);
        construction.ridge.setAlpha(0.18);
        construction.statusText.setText('Under construction');
        this.constructions.push(construction);
        this.enemyTechBuilt = true;
      }
    }

    // --- UNIT PRODUCTION (through production queues, not spawning) ---

    // Train soldiers when production is idle and we have resources
    if (enemyProduction && enemyProduction.queue.length === 0 && this.enemyMinerals >= this.race.units.enemySoldier.cost && this.enemySupplyUsed + this.race.units.enemySoldier.supply <= this.enemySupplyCap) {
      // Train 2 soldiers at a time for economy pressure
      const soldierCost = this.race.units.enemySoldier.cost;
      if (this.enemyMinerals >= soldierCost * 2) {
        this.enemyMinerals -= soldierCost * 2;
        enemyProduction.queue.push({ kind: 'soldier', progress: this.race.units.enemySoldier.buildTime, def: this.race.units.enemySoldier });
        enemyProduction.queue.push({ kind: 'soldier', progress: this.race.units.enemySoldier.buildTime, def: this.race.units.enemySoldier });
      } else if (this.enemyMinerals >= soldierCost) {
        this.enemyMinerals -= soldierCost;
        enemyProduction.queue.push({ kind: 'soldier', progress: this.race.units.enemySoldier.buildTime, def: this.race.units.enemySoldier });
      }
    }

    // Train signature units when tech is available
    if (enemyTech && enemyProduction && enemyProduction.queue.length < 2 && this.enemyWave >= this.aiDifficulty.enemySignatureWave) {
      const sigDef = this.race.units.enemySignature;
      const sigCost = sigDef.cost;
      const sigGasCost = sigDef.gasCost || 0;
      if (this.enemyMinerals >= sigCost && this.enemyGas >= sigGasCost && this.enemySupplyUsed + sigDef.supply <= this.enemySupplyCap) {
        this.enemyMinerals -= sigCost;
        if (sigGasCost) this.enemyGas -= sigGasCost;
        enemyProduction.queue.push({ kind: 'signature', progress: sigDef.buildTime, def: sigDef });
      }
    }

    // --- COORDINATED ATTACKS ---

    ai.attackTimer += dt;
    const attackThreshold = Math.max(4, 8 - this.enemyWave); // More units needed as waves progress
    if (ai.attackTimer >= ai.attackCooldown && enemyCombatCount >= attackThreshold && !ai.hasAttackedThisWave) {
      ai.attackTimer = 0;
      ai.hasAttackedThisWave = true;
      ai.attackCooldown = Math.max(10, 20 - this.enemyWave * 0.5); // Attacks get more frequent

      // Send all combat units to attack player base
      this.enemyUnits.forEach((unit) => {
        if (unit.type === 'worker' || unit.hp <= 0) return;
        unit.order = 'attack';
        unit.targetEntity = this.playerCommandCenter;
        unit.targetX = this.playerCommandCenter.x + Phaser.Math.Between(-80, 80);
        unit.targetY = this.playerCommandCenter.y + Phaser.Math.Between(-60, 60);
        unit.statusText.setText('Assault');
      });

      // Wave announcement for player awareness
      this.enemyWave += 1;
      this.showWaveAnnouncement(this.enemyWave);
      session.pushLog(`Enemy wave ${this.enemyWave} — coordinated attack with ${enemyCombatCount} units.`);
      session.setMessage(`Enemy wave ${this.enemyWave} advancing — ${enemyCombatCount} units attacking!`);
    }

    // Reset attack flag when units return home or are depleted
    if (ai.hasAttackedThisWave && enemyCombatCount < 2) {
      ai.hasAttackedThisWave = false;
    }

    // --- ENEMY WORKER HARVESTING ---
    this.enemyUnits.forEach((unit) => {
      if (unit.hp <= 0) return;

      if (unit.type === 'worker') {
        if (unit.cargo > 0) {
          this.moveEntityTowards(unit, enemyBase.x - 38, enemyBase.y, dt);
          if (Phaser.Math.Distance.Between(unit.x, unit.y, enemyBase.x - 38, enemyBase.y) <= 24) {
            if (unit.harvestType === 'gas') {
              this.enemyGas += unit.cargo;
            } else {
              this.enemyMinerals += unit.cargo;
            }
            unit.cargo = 0;
          }
        } else if (unit.harvestType === 'gas') {
          const geyser = this.gasGeysers.find((g) => g.id === unit.geyserId);
          if (geyser && geyser.amount > 0 && Phaser.Math.Distance.Between(unit.x, unit.y, geyser.x, geyser.y) > 24) {
            this.moveEntityTowards(unit, geyser.x, geyser.y, dt);
          } else if (geyser) {
            const mined = Math.min(this.race.workerGasHarvest * dt, geyser.amount);
            geyser.amount = Math.max(0, geyser.amount - mined);
            unit.cargo += mined;
            geyser.sprite.setAlpha(Math.max(0.35, 0.45 + geyser.amount / geyser.maxAmount * 0.5));
            geyser.labelText.setText(geyser.amount > 0 ? `Gas • ${Math.ceil(geyser.amount)}` : 'Gas • Depleted');
          }
        } else {
          const node = this.findNearestResourceNode(unit.x, unit.y);
          if (node && Phaser.Math.Distance.Between(unit.x, unit.y, node.x, node.y) > 28) {
            this.moveEntityTowards(unit, node.x - 20, node.y - 12, dt);
          } else if (node) {
            const mined = Math.min(this.race.workerHarvest * dt, node.amount);
            node.amount = Math.max(0, node.amount - mined);
            unit.cargo += mined;
          }
        }
      } else {
        // Combat unit behavior: attack if ordered, otherwise advance toward player
        if (unit.order === 'attack' && unit.targetEntity && unit.targetEntity.hp > 0) {
          const distance = Phaser.Math.Distance.Between(unit.x, unit.y, unit.targetEntity.x, unit.targetEntity.y);
          if (distance > unit.range) {
            this.moveEntityTowards(unit, unit.targetEntity.x, unit.targetEntity.y, dt);
          } else if (unit.cooldown <= 0) {
            if (this.audioManager) this.audioManager.attack(unit);
            spawnMuzzleFlash(this, unit.x, unit.y, this.race?.id || 'terran', { count: 3, life: 0.16 });
            spawnTracer(this, unit.x, unit.y, unit.targetEntity.x, unit.targetEntity.y, this.race?.id || 'terran');
            spawnTargetImpact(this, unit.targetEntity.x, unit.targetEntity.y, this.race?.id || 'terran');
            unit.targetEntity.hp -= unit.attack;
            unit.cooldown = unit.cooldownTime;
          }
        } else {
          const target = this.findNearestPlayerTarget(unit);
          if (target) {
            unit.targetEntity = target;
            const distance = Phaser.Math.Distance.Between(unit.x, unit.y, target.x, target.y);
            if (distance > unit.range) {
              this.moveEntityTowards(unit, target.x, target.y, dt);
            } else if (unit.cooldown <= 0) {
              if (this.audioManager) this.audioManager.attack(unit);
              spawnMuzzleFlash(this, unit.x, unit.y, this.race?.id || 'terran', { count: 3, life: 0.16 });
              spawnTracer(this, unit.x, unit.y, target.x, target.y, this.race?.id || 'terran');
              spawnTargetImpact(this, target.x, target.y, this.race?.id || 'terran');
              target.hp -= unit.attack;
              unit.cooldown = unit.cooldownTime;
            }
          } else {
            // Idle: advance toward player base
            this.moveEntityTowards(unit, enemyBase.x - 90, enemyBase.y + Phaser.Math.Between(-44, 44), dt);
          }
        }
      }
    });
  }

  spawnEnemyWave(isSignature) {
    const slot = this.enemyBuildSlots[0];
    const unitType = isSignature ? 'signature' : 'soldier';
    const enemyKind = isSignature ? 'enemySignature' : 'enemySoldier';
    const unitDef = this.getUnitDef('enemy', unitType);

    // Squad size scales with wave number: starts at 1, grows to 3-4 by late game
    const squadSize = Math.min(4, 1 + Math.floor(this.enemyWave / 2));

    // Check total cost for squad
    const totalCost = unitDef.cost * squadSize;
    if (this.enemyMinerals < totalCost) {
      return;
    }

    // Check gas for signature squads
    const totalGas = (unitDef.gasCost || 0) * squadSize;
    if (totalGas > this.enemyGas) {
      return;
    }

    this.enemyMinerals -= totalCost;
    if (totalGas > 0) {
      this.enemyGas -= totalGas;
    }

    // Spawn squad with staggered positions + wave-scaling stats
    const waveBonus = Math.min(0.4, this.enemyWave * 0.05); // +5% per wave, capped at +40%
    for (let i = 0; i < squadSize; i += 1) {
      this.enemySupplyUsed += unitDef.supply;
      const spawnY = slot.y + Phaser.Math.Between(-30, 30) + i * 24;
      const unit = this.createUnit('enemy', unitType, slot.x + Phaser.Math.Between(-10, 10), spawnY, {
        mode: 'guard',
        enemyKind: enemyKind,
        isSignature: isSignature
      });
      // Scale HP and attack with wave number for escalating pressure
      unit.hp = Math.floor(unit.maxHp * (1 + waveBonus));
      unit.attack = Math.floor(unitDef.attack * (1 + waveBonus));
      unit.order = 'attack';
      unit.targetX = this.playerCommandCenter.x + Phaser.Math.Between(-60, 60);
      unit.targetY = this.playerCommandCenter.y + Phaser.Math.Between(-40, 40);
    }

    this.enemySpawnTimer = 0;
    this.enemyAttackTimer = 0;
    this.enemyWave += 1;

    // Visual feedback: wave announcement banner
    this.showWaveAnnouncement(this.enemyWave);
    session.pushLog(`Enemy wave ${this.enemyWave} (${squadSize} units${isSignature ? ', signature' : ''}) detected.`);
    session.setMessage(`Enemy wave ${this.enemyWave} advancing — ${squadSize} units.`);
  }

  findNearestResourceNode(x, y) {
    // Optimized: single-pass iteration instead of filter + reduce.
    let best = null;
    let bestDistance = Infinity;

    for (let i = 0; i < this.resourceNodes.length; i++) {
      const node = this.resourceNodes[i];
      if (node.amount <= 0) continue;
      const d = Phaser.Math.Distance.Between(x, y, node.x, node.y);
      if (d < bestDistance) {
        bestDistance = d;
        best = node;
      }
    }

    return best;
  }

  findNearestEnemy(unit) {
    // Optimized: direct iteration instead of array spread + reduce.
    let best = null;
    let bestDistance = Infinity;

    for (let i = 0; i < this.enemyUnits.length; i++) {
      const entry = this.enemyUnits[i];
      if (entry.hp <= 0) continue;
      const d = Phaser.Math.Distance.Between(unit.x, unit.y, entry.x, entry.y);
      if (d < bestDistance) {
        bestDistance = d;
        best = entry;
      }
    }

    for (let i = 0; i < this.structures.length; i++) {
      const entry = this.structures[i];
      if (entry.team === 'enemy' && entry.hp > 0) {
        const d = Phaser.Math.Distance.Between(unit.x, unit.y, entry.x, entry.y);
        if (d < bestDistance) {
          bestDistance = d;
          best = entry;
        }
      }
    }

    return best;
  }

  findNearestPlayerTarget(unit) {
    // Optimized: direct iteration instead of array spread + reduce.
    let best = null;
    let bestDistance = Infinity;

    for (let i = 0; i < this.playerUnits.length; i++) {
      const entry = this.playerUnits[i];
      if (entry.hp <= 0) continue;
      const d = Phaser.Math.Distance.Between(unit.x, unit.y, entry.x, entry.y);
      if (d < bestDistance) {
        bestDistance = d;
        best = entry;
      }
    }

    for (let i = 0; i < this.structures.length; i++) {
      const entry = this.structures[i];
      if (entry.team === 'player' && entry.hp > 0) {
        const d = Phaser.Math.Distance.Between(unit.x, unit.y, entry.x, entry.y);
        if (d < bestDistance) {
          bestDistance = d;
          best = entry;
        }
      }
    }

    return best;
  }

  moveEntityTowards(entity, targetX, targetY, dt) {
    const dx = targetX - entity.x;
    const dy = targetY - entity.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 0.001) {
      return;
    }

    const step = entity.speed * dt;
    if (distance <= step) {
      entity.x = targetX;
      entity.y = targetY;
      return;
    }

    entity.x += (dx / distance) * step;
    entity.y += (dy / distance) * step;
    entity.x = Phaser.Math.Clamp(entity.x, 18, WORLD_WIDTH - 18);
    entity.y = Phaser.Math.Clamp(entity.y, 18, WORLD_HEIGHT - 18);
    entity._motionState = 'move';
  }

  applyMotionScale(entity, dt) {
    if (!entity?.sprite) {
      return;
    }

    const visualState = entity.type === 'structure' || entity.type === 'construction'
      ? entity._motionState
      : getAnimationState({ motionState: entity._motionState, cooldown: entity.cooldown ?? 1, hp: entity.hp });
    const animationProfile = entity.type === 'worker' || entity.type === 'structure' || entity.type === 'construction'
      ? null
      : (visualState === 'idle'
        ? (BASIC_UNIT_ANIMATION_PROFILES[this.race?.id]?.idle || MARINE_ANIMATION_PROFILE.idle)
        : (MARINE_ANIMATION_PROFILE[visualState] || MARINE_ANIMATION_PROFILE.idle));
    const target = (MOTION_SCALE_TARGETS[visualState] ?? MOTION_SCALE_TARGETS.idle) * (animationProfile?.scale ?? 1);
    entity.motionScale = entity.motionScale ?? 1;
    const blend = Math.min(1, dt * 10);
    entity.motionScale = Phaser.Math.Linear(entity.motionScale, target, blend);

    // Phase-based idle breathing/hover motion (reusable, no allocations)
    entity._idlePhase = entity._idlePhase ?? (((entity.id || 0) * 0.77) % (Math.PI * 2));
    const timeSec = (this.time?.now ?? 0) * 0.003;
    const hoverAmp = animationProfile?.yAmplitude
      ?? (entity.type === 'structure' || entity.type === 'construction' ? 0.4 : (entity.type === 'worker' ? 1.0 : 1.4));
    const idleOffsetY = Math.sin(timeSec + entity._idlePhase) * hoverAmp;

    // Brief attack anticipation / recoil impulse
    if (entity._recoilTimer > 0) {
      entity._recoilTimer = Math.max(0, entity._recoilTimer - dt);
    }
    const recoilProgress = (entity._recoilTimer ?? 0) / 0.14;
    const recoilPulse = Math.sin(recoilProgress * Math.PI);
    const recoilScale = 1 + 0.07 * recoilPulse;
    const recoilOffsetY = -2.5 * recoilPulse;

    // Apply bounded visual adjustments to sprite while preserving ground anchor (entity.x, entity.y)
    entity.sprite.setScale(entity.motionScale * recoilScale);
    const angleAmplitude = animationProfile?.angleAmplitude ?? 0;
    entity.sprite.setRotation(Math.sin(timeSec * 2.2 + entity._idlePhase) * angleAmplitude * Math.PI / 180);
    entity.sprite.setPosition(entity.x, entity.y + idleOffsetY + recoilOffsetY);

    // Dynamic shadow responsiveness to hover offset
    if (entity.shadow) {
      const shadowY = entity.y + (entity.radius ? entity.radius * 0.4 : (entity.height ? entity.height * 0.35 : 0));
      entity.shadow.setPosition(entity.x, shadowY);
      entity.shadow.setAlpha(0.42 * Math.max(0.7, 1 - idleOffsetY * 0.04));
    }
  }

  // --- Unit separation (prevents overlap/clumping) ---
  // Optimized: skips pairs whose bounding circles don't overlap, avoiding expensive sqrt calls.
  separateUnits() {
    const unitCount = this.units.length;
    for (let i = 0; i < unitCount; i++) {
      const a = this.units[i];
      if (a.hp <= 0) continue;

      for (let j = i + 1; j < unitCount; j++) {
        const b = this.units[j];
        if (b.hp <= 0) continue;

        // Skip worker-resource overlap — workers can stand on resource nodes
        if (a.type === 'worker' && b.type === 'resource') continue;
        if (b.type === 'worker' && a.type === 'resource') continue;
        // Workers can stand on geysers (they harvest from them)
        if (a.type === 'worker' && b.type === 'gasGeyser') continue;
        if (b.type === 'worker' && a.type === 'gasGeyser') continue;

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distSq = dx * dx + dy * dy;
        const minDist = a.radius + b.radius;

        // Early-out: if circles don't overlap at all, skip (avoids sqrt).
        // Use a generous threshold: 4× the combined radius allows overlap detection
        // while skipping distant pairs that can't possibly interact.
        if (distSq > minDist * minDist * 4 || distSq > 400) {
          continue;
        }

        if (distSq < minDist * minDist && distSq > 0.01) {
          const dist = Math.sqrt(distSq);
          // Push apart proportional to overlap amount, clamped by SEPARATION_FORCE * dt
          const overlap = minDist - dist;
          const force = Math.min(overlap * 0.5, SEPARATION_FORCE);
          const nx = dx / dist;
          const ny = dy / dist;

          a.x -= nx * force;
          a.y -= ny * force;
          b.x += nx * force;
          b.y += ny * force;

          // Clamp back to world bounds after separation
          a.x = Phaser.Math.Clamp(a.x, 18, WORLD_WIDTH - 18);
          a.y = Phaser.Math.Clamp(a.y, 18, WORLD_HEIGHT - 18);
          b.x = Phaser.Math.Clamp(b.x, 18, WORLD_WIDTH - 18);
          b.y = Phaser.Math.Clamp(b.y, 18, WORLD_HEIGHT - 18);
        }
      }
    }
  }

  resolveCombat() {
    this.units.forEach((unit) => {
      if (unit.hp <= 0) {
        return;
      }

      if (unit.type === 'worker' && unit.manual && unit.order === 'construct') {
        return;
      }

      if (unit.targetEntity && unit.targetEntity.hp <= 0) {
        unit.targetEntity = null;
      }
    });
  }

  reapDeadEntities() {
    const deadUnits = this.units.filter((unit) => unit.hp <= 0);
    deadUnits.forEach((unit) => {
      // Death explosion visual + audio feedback
      this.showDeathExplosion(unit.x, unit.y, unit);
      this.destroyEntity(unit);
    });
    this.units = this.units.filter((unit) => unit.hp > 0);
    this.playerUnits = this.playerUnits.filter((unit) => unit.hp > 0);
    this.enemyUnits = this.enemyUnits.filter((unit) => unit.hp > 0);

    const deadStructures = this.structures.filter((structure) => structure.hp <= 0);
    deadStructures.forEach((structure) => {
      // Death explosion for structures too
      this.showDeathExplosion(structure.x, structure.y, structure);
      this.destroyEntity(structure);
    });
    this.structures = this.structures.filter((structure) => structure.hp > 0);
    this.constructions = this.constructions.filter((construction) => construction.hp > 0 && construction.type === 'construction');

    // Refresh tech building cache when structures change.
    this._updateTechCache();

    if (this.selectedEntities && this.selectedEntities.length > 0) {
      const livingSelected = this.selectedEntities.filter((u) => u.hp > 0);
      if (livingSelected.length === 0) {
        this.clearSelection();
      } else if (livingSelected.length !== this.selectedEntities.length || (this.selectedEntity && this.selectedEntity.hp <= 0)) {
        this.selectedEntities = livingSelected;
        if (!this.selectedEntity || this.selectedEntity.hp <= 0) {
          this.selectedEntity = livingSelected[0];
        }
        if (this.selectedEntities.length === 1) {
          this.selectEntity(this.selectedEntity);
        } else {
          this.showMultiSelectionHighlights(this.selectedEntities);
          this.syncSession();
        }
      }
    } else if (this.selectedEntity && this.selectedEntity.hp <= 0) {
      this.clearSelection();
    }
  }

  destroyEntity(entity) {
    if (entity._damageFlash) {
      entity._damageFlash.stop();
      entity._damageFlash = null;
    }
    if (entity._hpEmphasizeTween) {
      entity._hpEmphasizeTween.stop();
      entity._hpEmphasizeTween = null;
    }
    if (entity._dmgTexts) {
      entity._dmgTexts.forEach((t) => t?.destroy());
      entity._dmgTexts = null;
    }
    entity.shadow?.destroy();
    entity.teamMarker?.destroy();
    entity.roleRing?.destroy();
    entity.energyHalo?.destroy();
    entity.sprite?.destroy();
    entity.ridge?.destroy();
    entity.core?.destroy();
    entity.labelText?.destroy();
    entity.hpBack?.destroy();
    entity.hpFront?.destroy();
    entity.critStructureIndicator?.destroy();
    entity.critIndicator?.destroy();
    entity.statusText?.destroy();
    entity.glow?.destroy();
  }

  syncSession(messageOverride) {
    // Optimized: count directly instead of creating filtered arrays.
    let playerStructCount = 0;
    let enemyStructCount = 0;
    let playerCombatCount = 0;
    let enemyCombatCount = 0;
    for (let i = 0; i < this.structures.length; i++) {
      const s = this.structures[i];
      if (s.hp > 0) {
        if (s.team === 'player') playerStructCount++;
        else enemyStructCount++;
      }
    }
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      if (u.hp > 0) {
        if (u.team === 'player' && u.type !== 'worker') playerCombatCount++;
        else if (u.team === 'enemy' && u.type !== 'worker') enemyCombatCount++;
      }
    }

    const selected = this.selectedEntity;
    const selection = this.describeSelection(selected);
    const availableCommands = this.getAvailableCommands(selected);
    const buildQueue = this.getBuildQueueSummary();
    const status = messageOverride ?? (this.paused ? 'Paused.' : this.ended ? 'Battle ended.' : 'Battle in progress.');

    session.setResources({
      minerals: Math.floor(this.playerMinerals),
      gas: Math.floor(this.playerGas),
      supplyUsed: this.playerSupplyUsed,
      supplyCap: this.playerSupplyCap,
      enemyMinerals: Math.floor(this.enemyMinerals)
    });

    session.setSelection(selection);
    session.setBattle({
      playerUnits: playerCombatCount,
      enemyUnits: enemyCombatCount,
      playerStructures: playerStructCount,
      enemyStructures: enemyStructCount,
      playerBaseHp: Math.max(0, Math.floor(this.playerCommandCenter?.hp ?? 0)),
      enemyBaseHp: Math.max(0, Math.floor(this.enemyCommandCenter?.hp ?? 0)),
      wave: this.enemyWave,
      commandMode: this.commandMode,
      availableCommands,
      buildQueue,
      status
    });

    if (messageOverride) {
      session.setMessage(messageOverride);
    }
  }

  describeSelection(entity) {
    if (!entity) {
      return {
        label: 'None selected',
        kind: 'none',
        owner: 'none',
        hp: 0,
        maxHp: 0,
        details: 'Tap a unit or structure to inspect it.'
      };
    }

    if (this.selectedEntities && this.selectedEntities.length > 1) {
      return {
        label: `Squad (${this.selectedEntities.length})`,
        kind: 'combat',
        owner: 'player',
        hp: entity.hp,
        maxHp: entity.maxHp,
        details: `${this.selectedEntities.length} combat units selected. Tap empty ground to move squad, or tap enemy to attack.`
      };
    }

    if (entity.type === 'resource') {
      return {
        label: entity.label,
        kind: 'resource',
        owner: 'neutral',
        hp: entity.amount,
        maxHp: entity.maxAmount,
        details: `Remaining minerals: ${Math.floor(entity.amount)}.`
      };
    }

    if (entity.type === 'gasGeyser') {
      return {
        label: entity.label,
        kind: 'gasGeyser',
        owner: 'neutral',
        hp: entity.amount,
        maxHp: entity.maxAmount,
        details: `Gas remaining: ${Math.floor(entity.amount)}. Workers assigned: ${entity.assignedWorkers}/${entity.maxWorkers}. Tap a worker to assign them here.`
      };
    }

    if (entity.type === 'construction') {
      return {
        label: `${entity.roleName} (building)`,
        kind: 'construction',
        owner: entity.team,
        hp: entity.hp,
        maxHp: entity.maxHp,
        details: `Construction in progress. Remaining: ${Math.max(0, entity.buildTimeRemaining).toFixed(1)}s.`
      };
    }

    if (entity.type === 'structure') {
      const queueText = entity.queue.length > 0 ? entity.queue.map((item) => `${item.def.label} ${(Math.max(0, item.progress)).toFixed(1)}s`).join(' • ') : 'Queue empty.';
      const extraInfo = entity.role === 'techBuilding' ? '\nUnlocks signature unit production.' : '';
      return {
        label: entity.roleName,
        kind: 'structure',
        owner: entity.team,
        hp: entity.hp,
        maxHp: entity.maxHp,
        details: `${entity.role === 'commandCenter' ? 'Headquarters' : entity.role === 'techBuilding' ? 'Tech Building' : 'Production'}${extraInfo}\n${queueText}`
      };
    }

    const gasInfo = entity.harvestType === 'gas' ? `\nHarvesting gas (${entity.cargoTarget}/trip).` : '';
    const sigInfo = entity.isSignature ? '\n[Signature Unit]' : '';

    return {
      label: entity.label + sigInfo,
      kind: entity.type,
      owner: entity.team,
      hp: entity.hp,
      maxHp: entity.maxHp,
      details: entity.type === 'worker'
        ? `Worker unit. Carrying ${Math.floor(entity.cargo)} resources.${gasInfo} ${entity.manual ? 'Manual order active.' : 'Automatically harvesting.'}`
        : `Combat unit.${sigInfo} ${entity.manual ? 'Manual movement active.' : 'Auto-acquiring targets.'}`
    };
  }

  getAvailableCommands(entity) {
    const commands = ['select', 'pause'];

    if (!entity || entity.team !== 'player') {
      return commands;
    }

    if (entity.type === 'worker') {
      commands.splice(1, 0, 'move', 'build-supply', 'build-defense', 'build-production', 'build-tech');
      return commands;
    }

    if (entity.type === 'structure' && entity.role === 'commandCenter') {
      commands.splice(1, 0, 'train-worker');
      return commands;
    }

    if (entity.type === 'structure' && entity.role === 'production') {
      commands.splice(1, 0, 'train-soldier');
      // Optimized: cache tech building lookup — only scan if queue has items.
      const hasTech = this._cachedTechBuilding || this.structures.some((s) => s.team === 'player' && s.role === 'techBuilding' && s.type === 'structure');
      if (hasTech) {
        commands.splice(2, 0, 'train-signature');
      }
      return commands;
    }

    if (entity.type === 'structure' && entity.role === 'techBuilding') {
      return commands;
    }

    if (entity.type !== 'resource') {
      commands.splice(1, 0, 'move', 'attack');
    }

    return commands;
  }

  getBuildQueueSummary() {
    const queue = [];
    this.structures.forEach((structure) => {
      if (structure.queue.length > 0) {
        queue.push(`${structure.roleName}: ${structure.queue[0].def.label} ${(Math.max(0, structure.queue[0].progress)).toFixed(1)}s`);
      }
      if (structure.type === 'construction') {
        queue.push(`${structure.roleName}: ${(Math.max(0, structure.buildTimeRemaining)).toFixed(1)}s`);
      }
    });
    return queue.slice(0, 4);
  }

  checkVictoryDefeat() {
    if (!this.ended && this.enemyCommandCenter && this.enemyCommandCenter.hp <= 0) {
      this.finishBattle('victory', `Victory! The ${this.race.name} force has destroyed the enemy base.`);
    }

    if (!this.ended && this.playerCommandCenter && this.playerCommandCenter.hp <= 0) {
      this.finishBattle('defeat', `Defeat. The ${this.race.commandCenterName} has fallen.`);
    }
  }

  finishBattle(outcome, message) {
    this.ended = true;
    this.endTapReady = false;
    this.commandMode = 'select';
    session.setOutcome(outcome);
    session.setScreen(outcome === 'victory' ? GameStates.VICTORY : GameStates.DEFEAT, outcome);
    session.setMessage(`${message} Tap anywhere to return to the menu.`);
    session.pushLog(message);
    this.syncSession(message);

    // Show dramatic victory/defeat overlay
    const { width, height } = this.scale;
    const cx = width / 2, cy = height / 2 - 30;

    // Dark overlay
    const overlay = this.add.rectangle(cx, cy, width, height, 0x020617, outcome === 'victory' ? 0.55 : 0.7)
      .setAlpha(0).setDepth(100);

    // Banner background
    const banner = this.add.rectangle(cx, cy - 20, Math.min(480, width - 60), 120, outcome === 'victory' ? 0x1e3a5f : 0x7c2d12, outcome === 'victory' ? 0.85 : 0.9)
      .setStrokeStyle(2, outcome === 'victory' ? 0x60a5fa : 0xf97316, 0.8).setAlpha(0).setDepth(101);

    // Result title
    const resultText = this.add.text(cx, cy - 40, outcome === 'victory' ? 'VICTORY' : 'DEFEAT', {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: 'clamp(32px, 8vw, 56px)',
      fontStyle: '900',
      color: outcome === 'victory' ? '#60a5fa' : '#f97316'
    }).setOrigin(0.5).setAlpha(0).setDepth(102);

    // Subtitle
    const subtitle = this.add.text(cx, cy + 10, message.replace(/^Victory!\s*\/\s*Defeat\s*\.\s*/, ''), {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: 'clamp(14px, 3vw, 20px)',
      color: '#cbd5e1'
    }).setOrigin(0.5).setAlpha(0).setDepth(102);

    // Return prompt
    const prompt = this.add.text(cx, cy + 60, 'Tap anywhere to return', {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: 'clamp(12px, 2.5vw, 16px)',
      fontStyle: '700',
      color: '#94a3b8'
    }).setOrigin(0.5).setAlpha(0).setDepth(102);

    // Fade in sequence
    this.tweens.add({ targets: overlay, alpha: outcome === 'victory' ? 0.55 : 0.7, duration: 400 });
    this.tweens.addChain([{ targets: [banner, resultText], alpha: 1, duration: 300, ease: 'Cubic.easeOut', delay: 200 },
      { targets: subtitle, alpha: 1, duration: 250, ease: 'Cubic.easeOut' },
      { targets: prompt, alpha: 1, duration: 250, ease: 'Cubic.easeOut',
        onComplete: () => { this.endTapReady = true; } }]);

    // Store overlay refs for cleanup
    this._endOverlay = { overlay, banner, resultText, subtitle, prompt };
  }

  returnToMenu() {
    // Clean up end-of-battle overlay if present
    if (this._endOverlay) {
      const o = this._endOverlay;
      o.overlay.destroy(); o.banner.destroy(); o.resultText.destroy();
      o.subtitle.destroy(); o.prompt.destroy();
      this._endOverlay = null;
    }

    this.scene.stop('HudScene');
    session.resetForMenu('Choose a faction and start the mission.');
    this.scene.start('MenuScene');
  }

  shutdown() {
    // Clean up end-of-battle overlay if battle ended without returnToMenu being called.
    this._endOverlay = null; // Phaser scene shutdown destroys all children automatically
    this.inputController?.destroy();
    this.scene.stop('HudScene');
    this.scale.off('resize', this.handleResize, this);
    if (this.audioManager) {
      this.audioManager.destroy();
    }
    if (this._audioSystem) {
      this._audioSystem.destroy();
    }
    this.clearSelectionHighlight();
    if (this.selectionBoxGraphics) {
      this.selectionBoxGraphics.destroy();
      this.selectionBoxGraphics = null;
    }
    if (this.tapFeedback) {
      this.tapFeedback.destroy();
      this.tapFeedback = null;
    }
  }

  handleResize() {
    clampCamera(this.cameras.main);
  }

  updateStatusText() {
    if (this.banner) {
      this.banner.setText(`${this.race.name} advance`);
    }
  }

  // --- Mobile visual feedback helpers ---

  /** Draw a pulsing selection ring around the selected entity. */
  showSelectionHighlight(entity) {
    // Clean up previous highlight
    this.clearSelectionHighlight();

    if (!entity || !entity.sprite) return;

    const radius = entity.radius || 20;
    const highlightColor = this.race.accent ?? 0x3b82f6;
    const teamColor = entity.team === 'enemy' ? 0xf97316 : 0x22c55e;

    this.selectionHighlight = this.add.group();

    // Outer pulsing accent halo
    const glowRing = this.add.circle(entity.x, entity.y, radius + 12, highlightColor, 0.2)
      .setStrokeStyle(1.5, highlightColor, 0.75)
      .setDepth(5);

    // Inner crisp team selection ring
    const innerRing = this.add.circle(entity.x, entity.y, radius + 6, teamColor, 0.05)
      .setStrokeStyle(2, teamColor, 0.95)
      .setDepth(5);

    this.selectionHighlight.add(glowRing);
    this.selectionHighlight.add(innerRing);

    // Faction-readable accent selection edge
    const raceId = this.race?.id;
    if (raceId === 'terran') {
      const bOffset = radius + 8;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => {
        const offX = sx * bOffset, offY = sy * bOffset;
        const tick = this.add.rectangle(entity.x + offX, entity.y + offY, 5, 5, 0x38bdf8, 0.85).setDepth(5);
        tick._offX = offX; tick._offY = offY;
        this.selectionHighlight.add(tick);
      });
    } else if (raceId === 'zerg') {
      const bioRing = this.add.circle(entity.x, entity.y, radius + 9, 0xfbbf24, 0.08)
        .setStrokeStyle(1, 0xfbbf24, 0.6).setDepth(5);
      this.selectionHighlight.add(bioRing);
    } else if (raceId === 'protoss') {
      const nOffset = radius + 8;
      [[0, -nOffset], [nOffset, 0], [0, nOffset], [-nOffset, 0]].forEach(([dx, dy]) => {
        const notch = this.add.rectangle(entity.x + dx, entity.y + dy, 4, 4, 0xc4b5fd, 0.9)
          .setRotation(Math.PI / 4).setDepth(5);
        notch._offX = dx; notch._offY = dy;
        this.selectionHighlight.add(notch);
      });
    }

    // Pulsing animation - gentle breathing effect
    this.selectionHighlightTween = this.tweens.add({
      targets: [glowRing, innerRing],
      alpha: 0.35,
      scaleX: 1.06,
      scaleY: 1.06,
      duration: FEEDBACK_TIMINGS.selectionPulse,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Attack range indicator (dashed ring) for combat units
    if (entity.range && entity.type !== 'worker') {
      this.rangeRing = this.add.circle(entity.x, entity.y, entity.range, highlightColor, 0.06)
        .setStrokeStyle(1, highlightColor, 0.4)
        .setAlpha(0.5).setDepth(4);

      // Subtle pulse on range ring
      this.rangeRingTween = this.tweens.add({
        targets: this.rangeRing,
        alpha: 0.25,
        scaleX: 1.03,
        scaleY: 1.03,
        duration: FEEDBACK_TIMINGS.selectionPulse * 2,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }
  }

  showMultiSelectionHighlights(entities) {
    this.clearSelectionHighlight();
    if (!entities || entities.length === 0) return;

    this.showSelectionHighlight(entities[0]);
    this.secondaryHighlights = [];

    const teamColor = 0x22c55e;
    for (let i = 1; i < entities.length; i++) {
      const u = entities[i];
      if (!u || !u.sprite) continue;
      const radius = u.radius || 20;
      const ring = this.add.circle(u.x, u.y, radius + 6, teamColor, 0.05)
        .setStrokeStyle(1.5, teamColor, 0.85)
        .setDepth(5);
      this.secondaryHighlights.push({ unit: u, ring });
    }
  }

  updateSelectionHighlightPosition() {
    if (this.selectedEntity && this.selectionHighlight) {
      const x = this.selectedEntity.x;
      const y = this.selectedEntity.y;
      if (typeof this.selectionHighlight.getChildren === 'function') {
        this.selectionHighlight.getChildren().forEach((child) => {
          child.setPosition(x + (child._offX || 0), y + (child._offY || 0));
        });
      }
      if (this.rangeRing) {
        this.rangeRing.setPosition(x, y);
      }
    }

    if (this.secondaryHighlights && this.secondaryHighlights.length > 0) {
      for (let i = 0; i < this.secondaryHighlights.length; i++) {
        const sh = this.secondaryHighlights[i];
        if (sh.ring && sh.unit) {
          sh.ring.setPosition(sh.unit.x, sh.unit.y);
        }
      }
    }
  }

  clearSelectionHighlight() {
    if (this.selectionHighlight) {
      this.selectionHighlight.destroy(true);
      this.selectionHighlight = null;
    }
    if (this.selectionHighlightTween) {
      this.selectionHighlightTween.stop();
      this.selectionHighlightTween = null;
    }
    if (this.rangeRing) {
      this.rangeRing.destroy();
      this.rangeRing = null;
    }
    if (this.rangeRingTween) {
      this.rangeRingTween.stop();
      this.rangeRingTween = null;
    }
    if (this.secondaryHighlights) {
      this.secondaryHighlights.forEach((sh) => sh.ring?.destroy());
      this.secondaryHighlights = [];
    }
  }

  /** Brief flash at tap location - confirms move/attack commands on mobile. */
  showTapIndicator(worldX, worldY, mode = 'move') {
    // Clean up previous feedback
    if (this.tapFeedback) {
      this.tapFeedback.destroy(true);
    }

    const isAttack = mode === 'attack';
    const color = isAttack ? 0xef4444 : 0x38bdf8;
    const ringColor = isAttack ? 0xf87171 : 0x60a5fa;

    this.tapFeedback = this.add.group();

    const ring = this.add.circle(worldX, worldY, 14, ringColor, 0.2).setStrokeStyle(2, color, 0.95).setDepth(80);
    const size = isAttack ? 16 : 12;
    const hLine = this.add.rectangle(worldX, worldY, size, 2, color, 0.95).setOrigin(0.5).setDepth(80);
    const vLine = this.add.rectangle(worldX, worldY, 2, size, color, 0.95).setOrigin(0.5).setDepth(80);

    this.tapFeedback.add(ring);
    this.tapFeedback.add(hLine);
    this.tapFeedback.add(vLine);

    if (isAttack) {
      const dot = this.add.circle(worldX, worldY, 3, 0xef4444, 0.9).setDepth(80);
      this.tapFeedback.add(dot);
    }

    // Brief flash then fade out with scale pulse
    this.tweens.add({
      targets: this.tapFeedback.getChildren(),
      alpha: 0,
      scaleX: isAttack ? 0.6 : 1.35,
      scaleY: isAttack ? 0.6 : 1.35,
      duration: FEEDBACK_TIMINGS.tapFlash,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        if (this.tapFeedback) {
          this.tapFeedback.destroy(true);
          this.tapFeedback = null;
        }
      }
    });
  }

  /** Subtle ripple on empty battlefield tap - confirms deselection. */
  showDeselectRipple(x, y) {
    // Clean up previous feedback
    if (this.tapFeedback) {
      this.tapFeedback.destroy();
    }

    // Small expanding ring - subtle confirmation of empty tap
    this.tapFeedback = this.add.circle(x, y, 4, 0x475569, 0.6)
      .setStrokeStyle(1, 0x475569, 0.5)
      .setDepth(3);

    this.tweens.add({
      targets: this.tapFeedback,
      scaleX: 4,
      scaleY: 4,
      alpha: 0,
      duration: FEEDBACK_TIMINGS.deselectRipple,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        this.tapFeedback?.destroy();
        this.tapFeedback = null;
      }
    });
  }

  /** Unit takes damage — brief red flash + audio feedback + readability enhancements. */
  showDamageFlash(unit, damageAmount) {
    if (!unit || !unit.sprite || !unit.sprite.active) return;

    const baseTint = unit.team === 'enemy' ? 0xf97316 : null;

    // Brief red tint on sprite while preserving faction tint
    if (unit._damageFlash) {
      unit._damageFlash.stop();
      unit._damageFlash = null;
    }
    unit.sprite.setTint(0xff4444);
    unit._damageFlash = this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: FEEDBACK_TIMINGS.damageFlash * 2,
      onComplete: () => {
        unit._damageFlash = null;
        if (unit.sprite?.active) {
          if (baseTint != null) unit.sprite.setTint(baseTint);
          else unit.sprite.clearTint();
        }
      }
    });

    // Short reusable hit-ring / target impact visual overlay
    spawnTargetImpact(this, unit.x, unit.y, this.race?.id || 'terran');

    // Briefly emphasize target HP bar (both back and front bars)
    if (unit.hpBack?.active && unit.hpFront?.active) {
      if (unit._hpEmphasizeTween) {
        unit._hpEmphasizeTween.stop();
        unit._hpEmphasizeTween = null;
      }
      unit.hpBack.setScale(1, 1.8);
      unit.hpFront.setScale(1, 1.8);
      unit._hpEmphasizeTween = this.tweens.addCounter({
        from: 0,
        to: 1,
        duration: 160,
        onComplete: () => {
          unit._hpEmphasizeTween = null;
          if (unit.hpBack?.active) unit.hpBack.setScale(1, 1);
          if (unit.hpFront?.active) unit.hpFront.setScale(1, 1);
        }
      });
    }

    // Bounded, non-overlapping floating damage number above the unit
    if (damageAmount) {
      if (!unit._dmgTexts) unit._dmgTexts = [];
      unit._dmgTexts = unit._dmgTexts.filter((t) => t && t.active);
      if (unit._dmgTexts.length >= 3) {
        const oldest = unit._dmgTexts.shift();
        oldest?.destroy();
      }
      const offsetCount = unit._dmgTexts.length;
      const startY = unit.y - 28 - offsetCount * 12;
      const dmgText = this.add.text(unit.x, startY, `-${damageAmount}`, {
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: 'clamp(12px, 2vw, 16px)',
        fontStyle: '900',
        color: '#ff4444',
        stroke: '#000000',
        strokeThickness: 3
      }).setOrigin(0.5).setScrollFactor(1).setDepth(80);

      unit._dmgTexts.push(dmgText);

      this.tweens.add({
        targets: dmgText,
        y: startY - 24,
        alpha: 0,
        duration: 650,
        ease: 'Cubic.easeOut',
        onComplete: () => {
          if (unit._dmgTexts) {
            unit._dmgTexts = unit._dmgTexts.filter((t) => t !== dmgText);
          }
          dmgText.destroy();
        }
      });
    }

    // Audio: hit sound
    if (this.audioManager) this.audioManager.hit(unit);
  }

  /** Unit dies — explosion particle burst + audio feedback. */
  showDeathExplosion(x, y, entity = null) {
    const palette = this.particleManager?.getPalette?.() || this.particleManager?.palettes?.terran || {
      mineral: [0x60a5fa, 0x93c5fd, 0x2563eb, 0x38bdf8],
      mineralBright: [0xdbeafe, 0x67e8f9],
      gas: [0xc084fc, 0xf0abfc, 0x8b5cf6],
      gasBright: [0xf0abfc, 0xd8b4fe],
      dust: [0x64748b, 0x94a3b8, 0x475569],
      construction: [0x2563eb, 0x3b82f6, 0x93c5fd],
      completion: [0x60a5fa, 0x93c5fd, 0xdbeafe, 0x2563eb]
    };

    // Spawn 16-24 explosion particles in a radial pattern
    const count = Phaser.Math.Between(16, 24);
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count + Phaser.Math.Between(-10, 10);
      const speed = Phaser.Math.Between(40, 120);
      const colors = [...palette.mineral, ...palette.mineralBright];
      const size = Phaser.Math.Between(3, 7);

      const particle = this.add.circle(x, y, size, colors[Phaser.Math.Between(0, colors.length - 1)], 0.9)
        .setScrollFactor(1);

      // Explode outward and fade
      this.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * speed,
        y: y + Math.sin(angle) * speed,
        alpha: 0,
        scale: 0,
        duration: 400 + Phaser.Math.Between(0, 200),
        ease: 'Cubic.easeOut',
        onComplete: () => {
          particle.destroy();
        }
      });
    }

    // Audio: explosion/death sound
    if (this.audioManager) this.audioManager.explosion(entity);

    // Screen shake on structure death for dramatic impact
    const isStructure = entity?.type === 'structure';
    if (isStructure) {
      this.cameras.main.shake(300, 0.015);
    } else {
      this.cameras.main.shake(100, 0.005);
    }
  }

  // ── Edge warning flash before enemy waves ────────────────────────
  showEdgeWarning() {
    const { width, height } = this.scale;

    // Red flash on all four edges
    const topBar = this.add.rectangle(width / 2, 0, width, 4, 0xf97316, 0.8).setDepth(200);
    const bottomBar = this.add.rectangle(width / 2, height, width, 4, 0xf97316, 0.8).setDepth(200);
    const leftBar = this.add.rectangle(0, height / 2, 4, height, 0xf97316, 0.8).setDepth(200);
    const rightBar = this.add.rectangle(width, height / 2, 4, height, 0xf97316, 0.8).setDepth(200);

    // Pulse and fade
    this.tweens.add({
      targets: [topBar, bottomBar, leftBar, rightBar],
      alpha: 0,
      duration: 1500,
      ease: 'Sine.easeOut',
      repeat: 1,
      yoyo: true,
      onComplete: () => { topBar.destroy(); bottomBar.destroy(); leftBar.destroy(); rightBar.destroy(); }
    });

    // Audio: warning sound
    if (this.audioManager) this.audioManager.waveWarn();
  }

  /** Wave announcement — brief banner showing wave number. */
  showWaveAnnouncement(waveNumber) {
    const camera = this.cameras.main;
    const { width, height } = this.scale;

    // Clean up previous banner
    if (this.waveBanner) {
      this.waveBanner.destroy();
    }

    const centerX = width / 2;
    const centerY = height / 2 - 40;

    // Dark background panel
    const bg = this.add.rectangle(centerX, centerY, 280, 56, 0x020617, 0.85)
      .setStrokeStyle(1, 0x3b82f6, 0.7)
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(10);

    // Wave number text
    const text = this.add.text(centerX, centerY, `Wave ${waveNumber}`, {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: 'clamp(18px, 3.5vw, 24px)',
      fontStyle: '700',
      color: '#ffffff'
    }).setOrigin(0.5).setAlpha(0).setDepth(11);

    // Subtitle
    const subtitle = this.add.text(centerX, centerY + 28, 'advancing', {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: 'clamp(11px, 2vw, 14px)',
      fontStyle: '600',
      color: '#93c5fd'
    }).setOrigin(0.5).setAlpha(0).setDepth(11);

    this.waveBanner = this.add.group([bg, text, subtitle]);

    // Fade in, hold, fade out
    this.tweens.add({
      targets: [bg, text, subtitle],
      alpha: 1,
      duration: FEEDBACK_TIMINGS.waveFadeIn,
      ease: 'Cubic.easeOut',
      delay: 0,
      onComplete: () => {
        this.tweens.add({
          targets: [bg, text, subtitle],
          alpha: 0,
          duration: FEEDBACK_TIMINGS.waveFadeOut,
          ease: 'Cubic.easeIn',
          delay: FEEDBACK_TIMINGS.waveHold,
          onComplete: () => {
            this.waveBanner?.destroy();
            this.waveBanner = null;
          }
        });
      }
    });

    if (this.audioManager) this.audioManager.waveWarn();
  }

  /** Building completion glow — brief highlight when a structure finishes construction. */
  showCompletionGlow(x, y, raceId) {
    const raceColors = { terran: 0x3b82f6, zerg: 0xf97316, protoss: 0x7c3aed };
    const color = raceColors[raceId] ?? 0x3b82f6;

    // Expanding glow ring
    const glow = this.add.circle(x, y, 10, color, 0.6)
      .setStrokeStyle(2, color, 0.8)
      .setAlpha(1)
      .setDepth(4);

    this.tweens.add({
      targets: glow,
      scaleX: 5,
      scaleY: 5,
      alpha: 0,
      duration: FEEDBACK_TIMINGS.completionGlow,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        glow.destroy();
      }
    });

    // Audio: completion chime
    if (this.audioManager) this.audioManager.complete();
  }

  /** Show a charge impact effect (Protoss Zealot/Dragoon charge hit). */
  showChargeImpact(x, y) {
    // Impact ring
    const impact = this.add.circle(x, y, 8, 0x7c3aed, 0.9)
      .setStrokeStyle(3, 0xc4b5fd, 0.9)
      .setAlpha(1)
      .setDepth(6);

    this.tweens.add({
      targets: impact,
      scaleX: 4,
      scaleY: 4,
      alpha: 0,
      duration: FEEDBACK_TIMINGS.chargeImpact,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        impact.destroy();
      }
    });

    // Audio: charge hit sound
    if (this.audioManager) this.audioManager.chargeHit();
  }

shutdown() {
    this.visualPolish?.destroy();
    this.visualPolish = null;
    this.inputController?.destroy();
    this.scene.stop('HudScene');
    this.scale.off('resize', this.handleResize, this);
    this.clearSelectionHighlight();
    this.selectionBoxGraphics?.destroy();
    this.selectionBoxGraphics = null;
    if (this.secondaryHighlights) {
      for (const sh of this.secondaryHighlights) {
        sh.ring?.destroy();
      }
      this.secondaryHighlights = [];
    }
  }
}