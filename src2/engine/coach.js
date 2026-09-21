// v2.65.0 TRAINING COACH — forced-click interactive tutorial (playability pass)
// While a forced step is armed, clicks OUTSIDE the highlighted target are
// swallowed: world selection is suppressed (restoring the prior selection),
// right-click orders are gated to the target, and HUD clicks outside the
// highlighted card button do nothing. The correct click passes through and the
// original handler runs untouched. Never hard-locks: persistent [ SKIP ] link,
// watchdog nudges, auto-spawn fallbacks.
import { TILE, RACE_INFO, BUILDINGS, UNITS } from '../data/sc1.js';

export class Coach {
  constructor(battle) {
    const b = battle;
    this.b = b;
    this.active = true;
    this.i = 0;
    this.stepAt = 0;
    this.hintPulse = 0;
    this.suppress = false;       // this pointer gesture was blocked
    this._preSel = [];          // selection snapshot for suppression restore
    this._dummyFoe = null;
    this._buildSpot = null;
    this.markerTarget = null;

    this.race = b.race;
    this.workerKind = (RACE_INFO[this.race] || {}).workers?.[0] || 'rigger';
    this.buildOrder = ((RACE_INFO[this.race] || {}).buildingOrder || ['barracks']).filter(bid => BUILDINGS[bid]);
    // production building = first in order that trains a NON-worker fighter
    this.prodBid = this.buildOrder.find(bid => (BUILDINGS[bid]?.produces || []).some(k => UNITS[k] && !UNITS[k].worker)) || this.buildOrder[0] || 'barracks';
    let tk = (BUILDINGS[this.prodBid]?.produces || []).find(k => UNITS[k] && !UNITS[k].worker) || 'marine';
    this.trainKind = UNITS[tk] ? tk : 'marine';
    let et = Object.keys(UNITS).find(k => UNITS[k].race === b.enemyRace && !UNITS[k].worker && !UNITS[k].flying && (UNITS[k].targets || 'ground') !== 'air' && UNITS[k].build);
    this.enemyTrainKind = et || 'skarnling';

    this.steps = this.buildSteps();

    // ---- UI layer (screen space) ----
    this.g = b.add.graphics().setScrollFactor(0).setDepth(935);
    this.bar = b.add.text(0, 0, '', {
      fontFamily: 'Menlo, monospace', fontSize: '14px', fontWeight: '700',
      color: '#ffd23f', backgroundColor: '#050a14e6', padding: { x: 14, y: 9 }, align: 'center',
    }).setOrigin(0.5, 1).setDepth(950).setScrollFactor(0);
    this.sub = b.add.text(0, 0, '', {
      fontFamily: 'Menlo, monospace', fontSize: '11px', color: '#9fb3d8',
      backgroundColor: '#050a14c0', padding: { x: 8, y: 3 }, align: 'center',
    }).setOrigin(0.5, 0).setDepth(950).setScrollFactor(0);
    this.skipBtn = b.add.text(0, 0, '[ SKIP TRAINING ]', {
      fontFamily: 'Menlo, monospace', fontSize: '11px', color: '#8fa3c8',
      backgroundColor: '#0a1220d0', padding: { x: 8, y: 4 },
    }).setOrigin(1, 0).setDepth(951).setScrollFactor(0).setInteractive({ useHandCursor: true });
    this.skipBtn.on('pointerdown', (p, x, y, e) => { if (e) e.stopPropagation(); this.finish(false); });
    this.skipBtn.on('pointerover', () => this.skipBtn.setColor('#ffd23f'));
    this.skipBtn.on('pointerout', () => this.skipBtn.setColor('#8fa3c8'));
    this.layout();
    this._onResize = () => this.layout();
    b.scale.on('resize', this._onResize);

    // ---- input gate: Battle's own pointerdown handler consults onDown() at its top
    // (early-return there; pointerup needs no gate — dragStart never gets set) ----
    // auto-skim: any STARTED free gesture outside the forced target during a forced
    // world/rightworld step is vetoed at pointerup too (railway without hard-locking
    // the ghost drag: a move held <1.2s can still freely reposition the ghost)
    this._pveto = (p) => {
      if (!this.active) return;
      const s = this.step;
      if (!s || !s.force || b.placing || (s.mode !== 'world' && s.mode !== 'rightworld')) return;
      const sp = b.input.activePointer;
      if (!sp.isDown) return;
      if (p.x > b.scale.width - 160 && p.y < 76) return;
      const sb2 = this.skipBtn.getBounds();
      if (sb2 && p.x >= sb2.x - 6 && p.x <= sb2.right + 6 && p.y >= sb2.y - 6 && p.y <= sb2.bottom + 6) return;
      const wp = b.worldFor(p);
      const t = s.target?.();
      if (t && Math.hypot(t.x - wp.x, t.y - wp.y) < (s.radius || 30)) { this.suppress = false; return; } // back on target — gesture valid again
      if (!this.suppress) this._preSel = [...b.selection]; // snapshot once per gesture
      this.suppress = true;
    };
    b.input.on('pointermove', this._pveto);
    this._pu = () => {
      if (!this.active) { this.suppress = false; return; }
      if (!this.suppress) return;
      this.suppress = false;
      b.dragStart = null; // battle's own pointerup early-returns: no clickSelect/boxSelect
      const s = this.step;
      b.clearSelection();
      this._preSel.forEach(u => { if (!u.dead) b.addToSelection(u); });
      b.input.setDefaultCursor('default');
      this.nudge(s && (s.mode === 'rightworld' ? 'RIGHT-CLICK THE RED TARGET' : 'CLICK THE PULSING TARGET'));
    };
    b.input.on('pointerup', this._pu);

    b.events.once('shutdown', () => {
      b.scale.off('resize', this._onResize);
    });

    // No upkeep in the sim: objectives are the coach steps themselves.
    b.objectives = [{ id: 'training', text: 'TRAINING SIM — follow the pulsing rings (step 1/12)', done: false }];
    b.events.emit('hud:alert', 'TRAINING MODE — WEAKENED ENEMY · FOLLOW THE PULSING RINGS');
    this.showStep(0);
  }

