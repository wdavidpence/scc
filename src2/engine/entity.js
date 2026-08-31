// Core entities for SCC2: Unit, Building, Projectile, effects.
import Phaser from 'phaser';
import { UNITS, BUILDINGS, TECHS, SIZE_MULT, TILE } from '../data/sc1.js';
import { liveProjectiles } from './liveProjectiles.js';

let nextId = 1;

export function teamColorHex(team) {
  return team === 0 ? '#4ea1ff' : team === 1 ? '#ff7b2e' : '#ff4fa3';
}

export function effectiveDamage(attacker, target) {
  const mult = SIZE_MULT[attacker.def.attackType]?.[target.def.size] ?? 1;
  const armor = target.def.armor + (target.bonusArmor || 0);
  const dmg = (attacker.def.damage + (attacker.bonusDamage || 0)) * mult - armor;
  return Math.max(1, Math.round(dmg));
}

export class Unit {
  constructor(world, team, kind, x, y) {
    this.world = world;
    this.id = nextId++;
    this.team = team;
    this.kind = kind;
    this.def = UNITS[kind];
    this.maxHp = this.def.hp;
    this.hp = this.maxHp;
    this.maxShield = this.def.shield || 0;
    this.shield = this.maxShield;
    this.shieldRegenDelay = 0;
    this.bonusDamage = 0;
    this.bonusArmor = 0;
    this.speed = this.def.speed * TILE * 5; // px/sec (5x scale so units traverse the map briskly)
    this.flying = !!this.def.flying;
    this.state = 'idle';
    this.order = null; // {type:'move'|'attackMove'|'attackTarget'|'harvest'|'build'|'returnCargo', ...}
    this.target = null;
    this.path = [];
    this.pathIndex = 0;
    this.repathTimer = Math.random() * 0.5;
    this.attackTimer = 0;
    this.cargo = 0;
    this.harvestTimer = 0;
    this.trainingTarget = null;
    this.container = world.add.container(x, y);
    const key = `u-${this.def.icon}-t${team > 2 ? 2 : team}`;
    this.sprite = world.add.image(0, 0, key);
    if (this.flying) { this.sprite.setScale(1.06); this.container.setDepth(40); } else { this.container.setDepth(30); }
    this.baseScale = this.flying ? 1.06 : 1;
    this.hpBar = world.add.graphics();
    this.container.add([this.sprite, this.hpBar]);
    this.selected = false;
    this.radius = 8;
    this.stunTimer = 0;
    this.dead = false;
    this.animT = Math.random() * 10;
    this.moving = false;
    if (this.def.worker) {
      // find nearest mineral patch automatically (starting harvest)
      this.setOrder({ type: 'harvest' });
    }
  }

  get x() { return this.container.x; }
  get y() { return this.container.y; }
  setPos(x, y) { this.container.setPosition(x, y); }

  setOrder(order) {
    this.order = order;
    this.path = [];
    this.pathIndex = 0;
    if (order.type === 'attackTarget') this.target = order.target;
    if (order.type === 'attackMove') this.attackMovePoint = order.point;
    if (order.type === 'move' || order.type === 'attackMove' || order.type === 'harvest' || order.type === 'build') this.target = null;
    this.state = order.type;
    this.needsPath = true;
  }

  issueMove(x, y, attackMove = false) {
    this.setOrder({ type: attackMove ? 'attackMove' : 'move', point: { x, y } });
  }

  update(dt) {
    if (this.dead) return;
    this.moving = false;
    if (this.stunTimer > 0) { this.stunTimer -= dt; this.drawHp(); this.moving = false; this.animate(dt); return; }
    // shield regen
    if (this.maxShield > 0) {
      if (this.shieldRegenDelay > 0) this.shieldRegenDelay -= dt;
      else if (this.shield < this.maxShield) this.shield = Math.min(this.maxShield, this.shield + dt * 4);
    }
    this.attackTimer -= dt;

    switch (this.state) {
      case 'move': case 'attackMove': this.updateMove(dt); break;
      case 'attackTarget': this.updateAttackTarget(dt); break;
      case 'harvest': this.updateHarvest(dt); break;
      case 'returnCargo': this.updateReturnCargo(dt); break;
      case 'build': this.updateBuild(dt); break;
      case 'training': break; // held inside structure
      default:
        if (this.def.worker || this.def.weaponless) { if (!this.order) this.setOrder({ type: 'harvest' }); }
        else this.updateAutoAcquire(dt);
    }
    this.animate(dt);
    this.drawHp();
  }

