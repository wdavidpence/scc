import Phaser from 'phaser';
import { session, GameStates } from '../game/state/gameSession.js';
import { getRace } from '../game/data/races.js';
import { createInputController } from '../game/input/createInputController.js';

const WORLD_WIDTH = 1680;
const WORLD_HEIGHT = 960;
const TOP_UI_HEIGHT = 70;
const BOTTOM_UI_HEIGHT = 190;
const TAP_DRAG_THRESHOLD = 12;
const CAMERA_SPEED = 560;
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
    this.selectedEntity = null;
    this.commandMode = 'select';
    this.paused = false;
    this.ended = false;
    this.endTapReady = false;
    this.nextId = 1;
    this.units = [];
    this.structures = [];
    this.resourceNodes = [];
    this.constructions = [];
    this.playerBuildSlots = PLAYER_BUILD_SLOTS.map((slot) => ({ ...slot }));
    this.enemyBuildSlots = ENEMY_BUILD_SLOTS.map((slot) => ({ ...slot }));
    this.playerMinerals = this.race.startMinerals;
    this.playerGas = 0;
    this.playerSupplyUsed = this.race.startSupplyUsed;
    this.playerSupplyCap = this.race.startSupplyCap;
    this.enemyMinerals = 320;
    this.enemySupplyUsed = 4;
    this.enemySupplyCap = 10;
    this.enemyIncomeTimer = 0;
    this.enemySpawnTimer = 0;
    this.enemyWave = 0;
    this.enemyAttackTimer = 0;
    this.inputController = createInputController(this);

    this.cameras.main.setBackgroundColor(this.race.backdrop);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setZoom(0.95);
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

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
    this.spawnStartingForces();
    this.createBattleFieldTitle();

    session.startBattle(this.race.id, this.race.name, {
      minerals: this.playerMinerals,
      gas: this.playerGas,
      supplyUsed: this.playerSupplyUsed,
      supplyCap: this.playerSupplyCap,
      enemyMinerals: this.enemyMinerals,
      objective: `Secure the frontier, build ${this.race.productionName}, and destroy the enemy ${this.race.commandCenterName}.`,
      message: `${this.race.name} command uplink online. Tap a unit, structure, or the battlefield to command the army.`,
      log: [`${this.race.name} deployed.`]
    });

    this.scene.launch('HudScene', { battleScene: this });
    this.scene.bringToTop('HudScene');

    this.installPointerControls();
    this.scale.on('resize', this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.syncSession();
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
      this.createResourceNode(spot.x, spot.y, 900 + index * 60);
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

    playerWorkerOffsets.slice(0, this.race.startWorkers).forEach((offset, index) => {
      this.createUnit('player', 'worker', 250 + offset.x, WORLD_HEIGHT / 2 + offset.y, { autoHarvest: true, homeStructure: this.playerCommandCenter, initialDelay: index * 0.15 });
    });

    for (let index = 0; index < this.race.startSoldiers; index += 1) {
      this.createUnit('player', 'soldier', 285 + index * 24, WORLD_HEIGHT / 2 + 56 + index * 16, { mode: 'guard' });
    }

    this.createStructure('player', 'production', 320, WORLD_HEIGHT / 2 - 150, { active: true, construction: false, buildProgress: 1, roleName: this.race.productionName });
    this.playerSupplyCap += this.race.structures.production.supplyBonus;

    this.createUnit('enemy', 'worker', WORLD_WIDTH - 250, WORLD_HEIGHT / 2 - 30, { autoHarvest: true, homeStructure: this.enemyCommandCenter, initialDelay: 0.1 });
    this.createUnit('enemy', 'worker', WORLD_WIDTH - 220, WORLD_HEIGHT / 2 + 34, { autoHarvest: true, homeStructure: this.enemyCommandCenter, initialDelay: 0.3 });
    this.createUnit('enemy', 'soldier', WORLD_WIDTH - 280, WORLD_HEIGHT / 2 + 78, { mode: 'guard', autoAggro: true, enemyKind: 'enemySoldier' });
  }

  createResourceNode(x, y, amount = 1000) {
    const sprite = this.add.circle(x, y, 20, 0x38bdf8, 0.95).setStrokeStyle(2, 0xdbeafe, 1);
    const glow = this.add.circle(x, y, 34, 0x60a5fa, 0.12);
    const label = this.add.text(x, y, 'M', {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: '18px',
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
      radius: 20,
      sprite,
      glow,
      labelText: label
    };

    this.resourceNodes.push(entity);
    return entity;
  }

  createStructure(team, role, x, y, options = {}) {
    const baseDef = role === 'commandCenter' ? this.race.structures.commandCenter : this.race.structures.production;
    const color = team === 'player' ? baseDef.color : 0xf97316;
    const width = baseDef.width;
    const height = baseDef.height;
    const active = options.active ?? true;
    const construction = options.construction ?? false;
    const roleName = options.roleName ?? (role === 'commandCenter' ? this.race.commandCenterName : this.race.productionName);

    const sprite = this.add.rectangle(x, y, width, height, color, construction ? 0.28 : 0.92)
      .setStrokeStyle(2, team === 'player' ? this.race.glow : 0xfde68a, 1);
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
      color,
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
    const def = this.getUnitDef(team, kind, options.enemyKind);
    const sprite = this.add.circle(x, y, def.radius, def.color, 1)
      .setStrokeStyle(2, team === 'player' ? this.race.glow : 0xfde68a, 1);
    const labelText = this.add.text(x, y - def.radius - 13, def.label, {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: 'clamp(10px, 1.9vw, 13px)',
      fontStyle: '700',
      color: '#ffffff',
      align: 'center'
    }).setOrigin(0.5);
    const hpBack = this.add.rectangle(x, y + def.radius + 8, def.radius * 2 + 8, 5, 0x0f172a, 1);
    const hpFront = this.add.rectangle(x - (def.radius * 2 + 8) / 2, y + def.radius + 8, def.radius * 2 + 8, 5, team === 'player' ? 0x22c55e : 0xfb7185, 1)
      .setOrigin(0, 0.5);
    const statusText = this.add.text(x, y + def.radius + 20, options.mode === 'guard' ? 'Guard' : 'Harvest', {
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
      supply: def.supply,
      cargo: 0,
      cargoTarget: this.race.workerHarvest,
      autoHarvest: options.autoHarvest ?? kind === 'worker',
      homeStructure: options.homeStructure ?? this.playerCommandCenter,
      targetX: x,
      targetY: y,
      targetEntity: null,
      order: options.mode ?? (kind === 'worker' ? 'harvest' : 'guard'),
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
      radius: def.radius,
      color: def.color
    };

    if (team === 'player') {
      this.playerUnits.push(entity);
    } else {
      this.enemyUnits.push(entity);
    }

    if (kind === 'worker') {
      entity.order = 'harvest';
    }

    return entity;
  }

  getUnitDef(team, kind, enemyKind) {
    if (team === 'enemy' && kind === 'soldier') {
      return this.race.units.enemySoldier;
    }

    if (kind === 'worker') {
      return this.race.units.worker;
    }

    if (kind === 'soldier') {
      return this.race.units.soldier;
    }

    if (enemyKind && team === 'enemy') {
      return this.race.units[enemyKind] ?? this.race.units.enemySoldier;
    }

    return this.race.units.soldier;
  }

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

    if (this.selectedEntity && this.selectedEntity.team === 'player') {
      if (this.commandMode === 'move') {
        this.issueMove(this.selectedEntity, worldX, worldY);
        this.commandMode = 'select';
        this.syncSession('Move order issued.');
        return;
      }

      if (this.commandMode === 'attack') {
        this.issueAttackMove(this.selectedEntity, worldX, worldY);
        this.commandMode = 'select';
        this.syncSession('Attack move issued.');
        return;
      }
    }

    this.clearSelection();
  }

  selectEntity(entity) {
    this.selectedEntity = entity;
    this.commandMode = 'select';
    this.syncSession(`Selected ${entity.label}.`);
  }

  clearSelection() {
    this.selectedEntity = null;
    this.commandMode = 'select';
    this.syncSession('Selection cleared.');
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

    if (!this.selectedEntity || this.selectedEntity.team !== 'player') {
      this.commandMode = action === 'move' || action === 'attack' ? action : 'select';
      this.syncSession('Select one of your units or structures first.');
      return;
    }

    switch (action) {
      case 'move':
      case 'attack':
        this.commandMode = action;
        this.syncSession(`Command mode: ${action}. Tap the battlefield to issue the order.`);
        break;
      case 'train-worker':
        this.queueUnit(this.playerCommandCenter, 'worker');
        break;
      case 'train-soldier':
        this.queueUnit(this.findPlayerProduction(), 'soldier');
        break;
      case 'build-production':
        this.startConstructionForWorker(this.selectedEntity);
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

  queueUnit(structure, kind) {
    if (!structure || structure.team !== 'player') {
      session.setMessage('Choose a valid production structure first.');
      return;
    }

    if (structure.role === 'commandCenter' && kind !== 'worker') {
      session.setMessage('Command Centers only train workers.');
      return;
    }

    if (structure.role === 'production' && kind !== 'soldier') {
      session.setMessage('Production structures train combat units.');
      return;
    }

    const def = this.getUnitDef('player', kind);
    if (this.playerMinerals < def.cost) {
      session.setMessage('Not enough minerals.');
      return;
    }

    if (this.playerSupplyUsed + def.supply > this.playerSupplyCap) {
      session.setMessage('Supply blocked. Build more production first.');
      return;
    }

    this.playerMinerals -= def.cost;
    structure.queue.push({ kind, progress: def.buildTime, def });
    session.pushLog(`${this.race.name} queued ${def.label}.`);
    session.setMessage(`${def.label} training started.`);
    this.syncSession(`${def.label} queued.`);
  }

  startConstructionForWorker(worker) {
    if (!worker || worker.team !== 'player' || worker.type !== 'worker') {
      session.setMessage('Select a worker to begin construction.');
      return;
    }

    const def = this.race.structures.production;
    if (this.playerMinerals < def.cost) {
      session.setMessage('Not enough minerals to build production.');
      return;
    }

    const slot = this.playerBuildSlots.find((candidate) => !this.constructions.some((construction) => Phaser.Math.Distance.Between(construction.x, construction.y, candidate.x, candidate.y) < 10) && !this.structures.some((structure) => structure.team === 'player' && structure.role === 'production' && Phaser.Math.Distance.Between(structure.x, structure.y, candidate.x, candidate.y) < 12));
    if (!slot) {
      session.setMessage('No build slot available.');
      return;
    }

    this.playerMinerals -= def.cost;
    const construction = this.createStructure('player', 'production', slot.x, slot.y, {
      active: false,
      construction: true,
      buildProgress: 0,
      buildTimeRemaining: def.buildTime,
      roleName: this.race.productionName
    });
    construction.finalRole = 'production';
    construction.finalLabel = this.race.productionName;
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
    session.pushLog(`${this.race.productionName} construction started.`);
    session.setMessage(`Worker assigned to build ${this.race.productionName}.`);
    this.syncSession(`${this.race.productionName} under construction.`);
  }

  issueMove(entity, worldX, worldY) {
    if (entity.type === 'structure' || entity.type === 'construction') {
      session.setMessage('Structures cannot move.');
      return;
    }

    entity.targetX = worldX;
    entity.targetY = worldY;
    entity.order = 'move';
    entity.manual = true;
    entity.targetEntity = null;
    entity.statusText.setText('Moving');
  }

  issueAttackMove(entity, worldX, worldY) {
    if (entity.type === 'structure' || entity.type === 'construction') {
      session.setMessage('Structures cannot attack-move.');
      return;
    }

    entity.targetX = worldX;
    entity.targetY = worldY;
    entity.order = 'attack';
    entity.manual = true;
    entity.targetEntity = null;
    entity.statusText.setText('Attack move');
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
      this.enemyMinerals += this.race.enemyIncomePerSecond * ticks;
    }

    this.enemySpawnTimer += dt;
    this.enemyAttackTimer += dt;

    if (this.enemySpawnTimer >= 7.5) {
      this.enemySpawnTimer = 0;
      this.spawnEnemyWave();
    }

    this.updateConstructions(dt);
    this.updateStructures(dt);
    this.updateUnits(dt);
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
      const progress = 1 - construction.buildTimeRemaining / this.race.structures.production.buildTime;
      construction.ridge.width = (construction.width - 18) * Math.max(0.15, progress);
      construction.statusText.setText(`Building ${construction.buildTimeRemaining.toFixed(1)}s`);

      const worker = this.units.find((unit) => unit.team === 'player' && unit.type === 'worker' && unit.buildTargetId === construction.id);
      if (worker && Phaser.Math.Distance.Between(worker.x, worker.y, construction.x, construction.y) > 22) {
        this.moveEntityTowards(worker, construction.x, construction.y, dt);
      }

      if (worker && Phaser.Math.Distance.Between(worker.x, worker.y, construction.x, construction.y) <= 22) {
        worker.order = 'construct';
        worker.statusText.setText('Constructing');
      }

      if (construction.buildTimeRemaining <= 0) {
        construction.type = 'structure';
        construction.active = true;
        construction.buildProgress = 1;
        construction.statusText.setText('Operational');
        construction.sprite.setAlpha(0.94);
        construction.ridge.setAlpha(0.22);
        if (construction.team === 'player') {
          this.playerSupplyCap += construction.supplyBonus;
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
            enemyKind: structure.team === 'enemy' ? 'enemySoldier' : undefined
          });
          if (structure.team === 'player') {
            this.playerSupplyUsed += item.def.supply;
          } else {
            this.enemySupplyUsed += item.def.supply;
          }
          structure.queue.shift();
          session.pushLog(`${item.def.label} deployed.`);
          session.setMessage(`${item.def.label} deployed.`);
        }
      } else if (structure.type === 'structure') {
        structure.statusText.setText(structure.role === 'commandCenter' ? 'Operational' : 'Idle');
      }

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
      unit.sprite.setPosition(unit.x, unit.y);
      unit.labelText.setPosition(unit.x, unit.y - unit.radius - 13);
      unit.hpBack.setPosition(unit.x, unit.y + unit.radius + 8);
      unit.hpFront.setPosition(unit.x - (unit.radius * 2 + 8) / 2, unit.y + unit.radius + 8);
      unit.hpFront.width = (unit.hp / unit.maxHp) * (unit.radius * 2 + 8);
      unit.statusText.setPosition(unit.x, unit.y + unit.radius + 20);

      if (unit.type === 'worker') {
        this.updateWorker(unit, dt);
      } else {
        this.updateCombatUnit(unit, dt);
      }
    });
  }

  updateWorker(worker, dt) {
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
      worker.order = 'harvest';
    }

    if (worker.manual && worker.order === 'move') {
      this.moveEntityTowards(worker, worker.targetX, worker.targetY, dt);
      if (Phaser.Math.Distance.Between(worker.x, worker.y, worker.targetX, worker.targetY) <= 6) {
        worker.manual = false;
        worker.order = 'harvest';
        worker.statusText.setText('Harvest');
      } else {
        worker.statusText.setText('Moving');
      }
      return;
    }

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
      enemy.hp -= unit.attack;
      unit.cooldown = unit.cooldownTime;
      if (enemy.type === 'structure' || enemy.type === 'construction') {
        enemy.statusText.setText(`${Math.max(0, enemy.hp)} hp`);
      }
    }
  }

  updateEnemyAI(dt) {
    const enemyProduction = this.structures.find((structure) => structure.team === 'enemy' && structure.role === 'production' && structure.type === 'structure');
    const enemyBase = this.enemyCommandCenter;

    if (this.enemyMinerals >= 150 && !enemyProduction) {
      const slot = this.enemyBuildSlots.find((candidate) => !this.constructions.some((construction) => Phaser.Math.Distance.Between(construction.x, construction.y, candidate.x, candidate.y) < 12) && !this.structures.some((structure) => structure.team === 'enemy' && structure.role === 'production' && Phaser.Math.Distance.Between(structure.x, structure.y, candidate.x, candidate.y) < 12));
      if (slot) {
        this.enemyMinerals -= this.race.structures.production.cost;
        const construction = this.createStructure('enemy', 'production', slot.x, slot.y, {
          active: false,
          construction: true,
          buildProgress: 0,
          buildTimeRemaining: this.race.structures.production.buildTime,
          roleName: this.race.productionName
        });
        construction.finalRole = 'production';
        construction.finalLabel = this.race.productionName;
        construction.statusText.setText('Under construction');
        construction.sprite.setAlpha(0.3);
        construction.ridge.setAlpha(0.18);
      }
    }

    if (this.enemyAttackTimer >= 6.5 && this.enemyMinerals >= this.race.units.enemySoldier.cost && this.enemySupplyUsed < this.enemySupplyCap) {
      this.enemyAttackTimer = 0;
      this.spawnEnemyWave();
    }

    this.enemyUnits.forEach((unit) => {
      if (unit.hp <= 0) {
        return;
      }

      if (unit.type === 'worker') {
        if (unit.cargo > 0) {
          this.moveEntityTowards(unit, enemyBase.x - 38, enemyBase.y, dt);
          if (Phaser.Math.Distance.Between(unit.x, unit.y, enemyBase.x - 38, enemyBase.y) <= 24) {
            this.enemyMinerals += unit.cargo;
            unit.cargo = 0;
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
        const target = this.findNearestPlayerTarget(unit);
        if (target) {
          unit.targetEntity = target;
          const distance = Phaser.Math.Distance.Between(unit.x, unit.y, target.x, target.y);
          if (distance > unit.range) {
            this.moveEntityTowards(unit, target.x, target.y, dt);
          } else if (unit.cooldown <= 0) {
            target.hp -= unit.attack;
            unit.cooldown = unit.cooldownTime;
          }
        } else {
          this.moveEntityTowards(unit, enemyBase.x - 90, enemyBase.y + Phaser.Math.Between(-44, 44), dt);
        }
      }
    });
  }

  spawnEnemyWave() {
    const slot = this.enemyBuildSlots[0];
    if (this.enemyMinerals < this.race.units.enemySoldier.cost) {
      return;
    }

    this.enemyMinerals -= this.race.units.enemySoldier.cost;
    this.enemySupplyUsed += this.race.units.enemySoldier.supply;
    const wave = this.createUnit('enemy', 'soldier', slot.x, slot.y + Phaser.Math.Between(-26, 26), { mode: 'guard', enemyKind: 'enemySoldier' });
    wave.order = 'attack';
    wave.targetX = this.playerCommandCenter.x;
    wave.targetY = this.playerCommandCenter.y;
    this.enemyWave += 1;
    session.pushLog(`Enemy wave ${this.enemyWave} detected.`);
    session.setMessage(`Enemy wave ${this.enemyWave} advancing.`);
  }

  findNearestResourceNode(x, y) {
    const available = this.resourceNodes.filter((node) => node.amount > 0);
    if (available.length === 0) {
      return null;
    }

    return available.reduce((best, node) => {
      if (!best) {
        return node;
      }
      const bestDistance = Phaser.Math.Distance.Between(x, y, best.x, best.y);
      const nextDistance = Phaser.Math.Distance.Between(x, y, node.x, node.y);
      return nextDistance < bestDistance ? node : best;
    }, null);
  }

  findNearestEnemy(unit) {
    const enemies = [
      ...this.enemyUnits.filter((entry) => entry.hp > 0),
      ...this.structures.filter((entry) => entry.team === 'enemy' && entry.hp > 0)
    ];

    if (enemies.length === 0) {
      return null;
    }

    return enemies.reduce((best, candidate) => {
      if (!best) {
        return candidate;
      }
      const bestDistance = Phaser.Math.Distance.Between(unit.x, unit.y, best.x, best.y);
      const nextDistance = Phaser.Math.Distance.Between(unit.x, unit.y, candidate.x, candidate.y);
      return nextDistance < bestDistance ? candidate : best;
    }, null);
  }

  findNearestPlayerTarget(unit) {
    const targets = [
      ...this.playerUnits.filter((entry) => entry.hp > 0),
      ...this.structures.filter((entry) => entry.team === 'player' && entry.hp > 0)
    ];

    if (targets.length === 0) {
      return null;
    }

    return targets.reduce((best, candidate) => {
      if (!best) {
        return candidate;
      }
      const bestDistance = Phaser.Math.Distance.Between(unit.x, unit.y, best.x, best.y);
      const nextDistance = Phaser.Math.Distance.Between(unit.x, unit.y, candidate.x, candidate.y);
      return nextDistance < bestDistance ? candidate : best;
    }, null);
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
    deadUnits.forEach((unit) => this.destroyEntity(unit));
    this.units = this.units.filter((unit) => unit.hp > 0);
    this.playerUnits = this.playerUnits.filter((unit) => unit.hp > 0);
    this.enemyUnits = this.enemyUnits.filter((unit) => unit.hp > 0);

    const deadStructures = this.structures.filter((structure) => structure.hp <= 0);
    deadStructures.forEach((structure) => this.destroyEntity(structure));
    this.structures = this.structures.filter((structure) => structure.hp > 0);
    this.constructions = this.constructions.filter((construction) => construction.hp > 0 && construction.type === 'construction');
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
    const playerStructures = this.structures.filter((entry) => entry.team === 'player' && entry.hp > 0).length;
    const enemyStructures = this.structures.filter((entry) => entry.team === 'enemy' && entry.hp > 0).length;
    const playerCombat = this.units.filter((entry) => entry.team === 'player' && entry.type !== 'worker' && entry.hp > 0).length;
    const enemyCombat = this.units.filter((entry) => entry.team === 'enemy' && entry.type !== 'worker' && entry.hp > 0).length;

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
      playerUnits: playerCombat,
      enemyUnits: enemyCombat,
      playerStructures,
      enemyStructures,
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
      return {
        label: entity.roleName,
        kind: 'structure',
        owner: entity.team,
        hp: entity.hp,
        maxHp: entity.maxHp,
        details: `${entity.role === 'commandCenter' ? 'Headquarters' : 'Production'}\n${queueText}`
      };
    }

    return {
      label: entity.label,
      kind: entity.type,
      owner: entity.team,
      hp: entity.hp,
      maxHp: entity.maxHp,
      details: entity.type === 'worker'
        ? `Worker unit. Carrying ${Math.floor(entity.cargo)} minerals. ${entity.manual ? 'Manual order active.' : 'Automatically harvesting.'}`
        : `Combat unit. ${entity.manual ? 'Manual movement active.' : 'Auto-acquiring targets.'}`
    };
  }

  getAvailableCommands(entity) {
    const commands = ['select', 'pause'];

    if (!entity || entity.team !== 'player') {
      return commands;
    }

    if (entity.type === 'worker') {
      commands.splice(1, 0, 'move', 'build-production');
      return commands;
    }

    if (entity.type === 'structure' && entity.role === 'commandCenter') {
      commands.splice(1, 0, 'train-worker');
      return commands;
    }

    if (entity.type === 'structure' && entity.role === 'production') {
      commands.splice(1, 0, 'train-soldier');
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
    this.time.delayedCall(900, () => {
      this.endTapReady = true;
    });
  }

  returnToMenu() {
    this.scene.stop('HudScene');
    session.resetForMenu('Choose a faction and start the mission.');
    this.scene.start('MenuScene');
  }

  handleResize() {
    clampCamera(this.cameras.main);
  }

  updateStatusText() {
    if (this.banner) {
      this.banner.setText(`${this.race.name} advance`);
    }
  }

  shutdown() {
    this.inputController?.destroy();
    this.scene.stop('HudScene');
    this.scale.off('resize', this.handleResize, this);
  }
}