  get step() { return this.steps[this.i]; }

  buildSteps() {
    const b = this.b;
    const prod = this.prodBid;
    const prodDef = BUILDINGS[prod];
    const prodName = prodDef ? prodDef.name.split(' ')[0].toUpperCase() : 'BARRACKS';
    const wkName = { rigger: 'RIGGER', skarling: 'SKARLING', artificer: 'ARTIFICER' }[this.workerKind] || this.workerKind.toUpperCase();
    const tkName = (UNITS[this.trainKind]?.name || this.trainKind).split(' ')[0].toUpperCase();
    const wkRe = new RegExp(this.workerKind.slice(0, 4), 'i');   // 'skarling' vs 'skarnling' safe
    const tkRe = new RegExp((UNITS[this.trainKind]?.name || this.trainKind).split(' ')[0], 'i');
    const prodRe = new RegExp((prodDef?.name || prod).split(' ')[0], 'i');
    const workerSel = () => b.selection && [...b.selection].some(u => u.kind === this.workerKind);
    const S = [];
    S.push({
      id: 'select_mcv', force: true, mode: 'world',
      tip: 'LEFT-CLICK your starter vehicle', sub: 'This one vehicle becomes your whole base',
      target: () => b.units.find(u => u.team === 0 && !u.dead && u.def.mcv),
      radius: 30, cam: true,
      done: () => b.selection && [...b.selection].some(u => u.def && u.def.mcv),
    });
    S.push({
      id: 'deploy', force: true, mode: 'button',
      tip: 'CLICK the DEPLOY button', sub: 'Instant base — it costs nothing',
      btn: (hud) => hud.buttons.find(x => !x.disabled && /DEPLOY/i.test(String(x.txt?.text || ''))),
      done: () => b.buildings.some(x => x.team === 0 && x.def.primary),
    });
    S.push({
      id: 'select_base', force: true, mode: 'world',
      tip: 'CLICK your new COMMAND STRUCTURE', sub: 'The command card shows what it can build',
      target: () => b.buildings.find(x => x.team === 0 && x.def.primary && !x.dead),
      radius: 44, cam: true,
      done: () => b.selectedBuilding && b.selectedBuilding.def.primary,
    });
    S.push({
      id: 'train_worker', force: true, mode: 'button',
      tip: `CLICK the ${wkName} button`, sub: `Costs ${UNITS[this.workerKind]?.minerals || 50} minerals — train your first WORKER`,
      btn: (hud) => hud.buttons.find(x => !x.disabled && wkRe.test(String(x.txt?.text || ''))),
      done: () => b.units.some(u => u.team === 0 && u.kind === this.workerKind && !u.dead),
    });
    S.push({
      id: 'select_worker', force: true, mode: 'world',
      tip: `CLICK your new ${wkName}`, sub: 'WORKERS build everything in this game',
      target: () => b.units.find(u => u.team === 0 && u.kind === this.workerKind && !u.dead),
      radius: 24, cam: true,
      waitBefore: () => b.units.some(u => u.team === 0 && u.kind === this.workerKind && !u.dead),
      done: workerSel,
    });
    S.push({
      id: 'harvest', force: true, mode: 'rightworld',
      tip: 'RIGHT-CLICK the glowing MINERAL field', sub: 'Workers mine crystals and haul them home automatically',
      target: () => {
        const cc = b.buildings.find(x => x.team === 0 && x.def.primary);
        return b.minerals.filter(m => cc && Math.hypot(m.x - cc.x, m.y - cc.y) < TILE * 24).sort((m1, m2) => Math.hypot(m1.x - cc?.x, m1.y - cc?.y) - Math.hypot(m2.x - cc?.x, m2.y - cc?.y))[0] || b.minerals[0];
      },
      radius: 36, cam: true,
      done: () => this._minedClick && b.units.some(u => u.team === 0 && u.kind === this.workerKind && !u.dead),
    });
    S.push({
      id: 'click_build', force: true, mode: 'button',
      tip: `CLICK ${prodName} in the command card`, sub: `Your ${prodName} trains ${tkName} fighters`,
      btn: (hud) => hud.buttons.find(x => !x.disabled && prodRe.test(String(x.txt?.text || ''))),
      // worker select keeps the build row; if player deselected, auto re-select workers
      pre: () => { if (!workerSel()) { const ws = b.units.filter(u => u.team === 0 && u.kind === this.workerKind && !u.dead); if (ws.length) { ws.forEach(w => b.addToSelection(w)); } } },
      done: () => !!b.placing || b.buildings.some(x => x.team === 0 && x.buildId === prod),
    });
    S.push({
      id: 'place_building', force: true, mode: 'world',
      tip: `CLICK the pulsing GREEN circle`, sub: `Build the ${prodName} right there — flat ground near minerals`,
      target: () => this.buildSpot(),
      radius: 40, cam: true,
      done: () => b.buildings.some(x => x.team === 0 && x.buildId === prod),
    });
    S.push({
      id: 'click_prod_building', force: true, mode: 'world',
      tip: `CLICK your ${prodName}`, sub: 'Open its production card',
      target: () => b.buildings.find(x => x.team === 0 && x.buildId === prod && x.built),
      radius: 44, cam: true,
      waitBefore: () => b.buildings.some(x => x.team === 0 && x.buildId === prod && x.built),
      done: () => b.selectedBuilding && b.selectedBuilding.buildId === prod && b.selectedBuilding.built,
    });
    S.push({
      id: 'train_fighter', force: true, mode: 'button',
      tip: `CLICK the ${tkName} button`, sub: 'Trains your first soldier from your mined minerals',
      btn: (hud) => hud.buttons.find(x => !x.disabled && tkRe.test(String(x.txt?.text || ''))),
      // barracks production row: if selection was lost, re-select the building
      pre: () => { if (!(b.selectedBuilding && b.selectedBuilding.buildId === prod)) { const bb = b.buildings.find(x => x.team === 0 && x.buildId === prod && x.built); if (bb) b.selectBuilding(bb); } },
      done: () => b.units.some(u => u.team === 0 && u.kind === this.trainKind && !u.dead),
    });
    S.push({
      id: 'select_fighter', force: true, mode: 'world',
      tip: `CLICK your ${tkName}`, sub: 'Select your fighter',
      target: () => b.units.find(u => u.team === 0 && u.kind === this.trainKind && !u.dead),
      radius: 26, cam: true,
      done: () => b.selection && [...b.selection].some(u => u.kind === this.trainKind),
    });
    S.push({
      id: 'kill_foe', force: true, mode: 'rightworld',
      tip: 'RIGHT-CLICK the ENEMY SCOUT — ATTACK!', sub: 'Weak scout. Click it and watch your soldier fight',
      target: () => {
        if (!this._dummyFoe && b.gameTime - this.stepAt > 6) this.spawnDummy();
        return this._dummyFoe || b.units.find(u => u.team === 0 && u.kind === this.trainKind && !u.dead);
      },
      radius: 34, cam: true,
      done: () => this._dummyFoe && this._dummyFoe.dead,
    });
    return S;
  }