  updateAutoAcquire(dt) {
    const mult = this.stance === 'hold' ? 0 : this.stance === 'defensive' ? 0.65 : this.stance === 'aggressive' ? 2.0 : 1.5;
    if (mult === 0) {
      // hold fire: drift back toward last commanded point, fire only if already engaged
      return;
    }
    const range = this.def.range * TILE * mult;
    const foe = this.world.findNearestEnemy(this.x, this.y, range, this.flying, !this.flying);
    if (foe) {
      this.setOrder({ type: 'attackTarget', target: foe });
    }
  }

  repath(toX, toY) {
    const clearance = this.def.size === 'large' ? 1 : 0;
    const p = this.world.nav.findPath(this.x, this.y, toX, toY, clearance, this.id);
    if (p && p.length > 1) { this.path = p; this.pathIndex = 1; }
    else { this.path = [{ x: toX, y: toY }]; this.pathIndex = 0; }
  }

  stepAlongPath(dt) {
    if (this.pathIndex >= this.path.length) return true;
    const wp = this.path[this.pathIndex];
    const dx = wp.x - this.x, dy = wp.y - this.y;
    const d = Math.hypot(dx, dy);
    const step = this.speed * dt;
    if (d <= step) {
      this.setPos(wp.x, wp.y);
      this.pathIndex++;
      if (this.pathIndex >= this.path.length) return true;
    } else {
      this.setPos(this.x + (dx / d) * step, this.y + (dy / d) * step);
      this.face(dx, dy);
      this.moving = true;
    }
    return false;
  }

  // flow-field descent: steer by shared integrator field instead of own path
  stepAlongFlow(dt, field) {
    const f = field.flowAt(this.x, this.y);
    if (!f) { this.path = []; this.pathIndex = 0; return false; } // local pocket; separation + nudge
    const step = this.speed * dt;
    let vx = f.x, vy = f.y;
    // separation from neighbors
    const sep = this.world.separationVector(this);
    vx += sep.x * 0.9; vy += sep.y * 0.9;
    const l = Math.hypot(vx, vy) || 1;
    this.setPos(this.x + (vx / l) * step, this.y + (vy / l) * step);
    this.face(vx, vy);
    this.moving = true;
    return field.distAt(this.x, this.y) <= 1.2;
  }

  // rotate/facing: full rotation toward movement/attack vector + squash so troops look oriented
  face(dx, dy) {
    if (dx === 0 && dy === 0) return;
    if (this.def.flying || this.def.size === 'large' || ['tank', 'vulture', 'wraith', 'battlecruiser', 'carrier', 'overlord', 'goliath'].includes(this.kind)) {
      const a = Math.atan2(dy, dx);
      this.sprite.setFlipX(false);
      this.sprite.setRotation(Math.abs(a) > Math.PI / 2 ? a + Math.PI : a);
    } else {
      if (dx !== 0) this.sprite.setFlipX(dx < 0);
    }
  }

  // per-frame procedural animation: walk bob + idle breathing + attack recoil
  animate(dt) {
    this.animT += dt;
    const rotKinds = ['tank', 'vulture', 'wraith', 'battlecruiser', 'carrier', 'overlord', 'goliath'];
    if (this.moving) {
      const bob = Math.sin(this.animT * 12) * 1.4;
      this.sprite.setY(bob);
      if (!(this.def.flying || this.def.size === 'large' || rotKinds.includes(this.kind))) this.sprite.setRotation(Math.sin(this.animT * 12) * 0.06);
    } else {
      this.sprite.setY(Math.sin(this.animT * 2.4) * 0.5);
      if (!(this.def.flying || this.def.size === 'large' || rotKinds.includes(this.kind))) this.sprite.setRotation(0);
    }
  }

