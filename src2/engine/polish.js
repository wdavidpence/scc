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

  tick(dt, ctx) {
    // under-attack watchdog: ally units flashing recent damage
    const s = this.s;
    if (!s || s.gameOver) return;
    const hurt = (ctx.units || []).filter(u => !u.dead && u.team === 0 && u._lastHurtT && (ctx.gameTime - u._lastHurtT) < 1.2).length;
    if (hurt >= 2) this.underAttack(ctx.units.find(u => !u.dead && u.team === 0 && u._lastHurtT)?.x);
  }
}
