import Phaser from 'phaser';

// polish.js — v2.25 micro-feedback layer: click markers, floats, sweeps, badges, confetti.
// Self-contained: every method guards on scene state; cheap tweens, auto-destroy.
export class PolishFX {
  constructor(scene) {
    this.s = scene;
    this.streak = 0;
    this._streakAt = 0;
    this._uaAt = 0;      // last under-attack trigger
    this.speedTier = 0;  // F6: 0=1x 1=1.5x 2=2x
    this.speeds = [1, 1.5, 2];
    this._antsPhase = 0;
  }

  // 1) SC2-style order marker: double ring + rotating tick marks
  clickMarker(x, y, col = 0x7dff8a) {
    const s = this.s;
    if (!s || s.gameOver) return;
    const g = s.add.graphics().setDepth(49);
    g.lineStyle(1.5, col, 0.9);
    g.strokeCircle(x, y, 7);
    for (let i = 0; i < 4; i++) {
      const a = (Math.PI / 2) * i + Math.PI / 4;
      g.lineBetween(x + Math.cos(a) * 10, y + Math.sin(a) * 10, x + Math.cos(a) * 14, y + Math.sin(a) * 14);
    }
    s.tweens.add({ targets: g, alpha: 0, scale: 1.8, duration: 480, ease: 'Cubic.easeOut', onComplete: () => g.destroy() });
  }

  // 2) floating income gain at deposit point
  floatGain(x, y, amt, gas = false) {
    const s = this.s;
    if (!s || amt <= 0) return;
    const t = s.add.text(x + (Math.random() * 14 - 7), y - 8, `+${amt}`, { fontFamily: 'Menlo, monospace', fontSize: '12px', fontWeight: 'bold', color: gas ? '#7dffd9' : '#9fd0ff' }).setOrigin(0.5).setDepth(52);
    t.setStroke(2, 0x000000, 0.7);
    s.tweens.add({ targets: t, y: y - 34, alpha: 0, scale: 1.15, duration: 900, ease: 'Sine.easeOut', onComplete: () => t.destroy() });
  }

  // 3) kill pop: skull + count at the death spot
  killPop(x, y, heavy = false) {
    const s = this.s;
    if (!s || s.gameOver) return;
    const t = s.add.text(x, y - 10, heavy ? '💀+' : '✕', { fontFamily: 'Menlo, monospace', fontSize: heavy ? '16px' : '12px', color: '#ffd23f' }).setOrigin(0.5).setDepth(52);
    t.setStroke(2, 0x000000, 0.8);
    s.tweens.add({ targets: t, y: y - 30, alpha: 0, scale: heavy ? 1.6 : 1.3, duration: 750, ease: 'Back.easeOut', onComplete: () => t.destroy() });
    // 20) kill streak taunts
    const now = s.gameTime || 0;
    this.streak = (now - this._streakAt < 6) ? this.streak + 1 : 1;
    this._streakAt = now;
    if (this.streak === 5 || this.streak === 10 || this.streak === 15) {
      const taunt = { 5: 'Double trouble. Keep it going.', 10: 'They cannot stop you, commander.', 15: 'ABSOLUTE DOMINATION.' }[this.streak];
      s.events.emit('hud:radio', taunt, heavy ? 'MERCENARY CAPTAIN' : 'COMMS');
      s.events.emit('hud:alert', `KILL STREAK x${this.streak}`);
    }
  }

  // 4) UNDER ATTACK: pulsing red edge + radio once per lull
  underAttack(x, y) {
    const s = this.s;
    if (!s || s.gameOver) return;
    const now = s.gameTime || 0;
    if (now - this._uaAt < 8) { this._uaHitAcc = (this._uaHitAcc || 0) + 1; return; }
    this._uaAt = now;
    s.events.emit('hud:alert', '⚠ UNDER ATTACK');
    s.events.emit('hud:radio', 'We are taking fire, holding position.', 'FIELD COMMS');
    this.edgePulse(0xff4040, 3);
    if (x !== undefined) s.addEventPing?.(x, y, 0xff4040, false);
  }

  edgePulse(col = 0xff4040, count = 3) {
    const s = this.s;
    if (!s) return;
    const g = s.add.graphics().setScrollFactor(0).setDepth(1890);
    const W = s.scale.width, H = s.scale.height;
    g.fillStyle(col, 1).fillRect(0, 0, W, 6);
    g.fillStyle(col, 1).fillRect(0, H - 6, W, 6);
    g.fillStyle(col, 1).fillRect(0, 0, 6, H);
    g.fillStyle(col, 1).fillRect(W - 6, 0, 6, H);
    g.setAlpha(0);
    s.tweens.add({ targets: g, alpha: 0.5, duration: 120, yoyo: true, repeat: count - 1, onComplete: () => g.destroy() });
  }

  // 5) building complete: gold radar sweep + sparkles
  buildCompleteFX(x, y, big = false) {
    const s = this.s;
    if (!s) return;
    const r = big ? 90 : 56;
    const g = s.add.graphics().setDepth(49);
    g.lineStyle(2, 0xffd23f, 0.8);
    g.strokeCircle(x, y, 12);
    s.tweens.add({ targets: g, scale: r / 12, alpha: 0, duration: 700, ease: 'Cubic.easeOut', onComplete: () => g.destroy() });
    for (let i = 0; i < (big ? 12 : 7); i++) {
      const a = Math.random() * Math.PI * 2, d = 10 + Math.random() * (big ? 34 : 20);
      const p = s.add.circle(x, y, 1.6, 0xffd23f, 1).setDepth(50);
      s.tweens.add({ targets: p, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d - 8, alpha: 0, scale: 0.2, duration: 500 + Math.random() * 300, ease: 'Quad.easeOut', onComplete: () => p.destroy() });
    }
  }

  // 6) unit arrival: expanding spawn flash + dust ring
  spawnFlash(x, y, team = 0) {
    const s = this.s;
    if (!s) return;
    const col = team === 0 ? 0x9fd0ff : 0xff9a9a;
    const g = s.add.graphics().setDepth(49);
    g.lineStyle(1.5, col, 0.8);
    g.strokeCircle(x, y, 4);
    s.tweens.add({ targets: g, scale: 3.2, alpha: 0, duration: 420, ease: 'Cubic.easeOut', onComplete: () => g.destroy() });
  }

  // 7) supply block: top-bar pulse already red — add sticky vignette while capped
  supplyVignette(on) {
    const s = this.s;
    if (!s) return;
    if (on && !this._supVig) {
      this._supVig = s.add.graphics().setScrollFactor(0).setDepth(1880);
      const W = s.scale.width, H = s.scale.height;
      const gg = this._supVig;
      gg.fillStyle(0xff3030, 1).fillRect(0, 0, W, 4);
      gg.setAlpha(0);
      s.tweens.add({ targets: gg, alpha: 0.35, duration: 600, yoyo: true, repeat: -1 });
    } else if (!on && this._supVig) {
      this._supVig.destroy(); this._supVig = null;
    }
  }

