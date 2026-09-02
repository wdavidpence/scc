// BattleScene — the SCC2 world: terrain, fog of war, creep, selection,
// commands, economy, combat, and the AI commander.
import Phaser from 'phaser';
import { UNITS, BUILDINGS, TECHS, TILE, RACE_INFO, BUILD_TIME_SCALE } from '../data/sc1.js';
import { NavGrid } from '../engine/pathfinding.js';
import { FlowManager, SpatialHash } from '../engine/flowfield.js';
import { Unit, Building, effectiveDamage } from '../engine/entity.js';
import { createAllTextures } from '../engine/art.js';
import { Audio2 } from '../engine/audio2.js';
import { applyUpgradesToPlayer, saveCampaign, MISSIONS } from '../engine/campaign.js';
import { missionChatter, DEBRIEFS_WIN, DEBRIEFS_LOSE } from '../engine/cutscenes.js';

const MAP_W = 96;   // tiles
const MAP_H = 96;
const PXW = MAP_W * TILE;
const PXH = MAP_H * TILE;

export class BattleScene extends Phaser.Scene {
  constructor() { super('Battle'); }

  init(data) {
    this.race = data.race || 'terran';
    this.enemyRace = data.enemyRace || 'zerg';
    this.difficulty = data.difficulty || 'normal';
    this.mission = data.mission || null;
    this.campaign = data.campaign || null;
    this.tutorialMode = !!data.tutorial;
    this.mods = data.mods || (this.mission ? this.mission.mods : null) || {};
    // F5: difficulty profiles — build orders/aggression, not just stat multipliers
    this.aiProfile = data.difficulty === 'hard'
      ? { income: 2.2, armyCap: 34, threshold: 0.8, attackGap: 30, harassAt: 40, rushBuilds: ['spawningPool', 'barracks', 'gateway'], rushAt: 140, workers: 16, flankSplit: 0.55 }
      : data.difficulty === 'easy'
        ? { income: 0.4, armyCap: 8, threshold: 1.5, attackGap: 60, harassAt: 110, rushBuilds: [], rushAt: 1e9, workers: 8, flankSplit: 0.8 }
        : { income: 1.1, armyCap: 18, threshold: 1.15, attackGap: 45, harassAt: 65, rushBuilds: [], rushAt: 1e9, workers: 12, flankSplit: 0.7 };
  }

  create() {
    this.timeScale = 1;
    this.units = [];
    this.buildings = [];
    this.projectiles = [];
    this.minerals = [];
    this.geysers = [];
    this.crates = [];              // SC1 power-up pickups (populated by map setup)
    this.critters = [];           // SC1 roaming critters
    this.beacon = null;           // minimap beacon ping
    this.castMode = null;         // 'maelstrom' | 'cloud' targeting mode
    this.powerSurgeUntil = 0;     // power-up crate buff
    this.players = [
      { team: 0, race: this.race, minerals: 300, gas: 150, supplyUsed: 0, supplyCap: 0, techs: {}, upgrades: { weapons: 0, armor: 0 } },
      { team: 1, race: this.enemyRace, minerals: this.difficulty === 'hard' ? 600 : 400, gas: this.difficulty === 'hard' ? 200 : 150, supplyUsed: 0, supplyCap: 0, techs: {}, upgrades: { weapons: 0, armor: 0 } }
    ];
    // mission bonuses + persistent campaign upgrades (F4/F10)
    if (this.mission && this.mission.bonusMinerals) this.players[0].minerals += this.mission.bonusMinerals;
    if (this.campaign) {
      try { applyUpgradesToPlayer(this.campaign, this.players[0], UNITS); } catch (e) { /* noop */ }
    }
    this.selection = new Set();
    this.controlGroups = {};
    this.selectedBuilding = null;
    this.placing = null; // {buildId, ghost}
    this.gameOver = null;
    this.gameTime = 0;
    this.attackMoveMode = false;
    this.ultMode = null;      // 'nuke' | 'storm' | 'surge' — targeting mode
    this.ultGhost = null;
    this.ultCooldowns = {};
    this.ultimateEnergy = 0;
    this.ultimateMax = 100;
    this.record = { frames: [], min: [], apm: 0 };
    this.cmdCount = 0;
    this._recTimer = 0;
    this._shake = { t: 0, mag: 0, ox: 0, oy: 0 };
    this._shakeCam = { x: 0, y: 0 };
    this.paused = false;          // F8 tactical pause
    this.threats = [];            // F3 incoming-wave pings {x,y,t}
    this._threatTimer = 0;
    this.spiderMines = [];        // SC1 vulture mines
    this.patrolMode = false;      // P two-click patrol
    this._patrolAnchor = null;
    this._scanCd = 0;             // scanner sweep cooldown
    this.perks = {};             // F7 cosmetic meta perks
    this.ambient = null;         // F4 weather
    this.tut = null;             // F10 tutorial state
    // ---- mission objectives (F10) ----
    this.objectives = this.buildObjectives();
    this.mods = this.applyMissionMods();
    this.audio = new Audio2(this);
    this.audio.setRace(this.race);
    try { window.__SCC2.audio2 = this.audio; } catch (e) { /* noop */ }
    // start music after first user gesture (title already had one)
    const startMusicNow = () => this.audio.startMusic({ boss: !!(this.mods && this.mods.boss) });
    this.input.once('pointerdown', startMusicNow);
    this.input.keyboard.once('keydown', startMusicNow);
    this.flows = new FlowManager(null, MAP_W, MAP_H); // wired after nav
    this.spatial = new SpatialHash(28);

    createAllTextures(this);
    this.buildTerrain();
    this.nav = new NavGrid(MAP_W, MAP_H, TILE);
    this.flows.nav = this.nav;
    this.blockTerrain();
    this.createFog();
    this.createCreepLayers();
    this.spawnBase(0, this.race);
    this.spawnBase(1, this.enemyRace);
    this.createInput();
    this.createEvents();
    this.aiState = { buildQueue: [], lastThink: 0, army: 0, nextAttackAt: 90, retaliations: [] };
    if (!this.scene.isActive('Hud')) this.scene.launch('Hud', { race: this.race });
    this.events.emit('hud:ready');
    this.showBriefingCard();
    this.events.emit('hud:objectives', this.objectives);
    this.spawnAmbient();
    this.createLighting();
    // F7: veteran perks from campaign
    if (this.campaign && this.campaign.owned) {
      this.perks = { flag: !!this.campaign.owned.pk_flag, chrome: !!this.campaign.owned.pk_chrome, skins: !!this.campaign.owned.pk_skins };
      for (const u of this.units) if (u.team === 0) this.veteranFlag(u);
    }
    // F10: tutorial mode
    if (this.tutorialMode) { this.players[0].minerals += 1200; this.players[0].gas += 800; this.startTutorial(); }
    // SC-style in-mission radio chatter
    if (!this.tutorialMode && this.mission) {
      this.chatter = missionChatter(this.mission.n, this.enemyRace);
      this._chatterIdx = 0;
    }
  }

  // ---------------- mission objectives & modifiers (F10/F4) ----------------
  buildObjectives() {
    const objs = [{ id: 'kill', text: 'Destroy the enemy base', done: false }];
    if (this.crates && this.crates.length) objs.push({ id: 'crates', text: 'OPTIONAL: recover 3 power-up crates (+300)', done: false });
    if (this.mission && this.mission.mods && this.mission.mods.holdTime) {
      objs.push({ id: 'hold', text: `HOLD THE LINE for ${this.mission.mods.holdTime}s`, done: false });
    }
    if (this.mission && this.mission.mods && this.mission.mods.boss) {
      objs.push({ id: 'boss', text: `Slay the ${this.mission.mods.boss} champion`, done: false });
    }
    return objs;
  }

  applyMissionMods() {
    const mods = { ...(this.mods || {}) };
    if (mods.holdTime) { this._holdUntil = this.mission.mods.holdTime; }
    return mods;
  }

  spawnMissionBoss() {
    const kind = this.enemyRace === 'protoss' ? 'carrier' : this.enemyRace === 'zerg' ? 'ultralisk' : 'battlecruiser';
    const base = this.buildings.find(b => b.team === 1 && b.def.primary);
    if (!base) return;
    const u = this.spawnUnit(1, kind, base.x + 60, base.y + 60, { arriveReady: true });
    if (u) {
      u.maxHp = Math.round(u.maxHp * 2.5); u.hp = u.maxHp;
      u.maxShield = Math.round(u.maxShield * 2.5); u.shield = u.maxShield;
      u.bonusDamage += 10;
      u.isBoss = true;
      u.sprite.setScale(1.5);
      this.events.emit('hud:alert', 'ENEMY CHAMPION DEPLOYED');
      this.audio?.ultimateBark();
      this.audio?.bossTheme(true);
    }
  }

  showBriefingCard() {
    if (!this.mission) return;
    const cam = this.cameras.main;
    const W = this.scale.width, H = this.scale.height;
    const cont = this.add.container(W / 2, H / 2).setDepth(900).setScrollFactor(0).setAlpha(0);
    const bg = this.add.rectangle(0, 0, Math.min(560, W - 40), 150, 0x050a14, 0.92).setStrokeStyle(2, 0x4ea1ff);
    const num = this.add.text(0, -46, `MISSION ${this.mission.n}`, { fontFamily: 'Menlo, monospace', fontSize: '14px', color: '#ffd23f' }).setOrigin(0.5);
    const ttl = this.add.text(0, -16, this.mission.name, { fontFamily: 'Menlo, monospace', fontSize: '34px', color: '#e8f1ff', fontStyle: 'bold' }).setOrigin(0.5);
    const brf = this.add.text(0, 24, this.mission.brief, { fontFamily: 'Menlo, monospace', fontSize: '13px', color: '#9fb3d8', align: 'center', wordWrap: { width: Math.min(520, W - 80) } }).setOrigin(0.5);
    const obj = this.add.text(0, 56, (this.mods.holdTime ? `HOLD ${this.mods.holdTime}s` : this.mods.boss ? 'HUNT THE CHAMPION' : 'DESTROY THE ENEMY BASE') + '   ·   G = ULTIMATE', { fontFamily: 'Menlo, monospace', fontSize: '11px', color: '#6ee7a0' }).setOrigin(0.5);
    cont.add([bg, num, ttl, brf, obj]);
    this.tweens.add({ targets: cont, alpha: 1, duration: 500, onComplete: () => {
      this.tweens.add({ targets: cont, alpha: 0, delay: 2600, duration: 700, onComplete: () => cont.destroy() });
    } });
    if (this.mods.boss) this.time.delayedCall(1500, () => this.spawnMissionBoss());
  }

  // ---------------- tactical pause (F8) ----------------
  togglePause() {
    if (this.gameOver) return;
    this.paused = !this.paused;
    this.audio?.orderPing();
    this.events.emit('hud:pause', this.paused);
  }

  // ---------------- threat pings (F3) ----------------
  updateThreats(dt) {
    this._threatTimer -= dt;
    if (this._threatTimer > 0) return;
    this._threatTimer = 4;
    const cam = this.cameras.main;
    const vw = cam.worldView;
    const base = this.buildings.find(b => b.team === 0 && b.def.primary);
    // groups: enemy clusters of 3+ (crude grid cluster)
    const grid = {};
    for (const u of this.units) {
      if (u.dead || u.team === 1 && !this.isVisible(u.x, u.y)) continue;
      if (u.team !== 1 || u.def.worker) continue;
      const gx = Math.round(u.x / 160), gy = Math.round(u.y / 160);
      (grid[gx + ':' + gy] = grid[gx + ':' + gy] || []).push(u);
    }
    for (const k in grid) {
      const g = grid[k];
      if (g.length < 3) continue;
      const cx = g[0].x, cy = g[0].y;
      if (cx > vw.x && cx < vw.x + vw.width && cy > vw.y && cy < vw.y + vw.height) continue; // on screen already
      if (base && Math.hypot(cx - base.x, cy - base.y) > TILE * 40) continue; // too far to threaten
      this.threats.push({ x: cx, y: cy, t: 5 });
      this.audio?.underAttackBark();
      this.events.emit('hud:alert', 'INCOMING — ' + g.length + ' HOSTILES');
      break;
    }
    this.threats = this.threats.filter(t => (t.t -= 4) > 0);
  }

  // ---------------- ambient weather + map life (F4) ----------------
  spawnAmbient() {
    const layer = this.add.container(0, 0).setDepth(8).setScrollFactor(0);
    this.ambientLayer = layer;
    this._ambient = [];
    const cols = this.race === 'zerg' ? [0xff9c7c, 0xd8785c] : this.race === 'protoss' ? [0xbfe0ff, 0x8ab4ff] : [0xffd8a0, 0xc8b890];
    for (let i = 0; i < 26; i++) {
      const p = this.add.circle(Math.random() * this.scale.width, Math.random() * this.scale.height, 1 + Math.random() * 1.5, cols[i % 2], 0.35 + Math.random() * 0.3);
      layer.add(p);
      this._ambient.push({ p, vx: 8 + Math.random() * 14, vy: 14 + Math.random() * 22 });
    }
    // geyser gas puffs (world space)
    this._geyserTimer = 0;
    // critters: little scuttling dots far from bases
    this._critters = [];
    for (let i = 0; i < 4; i++) {
      const c = this.add.circle(300 + Math.random() * 4200, 300 + Math.random() * 4200, 2.5, 0x9fffff, 0.5).setDepth(7);
      this._critters.push({ c, dir: Math.random() * Math.PI * 2, timer: 0 });
    }
  }