  updateMove(dt) {
    // flow field when group-cohort registered for this order point
    if (this.flowField) {
      const arrived = this.stepAlongFlow(dt, this.flowField);
      if (arrived) { this.flowField = null; this.order = null; this.state = 'idle'; }
    } else {
    if (this.needsPath) { this.needsPath = false; this.repath(this.order.point.x, this.order.point.y); }
    const arrived = this.stepAlongPath(dt);
    this.repathTimer -= dt;
    if (!arrived && this.repathTimer <= 0) {
      this.repathTimer = 0.7 + Math.random() * 0.4;
      const stillBlocked = this.world.nav.blockedBy[this.world.nav.idx(Math.floor(this.x / TILE), Math.floor(this.y / TILE))] >= 0 && this.world.nav.blockedBy[this.world.nav.idx(Math.floor(this.x / TILE), Math.floor(this.y / TILE))] !== this.id;
      if (stillBlocked) this.repath(this.order.point.x, this.order.point.y);
    }
    if (arrived) {
      this.order = null;
      this.state = 'idle';
    }
    }
    if (this.state === 'attackMove') {
      const range = this.def.range * TILE * 1.5;
      const foe = this.world.findNearestEnemy(this.x, this.y, range, this.flying, !this.flying);
      if (foe) this.setOrder({ type: 'attackTarget', target: foe });
    }
  }

  inWeaponRange(target) {
    const r = (this.def.range * TILE) + this.radius + target.radius;
    return Math.hypot(target.x - this.x, target.y - this.y) <= r;
  }

  updateAttackTarget(dt) {
    const target = this.target;
    if (!target || target.dead) {
      // acquire next
      const foe = this.world.findNearestEnemy(this.x, this.y, this.def.range * TILE * 2, this.flying, !this.flying);
      if (foe) { this.target = foe; return; }
      if (this.state !== 'attackMove') { this.order = null; this.state = 'idle'; }
      return;
    }
    if (this.inWeaponRange(target)) {
      // face target & fire
      this.sprite.setFlipX(target.x < this.x);
      if (this.attackTimer <= 0 && !this.firingVolley) {
        this.fireAt(target);
        this.attackTimer = this.def.cooldown;
      }
    } else {
      this.repathTimer -= dt;
      if (this.repathTimer <= 0 || this.path.length === 0 || this.pathIndex >= this.path.length) {
        this.repathTimer = 0.5;
        this.repath(target.x, target.y);
      }
      this.stepAlongPath(dt);
    }
  }

  fireAt(target) {
    const dmg = effectiveDamage(this, target);
    // muzzle flash + attack windup feel
    if (this.world.camNear && this.world.camNear(this.x, this.y)) {
      const m = this.world.add.image(this.x + (target.x > this.x ? 10 : -10), this.y - 2, 'spark').setDepth(55).setScale(1.3);
      this.world.tweens.add({ targets: m, scale: 0.2, alpha: 0, duration: 130, onComplete: () => m.destroy() });
    }
    this.sprite.setScale(1, 0.92);
    this.world.time.delayedCall(90, () => { if (this.sprite && !this.dead) this.sprite.setScale(this.baseScale || (this.flying ? 1.06 : 1)); });
    this.world.spawnProjectile({
      from: { x: this.x, y: this.y },
      target,
      damage: dmg,
      splash: this.def.splash ? this.def.splash.radius * TILE : 0,
      team: this.team,
      kind: this.kind,
      speed: this.kind === 'tank' ? 900 : 620,
      attacker: this
    });
    this.world.audio?.attack(this.kind);
  }

  // ---------- harvesting ----------
  findNearestPatch() { return this.world.nearestMineralPatch(this, 9999); }
  findNearestGeyser() { return this.world.nearestGeyser(this); }

  updateHarvest(dt) {
    if (this.cargo >= 8) { this.setOrder({ type: 'returnCargo' }); return; }
    if (!this.harvestTarget) {
      this.harvestTarget = this.world.pickMineralForWorker(this);
      if (!this.harvestTarget) { this.state = 'idle'; return; }
      this.needsPath = true;
      this.repath(this.harvestTarget.x, this.harvestTarget.y);
    }
    const t = this.harvestTarget;
    const d = Math.hypot(t.x - this.x, t.y - this.y);
    if (d > TILE * 1.1) {
      if (this.pathIndex >= this.path.length) { this.repath(t.x, t.y); }
      this.stepAlongPath(dt);
      return;
    }
    this.harvestTimer -= dt;
    if (this.harvestTimer <= 0) {
      this.harvestTimer = 2.6;
      const amt = Math.min(8 - this.cargo, t.amount);
      this.cargo += amt; t.amount -= amt;
      this.world.onMineralDug(this, t, amt);
      if (t.amount <= 0) { this.harvestTarget = null; this.world.depleteMineral(t); }
    }
  }

