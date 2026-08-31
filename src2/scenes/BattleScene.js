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
    // ---- mission objectives (F10) ----
    this.objectives = this.buildObjectives();
    this.mods = this.applyMissionMods();
    this.audio = new Audio2(this);
    this.audio.setRace(this.race);
    // start music after first user gesture (title already had one)
    this.input.once('pointerdown', () => this.audio.startMusic());
    this.input.keyboard.once('keydown', () => this.audio.startMusic());
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
  }

  // ---------------- mission objectives & modifiers (F10/F4) ----------------
  buildObjectives() {
    const objs = [{ id: 'kill', text: 'Destroy the enemy base', done: false }];
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
      // incoming streak
      const streak = this.add.rectangle(wx, wy - 500, 4, 500, 0xffd27a, 0.5).setDepth(506);
      this.tweens.add({ targets: streak, y: wy - 250, alpha: 0.1, duration: 2800, ease: 'Cubic.easeIn' });
      this.time.delayedCall(2900, () => {
        streak.destroy();
        this.audio?.nukeImpact();
        this.shake(14, 0.7);
        const r = 130;
        const boom = this.add.circle(wx, wy, r, 0xffd27a, 0.85).setDepth(500);
        this.tweens.add({ targets: boom, scale: 2.4, alpha: 0, duration: 900, onComplete: () => boom.destroy() });
        const ring = this.add.circle(wx, wy, r, 0xff5c2e, 0).setStrokeStyle(6, 0xff9c3c, 0.9).setDepth(500);
        this.tweens.add({ targets: ring, scale: 3, alpha: 0, duration: 1100, onComplete: () => ring.destroy() });
        this.add.image(wx, wy, 'scorch').setDepth(6).setAlpha(0.7).setScale(4);
        for (const u of this.units) { if (!u.dead && Math.hypot(u.x - wx, u.y - wy) <= r + u.radius) u.takeDamage(400); }
        for (const b of this.buildings) { if (!b.dead && b.team !== 0 && Math.hypot(b.x - wx, b.y - wy) <= r + 24) b.takeDamage(350); }
      });
    } else if (kind === 'storm') {
      this.audio?.psiCast();
      const r = 95;
      const storm = this.add.circle(wx, wy, r, 0xc060ff, 0.18).setStrokeStyle(2, 0xe0a0ff, 0.8).setDepth(49);
      this.tweens.add({ targets: storm, alpha: 0, duration: 4200, onComplete: () => storm.destroy() });
      let ticks = 0;
      const iv = this.time.addEvent({ delay: 500, repeat: 8, callback: () => {
        ticks++;
        this.audio?.zap();
        for (let i = 0; i < 5; i++) {
          const a = Math.random() * Math.PI * 2, rr = Math.random() * r;
          const bx = wx + Math.cos(a) * rr, by = wy + Math.sin(a) * rr;
          const zap = this.add.graphics().setDepth(50);
          zap.lineStyle(2, 0xe0a0ff, 0.9);
          zap.lineBetween(bx, by - 26, bx + (Math.random() * 14 - 7), by + (Math.random() * 14 - 7));
          this.tweens.add({ targets: zap, alpha: 0, duration: 180, onComplete: () => zap.destroy() });
        }
        for (const u of this.units) { if (!u.dead && u.team !== 0 && Math.hypot(u.x - wx, u.y - wy) <= r) u.takeDamage(22); }
        for (const b of this.buildings) { if (!b.dead && b.team !== 0 && Math.hypot(b.x - wx, b.y - wy) <= r + 16) b.takeDamage(14); }
      } });
      this.time.delayedCall(4600, () => iv.remove());
      this.events.emit('hud:alert', 'PSIONIC STORM');
    } else if (kind === 'surge') {
      // zerg: brood surge — spawn extra zerglings at target + speed/attack buff to nearby swarm
      const pool = this.units.filter(u => !u.dead && u.team === 0 && !u.def.worker);
      for (const u of pool) { if (Math.hypot(u.x - wx, u.y - wy) < 320) { u.bonusDamage += 4; u.speed *= 1.25; this.tweens.add({ targets: u.sprite, alpha: 0.55, duration: 240, yoyo: true }); this.time.delayedCall(12000, () => { if (!u.dead) { u.bonusDamage -= 4; u.speed /= 1.25; } }); } }
      for (let i = 0; i < 8; i++) { const u = this.spawnUnit(0, 'zergling', wx + Math.random() * 80 - 40, wy + Math.random() * 80 - 40, { arriveReady: true }); if (u) u.issueMove(wx + Math.random() * 60 - 30, wy + Math.random() * 60 - 30, true); }
      const pulse = this.add.circle(wx, wy, 40, 0xff7b2e, 0.4).setDepth(49);
      this.tweens.add({ targets: pulse, scale: 8, alpha: 0, duration: 800, onComplete: () => pulse.destroy() });
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
    this.fogImg.setOrigin(0.5).setScale(TILE).setDepth(500).setAlpha(0.88);
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
    visCtx.fillStyle = 'rgba(70,75,90,1)';
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
    for (const u of this.units) { if (!u.dead) stamp(u.x, u.y, u.def.sight); }
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
    for (const u of this.units) { if (!u.dead && Math.hypot(u.x - x, u.y - y) < u.def.sight * TILE) return true; }
    for (const b of this.buildings) { if (!b.dead && Math.hypot(b.x - x, b.y - y) < (b.def.sight || 5) * TILE) return true; }
    return false;
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
    if (!opts.arriveReady && def.worker === false && !def.weaponless) u.setOrder({ type: 'attackMove', point: team === 1 ? { x: PXW * 0.15, y: PXH * 0.15 } : { x: PXW * 0.85, y: PXH * 0.85 } });
    return u;
  }

  spawnProjectile({ from, target, damage, splash, team, kind, speed }) {
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
      sp._proj = { target, damage, splash, speed, team };
    }
  }

  applyHit(target, damage, splash) {
    if (target.dead) return;
    target.takeDamage(damage);
    const tx = target.x, ty = target.y;
    if (splash > 0) {
      if (splash >= 20) this.shake(6, 0.35);
      const boom = this.add.circle(tx, ty, splash, 0xff9c3c, 0.25).setDepth(46);
      this.tweens.add({ targets: boom, scale: 1.6, alpha: 0, duration: 200, onComplete: () => boom.destroy() });
      for (const u of this.units) {
        if (u.dead || u.team === undefined) continue;
        if (u !== target && Math.hypot(u.x - tx, u.y - ty) <= splash + u.radius) u.takeDamage(Math.ceil(damage * 0.6));
      }
      for (const b of this.buildings) {
        if (b.dead || b.team === target.team) continue;
        if (Math.hypot(b.x - tx, b.y - ty) <= splash + 16) b.takeDamage(Math.ceil(damage * 0.5));
      }
    }
  }

  onProjectileHit(p) { if (!p.target?.dead) { this.applyHit(p.target, p.damage, p.splash); } }

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
        w.setOrder({ type: 'harvest' });
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
      const key = `m:${Math.round(x / TILE)}:${Math.round(y / TILE)}:${attackMove ? 'a' : 'm'}`;
      const clearance = 0;
      const field = this.flows.ensure(key, x, y, this.gameTime, 0.6, clearance);
      for (const u of list) { u.flowField = field; u.issueMove(x, y, attackMove); if (!u.flying) { /* ground flow */ } }
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
    if (techId === 'lair' || techId === 'hive') {
      const b = this.buildings.find(b => b.team === team && (b.buildId === 'hatchery' || b.buildId === 'lair') && b.def.morphTo !== false);
    }
    if (techId === 'zergMeleeAttacks1') this.players[team].upgrades.weapons++;
    if (techId === 'zergCarapace1') this.players[team].upgrades.armor++;
    if (techId === 'terranInfantryWeapons1') this.players[team].upgrades.weapons++;
    if (techId === 'terranInfantryArmor1') this.players[team].upgrades.armor++;
    if (techId === 'protossGroundWeapons1') this.players[team].upgrades.weapons++;
    if (techId === 'protossGroundPlating1') this.players[team].upgrades.armor++;
    this.audio?.researchComplete();
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
      if (p.button === 2) { this.rightClickOrder({ x: p.worldX, y: p.worldY }); return; }
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
    this.input.keyboard.on('keydown-ESC', () => { if (this.ultMode) { this.cancelUltimate(); return; } this.cancelPlacing(); this.selectBuilding(null); this.audio?.deselect(); });
    this.input.keyboard.on('keydown-A', () => { this.attackMoveMode = true; this.input.setDefaultCursor('crosshair'); });
    this.input.keyboard.on('keydown-Q', () => { this.attackMoveMode = false; this.input.setDefaultCursor('default'); });
    this.input.keyboard.on('keydown-G', () => { this.armUltimate(); });
    this.input.keyboard.on('keydown-P', () => { /* reserved */ });
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
    if (added) this.audio?.select();
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
      units: [...this.selection].map(u => ({ kind: u.kind, name: u.def.name, hp: Math.ceil(u.hp), maxHp: u.maxHp, shield: Math.ceil(u.shield), cargo: u.cargo }))
    };
  }

  selectBuilding(b) {
    this.selectedBuilding = b;
    if (b) this.clearSelection();
    this.events.emit('hud:selection', { building: b ? { buildId: b.buildId, name: b.def.name, hp: Math.ceil(b.hp), maxHp: b.maxHp, queue: b.queue.map(q => ({ kind: q.kind || q.research, remaining: Math.ceil(q.remaining), label: UNITS[q.kind]?.name || TECHS[q.research]?.name })), canProduce: Object.keys(UNITS).filter(k => UNITS[k].build === b.buildId && b.canProduce(k)) } : null });
  }

  rightClickOrder(wp) {
    this.cmdCount++;
    this.showOrderMarker(wp.x, wp.y);
    // rally point placement when a production building is selected
    if (this.selectedBuilding && this.selectedBuilding.built && this.selectedBuilding.def.rally) {
      const sb = this.selectedBuilding;
      sb.rallyPoint = { x: wp.x, y: wp.y };
      this.showRallyFlag(sb);
      this.audio?.move();
      return;
    }
    if (this.attackMoveMode) {
      for (const u of this.selection) u.issueMove(wp.x, wp.y, true);
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
      if (b && b.team === 0 && b.def.onGeyser) { workers.forEach(w => { if (b.geyser && b.geyser.workers.length < 3) { b.geyser.workers.push(w); w.gasTarget = b.geyser; } }); return; }
      if (b && b.team === 0 && !b.built) { workers.forEach(w => w.setOrder({ type: 'build', building: b })); return; }
      workers.forEach(w => w.issueMove(wp.x, wp.y, false));
      this.audio?.move();
      return;
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
        this.tweens.add({ targets: u.sprite, alpha: 0.6, duration: 200, yoyo: true, onComplete: () => { u.speed = u.def.speed * TILE * 5; u.bonusDamage -= 6; u.sprite.setAlpha(1); } });
        this.tweens.add({ targets: u, duration: 14000, onComplete: () => { u.speed = u.def.speed * TILE * 5; u.bonusDamage -= 6; } });
        this.audio?.attack('stim');
      }
    }
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
    if (action === 'stop') { for (const u of this.selection) { u.order = null; u.state = 'idle'; u.path = []; } }
    if (action === 'hold') { for (const u of this.selection) { u.state = 'idle'; u.order = null; } }
  }

  createEvents() {
    // camera bounds check on resize handled by RESIZE mode
  }

  // ---------------- update loop ----------------
  update(time, delta) {
    if (this.gameOver) return;
    const dt = Math.min(0.05, delta / 1000) * this.timeScale;
    this.gameTime += dt;

    // edge pan + WASD
    const cam = this.cameras.main;
    const pan = 620 * dt / cam.zoom;
    const k = this.keys || {};
    if (k.W?.isDown || k.A?.isDown || k.S?.isDown || k.D?.isDown) {
      if (k.A.isDown) cam.scrollX -= pan;
      if (k.D.isDown) cam.scrollX += pan;
      if (k.W.isDown) cam.scrollY -= pan;
      if (k.S.isDown) cam.scrollY += pan;
    }
    if (this.edgePan && this.input.activePointer?.isDown === false) {
      const p = this.input.activePointer;
      const m = 24;
      if (p) {
        if (p.x < m) cam.scrollX -= pan;
        if (p.y < m) cam.scrollY -= pan;
        if (p.x > this.scale.width - m) cam.scrollX += pan;
        if (p.y > this.scale.height - m) cam.scrollY += pan;
      }
    }
    // autoscroll to selection back (Q handled elsewhere)

    // spatial hash rebuild (separation + neighbor queries)
    this.spatial.clear();
    for (const u of this.units) if (!u.dead && !u.flying) this.spatial.insert(u);

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
      if (d <= step + pr.target.radius) { this.applyHit(pr.target, pr.damage, pr.splash); sp.destroy(); continue; }
      sp.x += (dx / d) * step; sp.y += (dy / d) * step;
    }

    // fog update throttled
    this.fogTimer -= dt;
    if (this.fogTimer <= 0) { this.fogTimer = 0.25; this.updateFog(); }

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
    const combatNow = this.units.some(u => !u.dead && u.team === 0 && u.target && !u.target.dead) || this.units.some(u => !u.dead && u.team === 1 && Math.abs(u.x - cam.midPoint.x) < 400);
    this.audio?.setCombat(combatNow);
    this.ultimateEnergy = Math.min(this.ultimateMax, this.ultimateEnergy + dt * (5 + this.units.filter(u => !u.dead && u.team === 0 && !u.def.worker).length * 0.25));
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
      // placement near base
      const base = this.buildings.find(b => b.team === team && b.def.primary);
      if (!base) return;
      for (const [ox, oy] of [[-4, 3], [3, -4], [-5, -2], [2, 5], [-2, -5], [5, 2], [-6, 4], [4, -6], [0, 6], [-7, 0]]) {
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
        if (!this.hasBuilding('extractor', team)) buildIfPossible('extractor');
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
      if (!this.hasBuilding('factory', team) && this.gameTime > 70) buildIfPossible('factory');
      if (!this.hasBuilding('starport', team) && this.gameTime > 130) buildIfPossible('starport');
      if (!this.hasBuilding('missileTurret', team) && this.gameTime > 60) buildIfPossible('missileTurret');
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
    const ready = army.filter(u => !s.harvestSquad.includes(u));
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
    this.audio?.gameEnd(result === 'victory');
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
    this.events.emit('hud:gameover', result);
  }

  campMissionNum() { return (this.mission && this.mission.n) || 1; }

  aiProfileFallback() {
    return { income: 1.1, armyCap: 18, threshold: 1.15, attackGap: 45, harassAt: 65, rushBuilds: [], rushAt: 1e9, workers: 12, flankSplit: 0.7 };
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