  buildSpot() {
    if (this._buildSpot) return this._buildSpot;
    const b = this.b, prod = this.prodBid;
    const cc = b.buildings.find(x => x.team === 0 && x.def.primary);
    const SPOTS = [[7, -2], [7, 5], [-8, 2], [5, 7], [-6, -7], [10, 1], [0, 9], [-10, 4], [12, -4], [3, 10]];
    for (const [dx, dy] of SPOTS) {
      // validate at GRID-SNAPPED coords — the placement ghost snaps to TILE rounds;
      // an unrounded spot can read valid while the snapped footprint is not
      const x = Math.round(((cc?.x || TILE * 160 * 0.12) + dx * TILE) / TILE) * TILE;
      const y = Math.round(((cc?.y || TILE * 160 * 0.12) + dy * TILE) / TILE) * TILE;
      if (!b.placementReason || !b.placementReason(prod, x, y)) { this._buildSpot = { x, y }; return this._buildSpot; }
    }
    this._buildSpot = { x: Math.round(((cc?.x || 400) + 5 * TILE) / TILE) * TILE, y: Math.round(((cc?.y || 400) + 5 * TILE) / TILE) * TILE };
    return this._buildSpot;
  }

  spawnDummy() {
    const b = this.b;
    if (this._dummyFoe && !this._dummyFoe.dead) return this._dummyFoe;
    if (this._dummyFoe) return this._dummyFoe;
    let u = b.units.find(x => x.team === 0 && x.kind === this.trainKind && !x.dead);
    if (!u) {
      // watchdog fallback: guarantee the lesson can finish even if training stalled
      u = b.spawnUnit(0, this.trainKind, (b.buildings.find(x => x.team === 0 && x.buildId === this.prodBid)?.x || 300) + 60, (b.buildings.find(x => x.team === 0 && x.buildId === this.prodBid)?.y || 300) + 40, { arriveReady: true });
      if (!u) return null;
    }
    const foe = b.spawnUnit(1, this.enemyTrainKind, u.x + 150, u.y + 30, { arriveReady: true });
    if (!foe) return null;
    foe.maxHp = foe.hp = Math.max(18, Math.round((foe.maxHp || 40) * 0.45));
    foe.bonusDamage = -Math.max(0, Math.floor((foe.def.damage || 6) * 0.7));
    foe._trainingDummy = true;
    foe.issueMove(foe.x + 10, foe.y + 4, false);
    this._dummyFoe = foe;
    b.cameras.main.centerOn(foe.x, foe.y);
    b.events.emit('hud:alert', '⚠ ENEMY SCOUT SPOTTED — RIGHT-CLICK IT TO ATTACK', 0xff5c5c);
    b.audio?.underAttackBark?.();
    return foe;
  }