  updateReturnCargo(dt) {
    const drop = this.world.nearestDropOff(this);
    if (!drop) { this.state = 'idle'; return; }
    const d = Math.hypot(drop.x - this.x, drop.y - this.y);
    if (d > TILE * 2.4) {
      if (this.pathIndex >= this.path.length || this.needsPath) { this.needsPath = false; this.repath(drop.x, drop.y + TILE); }
      this.stepAlongPath(dt);
      return;
    }
    this.world.onCargoDeposited(this);
    this.cargo = 0;
    this.harvestTarget = null;
    this.setOrder({ type: 'harvest' });
  }

  updateBuild(dt) {
    const b = this.order?.building;
    if (!b || b.dead) { this.order = null; this.state = this.def.worker ? 'harvest' : 'idle'; if (this.def.worker) this.setOrder({ type: 'harvest' }); return; }
    const d = Math.hypot(b.x - this.x, b.y - this.y);
    if (d > (b.def.w * TILE) / 2 + 18) {
      if (this.pathIndex >= this.path.length || this.needsPath) { this.needsPath = false; this.repath(b.x, b.y + (b.def.h * TILE) / 2); }
      this.stepAlongPath(dt);
      return;
    }
    b.constructionProgress += dt;
    b.workers.push(this);
    // F5: construction sparks at the build site
    if (!this._sparkT || this._sparkT <= 0) {
      this._sparkT = 0.25 + Math.random() * 0.2;
      const sx = b.x + (Math.random() * b.def.w * TILE * 0.8 - b.def.w * TILE * 0.4);
      const sy = b.y + (Math.random() * b.def.h * TILE * 0.5);
      const sp = this.world.add.rectangle(sx, sy, 2, 4, 0xffd23f, 0.9).setDepth(25).setRotation(Math.random() * 6.28);
      this.world.tweens.add({ targets: sp, y: sy + 10, alpha: 0, duration: 300, onComplete: () => sp.destroy() });
    } else this._sparkT -= dt;
    if (b.constructionProgress >= b.buildTime) {
      b.completeConstruction();
      this.order = null;
      if (this.def.worker) this.setOrder({ type: 'harvest' }); else this.state = 'idle';
    }
  }