  // 8) F6 speed cycle badge
  cycleSpeed() {
    const s = this.s;
    if (!s || s.gameOver) return;
    this.speedTier = (this.speedTier + 1) % 3;
    if (s._slowmo) return;
    const mult = this.speeds[this.speedTier];
    s.timeScale = mult;
    const lab = ['', 'FAST', 'LUDICROUS'][this.speedTier] || 'NORMAL';
    if (!this._speedBadge) {
      this._speedBadge = s.add.text(s.scale.width - 14, s.scale.height - 14, '', { fontFamily: 'Menlo, monospace', fontSize: '14px', fontWeight: 'bold', color: '#ffd23f', backgroundColor: '#00000099', padding: { x: 6, y: 3 } }).setOrigin(1, 1).setScrollFactor(0).setDepth(1905);
    }
    this._speedBadge.setText(`${mult}x ${lab}`).setVisible(true);
    this._speedBadge.setScale(1.4);
    s.tweens.add({ targets: this._speedBadge, scale: 1, duration: 240, ease: 'Back.easeOut' });
    s.time.delayedCall(2600, () => { if (this._speedBadge && this.speedTier === 0) this._speedBadge.setVisible(false); });
    s.audio?.uiClick?.();
  }

  // 9) control group assign pop: big number blip at center-bottom
  groupPop(n, count) {
    const s = this.s;
    if (!s) return;
    const t = s.add.text(s.scale.width / 2, s.scale.height * 0.68, `${n}`, { fontFamily: 'Menlo, monospace', fontSize: '34px', fontWeight: 'bold', color: '#6ee7a0', backgroundColor: '#000000aa', padding: { x: 14, y: 6 } }).setOrigin(0.5).setScrollFactor(0).setDepth(1904);
    t.setScale(0.4).setAlpha(0);
    s.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 160, ease: 'Back.easeOut', onComplete: () => s.tweens.add({ targets: t, alpha: 0, y: t.y - 18, duration: 380, onComplete: () => t.destroy() }) });
    if (count) s.audio?.select?.();
  }

  // 10) marching ants: animated dashed world-space selection box
  drawAnts(rect) {
    const s = this.s;
    if (!s || !rect) return;
    if (!this._ants) {
      this._ants = s.add.graphics().setDepth(71);
      s.events.once('shutdown', () => { this._ants = null; });
    }
    const g = this._ants;
    g.clear();
    this._antsPhase = (this._antsPhase + 1) % 8;
    g.lineStyle(1, 0x7dff8a, 0.95);
    g.strokeRect(rect.x, rect.y, rect.width, rect.height);
    g.fillStyle(0x7dff8a, 0.05);
    g.fillRect(rect.x, rect.y, rect.width, rect.height);
    const step = 8;
    for (let x = rect.x + (this._antsPhase % step); x < rect.x + rect.width; x += step) {
      g.lineBetween(x, rect.y, Math.min(x + 4, rect.x + rect.width), rect.y);
      g.lineBetween(x, rect.y + rect.height, Math.min(x + 4, rect.x + rect.width), rect.y + rect.height);
    }
  }

  // 11) shield matrix collapse: white-out flash + lightning arcs
  zapFX() {
    const s = this.s;
    if (!s) return;
    const W = s.scale.width, H = s.scale.height;
    const fl = s.add.rectangle(W / 2, H / 2, W, H, 0xbfe8ff, 0.55).setScrollFactor(0).setDepth(1900);
    s.tweens.add({ targets: fl, alpha: 0, duration: 380, onComplete: () => fl.destroy() });
    for (let i = 0; i < 6; i++) {
      const g = s.add.graphics().setScrollFactor(0).setDepth(1901);
      g.lineStyle(2, 0x9fd0ff, 0.9);
      let px = Math.random() * W, py = 0;
      g.moveTo(px, py);
      while (py < H) { px += (Math.random() * 90 - 45); py += 30 + Math.random() * 40; g.lineTo(px, py); }
      s.tweens.add({ targets: g, alpha: 0, duration: 250 + Math.random() * 200, onComplete: () => g.destroy() });
    }
  }

  // 12) minimap radar sweep: rotating line drawn by HUD each frame
  radarSweep(g, mmX, mmY, size) {
    const s = this.s;
    if (!s) return;
    this._radarA = ((this._radarA || 0) + 0.02) % (Math.PI * 2);
    const cx = mmX + size / 2, cy = mmY + size / 2, r = size / 2 - 2;
    const a = this._radarA;
    g.lineStyle(1, 0x6ee7a0, 0.35);
    g.lineBetween(cx, cy, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    g.fillStyle(0x6ee7a0, 0.08);
    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, r, a - 0.6, a);
    g.closePath();
    g.fillPath();
  }

  // 13) victory confetti: colored shard rain on the win board
  confetti() {
    const s = this.s;
    if (!s) return;
    const W = s.scale.width;
    for (let i = 0; i < 46; i++) {
      const col = [0xffd23f, 0x6ee7a0, 0x9fd0ff, 0xff8a5c, 0xc9a0ff][i % 5];
      const t = s.add.rectangle(Math.random() * W, -10 - Math.random() * 140, 4 + Math.random() * 4, 7 + Math.random() * 7, col, 0.95).setScrollFactor(0).setDepth(2001).setRotation(Math.random() * 3);
      s.tweens.add({ targets: t, y: s.scale.height + 20, x: t.x + (Math.random() * 80 - 40), rotation: t.rotation + Math.random() * 8, duration: 1400 + Math.random() * 1600, ease: 'Sine.easeIn', onComplete: () => t.destroy() });
    }
  }

  // 14) pause overlay: scanlines + PAUSED stamp
  pauseOverlay(on) {
    const s = this.s;
    if (!s) return;
    if (on && !this._pauseG) {
      const W = s.scale.width, H = s.scale.height;
      this._pauseG = s.add.graphics().setScrollFactor(0).setDepth(1895);
      for (let y = 0; y < H; y += 4) this._pauseG.fillStyle(0x000000, 0.16).fillRect(0, y, W, 1);
      this._pauseTxt = s.add.text(W / 2, H / 2 - 40, 'PAUSED', { fontFamily: 'Menlo, monospace', fontSize: '42px', fontWeight: 'bold', color: '#dbe7ff', backgroundColor: '#00000099', letterSpacing: 8, padding: { x: 18, y: 8 } }).setOrigin(0.5).setScrollFactor(0).setDepth(1896);
      this._pauseTxt.setScale(1.3).setAlpha(0);
      s.tweens.add({ targets: this._pauseTxt, scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' });
    } else if (!on && this._pauseG) {
      this._pauseG.destroy(); this._pauseG = null;
      if (this._pauseTxt) { this._pauseTxt.destroy(); this._pauseTxt = null; }
    }
  }

  // 15) rally flag pennant flutter (called per-frame from battle update with rally list)
  flagWave(rally) {
    const s = this.s;
    if (!s || !rally || !rally._rallyFlag) return;
    this._flagT = (this._flagT || 0) + 0.05;
    const sway = Math.sin(this._flagT * 2 + rally.x * 0.01) * 3;
    rally._rallyFlag.rotation = sway * 0.06;
  }

  // 16) hovered unit glow ring (battle hover handler)
  hoverGlow(u) {
    const s = this.s;
    if (!s) return;
    if (this._hoverKey === (u && u.id)) return;
    this._hoverKey = u && u.id;
    if (this._hoverRing) { this._hoverRing.destroy(); this._hoverRing = null; }
    if (!u) return;
    this._hoverRing = s.add.circle(u.x, u.y, (u.def && u.def.size === 'large' ? 16 : 10), 0xffffff, 0.10).setStrokeStyle(1, 0xffffff, 0.35).setDepth(44);
    s.events.once('shutdown', () => { this._hoverRing = null; });
  }

  // 17) construction countdown arc over active sites
  buildCountdown(b) {
    const s = this.s;
    if (!s || !b || b.built) return;
    if (b._cdArc) {
      const pct = Math.min(1, (b.constructionProgress || 0) / (b.buildTime || 1));
      b._cdArc.clear();
      b._cdArc.lineStyle(2, 0xffd23f, 0.9);
      b._cdArc.beginPath();
      b._cdArc.arc(b.x, b.y - (b.def && b.def.h ? b.def.h * 8 : 18), 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
      b._cdArc.strokePath();
    } else {
      b._cdArc = s.add.graphics().setDepth(46);
      s.events.once('shutdown', () => { b._cdArc = null; });
    }
  }

  // 18) HUD button press bounce (called from HudScene.flash)
  btnBounce(obj) {
    if (!obj) return;
    obj.setScale(0.94);
    obj.scene.tweens.add({ targets: obj, scale: 1, duration: 180, ease: 'Back.easeOut' });
  }

  // 19) minimap viewport rounded frame + soft glow (HUD per-frame)
  mmFrame(g, mmX, mmY, size) {
    g.lineStyle(1.5, 0x3f5f8a, 0.9);
    g.strokeRoundedRect(mmX - 2, mmY - 2, size + 4, size + 4, 4);
    g.lineStyle(1, 0x8fd0ff, 0.25);
    g.strokeRoundedRect(mmX - 4, mmY - 4, size + 8, size + 8, 5);
  }

  // ---------------- v2.26 AAA layer ----------------
  _cheap(s) { return s && s.children.list.length < 850; }

  // 21) weapon-class identity: phosphor trails under live projectiles
  // v2.28 trail density tuning: shells (slow) get dense dots, fast bolts sparse
  // ones with longer life (same visual length, fewer nodes), global clutter cap.
  projTrail(sp) {
    const s = this.s;
    if (!s || s.gameOver || !this._cheap(s) || !s.camNear(sp.x, sp.y)) return;
    const pr = sp._proj; if (!pr) return;
    pr._trN = (pr._trN || 0) + 1;
    const fast = (pr.speed || 0) >= 700;
    if (pr.shell) { /* dense: every frame */ }
    else if (fast) { if (pr._trN % 3) return; }
    else if (pr._trN % 2) return;
    this._tn = this._tn || 0;
    if (this._tn > 48) return; // global cap: heavy battles stop adding trails
    const kind = pr.kind;
    const col = kind === 'hydralisk' || kind === 'hydra' ? 0x9dff7a
      : kind === 'dragoon' || kind === 'archon' ? 0x9fd0ff
      : kind === 'corsair' || kind === 'darkTemplar' ? 0xb060ff
      : kind === 'vulture' || kind === 'goliath' || kind === 'tank' ? 0xffd27a
      : 0xbfe0ff;
    const d = s.add.circle(sp.x, sp.y, kind === 'tank' ? 2.6 : 1.7, col, 0.55).setDepth(43).setBlendMode(Phaser.BlendModes.ADD);
    this._tn++;
    s.tweens.add({ targets: d, alpha: 0, scale: 0.35, duration: 240, onComplete: () => { this._tn = Math.max(0, (this._tn || 1) - 1); d.destroy(); } });
  }

  // 22) flinch: squash-and-stretch on any unit taking a hit
  flinch(u) {
    const s = this.s;
    if (!s || s.gameOver || !u || u.dead || !u.sprite || !u.container || !u.container.visible) return;
    if (!s.camNear(u.x, u.y)) return;
    const bs = u.baseScale || 1;
    u.sprite.setScale(bs * 1.14, bs * 0.86);
    s.tweens.add({ targets: u.sprite, scaleX: bs, scaleY: bs, duration: 120, ease: 'Back.easeOut' });
  }

  // 23) shield break: glass-shatter ring + shards when a shield hits zero
  shieldBreak(u) {
    const s = this.s;
    if (!s || s.gameOver || !this._cheap(s) || !s.camNear(u.x, u.y)) return;
    const g = s.add.circle(u.x, u.y, u.radius + 7, 0x4ea1ff, 0).setStrokeStyle(2, 0xbfe0ff, 0.95).setDepth(56);
    s.tweens.add({ targets: g, scale: 2.1, alpha: 0, duration: 340, ease: 'Cubic.easeOut', onComplete: () => g.destroy() });
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * 6.28;
      const p = s.add.rectangle(u.x, u.y, 2.5, 5, 0xbfe0ff, 0.9).setDepth(57).setRotation(a);
      s.tweens.add({ targets: p, x: u.x + Math.cos(a) * (14 + Math.random() * 12), y: u.y + Math.sin(a) * (14 + Math.random() * 12), alpha: 0, rotation: a + 3, duration: 420 + Math.random() * 180, onComplete: () => p.destroy() });
    }
  }

  // 24) lingering smoke wisps over fresh graves (heavy = taller column)
  smokeWisp(x, y, heavy = false) {
    const s = this.s;
    if (!s || s.gameOver || !this._cheap(s) || !s.camNear(x, y)) return;
    const n = heavy ? 5 : 2;
    for (let i = 0; i < n; i++) {
      const puff = s.add.circle(x + (Math.random() * 10 - 5), y, 3 + Math.random() * 3, heavy ? 0x3a3a3a : 0x6a6a6a, heavy ? 0.4 : 0.3).setDepth(9);
      s.tweens.add({ targets: puff, y: y - (heavy ? 46 : 24) - Math.random() * 14, x: puff.x + (Math.random() * 16 - 8), alpha: 0, scale: (heavy ? 3.4 : 2.2) + Math.random(), duration: (heavy ? 2200 : 1400) + Math.random() * 700, ease: 'Sine.easeOut', onComplete: () => puff.destroy() });
    }
  }

  // 25) building destruction: fireball, black smoke column, spark ring, crater
  heavyDeathFX(b) {
    const s = this.s;
    if (!s || s.gameOver || !b) return;
    const big = !!b.def.primary;
    const R = Math.max(b.def.w || 2, b.def.h || 2) * 8;
    if (s.textures.exists('explosion')) {
      const ex = s.add.image(b.x, b.y, 'explosion').setDepth(60).setScale(big ? 2.6 : 1.6);
      s.tweens.add({ targets: ex, scale: big ? 5 : 3, alpha: 0, duration: 520, ease: 'Cubic.easeOut', onComplete: () => ex.destroy() });
    }
    s.add.image(b.x, b.y, 'scorch').setDepth(6).setAlpha(0.85).setScale(big ? 3.2 : 1.8).setRotation(Math.random() * 6.28);
    if (s.camNear(b.x, b.y)) {
      for (let i = 0; i < (big ? 10 : 6); i++) {
        const puff = s.add.circle(b.x + (Math.random() * R * 0.5 - R * 0.25), b.y - Math.random() * 8, 4 + Math.random() * 5, i % 2 ? 0x2e2e2e : 0x50443c, 0.5).setDepth(10);
        s.tweens.add({ targets: puff, y: b.y - 60 - Math.random() * 40, x: puff.x + (Math.random() * 26 - 13), alpha: 0, scale: 3 + Math.random() * 2, duration: 1800 + Math.random() * 1400, ease: 'Sine.easeOut', onComplete: () => puff.destroy() });
      }
      for (let i = 0; i < 8; i++) {
        const a = Math.random() * 6.28, sp = 40 + Math.random() * 60;
        const d = s.add.image(b.x, b.y, 'spark').setDepth(58).setScale(1 + Math.random());
        s.tweens.add({ targets: d, x: b.x + Math.cos(a) * sp, y: b.y + Math.sin(a) * sp * 0.7, alpha: 0, duration: 500 + Math.random() * 280, ease: 'Quad.easeOut', onComplete: () => d.destroy() });
      }
    }
  }

  // 26) overkill: gold spark shower + tag when splash crushes a light unit
  overkillFX(x, y, amt) {
    const s = this.s;
    if (!s || s.gameOver || !this._cheap(s) || !s.camNear(x, y)) return;
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * 6.28, sp = 22 + Math.random() * 34;
      const p = s.add.circle(x, y, 1.8, 0xffd23f, 1).setDepth(53).setBlendMode(Phaser.BlendModes.ADD);
      s.tweens.add({ targets: p, x: x + Math.cos(a) * sp, y: y + Math.sin(a) * sp - 6, alpha: 0, scale: 0.2, duration: 380 + Math.random() * 220, ease: 'Quad.easeOut', onComplete: () => p.destroy() });
    }
    if (amt >= 30) {
      const t = s.add.text(x, y - 20, 'OVERKILL', { fontFamily: 'Menlo, monospace', fontSize: '11px', fontWeight: 'bold', color: '#ffd23f' }).setOrigin(0.5).setDepth(76).setStroke(2, 0x000000, 0.8);
      s.tweens.add({ targets: t, y: y - 40, alpha: 0, scale: 1.3, duration: 700, ease: 'Back.easeOut', onComplete: () => t.destroy() });
    }
  }

  // 27) idle worker ping: double ring + position badge when camera jumps to one
  idlePing(u, i, n) {
    const s = this.s;
    if (!s || s.gameOver || !u) return;
    for (let k = 0; k < 2; k++) {
      const g = s.add.circle(u.x, u.y, (u.radius || 6) + 6, 0x6ee7a0, 0).setStrokeStyle(1.5, 0x6ee7a0, 0.9).setDepth(56);
      s.tweens.add({ targets: g, scale: 2.2, alpha: 0, duration: 420, delay: k * 160, ease: 'Cubic.easeOut', onComplete: () => g.destroy() });
    }
    const t = s.add.text(u.x, u.y - 24, `IDLE ${i}/${n}`, { fontFamily: 'Menlo, monospace', fontSize: '10px', fontWeight: 'bold', color: '#6ee7a0', backgroundColor: '#00000099', padding: { x: 4, y: 2 } }).setOrigin(0.5).setDepth(76).setScrollFactor(0);
    s.tweens.add({ targets: t, alpha: 0, y: u.y - 34, duration: 1100, onComplete: () => t.destroy() });
  }

  // 28) rally arrow flight: an arrow streaks from the building to its new rally flag
  rallyArrow(b) {
    const s = this.s;
    if (!s || s.gameOver || !b.rallyPoint || !this._cheap(s)) return;
    const ang = Math.atan2(b.rallyPoint.y - b.y, b.rallyPoint.x - b.x);
    const a = s.add.triangle(0, 0, -7, -4, 7, 0, -7, 4, 0x6ee7a0).setDepth(56).setAlpha(0.95);
    a.setPosition(b.x, b.y).setRotation(ang);
    s.tweens.add({ targets: a, x: b.rallyPoint.x, y: b.rallyPoint.y, angle: Math.sin(s.gameTime) * 6, alpha: 0, scale: 0.7, duration: 420, ease: 'Quad.easeOut', onComplete: () => a.destroy() });
    const dust = s.add.circle(b.x, b.y, 5, 0xdbe7ff, 0.35).setDepth(55);
    s.tweens.add({ targets: dust, scale: 2.2, alpha: 0, duration: 320, onComplete: () => dust.destroy() });
  }

  // 29) build ghost stencil: diagonal hatch + footprint tile dots on the placement ghost
  ghostStencil(g, gx, gy, def, ok) {
    if (!g) return;
    const W = def.w * 16, H = def.h * 16;
    const x0 = gx - W / 2, y0 = gy - H / 2;
    g.lineStyle(1, ok ? 0x6ee7a0 : 0xff4444, 0.28);
    for (let d = 0; d < W + H; d += 6) {
      const x1 = x0 + Math.max(0, d - H), y1 = y0 + Math.min(H, d);
      const x2 = x0 + Math.min(W, d), y2 = y0 + Math.max(0, d - W);
      g.lineBetween(x1, y1, x2, y2);
    }
    g.fillStyle(ok ? 0x6ee7a0 : 0xff4444, 0.18);
    for (let tx = 0; tx < def.w; tx++) for (let ty = 0; ty < def.h; ty++) g.fillCircle(x0 + tx * 16 + 8, y0 + ty * 16 + 8, 1.4);
  }

  // 31) fog question marks: SC-style "?" cluster when a big group marches blind
  fogQuestion(x, y) {
    const s = this.s;
    if (!s || s.gameOver) return;
    for (let i = 0; i < 3; i++) {
      const t = s.add.text(x + (Math.random() * 28 - 14), y + (Math.random() * 20 - 10), '?', { fontFamily: 'Menlo, monospace', fontSize: '14px', fontWeight: 'bold', color: '#ffd23f' }).setOrigin(0.5).setDepth(76).setStroke(2, 0x000000, 0.7).setAlpha(0);
      s.tweens.add({ targets: t, alpha: 0.95, y: t.y - 12 - i * 4, duration: 260, delay: i * 110, ease: 'Back.easeOut', onComplete: () => s.tweens.add({ targets: t, alpha: 0, duration: 900, onComplete: () => t.destroy() }) });
    }
    s.addEventPing?.(x, y, 0xffd23f, false);
  }

  // 32) creep ambient: slow bubbles rising and popping across live creep
  creepBubbles(dt) {
    const s = this.s;
    if (!s || s.gameOver) return;
    this._cbT = (this._cbT || 0) - dt;
    if (this._cbT > 0) return;
    this._cbT = 0.5 + Math.random() * 0.7;
    if (!this._cheap(s)) return;
    const vw = s.cameras.main.worldView;
    for (const t of [0, 1]) {
      const cc = s.creepCanvases && s.creepCanvases[t];
      if (!cc) continue;
      for (let tries = 0; tries < 10; tries++) {
        const tx = Phaser.Math.Clamp(((vw.x + Math.random() * vw.width) / 16) | 0, 0, 95);
        const ty = Phaser.Math.Clamp(((vw.y + Math.random() * vw.height) / 16) | 0, 0, 95);
        if (!cc.cells[ty * 96 + tx]) continue;
        const x = tx * 16 + 8 + (Math.random() * 8 - 4), y = ty * 16 + 8 + (Math.random() * 8 - 4);
        const col = t === 0 ? 0x5a2a7a : 0x7a2a3a;
        const b = s.add.circle(x, y, 1 + Math.random() * 1.6, col, 0.75).setDepth(9);
        s.tweens.add({ targets: b, y: y - 6 - Math.random() * 5, alpha: 0, scale: 1.6, duration: 700 + Math.random() * 500, onComplete: () => { const r = s.add.circle(x, y - 8, 2.4, col, 0).setStrokeStyle(1, col, 0.7).setDepth(9); s.tweens.add({ targets: r, scale: 1.8, alpha: 0, duration: 220, onComplete: () => r.destroy() }); } });
        break;
      }
    }
  }

  // 33) cloak shimmer: faint distortion left where cloaked foes passed
  cloakScan(dt) {
    const s = this.s;
    if (!s || s.gameOver) return;
    this._csT = (this._csT || 0) - dt;
    if (this._csT > 0) return;
    this._csT = 0.45;
    if (!this._cheap(s)) return;
    for (const u of s.units) {
      if (u.dead || u.team === 0 || !u.cloaked) continue;
      if (!s.camNear(u.x, u.y)) continue;
      this.cloakShimmer(u.x, u.y);
    }
  }
  cloakShimmer(x, y) {
    const s = this.s;
    if (!s || !this._cheap(s)) return;
    const g = s.add.graphics().setDepth(52).setAlpha(0.5);
    g.lineStyle(1, 0x9fd0ff, 0.5);
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * 6.28, r = 5 + Math.random() * 7;
      g.beginPath();
      g.arc(x + Math.cos(a) * 4, y + Math.sin(a) * 4, r, a, a + 1.4 + Math.random());
      g.strokePath();
    }
    s.tweens.add({ targets: g, alpha: 0, y: y - 4, duration: 900, onComplete: () => g.destroy() });
  }

  // 34) day/night ambience: starfield parallax + 4-minute tint cycle (subtle, max 0.14)
  initAmbient() {
    const s = this.s;
    if (!s || this._stars) return;
    this._stars = s.add.container(0, 0).setDepth(3).setScrollFactor(0.45);
    this._stars.setAlpha(0);
    for (let i = 0; i < 110; i++) {
      const st = s.add.rectangle(Math.random() * 1600, Math.random() * 1600, 1 + (Math.random() < 0.12 ? 1.5 : 0), 1 + (Math.random() < 0.12 ? 1.5 : 0), Math.random() < 0.5 ? 0xdbe7ff : 0xffffff, 0.5 + Math.random() * 0.5);
      this._stars.add(st);
      if (Math.random() < 0.3) s.tweens.add({ targets: st, alpha: 0.1, duration: 900 + Math.random() * 1600, yoyo: true, repeat: -1 });
    }
    this._dn = { tint: s.add.rectangle(s.scale.width / 2, s.scale.height / 2, s.scale.width, s.scale.height, 0x0a1226, 1).setScrollFactor(0).setDepth(1850).setAlpha(0), t: 0, phase: 0 };
    s.events.once('shutdown', () => { this._stars = null; this._dn = null; });
  }
  ambient(dt) {
    const s = this.s;
    if (!s || !this._dn || !this._stars) return;
    this._dn.phase = (this._dn.phase + dt / 240) % 1;
    const ph = this._dn.phase;
    // day 0-0.45 · dusk 0.45-0.55 · night 0.55-0.9 · dawn 0.9-1
    let col = 0x0a1226, a = 0;
    if (ph < 0.45) { col = 0x101a30; a = 0; }
    else if (ph < 0.55) { const k = (ph - 0.45) / 0.1; col = 0x50302a; a = 0.10 * k; }
    else if (ph < 0.9) { col = 0x0a1226; a = 0.14; }
    else { const k = 1 - (ph - 0.9) / 0.1; col = 0x503a28; a = 0.12 * k; }
    this._dn.tint.setFillStyle(col, a);
    this._stars.setAlpha(a > 0.06 ? (a - 0.06) * 7 : 0);
  }

  // 40) floating damage numbers: color-coded by hit type, crits pop bigger
  dmgNumber(x, y, amt, kind = 'hit') {
    const s = this.s;
    if (!s || s.gameOver || amt <= 0 || !this._cheap(s) || !s.camNear(x, y)) return;
    this._dnAcc = (this._dnAcc || 0) + 1;
    if (this._dnAcc % 2) return; // halve density in big fights
    const col = kind === 'crit' ? '#ffd23f' : kind === 'shield' ? '#7db4ff' : kind === 'armor' ? '#b8c4d0' : '#ffffff';
    const t = s.add.text(x + (Math.random() * 12 - 6), y - 12, kind === 'crit' ? `${amt}!` : `${amt}`, { fontFamily: 'Menlo, monospace', fontSize: kind === 'crit' ? '13px' : '11px', fontWeight: 'bold', color: col }).setOrigin(0.5).setDepth(74).setStroke(2, 0x000000, 0.8).setAlpha(0);
    s.tweens.add({ targets: t, alpha: 1, y: y - 26, scale: kind === 'crit' ? 1.25 : 1, duration: 160, ease: 'Back.easeOut', onComplete: () => s.tweens.add({ targets: t, alpha: 0, y: y - 38, duration: 480, ease: 'Quad.easeIn', onComplete: () => t.destroy() }) });
  }

  // 38) corpse decals — pooled scorch+splat on fresh graves, 30s fade
  registerCorpse(x, y, heavy = false, raceCol = 0x6b1f2f) {
    const s = this.s;
    if (!s || s.gameOver || !s.textures.exists('scorch')) return;
    if ((this._corpN || 0) > 60) return;
    this._corpN = (this._corpN || 0) + 1;
    const sc = s.add.image(x, y, 'scorch').setDepth(6).setAlpha(0.5).setScale(heavy ? 1.9 : 1).setRotation(Math.random() * 6.28);
    const bl = s.add.image(x, y, 'blood').setDepth(7).setAlpha(0.85).setScale(heavy ? 1.5 : 0.8 + Math.random() * 0.5).setRotation(Math.random() * 6.28).setTint(raceCol);
    const ic = heavy && s.textures.exists('corpse') ? s.add.image(x, y, 'corpse').setDepth(7).setAlpha(0.9).setRotation(Math.random() * 6.28) : null;
    s.tweens.add({ targets: [sc, bl, ...(ic ? [ic] : [])], alpha: 0, duration: 24000, delay: 6000, ease: 'Sine.easeIn', onComplete: () => { sc.destroy(); bl.destroy(); if (ic) ic.destroy(); this._corpN = Math.max(0, (this._corpN || 1) - 1); } });
  }

  // 35) selection tint: selected units brighten + green ring + ground glow
  selGlow(u) {
    const s = this.s;
    if (!s || !u || u.dead) return;
    if (!this._selGlows) this._selGlows = new Map();
    this.clearSelGlow(u);
    if (u.sprite) { u._tinted = true; u.sprite.setTint(0xd8f0e0); }
    const r = u.radius || 8;
    const ring = s.add.circle(u.x, u.y, r + 5, 0x6ee7a0, 0).setStrokeStyle(1.5, 0x6ee7a0, 0.85).setDepth(55);
    const glow = s.add.circle(u.x, u.y, r + 2, 0x6ee7a0, 0.12).setDepth(8).setBlendMode(Phaser.BlendModes.ADD);
    this._selGlows.set(u, { ring, glow });
  }
  clearSelGlow(only) {
    if (!this._selGlows) return;
    if (only) {
      const e = this._selGlows.get(only);
      if (e) { e.ring.destroy(); e.glow.destroy(); this._selGlows.delete(only); }
      if (only.sprite && only._tinted) { only.sprite.clearTint(); only._tinted = false; }
      return;
    }
    for (const [u, e] of this._selGlows) { e.ring.destroy(); e.glow.destroy(); if (u.sprite && u._tinted) u.sprite.clearTint(); }
    this._selGlows.clear();
  }
  selGlowTick() {
    if (!this._selGlows) return;
    const s = this.s;
    if (!s) return;
    for (const [u, e] of [...this._selGlows]) {
      if (u.dead || !this.selectionHas?.(u)) { this.clearSelGlow(u); continue; }
      e.ring.setPosition(u.x, u.y);
      e.glow.setPosition(u.x, u.y);
    }
  }
  selectionHas(u) { return this.s?.selection?.has(u); }

  // 36) unaffordable flash: red card + audio cue instead of a silent beep
  unaffordable(card) {
    const s = this.s;
    if (!s || !card) return;
    s.tweens.add({ targets: card, alpha: 0.25, duration: 90, yoyo: true, repeat: 1, onComplete: () => card.setAlpha(1) });
    const bg = card.findOne ? card.findOne(c => c.type === 'RoundedRectangle' || c.type === 'Rectangle') : null;
    if (bg && bg.setFillStyle) {
      const prev = bg.fillColor;
      bg.setFillStyle(0xff4444, 0.55);
      s.time.delayedCall(220, () => { if (bg.active) bg.setFillStyle(prev, bg.fillAlpha); });
    }
  }

  // 37) upgrade-complete orb: flies from the research building to the top bar
  orbFly(x, y) {
    const s = this.s;
    if (!s || s.gameOver) return;
    const orb = s.add.circle(x, y, 4, 0x9fd0ff, 0.95).setDepth(70).setBlendMode(Phaser.BlendModes.ADD);
    const halo = s.add.circle(x, y, 7, 0x9fd0ff, 0.25).setDepth(69).setBlendMode(Phaser.BlendModes.ADD);
    s.tweens.add({ targets: [orb, halo], y: 8, x: s.scale.width * 0.5, scale: 0.3, alpha: 0, duration: 750, ease: 'Cubic.easeIn', onComplete: () => { orb.destroy(); halo.destroy(); } });
  }

  // 39) production queue chips: icons + ETA hovering over the selected producing building
  queueChips() {
    const s = this.s;
    if (!s || s.gameOver) return;
    const b = s.selection && [...s.selection].find(x => x.def && x.queue && x.queue.length && x.built);
    if (!b) {
      if (this._qc) {
        for (const c of (this._qc.c || [])) c.destroy();
        if (this._qc.c) this._qc.c.length = 0;
        this._qc = null;
      }
      return;
    }
    const sig = b.queue.map(q => `${q.kind || q.research}:${Math.ceil(q.remaining)}`).join('|');
    if (this._qc && this._qc.b === b && this._qc.sig === sig) return;
    if (this._qc && this._qc.b === b) { for (const c of this._qc.c) c.destroy(); this._qc.c = []; }
    this._qc = { b, sig, c: [] };
    const bx = b.x, by = b.y - (b.def.h || 2) * 8 - 10;
    b.queue.slice(0, 6).forEach((q, i) => {
      const ox = (i - (Math.min(b.queue.length, 6) - 1) / 2) * 15;
      const kind = q.kind || q.research;
      const isUnit = !!q.kind;
      const chip = s.add.rectangle(bx + ox, by, 13, 13, isUnit ? 0x102436 : 0x2a1c4a, 0.92).setDepth(80).setStrokeStyle(1, isUnit ? 0x4ea1ff : 0xb060ff, 0.9);
      const lbl = s.add.text(bx + ox, by, (isUnit ? (UNITS_SHORT[kind] || '?') : '⚙'), { fontFamily: 'Menlo, monospace', fontSize: '9px', fontWeight: 'bold', color: isUnit ? '#bfe0ff' : '#d8b8ff' }).setOrigin(0.5).setDepth(81);
      if (i === 0) {
        const ring = s.add.circle(bx + ox, by, 8, 0, 0).setStrokeStyle(1.5, 0x6ee7a0, 0.9).setDepth(80);
        const total = q.total || 1;
        const prog = 1 - Math.min(1, q.remaining / total);
        ring.setAngle(-90 + prog * 360);
        this._qc.c.push(ring);
        this._qc._ring = ring; this._qc._q = q;
      }
      this._qc.c.push(chip, lbl);
    });
    s.events.once('shutdown', () => { this._qc = null; });
  }
  queueChipsTick(dt) {
    const s = this.s;
    if (!s || s.gameOver) return;
    this._qcT = (this._qcT || 0) - dt;
    if (this._qcT <= 0) { this._qcT = 0.25; this.queueChips(); }
    if (this._qc && this._qc._ring && this._qc._q && !this._qc.b.dead) {
      const prog = 1 - Math.min(1, this._qc._q.remaining / (this._qc._q.total || 1));
      this._qc._ring.setAngle(-90 + prog * 360);
    }
  }

  // ---------------- v2.27 AAA layer ----------------

  // 41) eased camera jump: all centerOn calls glide with an ease-out curve
  smoothCenter(x, y, dur = 320) {
    const s = this.s;
    if (!s) return;
    const cam = s.cameras.main;
    if (!this._camTween) this._camTween = { pan: { x: cam.scrollX, y: cam.scrollY } };
    const t = this._camTween;
    if (t.tw) t.tw.stop();
    t.pan.x = cam.scrollX; t.pan.y = cam.scrollY;
    const vw = cam.worldView;
    t.tw = s.tweens.add({ targets: t.pan, x: x - vw.width / 2, y: y - vw.height / 2, duration: dur, ease: 'Cubic.easeOut', onUpdate: () => { cam.scrollX = t.pan.x; cam.scrollY = t.pan.y; } });
  }

  // 42) camera follow: lock cam onto a moving unit until order/combat breaks it
  follow(u) {
    const s = this.s;
    if (!s || !u || u.dead) return;
    this._follow = u;
    s.events.emit('hud:alert', 'CAM FOLLOW ENGAGED');
  }
  stopFollow() { this._follow = null; }
  followTick(dt) {
    const s = this.s;
    const u = this._follow;
    if (!s || !u || u.dead || s.paused) return;
    const cam = s.cameras.main;
    const vw = cam.worldView;
    // soft deadzone: only nudge when unit drifts past inner box
    const dx = u.x - cam.scrollX - vw.width / 2, dy = u.y - cam.scrollY - vw.height / 2;
    const zx = vw.width * 0.16, zy = vw.height * 0.16;
    if (Math.abs(dx) > zx || Math.abs(dy) > zy) {
      const k = 1 - Math.pow(0.001, dt);
      cam.scrollX += (u.x - vw.width / 2 - cam.scrollX) * k;
      cam.scrollY += (u.y - vw.height / 2 - cam.scrollY) * k;
    }
  }

  // 43) anchor-wheel zoom: zoom glides, keeping the cursor world point fixed
  anchorZoom(p, dy) {
    const s = this.s;
    if (!s) return;
    const cam = s.cameras.main;
    const before = this.worldFor ? this.worldFor(p) : { x: p.x / cam.zoom + cam.scrollX, y: p.y / cam.zoom + cam.scrollY };
    const nz = Phaser.Math.Clamp(cam.zoom - dy * 0.0012, 0.8, 2.6);
    const z0 = cam.zoom, sx0 = cam.scrollX, sy0 = cam.scrollY;
    const f = nz / z0;
    const nx = before.x - (before.x - sx0) / f;
    const ny = before.y - (before.y - sy0) / f;
    if (this._zoomTween) this._zoomTween.stop();
    this._zoomTween = s.tweens.addCounter({ from: 0, to: 1, duration: 150, ease: 'Quad.easeOut', onUpdate: (twn) => {
      const v = twn.getValue(0, 1);
      cam.setZoom(z0 + (nz - z0) * v);
      cam.scrollX = sx0 + (nx - sx0) * v;
      cam.scrollY = sy0 + (ny - sy0) * v;
      if (s.hotseat && s.cam2) { s.cam2.setZoom(cam.zoom); s.cam2.scrollX = cam.scrollX; s.cam2.scrollY = cam.scrollY; }
    } });
  }

  // 44) status icon chips under a unit: stim/cloak/burrow/siege with drain arc
  statusIcons(u) {
    const s = this.s;
    if (!s || s.gameOver || !u || u.dead || !u.container || !s.camNear(u.x, u.y)) return;
    const nowMs = (s.gameTime || 0) * 1000;
    this._siTs = this._siTs || {};
    if (this._siTs[u.id] && nowMs - this._siTs[u.id] < 50) return; // 20Hz per unit
    this._siTs[u.id] = nowMs;
    this._statIcons = this._statIcons || new Map();
    const key = u.id + ':' + [u.stimmed ? 1 : 0, u.cloaked ? 1 : 0, u.burrowed ? 1 : 0, u.sieged ? 1 : 0].join('') + ':' + Math.min(3, (u._kills || 0) >= 6 ? 3 : (u._kills || 0) >= 3 ? 2 : (u._kills || 0) >= 1 ? 1 : 0);
    const prev = this._statIcons.get(u.id);
    if (prev && prev.key === key) return;
    if (prev) { for (const c of prev.nodes) c.destroy(); }
    const nodes = [];
    const bits = [];
    if (u.stimmed) bits.push(['S', 0xff7a5c]);
    if (u.cloaked) bits.push(['C', 0x9fd0ff]);
    if (u.burrowed) bits.push(['B', 0xc9a06a]);
    if (u.sieged) bits.push(['T', 0xffd23f]);
    const vetRank = (u._kills || 0) >= 6 ? 3 : (u._kills || 0) >= 3 ? 2 : (u._kills || 0) >= 1 ? 1 : 0;
    if (vetRank) bits.push(['▲'.repeat(vetRank), u.team === 0 ? 0x6ee7a0 : 0xff5c5c]);
    bits.forEach(([ch, col], i) => {
      const x = u.x + (i - (bits.length - 1) / 2) * 11;
      nodes.push(s.add.circle(x, u.y + (u.radius || 6) + 7, 4.5, 0x050a14, 0.92).setStrokeStyle(1, col, 0.95).setDepth(54));
      nodes.push(s.add.text(x, u.y + (u.radius || 6) + 7, ch, { fontFamily: 'Menlo, monospace', fontSize: '7px', fontWeight: 'bold', color: '#' + col.toString(16).padStart(6, '0') }).setOrigin(0.5).setDepth(55));
    });
    this._statIcons.set(u.id, { key, nodes });
  }

  // 45) movement dust kicked up by running troops, tone by surface
  moveDust(u) {
    const s = this.s;
    if (!s || s.gameOver || !this._cheap(s) || !s.camNear(u.x, u.y)) return;
    u._dustT = (u._dustT || 0) + 1;
    if (u._dustT % 5) return;
    const kind = s.terrainKindAt ? s.terrainKindAt(u.x, u.y) : 'dirt';
    const col = kind === 'rock' ? 0x9aa4ae : kind === 'metal' ? 0xb8c8dc : 0xc9a06a;
    const d = s.add.circle(u.x + (Math.random() * 6 - 3), u.y + (u.radius || 5), 1.6 + Math.random(), col, 0.4).setDepth(8);
    s.tweens.add({ targets: d, alpha: 0, scale: 2.2, y: u.y + (u.radius || 5) + 2, duration: 380, onComplete: () => d.destroy() });
  }

  // 46) directional damage vignette: edge darkens toward the shooter
  hitVignette(sx, sy, heavy = false) {
    const s = this.s;
    if (!s || s.gameOver) return;
    const now = s.gameTime || 0;
    if (now - (this._hvAt || 0) < 0.8) return;
    this._hvAt = now;
    const W = s.scale.width, H = s.scale.height;
    const g = s.add.graphics().setScrollFactor(0).setDepth(1880);
    const a = Math.atan2(sy - H / 2, sx - W / 2);
    const cx = W / 2 + Math.cos(a) * W * 0.5, cy = H / 2 + Math.sin(a) * H * 0.5;
    g.fillStyle(0x8a0f0f, heavy ? 0.4 : 0.26);
    for (let i = 0; i < 5; i++) {
      const px = cx + (Math.random() * 120 - 60), py = cy + (Math.random() * 120 - 60);
      g.fillCircle(px, py, 90 + Math.random() * 60);
    }
    s.tweens.add({ targets: g, alpha: 0, duration: 700, ease: 'Quad.easeOut', onComplete: () => { g.destroy(); } });
  }

  // 47) cast ring: ground rune tightens as channel completes
  castRing(x, y, durMs, col = 0xb060ff) {
    const s = this.s;
    if (!s || s.gameOver) return;
    const ring = s.add.circle(x, y, 42, 0, 0).setStrokeStyle(2.5, col, 0.9).setDepth(50);
    const inner = s.add.circle(x, y, 42, col, 0.06).setDepth(49);
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i;
      const tick = s.add.rectangle(x + Math.cos(a) * 42, y + Math.sin(a) * 42, 2, 8, col, 0.8).setDepth(50).setRotation(a);
      s.tweens.add({ targets: tick, x: x + Math.cos(a) * 10, y: y + Math.sin(a) * 10, alpha: 0, duration: durMs, ease: 'Cubic.easeIn', onComplete: () => tick.destroy() });
    }
    s.tweens.add({ targets: [ring, inner], radius: 10, alpha: 0.15, duration: durMs, ease: 'Cubic.easeIn', onComplete: () => { ring.destroy(); inner.destroy(); } });
  }

  // 48) materialize blur when a cloaked enemy becomes visible
  materialize(u) {
    const s = this.s;
    if (!s || !u || !s.camNear(u.x, u.y) || !this._cheap(s)) return;
    for (let i = 0; i < 4; i++) {
      const r = s.add.circle(u.x + (Math.random() * 16 - 8), u.y + (Math.random() * 16 - 8), 3 + Math.random() * 4, 0x9fd0ff, 0.35).setDepth(51).setBlendMode(Phaser.BlendModes.ADD);
      s.tweens.add({ targets: r, alpha: 0, scale: 0.4, duration: 480 + i * 60, onComplete: () => r.destroy() });
    }
  }

  // 49) directional death ragdoll: corpse tumbles away from the shot
  ragdoll(u, fromX, fromY) {
    const s = this.s;
    if (!s || !u || !s.camNear(u.x, u.y) || !u.sprite) return;
    const a = Math.atan2(u.y - fromY, u.x - fromX);
    const sp = 14 + Math.random() * 16;
    const spr = u.sprite;
    spr.setDepth(12);
    s.tweens.add({ targets: spr, x: u.x + Math.cos(a) * sp, y: u.y + Math.sin(a) * sp * 0.6 - 4, rotation: spr.rotation + (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random()), duration: 260, ease: 'Quad.easeOut' });
  }

  // 49) v2.28 gas assignment UI: worker-count badge + depletion ring hovering
  // over every owned refinery-bearing geyser; rebuilt only when state changes.
  gasBadgesTick(dt) {
    const s = this.s;
    if (!s || s.gameOver) return;
    this._gbT = (this._gbT || 0) - dt;
    if (this._gbT > 0) return;
    this._gbT = 0.5;
    this._gb = this._gb || new Map();
    const live = new Set();
    const team = s.activeTeam ?? 0;
    for (const g of s.geysers || []) {
      const b = g.building;
      if (!b || b.dead || b.team !== team || !b.built) continue;
      if (!s.camNear(g.x, g.y)) continue;
      live.add(g.id);
      const n = (g.workers || []).filter(w => !w.dead).length;
      const pct = Math.max(0, Math.round(100 * (g.gas / (g.full || g.gas || 1))));
      const sig = `${n}:${pct}`;
      const prev = this._gb.get(g.id);
      if (prev && prev.sig === sig) continue;
      if (prev) for (const c of prev.nodes) c.destroy();
      const nodes = [];
      const bx = g.x, by = g.y - 16;
      nodes.push(s.add.rectangle(bx, by, 26, 12, 0x050a14, 0.88).setDepth(79).setStrokeStyle(1, n > 0 ? 0x6ee7a0 : 0x5a6b7f, 0.9));
      nodes.push(s.add.text(bx - 4, by, `${n}/3`, { fontFamily: 'Menlo, monospace', fontSize: '8px', fontWeight: 'bold', color: n > 0 ? '#9fffff' : '#7c8ba0' }).setOrigin(0.5).setDepth(80));
      // depletion ring: shrinks as gas runs out, amber when <25%
      const col = pct < 25 ? 0xffb45c : 0x7dffd9;
      const ring = s.add.circle(bx, by, 9.5, 0, 0).setStrokeStyle(1.5, col, 0.85).setAngle(-90).setDepth(79);
      ring.setEndAngle(-90 + (pct / 100) * 360 - 0.001);
      nodes.push(ring);
      this._gb.set(g.id, { sig, nodes });
    }
    // sweep badges for geysers no longer eligible
    if (this._gb.size) {
      for (const [id, v] of this._gb) {
        if (!live.has(id)) { for (const c of v.nodes) c.destroy(); this._gb.delete(id); }
      }
    }
  }

  // 50) v2.28 gas crew assignment pop: green worker-count stamp over refinery
  gasAssignFX(g) {
    const s = this.s;
    if (!s || s.gameOver || !g) return;
    const n = (g.workers || []).filter(w => !w.dead).length;
    const t = s.add.text(g.x, g.y - 20, `GAS CREW ${n}/3`, { fontFamily: 'Menlo, monospace', fontSize: '10px', fontWeight: 'bold', color: '#9fffff', stroke: '#04070d', strokeThickness: 3 }).setOrigin(0.5).setDepth(120);
    s.tweens.add({ targets: t, y: t.y - 14, alpha: 0, duration: 900, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
    if (n >= 3) {
      const full = s.add.circle(g.x, g.y - 16, 10, 0, 0).setStrokeStyle(2, 0x6ee7a0, 0.9).setDepth(119);
      s.tweens.add({ targets: full, scale: 1.9, alpha: 0, duration: 420, ease: 'Cubic.easeOut', onComplete: () => full.destroy() });
    }
  }

  // 51) v2.28 formation-engage visual: brief slot-ghosts where an attack-move
  // war party will spread on arrival, so the player sees the line form.
  formationGhosts(list, x, y) {
    const s = this.s;
    if (!s || s.gameOver || !list || list.length < 3 || !this._cheap(s)) return;
    const combat = list.filter(u => !u.def.worker);
    if (combat.length !== list.length) return;
    const n = Math.min(list.length, 12);
    const anchor = list[0];
    const dx = x - anchor.x, dy = y - anchor.y;
    const len = Math.hypot(dx, dy) || 1;
    const px = -dy / len, py = dx / len;
    const spacing = (s.TILE || 16) * 0.8;
    for (let i = 0; i < n; i++) {
      const k = i - (n - 1) / 2;
      const gx = x + px * k * spacing - (dx / len) * ((Math.abs(k) % 2) * spacing * 0.4);
      const gy = y + py * k * spacing - (dy / len) * ((Math.abs(k) % 2) * spacing * 0.4);
      const gh = s.add.circle(gx, gy, 4.5, 0, 0).setStrokeStyle(1, 0xff8080, 0.55).setDepth(49);
      s.tweens.add({ targets: gh, alpha: 0, scale: 0.4, delay: i * 25, duration: 380, onComplete: () => gh.destroy() });
    }
  }

  tick(dt, ctx) {
    // under-attack watchdog: ally units flashing recent damage
    const s = this.s;
    if (!s || s.gameOver) return;
    const hurt = (ctx.units || []).filter(u => !u.dead && u.team === 0 && u._lastHurtT && (ctx.gameTime - u._lastHurtT) < 1.2).length;
    if (hurt >= 2) this.underAttack(ctx.units.find(u => !u.dead && u.team === 0 && u._lastHurtT)?.x);
    this.creepBubbles(dt);
    this.cloakScan(dt);
    this.ambient(dt);
    this.selGlowTick();
    this.queueChipsTick(dt);
    this.gasBadgesTick(dt);
    // v2.27: camera follow + per-unit presentation upkeep
    this.followTick(dt);
    if (s.selection) {
      for (const u of s.selection) if (!u.dead) this.statusIcons(u);
    }
    if (!s.paused) {
      for (const u of s.units) {
        if (u.dead || u.def.worker) continue;
        if (u.state === 'move' || u.state === 'attackMove' || u.state === 'attackTarget') this.moveDust(u);
        if (u.cloaked && s.currentlyVisible(u.x, u.y) && u.sprite && u.sprite.visible) this.statusIcons(u);
      }
    }
    // cloaked->visible materialize detection
    this._matSeen = this._matSeen || new WeakSet();
    for (const u of s.units) {
      if (u.dead || u.team === 0) continue;
      const vis = s.currentlyVisible(u.x, u.y);
      if (u.cloaked && vis && !this._matSeen.has(u)) { this._matSeen.add(u); this.materialize(u); }
      if (!u.cloaked) this._matSeen.delete(u);
    }
  }
}

// short labels for queue chips
const UNITS_SHORT = { marine: 'M', firebat: 'F', tank: 'T', medic: '+', ghost: 'G', vulture: 'V', goliath: 'G', scv: 'W', zealot: 'Z', dragoon: 'D', stalker: 'S', darkTemplar: 'D', archon: 'A', probe: 'W', mutalisk: 'M', hydralisk: 'H', lurker: 'L', broodling: 'B', scourge: 'S', ultralisk: 'U', infestor: 'I', defiler: 'D', drone: 'W', queen: 'Q', overlord: 'O', tauRifle: 'T' };
