// CutScene — SC-style letterboxed cinematic player.
// Plays a beat script (see engine/cutscenes.js): procedural "sets" drawn
// with canvas tweens, typewriter radio dialogue with speaker busts, FX
// flashes, static transitions, and objective stamps. Skippable with
// click/ENTER/SPACE/ESC; frame-accurate in headless via time-based tweens.
import Phaser from 'phaser';
import { SPEAKERS } from '../engine/cutscenes.js';

const MONO = 'Menlo, monospace';

export class CutScene extends Phaser.Scene {
  constructor() { super('Cut'); }

  init(data) {
    this.script = data.script || [];
    this.title = data.title || '';
    this.stampText = data.stamp || '';
    this.mode = data.mode || 'intro'; // 'intro' | 'brief'
    this.done = data.done || null;    // callback invoked on close
    this.onComplete = data.onComplete || null;
    this.i = 0;
    this._closed = false;
  }

  create() {
    this.W = this.scale.width; this.H = this.scale.height;
    this.add.rectangle(0, 0, this.W, this.H, 0x02040a).setOrigin(0, 0);

    this.stageLayer = this.add.container(0, 0);
    this.fxLayer = this.add.container(0, 0);
    this.uiLayer = this.add.container(0, 0);

    this.makeStars();
    this.makeLetterbox();
    this.makeRadioUI();

    // skip controls (SC1-style ESC/click to skip)
    this.input.mouse.disableContextMenu();
    const skip = () => this.close();
    this.input.on('pointerdown', (p) => { if (this._closing) return; p.event?.preventDefault?.(); skip(); });
    this.input.keyboard.on('keydown-ENTER', skip);
    this.input.keyboard.on('keydown-SPACE', skip);
    this.input.keyboard.on('keydown-ESC', skip);

    this.audio = {
      tone: (f, d, t, v) => { try { window.__SCC2?.registry?.get?.('audio2')?.tone?.(f, d, t, v); } catch (e) {} },
    };

    this.playNext();
  }

  // ---------- persistent chrome ----------
  makeStars() {
    this.stars = [];
    for (let i = 0; i < 140; i++) {
      const s = Math.random() * 1.8 + 0.4;
      const st = this.add.circle(Math.random() * 2400, Math.random() * this.H, s, 0xffffff, 0.12 + Math.random() * 0.5);
      this.stars.push(st);
    }
  }

  makeLetterbox() {
    this.barTop = this.add.rectangle(0, 0, this.W, 44, 0x000000, 1).setOrigin(0, 0).setDepth(50);
    this.barBot = this.add.rectangle(0, this.H - 44, this.W, 44, 0x000000, 1).setOrigin(0, 0).setDepth(50);
    this.tweens.add({ targets: this.stars, alpha: { from: 0.1, to: 0.7 }, duration: 2200, yoyo: true, repeat: -1, delay: Math.random() * 1000 });
    // slow parallax drift for the whole starfield
    this.tweens.add({ targets: this, starScroll: { from: 0, to: 1 }, duration: 60000, repeat: -1, onUpdate: () => {
      const k = this.starScroll || 0;
      for (const st of this.stars) st.x -= 0.06 + st.radius * 0.02;
      for (const st of this.stars) if (st.x < -4) st.x = this.W + 4;
      void k;
    } });
    if (this.title) {
      this.titleTxt = this.add.text(this.W - 14, 54, this.title, { fontFamily: MONO, fontSize: '13px', color: '#54688a', fontStyle: 'bold' }).setOrigin(1, 0).setDepth(51).setAlpha(0.85);
    }
  }

  makeRadioUI() {
    // scanline overlay (cheap: alternating alpha rects)
    const sl = this.add.graphics().setDepth(60).setScrollFactor(0);
    sl.fillStyle(0x000000, 0.10);
    for (let y = 0; y < this.H; y += 4) sl.fillRect(0, y, this.W, 1);
    this.skipHint = this.add.text(this.W - 14, this.H - 30, '[ CLICK / ENTER TO SKIP ]', { fontFamily: MONO, fontSize: '11px', color: '#3d4f6e' }).setOrigin(1, 0.5).setDepth(61);
    this.tweens.add({ targets: this.skipHint, alpha: { from: 0.35, to: 0.9 }, duration: 1200, yoyo: true, repeat: -1 });
  }

  clearStage() { this.stageLayer.removeAll(true); }
  clearFx() { this.fxLayer.removeAll(true); }