  layout() {
    const b = this.b, W = b.scale.width, H = b.scale.height;
    this.bar.setPosition(W / 2, H * 0.17);
    this.sub.setPosition(W / 2, H * 0.17 + 4);
    // centered under the instruction stack — the right column is minimap HUD chrome
    // (Hud scene paints over Battle, so skip can't live there)
    this.skipBtn.setPosition(W / 2, H * 0.17 + 34).setOrigin(0.5, 0);
  }

  showStep(i) {
    const b = this.b;
    this.i = i;
    this.stepAt = b.gameTime;
    const s = this.step;
    if (!s) { this.finish(true); return; }
    this.bar.setText(`TRAINING ${i + 1}/${this.steps.length} — ${s.tip}`);
    this.sub.setText(s.sub || '');
    if (b.objectives && b.objectives[0]) b.objectives[0].text = `TRAINING SIM — ${s.tip} (${i + 1}/${this.steps.length})`;
    b.audio?.objective?.();
    if (s.pre) s.pre();
    if (s.mode === 'world' || s.mode === 'rightworld') {
      const t = s.target?.();
      if (t && s.cam) { b.cameras.main.centerOn(t.x, t.y); this.markerTarget = t; }
    }
    if (s.id === 'kill_foe') this.spawnDummy();
  }