  // ---------------- lighting engine (F#7): point lights + day/night ----------------
  createLighting() {
    this.lightLayer = this.add.container(0, 0).setDepth(46); // above units(30/40), below fx(50+)
    this.tintRect = this.add.rectangle(PXW / 2, PXH / 2, PXW + 400, PXH + 400, 0x0a1230, 0).setDepth(47).setBlendMode(Phaser.BlendModes.MULTIPLY);
    this._lights = [];           // {img, base, pulse, phase}
    this._flashPool = [];
    // geyser cyan pulses
    for (const g of this.geysers) {
      const glow = this.add.image(g.x, g.y - 4, 'glow-soft').setTint(0x4affc8).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.25).setScale(0.9);
      this.lightLayer.add(glow);
      this._lights.push({ img: glow, base: 0.25, pulse: 0.12, phase: Math.random() * 6.28, sp: 1.4 });
    }
    // mineral crystal shimmer
    if (this.minerals) for (const m of this.minerals) {
      const glow = this.add.image(m.x, m.y, 'glow').setTint(0x69a6ff).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.12).setScale(0.7);
      this.lightLayer.add(glow);
      this._lights.push({ img: glow, base: 0.12, pulse: 0.05, phase: Math.random() * 6.28, sp: 2.2 });
    }
    this._dayT = 0.3; // mission starts mid-morning; full cycle ~4 min
  }

  // building windows: team-colored soft glows once built
  addBuildingLights(b) {
    if (!this.lightLayer || !b || b.dead) return;
    const col = b.team === 0 ? 0x4ea1ff : b.team === 1 ? 0xff7b2e : 0xff4fa3;
    const n = b.def.size === 'large' || (b.def.tiles && b.def.tiles >= 8) ? 3 : b.def.size === 'medium' ? 2 : 1;
    b._bglows = [];
    for (let i = 0; i < n; i++) {
      const dx = (Math.random() - 0.5) * 30, dy = (Math.random() - 0.5) * 20;
      const g = this.add.image(b.x + dx, b.y + dy, 'glow').setTint(col).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setScale(0.6);
      this.lightLayer.add(g);
      b._bglows.push(g);
    }
  }

  // transient point light (muzzle flash, explosion)
  flash(x, y, col = 0xffd27a, size = 1.4, dur = 120) {
    if (!this.lightLayer || !this.camNear(x, y)) return;
    let g = this._flashPool.find(f => !f.active);
    if (!g) {
      g = this.add.image(0, 0, 'glow'); this.lightLayer.add(g);
      this._flashPool.push(g);
      if (this._flashPool.length > 24) { const old = this._flashPool.shift(); old.destroy(); }
    }
    g.active = true;
    g.setPosition(x, y).setTint(col).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.9).setScale(size);
    this.tweens.add({ targets: g, alpha: 0, duration: dur, onComplete: () => { g.active = false; } });
  }

  // persistent ground fire (nuke fallout / building fires)
  spawnPersistentFire(x, y, life = 6000) {
    if (!this.camNear(x, y)) return;
    const flame = this.add.image(x, y, 'glow').setTint(0xff8c3c).setBlendMode(Phaser.BlendModes.ADD).setDepth(45).setScale(0.7).setAlpha(0.8);
    this.tweens.add({ targets: flame, scale: { from: 0.5, to: 1 }, alpha: 0.45, duration: 350, yoyo: true, repeat: Math.floor(life / 700), onComplete: () => flame.destroy() });
    const embers = this.time.addEvent({ delay: 400, repeat: Math.floor(life / 400), callback: () => {
      if (!flame.active) { embers.remove(); return; }
      const e = this.add.circle(x + Math.random() * 10 - 5, y, 1.5, 0xffb060, 0.9).setDepth(46);
      this.tweens.add({ targets: e, y: y - 30 - Math.random() * 25, x: e.x + Math.random() * 16 - 8, alpha: 0, duration: 900, onComplete: () => e.destroy() });
    } });
  }

  updateLighting(dt) {
    if (!this.lightLayer) return;
    // psi-storm screen warp: rolling camera micro-rotation while active
    if (this._stormWarp && this._stormWarp.t > 0) {
      this._stormWarp.t -= dt;
      const c = this.cameras.main;
      c.angle = Math.sin(this.time.now / 90) * 0.7;
      if (this._stormWarp.t <= 0) { c.angle = 0; this._stormWarp = null; }
    }
    const t = this.time.now / 1000;
    for (const l of this._lights) l.img.setAlpha(l.base + Math.sin(t * l.sp + l.phase) * l.pulse);
    // day/night ambience cycle
    this._dayT = (this._dayT + dt / 240) % 1;
    const d = this._dayT;
    // curve: day at 0-0.45, dusk to night at 0.5-0.75, dawn back
    let night;
    if (d < 0.4) night = 0;
    else if (d < 0.55) night = (d - 0.4) / 0.15;
    else if (d < 0.85) night = 1;
    else night = 1 - (d - 0.85) / 0.15;
    const nightAlpha = night * 0.32;
    this.tintRect.setAlpha(nightAlpha);
    const dusk = (d >= 0.35 && d < 0.6) ? 1 : 0;
    this.tintRect.fillColor = dusk && nightAlpha > 0 ? 0x2a1a40 : 0x0a1230;
    // building window glows fade in at night
    for (const b of this.buildings) {
      if (!b._bglows) continue;
      const want = b.built && !b.dead ? 0.14 + night * 0.4 : 0;
      for (const g of b._bglows) {
        g.alpha += (want - g.alpha) * Math.min(1, dt * 2);
        g.x += (b.x - g.x) * Math.min(1, dt); // follow if moved
      }
    }
  }

  updateAmbient(dt) {
    if (!this._ambient) return;
    const W = this.scale.width, H = this.scale.height;
    for (const a of this._ambient) {
      a.p.x += a.vx * dt; a.p.y += a.vy * dt;
      if (a.p.y > H + 4) { a.p.y = -4; a.p.x = Math.random() * W; }
      if (a.p.x > W + 4) a.p.x = -4;
    }
    this._geyserTimer -= dt;
    if (this._geyserTimer <= 0) {
      this._geyserTimer = 0.9 + Math.random() * 1.2;
      const ge = this.geysers[Math.floor(Math.random() * this.geysers.length)];
      if (ge && this.camNear(ge.x, ge.y)) {
        const puff = this.add.circle(ge.x + (Math.random() * 10 - 5), ge.y - 6, 3, 0x7ee0c0, 0.5).setDepth(21);
        this.tweens.add({ targets: puff, y: ge.y - 34, alpha: 0, scale: 2.2, duration: 1600, onComplete: () => puff.destroy() });
      }
    }
    for (const cr of this._critters) {
      cr.timer -= dt;
      if (cr.timer <= 0) { cr.timer = 2 + Math.random() * 4; cr.dir = Math.random() * Math.PI * 2; }
      cr.c.x += Math.cos(cr.dir) * 26 * dt; cr.c.y += Math.sin(cr.dir) * 26 * dt;
    }
  }

  // ---------------- battle stances (F6) ----------------
  setStance(stance) {
    if (!this.selection.size) return;
    for (const u of this.selection) { if (!u.def.worker) u.stance = stance; }
    this.audio?.orderPing();
    this.events.emit('hud:alert', 'STANCE: ' + stance.toUpperCase());
  }

  // ---------------- combat aura for perks (F7) ----------------
  veteranFlag(u) {
    if (!(this.perks && this.perks.flag)) return;
    const f = this.add.triangle(0, -u.radius - 10, 0, 0, 10, 0, 5, 8, 0xffd23f, 0.9).setDepth(31);
    u.container.add(f);
    u._flag = f;
    this.tweens.add({ targets: f, angle: { from: -6, to: 6 }, duration: 500, yoyo: true, repeat: -1 });
  }

  // ---------------- tutorial (F10) ----------------
  startTutorial() {
    const steps = [
      { text: 'LEFT-CLICK a WORKER to select it', check: () => this.selection.size >= 1 && [...this.selection].some(u => u.def.worker) },
      { text: 'RIGHT-CLICK a MINERAL to harvest', check: () => [...this.selection].some(u => u.order?.type === 'harvest' || u.harvestTarget) },
      { text: 'Open the BUILD menu (B) and place a BARRACKS near your base', check: () => this.buildings.some(b => b.team === 0 && b.buildId === 'barracks') },
      { text: 'Select the BARRACKS and train a MARINE', check: () => this.units.some(u => u.team === 0 && (u.kind === 'marine' || u.kind === 'firebat')) },
      { text: 'Build a BUNKER (B menu) — your infantry fortress', check: () => this.buildings.some(b => b.team === 0 && b.buildId === 'bunker') },
      { text: 'Select Marines and RIGHT-CLICK the BUNKER to garrison them — they fire from inside, invisible and healed', check: () => this.buildings.some(b => b.team === 0 && b.buildId === 'bunker' && b.garrison?.length) },
      { text: 'Select your BUNKER and press U to unload your marines', check: () => this.units.some(u => u.team === 0 && u.kind === 'marine' && !u.loaded && !u.dead && u.state !== 'training') },
      { text: 'Build an ACADEMY, research COMBAT MEDICS, train a MEDIC — idle medics auto-heal nearby troops', check: () => this.units.some(u => u.team === 0 && u.kind === 'medic') },
      { text: 'STARGATE + dropship incoming! Build a STARPORT and train a DROPSHIP to airlift troops over terrain', check: () => this.units.some(u => u.team === 0 && u.kind === 'dropship') },
      { text: 'Right-click Marines to LOAD the dropship, click it + press U over enemy ground to DROP them behind lines!', check: () => (this.units.find(u => u.team === 0 && u.kind === 'dropship')?.carry?.length || 0) > 0 || this._droppedOnce },
      { text: 'Select your Marine and right-click an enemy to attack!', check: () => !this.gameOver && this.units.some(u => u.team === 0 && u.target && !u.target.dead) }
    ];
    this.tut = { steps, i: 0, text: this.add.text(0, 0, '', { fontFamily: 'Menlo, monospace', fontSize: '15px', color: '#ffd23f', backgroundColor: '#050a14d0', padding: { x: 10, y: 6 } }).setDepth(950).setScrollFactor(0).setOrigin(0.5, 1), marker: null };
    this.tut.text.setPosition(this.scale.width / 2, this.scale.height - 150);
    this.tut.text.setText('TUTORIAL — ' + steps[0].text);
    this._tutMarker = this.add.circle(this.scale.width / 2, this.scale.height / 2, 26, 0xffd23f, 0.12).setStrokeStyle(2, 0xffd23f, 0.9).setDepth(940).setScrollFactor(0);
    this.tweens.add({ targets: this._tutMarker, scale: 1.35, alpha: 0.4, duration: 600, yoyo: true, repeat: -1 });
    this.events.on('tutorial:pos', (x, y) => { const c = this.cameras.main; this._tutMarker.setPosition((x - c.worldView.x) * c.zoom, (y - c.worldView.y) * c.zoom); });
    // point at first worker
    const w = this.units.find(u => u.team === 0 && u.def.worker);
    if (w) { this.cameras.main.centerOn(w.x, w.y); this.events.emit('tutorial:pos', w.x, w.y); }
  }

  updateTutorial() {
    if (!this.tut || this.gameOver) return;
    const s = this.tut.steps[this.tut.i];
    if (s && s.check()) {
      this.audio?.objective();
      this.tut.i++;
      if (this.tut.i >= this.tut.steps.length) {
        this.tut.text.setText('TUTORIAL COMPLETE — good luck, Commander.');
        this.tweens.add({ targets: [this.tut.text, this._tutMarker], alpha: 0, delay: 2200, duration: 600, onComplete: () => { this.tut.text.destroy(); this._tutMarker.destroy(); this.tut = null; } });
        return;
      }
      this.tut.text.setText('TUTORIAL — ' + this.tut.steps[this.tut.i].text);
      // move marker to context of next step
      const i = this.tut.i;
      const bunker = this.buildings.find(x => x.team === 0 && x.buildId === 'bunker');
      const starport = this.buildings.find(x => x.team === 0 && x.buildId === 'starport');
      const academy = this.buildings.find(x => x.team === 0 && x.buildId === 'academy');
      const dropship = this.units.find(x => x.team === 0 && x.kind === 'dropship');
      const medic = this.units.find(x => x.team === 0 && x.kind === 'medic');
      const b = this.buildings.find(x => x.team === 0 && x.buildId === 'barracks' && !x.built) || this.buildings.find(x => x.team === 0 && x.buildId === 'barracks');
      const u = this.units.find(x => x.team === 0 && (x.kind === 'marine' || x.kind === 'firebat'));
      const foe = this.units.find(x => x.team === 1 && !x.dead);
      const tgt = (i >= 8 && dropship) ? dropship : (i >= 7 && medic) ? medic : (i >= 4 && bunker) ? bunker : (i >= 4 && starport) ? starport : (i >= 4 && academy) ? academy : b || u || foe;
      if (tgt) { this.cameras.main.centerOn(tgt.x, tgt.y); this.events.emit('tutorial:pos', tgt.x, tgt.y); }
    }
    // keep marker glued to current hint target
    const w = this.units.find(x => x.team === 0 && x.def.worker);
    if (this.tut.i === 0 && w) this.events.emit('tutorial:pos', w.x, w.y);
  }

  // ---------------- ultimate abilities (F7) ----------------
  ultKind() { return this.race === 'terran' ? 'nuke' : this.race === 'protoss' ? 'storm' : 'surge'; }
  ultReady() { return this.ultimateEnergy >= this.ultimateMax && !this.ultMode && !this.gameOver; }

  armUltimate() {
    if (!this.ultReady()) {
      this.events.emit('hud:alert', `ULTIMATE CHARGING ${Math.floor(this.ultimateEnergy)}%`);
      this.audio?.error();
      return;
    }
    this.ultMode = this.ultKind();
    this.input.setDefaultCursor('crosshair');
    this.ultGhost = this.add.circle(0, 0, this.ultMode === 'nuke' ? 110 : 90, 0xff5c5c, 0.15).setStrokeStyle(2, 0xff9c3c, 0.9).setDepth(505).setScrollFactor(0);
    this.events.emit('hud:alert', this.ultMode === 'nuke' ? 'SELECT NUKE TARGET' : this.ultMode === 'storm' ? 'SELECT STORM TARGET' : 'SELECT SURGE TARGET');
  }

  cancelUltimate() {
    this.ultMode = null;
    if (this.ultGhost) { this.ultGhost.destroy(); this.ultGhost = null; }
    this.input.setDefaultCursor('default');
  }

  castUltimate(wx, wy) {
    const kind = this.ultMode;
    this.ultMode = null;
    if (this.ultGhost) { this.ultGhost.destroy(); this.ultGhost = null; }
    this.input.setDefaultCursor('default');
    this.ultimateEnergy = 0;
    this.audio?.ultimateBark();
    if (kind === 'nuke') {
      this.audio?.nukeLaunch();
      this.events.emit('hud:alert', 'NUCLEAR STRIKE INBOUND — 3s');
      // incoming re-entry streak: hot core + ablation sparks + contrail
      const trail = this.add.graphics().setDepth(505);
      const streak = this.add.rectangle(wx, wy - 500, 5, 500, 0xffd27a, 0.5).setDepth(506);
      const core = this.add.image(wx, wy - 500, 'glow').setTint(0xfff0c0).setBlendMode(Phaser.BlendModes.ADD).setDepth(507).setScale(1.2);
      this.tweens.add({ targets: [streak, core], y: streak.y + 500, duration: 2800, ease: 'Cubic.easeIn' });
      this.tweens.add({ targets: streak, alpha: 0.1, duration: 2800 });
      const ablate = this.time.addEvent({ delay: 90, repeat: 30, callback: () => {
        const sx = wx + (Math.random() * 24 - 12), sy = core.y - 20 - Math.random() * 60;
        const s = this.add.circle(sx, sy, 1.5 + Math.random() * 2, Math.random() < 0.5 ? 0xffd27a : 0xff8c4a, 0.9).setDepth(507);
        this.tweens.add({ targets: s, y: s.y + 30, alpha: 0, duration: 400, onComplete: () => s.destroy() });
      } });
      // growing target glow so the player can see the death zone
      const tgt = this.add.circle(wx, wy, 60, 0xff4020, 0).setStrokeStyle(3, 0xff6030, 0.8).setDepth(48);
      this.tweens.add({ targets: tgt, scale: 2.1, alpha: 0.9, duration: 2800, ease: 'Sine.easeIn' });
      this.time.delayedCall(2900, () => {
        streak.destroy(); core.destroy(); tgt.destroy(); if (ablate) ablate.remove(); trail.destroy();
        this.audio?.nukeImpact();
        this.shake(18, 0.9);
        // WHITE FLASH across whole screen
        const flash = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0xffffff, 0.95).setDepth(900).setScrollFactor(0);
        this.tweens.add({ targets: flash, alpha: 0, duration: 700, onComplete: () => flash.destroy() });
        const r = 130;
        // triple shockwave rings
        for (let k = 0; k < 3; k++) {
          const ring = this.add.circle(wx, wy, r * 0.6, 0x000000, 0).setStrokeStyle(6 - k, [0xfff4d0, 0xff9c3c, 0xff5c2e][k], 0.9).setDepth(500 + k);
          this.tweens.add({ targets: ring, scale: 2 + k * 0.9, alpha: 0, duration: 900 + k * 250, delay: k * 90, onComplete: () => ring.destroy() });
        }
        const boom = this.add.image(wx, wy, 'glow-soft').setTint(0xfff0c0).setBlendMode(Phaser.BlendModes.ADD).setDepth(501).setScale(3.4);
        this.tweens.add({ targets: boom, scale: 1.2, alpha: 0, duration: 800, onComplete: () => boom.destroy() });
        // MUSHROOM: rising stem + billowing cap puffs
        const stem = this.add.rectangle(wx, wy - 50, 26, 120, 0xd8c8a8, 0.55).setDepth(499);
        this.tweens.add({ targets: stem, height: 220, y: wy - 110, alpha: 0, duration: 1400 });
        for (let k = 0; k < 7; k++) {
          const puff = this.add.circle(wx + (Math.random() * 90 - 45), wy - 150 - Math.random() * 50, 16 + Math.random() * 18, k % 2 ? 0xe8d8b8 : 0xc8a888, 0.5).setDepth(498);
          this.tweens.add({ targets: puff, scale: 1.8 + Math.random(), y: puff.y - 60 - Math.random() * 40, alpha: 0, duration: 1800 + Math.random() * 800, onComplete: () => puff.destroy() });
        }
        // ring of fallout fire
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2;
          const fx = wx + Math.cos(a) * (r * 0.8), fy = wy + Math.sin(a) * (r * 0.8);
          this.time.delayedCall(100 + k * 60, () => this.spawnPersistentFire(fx, fy));
        }
        this.add.image(wx, wy, 'scorch').setDepth(6).setAlpha(0.85).setScale(4.5);
        this.flash(wx, wy, 0xffffff, 5, 500);
        for (const u of this.units) { if (!u.dead && Math.hypot(u.x - wx, u.y - wy) <= r + u.radius) u.takeDamage(400); }
        for (const b of this.buildings) { if (!b.dead && b.team !== 0 && Math.hypot(b.x - wx, b.y - wy) <= r + 24) b.takeDamage(350); }
      });
    } else if (kind === 'storm') {
      this.audio?.psiCast();
      const r = 95;
      // swirling vortex base
      const vortex = this.add.circle(wx, wy, r, 0x6020c0, 0.22).setDepth(49);
      this.tweens.add({ targets: vortex, scale: 1.15, alpha: 0, angle: 180, duration: 4600, onComplete: () => vortex.destroy() });
      const storm = this.add.circle(wx, wy, r, 0xc060ff, 0).setStrokeStyle(2, 0xe0a0ff, 0.8).setDepth(49);
      this.tweens.add({ targets: storm, alpha: 0, duration: 4200, onComplete: () => storm.destroy() });
      // screen distortion: rolling camera micro-shake for the duration
      this._stormWarp = { t: 4.6 };
      const bolt = (x1, y1, x2, y2, wid, col) => {
        const g = this.add.graphics().setDepth(50);
        g.lineStyle(wid, col, 0.95);
        g.beginPath(); g.moveTo(x1, y1);
        const segs = 5;
        for (let s = 1; s <= segs; s++) {
          const tt = s / segs;
          g.lineTo(x1 + (x2 - x1) * tt + (s < segs ? Math.random() * 22 - 11 : 0), y1 + (y2 - y1) * tt + (s < segs ? Math.random() * 10 - 5 : 0));
        }
        g.strokePath();
        this.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() });
        return g;
      };
      let ticks = 0;
      const iv = this.time.addEvent({ delay: 450, repeat: 9, callback: () => {
        ticks++;
        this.audio?.zap();
        // 3 lightning TENTACLES: ground strike with upward branching
        for (let i = 0; i < 3; i++) {
          const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * r;
          const bx = wx + Math.cos(a) * rr, by = wy + Math.sin(a) * rr;
          bolt(bx, by - 130 - Math.random() * 60, bx, by, 3, 0xe0a0ff);
          bolt(bx - 10, by - 60, bx + Math.random() * 40 - 20, by - 8, 2, 0xc060ff);
          bolt(bx + 8, by - 90, bx + Math.random() * 50 - 25, by - 20, 1.5, 0xffffff);
          const impact = this.add.image(bx, by, 'glow').setTint(0xc060ff).setBlendMode(Phaser.BlendModes.ADD).setDepth(51).setScale(1.1);
          this.tweens.add({ targets: impact, scale: 0.2, alpha: 0, duration: 260, onComplete: () => impact.destroy() });
        }
        this.flash(wx, wy, 0xb060ff, 2.5, 200);
        for (const u of this.units) { if (!u.dead && u.team !== 0 && Math.hypot(u.x - wx, u.y - wy) <= r) u.takeDamage(22); }
        for (const b of this.buildings) { if (!b.dead && b.team !== 0 && Math.hypot(b.x - wx, b.y - wy) <= r + 16) b.takeDamage(14); }
      } });
      this.time.delayedCall(4600, () => iv.remove());
      this.events.emit('hud:alert', 'PSIONIC STORM');
    } else if (kind === 'surge') {
      // zerg: brood surge — spawn extra zerglings at target + speed/attack buff to nearby swarm
      const pool = this.units.filter(u => !u.dead && u.team === 0 && !u.def.worker);
      for (const u of pool) { if (Math.hypot(u.x - wx, u.y - wy) < 320) { u.bonusDamage += 4; u.speed *= 1.25; this.tweens.add({ targets: u.sprite, alpha: 0.55, duration: 240, yoyo: true }); this.time.delayedCall(12000, () => { if (!u.dead) { u.bonusDamage -= 4; u.speed /= 1.25; } }); } }
      // pulsing brood sacs erupt at the target, each hatching a zergling
      for (let i = 0; i < 8; i++) {
        const sx = wx + Math.random() * 90 - 45, sy = wy + Math.random() * 90 - 45;
        const sac = this.add.circle(sx, sy, 6, 0x8a3a22, 0.95).setStrokeStyle(2, 0xff7b2e, 0.8).setDepth(48);
        this.tweens.add({ targets: sac, scale: 1.6, duration: 300 + i * 90, yoyo: false });
        this.tweens.add({ targets: sac, scale: 2.6, alpha: 0, duration: 220, delay: 320 + i * 90, onComplete: () => sac.destroy() });
        this.time.delayedCall(340 + i * 90, () => {
          const burst = this.add.image(sx, sy, 'glow').setTint(0xff7b2e).setBlendMode(Phaser.BlendModes.ADD).setDepth(51).setScale(1.3);
          this.tweens.add({ targets: burst, scale: 0.3, alpha: 0, duration: 300, onComplete: () => burst.destroy() });
          const u = this.spawnUnit(0, 'zergling', sx, sy, { arriveReady: true }); if (u) u.issueMove(wx + Math.random() * 60 - 30, wy + Math.random() * 60 - 30, true);
        });
      }
      // organic tendrils spreading from center
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + Math.random() * 0.4;
        const tnd = this.add.graphics().setDepth(48);
        tnd.lineStyle(3, 0xa04a28, 0.8);
        tnd.lineBetween(wx, wy, wx + Math.cos(a) * 20, wy + Math.sin(a) * 20);
        tnd.strokePath();
        this.tweens.add({ targets: tnd, alpha: 0, scaleX: 5, scaleY: 5, angle: Math.random() * 30 - 15, duration: 900, onComplete: () => tnd.destroy() });
      }
      const pulse = this.add.circle(wx, wy, 40, 0xff7b2e, 0.4).setDepth(49);
      this.tweens.add({ targets: pulse, scale: 8, alpha: 0, duration: 800, onComplete: () => pulse.destroy() });
      this.flash(wx, wy, 0xff7b2e, 3, 400);
      this.events.emit('hud:alert', 'BROOD SURGE');
    }
    this.cmdCount += 1;
  }

  // ---------------- camera shake (F6/F1) ----------------
  shake(mag, dur) {
    this._shake.mag = Math.max(this._shake.mag, mag);
    this._shake.t = Math.max(this._shake.t, dur);
  }

  camNear(x, y) {
    const vw = this.cameras.main.worldView;
    return x > vw.x - 60 && x < vw.x + vw.width + 60 && y > vw.y - 60 && y < vw.y + vw.height + 60;
  }

  // ---------------- terrain ----------------
  buildTerrain() {
    // batch ground into one big texture
    const gc = document.createElement('canvas');
    gc.width = PXW; gc.height = PXH;
    const gx = gc.getContext('2d');
    const rnd = this.rng();
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        const v = (Math.sin(tx * 12.9898 + ty * 78.233) * 43758.5453) % 1;
        const pick = Math.abs(v);
        const cols = pick < 0.25 ? ['#1d2b1f', '#233524', '#2b4030'] : pick < 0.5 ? ['#202d1e', '#283625', '#31422e'] : pick < 0.75 ? ['#252a1c', '#2d3222', '#39412c'] : ['#1c2820', '#22302a', '#2c3e35'];
        gx.fillStyle = cols[0]; gx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
        for (let i = 0; i < 5; i++) {
          gx.fillStyle = rnd() < 0.5 ? cols[1] : cols[2];
          gx.fillRect(tx * TILE + ((rnd() * TILE) | 0), ty * TILE + ((rnd() * TILE) | 0), 2 + ((rnd() * 3) | 0), 1 + ((rnd() * 2) | 0));
        }
      }
    }
    if (this.textures.exists('terrain')) this.textures.remove('terrain');
    this.textures.addCanvas('terrain', gc);
    this.add.image(PXW / 2, PXH / 2, 'terrain').setOrigin(0.5).setDepth(0);
    // rock clusters / chokepoints
    this.rockClusters = [];
    const placeCluster = (cx, cy, size) => {
      const kept = [];
      for (let i = 0; i < size; i++) {
        const tx = cx + ((rnd() * 6) | 0) - 3;
        const ty = cy + ((rnd() * 6) | 0) - 3;
        if (tx < 1 || ty < 1 || tx >= MAP_W - 1 || ty >= MAP_H - 1) continue;
        kept.push({ tx, ty });
      }
      for (const r of kept) {
        const img = this.add.image(r.tx * TILE + 8, r.ty * TILE + 8, rnd() < 0.5 ? 'rock' : 'rock2');
        img.setDepth(25);
      }
      this.rockClusters.push(kept);
      return kept;
    };
    // borders
    for (let t = 0; t < MAP_W; t++) {
      for (const ty of [0, MAP_H - 1]) { this.add.image(t * TILE + 8, ty * TILE + 8, 'rock').setDepth(25); }
    }
    for (let ty = 0; ty < MAP_H; ty++) {
      for (const tx of [0, MAP_W - 1]) { this.add.image(tx * TILE + 8, ty * TILE + 8, 'rock').setDepth(25); }
    }
    // chokes near each base
    this.rockTiles = [];
    const spots = [[MAP_W * 0.35, MAP_H * 0.3], [MAP_W * 0.6, MAP_H * 0.7], [MAP_W * 0.5, MAP_H * 0.5], [MAP_W * 0.7, MAP_H * 0.25], [MAP_W * 0.28, MAP_H * 0.72]];
    for (const [sx, sy] of spots) {
      const c = placeCluster(sx | 0, sy | 0, 14 + ((rnd() * 10) | 0));
      this.rockTiles.push(...c);
    }
    // SC1 destructible rocks: mid-map cluster rocks crack under fire, clearing new paths
    this.destructibles = [];
    for (const r of this.rockTiles) {
      if (rnd() < 0.45 && r.tx > 8 && r.ty > 8 && r.tx < MAP_W - 8 && r.ty < MAP_H - 8) {
        r.hp = 300; r.destructible = true;
        this.destructibles.push(r);
      }
    }
    // SC1 high ground: two plateaus with ramp access, +dmg and vision edge
    this.elev = new Uint8Array(MAP_W * MAP_H);
    this.ramp = new Uint8Array(MAP_W * MAP_H);
    const plateau = (cx0, cy0, rw, rh) => {
      const cx = Math.round(cx0), cy = Math.round(cy0);
      for (let ty = cy - rh; ty <= cy + rh; ty++) for (let tx = cx - rw; tx <= cx + rw; tx++) {
        if (tx < 2 || ty < 2 || tx >= MAP_W - 2 || ty >= MAP_H - 2) continue;
        if (Math.abs(tx - cx) + Math.abs(ty - cy) > rw + rh) continue;
        this.elev[ty * MAP_W + tx] = 1;
      }
      // carve a 2-tile ramp on the SW face
      for (let k = 0; k < 3; k++) {
        const rx = cx - rw + k, ry = cy + rh;
        this.ramp[ry * MAP_W + rx] = 1;
      }
    };
    plateau(MAP_W * 0.5, MAP_H * 0.2, 6, 3);
    plateau(MAP_W * 0.5, MAP_H * 0.8, 6, 3);
    plateau(MAP_W * 0.24, MAP_H * 0.5, 4, 3);
    // paint elevation + destructible cracks into the terrain texture
    gx2: {
      for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
        const i = ty * MAP_W + tx;
        if (this.elev[i]) {
          gx.fillStyle = 'rgba(190,205,225,0.10)'; gx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
          if (!this.elev[i - MAP_W]) { gx.fillStyle = 'rgba(0,0,0,0.45)'; gx.fillRect(tx * TILE, ty * TILE, TILE, 3); }
          if (!this.elev[i + MAP_W]) { gx.fillStyle = 'rgba(255,255,255,0.10)'; gx.fillRect(tx * TILE, (ty + 1) * TILE - 2, TILE, 2); }
        }
        if (this.ramp[i]) { gx.fillStyle = 'rgba(160,175,195,0.16)'; gx.fillRect(tx * TILE, ty * TILE, TILE, TILE); }
      }
      // rock clusters: block pathing for ground (rockTiles already blocked); some destructible stay until destroyed
      this.terrainCtx = gx; this.terrainCanvas = gc;
      this.textures.get('terrain').refresh();
    }

    // mineral lines near each base
    const mineralLine = (bx, by, dir) => {
      const out = [];
      for (let i = 0; i < 8; i++) {
        const x = bx + dir * (i % 4) * TILE + ((rnd() * 12) | 0) - 6;
        const y = by + (i > 3 ? TILE * 2 : 0) + ((rnd() * 10) | 0) - 5;
        const m = { x, y, amount: 1500, id: nextObjId() };
        this.minerals.push(m);
        out.push(m);
        const spr = this.add.image(x, y, 'minerals').setDepth(15);
        m.sprite = spr;
      }
      return out;
    };
    mineralLine(PXW * 0.16, PXH * 0.16, 1);
    mineralLine(PXW * 0.84, PXH * 0.84, -1);

    // geysers
    const gey = (x, y) => {
      const g = { x, y, gas: 2500, id: nextObjId(), workers: [] };
      this.geysers.push(g);
      this.add.image(x, y, 'geyser').setDepth(15);
    };
    gey(PXW * 0.22, PXH * 0.26);
    gey(PXW * 0.78, PXH * 0.74);
    gey(PXW * 0.5, PXH * 0.16);
    gey(PXW * 0.5, PXH * 0.84);
    this.geyserTiles = new Map();

    // SC1 power-up crates: scattered pickups, random payload on claim
    this.crates = [];
    const crateSpots = [[0.30, 0.42], [0.68, 0.30], [0.44, 0.66], [0.58, 0.52], [0.15, 0.62], [0.86, 0.40], [0.36, 0.20], [0.62, 0.82]];
    for (const [fx, fy] of crateSpots) {
      const x = PXW * fx, y = PXH * fy;
      const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
      if (this.nav && this.nav.solid[this.nav.idx(tx, ty)]) continue;
      const kind = ['minerals', 'gas', 'power', 'spawn', 'vision'][this.crates.length % 5];
      const spr = this.add.image(x, y, 'crate').setDepth(14).setAlpha(0.95);
      // subtle pulsing glow to draw the eye
      this.tweens.add({ targets: spr, alpha: 0.65, duration: 900, yoyo: true, repeat: -1 });
      this.crates.push({ x, y, kind, spr, id: nextObjId() });
    }

    // SC1 critters: small scavengers that scamper when anything gets close
    this.critters = [];
    for (let i = 0; i < 7; i++) {
      const x = PXW * (0.2 + Math.random() * 0.6), y = PXH * (0.2 + Math.random() * 0.6);
      const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
      if (this.nav && this.nav.solid[this.nav.idx(tx, ty)]) continue;
      const spr = this.add.image(x, y, 'critter').setDepth(16).setFlipX(Math.random() < 0.5);
      this.critters.push({ x, y, spr, vx: 0, vy: 0, wanderT: Math.random() * 3, fleeT: 0 });
    }
  }

  rng() { let s = 1234567; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

  blockTerrain() {
    for (const r of this.rockTiles) this.nav.blockRect(-2, r.tx, r.ty, r.tx, r.ty);
    for (let t = 0; t < MAP_W; t++) { this.nav.solid[this.nav.idx(t, 0)] = 1; this.nav.solid[this.nav.idx(t, MAP_H - 1)] = 1; }
    for (let ty = 0; ty < MAP_H; ty++) { this.nav.solid[this.nav.idx(0, ty)] = 1; this.nav.solid[this.nav.idx(MAP_W - 1, ty)] = 1; }
    for (const m of this.minerals) { this.nav.blockRect(-3, Math.floor(m.x / TILE), Math.floor(m.y / TILE), Math.floor(m.x / TILE), Math.floor(m.y / TILE)); }
    for (const g of this.geysers) { this.nav.blockRect(-4, Math.floor(g.x / TILE) - 1, Math.floor(g.y / TILE) - 1, Math.floor(g.x / TILE) + 1, Math.floor(g.y / TILE) + 1); }
  }

  // ---------------- fog of war ----------------
  createFog() {
    this.fogCanvas = document.createElement('canvas');
    this.fogCanvas.width = MAP_W; this.fogCanvas.height = MAP_H;
    this.fogCtx = this.fogCanvas.getContext('2d');
    this.fogCtx.fillStyle = '#000'; this.fogCtx.fillRect(0, 0, MAP_W, MAP_H);
    this.fogTex = this.textures.addCanvas('fog', this.fogCanvas);
    this.fogImg = this.add.image(PXW / 2, PXH / 2, 'fog');
    this.fogImg.setOrigin(0.5).setScale(TILE).setDepth(500).setAlpha(0.72);
    this.seen = new Uint8Array(MAP_W * MAP_H);
    this.visCanvas = document.createElement('canvas');
    this.visCanvas.width = MAP_W; this.visCanvas.height = MAP_H;
    this.visCtx = this.visCanvas.getContext('2d');
    this.visTex = this.textures.addCanvas('vis', this.visCanvas);
    this.visImg = this.add.image(PXW / 2, PXH / 2, 'vis');
    this.visImg.setOrigin(0.5).setScale(TILE).setDepth(499).setBlendMode(Phaser.BlendModes.MULTIPLY).setAlpha(1);
    this.fogDirty = true;
    this.fogTimer = 0;
  }

  updateFog() {
    const { visCtx, fogCtx } = this;
    visCtx.clearRect(0, 0, MAP_W, MAP_H);
    // darken everything unseen
    fogCtx.fillStyle = '#000';
    for (let i = 0; i < this.seen.length; i++) {
      if (!this.seen[i]) { const tx = i % MAP_W, ty = (i / MAP_W) | 0; fogCtx.fillRect(tx, ty, 1, 1); }
    }
    // explored => dim gray (seen), currently visible => transparent in vis layer
    visCtx.fillStyle = 'rgba(108,116,134,1)';
    visCtx.fillRect(0, 0, MAP_W, MAP_H);
    const stamp = (cx, cy, r, layer) => {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue;
          const tx = Math.round(cx / TILE + dx), ty = Math.round(cy / TILE + dy);
          if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue;
          if (layer === 'seen') this.seen[this.nav.idx(tx, ty)] = 1;
        }
      }
    };
    // visible: cut holes in fog (seen texture) & make vis layer transparent — soft radial edges
    // SC1: cloaked/burrowed hostiles contribute NO vision to the shared seen-map
    for (const u of this.units) { if (!u.dead && !(u.team !== 0 && (u.cloaked || u.burrowed))) stamp(u.x, u.y, (u.burrowed && u.team !== 0) ? 1 : (u.burrowed ? 2 : u.def.sight)); }
    for (const b of this.buildings) { if (!b.dead) stamp(b.x, b.y, b.def.sight || 5); }
    const softCut = (ctx, cx, cy, r) => {
      const rr = Math.max(1.5, r);
      const grad = ctx.createRadialGradient(cx, cy, rr * 0.55, cx, cy, rr);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 7); ctx.fill();
    };
    fogCtx.globalCompositeOperation = 'destination-out';
    visCtx.globalCompositeOperation = 'destination-out';
    for (const u of this.units) { if (!u.dead) { softCut(visCtx, u.x / TILE, u.y / TILE, u.def.sight); } }
    for (const b of this.buildings) { if (!b.dead) { softCut(visCtx, b.x / TILE, b.y / TILE, (b.def.sight || 5)); } }
    fogCtx.globalCompositeOperation = 'source-over';
    visCtx.globalCompositeOperation = 'source-over';
    // repopulate holes in fog: fog = black where unseen only
    fogCtx.clearRect(0, 0, MAP_W, MAP_H);
    fogCtx.fillStyle = '#000';
    for (let i = 0; i < this.seen.length; i++) {
      if (!this.seen[i]) { const tx = i % MAP_W, ty = (i / MAP_W) | 0; fogCtx.fillRect(tx, ty, 1, 1); }
    }
    this.textures.get('fog').refresh();
    this.textures.get('vis').refresh();
  }

  isVisible(x, y) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
    return this.seen[this.nav.idx(tx, ty)] === 1 && this.currentlyVisible(x, y);
  }

  currentlyVisible(x, y) {
    for (const rv of (this._tempReveals || [])) { if (this.gameTime < rv.until && Math.hypot(x - rv.x, y - rv.y) < rv.r) return true; }
    for (const u of this.units) { if (!u.dead && u.team === 0 && Math.hypot(u.x - x, u.y - y) < u.def.sight * TILE) return true; }
    for (const b of this.buildings) { if (!b.dead && b.team === 0 && Math.hypot(b.x - x, b.y - y) < (b.def.sight || 5) * TILE) return true; }
    return false;
  }

  // SC1: cloak/burrow detection net — missile turrets, spore colonies, ghosts see through it
  detectedAt(x, y) {
    for (const b of this.buildings) {
      if (b.team !== 0 || b.dead || !b.built || !b.def.detect) continue;
      if (Math.hypot(b.x - x, b.y - y) < TILE * 9) return true;
    }
    for (const u of this.units) {
      if (u.team !== 0 || u.dead || !u.def.detect) continue;
      if (Math.hypot(u.x - x, u.y - y) < TILE * 9) return true;
    }
    return false;
  }

  // per-fog-tick: enemy stealth sprites — cloaked/burrowed hostiles invisible unless detected
  updateStealthVisibility() {
    for (const u of this.units) {
      if (u.dead || u.team === 0) continue;
      const detected = this.detectedAt(u.x, u.y);
      if (u.cloaked || u.burrowed) {
        if (detected && this.currentlyVisible(u.x, u.y)) { u.sprite.setVisible(true); u.sprite.setAlpha(u.burrowed ? 0.38 : 0.3); }
        else u.sprite.setVisible(false);
      } else {
        u.sprite.setVisible(true);
        if (!u.def.cloak) u.sprite.setAlpha(u.burrowed ? 0.35 : 1);
        else if (u.state === 'attackTarget' || u.state === 'move' || u.state === 'attackMove') u.sprite.setAlpha(1);
      }
    }
  }

  // SC1: zerg ground units sprint across their own creep
  creepSpeedAt(team, x, y) {
    const cc = this.creepCanvases && this.creepCanvases[team];
    if (!cc) return false;
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
    return !!cc.cells[ty * MAP_W + tx];
  }

  // SC1: cliff wall check — ground units only enter high ground via ramps
  elevAt(x, y) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return 0;
    return this.elev ? this.elev[ty * MAP_W + tx] : 0;
  }

  groundBlocked(unit, x, y) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
    const i = ty * MAP_W + tx;
    if (!this.elev) return false;
    const onCliff = this.elev[i] === 1;
    const fromCliff = this.elevAt(unit.x, unit.y) === 1;
    if (onCliff && !fromCliff) return !this.ramp[i];   // entering cliff wall unless ramp
    if (!onCliff && fromCliff) return !this.ramp[i];     // leaving cliff anywhere except ramp
    return false;
  }

  // SC1: destructible rocks crack and shatter under fire, opening new paths
  hitRocksNear(x, y, dmg, splash) {
    if (!this.destructibles || !this.destructibles.length) return;
    const r = Math.max(22, (splash || 0) + 14);
    for (const rk of [...this.destructibles]) {
      const rx = rk.tx * TILE + 8, ry = rk.ty * TILE + 8;
      if (Math.hypot(rx - x, ry - y) > r + 8) continue;
      rk.hp -= Math.max(5, (dmg || 6) * 0.6);
      if (rk.hp <= 0) this.destroyRock(rk);
    }
  }

  destroyRock(rk) {
    const tx = rk.tx, ty = rk.ty;
    const i = this.nav.idx(tx, ty);
    if (this.nav.blockedBy[i] === -2) { this.nav.blocked[i] = 0; this.nav.blockedBy[i] = -1; }
    for (const c of [...this.children.list]) {
      if (c.type === 'Image' && c.texture && (c.texture.key === 'rock' || c.texture.key === 'rock2') &&
          Math.abs(c.x - (tx * TILE + 8)) < 9 && Math.abs(c.y - (ty * TILE + 8)) < 9) c.destroy();
    }
    this.rockTiles = this.rockTiles.filter(r => r !== rk);
    this.destructibles = this.destructibles.filter(r => r !== rk);
    this.shake(3, 0.15);
    if (this.camNear(tx * TILE, ty * TILE)) {
      const puff = this.add.circle(tx * TILE + 8, ty * TILE + 8, 10, 0x9aa4b0, 0.7).setDepth(44);
      this.tweens.add({ targets: puff, scale: 2.4, alpha: 0, duration: 420, onComplete: () => puff.destroy() });
      for (let k = 0; k < 5; k++) {
        const d = this.add.image(tx * TILE + 8, ty * TILE + 8, 'spark').setDepth(46);
        this.tweens.add({ targets: d, x: d.x + (Math.random() * 30 - 15), y: d.y + 16, alpha: 0, duration: 400, onComplete: () => d.destroy() });
      }
      this.audio?.death(false);
    }
    this.events.emit('hud:alert', 'ROCK DESTROYED — PATH OPEN');
  }

  // ---------------- creep ----------------
  createCreepLayers() {
    this.creepCanvases = {};
    this.creepTextures = {};
    for (const t of [0, 1]) {
      const c = document.createElement('canvas'); c.width = MAP_W; c.height = MAP_H;
      const ctx = c.getContext('2d');
      this.creepCanvases[t] = { c, ctx, cells: new Uint8Array(MAP_W * MAP_H) };
      const tex = this.textures.addCanvas(`creep-t${t}`, c);
      this.creepTextures[t] = tex;
      const img = this.add.image(PXW / 2, PXH / 2, `creep-t${t}`);
      img.setOrigin(0.5).setScale(TILE).setDepth(5).setAlpha(t === 0 ? 0.75 : 0.8);
    }
    this.creepDirty = false;
    this.creepTimer = 0;
  }

  addCreep(team, cx, cy, radius) {
    const { ctx, cells } = this.creepCanvases[team];
    const tx = Math.round(cx / TILE), ty = Math.round(cy / TILE);
    let changed = false;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius) continue;
        const x = tx + dx, y = ty + dy;
        if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) continue;
        const i = y * MAP_W + x;
        if (!cells[i]) { cells[i] = 1; ctx.fillStyle = team === 0 ? '#2f4e8f' : '#5a2340'; ctx.fillRect(x, y, 1, 1); changed = true; }
      }
    }
    if (changed) this.textures.get(`creep-t${team}`).refresh();
  }

  hasCreep(team, x, y) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
    return this.creepCanvases[team].cells[ty * MAP_W + tx] === 1;
  }

  // ---------------- base spawn ----------------
  spawnBase(team, race) {
    const info = RACE_INFO[race];
    const bx = team === 0 ? PXW * 0.12 : PXW * 0.88;
    const by = team === 0 ? PXH * 0.12 : PXH * 0.88;
    const b = new Building(this, team, info.primary, bx, by, { instant: true });
    this.buildings.push(b);
    const workerKinds = info.workers;
    for (let i = 0; i < 4; i++) {
      const u = this.spawnUnit(team, workerKinds[0], bx + 40 + Math.random() * 40, by + 40 + Math.random() * 40, { arriveReady: true });
    }
    if (race === 'zerg') {
      this.addCreep(team, bx, by, b.def.creepRadius || 8);
      // overlord
      this.spawnUnit(team, 'overlord', bx + 30, by - 40, { arriveReady: true });
    }
    if (race === 'protoss') {
      // starting pylon
      const py = new Building(this, team, 'pylon', bx + TILE * 5, by + TILE * 2, { instant: true });
      this.buildings.push(py);
    }
    // starting barracks for enemy
    if (team === 1) {
      const bid = race === 'zerg' ? 'spawningPool' : race === 'protoss' ? 'gateway' : 'barracks';
      const eb = new Building(this, team, bid, bx + TILE * 4 * (team === 1 ? -1 : 1), by + TILE * 3, { instant: true });
      this.buildings.push(eb);
      if (race === 'zerg') this.addCreep(team, bx, by, 9);
    }
    this.players[team].supplyCap = this.computeSupplyCap(team);
  }

  // ---------------- spawning ----------------
  spawnUnit(team, kind, x, y, opts = {}) {
    const p = this.players[team];
    const def = UNITS[kind];
    if (!def) return null;
    if (!opts.arriveReady) {
      if (p.supplyUsed + (def.supply || 0) > p.supplyCap) return null;
    }
    const u = new Unit(this, team, kind, x, y);
    this.units.push(u);
    p.supplyUsed += def.supply || 0;
    if (def.supplyBonus) p.supplyCap += def.supplyBonus;
    // apply weapon upgrades
    u.bonusDamage = this.getWeaponLevel(team) * (def.targets !== 'air' ? 2 : 0);
    u.bonusArmor = this.getArmorLevel(team);
    if (this.techResearched(team, 'vehiclePlating1') && ['tank', 'vulture', 'goliath', 'wraith', 'battlecruiser', 'carrier', 'reaver', 'devourer'].includes(kind)) u.bonusArmor += 2;
    if (this.techResearched(team, 'zealotSpeed') && kind === 'zealot') u.speed *= 1.18;
    // F7 perks + F2 upgrade visuals on birth
    if (team === 0) {
      if (this.perks?.flag && !def.worker) this.veteranFlag(u);
      if (this.perks?.chrome) u.sprite.setTint(0xcfd8e6);
      if (this.perks?.skins) { u.sprite.setTintFill(0x2a3f5f); this.tweens.add({ targets: u.sprite, tint: this.perks?.chrome ? 0xcfd8e6 : 0xffffff, duration: 220 }); }
    }
    if (!opts.arriveReady && def.worker === false && !def.weaponless) u.setOrder({ type: 'attackMove', point: team === 1 ? { x: PXW * 0.15, y: PXH * 0.15 } : { x: PXW * 0.85, y: PXH * 0.85 } });
    return u;
  }

  spawnProjectile({ from, target, damage, splash, team, kind, speed, attacker }) {
    this.projectiles.push({ x: from.x, y: from.y, target, damage, splash, team, kind, speed, dead: false });
    const col = team === 0 ? '#bfe0ff' : '#ffc28a';
    if (kind === 'tank' || kind === 'turret') {
      const g = this.add.graphics().setDepth(45);
      g.lineStyle(2, team === 0 ? 0x9fc8ff : 0xffb066, 0.9);
      g.lineBetween(from.x, from.y - 6, target.x, target.y);
      this.tweens.add({ targets: g, alpha: 0, duration: 120, onComplete: () => g.destroy() });
      this.applyHit(target, damage, splash);
    } else if (kind === 'firebat') {
      const g = this.add.graphics().setDepth(45);
      g.fillStyle(0xff9c3c, 0.8);
      g.fillCircle(from.x, from.y, 6);
      g.fillStyle(0xffd27a, 0.6);
      g.fillCircle((from.x + target.x) / 2, (from.y + target.y) / 2, 10);
      this.tweens.add({ targets: g, alpha: 0, duration: 180, onComplete: () => g.destroy() });
      this.applyHit(target, damage, splash || 18);
    } else {
      const sp = this.add.image(from.x, from.y, 'spark').setDepth(45);
      if (kind === 'zealot' || kind === 'darkTemplar' || kind === 'archon') {
        const g = this.add.graphics().setDepth(45);
        g.lineStyle(2, kind === 'darkTemplar' ? 0xc060ff : 0x9fd0ff, 0.9);
        g.lineBetween(from.x, from.y, target.x, target.y);
        this.tweens.add({ targets: g, alpha: 0, duration: 100, onComplete: () => g.destroy() });
        this.applyHit(target, damage, splash);
        sp.destroy();
        return;
      }
      sp._proj = { target, damage, splash, speed, team, attacker };
    }
  }

  applyHit(target, damage, splash, attacker) {
    if (target.dead) return;
    target.takeDamage(damage, attacker);
    const tx = target.x, ty = target.y;
    this.hitRocksNear(tx, ty, damage, splash);
    if (splash > 0) {
      if (splash >= 20) this.shake(6, 0.35);
      const boom = this.add.circle(tx, ty, splash, 0xff9c3c, 0.25).setDepth(46);
      this.tweens.add({ targets: boom, scale: 1.6, alpha: 0, duration: 200, onComplete: () => boom.destroy() });
      for (const u of this.units) {
        if (u.dead || u.team === undefined) continue;
        if (u === target) continue;
        const sd = Math.hypot(u.x - tx, u.y - ty);
        if (sd <= splash + u.radius) {
          // SC1-style falloff: full damage at center -> ~40% at blast edge
          const falloff = Math.max(0.4, 1 - 0.6 * Math.min(1, sd / Math.max(1, splash)));
          u.takeDamage(Math.ceil(damage * falloff), attacker);
        }
      }
      for (const b of this.buildings) {
        if (b.dead || b.team === target.team) continue;
        const sd = Math.hypot(b.x - tx, b.y - ty);
        if (sd <= splash + 16) b.takeDamage(Math.ceil(damage * Math.max(0.3, 0.5 * (1 - 0.5 * Math.min(1, sd / Math.max(1, splash))))), attacker);
      }
    }
  }

  onProjectileHit(p) { if (!p.target?.dead) { this.applyHit(p.target, p.damage, p.splash, p.attacker); } }

  // ---------------- SC1: spider mines ----------------
  placeSpiderMine(x, y, team) {
    const mine = { x, y, team, arming: 1.2, armed: false, radius: 46, dead: false };
    this.spiderMines.push(mine);
    const spr = this.add.graphics().setDepth(24);
    mine.spr = spr;
    // enemy mines only visible if visible by player vision
    this.updateSpiderMineSprite(mine);
    if (this.camNear(x, y)) {
      const pop = this.add.circle(x, y, 3, 0xffd23f, 0.9).setDepth(47);
      this.tweens.add({ targets: pop, scale: 3, alpha: 0, duration: 400, onComplete: () => pop.destroy() });
    }
  }

  updateSpiderMineSprite(mine) {
    const g = mine.spr; if (!g || mine.dead) return;
    const enemy = mine.team !== 0;
    const seen = !enemy || this.isVisible(mine.x, mine.y);
    g.setVisible(seen);
    if (!seen) return;
    g.clear();
    g.fillStyle(enemy ? 0x8a3b1e : 0x4a5462, 1); g.fillCircle(mine.x, mine.y, 3.5);
    g.lineStyle(1, enemy ? 0xff7b2e : 0x9fc8ff, mine.armed ? 0.9 : 0.4); g.strokeCircle(mine.x, mine.y, 5);
    if (mine.armed && Math.sin(this.time.now / 200) > 0) { g.fillStyle(0xff4040, 1); g.fillCircle(mine.x, mine.y - 4, 1.2); }
  }

  updateSpiderMines(dt) {
    for (const mine of this.spiderMines) {
      if (mine.dead) continue;
      if (!mine.armed) { mine.arming -= dt; if (mine.arming <= 0) { mine.armed = true; this.updateSpiderMineSprite(mine); } continue; }
      this.updateSpiderMineSprite(mine);
      for (const u of this.units) {
        if (u.dead || u.team === mine.team || u.flying) continue;
        if (Math.hypot(u.x - mine.x, u.y - mine.y) <= mine.radius) {
          mine.dead = true;
          this.shake(5, 0.3);
          this.audio?.nukeImpact?.();
          const boom = this.add.circle(mine.x, mine.y, 30, 0xff9c3c, 0.8).setDepth(60);
          this.tweens.add({ targets: boom, scale: 2.2, alpha: 0, duration: 380, onComplete: () => boom.destroy() });
          const ring = this.add.circle(mine.x, mine.y, 20, 0xff5c2e, 0).setStrokeStyle(4, 0xffd27a, 0.9).setDepth(60);
          this.tweens.add({ targets: ring, scale: 2.4, alpha: 0, duration: 450, onComplete: () => ring.destroy() });
          this.add.image(mine.x, mine.y, 'scorch').setDepth(6).setAlpha(0.5).setScale(1.6);
          for (const v of this.units) { if (!v.dead && v.team !== mine.team && !v.flying && Math.hypot(v.x - mine.x, v.y - mine.y) <= mine.radius) v.takeDamage(125, null); }
          break;
        }
      }
    }
    this.spiderMines = this.spiderMines.filter(m => { if (m.dead) { m.spr?.destroy(); } return !m.dead; });
  }

  // ---------------- SC1: high templar psionic storm (unit cast) ----------------
  castUnitPsiStorm(caster, x, y) {
    caster.energy -= 75;
    this.audio?.psiCast?.();
    const r = 55;
    const storm = this.add.circle(x, y, r, 0xc060ff, 0.16).setStrokeStyle(2, 0xe0a0ff, 0.8).setDepth(49);
    this.tweens.add({ targets: storm, alpha: 0, duration: 3800, onComplete: () => storm.destroy() });
    const iv = this.time.addEvent({ delay: 500, repeat: 6, callback: () => {
      for (let i = 0; i < 4; i++) {
        const a = Math.random() * Math.PI * 2, rr = Math.random() * r;
        const bx = x + Math.cos(a) * rr, by = y + Math.sin(a) * rr;
        const zap = this.add.graphics().setDepth(50);
        zap.lineStyle(2, 0xe0a0ff, 0.9);
        zap.lineBetween(bx, by - 20, bx + (Math.random() * 12 - 6), by + (Math.random() * 12 - 6));
        this.tweens.add({ targets: zap, alpha: 0, duration: 170, onComplete: () => zap.destroy() });
      }
      for (const u of this.units) { if (!u.dead && u.team !== caster.team && Math.hypot(u.x - x, u.y - y) <= r) u.takeDamage(18, caster); }
    } });
    this.time.delayedCall(4000, () => iv.remove());
    this.events.emit('hud:alert', 'PSIONIC STORM');
  }

  // ---------------- SC1: scanner sweep (T + click) ----------------
  scannerSweep(x, y) {
    if (this._scanCd > 0) { this.events.emit('hud:alert', `SCANNER RECHARGING ${Math.ceil(this._scanCd)}s`); this.audio?.error(); return false; }
    if (!this.hasBuilding('scienceFacility', 0)) { this.events.emit('hud:alert', 'REQUIRES SCIENCE FACILITY'); this.audio?.error(); return false; }
    this._scanCd = 30;
    this.audio?.psiCast?.();
    // reveal a radius for 8 seconds via a temp stamp on `seen` + temp vision marker
    const TEMP = 11; // tiles
    const reveal = { x, y, r: TEMP * TILE, until: this.gameTime + 8, seenCells: [] };
    const tx0 = Math.max(0, Math.floor((x - TEMP * TILE) / TILE)), tx1 = Math.min(MAP_W - 1, Math.floor((x + TEMP * TILE) / TILE));
    const ty0 = Math.max(0, Math.floor((y - TEMP * TILE) / TILE)), ty1 = Math.min(MAP_H - 1, Math.floor((y + TEMP * TILE) / TILE));
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      if ((tx * TILE + 8 - x) ** 2 + (ty * TILE + 8 - y) ** 2 <= (TEMP * TILE) ** 2) {
        const i = this.nav.idx(tx, ty);
        if (!this.seen[i]) { this.seen[i] = 2; reveal.seenCells.push(i); }
      }
    }
    this._tempReveals = (this._tempReveals || []).concat(reveal);
    const ring = this.add.circle(x, y, 20, 0x7dffd9, 0.12).setStrokeStyle(3, 0x7dffd9, 0.9).setDepth(508);
    this.tweens.add({ targets: ring, radius: TEMP * TILE, alpha: 0, duration: 700, onComplete: () => ring.destroy() });
    this.cameras.main.centerOn(x, y);
    this.events.emit('hud:alert', 'SCANNER SWEEP');
    return true;
  }

  // ---- transports & garrison (SC1 drop play) ----
  loadUnitInto(tr, u) {
    if (!tr.def.transport || tr.dead || u.dead || u.loaded) return false;
    if (tr.carry.length + (u.def.supply || 1) > tr.def.transport) return false;
    tr.carry.push(u);
    u.intoTransport();
    if (this.selection) this.selection.delete(u);
    if (this.selectedUnits) this.selectedUnits.delete(u);
    return true;
  }

  unloadAll(tr) {
    if (!tr.carry || !tr.carry.length) return;
    const drop = { x: tr.x, y: tr.y + TILE * 0.7 };
    let i = 0;
    for (const p of tr.carry) {
      if (!p || p.dead) continue;
      const px = drop.x + ((i % 3) - 1) * TILE * 0.8;
      const py = drop.y + Math.floor(i / 3) * TILE * 0.6;
      p.outOfTransport(px, py);
      i++;
    }
    tr.carry = [];
    this._droppedOnce = true;
    this.showOrderMarker?.(drop.x, drop.y, 0xffb04a);
    this.events.emit('hud:alert', 'UNLOADING', 0xffb04a);
  }

  garrisonInto(b, u) {
    if (!b.def.garrison || b.dead || !b.built || u.dead || u.loaded) return false;
    if (b.garrison.length >= b.def.garrison) return false;
    if (['scv', 'drone', 'probe'].includes(u.kind)) return false;
    b.garrison.push(u);
    u.garrison(b);
    if (this.selection) this.selection.delete(u);
    if (this.selectedUnits) this.selectedUnits.delete(u);
    return true;
  }

  emergeAll(b) {
    if (!b.garrison || !b.garrison.length) return;
    for (const g of b.garrison) { if (!g.dead) g.emerge(b.x, b.y + TILE * 0.8); }
    b.garrison = [];
    this.events.emit('hud:alert', 'UNLOADING', 0xffb04a);
  }

  findTransportNear(x, y, team) {
    let best = null, bestD = TILE * 2;
    for (const o of this.units) { if (o.dead || o.team !== team || !o.def.transport) continue; const d = Math.hypot(o.x - x, o.y - y); if (d < bestD) { bestD = d; best = o; } }
    return best;
  }

  findBunkerNear(x, y, team) {
    let best = null, bestD = TILE * 2.5;
    for (const b of this.buildings) { if (b.dead || !b.built || b.team !== team || !b.def.garrison) continue; const d = Math.hypot(b.x - x, b.y - y); if (d < bestD) { bestD = d; best = b; } }
    return best;
  }

  onUnitDeath(u) {
    const p = this.players[u.team];
    p.supplyUsed -= u.def.supply || 0;
    if (u.def.supplyBonus) p.supplyCap -= u.def.supplyBonus;
    this.units = this.units.filter(x => x !== u);
    this.selection.delete(u);
    this.harvestTargetReset(u);
    // F1: kill feedback — shake + credit + ultimate energy
    if (u.isBoss) {
      this.shake(10, 0.6);
      this.events.emit('hud:alert', 'CHAMPION SLAIN');
      this.audio?.objective();
      this.audio?.bossTheme(false);
      const k = this.objectives.find(o => o.id === 'boss'); if (k) { k.done = true; this.mods.boss = false; this.events.emit('hud:objectives', this.objectives); }
      if (this._holdDone) this.endGame('victory');
    }
    if (u.team === 1) {
      this.ultimateEnergy = Math.min(this.ultimateMax, this.ultimateEnergy + 1.5);
    } else if (u.team === 0 && this.selection.has(u)) {
      this.audio?.death(false);
    }
    // retaliation for AI
    if (u.team === 0 && this.enemyRace) {
      this.aiState.lastSeenPlayerPos = { x: u.x, y: u.y };
      this.aiState.aggroUntil = this.gameTime + 12;
    }
  }

  harvestTargetReset(u) {
    for (const g of this.geysers) g.workers = g.workers.filter(w => w !== u);
  }

  onBuildingDeath(b) {
    this.buildings = this.buildings.filter(x => x !== b);
    this.shake(b.def.primary ? 12 : 7, 0.5);
    if (this.selectedBuilding === b) this.selectedBuilding = null;
    this.players[b.team].supplyCap = this.computeSupplyCap(b.team);
    const info = RACE_INFO[this.players[b.team].race];
    if (b.buildId === info.primary) {
      this.endGame(b.team === 0 ? 'defeat' : 'victory');
    }
    if (b.team === 1 && this.enemyRace) {
      this.aiState.lastSeenPlayerPos = { x: b.x, y: b.y };
    }
  }

  onBuildingComplete(b) {
    this.players[b.team].supplyCap = this.computeSupplyCap(b.team);
    if (b.def.onGeyser) {
      // attach to geyser
      const g = this.geysers.find(g => Math.hypot(g.x - b.x, g.y - b.y) < TILE * 2.2 && !g.building);
      if (g) { g.building = b; b.geyser = g; this.assignGeyserWorkers(b); }
    }
    if (b.def.creepGrowth) this.addCreep(b.team, b.x, b.y, b.def.creepRadius || 8);
    if (b.def.power) { b.powerRadius = TILE * 10; this.drawPowerField(b); }
    this.addBuildingLights(b);
    this.audio?.buildComplete();
  }

  drawPowerField(b) {
    const ring = this.add.circle(b.x, b.y, TILE * 10, 0x8ab4ff, 0.05).setDepth(4);
    if (b.team !== 0) ring.setVisible(false);
    this.tweens.add({ targets: ring, scale: { from: 0.94, to: 1 }, alpha: 0.5, duration: 220, yoyo: false });
  }

  assignGeyserWorkers(b) {
    const g = b.geyser;
    if (!g) return;
    const workers = this.units.filter(u => !u.dead && u.team === b.team && u.def.worker);
    for (const w of workers) {
      if (g.workers.length >= 3) break;
      if (!g.workers.includes(w)) {
        g.workers.push(w);
        w.gasTarget = g;
        w.setOrder({ type: 'harvestGas' });
      }
    }
  }

  computeSupplyCap(team) {
    const info = RACE_INFO[this.players[team].race];
    let cap = 0;
    for (const b of this.buildings) {
      if (b.team !== team || b.dead || !b.built) continue;
      if (b.def.supply) cap += b.def.supply;
      if (b.buildId === 'supplyDepot') cap += 8;
    }
    if (this.players[team].race === 'zerg') {
      for (const u of this.units) if (!u.dead && u.team === team && u.kind === 'overlord') cap += 8;
    }
    return cap;
  }

  // ---------------- movement cohorts (flow fields) ----------------
  issueGroupMove(list, x, y, attackMove = false) {
    if (list.length >= 3) {
      // F6: formation spread — assign slots perpendicular to travel axis so armies stack in a line, not a blob
      const anchor = list[0];
      let ax = anchor.x, ay = anchor.y;
      const combat = list.filter(u => !u.def.worker);
      const useFormation = combat.length === list.length;
      const dx = x - ax, dy = y - ay;
      const len = Math.hypot(dx, dy) || 1;
      const px = -dy / len, py = dx / len; // perpendicular unit
      const spacing = TILE * 0.8;
      const n = list.length;
      const slot = (i) => {
        const k = i - (n - 1) / 2; // centered
        const off = k * spacing;
        // slight stagger depth for large groups to avoid overlap
        const depth = (Math.abs(k) % 2) * spacing * 0.4;
        return { x: x + px * off - (dx / len) * depth, y: y + py * off - (dy / len) * depth };
      };
      const key = `m:${Math.round(x / TILE)}:${Math.round(y / TILE)}:${attackMove ? 'a' : 'm'}`;
      const clearance = 0;
      const field = this.flows.ensure(key, x, y, this.gameTime, 0.6, clearance);
      let i = 0;
      for (const u of list) {
        const t = useFormation ? slot(i) : { x, y };
        u.flowField = field; u.issueMove(t.x, t.y, attackMove); i++;
      }
      this.flowsDirty = true;
    } else {
      for (const u of list) { u.flowField = null; u.issueMove(x, y, attackMove); }
    }
  }

  separationVector(u) {
    let sx = 0, sy = 0;
    for (const o of this.spatial.near(u.x, u.y)) {
      if (o === u || o.dead) continue;
      if (o.flying !== u.flying) continue;
      const dx = u.x - o.x, dy = u.y - o.y;
      const d2 = dx * dx + dy * dy;
      const minD = (u.radius + o.radius) * 1.15;
      if (d2 > minD * minD || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const push = (minD - d) / minD;
      sx += (dx / d) * push; sy += (dy / d) * push;
    }
    return { x: sx, y: sy };
  }

  showRallyFlag(b) {
    if (b._rallyFlag) b._rallyFlag.destroy();
    const fl = this.add.container(b.rallyPoint.x, b.rallyPoint.y).setDepth(48);
    const pole = this.add.rectangle(0, -6, 2, 14, 0xdbe7ff);
    const flag = this.add.triangle(4, -11, 0, 0, 10, 3, 0, 6, 0x6ee7a0);
    fl.add([pole, flag]);
    b._rallyFlag = fl;
    this.tweens.add({ targets: flag, scaleX: { from: 0.7, to: 1 }, duration: 200, yoyo: true, repeat: 1 });
    // auto-clear flag after 6s
    this.time.delayedCall(6000, () => { if (b._rallyFlag === fl) { fl.destroy(); b._rallyFlag = null; } });
  }

  // ---------------- resources ----------------
  canAfford(team, m, g = 0) { const p = this.players[team]; return p.minerals >= m && p.gas >= (g || 0); }
  spend(team, m, g = 0) { const p = this.players[team]; p.minerals -= m; p.gas -= g || 0; }
  addIncome(team, m, g = 0) { const p = this.players[team]; p.minerals += m; p.gas += g || 0; }

  nearestDropOff(u) {
    let best = null, bd = Infinity;
    for (const b of this.buildings) {
      if (b.team !== u.team || b.dead || !b.built) continue;
      if (b.def.produces?.includes(u.kind) || ['commandCenter', 'nexus', 'hatchery', 'refinery', 'extractor', 'assimilator'].includes(b.buildId)) {
        const d = Math.hypot(b.x - u.x, b.y - u.y);
        if (d < bd) { bd = d; best = b; }
      }
    }
    return best;
  }

  pickMineralForWorker(u) {
    if (u.gasTarget && u.gasTarget.gas > 0 && u.team === 1) return null; // handled separately
    // enemy AI gas assignment
    const gey = this.geysers.find(g => g.workers.includes(u));
    if (gey) { u.gasActive = true; return null; }
    return this.nearestMineralPatch(u, 40 * TILE);
  }

  nearestMineralPatch(u, maxD) {
    let best = null, bd = maxD || Infinity;
    for (const m of this.minerals) {
      if (m.amount <= 0) continue;
      const d = Math.hypot(m.x - u.x, m.y - u.y);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  nearestGeyser(u) {
    const assigned = this.geysers.find(g => g.workers.includes(u));
    return assigned || null;
  }

  onMineralDug(u, m, amt) { this.audio?.harvest(); }

  onCargoDeposited(u) {
    const isGas = u.cargoGas;
    this.addIncome(u.team, isGas ? 0 : u.cargo, isGas ? u.cargo : 0);
    this.audio?.deposit();
  }

  depleteMineral(m) {
    if (m.sprite) this.tweens.add({ targets: m.sprite, alpha: 0, scale: 0.5, duration: 400, onComplete: () => m.sprite.destroy() });
    this.minerals = this.minerals.filter(x => x !== m);
  }

  // ---------------- tech / upgrades ----------------
  techResearched(team, techId) { return !!this.players[team].techs[techId]; }
  completeResearch(team, techId) {
    const t = TECHS[techId];
    this.players[team].techs[techId] = true;
    if (t?.affects === 'weapons' || t?.affects?.includes('Weapons')) this.players[team].upgrades.weapons++;
    if (t?.affects === 'armor' || t?.affects?.includes('Armor') || t?.affects?.includes('Carapace') || t?.affects?.includes('Plating')) this.players[team].upgrades.armor++;
    // SC1 tiered army-wide upgrades: retro-apply to every live unit of the branch
    if (/InfantryWeapons/.test(techId)) {
      const lvl = t?.level || this.players[team].upgrades.weapons;
      this.players[team].upgrades.weapons = lvl;
      for (const u of this.units) if (!u.dead && u.team === team && !u.def.worker && ['marine', 'firebat', 'ghost', 'zereling', 'hydralisk', 'mutalisk', 'ultralisk', 'zealot', 'darkTemplar', 'htemplar'].includes(u.kind)) u.bonusDamage = Math.max(u.bonusDamage || 0, lvl * 2);
    }
    if (/InfantryArmor/.test(techId)) {
      const lvl = t?.level || this.players[team].upgrades.armor;
      this.players[team].upgrades.armor = lvl;
      for (const u of this.units) if (!u.dead && u.team === team && !u.def.worker && ['marine', 'firebat', 'ghost', 'zereling', 'hydralisk', 'mutalisk', 'ultralisk', 'zealot', 'darkTemplar', 'htemplar'].includes(u.kind)) u.bonusArmor = Math.max(u.bonusArmor || 0, lvl);
    }
    if (techId === 'vehiclePlating1') for (const u of this.units) if (!u.dead && u.team === team && ['tank', 'vulture', 'goliath', 'wraith', 'battlecruiser', 'carrier', 'reaver', 'devourer'].includes(u.kind)) u.bonusArmor += 2;
    if (techId === 'zealotSpeed') for (const u of this.units) if (!u.dead && u.team === team && u.kind === 'zealot') u.speed *= 1.18;
    if (techId === 'dragoonRange') for (const u of this.units) if (!u.dead && u.team === team && u.kind === 'dragoon') u.def = { ...u.def, range: u.def.range + 1 };
    if (techId === 'lair' || techId === 'hive') {
      const b = this.buildings.find(b => b.team === team && (b.buildId === 'hatchery' || b.buildId === 'lair') && b.def.morphTo !== false);
    }
    if (techId === 'zergMeleeAttacks1') this.players[team].upgrades.weapons++;
    if (techId === 'zergCarapace1') this.players[team].upgrades.armor++;
    if (techId === 'terranInfantryWeapons1') this.players[team].upgrades.weapons++;
    if (techId === 'terranInfantryArmor1') this.players[team].upgrades.armor++;
    if (techId === 'protossGroundWeapons1') this.players[team].upgrades.weapons++;
    if (techId === 'protossGroundPlating1') this.players[team].upgrades.armor++;
    // F2: visible research effects — unit tint flash + glow ring on the lab
    if (team === 0) {
      const tint = t?.affects?.toLowerCase?.().includes('weapon') || /weapon|attack/i.test(techId) ? 0xffe08a : 0x8ad4ff;
      const lab = this.buildings.find(b => b.team === team && !b.dead && (b.buildId === t?.building || b.morphedTo === t?.building)) || this.buildings.find(b => b.team === team && b.def.primary);
      if (lab) {
        const ring = this.add.circle(lab.x, lab.y, 14, 0x000000, 0).setStrokeStyle(3, tint, 0.9).setDepth(25);
        this.tweens.add({ targets: ring, radius: TILE * 4, alpha: 0, duration: 900, onComplete: () => ring.destroy() });
        lab.sprite.setTintFill(tint);
        this.tweens.add({ targets: lab.sprite, tint: 0xffffff, duration: 700 });
      }
      for (const u of this.units) if (!u.dead && u.team === team && !u.def.worker) {
        u.sprite.setTintFill(tint);
        this.tweens.add({ targets: u.sprite, tint: 0xffffff, duration: 500 });
      }
      this.events.emit('hud:alert', (t?.name || techId) + ' RESEARCH COMPLETE');
    }
    this.audio?.researchComplete();
  }

  applyUpgradeTintToBuildings(team) {
    const lvl = this.getWeaponLevel(team);
    if (!lvl) return;
    for (const b of this.buildings) if (!b.dead && b.team === team && b.built && b.def.weapon) b.sprite.setTint(0xd8c090);
  }
  getWeaponLevel(team) { return this.players[team].upgrades.weapons; }
  getArmorLevel(team) { return this.players[team].upgrades.armor; }

  hasBuilding(buildId, team) { return this.buildings.some(b => b.team === team && !b.dead && b.built && (b.buildId === buildId || b.morphedTo === buildId)); }
  hasAddOn(b, addOnId) { return !!b?._addOns?.includes(addOnId); }

  // ---------------- input ----------------
  createInput() {
    this.cameras.main.setBounds(0, 0, PXW, PXH);
    this.cameras.main.zoomTo(1.6, 10);
    this.zoom = 1.6;
    this.dragging = false;
    this.boxStart = null;
    this.box = this.add.graphics().setDepth(600).setScrollFactor(0);
    this.edgePan = true;
    this.mouseActive = false;
    this._wasLeft = false;
    this._wasRight = false;

    this.input.on('pointerdown', (p) => {
      window.__inLog = window.__inLog || []; if (window.__inLog.length < 40) window.__inLog.push(['down', p.button, Math.round(p.x), Math.round(p.y)]);
      if (this.ultMode) { this.castUltimate(p.worldX, p.worldY); return; }
      if (this.scanMode) { this.scannerSweep(p.worldX, p.worldY); this.cancelScan(); return; }
      if (this.castMode) {
        const caster = [...this.selection].filter(u => !u.dead && (this.castMode === 'cloud' ? (u.kind === 'devourer' && u.energy >= 75) : ((u.kind === 'corsair' || u.kind === 'darkArchon') && u.energy >= 100)))[0];
        if (caster) { if (this.castMode === 'cloud') this.castCausticCloud(caster, p.worldX, p.worldY); else this.castMaelstrom(caster, p.worldX, p.worldY); }
        this.castMode = null; this.input.setDefaultCursor('default');
        return;
      }
      if (this.patrolMode) {
        if (!this._patrolAnchor) { this._patrolAnchor = { x: p.worldX, y: p.worldY }; this.events.emit('hud:alert', 'PATROL: SET END POINT'); }
        else { for (const u of this.selection) { u.patrolPoints = [this._patrolAnchor, { x: p.worldX, y: p.worldY }]; u._patrolIdx = 0; u.setOrder({ type: 'patrol' }); } this._patrolAnchor = null; this.patrolMode = false; this.input.setDefaultCursor('default'); this.audio?.move(); }
        return;
      }
      if (p.button === 2) return;
      if (this.placing) {
        this.tryPlace(p.worldX, p.worldY);
        return;
      }
      const wp0 = { x: p.worldX, y: p.worldY };
      // click select building?
      const b = this.buildingAt(wp0.x, wp0.y);
      if (b && b.team === 0) {
        this.selectBuilding(b);
        return;
      }
      this.dragStart = wp0;
      this.dragMoved = false;
    });

    this.input.on('pointermove', (p) => {
      if (this.ultMode && this.ultGhost) { this.ultGhost.setPosition(p.x, p.y); }
      if (this.placing && this.ghost) {
        this.snapGhost({ x: p.worldX, y: p.worldY });
      }
      if (!this.dragStart) return;
      const wpt = { x: p.worldX, y: p.worldY };
      if (Math.hypot(wpt.x - this.dragStart.x, wpt.y - this.dragStart.y) > 6) this.dragMoved = true;
      if (this.dragMoved) {
        const rect = this.dragBox(this.dragStart, wpt);
        this.drawBox(rect);
      }
    });

    this.input.on('pointerup', (p) => {
      window.__inLog = window.__inLog || []; if (window.__inLog.length < 40) window.__inLog.push(['up', p.button, Math.round(p.x), Math.round(p.y), !!this.dragStart, !!this.dragMoved]);
      if (p.button === 2) { this.rightClickOrder({ x: p.worldX, y: p.worldY }, p.shiftKey); return; }
      if (!this.dragStart) return;
      const wpt = { x: p.worldX, y: p.worldY };
      if (this.dragMoved) {
        const rect = this.dragBox(this.dragStart, wpt);
        this.boxSelect(rect, p.shiftKey);
      } else {
        this.clickSelect(wpt.x, wpt.y, p.shiftKey);
      }
      this.dragStart = null;
      this.box.clear();
    });

    // wheel zoom
    this.input.on('wheel', (p, go, dx, dy) => {
      const nz = Phaser.Math.Clamp(this.cameras.main.zoom - dy * 0.001, 0.8, 2.6);
      this.cameras.main.setZoom(nz);
    });

    // pointer world pos tracked for unload-at-cursor
    this.input.on('pointermove', (p) => { this.pointerPos = { x: p.worldX, y: p.worldY }; });
    // pinch zoom (touch)
    let pinch0 = 0, zoom0 = 1.6;
    this.input.on('pointerdown', (p) => { if (this.input.manager.pointersActive?.size > 1) { /* noop */ } });
    this.input.addPointer(2);

    // keyboard
    this.keys = this.input.keyboard.addKeys('W,A,S,D,Q,R,F2,F3,F4,F1,ESCAPE,SPACE,SHIFT,CTRL');
    this.input.keyboard.on('keydown-F2', () => this.assignGroup(1));
    this.input.keyboard.on('keydown-F3', () => this.assignGroup(2));
    this.input.keyboard.on('keydown-F4', () => this.assignGroup(3));
    this.input.keyboard.on('keydown-CTRL', () => { this.ctrlHeld = true; });
    this.input.keyboard.on('keyup-CTRL', () => { this.ctrlHeld = false; });
    // SC1 unload/eject: U = dropship unload at cursor position; works on selected bunker too
    this.input.keyboard.on('keydown-U', () => {
      const t = [...(this.selection || [])].find(u => u.def.transport && u.carry?.length);
      if (t) { t.unloadAt = { x: t.x, y: t.y }; t.setOrder({ type: 'unload', point: { x: this.pointerPos?.x ?? t.x + 160, y: this.pointerPos?.y ?? t.y + 120 } }); return; }
      const b = this.selectedBuilding;
      if (b && b.def.garrison && b.garrison?.length) this.emergeAll(b);
    });
    this.input.keyboard.on('keydown-ESC', () => { if (this.ultMode) { this.cancelUltimate(); return; } if (this.scanMode) { this.cancelScan(); return; } if (this.castMode) { this.castMode = null; this.input.setDefaultCursor('default'); return; } if (this.patrolMode) { this.patrolMode = false; this._patrolAnchor = null; this.input.setDefaultCursor('default'); return; } this.cancelPlacing(); this.selectBuilding(null); this.audio?.deselect(); });
    this.input.keyboard.on('keydown-A', () => { this.attackMoveMode = true; this.input.setDefaultCursor('crosshair'); });
    this.input.keyboard.on('keydown-Q', () => { this.attackMoveMode = false; this.input.setDefaultCursor('default'); });
    this.input.keyboard.on('keydown-G', () => { this.armUltimate(); });
    this.input.keyboard.on('keydown-SPACE', (e) => { if (e.preventDefault) e.preventDefault(); this.togglePause(); });
    this.input.keyboard.on('keydown-Z', () => this.setStance('aggressive'));
    this.input.keyboard.on('keydown-X', () => this.setStance('defensive'));
    this.input.keyboard.on('keydown-C', () => {
      // context: cloakers selected -> cloak toggle, otherwise hold-fire stance
      if ([...this.selection].some(u => u.def.cloak)) { this.toggleCloakSelected(); return; }
      this.setStance('hold');
    });
    this.input.keyboard.on('keydown-H', () => this.setStance('hold'));
    this.input.keyboard.on('keydown-S', (e) => {
      // SC1: S = stop; if any siege tank is selected, S = toggle siege mode
      const tanks = [...this.selection].filter(u => u.def.siege);
      if (tanks.length) { this.toggleSiegeSelected(); return; }
      if (this.selection.size) { for (const u of this.selection) { u.order = null; u.state = 'idle'; u.path = []; u.waypoints = null; u.patrolPoints = null; } this.audio?.orderPing?.(); }
    });
    this.input.keyboard.on('keydown-T', () => this.armScan());
    this.input.keyboard.on('keydown-P', () => this.armPatrol());
    this.input.keyboard.on('keydown-B', () => this.toggleBurrowSelected());
    this.input.keyboard.on('keydown-F', () => this.stimSelected());
    this.input.keyboard.on('keydown-K', () => this.toggleCloakSelected());
    this.input.keyboard.on('keydown-F9', () => this.saveBookmark());
    this.input.keyboard.on('keydown-F8', () => this.restoreBookmark());
    this.input.keyboard.on('keydown-M', () => this.summonArchon(this.keys.SHIFT?.isDown ? 'darkArchon' : 'archon'));
    this.input.keyboard.on('keydown-O', () => this.morphSelected('guardian'));
    this.input.keyboard.on('keydown-L', () => this.morphSelected('devourer'));
    this.input.keyboard.on('keydown-I', () => this.cycleIdleWorker());
    window.addEventListener('keyup', (e) => { if (/^[1-8]$/.test(e.key)) this.selectGroup(parseInt(e.key, 10)); });
    window.addEventListener('keydown', (e) => { if (e.shiftKey && /^[1-8]$/.test(e.key)) this.ctrlHeldWas = false; });
    window.addEventListener('keyup', (e) => { if (/^[1-8]$/.test(e.key) && e.shiftKey) this.assignGroup(parseInt(e.key, 10)); });

    // events from HUD
    this.events.on('hud:command', (action) => this.handleHudCommand(action));
    this.events.on('hud:place', (buildId) => this.startPlacing(buildId));
    this.events.on('hud:queueUnit', ({ buildingId, kind }) => this.queueFromHud(buildingId, kind));
    this.events.on('hud:queueResearch', ({ buildingId, techId }) => this.queueResearchFromHud(buildingId, techId));
    this.events.on('hud:camera', ({ x, y }) => this.cameras.main.centerOn(x, y));
    this.events.on('hud:attackMode', () => { this.attackMoveMode = true; this.input.setDefaultCursor('crosshair'); });
    this.events.on('hud:cancelPlace', () => this.cancelPlacing());
    this.events.on('hud:stim', () => this.stimSelected());
    this.events.on('hud:siege', () => this.toggleSiegeSelected());
    this.events.on('hud:burrow', () => this.toggleBurrowSelected());
    this.events.on('hud:patrol', () => this.armPatrol());
    this.events.on('hud:scan', () => this.armScan());
    this.events.on('hud:cloak', () => this.toggleCloakSelected());
    this.events.on('hud:mergeArchon', () => this.summonArchon('archon'));
    this.events.on('hud:mergeDarkArchon', () => this.summonArchon('darkArchon'));
    this.events.on('hud:morphGuardian', () => this.morphSelected('guardian'));
    this.events.on('hud:morphDevourer', () => this.morphSelected('devourer'));
    this.events.on('hud:maelstrom', () => this.armVoidCast());
    this.events.on('hud:caustic', () => this.armCausticCast());
    this.events.on('hud:castStorm', () => {
      const casters = [...this.selection].filter(u => u.def.castAbility === 'storm' && u.energy >= 75);
      if (!casters.length) { this.events.emit('hud:alert', 'PSI STORM: NEED 75 ENERGY'); this.audio?.error(); return; }
      const cx = [...this.selection].reduce((a, u) => a + u.x, 0) / this.selection.size;
      const cy = [...this.selection].reduce((a, u) => a + u.y, 0) / this.selection.size;
      this.castUnitPsiStorm(casters[0], cx, cy);
    });
  }

  wp(p) { return { x: p.worldX, y: p.worldY }; }

  dragBox(a, b) { return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }; }

  drawBox(r) {
    this.box.clear();
    // screen-space box: convert world to screen
    const cam = this.cameras.main;
    const sx = (r.x - cam.worldView.x) * cam.zoom, sy = (r.y - cam.worldView.y) * cam.zoom;
    this.box.lineStyle(1, 0x6ee7a0, 1);
    this.box.strokeRect(sx, sy, r.w * cam.zoom, r.h * cam.zoom);
    this.box.fillStyle(0x6ee7a0, 0.08);
    this.box.fillRect(sx, sy, r.w * cam.zoom, r.h * cam.zoom);
  }

  clickSelect(x, y, additive) {
    const rad = 14;
    let found = null, bd = rad;
    for (const u of this.units) {
      if (u.team !== 0 || u.dead) continue;
      const d = Math.hypot(u.x - x, u.y - y);
      if (d < bd) { bd = d; found = u; }
    }
    if (found) {
      if (!additive) this.clearSelection();
      this.addToSelection(found);
      this.audio?.select();
      this.audio?.selectBark([found.kind]);
    } else if (!additive) {
      const b = this.buildingAt(x, y);
      if (b && b.team === 0) this.selectBuilding(b);
      else { this.clearSelection(); this.selectBuilding(null); this.audio?.deselect(); }
    }
  }

  boxSelect(rect, additive) {
    if (!additive) this.clearSelection();
    let added = 0;
    for (const u of this.units) {
      if (u.team !== 0 || u.dead) continue;
      if (u.x >= rect.x && u.x <= rect.x + rect.w && u.y >= rect.y && u.y <= rect.y + rect.h) {
        this.addToSelection(u); added++;
      }
    }
    if (added) { this.audio?.select(); this.audio?.selectBark([...this.selection].map(u => u.kind)); }
  }

  addToSelection(u) {
    if (!this.selection.has(u)) {
      this.selection.add(u);
      u.selected = true;
      this.showSelRing(u);
      this.selectedBuilding = null;
      this.events.emit('hud:selection', this.selectionInfo());
    }
  }

  showSelRing(u) {
    if (u._ring) u._ring.destroy();
    u._ring = this.add.circle(0, 0, u.radius + 4, 0x6ee7a0, 0.12).setStrokeStyle(1, 0x6ee7a0, 0.9);
    u.container.add(u._ring);
    this.tweens.add({ targets: u._ring, alpha: { from: 0.9, to: 0.3 }, duration: 600, yoyo: true, repeat: -1 });
  }

  clearSelection() {
    for (const u of this.selection) { u.selected = false; if (u._ring) { u._ring.destroy(); u._ring = null; } }
    this.selection.clear();
    this.events.emit('hud:selection', this.selectionInfo());
  }

  selectionInfo() {
    return {
      count: this.selection.size,
      units: [...this.selection].map(u => ({ kind: u.kind, name: u.def.name, hp: Math.ceil(u.hp), maxHp: u.maxHp, shield: Math.ceil(u.shield), maxShield: u.maxShield, energy: u.maxEnergy ? Math.ceil(u.energy) : null, maxEnergy: u.maxEnergy || null, level: u.level || 0, cargo: u.cargo, sieged: !!u.sieged, burrowed: !!u.burrowed }))
    };
  }

  selectBuilding(b) {
    this.selectedBuilding = b;
    if (b) this.clearSelection();
    this.events.emit('hud:selection', { building: b ? { buildId: b.buildId, name: b.def.name, hp: Math.ceil(b.hp), maxHp: b.maxHp, queue: b.queue.map(q => ({ kind: q.kind || q.research, remaining: Math.ceil(q.remaining), label: UNITS[q.kind]?.name || TECHS[q.research]?.name })), canProduce: Object.keys(UNITS).filter(k => UNITS[k].build === b.buildId && b.canProduce(k)) } : null });
  }

  rightClickOrder(wp, shift) {
    this.cmdCount++;
    this.showOrderMarker(wp.x, wp.y);
    // SC1 shift-queue: append move/attack-move waypoints to current selection
    if (shift && this.selection.size && !this.attackMoveMode) {
      for (const u of this.selection) {
        u.waypoints = u.waypoints || [];
        u.waypoints.push({ x: wp.x, y: wp.y });
        if (u.waypoints.length > 7) u.waypoints.shift();
        if (!u.order || u.state === 'idle') u.issueMove(wp.x, wp.y, false);
      }
      this.audio?.move();
      return;
    }
    // rally point placement when a production building is selected
    if (this.selectedBuilding && this.selectedBuilding.built && this.selectedBuilding.def.rally) {
      const sb = this.selectedBuilding;
      sb.rallyPoint = { x: wp.x, y: wp.y };
      this.showRallyFlag(sb);
      this.audio?.move();
      return;
    }
    if (this.attackMoveMode) {
      const list = [...this.selection];
      if (list.length >= 3) this.issueGroupMove(list, wp.x, wp.y, true);
      else for (const u of list) u.issueMove(wp.x, wp.y, true);
      this.attackMoveMode = false;
      this.input.setDefaultCursor('default');
      this.audio?.move();
      if (this.selection.size) this.audio?.moveBark();
      return;
    }
    // gather workers?
    const workers = [...this.selection].filter(u => u.def.worker);
    if (workers.length === this.selection.size && this.selection.size > 0) {
      const foe = this.enemyUnitAt(wp.x, wp.y);
      if (foe) { workers.forEach(w => w.setOrder({ type: 'attackTarget', target: foe })); return; }
      const b = this.buildingAt(wp.x, wp.y);
      if (b && b.team === 0 && b.def.onGeyser) { workers.forEach(w => { if (b.geyser && b.geyser.workers.length < 3) { b.geyser.workers.push(w); w.gasTarget = b.geyser; w.setOrder({ type: 'harvestGas' }); } }); this.audio?.move(); return; }
      if (b && b.team === 0 && !b.built) { workers.forEach(w => w.setOrder({ type: 'build', building: b })); return; }
      // SC1 repair: own damaged completed structure
      if (b && b.team === 0 && b.built && b.hp < b.maxHp) { workers.forEach(w => w.setOrder({ type: 'repair', repairTarget: b })); this.audio?.orderPing?.(); this.events.emit('hud:alert', 'SCVs REPAIRING'); return; }
      workers.forEach(w => w.issueMove(wp.x, wp.y, false));
      this.audio?.move();
      return;
    }
    // SC1 friendly-target routing: dropship loads, bunker garrisons, medic heals
    {
      const ally = this.allyUnitAt(wp.x, wp.y);
      const ab = this.allyBuildingAt(wp.x, wp.y);
      const list = [...this.selection];
      if (ally && ally.def.transport && list.length) {
        let loaded = 0;
        for (const u of list) { if (u !== ally && !u.def.flying && this.loadUnitInto(ally, u)) loaded++; }
        if (loaded) { this.audio?.move(); this.events.emit('hud:alert', `LOADED ${ally.carry.length}/${ally.def.transport}`); return; }
      }
      if (ab && ab.def.garrison && list.length) {
        let g = 0;
        for (const u of [...list].sort((a, b) => Math.hypot(a.x - wp.x, a.y - wp.y) - Math.hypot(b.x - wp.x, b.y - wp.y))) if (this.garrisonInto(ab, u)) g++;
        if (g) { this.audio?.move(); this.events.emit('hud:alert', `GARRISONED ${ab.garrison.length}/${ab.def.garrison}`); return; }
      }
      const medics = list.filter(u => u.def.heal);
      if (ally && medics.length && medics.length === list.length) { medics.forEach(m => m.setOrder({ type: 'heal', target: ally })); this.audio?.orderPing?.(); this.events.emit('hud:alert', 'HEALING'); return; }
    }
    // combat units
    const foe = this.enemyUnitAt(wp.x, wp.y);
    const fb = this.enemyBuildingAt(wp.x, wp.y);
    const list = [...this.selection];
    if (!foe && !fb && list.length >= 3) {
      this.issueGroupMove(list, wp.x, wp.y, false);
      this.audio?.move();
      if (list.length >= 3) this.audio?.moveBark();
      return;
    }
    for (const u of this.selection) {
      if (foe) u.setOrder({ type: 'attackTarget', target: foe });
      else if (fb) u.setOrder({ type: 'attackTarget', target: fb });
      else u.issueMove(wp.x, wp.y, false);
    }
    if (foe || fb) { this.audio?.attackCmd(); this.audio?.attackBark(); } else { this.audio?.move(); this.audio?.moveBark(); }
  }

  // F1: order acknowledgment marker (SC-style green/attack click sprite)
  showOrderMarker(x, y) {
    const atk = this.attackMoveMode;
    const m = this.add.circle(x, y, atk ? 10 : 8, atk ? 0xff5c5c : 0x6ee7a0, 0.25).setStrokeStyle(1.5, atk ? 0xff8080 : 0x9fffff, 0.9).setDepth(70);
    this.tweens.add({ targets: m, scale: 1.8, alpha: 0, duration: 320, onComplete: () => m.destroy() });
    if (this.selection.size > 1) { // staggered acks for group
      let i = 0;
      for (const u of this.selection) {
        i++;
        if (i > 6) break;
        this.time.delayedCall(i * 60, () => {
          if (u.dead) return;
          const c = this.add.circle(u.x, u.y, u.radius + 3, atk ? 0xff8080 : 0xbfe0ff, 0.001).setStrokeStyle(1, 0xbfe0ff, 0.8).setDepth(70);
          this.tweens.add({ targets: c, scale: 1.6, alpha: 0, duration: 260, onComplete: () => c.destroy() });
        });
      }
    }
  }

  enemyUnitAt(x, y) {
    let best = null, bd = 18;
    for (const u of this.units) {
      if (u.team === 0 || u.dead) continue;
      if (!this.isVisible(u.x, u.y)) continue;
      const d = Math.hypot(u.x - x, u.y - y);
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  }

  allyUnitAt(x, y) {
    let best = null, bd = 20;
    for (const u of this.units) {
      if (u.team !== 0 || u.dead || u.loaded) continue;
      const d = Math.hypot(u.x - x, u.y - y);
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  }

  allyBuildingAt(x, y) {
    for (const b of this.buildings) {
      if (b.team !== 0 || b.dead) continue;
      if (Math.abs(x - b.x) < (b.def.w * TILE) / 2 + 8 && Math.abs(y - b.y) < (b.def.h * TILE) / 2 + 8) return b;
    }
    return null;
  }

  enemyBuildingAt(x, y) {
    for (const b of this.buildings) {
      if (b.team === 0 || b.dead) continue;
      if (!this.isVisible(b.x, b.y)) continue;
      if (Math.abs(x - b.x) < (b.def.w * TILE) / 2 && Math.abs(y - b.y) < (b.def.h * TILE) / 2) return b;
    }
    return null;
  }

  buildingAt(x, y) {
    for (const b of this.buildings) {
      if (b.dead) continue;
      if (Math.abs(x - b.x) < (b.def.w * TILE) / 2 && Math.abs(y - b.y) < (b.def.h * TILE) / 2) return b;
    }
    return null;
  }

  assignGroup(n) {
    if (!this.selection.size) return;
    this.controlGroups[n] = [...this.selection];
    this.events.emit('hud:groups', Object.keys(this.controlGroups).map(k => ({ n: k, count: this.controlGroups[k].length })));
    this.audio?.select();
  }

  selectGroup(n) {
    const grp = (this.controlGroups[n] || []).filter(u => !u.dead);
    if (!grp.length) return;
    this.clearSelection();
    grp.forEach(u => this.addToSelection(u));
    const cx = grp.reduce((a, u) => a + u.x, 0) / grp.length;
    const cy = grp.reduce((a, u) => a + u.y, 0) / grp.length;
    // double-tap: center camera on group (SC1 behavior)
    const now = this.gameTime;
    if (this._lastGroupTap && this._lastGroupTap.n === n && now - this._lastGroupTap.t < 0.4) {
      this.cameras.main.centerOn(cx, cy);
    }
    this._lastGroupTap = { n, t: now };
    this.audio?.select();
  }

  stimSelected() {
    for (const u of this.selection) {
      if (u.kind === 'marine' && u.hp > 20) {
        u.speed *= 1.5; u.bonusDamage += 6;
        u.hp -= 10;
        this.tweens.add({ targets: u.sprite, alpha: 0.6, duration: 200, yoyo: true, onComplete: () => { u.speed = u.def.speed * TILE * 5; u.bonusDamage -= 6; u.sprite.setAlpha(u.burrowed ? 0.35 : (u.cloaked ? 0.22 : 1)); } });
        this.tweens.add({ targets: u, duration: 14000, onComplete: () => { u.speed = u.def.speed * TILE * 5; u.bonusDamage -= 6; } });
        this.audio?.attack('stim');
      }
    }
  }

  // ---------------- SC1: siege / burrow / patrol / scan / bookmarks ----------------
  toggleSiegeSelected() {
    let did = false;
    for (const u of this.selection) {
      if (!u.def.siege) continue;
      did = true;
      if (u.sieged) u.unsiege(); else u.siegeUp();
    }
    if (!did) { this.events.emit('hud:alert', 'SIEGE: SELECT SIEGE TANKS'); return; }
    this.audio?.orderPing?.();
  }

  // SC1: manual cloak toggle for dark templar etc.
  toggleCloakSelected() {
    let did = false;
    for (const u of this.selection) {
      if (!u.def.cloak) continue;
      did = true;
      u.cloaked = !u.cloaked;
      u.sprite.setAlpha(u.cloaked ? 0.22 : 1);
      u._uncloakT = u.cloaked ? 0 : 2;
    }
    if (!did) { this.events.emit('hud:alert', 'CLOAK: SELECT DARK TEMPLARS'); this.audio?.error(); return; }
    this.audio?.psiCast?.() ; this.events.emit('hud:alert', this.selection.size && [...this.selection].some(u => u.cloaked) ? 'CLOAKED' : 'DECLOAKED');
  }

  toggleBurrowSelected() {
    let did = false;
    for (const u of this.selection) {
      if (!u.def.burrow) continue;
      did = true;
      u.burrowed = !u.burrowed;
      u.sprite.setAlpha(u.burrowed ? 0.3 : 1);
      u.container.setScale(u.burrowed ? 0.8 : 1);
      if (u.burrowed) { u.order = null; u.path = []; u.state = 'idle'; }
    }
    if (did) { this.audio?.orderPing?.(); this.events.emit('hud:alert', this.selection.size && [...this.selection].some(u => u.burrowed) ? 'BURROWED — IMMOBILE, UNSEEN' : 'UNBURROWED'); }
  }

  // ---------------- SC1: archon convergence, spire morphs, void/caustic casts ----------------
  summonArchon(darkKind = 'archon') {
    const techGate = darkKind === 'darkArchon' ? 'darkArchonMerge' : null;
    if (techGate && !this.techResearched(0, techGate)) { this.events.emit('hud:alert', 'REQUIRES CONVERGENCE RESEARCH'); this.audio?.error(); return; }
    const dts = [...this.selection].filter(u => u.kind === 'darkTemplar' && !u.dead);
    if (dts.length < 2) { this.events.emit('hud:alert', darkKind === 'archon' ? 'CONVERGENCE: SELECT 2+ DARK TEMPLARS' : 'DARK CONVERGENCE: SELECT 2+ DARK TEMPLARS'); this.audio?.error(); return; }
    let merged = 0;
    const pool = [...dts];
    while (pool.length >= 2) {
      const a = pool.shift();
      let b = pool.find(p => Math.hypot(p.x - a.x, p.y - a.y) < TILE * 2.5);
      if (!b) b = pool.shift();
      pool.splice(pool.indexOf(b), 1);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      // convergence flash: two lights spiral inward
      const g1 = this.add.circle(a.x, a.y, 10, 0x9a6bff, 0.9).setDepth(71);
      const g2 = this.add.circle(b.x, b.y, 10, 0x9a6bff, 0.9).setDepth(71);
      this.tweens.add({ targets: [g1, g2], x: mx, y: my, alpha: 0, scale: 2.4, duration: 380, onComplete: () => { g1.destroy(); g2.destroy(); } });
      for (const u of [a, b]) { u.order = null; u.path = []; u.selected = false; if (u._ring) { u._ring.destroy(); u._ring = null; } this.selection.delete(u); u.takeDamage(99999, null); }
      const arch = this.spawnUnit(0, darkKind, mx, my, { arriveReady: true });
      if (arch) {
        this.add.circle(mx, my, 26, 0xb388ff, 0.5).setDepth(72);
        this.tweens.add({ targets: this.children.list.filter(c => c.depth === 72 && c.x === mx), alpha: 0, duration: 500, onComplete: (tw) => tw.targets[0]?.destroy() });
        this.audio?.psiCast?.();
        merged++;
      }
    }
    if (merged) { this.cmdCount++; this.events.emit('hud:alert', darkKind === 'archon' ? 'ARCHON CONVERGENCE' : 'DARK ARCHON CONVERGENCE'); this.events.emit('hud:selection', this.selectionInfo()); }
  }

  morphSelected(toKind) {
    const list = [...this.selection].filter(u => u.kind === 'mutalisk' && !u.dead);
    if (!list.length) { this.events.emit('hud:alert', `MORPH: SELECT MUTALISKS`); this.audio?.error(); return; }
    const t = TECHS[toKind];
    if (!this.techResearched(0, toKind)) { this.events.emit('hud:alert', `REQUIRES ${t?.name?.toUpperCase() || toKind.toUpperCase()} RESEARCH`); this.audio?.error(); return; }
    let done = 0;
    for (const m of list) {
      if (!this.canAfford(0, t.minerals, t.gas)) break;
      this.spend(0, t.minerals, t.gas);
      const x = m.x, y = m.y;
      m.order = null; m.path = []; m.selected = false; if (m._ring) { m._ring.destroy(); m._ring = null; } this.selection.delete(m);
      const sac = this.add.circle(x, y, 14, 0xa8e06c, 0.8).setDepth(71);
      this.tweens.add({ targets: sac, scale: 2, alpha: 0, duration: 420, onComplete: () => sac.destroy() });
      m.takeDamage(99999, null);
      this.spawnUnit(0, toKind, x, y, { arriveReady: true });
      done++;
    }
    if (done) { this.cmdCount++; this.audio?.morph?.() || this.audio?.buildStart?.(); this.events.emit('hud:alert', `MORPHED ${done} ${toKind === 'guardian' ? 'GUARDIANS' : 'DEVOURERS'}`); this.events.emit('hud:selection', this.selectionInfo()); }
  }

  armVoidCast() {
    const list = [...this.selection].filter(u => (u.kind === 'corsair' || u.kind === 'darkArchon') && u.energy >= 100 && !u.dead);
    if (!list.length) { this.events.emit('hud:alert', 'MAELSTROM: NEED 100 ENERGY AIR CASTERS'); this.audio?.error(); return; }
    this.castMode = 'maelstrom';
    this._castArmTime = this.gameTime;
    this.input.setDefaultCursor('crosshair');
    this.events.emit('hud:alert', 'MAELSTROM: CLICK TARGET CLUSTER');
  }

  armCausticCast() {
    const list = [...this.selection].filter(u => u.kind === 'devourer' && u.energy >= 75 && !u.dead);
    if (!list.length) { this.events.emit('hud:alert', 'CAUSTIC MIST: NEED 75 ENERGY DEVOURERS'); this.audio?.error(); return; }
    this.castMode = 'cloud';
    this._castArmTime = this.gameTime;
    this.input.setDefaultCursor('crosshair');
    this.events.emit('hud:alert', 'CAUSTIC MIST: CLICK TARGET AREA');
  }

  castMaelstrom(caster, x, y) {
    caster.energy -= 100;
    this.audio?.psiCast?.();
    const r = 70;
    const ring = this.add.circle(x, y, r, 0x2b1a4a, 0.35).setStrokeStyle(2, 0x9a6bff, 0.9).setDepth(49);
    this.tweens.add({ targets: ring, alpha: 0.15, scale: 1.15, duration: 900, yoyo: true, repeat: 4, onComplete: () => ring.destroy() });
    let caught = 0;
    for (const u of this.units) {
      if (u.dead || u.team === caster.team || !u.flying) continue;
      if (Math.hypot(u.x - x, u.y - y) <= r) {
        u.stunTimer = Math.max(u.stunTimer || 0, 8);
        u.order = null; u.path = [];
        // grounded look while stunned
        this.tweens.add({ targets: u.sprite, angle: { from: 0, to: 25 }, duration: 300, yoyo: true, repeat: 6 });
        caught++;
      }
    }
    this.events.emit('hud:alert', caught ? `MAELSTROM — ${caught} AIRBORNE GROUNDED` : 'MAELSTROM — NO TARGETS CAUGHT');
  }

  castCausticCloud(caster, x, y) {
    caster.energy -= 75;
    this.audio?.psiCast?.();
    const cloud = this.add.circle(x, y, 46, 0x8bc34a, 0.22).setStrokeStyle(1.5, 0xcddc70, 0.7).setDepth(48);
    // drifting sickly puffs
    const puffs = [];
    for (let i = 0; i < 6; i++) {
      const pf = this.add.circle(x + (Math.random() * 60 - 30), y + (Math.random() * 60 - 30), 14 + Math.random() * 10, 0xaed58a, 0.16).setDepth(48);
      puffs.push(pf);
      this.tweens.add({ targets: pf, x: pf.x + (Math.random() * 24 - 12), y: pf.y + (Math.random() * 24 - 12), alpha: 0.05, duration: 2000, yoyo: true, repeat: 3 });
    }
    const iv = this.time.addEvent({ delay: 600, repeat: 9, callback: () => {
      for (const u of this.units) { if (!u.dead && u.team !== caster.team && !u.flying && Math.hypot(u.x - x, u.y - y) <= 52) u.takeDamage(6, caster); }
    } });
    this.tweens.add({ targets: cloud, alpha: 0, scale: 1.4, duration: 6000, onComplete: () => cloud.destroy() });
    this.time.delayedCall(6200, () => { iv.remove(); for (const pf of puffs) pf.destroy(); });
    this.events.emit('hud:alert', 'CAUSTIC MIST DEPLOYED');
  }

  // ---------------- SC1: power-up crates + critters ----------------
  updateCrates(dt) {
    if (!this.crates?.length) return;
    this.crates = this.crates.filter(c => {
      for (const u of this.units) {
        if (u.dead || u.team !== 0 || u.loaded) continue;
        if (Math.hypot(u.x - c.x, u.y - c.y) < u.radius + 12) { this.claimCrate(c, u); return false; }
      }
      return true;
    });
  }

  claimCrate(c, u) {
    c.spr.destroy();
    const pop = (txt, col) => {
      const t = this.add.text(c.x, c.y - 8, txt, { fontFamily: 'Menlo, monospace', fontSize: '11px', color: col, fontStyle: 'bold' }).setOrigin(0.5).setDepth(75);
      this.tweens.add({ targets: t, y: c.y - 30, alpha: 0, duration: 1100, onComplete: () => t.destroy() });
    };
    this.audio?.orderPing?.();
    if (c.kind === 'minerals') { const amt = 500 + ((Math.random() * 500) | 0); this.players[0].minerals += amt; pop(`+${amt} MINERALS`, '#7db4ff'); }
    else if (c.kind === 'gas') { const amt = 250 + ((Math.random() * 250) | 0); this.players[0].gas += amt; pop(`+${amt} GAS`, '#7dffd9'); }
    else if (c.kind === 'power') { this.powerSurgeUntil = this.gameTime + 30; pop('POWER SURGE — UNITS +1 ARMOR', '#ffd23f'); this.events.emit('hud:alert', 'POWER SURGE: +1 ARMOR 30s'); }
    else if (c.kind === 'spawn') { const m = this.spawnUnit(0, 'marine', c.x, c.y, { arriveReady: true }); pop(m ? 'REINFORCEMENT!' : '+200 MINERALS', '#ffd23f'); if (!m) this.players[0].minerals += 200; }
    else { this.scannerSweep(c.x, c.y); pop('DATA: AREA REVEALED', '#9fffff'); }
    this.events.emit('hud:alert', `CRATE ACQUIRED: ${c.kind.toUpperCase()}`);
    const fl = this.add.circle(c.x, c.y, 18, 0xffd23f, 0.6).setDepth(71);
    this.tweens.add({ targets: fl, scale: 2.6, alpha: 0, duration: 400, onComplete: () => fl.destroy() });
    // tick the optional objective once
    if (!this._crateCount) this._crateCount = 0;
    this._crateCount++;
    const co = this.objectives?.find(o => o.id === 'crates');
    if (co && !co.done && this._crateCount >= 3) { co.done = true; this.events.emit('hud:objectives', this.objectives); this.audio?.objective?.(); this.players[0].minerals += 300; this.events.emit('hud:alert', 'BONUS: +300 MINERALS'); }
  }

  updateCritters(dt) {
    if (!this.critters?.length) return;
    for (const cr of this.critters) {
      cr.fleeT -= dt;
      let threat = null, td = 70;
      for (const u of this.units) {
        if (u.dead || u.loaded || u.flying) continue;
        const d = Math.hypot(u.x - cr.x, u.y - cr.y);
        if (d < td) { td = d; threat = u; }
      }
      if (threat && cr.fleeT <= 0) {
        const a = Math.atan2(cr.y - threat.y, cr.x - threat.x);
        cr.vx = Math.cos(a) * 95; cr.vy = Math.sin(a) * 95; cr.fleeT = 1.4;
        if (!cr._squeaked) { cr._squeaked = true; this.audio?.bark?.('!', 1.7, 1.4); }
      } else if (!threat) {
        cr._squeaked = false;
        cr.wanderT -= dt;
        if (cr.wanderT <= 0) {
          cr.wanderT = 1.5 + Math.random() * 3;
          if (Math.random() < 0.7) { const a = Math.random() * 6.28; cr.vx = Math.cos(a) * 22; cr.vy = Math.sin(a) * 22; }
          else { cr.vx = 0; cr.vy = 0; }
        }
      }
      cr.spr.setFlipX(cr.vx < 0);
      const nx = Math.max(TILE, Math.min(PXW - TILE, cr.x + cr.vx * dt));
      const ny = Math.max(TILE, Math.min(PXH - TILE, cr.y + cr.vy * dt));
      const tx = Math.floor(nx / TILE), ty = Math.floor(ny / TILE);
      if (this.nav.solid[this.nav.idx(tx, ty)]) { cr.vx = -cr.vx; cr.vy = -cr.vy; }
      else { cr.x = nx; cr.y = ny; cr.spr.setPosition(cr.x, cr.y); }
      if (Math.abs(cr.vx) > 1) cr.spr.y += Math.sin(this.gameTime * 18 + cr.id) * 0.6; // scamper bob
    }
  }

  armScan() {
    if (!this.hasBuilding('scienceFacility', 0)) { this.events.emit('hud:alert', 'REQUIRES SCIENCE FACILITY'); this.audio?.error(); return; }
    this.scanMode = true;
    this.input.setDefaultCursor('crosshair');
    this.events.emit('hud:alert', 'SCANNER: CLICK TARGET AREA');
  }

  cancelScan() {
    this.scanMode = false;
    this.input.setDefaultCursor('default');
  }

  armPatrol() {
    const list = [...this.selection].filter(u => !u.def.worker && u.def.damage > 0);
    if (!list.length) { this.events.emit('hud:alert', 'PATROL: SELECT COMBAT UNITS'); this.audio?.error(); return; }
    this.patrolMode = true;
    this._patrolAnchor = null;
    this.input.setDefaultCursor('crosshair');
    this.events.emit('hud:alert', 'PATROL: CLICK START POINT');
  }

  saveBookmark() {
    this.cameraBookmark = { x: this.cameras.main.midPoint.x, y: this.cameras.main.midPoint.y };
    this.audio?.orderPing?.();
    this.events.emit('hud:alert', 'CAMERA BOOKMARK SAVED');
  }

  // SC1 (RoR-style): beacon ping on the minimap — world marker + chirp so allies/you can mark a spot
  cycleIdleWorker() {
    const idle = this.units.filter(u => !u.dead && u.team === 0 && u.def.worker && u.state === 'idle' && !u.order);
    if (!idle.length) { this.events.emit('hud:alert', 'NO IDLE WORKERS'); return; }
    this._idleIdx = ((this._idleIdx || 0) + 1) % idle.length;
    const u = idle[this._idleIdx];
    this.selection.clear(); this.addToSelection(u);
    this.cameras.main.centerOn(u.x, u.y);
    this.audio?.orderPing?.();
  }

  placeBeacon(x, y) {
    this.beacon = { x, y, t: this.gameTime };
    this.audio?.orderPing?.();
    this.audio?.bark?.('Marked.', 1.2, 1.15);
    // world-space pulsing marker
    const m = this.add.circle(x, y, 10, 0x9fffff, 0.25).setStrokeStyle(2, 0x9fffff, 0.95).setDepth(509);
    this.tweens.add({ targets: m, scale: 3.2, alpha: 0, duration: 900, onComplete: () => m.destroy() });
    const m2 = this.add.circle(x, y, 4, 0x9fffff, 0.9).setDepth(509);
    this.tweens.add({ targets: m2, alpha: 0, delay: 4000, duration: 1000, onComplete: () => m2.destroy() });
    this.events.emit('hud:alert', 'BEACON PLACED');
  }

  restoreBookmark() {
    if (!this.cameraBookmark) { this.events.emit('hud:alert', 'NO BOOKMARK — F9 TO SAVE'); return; }
    this.cameras.main.centerOn(this.cameraBookmark.x, this.cameraBookmark.y);
    this.audio?.select?.();
  }

  // ---------------- placing ----------------
  startPlacing(buildId) {
    const def = BUILDINGS[buildId];
    if (!def) return;
    if (!this.canAfford(0, def.minerals, def.gas)) { this.audio?.error(); return; }
    const p = this.players[0];
    const workers = [...this.selection].filter(u => u.def.worker);
    if (this.race === 'terran' && workers.length === 0) { this.audio?.error(); return; }
    this.placing = { buildId };
    this.ghost = this.add.image(0, 0, this.ghostTexKey(buildId)).setDepth(501).setAlpha(0.5);
    this.ghostValid = this.add.graphics().setDepth(502);
    this.input.setDefaultCursor('none');
  }

  ghostTexKey(buildId) {
    const team = 0;
    return this.textures.exists(`b-${buildId}-t${team}`) ? `b-${buildId}-t0` : `b-${buildId}-t2`;
  }

  snapGhost(wp) {
    if (!this.ghost) return;
    const def = BUILDINGS[this.placing.buildId];
    const gx = Math.round(wp.x / TILE) * TILE, gy = Math.round(wp.y / TILE) * TILE;
    this.ghost.setPosition(gx, gy);
    const ok = this.placementValid(this.placing.buildId, gx, gy);
    this.isValid = ok;
    this.ghostValid.clear();
    this.ghostValid.lineStyle(2, ok ? 0x6ee7a0 : 0xff4444, 0.8);
    this.ghostValid.strokeRect(gx - (def.w * TILE) / 2, gy - (def.h * TILE) / 2, def.w * TILE, def.h * TILE);
    this.ghost.setTint(ok ? 0xffffff : 0xff5555);
  }

  placementValid(buildId, x, y) {
    const def = BUILDINGS[buildId];
    const w = def.w * TILE, h = def.h * TILE;
    if (x - w / 2 < TILE || y - h / 2 < TILE || x + w / 2 > PXW - TILE || y + h / 2 > PXH - TILE) return false;
    // not on rock/minerals/geyser unless refinery type
    if (this.buildingAt(x, y)) return false;
    if (def.onGeyser) {
      const g = this.geysers.find(g => Math.hypot(g.x - x, g.y - y) < TILE * 2 && !g.building);
      return !!g;
    }
    // clearance on ground tiles
    const tx0 = Math.floor((x - w / 2) / TILE), ty0 = Math.floor((y - h / 2) / TILE);
    const tx1 = Math.ceil((x + w / 2) / TILE) - 1, ty1 = Math.ceil((y + h / 2) / TILE) - 1;
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const i = this.nav.idx(tx, ty);
      if (this.nav.solid[i]) return false;
      if (this.rockTiles.some(r => r.tx === tx && r.ty === ty)) return false;
    }
    // zerg creep requirement
    if (this.race === 'zerg' && def.creep) {
      if (!this.hasCreep(0, x, y)) return false;
    }
    // protoss power field requirement
    if (this.race === 'protoss' && !['pylon', 'nexus'].includes(buildId)) {
      const powered = this.buildings.some(b => b.team === 0 && b.def.power && !b.dead && Math.hypot(b.x - x, b.y - y) < TILE * 10);
      if (!powered) return false;
    }
    return true;
  }

  tryPlace(x, y) {
    if (!this.isValid) { this.audio?.error(); return; }
    this.cmdCount++;
    const def = BUILDINGS[this.placing.buildId];
    if (!this.canAfford(0, def.minerals, def.gas)) { this.audio?.error(); this.cancelPlacing(); return; }
    this.spend(0, def.minerals, def.gas);
    const b = new Building(this, 0, this.placing.buildId, x, y, {});
    this.buildings.push(b);
    if (this.race === 'terran') {
      const workers = [...this.selection].filter(u => u.def.worker);
      workers.forEach(w => w.setOrder({ type: 'build', building: b }));
    }
    this.audio?.buildStart();
    this.cancelPlacing();
  }

  cancelPlacing() {
    this.placing = null;
    if (this.ghost) { this.ghost.destroy(); this.ghost = null; }
    if (this.ghostValid) { this.ghostValid.clear(); }
    this.input.setDefaultCursor('default');
  }

  queueFromHud(buildingId, kind) {
    this.cmdCount++;
    const b = this.buildings.find(b => b.team === 0 && !b.dead && (b.buildId === buildingId || b.morphedTo === buildingId));
    if (!b) { this.audio?.error(); return; }
    if (b.queueUnit(kind)) this.audio?.queue(); else this.audio?.error();
  }

  queueResearchFromHud(buildingId, techId) {
    this.cmdCount++;
    const b = this.buildings.find(b => b.team === 0 && !b.dead && (b.buildId === buildingId));
    if (!b) { this.audio?.error(); return; }
    if (b.queueResearch(techId)) this.audio?.queue(); else this.audio?.error();
  }

  handleHudCommand(action) {
    if (action === 'stop') { for (const u of this.selection) { u.order = null; u.state = 'idle'; u.path = []; u.waypoints = null; u.patrolPoints = null; } }
    if (action === 'hold') { for (const u of this.selection) { u.state = 'idle'; u.order = null; } }
  }

  createEvents() {
    // camera bounds check on resize handled by RESIZE mode
  }

  // ---------------- update loop ----------------
  update(time, delta) {
    if (this.gameOver) return;
    if (this.paused) { this.updateAmbient(0); return; } // F8: world frozen, orders still work via input
    const dt = Math.min(0.05, delta / 1000) * this.timeScale;
    this.gameTime += dt;

    // in-mission radio chatter beats
    if (this.chatter && this._chatterIdx < this.chatter.length && this.gameTime >= this.chatter[this._chatterIdx].t) {
      const c = this.chatter[this._chatterIdx++];
      this.events.emit('hud:radio', c.msg, c.who);
      this.audio?.bark(c.msg, 0.75, 1.0);
    }

    // edge pan + WASD with SC-feel acceleration/inertia
    const cam = this.cameras.main;
    const maxPan = 620 / cam.zoom;
    const k = this.keys || {};
    this.panVX = this.panVX || 0; this.panVY = this.panVY || 0;
    let tx = 0, ty = 0;
    if (k.W?.isDown || k.A?.isDown || k.S?.isDown || k.D?.isDown) {
      if (k.A.isDown) tx -= maxPan;
      if (k.D.isDown) tx += maxPan;
      if (k.W.isDown) ty -= maxPan;
      if (k.S.isDown) ty += maxPan;
    }
    if (this.edgePan && this.input.activePointer?.isDown === false) {
      const p = this.input.activePointer;
      const m = 24;
      if (p) {
        if (p.x < m) tx -= maxPan;
        if (p.y < m) ty -= maxPan;
        if (p.x > this.scale.width - m) tx += maxPan;
        if (p.y > this.scale.height - m) ty += maxPan;
      }
    }
    const acc = 1 - Math.pow(0.0025, dt);   // ramp up over ~0.35s
    const dec = Math.pow(0.004, dt);        // glide to stop over ~0.5s
    this.panVX += (tx - this.panVX) * (tx !== 0 ? acc : (1 - dec));
    this.panVY += (ty - this.panVY) * (ty !== 0 ? acc : (1 - dec));
    if (Math.abs(this.panVX) < 4) this.panVX = 0;
    if (Math.abs(this.panVY) < 4) this.panVY = 0;
    cam.scrollX += this.panVX * dt;
    cam.scrollY += this.panVY * dt;
    // autoscroll to selection back (Q handled elsewhere)

    // spatial hash rebuild (separation + neighbor queries)
    this.spatial.clear();
    for (const u of this.units) if (!u.dead && !u.flying) this.spatial.insert(u);

    // SC1: warn the player when an enemy spy first penetrates toward their base
    if (!this._scoutWarned && (this.gameTime % 2) < dt) {
      const pb = this.buildings.find(b => b.team === 0 && !b.dead && b.def.primary);
      if (pb) {
        for (const u of this.units) {
          if (u.dead || u.team === 0) continue;
          if (Math.hypot(u.x - pb.x, u.y - pb.y) < TILE * 14) {
            this._scoutWarned = true;
            this.events.emit('hud:alert', '⚠ YOU ARE BEING SCOUTED', 0xffd23f);
            this.audio?.orderPing?.();
            break;
          }
        }
      }
    }

    // flow cohorts refresh (throttled; only goal keys still in use)
    this.flowRefreshTimer = (this.flowRefreshTimer ?? 0) - dt;
    if (this.flowRefreshTimer <= 0) {
      this.flowRefreshTimer = 0.5;
      for (const rec of this.flows.fields.values()) {
        if (!rec.field.valid || this.gameTime - rec.lastBuild >= 0.5) rec.field.build(rec.goalX, rec.goalY, -1, 0);
      }
    }

    // units
    for (const u of this.units) u.update(dt);
    // buildings
    for (const b of this.buildings) b.update(dt);
    // creep growth (zerg)
    this.creepTimer -= dt;
    if (this.creepTimer <= 0) {
      this.creepTimer = 0.9;
      for (const b of this.buildings) {
        if (!b.dead && b.built && b.def.creepGrowth) this.addCreep(b.team, b.x, b.y, (b.def.creepRadius || 8));
        else if (!b.dead && b.team === 1 && this.enemyRace === 'zerg' && b.buildId === 'hatchery') this.addCreep(b.team, b.x, b.y, 8);
      }
      // creep follows structures passively
      if (this.enemyRace === 'zerg') this.growCreep(1);
      if (this.race === 'zerg') this.growCreep(0);
    }

    // projectiles (spark-based)
    for (const sp of this.children.list.filter(c => c._proj && c.active)) {
      const pr = sp._proj;
      if (pr.target.dead) { sp.destroy(); continue; }
      const dx = pr.target.x - sp.x, dy = pr.target.y - sp.y;
      const d = Math.hypot(dx, dy);
      const step = pr.speed * dt;
      if (d <= step + pr.target.radius) { this.applyHit(pr.target, pr.damage, pr.splash, pr.attacker); sp.destroy(); continue; }
      sp.x += (dx / d) * step; sp.y += (dy / d) * step;
    }

    // SC1 spider mines + scanner cooldown + temp reveal expiry
    this.updateSpiderMines(dt);
    this.updateCrates(dt);
    this.updateCritters(dt);
    if (this._scanCd > 0) this._scanCd -= dt;
    if (this._tempReveals?.length) {
      this._tempReveals = this._tempReveals.filter(rv => {
        if (this.gameTime >= rv.until) { for (const i of rv.seenCells) if (this.seen[i] === 2) this.seen[i] = 1; return false; }
        return true;
      });
    }

    // fog update throttled
    this.fogTimer -= dt;
    if (this.fogTimer <= 0) { this.fogTimer = 0.25; this.updateFog(); this.updateStealthVisibility(); }

    // camera shake (decays)
    if (this._shake.t > 0) {
      this._shake.t -= dt;
      const m = this._shake.mag;
      this._shakeCam.x = (Math.random() * 2 - 1) * m;
      this._shakeCam.y = (Math.random() * 2 - 1) * m;
      cam.scrollX += this._shakeCam.x; cam.scrollY += this._shakeCam.y;
      if (this._shake.t <= 0) { this._shake.mag = 0; cam.scrollX -= this._shakeCam.x; cam.scrollY -= this._shakeCam.y; }
    }

    // ultimate energy charge + recording + objectives
    const engaged = this.units.filter(u => !u.dead && u.target && !u.target.dead);
    if (engaged.length >= 6) this.audio?.markHeavyCombat();
    const combatNow = this.units.some(u => !u.dead && u.team === 0 && u.target && !u.target.dead) || this.units.some(u => !u.dead && u.team === 1 && Math.abs(u.x - cam.midPoint.x) < 400);
    this.audio?.setCombat(combatNow);
    this.ultimateEnergy = Math.min(this.ultimateMax, this.ultimateEnergy + dt * (5 + this.units.filter(u => !u.dead && u.team === 0 && !u.def.worker).length * 0.25));
    // SC1 power-up crate surge: +1 armor to all own combat units while active
    if (this.powerSurgeUntil && this.gameTime < this.powerSurgeUntil && !this._surgeApplied) {
      this._surgeApplied = true;
      for (const u of this.units) if (!u.dead && u.team === 0 && !u.def.worker) { u.bonusArmor += 1; u.sprite.setTint(0xfff3c4); }
    } else if (this._surgeApplied && this.gameTime >= this.powerSurgeUntil) {
      this._surgeApplied = false;
      for (const u of this.units) if (!u.dead && u.team === 0 && !u.def.worker) { u.bonusArmor = Math.max(0, u.bonusArmor - 1); if (!u.burrowed && !u.cloaked) u.sprite.clearTint(); }
    }
    this._recTimer -= dt;
    if (this._recTimer <= 0) {
      this._recTimer = 1;
      const fr = { t: Math.round(this.gameTime), u: [], b: [] };
      for (const u of this.units) if (!u.dead) fr.u.push([Math.round(u.x), Math.round(u.y), u.team]);
      for (const b of this.buildings) if (!b.dead) fr.b.push([Math.round(b.x), Math.round(b.y), b.team, !!b.built]);
      this.record.frames.push(fr);
      if (this.record.frames.length > 900) this.record.frames.shift();
    }

    // hold-the-line objective countdown
    if (this._holdUntil != null && !this.gameOver) {
      const remain = Math.ceil(this._holdUntil - this.gameTime);
      if (remain <= 0 && !this._holdDone) {
        this._holdDone = true;
        const k = this.objectives.find(o => o.id === 'hold'); if (k) k.done = true;
        this.events.emit('hud:objectives', this.objectives);
        this.audio?.objective();
        if (!this.mods.boss) this.endGame('victory');
        else { this.events.emit('hud:alert', 'HOLD COMPLETE — SLAY THE CHAMPION'); this.mods.boss = false; }
      }
    }

    // enemy AI
    this.updateAI(dt);
    this.updateThreats(dt);
    this.updateAmbient(dt);
    this.updateLighting(dt);
    this.updateTutorial();

    // income trickle from assigned gas (simplification: gas income via worker returns only)
    // supply check
    for (const b of this.buildings) { if (b.team === 1 && b.built && this.enemyRace === 'zerg' && !b._overlordChecked) { b._overlordChecked = true; } }
    // zerg needs overlords
    if (this.players[1].supplyUsed >= this.players[1].supplyCap - 1) {
      const pool = this.buildings.find(b => b.team === 1 && b.buildId === 'hatchery' && b.queue.length === 0);
      if (pool) pool.queueUnit('overlord');
    }
    if (this.players[0].supplyUsed >= this.players[0].supplyCap - 1 && this.race === 'zerg') {
      const pool = this.buildings.find(b => b.team === 0 && b.buildId === 'hatchery' && b.queue.length === 0);
      if (pool && this.canAfford(0, UNITS.overlord.minerals)) pool.queueUnit('overlord');
    }

    this.events.emit('hud:tick');
  }

  growCreep(team) {
    const { cells, ctx } = this.creepCanvases[team];
    let changed = false;
    const next = Uint8Array.from(cells);
    for (let ty = 1; ty < MAP_H - 1; ty++) {
      for (let tx = 1; tx < MAP_W - 1; tx++) {
        const i = ty * MAP_W + tx;
        if (cells[i]) continue;
        if (cells[i - 1] || cells[i + 1] || cells[i - MAP_W] || cells[i + MAP_W]) {
          if (Math.random() < 0.06) {
            // don't creep over rocks/water handled downstream in placement check
            next[i] = 1;
            ctx.fillStyle = team === 0 ? '#2f4e8f' : '#5a2340';
            ctx.fillRect(tx, ty, 1, 1);
            changed = true;
          }
        }
      }
    }
    if (changed) { this.creepCanvases[team].cells = next; this.textures.get(`creep-t${team}`).refresh(); }
  }

  // ---------------- AI ----------------
  updateAI(dt) {
    const s = this.aiState;
    const team = 1;
    const p = this.players[1];
    const prof = this.aiProfile || this.aiProfileFallback();
    p.minerals += dt * prof.income;
    const gasRigs = this.buildings.filter(b => b.team === 1 && !b.dead && b.built && (b.buildId === 'extractor' || b.buildId === 'assimilator' || b.buildId === 'refinery'));
    p.gas += dt * Math.min(2.5, gasRigs.length * prof.income * 0.35);

    s.lastThink -= dt;
    if (s.lastThink > 0) return;
    s.lastThink = 1.0;

    const race = this.enemyRace;
    const eb = this.buildings.filter(b => b.team === team && !b.dead && b.built);
    const workerCount = this.units.filter(u => !u.dead && u.team === team && u.def.worker).length;

    // keep workers up to profile cap
    if (workerCount < prof.workers && p.minerals >= 50 && p.supplyUsed + 1 <= p.supplyCap) {
      const cc = eb.find(b => b.def.produces?.includes(race === 'zerg' ? 'drone' : race === 'protoss' ? 'probe' : 'scv'));
      cc?.queueUnit(race === 'zerg' ? 'drone' : race === 'protoss' ? 'probe' : 'scv');
    }
    // assign idle workers to harvest
    for (const w of this.units) { if (!w.dead && w.team === team && w.def.worker && w.state === 'idle') w.setOrder({ type: 'harvest' }); }

    // build structure needs
    const want = (bid) => BUILDINGS[bid];
    const buildIfPossible = (bid) => {
      const def = BUILDINGS[bid];
      if (!def) return;
      if (this.hasBuilding(bid, team)) return;
      if (!this.canAfford(team, def.minerals, def.gas)) return;
      if (def.requires && !def.requires.every(r => this.hasBuilding(r, team))) return;
      if (def.race !== race) return;
      // placement near base (geyser rigs snap to actual geysers)
      const base = this.buildings.find(b => b.team === team && b.def.primary);
      if (!base) return;
      const spots = def.onGeyser
        ? this.geysers.filter(g => !g.building && Math.hypot(g.x - base.x, g.y - base.y) < TILE * 30).map(g => [Math.round((g.x - base.x) / TILE), Math.round((g.y - base.y) / TILE)])
        : [[-4, 3], [3, -4], [-5, -2], [2, 5], [-2, -5], [5, 2], [-6, 4], [4, -6], [0, 6], [-7, 0]];
      for (const [ox, oy] of spots) {
        const x = base.x + ox * TILE, y = base.y + oy * TILE;
        if (this.placementValidAI(bid, x, y, team)) {
          this.spend(team, def.minerals, def.gas);
          const b = new Building(this, team, bid, x, y, { instant: race !== 'terran' });
          this.buildings.push(b);
          if (race === 'zerg') this.addCreep(team, x, y, 4);
          if (race === 'protoss') { }
          if (race === 'terran') {
            const w = this.units.find(u => !u.dead && u.team === team && u.def.worker && u.state !== 'build');
            if (w) w.setOrder({ type: 'build', building: b });
          }
          return;
        }
      }
    };
    this.placementValidAI = (buildId, x, y, team) => {
      const def = BUILDINGS[buildId];
      const w = def.w * TILE, h = def.h * TILE;
      if (x - w / 2 < TILE || y - h / 2 < TILE || x + w / 2 > PXW - TILE || y + h / 2 > PXH - TILE) return false;
      if (this.buildingAt(x, y)) return false;
      if (def.onGeyser) { const g = this.geysers.find(g => Math.hypot(g.x - x, g.y - y) < TILE * 2 && !g.building); return !!g; }
      if (race === 'zerg' && def.creep) { if (!this.hasCreep(team, x, y)) return false; }
      if (race === 'protoss' && !['pylon', 'nexus'].includes(buildId)) {
        const powered = this.buildings.some(b => b.team === team && b.def.power && !b.dead && Math.hypot(b.x - x, b.y - y) < TILE * 10);
        if (!powered) return false;
      }
      if (race === 'protoss' && this.units.some(u => u.team === team && u.def.worker)) {
        const py = this.units.find(u => u.team === team && u.def.worker && u.state !== 'build');
        if (py) py.setOrder({ type: 'move', point: { x, y } });
      }
      const tx0 = Math.floor((x - w / 2) / TILE), ty0 = Math.floor((y - h / 2) / TILE);
      const tx1 = Math.ceil((x + w / 2) / TILE) - 1, ty1 = Math.ceil((y + h / 2) / TILE) - 1;
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
        if (this.nav.solid[this.nav.idx(tx, ty)]) return false;
        if (this.rockTiles.some(r => r.tx === tx && r.ty === ty)) return false;
      }
      return true;
    };

    // build order
    if (race === 'zerg') {
      if (!this.hasBuilding('evolutionChamber', team)) buildIfPossible('evolutionChamber');
      if (this.hasBuilding('hatchery', team)) {
        if (!this.hasBuilding('spawningPool', team)) buildIfPossible('spawningPool');
        if (!this.hasBuilding('extractor', team) && this.gameTime > 35) buildIfPossible('extractor');
        if (!this.hasBuilding('hydraliskDen', team) && this.gameTime > 40) buildIfPossible('hydraliskDen');
        if (!this.hasBuilding('spire', team) && this.gameTime > 80) buildIfPossible('spire');
      }
    } else if (race === 'protoss') {
      if (!this.hasBuilding('pylon', team)) buildIfPossible('pylon');
      if (!this.hasBuilding('assimilator', team)) buildIfPossible('assimilator');
      if (!this.hasBuilding('cyberneticsCore', team) && this.gameTime > 30) buildIfPossible('cyberneticsCore');
      if (!this.hasBuilding('roboticsFacility', team) && this.gameTime > 70) buildIfPossible('roboticsFacility');
      if (!this.hasBuilding('photonCannon', team) && this.gameTime > 60) buildIfPossible('photonCannon');
      if (!this.hasBuilding('stargate', team) && this.gameTime > 140) buildIfPossible('stargate');
    } else {
      if (!this.hasBuilding('supplyDepot', team) && p.supplyCap - p.supplyUsed < 4) buildIfPossible('supplyDepot');
      if (!this.hasBuilding('refinery', team)) buildIfPossible('refinery');
      if (!this.hasBuilding('academy', team) && this.gameTime > 45) buildIfPossible('academy');
      if (!this.hasBuilding('engineeringBay', team) && this.gameTime > 55) buildIfPossible('engineeringBay');
      if (!this.hasBuilding('factory', team) && this.gameTime > 70) buildIfPossible('factory');
      if (!this.hasBuilding('starport', team) && this.gameTime > 130) buildIfPossible('starport');
      if (!this.hasBuilding('missileTurret', team) && this.gameTime > 60) buildIfPossible('missileTurret');
    }

    // ---- SC1-style natural expansion at 3:00 when economy allows ----
    if (!s.expanded && this.gameTime > 170 && p.minerals > 400) {
      const prim = RACE_INFO[race].primary;
      const primaries = this.buildings.filter(b => b.team === team && !b.dead && b.buildId === prim);
      if (primaries.length < 2) {
        const nat = { x: PXW * (team === 1 ? 0.66 : 0.34), y: PXH * (team === 1 ? 0.62 : 0.38) };
        if (this.placementValidAI(prim, nat.x, nat.y, team)) {
          s.expanded = true;
          this.spend(team, BUILDINGS[prim].minerals, BUILDINGS[prim].gas || 0);
          const xb = new Building(this, team, prim, nat.x, nat.y, { instant: race !== 'terran' });
          this.buildings.push(xb);
          if (race === 'zerg') this.addCreep(team, nat.x, nat.y, 8);
          this.players[team].supplyCap = this.computeSupplyCap(team);
          const idleW = this.units.filter(u => !u.dead && u.team === team && u.def.worker);
          idleW.slice(0, 4).forEach(w => { w.harvestTarget = null; w.setOrder({ type: 'harvest' }); });
          this.events.emit('hud:alert', 'SCOUT REPORT: ENEMY EXPANDING');
        }
      }
    }

    // ---- SC1-style research agenda: labs continuously upgrade the army ----
    const agenda = race === 'terran'
      ? ['terranInfantryWeapons1', 'terranInfantryArmor1', 'combatMedics', 'terranInfantryWeapons2', 'vehiclePlating1', 'terranInfantryArmor2', 'terranInfantryWeapons3']
      : race === 'zerg'
        ? ['zergMeleeAttacks1', 'zergCarapace1', 'lurkerEgg', 'greaterSpire']
        : ['protossGroundWeapons1', 'protossGroundPlating1', 'zealotSpeed', 'dragoonRange'];
    for (const tid of agenda) {
      const t = TECHS[tid];
      if (!t || this.techResearched(team, tid)) continue;
      const lab = eb.find(b => b.buildId === t.at && b.queue.length === 0);
      if (lab && this.canAfford(team, t.minerals, t.gas) && (!t.requiresTech || this.techResearched(team, t.requiresTech))) { lab.queueResearch(tid); break; }
    }

    // ---- hill-climbing: evaluate army value vs player ----
    // supply-block alert + idle worker census for HUD
    const pMine = this.players[0];
    const idleWorkers = this.units.filter(u => !u.dead && u.team === 0 && u.def.worker && u.state === 'idle' && !u.order).length;
    pMine.idleWorkers = idleWorkers;
    const blockedProducers = this.buildings.filter(b => b.team === 0 && b.built && !b.dead && b.def.produces?.length && b.queue.length > 0 && pMine.supplyUsed >= pMine.supplyCap);
    if (blockedProducers.length && !pMine._supAlertShown) {
      pMine._supAlertShown = true;
      this.events.emit('hud:alert', this.race === 'zerg' ? 'NEED MORE OVERLORDS' : 'SUPPLY BLOCKED');
      this.audio?.error();
      this.audio?.adminBark();
      this.time.delayedCall(15000, () => { pMine._supAlertShown = false; });
    }
    if (idleWorkers >= 2 && !pMine._idleAlertShown) {
      pMine._idleAlertShown = true;
      this.events.emit('hud:alert', `${idleWorkers} WORKERS IDLE`);
      this.time.delayedCall(12000, () => { pMine._idleAlertShown = false; });
    }

    const value = (u) => (UNITS[u.kind]?.minerals || 50) + (UNITS[u.kind]?.gas || 0) * 1.4;
    const army = this.units.filter(u => !u.dead && u.team === team && !u.def.worker && u.kind !== 'overlord');
    const playerArmy = this.units.filter(u => !u.dead && u.team === 0 && !u.def.worker);
    const myValue = army.reduce((a, u) => a + value(u), 0) + eb.reduce((a, b) => a + (b.def.minerals || 0) * 0.3, 0);
    const foeValue = playerArmy.reduce((a, u) => a + value(u), 0) + 400; // base insurance
    s.myValue = myValue; s.foeValue = foeValue;

    // counter-production: observe visible enemy composition and bias training
    if (!s.counter) s.counter = { air: 0, ground: 0 };
    const visibleFoe = this.units.filter(u => !u.dead && u.team === 0 && !u.def.worker && this.isVisible(u.x, u.y));
    for (const vf of visibleFoe) { if (vf.flying) s.counter.air++; else s.counter.ground++; }

    // army production with counters
    const armyCap = prof.armyCap;
    if (army.length < armyCap) {
      for (const b of eb) {
        if (b.queue.length >= 2) continue;
        let kinds = (b.def.produces || []).filter(k => b.canProduce(k));
        if (!kinds.length) continue;
        // score kinds: counter bias + supply efficiency
        kinds = kinds.sort((a, c) => {
          const da = UNITS[a], dc = UNITS[c];
          const anti = (k) => {
            const d = UNITS[k];
            let sc = 0;
            if (d.targets === 'air' || d.targets === 'both') sc += s.counter.air * 2.2;
            if (d.targets !== 'air') sc += s.counter.ground * 1.4;
            if (d.splash) sc += s.counter.ground * 0.8; // anti-cluster
            return sc;
          };
          const effA = anti(a) / ((da.minerals + (da.gas || 0) * 1.4) + 1);
          const effC = anti(c) / ((dc.minerals + (dc.gas || 0) * 1.4) + 1);
          return effC - effA;
        });
        for (const k of kinds) {
          const def = UNITS[k];
          if (p.minerals >= def.minerals + 40 && p.gas >= (def.gas || 0)) { b.queueUnit(k); break; }
        }
      }
    }

    // SC1 drop ops (terran): load idle dropships with infantry, fly behind lines, unload into the fight with fighter escort
    if (race === 'terran') {
      const dss = army.filter(u => u.def.transport && !u.dead && (!u.carry || !u.carry.length) && !u.order);
      const medicUnits = army.filter(u => u.def.heal && !u.dead);
      if (dss.length && this.gameTime > 150) {
        const targets = this.units.filter(u => u.team === 0 && u.def.worker && this.isVisible(u.x, u.y)).slice(0, 4);
        const dropTgt = targets.length ? { x: targets[0].x, y: targets[0].y } : (s.lastSeenPlayerPos ? { x: s.lastSeenPlayerPos.x + 100, y: s.lastSeenPlayerPos.y + 60 } : null);
        if (dropTgt) {
          // gather an infantry squad to load
          const foot = army.filter(u => !u.dead && !u.flying && !u.def.worker && !u.def.transport && Math.hypot(u.x - dss[0].x, u.y - dss[0].y) < TILE * 14).slice(0, 8);
          if (foot.length >= 2 || medicUnits.length) {
            for (const ds of dss) {
              const squad = foot.splice(0, Math.min(foot.length, ds.def.transport - (medicUnits.length ? 1 : 0)));
              if (medicUnits.length) { const md = medicUnits.shift(); if (md) squad.push(md); }
              if (!squad.length) break;
              squad.forEach(m => { if (!this.loadUnitInto(ds, m)) { /* full */ } });
              ds.setOrder({ type: 'unload', point: { x: dropTgt.x + Math.random() * 80 - 40, y: dropTgt.y + Math.random() * 60 - 30 } });
              ds._dropAt = dropTgt;
              // fighter escort follows the dropship to its drop zone
              for (const esc of army.filter(u => u.flying && !u.def.transport && !u.dead)) esc.setOrder({ type: 'attackMove', point: { x: dropTgt.x, y: dropTgt.y } });
              this.events.emit('hud:alert', '⚠ ENEMY DROP INBOUND', 0xff5c5c);
              this.audio?.underAttackBark?.();
              break; // one coordinated drop per think
            }
          }
        }
      }
    }

    // ---- harass squad: fast units poke the player economy ----
    if (!s.harvestSquad) s.harvestSquad = [];
    s.harassAt = (s.harassAt ?? 75) - 1;
    const fast = army.filter(u => u.def.speed >= 1.05 || u.flying);
    if (s.harassAt <= 0 && fast.length >= 3 && myValue > foeValue * 0.9) {
      s.harassAt = prof.harassAt;
      const squad = fast.slice(0, 3);
      s.harvestSquad = squad;
      // attack-move at player's visible miners or natural expansion direction
      const victim = this.units.find(u => u.team === 0 && u.def.worker && this.isVisible(u.x, u.y));
      const tgt = victim ? { x: victim.x, y: victim.y } : { x: PXW * 0.30 + Math.random() * 80, y: PXH * 0.32 + Math.random() * 80 };
      squad.forEach(u => u.issueMove(tgt.x, tgt.y, true));
    } else {
      s.harvestSquad = s.harvestSquad.filter(u => !u.dead);
    }

    // ---- scouts: drop an overlord/scout toward player base periodically ----
    s.scoutAt = (s.scoutAt ?? 40) - 1;
    if (s.scoutAt <= 0) {
      s.scoutAt = 55;
      if (race === 'zerg') {
        const ov = army.find(u => u.kind === 'overlord');
        if (ov) { ov.issueMove(PXW * 0.25, PXH * 0.28, false); }
        else { const pool = eb.find(b => b.buildId === 'hatchery' && b.queue.length === 0); pool?.queueUnit('overlord'); }
      } else {
        const sc = army.find(u => !u.def.worker && (u.flying || u.kind === 'vulture' || u.kind === 'scout'));
        sc?.issueMove(PXW * 0.22 + Math.random() * 100, PXH * 0.22 + Math.random() * 100, false);
      }
    }

    // ---- main attack: hill-climb on value advantage ----
    const ready = army.filter(u => !s.harvestSquad.includes(u) && !(u.loaded) && !(u.def.transport && u.carry?.length));
    const advantage = myValue / Math.max(1, foeValue);
    const threshold = prof.threshold;
    const aggro = s.aggroUntil > this.gameTime;
    // BRUTAL early rush: commit a first wave early even without advantage
    const rushEarly = prof.rushAt < 1e8 && this.gameTime > prof.rushAt && !s.rushed;
    s.nextAttackAt -= 1;
    if ((ready.length >= 6 && (advantage >= threshold || s.nextAttackAt <= -20)) || (aggro && ready.length > 5) || (rushEarly && ready.length >= 4)) {
      if (rushEarly) s.rushed = true;
      s.nextAttackAt = prof.attackGap;
      const tgt = s.lastSeenPlayerPos || { x: PXW * 0.2, y: PXH * 0.2 };
      // split force: main push + flank
      const flank = ready.slice(Math.ceil(ready.length * prof.flankSplit));
      for (const u of ready.slice(0, Math.ceil(ready.length * prof.flankSplit))) u.issueMove(tgt.x + Math.random() * 60 - 30, tgt.y + Math.random() * 60 - 30, true);
      for (const u of flank) u.issueMove(tgt.x + 140 + Math.random() * 60, tgt.y - 120 + Math.random() * 60, true);
      s.aggroUntil = 0;
    }
    // retreat when hopelessly outvalued (fight another day)
    if (advantage < 0.55 && ready.length > 3 && s.myDrop < (this.gameTime | 0) / 30) {
      s.myDrop = (this.gameTime | 0) / 30;
      const base = this.buildings.find(b => b.team === team && b.def.primary);
      if (base) ready.slice(0, 6).forEach(u => { if (!this.isVisible(u.x, u.y) || Math.random() < 0.5) u.issueMove(base.x + Math.random() * 60 - 30, base.y + Math.random() * 60 - 30, false); });
    }
    // defenders: units near base under attack already handled by auto-acquire
  }

  endGame(result) {
    if (this.gameOver) return;
    this.gameOver = result;
    // F9: cinematic beat — slow-mo + zoom on the kill shot
    const last = this.units.filter(u => !u.dead && u.team === (result === 'victory' ? 1 : 0))[0]
      || this.buildings.filter(b => !b.dead && b.team === (result === 'victory' ? 1 : 0))[0];
    if (last) {
      this.cameras.main.centerOn(last.x, last.y);
      this.tweens.add({ targets: this.cameras.main, zoom: this.cameras.main.zoom * 1.5, duration: 900, ease: 'Sine.easeInOut' });
    }
    this.tweens.add({ targets: this, timeScale: 0.25, duration: 500, onComplete: () => {
      this.audio?.gameEnd(result === 'victory');
      this.events.emit('hud:cinema', result);
      this.tweens.add({ targets: this, timeScale: 0, delay: 700, duration: 300, onComplete: () => this.showGameOverBoard(result) });
    } });
    // F8: persist replay + apm + campaign progression
    try {
      const apm = Math.round((this.cmdCount / Math.max(30, this.gameTime)) * 60);
      this.record.apm = apm;
      this.record.result = result;
      this.record.time = Math.round(this.gameTime);
      this.record.min = this.minerals.map(m => [Math.round(m.x), Math.round(m.y)]);
      localStorage.setItem('scc.replay.last', JSON.stringify(this.record));
    } catch (e) { /* storage full/private */ }
    if (result === 'victory' && this.campaign) {
      const m = this.campMissionNum();
      const reward = 400 + m * 150 + Math.round((this.players[0].minerals || 0) * 0.1);
      this.campaign.credits += reward;
      if (this.campaign.mission === m) this.campaign.mission = Math.min(MISSIONS.length, m + 1);
      saveCampaign(this.campaign);
      this.lastReward = reward;
    }
  }

  showGameOverBoard(result) {
    // attach debrief line for the game-over board
    const n = this.campMissionNum();
    this.debriefLine = (result === 'victory' ? DEBRIEFS_WIN[n] : DEBRIEFS_LOSE[n]) || null;
    this.events.emit('hud:gameover', result);
  }

  campMissionNum() { return (this.mission && this.mission.n) || 1; }

  aiProfileFallback() {
    return { income: 1.1, armyCap: 18, threshold: 1.15, attackGap: 45, harassAt: 65, rushBuilds: [], rushAt: 1e9, workers: 12, flankSplit: 0.7 };
  }

  // SC1 targeting rules: respect def.targets (air-only units never auto-acquire ground and vice versa)
  acquireFor(unit, range) {
    const t = unit.def.targets || 'both';
    return this.findNearestEnemy(unit.x, unit.y, range, t === 'air' ? true : undefined, t === 'air' ? false : t === 'ground' ? true : undefined);
  }

  findNearestEnemy(x, y, range, forAir, forGround) {
    let best = null, bd = range;
    for (const u of this.units) {
      if (u.dead || u.team === undefined) continue;
      if (u.team === (forAir === true ? 1 : 0) && forAir === undefined) { /* keep going */ }
      const hostile = this.isHostileTeam(u.team);
      if (!hostile) continue;
      if (forAir === false && u.flying) continue;
      if (forGround === false && !u.flying) continue;
      const d = Math.hypot(u.x - x, u.y - y);
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  }

  isHostileTeam(team) { return team !== 0; }
}

function nextObjId() { return (nextObjId._n = (nextObjId._n || 1000) + 1); }