  // ---------- audio helpers via the global audio2 if attached ----------
  sfx(kind) {
    const a = window.__SCC2?.audio2;
    if (!a) return;
    try {
      if (kind === 'burn') { a.noise(1.4, 0.12, 1200); a.zap?.(); }
      else if (kind === 'radar') { a.orderPing?.(); a.tone(900, 0.25, 'square', 0.03, -300); }
      else if (kind === 'static') { a.noise(0.9, 0.09, 3000); }
      else if (kind === 'stamp') { a.objective?.(); }
      else if (kind === 'low') { a.tone(55, 1.6, 'sawtooth', 0.05, -12); }
      else if (kind === 'whine') { a.tone(180, 1.8, 'sine', 0.04, 900); }
      else if (kind === 'heartbeat') { a.tone(70, 0.22, 'sine', 0.05); setTimeout(() => a.tone(58, 0.3, 'sine', 0.04), 320); }
    } catch (e) { /* silent */ }
  }

  say(who, text) {
    const sp = SPEAKERS[who] || { name: who.toUpperCase(), color: '#c9d6ee' };
    // bust = lettered badge, SC-portrait flavored
    const bx = 24, by = this.H - 118;
    const bust = this.add.graphics().setDepth(40);
    bust.fillStyle(0x0a1220, 0.92).fillRoundedRect(bx, by, 40, 40, 4).setDepth(40);
    bust.lineStyle(2, parseInt(sp.color.slice(1), 16), 0.9).strokeRoundedRect(bx, by, 40, 40, 4);
    const initial = this.add.text(bx + 20, by + 20, sp.name[0], { fontFamily: MONO, fontSize: '22px', color: sp.color, fontStyle: 'bold' }).setOrigin(0.5).setDepth(41);
    const name = this.add.text(bx + 52, by + 2, sp.name, { fontFamily: MONO, fontSize: '12px', color: sp.color, fontStyle: 'bold' }).setDepth(40);
    const box = this.add.graphics().setDepth(40);
    const msgW = Math.min(this.W - 120, 720);
    box.fillStyle(0x050a14, 0.88).fillRoundedRect(bx + 50, by + 22, msgW, 52, 4);
    box.lineStyle(1, 0x2f3a49, 1).strokeRoundedRect(bx + 50, by + 22, msgW, 52, 4);
    const txt = this.add.text(bx + 60, by + 30, '', { fontFamily: MONO, fontSize: '14px', color: '#dbe7ff', wordWrap: { width: msgW - 20 }, align: 'left' }).setDepth(41);
    // typewriter (end-synced, frame-accurate for headless)
    let ci = 0;
    const typer = this.add.tween({ targets: { k: 0 }, k: 1, duration: Math.max(900, text.length * 26), ease: 'none', onUpdate: (t) => {
      const want = Math.floor(t.targets.k * text.length);
      if (want > ci) { ci = want; txt.setText(text.slice(0, ci)); }
    }, onComplete: () => txt.setText(text) });
    this.sfx('radar');
    if (window.__SCC2?.audio2?.bark) { try { window.__SCC2.audio2.bark(text, who === 'overseer' ? 0.5 : who === 'conclave' ? 1.2 : 0.85, 1.0); } catch (e) {} }
    this.stageLayer.add([bust, initial, name, box, txt]);
    return { part: txt, bust, initial, name, box, typer };
  }