  // ---------- input gate ----------
  // returns true = gesture consumed (BattleScene early-returns: no select, no drag, no order)
  onDown(p) {
    if (!this.active) return false;
    const b = this.b, s = this.step;
    if (!s) return false;
    // skip link always clickable (centered under instruction stack)
    const sb = this.skipBtn.getBounds();
    if (sb && p.x >= sb.x - 6 && p.x <= sb.right + 6 && p.y >= sb.y - 6 && p.y <= sb.bottom + 6) return false;
    if (p.button === 2) {
      if (s.force && s.mode === 'rightworld') {
        // gate decision re-checked in gateRight (rightClickOrder at pointerup); allow down through
        return false;
      }
      return false;
    }
    if (b.placing) {
      // click-to-place determinism: a click ON the pulsing target snaps the ghost to the
      // validated spot and places immediately (pointermove-driven snapGhost lags or never
      // fires on low-fps/headless; stale isValid silently rejected the click). Clicks
      // elsewhere keep normal ghost placement — the lesson never mislocates the building.
      const s2 = this.step;
      if (s2 && s2.id === 'place_building') {
        const t = s2.target?.();
        const wp2 = b.worldFor(p);
        if (t && Math.hypot(t.x - wp2.x, t.y - wp2.y) < (s2.radius || 40)) {
          b.snapGhost({ x: t.x, y: t.y });
          if (b.isValid) { b.tryPlace(t.x, t.y); return true; } // consumed — placed on spot
        }
      }
      return false;
    }
    if (s.mode === 'button') {
      const hud = b.scene.get('Hud');
      const btn = hud && s.btn ? s.btn(hud) : null;
      if (btn) {
        if (p.x >= btn.x - 8 && p.x <= btn.x + btn.w + 8 && p.y >= btn.y - 8 && p.y <= btn.y + btn.h + 8) return false; // PASS to HUD
        this.nudge('CLICK THE HIGHLIGHTED BUTTON'); return true;
      }
      return false; // button not on card yet — don't lock the player out
    }
    if (s.mode === 'world' && s.force) {
      const t = s.target?.();
      const wp = b.worldFor(p);
      if (t && Math.hypot(t.x - wp.x, t.y - wp.y) < (s.radius || 30)) {
        // playability: click-to-place on the pulsing target — center+snap the ghost
        // on pointerdown so the FIRST click places (snapGhost normally runs on pointermove;
        // a click without prior move would tryPlace at an unsnapped, possibly invalid spot)
        if (b.placing && t && s.id === 'place_building') {
          b.cameras.main.centerOn(t.x, t.y);
          b.snapGhost({ x: t.x, y: t.y });
        }
        return false; // PASS
      }
      this.nudge('CLICK THE PULSING TARGET'); return true;
    }
    return false;
  }

