import Phaser from 'phaser';
import { session, GameStates } from '../game/state/gameSession.js';
import { getRace } from '../game/data/races.js';
import { getDifficulty, getEnemyWaveInterval } from '../game/data/difficulties.js';
import { createInputController } from '../game/input/createInputController.js';
import { getUnitDef } from '../game/unitDefs.js';
import ParticleManager from '../game/particles/ParticleManager.js';
import { spawnMuzzleFlash, spawnExplosion } from '../game/particleEffects.js';
import { audioSystem } from '../game/audio/audioSystem.js';
import { createAudioManager } from '../game/audioManager.js';

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
  { x: 315, y: WORLD_HEIGHT / 2 + 150 }
];
const ENEMY_BUILD_SLOTS = [
  { x: WORLD_WIDTH - 315, y: WORLD_HEIGHT / 2 - 150 },
  { x: WORLD_WIDTH - 315, y: WORLD_HEIGHT / 2 + 150 }
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

    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    this.createBattleTextures();

    this.background = this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, this.race.backdrop, 1);
    this.grid = this.add.grid(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, 48, 48, 0x0c1826, 0, 0x223548, 0.35)
      .setOrigin(0.5)
      .setAlpha(0.22);

    this.middleLane = this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 220, WORLD_HEIGHT - 90, 0x0f172a, 0.18)
      .setStrokeStyle(1, 0x1f3b61, 0.35);

    this.playerZone = this.add.rectangle(0, WORLD_HEIGHT / 2, 360, WORLD_HEIGHT, this.race.accent, 0.08)
      .setOrigin(0, 0.5);
    this.enemyZone = this.add.rectangle(WORLD_WIDTH, WORLD_HEIGHT / 2, 360, WORLD_HEIGHT, 0xf97316, 0.08)
      .setOrigin(1, 0.5);

    this.drawDecor();
    this.createMap();
    this.createGasGeysers();
    this.spawnStartingForces();
    this.createBattleFieldTitle();

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

    this.add.rectangle(WORLD_WIDTH / 2, 110, WORLD_WIDTH - 200, 8, 0x1d4ed8, 0.35);
    this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT - 110, WORLD_WIDTH - 200, 8, enemyColor, 0.35);
    this.add.circle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 120, laneColor, 0.05);
    this.add.circle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 220, 0x38bdf8, 0.03);
    this.add.rectangle(220, WORLD_HEIGHT / 2, 280, WORLD_HEIGHT - 120, laneColor, 0.08);
    this.add.rectangle(WORLD_WIDTH - 220, WORLD_HEIGHT / 2, 280, WORLD_HEIGHT - 120, enemyColor, 0.08);
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
        labelText: null,
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
    const label = this.add.text(x, y + 20, 'Minerals', {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: '12px',
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
                    this.race.structures.production;
    const width = baseDef.width;
    const height = baseDef.height;
    const active = options.active ?? true;
    const construction = options.construction ?? false;
    const roleName = options.roleName ?? (role === 'commandCenter' ? this.race.commandCenterName : role === 'techBuilding' ? this.race.techBuildingName : this.race.productionName);
    const textureKey = role === 'commandCenter'
      ? (this.race.id === 'zerg' ? 'zerg-command-center' : this.race.id === 'protoss' ? 'protoss-command-center' : 'terran-command-center')
      : role === 'techBuilding'
        ? (this.race.id === 'zerg' ? 'zerg-tech' : this.race.id === 'protoss' ? 'protoss-tech' : 'terran-factory')
        : (this.race.id === 'zerg' ? 'zerg-production' : this.race.id === 'protoss' ? 'protoss-production' : 'terran-barracks');

    const sprite = this.add.image(x, y, textureKey)
      .setDisplaySize(width, height)
      .setAlpha(construction ? 0.7 : 0.98);
    if (team === 'enemy') {
      sprite.setTint(0xf97316);
    }
    const ridge = this.add.rectangle(x, y - height / 2 + 8, width - 18, 4, 0xffffff, construction ? 0.16 : 0.22);
    const labelText = this.add.text(x, y - 5, roleName, {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: 'clamp(10px, 2vw, 14px)',
      fontStyle: '700',
      color: '#ffffff',
      align: 'center',
      wordWrap: { width: width - 8 }
    }).setOrigin(0.5);

    const hpBack = this.add.rectangle(x, y + height / 2 + 10, width + 8, 6, 0x0f172a, 1);
    const hpFront = this.add.rectangle(x - (width + 8) / 2, y + height / 2 + 10, width + 8, 6, team === 'player' ? 0x22c55e : 0xfb7185, 1)
      .setOrigin(0, 0.5);
    const statusText = this.add.text(x, y + height / 2 + 24, construction ? 'Construction' : 'Operational', {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: 'clamp(10px, 1.9vw, 13px)',
      color: '#cbd5e1',
      align: 'center'
    }).setOrigin(0.5);

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
      sprite,
      ridge,
      labelText,
      hpBack,
      hpFront,
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

    // Use add.image() with procedural textures from BootScene (no spritesheets).
    const sprite = this.add.image(x, y, spriteKey);
    sprite.setDisplaySize(def.radius * 2, def.radius * 2);
    if (team === 'enemy') {
      sprite.setTint(0xf97316);
    }

    const labelText = null;
    const hpBack = this.add.rectangle(x, y + def.radius + 8, def.radius * 2 + 8, 5, 0x0f172a, 1);
    const hpFront = this.add.rectangle(x - (def.radius * 2 + 8) / 2, y + def.radius + 8, def.radius * 2 + 8, 5, team === 'player' ? 0x22c55e : 0xfb7185, 1)
      .setOrigin(0, 0.5);

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
    }).setOrigin(0.5);

    const entity = {
      id: this.nextId += 1,
      type: kind,
      team,
      label: def.label,
      x,
      y,
      vx: 0,
      vy: 0,
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

    if (team === 'player') {
      this.playerUnits.push(entity);
    } else {
      this.enemyUnits.push(entity);
    }

    if (kind === 'worker') {
      entity.order = options.harvestType === 'gas' ? 'gasHarvest' : 'harvest';
    }

    return entity;
  }

  // Thin wrapper that delegates to the pure helper in src/game/unitDefs.js.
  getUnitDef(team, kind, enemyKind) {
    return getUnitDef(this.race, team, kind, enemyKind);
  }

  // --- Touch/mouse input for panning and tapping ---
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
      }

      if (this.dragState.moved) {
        this.cameras.main.scrollX = this.dragState.camX - dx / this.cameras.main.zoom;
        this.cameras.main.scrollY = this.dragState.camY - dy / this.cameras.main.zoom;
        clampCamera(this.cameras.main);
      }
    });

    this.input.on('pointerup', (pointer) => {
      if (!this.dragState) {
        return;
      }

      const wasDrag = this.dragState.moved;
      this.dragState = null;

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
    if (hit) {
      this.selectEntity(hit);
      return;
    }

    // Visual feedback for empty battlefield tap (deselection ripple)
    if (!this.selectedEntity || this.commandMode === 'select') {
      this.showDeselectRipple(worldX, worldY);
    }

    if (this.selectedEntity && this.selectedEntity.team === 'player') {
      // If tapping near a gas geyser with a selected worker, assign to gas
      if (this.selectedEntity.type === 'worker' && !this.selectedEntity.autoHarvest) {
        const geyser = this.gasGeysers.find((g) => Phaser.Math.Distance.Between(g.x, g.y, worldX, worldY) <= g.radius + 16 && g.assignedWorkers < g.maxWorkers);
        if (geyser) {
          this.assignWorkerToGas(this.selectedEntity, geyser);
          this.syncSession('Worker assigned to gas geyser.');
          return;
        }
      }

      if (this.commandMode === 'move') {
        this.issueMove(this.selectedEntity, worldX, worldY);
        this.commandMode = 'select';
        this.showTapIndicator(worldX, worldY);
        this.syncSession('Move order issued.');
        return;
      }

      if (this.commandMode === 'attack') {
        this.issueAttackMove(this.selectedEntity, worldX, worldY);
        this.commandMode = 'select';
        this.showTapIndicator(worldX, worldY);
        this.syncSession('Attack move issued.');
        return;
      }
    }

    this.clearSelection();
  }

  selectEntity(entity) {
    this.selectedEntity = entity;
    this.commandMode = 'select';
    this.showSelectionHighlight(entity);
    this.syncSession(`Selected ${entity.label}.`);
    // Audio feedback: selection chirp.
    if (this.audioManager) this.audioManager.select(entity);
  }

  clearSelection() {
    const previousSelection = this.selectedEntity;
    this.selectedEntity = null;
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
      session.setMessage(`Not enough minerals to build ${role === 'techBuilding' ? this.race.techBuildingName : this.race.productionName}.`);
      return;
    }

    // Check gas cost for tech building
    if (def.gasCost !== undefined && this.playerGas < def.gasCost) {
      session.setMessage(`Not enough gas to build ${this.race.techBuildingName}.`);
      return;
    }

    this.playerMinerals -= def.cost;
    if (def.gasCost !== undefined) {
      this.playerGas -= def.gasCost;
    }

    const construction = this.createStructure('player', role, slot.x, slot.y, {
      active: false,
      construction: true,
      buildProgress: 0,
      buildTimeRemaining: def.buildTime,
      roleName: role === 'techBuilding' ? this.race.techBuildingName : this.race.productionName
    });
    construction.finalRole = role;
    construction.finalLabel = role === 'techBuilding' ? this.race.techBuildingName : this.race.productionName;
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

      structure.hpFront.width = (structure.hp / structure.maxHp) * (structure.width + 8);
      structure.hpFront.setPosition(structure.x - (structure.width + 8) / 2, structure.y + structure.height / 2 + 10);
    });
  }

  updateUnits(dt) {
    this.units.forEach((unit) => {
      if (unit.hp <= 0) {
        return;
      }

      unit.cooldown = Math.max(0, unit.cooldown - dt);
      unit._motionState = 'idle';
      unit.sprite.setPosition(unit.x, unit.y);
      unit.hpBack.setPosition(unit.x, unit.y + unit.radius + 8);
      unit.hpFront.setPosition(unit.x - (unit.radius * 2 + 8) / 2, unit.y + unit.radius + 8);
      unit.hpFront.width = (unit.hp / unit.maxHp) * (unit.radius * 2 + 8);
      unit.statusText.setPosition(unit.x, unit.y + unit.radius + 20);

      if (unit.type === 'worker') {
        this.updateWorker(unit, dt);
      } else {
        this.updateCombatUnit(unit, dt);
      }

      this.applyMotionScale(unit, dt);
    });
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
    if (node.amount <= 0) {
      node.labelText.setText('Depleted');
    }
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
    if (this.audioManager) this.audioManager.attack(unit);
    // High-signal attack moment: muzzle flash at attacker
    const attackRace = this.race?.id || 'terran';
    spawnMuzzleFlash(this, unit.x, unit.y, attackRace);
    enemy.hp -= unit.attack;
    unit.cooldown = unit.cooldownTime;
    // Visual feedback: damage flash on the target
    this.showDamageFlash(enemy);
      // Track damage for shield regen delay (Protoss units)
      if (unit.shield > 0 && unit.team === 'player') {
        unit.lastDamageTime = time / 1000;
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

    // Enemy AI: Build production if not exists (already exists at start)
    // Enemy AI: Build gas harvesters
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

    // Assign workers to gas if geysers available and not enough gas workers
    const availableGeysers = this.gasGeysers.filter((g) => g.amount > 0 && g.assignedWorkers < g.maxWorkers);
    if (availableGeysers.length > 0 && gasWorkerCount < availableGeysers.length && mineralWorkerCount > 1) {
      // Move a mineral worker to gas — find the last mineral (non-gas) worker.
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
        // Unassign from minerals (just stop auto-harvest, will find new node)
        mover.harvestType = 'gas';
        mover.order = 'gasHarvest';
        mover.geyserId = geyser.id;
        mover.statusText.setText('Mining Gas');
        geyser.assignedWorkers += 1;
      }
    }

    // Enemy builds tech building if they have minerals and gas, and no tech building yet
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
        construction.statusText.setText('Under construction');
        construction.sprite.setAlpha(0.3);
        construction.ridge.setAlpha(0.18);
        this.enemyTechBuilt = true;
      }
    }

    // Enemy spawns combat units
    // Wave frequency scales with the selected AI difficulty.
    const waveInterval = getEnemyWaveInterval(this.aiDifficulty, this.enemyWave);
    if (this.enemyAttackTimer >= waveInterval && this.enemyMinerals >= this.race.units.enemySoldier.cost && this.enemySupplyUsed < this.enemySupplyCap) {
      this.enemyAttackTimer = 0;

      // Decide what to spawn based on game progress
      const hasTech = this.structures.some((s) => s.team === 'enemy' && s.role === 'techBuilding' && s.type === 'structure');
      let spawnSignature = false;

      // Unlock signature units after tech building is complete and enough time has passed
      if (hasTech && this.enemyWave >= this.aiDifficulty.enemySignatureWave) {
        const sigCost = this.race.units.enemySignature.cost;
        const sigGasCost = this.race.units.enemySignature.gasCost || 0;
        if (this.enemyMinerals >= sigCost && this.enemyGas >= sigGasCost && this.enemyWave % this.aiDifficulty.enemySignatureCadence === 0) {
          // Every other wave after the signature threshold, spawn signature units.
          spawnSignature = true;
        }
      }

      if (spawnSignature) {
        this.spawnEnemyWave(true);
      } else {
        this.spawnEnemyWave(false);
      }
    }

    // Enemy workers harvest
    this.enemyUnits.forEach((unit) => {
      if (unit.hp <= 0) {
        return;
      }

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
          // Gas harvesting
          const geyser = this.gasGeysers.find((g) => g.id === unit.geyserId);
          if (geyser && geyser.amount > 0 && Phaser.Math.Distance.Between(unit.x, unit.y, geyser.x, geyser.y) > 24) {
            this.moveEntityTowards(unit, geyser.x, geyser.y, dt);
          } else if (geyser) {
            const mined = Math.min(this.race.workerGasHarvest * dt, geyser.amount);
            geyser.amount = Math.max(0, geyser.amount - mined);
            unit.cargo += mined;
            // Update geyser visual
            geyser.sprite.setAlpha(Math.max(0.35, 0.45 + geyser.amount / geyser.maxAmount * 0.5));
          }
        } else {
          // Mineral harvesting
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
        const target = this.findNearestPlayerTarget(unit);
        if (target) {
          unit.targetEntity = target;
          const distance = Phaser.Math.Distance.Between(unit.x, unit.y, target.x, target.y);
          if (distance > unit.range) {
            this.moveEntityTowards(unit, target.x, target.y, dt);
          } else if (unit.cooldown <= 0) {
            if (this.audioManager) this.audioManager.attack(unit);
            target.hp -= unit.attack;
            unit.cooldown = unit.cooldownTime;
          }
        } else {
          this.moveEntityTowards(unit, enemyBase.x - 90, enemyBase.y + Phaser.Math.Between(-44, 44), dt);
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

    // Spawn squad with staggered positions
    for (let i = 0; i < squadSize; i += 1) {
      this.enemySupplyUsed += unitDef.supply;
      const spawnY = slot.y + Phaser.Math.Between(-30, 30) + i * 24;
      const unit = this.createUnit('enemy', unitType, slot.x + Phaser.Math.Between(-10, 10), spawnY, {
        mode: 'guard',
        enemyKind: enemyKind,
        isSignature: isSignature
      });
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

    const target = MOTION_SCALE_TARGETS[entity._motionState] ?? MOTION_SCALE_TARGETS.idle;
    entity.motionScale = entity.motionScale ?? 1;
    const blend = Math.min(1, dt * 10);
    entity.motionScale = Phaser.Math.Linear(entity.motionScale, target, blend);
    entity.sprite.setScale(entity.motionScale);
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
  }

  destroyEntity(entity) {
    entity.sprite?.destroy();
    entity.ridge?.destroy();
    entity.labelText?.destroy();
    entity.hpBack?.destroy();
    entity.hpFront?.destroy();
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
      commands.splice(1, 0, 'move', 'build-production', 'build-tech');
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

    // Selection ring - slightly larger than entity radius
    this.selectionHighlight = this.add.circle(entity.x, entity.y, radius + 10, highlightColor, 0.5)
      .setStrokeStyle(2, highlightColor, 0.9)
      .setAlpha(0.8)
      .setDepth(5);

    // Pulsing animation - gentle breathing effect
    this.selectionHighlightTween = this.tweens.add({
      targets: this.selectionHighlight,
      alpha: 0.3,
      scaleX: 1.08,
      scaleY: 1.08,
      duration: FEEDBACK_TIMINGS.selectionPulse,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  clearSelectionHighlight() {
    if (this.selectionHighlight) {
      this.selectionHighlight.destroy();
      this.selectionHighlight = null;
    }
    if (this.selectionHighlightTween) {
      this.selectionHighlightTween.stop();
      this.selectionHighlightTween = null;
    }
  }

  /** Brief flash at tap location - confirms move/attack commands on mobile. */
  showTapIndicator(worldX, worldY) {
    // Clean up previous feedback
    if (this.tapFeedback) {
      this.tapFeedback.destroy();
    }

    // Small crosshair flash - confirms the command was registered
    const size = 14;
    this.tapFeedback = this.add.group();

    // Horizontal line
    const hLine = this.add.rectangle(worldX, worldY, size, 2, 0x60a5fa, 0.9)
      .setOrigin(0.5);
    // Vertical line
    const vLine = this.add.rectangle(worldX, worldY, 2, size, 0x60a5fa, 0.9)
      .setOrigin(0.5);

    this.tapFeedback.add(hLine);
    this.tapFeedback.add(vLine);

    // Brief flash then fade out
    this.tweens.add({
      targets: [hLine, vLine],
      alpha: 0,
      duration: FEEDBACK_TIMINGS.tapFlash,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        this.tapFeedback?.destroy();
        this.tapFeedback = null;
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

  /** Unit takes damage — brief red flash + audio feedback. */
  showDamageFlash(unit) {
    if (!unit || !unit.sprite) return;

    // Brief red tint on the sprite
    if (!unit._damageFlash) {
      unit._damageFlash = this.tweens.add({
        targets: unit.sprite,
        tint: 0xff4444,
        duration: FEEDBACK_TIMINGS.damageFlash,
        yoyo: true,
        repeat: 0,
        ease: 'Linear',
        onComplete: () => {
          unit.sprite.clearTint();
          if (unit._damageFlash) {
            unit._damageFlash = null;
          }
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
    this.inputController?.destroy();
    this.scene.stop('HudScene');
    this.scale.off('resize', this.handleResize, this);
  }
}