  takeDamage(amount, attacker) {
    if (this.dead) return;
    if (this.shield > 0) {
      const s = Math.min(this.shield, amount);
      this.shield -= s; amount -= s;
      this.shieldRegenDelay = 5;
      // shield impact ripple
      if (s > 0 && this.world.camNear && this.world.camNear(this.x, this.y)) {
        const rip = this.world.add.circle(this.x, this.y, this.radius + 4, 0x4ea1ff, 0).setStrokeStyle(1.5, 0x8ab4ff, 0.9).setDepth(55);
        this.world.tweens.add({ targets: rip, scale: 1.5, alpha: 0, duration: 240, onComplete: () => rip.destroy() });
      }
    }
    this.hp -= amount;
    this.sprite.setTint(0xffffff);
    // damage numbers (throttled, camera-visible only)
    if (!this._dmgAcc) this._dmgAcc = 0;
    this._dmgAcc += amount;
    if (this.world.camNear && this.world.camNear(this.x, this.y) && (!this._dmgT || this.world.time.now - this._dmgT > 260)) {
      this._dmgT = this.world.time.now;
      const g = this.world.add.text(this.x + (Math.random() * 8 - 4), this.y - 14, `${Math.round(this._dmgAcc)}`, { fontFamily: 'Menlo, monospace', fontSize: '11px', color: attacker && attacker.team === 0 ? '#ffd23f' : '#ff6b6b', fontStyle: 'bold' }).setOrigin(0.5).setDepth(75).setScrollFactor(1);
      this.world.tweens.add({ targets: g, y: this.y - 34, alpha: 0, duration: 650, onComplete: () => g.destroy() });
      this._dmgAcc = 0;
    }
    // blood/spray particles
    if (this.world.camNear && this.world.camNear(this.x, this.y) && this.world.textures && this.world.textures.exists('blood')) {
      for (let i = 0; i < 3; i++) {
        const b = this.world.add.image(this.x, this.y, 'blood').setDepth(55).setRotation(Math.random() * 6.28).setAlpha(0.9);
        this.world.tweens.add({ targets: b, x: this.x + (Math.random() * 24 - 12), y: this.y + (Math.random() * 24 - 12), alpha: 0, scale: 0.5, duration: 350, onComplete: () => b.destroy() });
      }
    }
    this.world.time.delayedCall(60, () => { if (this.sprite && !this.dead) this.sprite.clearTint(); });
    if (this.hp <= 0) this.die();
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.world.onUnitDeath(this);
    const boom = this.world.add.image(this.x, this.y, 'explosion');
    boom.setDepth(60).setScale(this.def.size === 'large' ? 1.4 : 0.8);
    this.world.tweens.add({ targets: boom, scale: (this.def.size === 'large' ? 2.2 : 1.4), alpha: 0, duration: 320, onComplete: () => boom.destroy() });
    // debris shards
    if (this.world.camNear && this.world.camNear(this.x, this.y)) {
      for (let i = 0; i < 5; i++) {
        const d = this.world.add.image(this.x, this.y, 'spark').setDepth(58).setScale(0.8 + Math.random());
        this.world.tweens.add({ targets: d, x: this.x + (Math.random() * 40 - 20), y: this.y + (Math.random() * 40 - 20) + 10, alpha: 0, duration: 420, onComplete: () => d.destroy() });
      }
    }
    // persistent scorch decal
    const decal = this.world.add.image(this.x, this.y, 'scorch');
    decal.setDepth(6).setAlpha(0.55).setScale(this.def.size === 'large' ? 1.3 : 0.7);
    this.world.tweens.add({ targets: decal, alpha: 0.18, duration: 12000 });
    this.world.audio?.death(this.def.size === 'large');
    if (this.def.size === 'large') this.world.shake?.(4, 0.25);
    this.container.destroy();
    this.world.nav.unblockBy(this.id);
  }

  drawHp() {
    const g = this.hpBar;
    g.clear();
    if (this.hp >= this.maxHp && this.shield >= this.maxShield) return;
    const w = 16;
    const ratio = Math.max(0, this.hp / this.maxHp);
    g.fillStyle(0x000000, 0.5); g.fillRect(-w / 2 - 1, -14, w + 2, 3);
    g.fillStyle(ratio > 0.5 ? 0x3ddc6a : ratio > 0.25 ? 0xffd23f : 0xff4444);
    g.fillRect(-w / 2, -13, w * ratio, 1);
    if (this.maxShield > 0) {
      g.fillStyle(0x000000, 0.5); g.fillRect(-w / 2 - 1, -17, w + 2, 3);
      g.fillStyle(0x4ea1ff); g.fillRect(-w / 2, -16, w * (this.shield / this.maxShield), 1);
    }
  }

  destroy() { if (!this.dead) this.die(); }
}

export class Building {
  constructor(world, team, buildId, x, y, opts = {}) {
    this.world = world;
    this.id = nextId++;
    this.team = team;
    this.buildId = buildId;
    this.def = BUILDINGS[buildId];
    this.x = x; this.y = y;
    this.maxHp = this.def.hp;
    this.hp = this.maxHp;
    this.maxShield = this.def.shield || 0;
    this.shield = this.maxShield;
    this.built = opts.instant === true;
    this.constructionProgress = this.built ? (this.def.buildTime || 1) : 0;
    this.buildTime = (this.def.buildTime || 1) * 1;
    this.workers = [];
    this.queue = []; // {kind, remaining, worker?}
    this.rallyPoint = null;
    this.dead = false;
    this.attackTimer = 0;
    this.container = world.add.container(x, y);
    const texKey = this.textureKey();
    this.sprite = world.add.image(0, 0, texKey);
    this.container.add(this.sprite);
    this.container.setDepth(20);
    this.hpBar = world.add.graphics();
    this.container.add(this.hpBar);
    if (!this.built) {
      this.sprite.setAlpha(0.6);
      if (!opts.noBlock) world.nav.blockRect(this.id, this.tileX0(), this.tileY0(), this.tileX1(), this.tileY1());
    }
    if (this.built) this.onBuilt();
    this.supplyProvided = this.def.supply || 0;
  }