  nudge(msg) {
    this.hintPulse = 1.2;
    this.b.audio?.error?.();
    this.bar.setText('➤ ' + (msg || this.step?.tip || 'FOLLOW THE MARKER'));
    this._nudgeBack = this.b.gameTime + 1.4;
  }

  // HUD button gate: during forced BUTTON steps only the highlighted button acts
  allowHudBtn(btn) {
    const s = this.step;
    if (!this.active || !s || s.mode !== 'button') return true;
    const hud = this.b.scene.get('Hud');
    const t = s.btn ? s.btn(hud) : null;
    if (!t) return true; // nothing highlighted yet — never lock the UI down
    return t === btn;
  }

  // right-click gate: consulted at the top of rightClickOrder (fires on pointerup)
  gateRight(wp) {
    const s = this.step;
    if (this.active && s && s.force) {
      if (s.mode === 'rightworld') {
        const t = s.target?.();
        if (!(t && Math.hypot(t.x - wp.x, t.y - wp.y) < (s.radius || 34))) { this.nudge('RIGHT-CLICK THE RED TARGET'); return true; }
        if (s.id === 'harvest') this._minedClick = true; // player actually issued the harvest order
        return false;
      }
      if (s.mode === 'world' && !this.b.placing) { this.nudge('LEFT-CLICK THE PULSING TARGET'); return true; }
    }
    return false;
  }

