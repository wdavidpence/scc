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
  let dmg = (attacker.def.damage + (attacker.bonusDamage || 0)) * mult - armor;
  // SC1 high ground: attacker standing on higher terrain gets +2 damage bonus
  if (attacker.world?.elevAt && attacker.team === 0 && attacker.world.elevAt(attacker.x, attacker.y) > attacker.world.elevAt(target.x, target.y)) dmg += 2;
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
    const sizeScale = this.def.size === 'large' ? 1.25 : this.def.size === 'medium' ? 1.08 : 1;
    if (this.flying) { this.sprite.setScale(1.06 * sizeScale); this.container.setDepth(40); } else { this.sprite.setScale(sizeScale); this.container.setDepth(30); }
    this.baseScale = (this.flying ? 1.06 : 1) * sizeScale;
    this.hpBar = world.add.graphics();
    this.container.add([this.sprite, this.hpBar]);
    this.selected = false;
    this.radius = 8;
    this.stunTimer = 0;
    this.dead = false;
    this.animT = Math.random() * 10;
    this.moving = false;
    // SC1 feature state
    this.energy = this.def.energy || 0;
    this.maxEnergy = this.def.energy || 0;
    this.kills = 0;
    this.level = 0;
    this.burrowed = false;
    this.sieged = false;
    this.cloaked = !!this.def.cloak;
    this.patrolPoints = null; // [A,B] ping-pong
    this.waypoints = null;    // queued move points (shift-click)
    this.interceptors = null; // carrier orbs
    this._chevrons = [];
    // transports / garrison / medic state
    this.carry = [];          // units loaded into a transport
    this.unloadAt = null;     // pending unload destination
    this.healTarget = null;   // medic heal order
    this.garrisonedIn = null; // bunker this unit hides in
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
    if (this.sieged && ['move', 'attackMove', 'attackTarget', 'patrol'].includes(order.type)) this.unsiege();
    if (order.type === 'attackTarget') this.target = order.target;
    if (order.type === 'attackMove') this.attackMovePoint = order.point;
    if (order.type === 'move' || order.type === 'attackMove' || order.type === 'harvest' || order.type === 'build') this.target = null;
    if (order.type === 'heal') this.healTarget = order.target;
    if (order.type === 'loadUnit') this.loadTarget = order.target;
    if (order.type === 'unload') this.unloadAt = order.point;
    this.state = order.type;
    this.needsPath = true;
  }

  issueMove(x, y, attackMove = false) {
    this.setOrder({ type: attackMove ? 'attackMove' : 'move', point: { x, y } });
  }

  update(dt) {
    if (this.dead) return;
    if (this.loaded || this.state === 'garrisoned' || this.state === 'loaded' || this.garrisonedIn) { this.moving = false; this.drawHp(); return; } // sits inside bunker/transport; container fires
    this.moving = false;
    if (this.stunTimer > 0) { this.stunTimer -= dt; this.drawHp(); this.moving = false; this.animate(dt); return; }
    // shield regen
    if (this.maxShield > 0) {
      if (this.shieldRegenDelay > 0) this.shieldRegenDelay -= dt;
      else if (this.shield < this.maxShield) this.shield = Math.min(this.maxShield, this.shield + dt * 4);
    }
    this.attackTimer -= dt;

    // energy regen for casters (SC1: slow passive recharge)
    if (this.maxEnergy > 0 && this.energy < this.maxEnergy) this.energy = Math.min(this.maxEnergy, this.energy + dt * 0.8);

    // cloak maintenance (dark templar): re-cloak 2s after last attack
    if (this.def.cloak) {
      this._uncloakT = (this._uncloakT || 0) - dt;
      if (this._uncloakT <= 0 && !this.cloaked && this.state !== 'attackTarget') {
        this.cloaked = true;
        this.sprite.setAlpha(0.22);
      }
    }

    // carrier interceptors orbit + auto-swarms
    if (this.def.interceptor) this.updateInterceptors(dt);

    switch (this.state) {
      case 'move': case 'attackMove': this.updateMove(dt); break;
      case 'attackTarget': this.updateAttackTarget(dt); break;
      case 'harvest': this.updateHarvest(dt); break;
      case 'harvestGas': this.updateHarvestGas(dt); break;
      case 'returnCargo': this.updateReturnCargo(dt); break;
      case 'build': this.updateBuild(dt); break;
      case 'repair': this.updateRepair(dt); break;
      case 'patrol': this.updatePatrol(dt); break;
      case 'loadUnit': this.updateLoadUnit(dt); break;
      case 'unload': this.updateUnload(dt); break;
      case 'heal': this.updateHeal(dt); break;
      case 'training': break; // held inside structure
      default:
        if (this.def.transport) { /* dropship holds station until ordered */ if (!this.order) this.state = 'idle'; }
        else if (this.def.heal) { if (!this.updateAutoHeal(dt)) this.updateAutoAcquire(dt); } // SC1 medic micro: heal first, shoot second
        else if (this.def.worker || this.def.weaponless) { if (!this.order) this.setOrder({ type: 'harvest' }); }
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
    const foe = this.world.acquireFor(this, range);
    if (foe) {
      this.setOrder({ type: 'attackTarget', target: foe });
    }
  }

  repath(toX, toY) {
    if (this.flying) { // air units fly straight lines — terrain is irrelevant
      this.path = [{ x: toX, y: toY }]; this.pathIndex = 0; return;
    }
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
    // SC1: zerg ground units surge faster on their creep
    let effSpeed = this.speed;
    if (!this.flying && this.def.race === 'zerg' && this.world.creepSpeedAt && this.world.creepSpeedAt(this.team, this.x, this.y)) effSpeed *= 1.45;
    const step = effSpeed * dt;
    if (d <= step) {
      this.setPos(wp.x, wp.y);
      this.pathIndex++;
      if (this.pathIndex >= this.path.length) return true;
    } else {
      let mx = this.x + (dx / d) * step, my = this.y + (dy / d) * step;
      // SC1 crowd feel: local separation even on individual paths (ground units only)
      if (!this.flying && this.world.separationVector) {
        const sep = this.world.separationVector(this);
        mx += sep.x * step * 1.1; my += sep.y * step * 1.1;
      }
      // SC1 cliffs: ground units may enter high ground only via ramps (or while already on it)
      if (!this.flying && this.world.groundBlocked && this.world.groundBlocked(this, mx, my)) {
        if (!this.world.groundBlocked(this, mx, this.y)) { mx = mx; }
        else if (!this.world.groundBlocked(this, this.x, my)) { mx = this.x; }
        else { mx = this.x; my = this.y; this.repathTimer = Math.min(this.repathTimer, 0.25); }
      }
      this.setPos(mx, my);
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
    if (this.def.flying || this.def.size === 'large' || ['tank', 'vulture', 'wraith', 'battlecruiser', 'carrier', 'overlord', 'goliath', 'dropship'].includes(this.kind)) {
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
      if (this.waypoints && this.waypoints.length) {
        const nxt = this.waypoints.shift();
        this.issueMove(nxt.x, nxt.y, this.state === 'attackMove');
        return;
      }
      this.order = null;
      this.state = 'idle';
    }
    }
    if (this.state === 'attackMove') {
      const range = this.def.range * TILE * 1.5;
      const foe = this.world.acquireFor(this, range);
      if (foe) this.setOrder({ type: 'attackTarget', target: foe });
    }
  }

  inWeaponRange(target) {
    const bonus = this.sieged ? (this.def.siege ? this.def.siege.range : 0) - this.def.range : 0;
    const r = (this.def.range * TILE) + bonus * TILE + this.radius + target.radius;
    return Math.hypot(target.x - this.x, target.y - this.y) <= r;
  }

  // SC1 patrol: ping-pong between two points, firing at anything in sight
  updatePatrol(dt) {
    const pts = this.patrolPoints;
    if (!pts || pts.length < 2) { this.state = 'idle'; this.order = null; return; }
    const foe = this.world.acquireFor(this, this.def.range * TILE * 1.4);
    if (foe && this.def.damage > 0) { this._patrolResume = pts; this.setOrder({ type: 'attackTarget', target: foe }); return; }
    const tgt = pts[this._patrolIdx = (this._patrolIdx ?? 0)] || pts[0];
    if (!this.path.length || this.pathIndex >= this.path.length || this.needsPath) { this.needsPath = false; this.repath(tgt.x, tgt.y); }
    if (this.stepAlongPath(dt)) {
      this._patrolIdx = this._patrolIdx === 0 ? 1 : 0;
      this.repath(pts[this._patrolIdx].x, pts[this._patrolIdx].y);
    }
  }

  // SC1 medic micro: when idle, auto-seek the most wounded friendly nearby and heal
  updateAutoHeal(dt) {
    this._autoHealT = (this._autoHealT || 0) - dt;
    if (this._autoHealT > 0) return this.order?.type === 'heal';
    this._autoHealT = 0.6;
    let best = null, bestScore = 0;
    const r = TILE * 8;
    for (const o of this.world.units) {
      if (o.dead || o.loaded || o.team !== this.team || o === this || o.def.flying) continue;
      const missing = 1 - o.hp / o.maxHp;
      if (missing < 0.25) continue;
      const d = Math.hypot(o.x - this.x, o.y - this.y);
      if (d > r) continue;
      const score = missing * 10 - d / TILE * 0.4;
      if (score > bestScore) { bestScore = score; best = o; }
    }
    if (best) { this.setOrder({ type: 'heal', target: best }); return true; }
    return false;
  }

  // SC1: dropship loads friendly ground units when adjacent
  updateLoadUnit(dt) {
    const t = this.loadTarget;
    if (!t || t.dead || t.loaded || !this.def.transport) { this.loadTarget = null; this.order = null; this.state = 'idle'; return; }
    const d = Math.hypot(t.x - this.x, t.y - this.y);
    if (d > TILE * 1.6) {
      if (this.needsPath || this.pathIndex >= this.path.length) { this.needsPath = false; this.repath(t.x, t.y); }
      this.stepAlongPath(dt);
      return;
    }
    if (this.carry.length + (t.def.supply || 1) <= this.def.transport) {
      this.world.loadUnitInto(this, t);
      this.world.audio?.orderPing?.();
    }
    this.loadTarget = null; this.order = null; this.state = 'idle';
  }

  // SC1: dropship unloads all passengers at destination
  updateUnload(dt) {
    const p = this.unloadAt;
    if (!p) { this.order = null; this.state = 'idle'; return; }
    const d = Math.hypot(p.x - this.x, p.y - this.y);
    if (d > TILE * 1.2) {
      if (this.needsPath || this.pathIndex >= this.path.length) { this.needsPath = false; this.repath(p.x, p.y); }
      this.stepAlongPath(dt);
      return;
    }
    this.world.unloadAll(this);
    this.unloadAt = null; this.order = null; this.state = 'idle';
  }

  // SC1: medic heals friendly target in range (restores hp, green link)
  updateHeal(dt) {
    const t = this.healTarget;
    if (!t || t.dead || t.hp >= t.maxHp) { this.healTarget = null; this.order = null; this.state = 'idle'; if (this.def.worker) this.setOrder({ type: 'harvest' }); return; }
    const r = (this.def.heal?.range || 3) * TILE;
    const d = Math.hypot(t.x - this.x, t.y - this.y);
    if (d > r) {
      if (this.needsPath || this.pathIndex >= this.path.length) { this.needsPath = false; this.repath(t.x, t.y); }
      this.stepAlongPath(dt);
      return;
    }
    if (this.path.length) { this.path = []; } // stand still while healing
    this._healT = (this._healT || 0) - dt;
    if (this._healT <= 0) {
      this._healT = this.def.heal?.interval || 0.5;
      const amt = Math.min(this.def.heal?.amount || 4, t.maxHp - t.hp);
      t.hp += amt;
      if (t.shield !== undefined && t.maxShield > 0 && t.shield < t.maxShield) { /* SC1 heal only hp */ }
      if (this.world.camNear && this.world.camNear(this.x, this.y)) {
        if (!this._healBeam) this._healBeam = this.world.add.graphics().setDepth(26);
        this._healBeam.clear();
        this._healBeam.lineStyle(1.5, 0x6ee7a0, 0.6 + Math.sin(this.world.time.now / 100) * 0.25);
        this._healBeam.lineBetween(this.x, this.y, t.x, t.y);
        const cp = this.world.add.circle(t.x, t.y - 12, 2, 0x6ee7a0, 0.9).setDepth(47);
        this.world.tweens.add({ targets: cp, y: t.y - 22, alpha: 0, duration: 450, onComplete: () => cp.destroy() });
      }
      this.world.audio?.harvest?.();
    }
  }

  // SC1 carriers launch interceptors that orbit and auto-strike nearby foes
  updateInterceptors(dt) {
    if (!this.interceptors) {
      this.interceptors = [];
      for (let i = 0; i < 4; i++) {
        const g = this.world.add.graphics().setDepth(42);
        g.fillStyle(0xcfe0ff, 0.95); g.fillRect(-2, -1.2, 4, 2.4);
        this.interceptors.push({ g, a: (i / 4) * Math.PI * 2, cd: 0, dive: null });
      }
    }
    const foe = this.world.findNearestEnemy(this.x, this.y, this.def.range * TILE * 1.3, false, true);
    for (const it of this.interceptors) {
      it.cd -= dt;
      if (it.dive && (it.dive.dead || Math.hypot(it.x - it.dive.x, it.y - it.dive.y) < 8)) {
        if (it.dive && !it.dive.dead) this.world.applyHit(it.dive, this.def.damage, 0);
        it.dive = null; it.cd = 1.4 + Math.random();
      }
      let tx, ty;
      if (it.dive && !it.dive.dead) {
        tx = it.dive.x; ty = it.dive.y;
      } else {
        if (foe && it.cd <= 0 && !this.cloaked) { it.dive = foe; }
        const orbitR = 26;
        it.a += dt * 2.4;
        tx = this.x + Math.cos(it.a) * orbitR; ty = this.y + Math.sin(it.a) * orbitR * 0.55 + 6;
      }
      const speed = it.dive ? 260 : 120;
      const d = Math.hypot(tx - (it.x ?? this.x), ty - (it.y ?? this.y)) || 1;
      if (it.x === undefined) { it.x = this.x; it.y = this.y; }
      it.x += ((tx - it.x) / d) * Math.min(speed * dt, d);
      it.y += ((ty - it.y) / d) * Math.min(speed * dt, d);
      it.g.setPosition(it.x, it.y);
    }
  }

  updateAttackTarget(dt) {
    const target = this.target;
    if (!target || target.dead) {
      // acquire next
      const foe = this.world.acquireFor(this, this.def.range * TILE * 2);
      if (foe) { this.target = foe; return; }
      if (this._patrolResume && this.def.patrol) { const pts = this._patrolResume; this._patrolResume = null; this.patrolPoints = pts; this.order = { type: 'patrol' }; this.state = 'patrol'; return; }
      if (this.state !== 'attackMove') { this.order = null; this.state = 'idle'; }
      return;
    }
    if (this.inWeaponRange(target)) {
      // face target & fire
      this.sprite.setFlipX(target.x < this.x);
      if (this.attackTimer <= 0 && !this.firingVolley) {
        this.fireAt(target);
        this.attackTimer = this.def.cooldown * (this.sieged ? (this.def.siege ? this.def.siege.cooldown / this.def.cooldown : 1) : 1);
      }
    } else {
      if (this.sieged) { this.unsiege(); return; } // must unsiege to move
      this.repathTimer -= dt;
      if (this.repathTimer <= 0 || this.path.length === 0 || this.pathIndex >= this.path.length) {
        this.repathTimer = 0.5;
        this.repath(target.x, target.y);
      }
      this.stepAlongPath(dt);
    }
  }

  // SC1 siege mode — tank anchors, longer range, bigger splash, slower firing
  siegeUp() {
    if (!this.def.siege || this.sieged) return false;
    this.sieged = true;
    this.order = null; this.path = [];
    this.sprite.setScale((this.baseScale || 1) * 1.18);
    this.sprite.setTint(0xd8c8a0);
    const leg = this.world.add.rectangle(this.x, this.y + this.radius + 2, 14, 4, 0x3c434c, 1).setDepth(29);
    this._siegeLegs = leg;
    this.world.audio?.siege?.();
    return true;
  }

  unsiege() {
    if (!this.sieged) return false;
    this.sieged = false;
    this.sprite.setScale(this.baseScale || 1);
    this.sprite.clearTint();
    if (this._siegeLegs) { this._siegeLegs.destroy(); this._siegeLegs = null; }
    return true;
  }

  addKill() {
    this.kills++;
    const lv = Math.min(3, (this.kills / 6) | 0);
    if (lv > this.level) {
      this.level = lv;
      this.bonusDamage += 1; this.bonusArmor += 1;
      for (let i = 0; i <= lv; i++) {
        const ch = this.world.add.triangle(-6 + i * 5, -this.radius - 12, 0, 4, 4, 0, 2, 0, 0xffd23f, 0.95).setDepth(31);
        this.container.add(ch);
        this._chevrons.push(ch);
      }
      if (this.world.camNear && this.world.camNear(this.x, this.y)) {
        const t = this.world.add.text(this.x, this.y - 24, 'PROMOTED', { fontFamily: 'Menlo, monospace', fontSize: '10px', color: '#ffd23f', fontStyle: 'bold' }).setOrigin(0.5).setDepth(75);
        this.world.tweens.add({ targets: t, y: this.y - 36, alpha: 0, duration: 900, onComplete: () => t.destroy() });
      }
    }
  }

  fireAt(target) {
    if (this.cloaked) { this.cloaked = false; this.sprite.setAlpha(1); this._uncloakT = 2; }
    // SC1 dark archon feedback: drain target energy, 1 dmg per missing point
    if (this.def.feedback && target && !target.dead && target.maxEnergy > 0 && this.energy >= 45) {
      this.energy -= 45;
      const drained = Math.max(0, target.maxEnergy - target.energy);
      target.energy = target.maxEnergy;
      target.takeDamage(Math.max(5, drained), this);
      if (this.world.camNear && this.world.camNear(this.x, this.y)) {
        const g = this.world.add.text(target.x, target.y - 18, 'FEEDBACK', { fontFamily: 'Menlo, monospace', fontSize: '10px', color: '#c9a0ff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(75);
        this.world.tweens.add({ targets: g, y: target.y - 30, alpha: 0, duration: 700, onComplete: () => g.destroy() });
      }
      this.world.audio?.psiCast?.();
      return;
    }
    const dmg = effectiveDamage(this, target);
    // SC1: unit-level veterancy damage aura
    const lvl = this.level || 0;
    const volley = this.def.attacksPerVolley || 1;
    for (let v = 0; v < volley; v++) {
      const off = volley > 1 ? { x: (Math.random() * 24 - 12), y: (Math.random() * 16 - 8) } : { x: 0, y: 0 };
      const from = { x: this.x + off.x * 0.2, y: this.y + off.y * 0.2 };
      const tgt = v === 0 ? target : (this.world.findNearestEnemy(this.x + (Math.random() * 40 - 20), this.y + (Math.random() * 40 - 20), this.def.range * TILE * 1.2, this.flying, !this.flying) || target);
      this.world.spawnProjectile({
        from,
        target: tgt,
        damage: dmg + lvl * 2,
        splash: this.def.splash ? (this.sieged ? this.def.siege.splash : this.def.splash.radius) * TILE : 0,
        team: this.team,
        kind: this.kind,
        speed: this.kind === 'tank' ? (this.sieged ? 1100 : 900) : 620,
        attacker: this
      });
    }
    // muzzle flash + attack windup feel
    if (this.world.camNear && this.world.camNear(this.x, this.y)) {
      const m = this.world.add.image(this.x + (target.x > this.x ? 10 : -10), this.y - 2, 'spark').setDepth(55).setScale(this.sieged ? 2.4 : 1.3);
      this.world.tweens.add({ targets: m, scale: 0.2, alpha: 0, duration: 130, onComplete: () => m.destroy() });
      if (this.world.flash) {
        const psionic = this.race === 'protoss' || ['zealot', 'dragoon', 'htemplar', 'dtemplar', 'highTemplar', 'darkTemplar', 'archon', 'carrier', 'reaver'].includes(this.kind);
        this.world.flash(this.x + (target.x > this.x ? 12 : -12), this.y - 2, psionic ? 0x8fd0ff : (this.def.size === 'large' ? 0xffc24a : 0xffe9a0), this.def.size === 'large' ? 2.2 : 1.2);
      }
      if (this.sieged) this.world.shake?.(2.5, 0.15);
    }
    this.sprite.setScale((this.baseScale || 1) * (this.sieged ? 1.18 : 1), (this.sieged ? 1.18 : 1) * 0.92);
    this.world.time.delayedCall(90, () => { if (this.sprite && !this.dead) this.sprite.setScale(this.baseScale || (this.flying ? 1.06 : 1)); });
    if (this.def.castAbility === 'storm' && this.energy >= 75 && this.target === target) {
      // high templar auto-casts psi storm at clustered foes
      const cluster = this.world.units.filter(u => !u.dead && u.team !== this.team && Math.hypot(u.x - target.x, u.y - target.y) < 60).length;
      if (cluster >= 3) { this.world.castUnitPsiStorm(this, target.x, target.y); }
    }
    if (this.def.spiderMine && this.spiderCharges === undefined) this.spiderCharges = 3;
    if (this.def.spiderMine && this.spiderCharges > 0 && Math.hypot(target.x - this.x, target.y - this.y) < TILE * 2) {
      this.spiderCharges--;
      this.world.placeSpiderMine(this.x - (target.x > this.x ? 20 : -20), this.y - (target.y > this.y ? 20 : -20), this.team);
      this.world.events.emit('hud:alert', 'SPIDER MINE PLACED');
    }
    this.world.audio?.attack(this.kind);
  }

  // ---------- harvesting ----------
  findNearestPatch() { return this.world.nearestMineralPatch(this, 9999); }
  findNearestGeyser() { return this.world.nearestGeyser(this); }

  // SC1 gas harvest cycle: geyser -> refinery, 8 per trip
  updateHarvestGas(dt) {
    const g = this.gasTarget;
    if (!g || g.gas <= 0 || g.building?.dead) { this.gasTarget = null; this.setOrder({ type: 'harvest' }); return; }
    if (this.cargo >= 8) { this.setOrder({ type: 'returnCargo' }); return; }
    const d = Math.hypot(g.x - this.x, g.y - this.y);
    if (d > TILE * 1.2) {
      if (this.pathIndex >= this.path.length || this.needsPath) { this.needsPath = false; this.repath(g.x, g.y); }
      this.stepAlongPath(dt);
      return;
    }
    this.harvestTimer -= dt;
    if (this.harvestTimer <= 0) {
      this.harvestTimer = 2.2;
      const amt = Math.min(8 - this.cargo, g.gas);
      this.cargo += amt; this.cargoGas = true; g.gas -= amt;
      this.world.audio?.harvest?.();
      const cp = this.world.add.circle(this.x, this.y - 10, 2.5, 0x7dffd9, 0.95).setDepth(47);
      this.world.tweens.add({ targets: cp, y: this.y - 18, alpha: 0, duration: 500, onComplete: () => cp.destroy() });
    }
  }

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
    // SC1 tractor beam while mining
    if (!this._beam) {
      this._beam = this.world.add.graphics().setDepth(26);
    }
    if (d < TILE * 1.1) {
      this._beam.clear();
      this._beam.lineStyle(1.5, 0x7dffd9, 0.5 + Math.sin(this.world.time.now / 90) * 0.2);
      this._beam.lineBetween(this.x, this.y, t.x, t.y);
    }
    if (this.harvestTimer <= 0) {
      this.harvestTimer = 2.6;
      const amt = Math.min(8 - this.cargo, t.amount);
      this.cargo += amt; t.amount -= amt;
      this.world.onMineralDug(this, t, amt);
      // cargo pop above worker
      const cp = this.world.add.circle(this.x, this.y - 10, 2.5, 0x7db4ff, 0.95).setDepth(47);
      this.world.tweens.add({ targets: cp, y: this.y - 18, alpha: 0, duration: 500, onComplete: () => cp.destroy() });
      if (t.amount <= 0) { this.harvestTarget = null; this.world.depleteMineral(t); }
      if (this._beam) this._beam.clear();
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
    const wasGas = this.cargoGas;
    this.cargoGas = false;
    this.harvestTarget = null;
    this.setOrder(this.gasTarget && wasGas ? { type: 'harvestGas' } : { type: 'harvest' });
  }

  // SC1: SCV repair — right-click your own damaged structure
  updateRepair(dt) {
    const b = this.order?.repairTarget;
    if (!b || b.dead || b.hp >= b.maxHp) { this.order = null; this.setOrder({ type: 'harvest' }); return; }
    const d = Math.hypot(b.x - this.x, b.y - this.y);
    if (d > (b.def.w * TILE) / 2 + 18) {
      if (this.pathIndex >= this.path.length || this.needsPath) { this.needsPath = false; this.repath(b.x, b.y + (b.def.h * TILE) / 2); }
      this.stepAlongPath(dt);
      return;
    }
    this._repairT = (this._repairT || 0) - dt;
    if (this._repairT <= 0) {
      this._repairT = 0.6;
      b.hp = Math.min(b.maxHp, b.hp + 8);
      if (this.world.camNear && this.world.camNear(this.x, this.y)) {
        const sp = this.world.add.rectangle(b.x + (Math.random() * 24 - 12), b.y - 6, 2, 4, 0x7dffd9, 0.9).setDepth(25).setRotation(Math.random() * 6.28);
        this.world.tweens.add({ targets: sp, y: sp.y + 10, alpha: 0, duration: 300, onComplete: () => sp.destroy() });
      }
      this.world.audio?.harvest?.();
    }
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

  // SC1: infantry garrison into a bunker — invisible, bunker fires for them
  garrison(b) {
    this.garrisonedIn = b;
    this.loaded = true;
    this.state = 'garrisoned';
    this.order = null; this.path = [];
    this.container.setVisible(false);
  }

  emerge(x, y) {
    this.garrisonedIn = null;
    this.loaded = false;
    this.container.setVisible(true);
    this.container.setPosition(x ?? this.x, y ?? this.y);
    this.setOrder({ type: 'attackMove', point: { x: (x ?? this.x) + 40, y: (y ?? this.y) + 40 } });
  }

  // transport loading: hide unit inside the transport
  intoTransport() {
    this.loaded = true;
    this.state = 'loaded';
    this.order = null; this.path = [];
    this.container.setVisible(false);
  }

  outOfTransport(x, y) {
    this.loaded = false;
    this.container.setVisible(true);
    this.container.setPosition(x, y);
    this.setOrder({ type: 'attackMove', point: { x, y } });
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
    if (this.hp <= 0) {
      if (attacker && attacker.addKill && attacker.team === 0) attacker.addKill();
      this.die();
    }
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    if (this.interceptors) { for (const it of this.interceptors) it.g.destroy(); this.interceptors = null; }
    if (this._beam) { this._beam.destroy(); this._beam = null; }
    if (this._siegeLegs) { this._siegeLegs.destroy(); this._siegeLegs = null; }
    if (this._healBeam) { this._healBeam.destroy(); this._healBeam = null; }
    // transport destroyed: passengers die with it (SC1)
    if (this.carry && this.carry.length) {
      for (const p of this.carry) { if (p && !p.dead) { p.loaded = false; p.container.setVisible(true); p.takeDamage(9999, null); } }
      this.carry = [];
    }
    // garrisoned in a bunker that died: emerge automatically
    if (this.garrisonedIn) { const b = this.garrisonedIn; this.garrisonedIn = null; this.loaded = false; this.container.setVisible(true); if (!b.dead) b.garrison = (b.garrison || []).filter(x => x !== this); this.issueMove(this.x + 30, this.y + 30, true); }
    this.world.onUnitDeath(this);
    const boom = this.world.add.image(this.x, this.y, 'explosion');
    boom.setDepth(60).setScale(this.def.size === 'large' ? 1.4 : 0.8);
    if (this.world.flash) this.world.flash(this.x, this.y, 0xff9c3c, this.def.size === 'large' ? 3 : 1.6, 260);
    this.world.tweens.add({ targets: boom, scale: (this.def.size === 'large' ? 2.2 : 1.4), alpha: 0, duration: 320, onComplete: () => boom.destroy() });
    // debris shards
    if (this.world.camNear && this.world.camNear(this.x, this.y)) {
      for (let i = 0; i < 5; i++) {
        const d = this.world.add.image(this.x, this.y, 'spark').setDepth(58).setScale(0.8 + Math.random());
        this.world.tweens.add({ targets: d, x: this.x + (Math.random() * 40 - 20), y: this.y + (Math.random() * 40 - 20) + 10, alpha: 0, duration: 420, onComplete: () => d.destroy() });
      }
    }
    // SC1: persistent gore decal per race under the corpse
    const goreKey = `gore-${this.def.race || 'terran'}`;
    const gd = this.world.textures.exists(goreKey) ? goreKey : 'scorch';
    const decal = this.world.add.image(this.x, this.y, gd);
    decal.setDepth(6).setAlpha(0.6).setRotation(Math.random() * 6.28).setScale(this.def.size === 'large' ? 1.35 : 0.75);
    this.world.tweens.add({ targets: decal, alpha: 0.22, duration: 30000 });
    // fresh minor splats around the kill site
    if (this.world.camNear && this.world.camNear(this.x, this.y)) {
      for (let i = 0; i < 3; i++) {
        const s2 = this.world.add.image(this.x + (Math.random() * 30 - 15), this.y + (Math.random() * 30 - 15), gd).setDepth(5).setAlpha(0.4).setScale(0.35 + Math.random() * 0.3).setRotation(Math.random() * 6.28);
        this.world.tweens.add({ targets: s2, alpha: 0.12, duration: 20000 });
      }
    }
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
    this.garrison = []; // units loaded into bunker
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
    if (this.built) { this.onBuilt(); this.world.nav.blockRect(this.id, this.tileX0(), this.tileY0(), this.tileX1(), this.tileY1()); }
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
    this.world.nav.blockRect(this.id, this.tileX0(), this.tileY0(), this.tileX1(), this.tileY1()); // SC1: completed structures block ground paths
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
    if (this.world.flash) this.world.flash(this.x, this.y, 0xff9c3c, s * 1.2, 420);
    this.world.tweens.add({ targets: boom, scale: s * 1.4, alpha: 0, duration: 500, onComplete: () => boom.destroy() });
    this.world.audio?.death(true);
    // SC1: persistent burning rubble — smoldering ruin stays on the battlefield
    const rub = this.world.add.image(this.x, this.y, 'rubble');
    rub.setDepth(7).setScale(Math.max(1, s * 0.9)).setAlpha(0.95).setRotation(Math.random() * 6.28);
    // flickering fires on the ruin
    const fires = [];
    const makeFire = () => {
      const f = this.world.add.image(this.x + (Math.random() * s * 18 - s * 9), this.y + (Math.random() * s * 10 - s * 5), 'spark').setDepth(8).setScale(0.8 + Math.random());
      this.world.tweens.add({ targets: f, alpha: 0, y: f.y - 14 - Math.random() * 10, scale: 0.2, duration: 500 + Math.random() * 400, onComplete: () => f.destroy() });
    };
    const fireIv = this.world.time.addEvent({ delay: 320, repeat: 24, callback: makeFire });
    fires.push(fireIv);
    this.world.tweens.add({ targets: rub, alpha: 0.55, duration: 25000 });
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
    if (t.at && t.at !== this.buildId && this.morphedTo !== t.at) return false;
    if (t.requiresTech && !this.world.techResearched(this.team, t.requiresTech)) return false;
    if (this.queue.some(q => q.research === techId)) return false;
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
    // SC1 bunker: each garrisoned infantry fires its own shot from the slit
    if (this.def.garrisonDefense && this.built && this.garrison.length) {
      this.attackTimer -= dt;
      if (this.attackTimer <= 0) {
        const gd = this.def.garrisonDefense;
        const foe = this.world.findNearestEnemy(this.x, this.y, gd.range * TILE, false, true);
        if (foe) {
          for (const g of this.garrison.slice(0, 4)) {
            if (g.dead) continue;
            const mult = SIZE_MULT[g.def.attackType || gd.attackType]?.[foe.def.size] ?? 1;
            const dmg = Math.max(1, Math.round((g.def.damage || gd.damage) * mult - foe.def.armor));
            this.world.spawnProjectile({ from: { x: this.x + (Math.random() * 20 - 10), y: this.y - 8 }, target: foe, damage: dmg, splash: 0, team: this.team, kind: 'marine', speed: 640, attacker: g });
            g._bunkerShot = true;
          }
          this.attackTimer = gd.cooldown;
          this.world.audio?.attack('marine');
        }
      }
      // garrisoned troops slowly heal behind the plating
      for (const g of this.garrison) if (!g.dead && g.hp < g.maxHp) g.hp = Math.min(g.maxHp, g.hp + dt * 2);
      this.garrison = this.garrison.filter(g => !g.dead);
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