  textureKey() {
    let bid = this.buildId;
    if (this.morphedTo) bid = this.morphedTo;
    const team = this.team > 2 ? 2 : this.team;
    if (this.world.textures.exists(`b-${bid}-t${team}`)) return `b-${bid}-t${team}`;
    if (this.world.textures.exists(`b-${bid}-t${this.def.race === 'zerg' ? 1 : this.def.race === 'protoss' ? 2 : 0}`)) return `b-${bid}-t${this.def.race === 'zerg' ? 1 : this.def.race === 'protoss' ? 2 : 0}`;
    return `b-commandCenter-t0`;
  }

  tileX0() { return Math.floor((this.x - (this.def.w * TILE) / 2) / TILE); }
  tileY0() { return Math.floor((this.y - (this.def.h * TILE) / 2) / TILE); }
  tileX1() { return Math.ceil((this.x + (this.def.w * TILE) / 2) / TILE) - 1; }
  tileY1() { return Math.ceil((this.y + (this.def.h * TILE) / 2) / TILE) - 1; }

  completeConstruction() {
    if (this.built) return;
    this.built = true;
    this.sprite.setAlpha(1);
    this.workers.forEach(w => { if (w.order?.building === this) { w.order = null; if (w.def.worker) w.setOrder({ type: 'harvest' }); } });
    this.workers = [];
    if (this.buildId === 'nexus') this.def.supply = 15;
    if (this.buildId === 'commandCenter' || this.buildId === 'nexus') this.def.supply = this.buildId === 'commandCenter' ? 10 : 15;
    // F5: completion spin-up flourish
    this.world.tweens.add({ targets: this.sprite, angle: { from: 0, to: 360 }, scale: { from: 1.12, to: 1 }, duration: 420, ease: 'Cubic.easeOut' });
    const ring = this.world.add.circle(this.x, this.y, 10, 0x6ee7a0, 0.0).setStrokeStyle(3, 0x6ee7a0, 0.8).setDepth(25);
    this.world.tweens.add({ targets: ring, radius: Math.max(this.def.w, this.def.h) * TILE * 0.7, alpha: 0, duration: 600, onComplete: () => ring.destroy() });
    this.world.applyUpgradeTintToBuildings?.(this.team);
    this.world.onBuildingComplete(this);
  }

  onBuilt() {
    this.world.onBuildingComplete(this);
  }

  takeDamage(amount, attacker) {
    if (this.dead) return;
    if (this.shield > 0) {
      const s = Math.min(this.shield, amount);
      this.shield -= s; amount -= s;
    }
    this.hp -= amount;
    this.sprite.setTint(0xffffff);
    this.world.time.delayedCall(60, () => { if (this.sprite && !this.dead) this.sprite.clearTint(); });
    if (this.hp <= 0) this.die();
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.world.onBuildingDeath(this);
    const s = Math.max(this.def.w, this.def.h);
    const boom = this.world.add.image(this.x, this.y, 'explosion');
    boom.setDepth(60).setScale(s * 0.7);
    this.world.tweens.add({ targets: boom, scale: s * 1.4, alpha: 0, duration: 500, onComplete: () => boom.destroy() });
    this.world.audio?.death(true);
    this.container.destroy();
    this.world.nav.unblockBy(this.id);
  }

  canProduce(kind) {
    if (!this.built) return false;
    const unitDef = UNITS[kind];
    if (!unitDef) return false;
    if (!(unitDef.build === this.buildId || this.def.produces?.includes(kind))) return false;
    if (this.buildId === 'barracks' && (kind === 'firebat') && !this.world.hasBuilding('academy', this.team)) return false;
    if (this.buildId === 'factory' && kind === 'goliath' && !this.world.hasAddOn(this, 'machineShop')) return false;
    if (this.buildId === 'starport' && kind === 'battlecruiser' && !this.world.hasAddOn(this, 'controlTower')) return false;
    if (unitDef.tech && !this.world.techResearched(this.team, unitDef.tech)) return false;
    return true;
  }