  tick(dt) {
    if (!this.active) return;
    const b = this.b, s = this.step;
    if (!s) return;
    // lesson hold: Unit ctor auto-harvests every spawned worker — park team-0 workers
    // until the player actually ISSUES the harvest order themselves (one-time teaching)
    if (!this._minedClick) {
      for (const u of b.units) if (u.team === 0 && !u.dead && u.def.worker && u.order && u.order.type === 'harvest') { u.order = null; u.state = 'idle'; }
    }
    this.g.clear();
    let hx = 0, hy = 0, hr = 0, ok = false;
    if (s.mode === 'button') {
      const hud = b.scene.get('Hud');
      const btn = hud && s.btn ? s.btn(hud) : null;
      if (btn) {
        ok = true;
        hx = btn.x + btn.w / 2; hy = btn.y + btn.h / 2; hr = Math.max(btn.w, btn.h) / 2 + 14;
        this.bar.setX(b.scale.width / 2); this.sub.setX(b.scale.width / 2);
      }
    } else if (s.mode !== 'info') {
      const t = s.target?.();
      if (t) {
        ok = true;
        const c = b.cameras.main;
        // Ring is drawn in SCREEN space (scrollFactor 0) but Phaser's
        // worldView starts at (240,150) on this camera — screen coord of a
        // world point is (w - worldView.x) * zoom (verified: getWorldPoint
        // inverse). Using scrollX/scrollY (0,0 here) offset every ring by
        // 240/150*zoom, so rings pointed away from their targets and
        // "click the pulsing ring" never hit.
        hx = (t.x - c.worldView.x) * c.zoom; hy = (t.y - c.worldView.y) * c.zoom;
        hr = (s.radius || 30) * c.zoom;
        this.markerTarget = t;
      }
    }
    const pulse = 1 + Math.sin(b.gameTime * 5.5) * 0.14;
    const col = s.mode === 'rightworld' ? 0xff5c5c : 0x4ea1ff;
    if (ok && hr > 0) {
      const rr = hr * pulse * (this.hintPulse > 0 ? 1.18 : 1);
      this.g.lineStyle(3, col, 0.95);
      this.g.strokeCircle(hx, hy, rr);
      this.g.lineStyle(1.5, col, 0.4);
      this.g.strokeCircle(hx, hy, rr * 1.3);
      const bx = Math.max(26, rr * 0.9), L = 10;
      this.g.lineStyle(2.5, col, 0.85);
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        this.g.lineBetween(hx + sx * bx, hy + sy * bx - sy * L, hx + sx * bx, hy + sy * bx);
        this.g.lineBetween(hx + sx * bx, hy + sy * bx, hx + sx * bx - sx * L, hy + sy * bx);
      }
    }
    if (this.hintPulse > 0) this.hintPulse -= dt;
    if (this._nudgeBack && b.gameTime > this._nudgeBack) {
      this._nudgeBack = 0;
      this.bar.setText(`TRAINING ${this.i + 1}/${this.steps.length} — ${s.tip}`);
    }
    // watchdog: re-center + re-pulse when stalled
    if (b.gameTime - this.stepAt > 20) {
      // funds starvation is the #1 tutorial stall — top up so the lesson never dead-ends
      const p0 = b.players[0];
      if (p0.minerals < 250) { p0.minerals += 400; b.events.emit('hud:alert', 'SIM FUNDS +400'); }
      const t = s.mode === 'button' ? null : s.target?.();
      if (t && s.cam) b.cameras.main.centerOn(t.x, t.y);
      this.stepAt = b.gameTime - 12;
      this.nudge(s.tip);
    }
    // Playability anti-stall: if the step waits on a structure that got
    // placed with no builder assigned (e.g. ghost placed with no worker
    // selected), auto-send the nearest idle worker so the chain never dies.
    {
      let t = s.mode === 'button' ? null : s.target?.();
      if (!t && s.waitBefore && !s.waitBefore() && this.prodBid)
        t = b.buildings.find(x => x.buildId === this.prodBid && x.team === 0 && !x.built); // chain stalled on unstaffed construction
      if (t && t.def && !t.built && t.buildId && !b.units.some(u => !u.dead && u.order?.building === t)) {
        if (this._noBuilderFor !== t) {
          this._noBuilderFor = t;
          const wk = b.units.filter(u => u.team === 0 && !u.dead && u.def.worker)
            .sort((a, c) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(c.x - t.x, c.y - t.y))[0];
          if (wk) { wk.setOrder({ type: 'build', building: t }); this.nudge('WORKER SENT — WATCH THE CONSTRUCTION'); }
        }
      } else this._noBuilderFor = null;
    }
    if (s.waitBefore && !s.waitBefore()) return;
    if (s.done()) {
      b.audio?.objective?.();
      if (this.i + 1 >= this.steps.length) { this.finish(true); return; }
      this.showStep(this.i + 1);
    }
  }

  teardown() {
    if (this._pd) { const q = this.b.input._events.pointerdown || []; const i = q.indexOf(this._pd); if (i >= 0) q.splice(i, 1); }
    if (this._pu) { const q = this.b.input._events.pointerup || []; const i = q.indexOf(this._pu); if (i >= 0) q.splice(i, 1); }
    this.g?.destroy(); this.bar?.destroy(); this.sub?.destroy(); this.skipBtn?.destroy();
  }

  finish(success) {
    if (!this.active) return;
    this.active = false;
    try { localStorage.setItem('scc.trainseen', '1'); } catch (e) { /* private mode */ }
    if (success) {
      this.b.events.emit('hud:alert', 'TRAINING COMPLETE — GOOD LUCK, COMMANDER');
      this.b.audio?.complete?.();
    } else {
      this.b.events.emit('hud:alert', 'TRAINING SKIPPED — full control returned');
    }
    this.teardown();
    this.b.coach = null;
    this.b.tut = null;
  }
}