  // ---------- procedural "sets" ----------
  drawArt(kind) {
    this.clearStage();
    const g = this.add.graphics().setDepth(10);
    const cx = this.W * 0.5, cy = this.H * 0.42;
    if (kind === 'wreckage') {
      // derelict freighter hulls drifting, embers
      g.fillStyle(0x101823, 1);
      g.fillTriangle(cx - 320, cy + 40, cx - 40, cy - 30, cx - 120, cy + 90);
      g.fillStyle(0x18202c, 1);
      g.fillTriangle(cx + 60, cy + 70, cx + 300, cy - 10, cx + 240, cy + 110);
      g.lineStyle(2, 0x2b3648, 1);
      g.lineBetween(cx - 200, cy + 20, cx + 150, cy + 60);
      const ember = this.add.circle(cx - 60, cy + 10, 3, 0xffb454, 0.9).setDepth(11);
      this.tweens.add({ targets: ember, alpha: { from: 0.9, to: 0.1 }, scale: { from: 1, to: 2.6 }, duration: 1400, repeat: -1, yoyo: true });
      this.stageLayer.add(g);
      this.sfx('low');
      return;
    }
    if (kind === 'alien') {
      // protoss wedge powers up over the salvage yard
      g.fillStyle(0x0a0f1c, 1).fillCircle(cx, cy, 200);
      g.fillStyle(0x141b2e, 1);
      g.fillTriangle(cx, cy - 110, cx - 150, cy + 70, cx + 150, cy + 70);
      g.fillStyle(0x1c2740, 1);
      g.fillTriangle(cx, cy - 60, cx - 70, cy + 50, cx + 70, cy + 50);
      g.lineStyle(3, 0xa78bfa, 0.9);
      g.beginPath(); g.moveTo(cx, cy - 110); g.lineTo(cx - 150, cy + 70); g.lineTo(cx + 150, cy + 70); g.closePath(); g.strokePath();
      const core = this.add.circle(cx, cy, 10, 0xc4b5fd, 0.95).setDepth(11);
      const ring = this.add.circle(cx, cy, 40, 0x000000, 0).setStrokeStyle(2, 0xa78bfa, 0.8).setDepth(11);
      this.tweens.add({ targets: core, alpha: { from: 0.3, to: 1 }, duration: 1800, yoyo: true, repeat: -1 });
      this.tweens.add({ targets: ring, alpha: 0, scale: 4.5, duration: 2200, ease: 'Sine.easeOut' });
      this.stageLayer.add(g);
      this.sfx('whine');
      return;
    }
    if (kind === 'burn') {
      // the killing stroke: white lance, then violet fire wash
      const beam = this.add.rectangle(cx, cy, 8, 620, 0xffffff, 0.95).setRotation(0.5).setDepth(12);
      this.tweens.add({ targets: beam, alpha: { from: 0, to: 1 }, scaleX: { from: 0.2, to: 9 }, duration: 500, ease: 'Cubic.easeIn', onComplete: () => {
        const wash = this.add.rectangle(this.W / 2, this.H / 2, this.W, this.H, 0xa78bfa, 0).setDepth(13);
        this.tweens.add({ targets: wash, fillAlpha: 0.5, duration: 300, onComplete: () => this.tweens.add({ targets: wash, fillAlpha: 0, duration: 1600 }) });
      } });
      this.stageLayer.add(beam);
      this.sfx('burn');
      return;
    }
    if (kind === 'title') {
      const big = this.add.text(this.W / 2, this.H * 0.34, 'STARFRONT', { fontFamily: MONO, fontSize: '84px', color: '#e8f1ff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(12).setScale(1.6).setAlpha(0);
      const sub = this.add.text(this.W / 2, this.H * 0.34 + 74, 'C O N F L I C T', { fontFamily: MONO, fontSize: '26px', color: '#4ea1ff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(12).setAlpha(0);
      this.tweens.add({ targets: big, alpha: 1, scale: 1, duration: 900, ease: 'Cubic.easeOut' });
      this.tweens.add({ targets: sub, alpha: 1, delay: 500, duration: 700 });
      const flare = this.add.circle(this.W / 2, this.H * 0.34, 140, 0x123a66, 0.25).setDepth(11);
      this.tweens.add({ targets: flare, scale: 1.4, alpha: 0.08, duration: 2400, yoyo: true, repeat: -1 });
      this.stageLayer.add(big); this.stageLayer.add(sub); this.stageLayer.add(flare);
      this.sfx('low');
      return;
    }
    if (kind === 'armada') {
      // host fleet crossing a planet's terminator
      const planet = this.add.graphics().setDepth(10);
      planet.fillStyle(0x0c1422, 1).fillCircle(this.W * 0.78, this.H * 0.75, 360);
      planet.lineStyle(2, 0x1c2740, 1).strokeCircle(this.W * 0.78, this.H * 0.75, 360);
      planet.fillStyle(0x12305c, 0.35).fillCircle(this.W * 0.78 - 90, this.H * 0.75 - 120, 330);
      this.stageLayer.add(planet);
      for (let i = 0; i < 7; i++) {
        const sh = this.add.graphics().setDepth(11);
        sh.fillStyle(0x131c2c, 1).fillTriangle(i * 40 + 60, this.H * 0.2 + i * 18, i * 40 + 130, this.H * 0.18 + i * 18, i * 40 + 110, this.H * 0.24 + i * 18);
        sh.lineStyle(1, 0x4ea1ff, 0.5); sh.strokeTriangle(i * 40 + 60, this.H * 0.2 + i * 18, i * 40 + 130, this.H * 0.18 + i * 18, i * 40 + 110, this.H * 0.24 + i * 18);
        sh.x = -200 - i * 60;
        this.tweens.add({ targets: sh, x: this.W + 300, duration: 6000 + i * 600, ease: 'Sine.easeInOut' });
        const engine = this.add.circle(i * 40 + 60, this.H * 0.21 + i * 18, 2.5, 0x4ea1ff, 0.9).setDepth(12);
        engine.x = sh.x + 0;
        this.tweens.add({ targets: engine, x: this.W + 300 - 200, duration: 6000 + i * 600, ease: 'Sine.easeInOut' });
        this.stageLayer.add(sh); this.stageLayer.add(engine);
      }
      this.sfx('low');
      return;
    }
  }

  fx(kind, color) {
    this.clearFx();
    const col = parseInt((color || '#ff5c5c').slice(1), 16);
    if (kind === 'radar') {
      const cx = this.W * 0.82, cy = this.H * 0.22;
      const gg = this.add.graphics().setDepth(20);
      gg.lineStyle(1, col, 0.5).strokeCircle(cx, cy, 120).strokeCircle(cx, cy, 70);
      const sweep = this.add.graphics().setDepth(21);
      sweep.fillStyle(col, 0.35); sweep.slice(cx, cy, 120, -0.5, 0.2); sweep.fillPath();
      this.tweens.add({ targets: sweep, angle: 360, duration: 1600, ease: 'linear' });
      const blip = this.add.circle(cx + 50, cy - 40, 4, col, 1).setDepth(22).setAlpha(0);
      this.tweens.add({ targets: blip, alpha: { from: 1, to: 0 }, duration: 1200, delay: 600 });
      this.fxLayer.add([gg, sweep, blip]);
      this.stageLayer.add(this.add.text(cx, cy + 150, this.pendingFxText || 'CONTACT', { fontFamily: MONO, fontSize: '13px', color: col, fontStyle: 'bold' }).setOrigin(0.5).setDepth(21));
      this.sfx('radar');
      return;
    }
    if (kind === 'burn') {
      const flash = this.add.rectangle(this.W / 2, this.H / 2, this.W, this.H, 0xffffff, 0).setDepth(20);
      this.tweens.add({ targets: flash, fillAlpha: { from: 0, to: 0.85 }, duration: 220, onComplete: () => this.tweens.add({ targets: flash, fillAlpha: 0, duration: 900 }) });
      this.fxLayer.add(flash);
      this.sfx('burn');
    }
  }

  staticFlash() {
    const gg = this.add.graphics().setDepth(30);
    const bars = [];
    for (let y = 0; y < this.H; y += 6) {
      const a = Math.random() * 0.5;
      gg.fillStyle(0xffffff, a).fillRect(0, y, this.W, 3 + Math.random() * 3);
    }
    bars.push(gg);
    this.fxLayer.add(gg);
    this.sfx('static');
  }

  card(text) {
    const t = this.add.text(this.W / 2, this.H * 0.4, text, { fontFamily: MONO, fontSize: '40px', color: '#e8f1ff', fontStyle: 'bold', align: 'center' }).setOrigin(0.5).setDepth(25).setAlpha(0).setScale(1.15);
    this.tweens.add({ targets: t, alpha: 1, scale: 1, duration: 600, ease: 'Cubic.easeOut' });
    this.stageLayer.add(t);
    this.sfx('low');
  }

  stamp(text) {
    const t = this.add.text(this.W / 2, this.H - 170, text, { fontFamily: MONO, fontSize: '20px', color: '#ffd23f', fontStyle: 'bold' }).setOrigin(0.5).setDepth(25).setAlpha(0).setScale(1.4);
    this.tweens.add({ targets: t, alpha: 1, scale: 1, duration: 280, ease: 'Back.easeOut' });
    this.sfx('stamp');
    this.stageLayer.add(t);
  }

  // ---------- beat sequencer ----------
  playNext() {
    if (this._closing) return;
    this.clearStage(); this.clearFx();
    const beat = this.script[this.i];
    if (!beat) { this.close(); return; }
    const wait = (beat.wait || 3) * 1000;
    this.pendingFxText = beat.text && beat.kind === 'fx' ? beat.text : null;

    if (beat.kind === 'scene') this.drawArt(beat.art);
    else if (beat.kind === 'radio') this.say(beat.who, beat.text);
    else if (beat.kind === 'fx') this.fx(beat.fx, beat.color);
    else if (beat.kind === 'static') this.staticFlash();
    else if (beat.kind === 'card') this.card(beat.text);
    else if (beat.kind === 'obj') this.stamp(beat.text);

    this.i++;
    this._advance = this.time.delayedCall(wait, () => this.playNext());
  }

  close() {
    if (this._closed) return;
    this._closed = true;
    if (this._advance) this._advance.remove();
    const cb = this.onComplete || this.done;
    this.cameras.main.fadeOut(260, 0, 0, 0);
    this.time.delayedCall(280, () => {
      this.scene.stop();
      if (typeof cb === 'function') { try { cb(); } catch (e) {} }
      else if (this.mode === 'brief') this.scene.start('Battle', this.launchArgs || undefined);
    });
  }

  // for briefing mode: pass launch args through to Battle
  launch(args) { this.launchArgs = args; this.close(); }
}