  queueUnit(kind) {
    if (!this.canProduce(kind)) return false;
    const def = UNITS[kind];
    if (!this.world.canAfford(this.team, def.minerals, def.gas)) return false;
    this.world.spend(this.team, def.minerals, def.gas);
    this.queue.push({ kind, remaining: def.buildTime * 0.16, total: def.buildTime * 0.16 });
    return true;
  }

  queueResearch(techId) {
    const t = TECHS[techId];
    if (!t || !this.built) return false;
    if (this.world.techResearched(this.team, techId)) return false;
    if (!this.world.canAfford(this.team, t.minerals, t.gas)) return false;
    this.world.spend(this.team, t.minerals, t.gas);
    this.queue.push({ research: techId, remaining: t.time * 0.16, total: t.time * 0.16 });
    return true;
  }

  update(dt) {
    if (this.dead) return;
    // construction work by queued workers is handled in worker updateBuild
    // shield regen
    if (this.maxShield > 0 && this.shield < this.maxShield && this.built) {
      this.shield = Math.min(this.maxShield, this.shield + dt * 3);
    }
    // production queue
    const item = this.queue[0];
    if (item) {
      item.remaining -= dt;
      if (item.remaining <= 0) {
        this.queue.shift();
        if (item.research) {
          this.world.completeResearch(this.team, item.research);
        } else {
          this.spawnFromQueue(item.kind);
        }
      }
    }
    // defense structure
    if (this.def.defense && this.built) {
      this.attackTimer -= dt;
      if (this.attackTimer <= 0) {
        const d = this.def.defense;
        const range = d.range * TILE;
        const foe = this.world.findNearestEnemy(this.x, this.y, range, d.targets === 'air' ? true : undefined, d.targets === 'air' ? false : d.targets === 'ground' ? true : undefined);
        if (foe) {
          const mult = SIZE_MULT[d.attackType]?.[foe.def.size] ?? 1;
          this.world.spawnProjectile({ from: { x: this.x, y: this.y - 10 }, target: foe, damage: Math.max(1, Math.round(d.damage * mult - foe.def.armor)), splash: 0, team: this.team, kind: 'turret', speed: 700 });
          this.attackTimer = d.cooldown;
          this.world.audio?.attack('turret');
        }
      }
    }
    this.drawHp();
  }

  spawnFromQueue(kind) {
    const rx = this.rallyPoint ? this.rallyPoint.x : this.x;
    const ry = this.rallyPoint ? this.rallyPoint.y : this.y + (this.def.h * TILE) / 2 + 12;
    const def = UNITS[kind];
    const n = def.trainCount || 1;
    for (let i = 0; i < n; i++) {
      const u = this.world.spawnUnit(this.team, kind, rx + (Math.random() * 20 - 10) + i * 10, ry + Math.random() * 8, { arriveReady: true });
      if (u) this.world.audio?.spawn();
    }
  }

  drawHp() {
    const g = this.hpBar;
    g.clear();
    if (this.hp >= this.maxHp && this.shield >= this.maxShield) return;
    const w = Math.max(24, this.def.w * TILE * 0.7);
    const ratio = Math.max(0, this.hp / this.maxHp);
    const y = -(this.def.h * TILE) / 2 - 6;
    g.fillStyle(0x000000, 0.5); g.fillRect(-w / 2 - 1, y - 1, w + 2, 4);
    g.fillStyle(ratio > 0.5 ? 0x3ddc6a : ratio > 0.25 ? 0xffd23f : 0xff4444);
    g.fillRect(-w / 2, y, w * ratio, 2);
    if (this.maxShield > 0) {
      g.fillStyle(0x4ea1ff); g.fillRect(-w / 2, y - 3, w * (this.shield / this.maxShield), 1);
    }
    if (!this.built) {
      g.fillStyle(0x000000, 0.5); g.fillRect(-w / 2 - 1, y + 5, w + 2, 4);
      g.fillStyle(0xffd23f); g.fillRect(-w / 2, y + 6, w * Math.min(1, this.constructionProgress / this.buildTime), 2);
    }
  }
}
