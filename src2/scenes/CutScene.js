// CutScene — SC-style letterboxed cinematic player (v2.30 AAA rework).
// Painted concept-art sets with Ken Burns motion, film grain + dust, real
// pre-baked audio beds, fully voiced radio monologue, chromatic logo,
// hyperspace sting. Skippable with click/ENTER/SPACE/ESC.
import Phaser from 'phaser';
import { SPEAKERS } from '../engine/cutscenes.js';
import * as cin from '../engine/cinematicAudio.js';

const MONO = 'Menlo, monospace';
const DISPLAY = 'Orbitron';
const BODY = 'Rajdhani';
const ART_BASE = 'assets/cinematic/';
const ART_KEYS = { wreckage: 'cin_wreckage', alien: 'cin_alien', armada: 'cin_armada', titlebg: 'cin_titlebg' };

export function preloadCinematic(scene) {
  // idempotent — safe to call from any scene
  for (const [kind, key] of Object.entries(ART_KEYS)) {
    if (!scene.textures.exists(key)) scene.load.image(key, ART_BASE + kind + '.jpg');
  }
  scene.load.start();
  try {
    document.fonts?.load('900 84px ' + DISPLAY);
    document.fonts?.load('700 20px ' + BODY);
  } catch (e) { /* fonts optional */ }
}

export class CutScene extends Phaser.Scene {
  constructor() { super('Cut'); }

  preload() { preloadCinematic(this); }

  init(data) {
    this.script = data.script || [];
    this.title = data.title || '';
    this.stampText = data.stamp || '';
    this.mode = data.mode || 'intro'; // 'intro' | 'brief'
    this.done = data.done || null;    // callback invoked on close
    this.onComplete = data.onComplete || null;
    this.i = 0;
    this._closed = false;
    this._audioNodes = [];
    this._pendingWait = 0;
  }

  create() {
    this.W = this.scale.width; this.H = this.scale.height;

    const bg = this.add.graphics().setDepth(0);
    bg.fillGradientStyle(0x10233c, 0x10233c, 0x070d1a, 0x070d1a, 1);
    bg.fillRect(0, 0, this.W, this.H);

    this.stageLayer = this.add.container(0, 0);
    this.fxLayer = this.add.container(0, 0);
    this.uiLayer = this.add.container(0, 0);

    this.makeStars();
    this.makeLetterbox();
    this.makeRadioUI();
    this.makeGrain();
    this.makeDust();

    // audio beds: cinematic skarling + faint radio static (real assets)
    cin.resume();
    cin.preloadAll('');
    this._audioNodes.push(cin.bed(0.5));
    this._audioNodes.push(cin.staticBed(0.16));

    this.input.mouse.disableContextMenu();
    const skip = () => this.close();
    this.input.on('pointerdown', (p) => { cin.resume(); if (this._closing) return; p.event?.preventDefault?.(); skip(); });
    this.input.keyboard.on('keydown-ENTER', skip);
    this.input.keyboard.on('keydown-SPACE', skip);
    this.input.keyboard.on('keydown-ESC', skip);

    this.playNext();
  }

  // ---------- persistent chrome ----------
  makeStars() {
    this.stars = [];
    for (let i = 0; i < 220; i++) {
      const big = Math.random() < 0.12;
      const s = big ? 1.6 + Math.random() * 1.4 : 0.5 + Math.random() * 1.1;
      const st = this.add.circle(Math.random() * 2400, Math.random() * this.H, s, big ? 0xcfe4ff : 0xffffff, 0.3 + Math.random() * 0.6);
      if (big) st.setStrokeStyle(1, 0x9fc8ff, 0.25);
      this.stars.push(st);
    }
    this.tweens.add({ targets: this.stars, alpha: { from: 0.25, to: 0.9 }, duration: 2000, yoyo: true, repeat: -1, delay: Math.random() * 1000 });
    this.tweens.add({ targets: this, starScroll: { from: 0, to: 1 }, duration: 60000, repeat: -1, onUpdate: () => {
      for (const st of this.stars) st.x -= 0.06 + st.radius * 0.02;
      for (const st of this.stars) if (st.x < -4) st.x = this.W + 4;
    } });
  }

  makeLetterbox() {
    this.barTop = this.add.rectangle(0, 0, this.W, 44, 0x000000, 1).setOrigin(0, 0).setDepth(50);
    this.barBot = this.add.rectangle(0, this.H - 44, this.W, 44, 0x000000, 1).setOrigin(0, 0).setDepth(50);
    const edge = this.add.graphics().setDepth(51);
    edge.fillStyle(0x4ea1ff, 0.35).fillRect(0, 44, this.W, 1).fillRect(0, this.H - 45, this.W, 1);
    if (this.title) {
      this.titleTxt = this.add.text(this.W - 14, 54, this.title, { fontFamily: BODY, fontSize: '15px', color: '#8fa9cf', fontWeight: '700', letterSpacing: 2 }).setOrigin(1, 0).setDepth(51).setAlpha(0.9);
    }
  }

  makeRadioUI() {
    const sl = this.add.graphics().setDepth(60).setScrollFactor(0);
    this._scan = sl;
    sl.fillStyle(0x000000, 0.045);
    for (let y = 0; y < this.H; y += 4) sl.fillRect(0, y, this.W, 1);
    const vg = this.add.graphics().setDepth(59).setScrollFactor(0);
    vg.fillStyle(0x000000, 0.10).fillRect(0, 0, 26, this.H).fillRect(this.W - 26, 0, 26, this.H);
    this.skipHint = this.add.text(this.W - 14, this.H - 30, '[ CLICK / ENTER TO SKIP ]', { fontFamily: MONO, fontSize: '11px', color: '#6f86ad' }).setOrigin(1, 0.5).setDepth(61);
    this.tweens.add({ targets: this.skipHint, alpha: { from: 0.45, to: 1 }, duration: 1200, yoyo: true, repeat: -1 });
  }

  makeGrain() {
    // film grain: canvas noise tile, ADD blended, jittered every frame
    if (!this.textures.exists('grain')) {
      const ct = this.textures.createCanvas('grain', 128, 128);
      const cx = ct.getContext();
      const id = cx.createImageData(128, 128);
      for (let i = 0; i < id.data.length; i += 4) {
        const v = 150 + Math.floor(Math.random() * 105);
        id.data[i] = v; id.data[i + 1] = v; id.data[i + 2] = v; id.data[i + 3] = 26;
      }
      cx.putImageData(id, 0, 0);
      ct.refresh();
    }
    this.grain = this.add.tileSprite(0, 0, this.W, this.H, 'grain').setOrigin(0).setDepth(58).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.5).setScrollFactor(0);
    this.events.on('update', this._grainTick, this);
  }
  _grainTick() {
    if (!this.grain) return;
    this.grain.setTilePosition(Math.random() * 128, Math.random() * 128);
  }

  makeDust() {
    this.dust = [];
    for (let i = 0; i < 26; i++) {
      const d = this.add.circle(Math.random() * this.W, Math.random() * this.H, 0.6 + Math.random() * 1.4, 0xcfe4ff, 0.06 + Math.random() * 0.14).setDepth(57).setBlendMode(Phaser.BlendModes.ADD);
      d._vy = -(4 + Math.random() * 10); d._vx = (Math.random() - 0.5) * 6;
      this.dust.push(d);
    }
    this.events.on('update', this._dustTick, this);
    this._lastT = this.time.now;
  }
  _dustTick(t) {
    const dt = Math.min(50, t - (this._lastT || t)) / 1000; this._lastT = t;
    for (const d of this.dust) {
      d.x += d._vx * dt; d.y += d._vy * dt;
      if (d.y < -4) { d.y = this.H + 4; d.x = Math.random() * this.W; }
    }
  }

  clearStage() { this.stageLayer.removeAll(true); }
  clearFx() { this.fxLayer.removeAll(true); }

  // ---------- audio helpers (real assets, procedural fallback) ----------
  sfx(kind) {
    if (kind === 'burn') { cin.impact(0.85); cin.whoosh(0.5); }
    else if (kind === 'radar') { cin.click(0.4); }
    else if (kind === 'stamp') { cin.impact(0.5); }
    else if (kind === 'flare') { cin.whoosh(0.7); }
    else if (kind === 'low') { cin.impact(0.35); }
    try {
      const a = window.__SCC2?.audio2;
      if (!a) return;
      if (kind === 'radar') a.tone(900, 0.25, 'square', 0.03, -300);
      if (kind === 'whine') a.tone(180, 1.8, 'sine', 0.04, 900);
      if (kind === 'heartbeat') { a.tone(70, 0.22, 'sine', 0.05); setTimeout(() => a.tone(58, 0.3, 'sine', 0.04), 320); }
    } catch (e) { /* silent */ }
  }

  say(who, text, voKey) {
    const sp = SPEAKERS[who] || { name: who.toUpperCase(), color: '#c9d6ee' };
    const col = parseInt(sp.color.slice(1), 16);
    const bx = 24, by = this.H - 118;
    const glow = this.add.circle(bx + 20, by + 20, 26, col, 0.12).setBlendMode(Phaser.BlendModes.ADD).setDepth(39);
    this.tweens.add({ targets: glow, scale: 1.15, alpha: 0.05, duration: 1400, yoyo: true, repeat: -1 });
    const bust = this.add.graphics().setDepth(40);
    bust.fillStyle(0x101d30, 0.95).fillRoundedRect(bx, by, 40, 40, 4).setDepth(40);
    bust.lineStyle(2, col, 0.95).strokeRoundedRect(bx, by, 40, 40, 4);
    const initial = this.add.text(bx + 20, by + 20, sp.name[0], { fontFamily: DISPLAY, fontSize: '20px', color: sp.color, fontWeight: '900' }).setOrigin(0.5).setDepth(41);
    const name = this.add.text(bx + 52, by + 2, sp.name, { fontFamily: BODY, fontSize: '14px', color: sp.color, fontWeight: '700', letterSpacing: 1 }).setDepth(40);
    const underline = this.add.rectangle(bx + 52 + (sp.name.length * 3.7), by + 13, sp.name.length * 7.4, 1, col, 0.7).setOrigin(0.5, 0).setDepth(40).setScale(0, 1);
    this.tweens.add({ targets: underline, scaleX: 1, duration: 260, ease: 'Cubic.easeOut' });
    const box = this.add.graphics().setDepth(40);
    const msgW = Math.min(this.W - 120, 720);
    box.fillStyle(0x0b1626, 0.92).fillRoundedRect(bx + 50, by + 22, msgW, 52, 4);
    box.lineStyle(1, 0x3d5a80, 1).strokeRoundedRect(bx + 50, by + 22, msgW, 52, 4);
    const txt = this.add.text(bx + 60, by + 30, '', { fontFamily: BODY, fontSize: '16px', color: '#f0f6ff', fontWeight: '600', wordWrap: { width: msgW - 20 }, align: 'left' }).setDepth(41);
    const cursor = this.add.rectangle(bx + 62, by + 37, 7, 12, sp.color ? col : 0xffffff, 0.9).setOrigin(0, 0.5).setDepth(41);
    this.tweens.add({ targets: cursor, alpha: 0, duration: 380, yoyo: true, repeat: -1 });
    // typewriter paces with the real voice clip when available
    const vReady = voKey && cin.isReady(voKey);
    const vDur = vReady ? cin.durationOf(voKey) : 0;
    let ci = 0;
    const typeDur = vReady ? Math.max(900, vDur * 1000 - 150) : Math.max(900, text.length * 26);
    const typer = this.tweens.add({ targets: { k: 0 }, k: 1, duration: typeDur, ease: 'none', onUpdate: (t) => {
      const want = Math.floor(t.targets.k * text.length);
      if (want > ci) { ci = want; txt.setText(text.slice(0, ci)); cursor.x = bx + 62 + Math.min(msgW - 24, txt.width); }
    }, onComplete: () => { txt.setText(text); cursor.x = bx + 62 + txt.width; } });
    this.sfx('radar');
    if (vReady) cin.voice(voKey, 0.95);
    else if (window.__SCC2?.audio2?.bark) { try { window.__SCC2.audio2.bark(text, 0.85, 1.0); } catch (e) {} }
    this.stageLayer.add([glow, bust, initial, name, underline, box, txt, cursor]);
    return { part: txt, bust, initial, name, box, typer, cursor, vDur };
  }

  // ---------- painted art sets (Ken Burns + overlays) ----------
  artBackdrop(key, { zoom = 1.04, panX = 0, panY = 0, dur = 6000, alpha = 1 } = {}) {
    if (!this.textures.exists(key)) return null;
    const tex = this.textures.get(key).getSourceImage();
    const sc = Math.max(this.W / tex.width, this.H / tex.height) * zoom;
    const img = this.add.image(this.W / 2, this.H / 2, key).setScale(sc).setDepth(10).setAlpha(0);
    this.tweens.add({ targets: img, alpha, duration: 480, ease: 'Sine.easeIn' });
    this.tweens.add({ targets: img, x: this.W / 2 + panX, y: this.H / 2 + panY, scale: sc * 1.05, duration: dur, ease: 'Sine.easeInOut', yoyo: false });
    return img;
  }

  drawArt(kind) {
    this.clearStage();
    const cx = this.W * 0.5, cy = this.H * 0.42;
    if (kind === 'wreckage') {
      const bg = this.artBackdrop('cin_wreckage', { panX: -46, panY: 14, dur: 9000 });
      if (bg) {
        // live overlays on the painted plate: searchlight sweep + embers
        const beam = this.add.triangle(cx - 420, cy - 120, 0, 0, 520, 60, 520, -60, 0xcfe8ff, 0.05).setDepth(11).setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({ targets: beam, angle: { from: -8, to: 14 }, duration: 4200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        for (let i = 0; i < 9; i++) {
          const ex = cx - 120 + Math.random() * 260, ey = cy + 20 + Math.random() * 40;
          const ember = this.add.circle(ex, ey, 2 + Math.random() * 2, 0xffb454, 0.95).setDepth(12);
          this.tweens.add({ targets: ember, alpha: 0.1, y: ey - 50 - Math.random() * 40, x: ex + (Math.random() * 30 - 15), duration: 1400 + Math.random() * 1200, repeat: -1, delay: Math.random() * 1400 });
        }
        this.stageLayer.add([bg, beam]);
        this.sfx('low');
        return;
      }
    }
    if (kind === 'alien') {
      const bg = this.artBackdrop('cin_alien', { panX: 30, panY: -18, dur: 5200 });
      if (bg) {
        for (let i = 0; i < 3; i++) {
          const ring = this.add.circle(cx, cy, 40, 0x000000, 0).setStrokeStyle(2, 0xc0a6ff, 0.85).setDepth(12);
          this.tweens.add({ targets: ring, alpha: 0, scale: 5, duration: 2200, delay: i * 600, ease: 'Sine.easeOut' });
        }
        this.tweens.add({ targets: bg, alpha: { from: 1, to: 0.86 }, duration: 900, yoyo: true, repeat: -1 });
        this.stageLayer.add(bg);
        this.sfx('whine');
        return;
      }
    }
    if (kind === 'armada') {
      const bg = this.artBackdrop('cin_armada', { panX: -60, panY: 0, dur: 6800 });
      if (bg) {
        this.stageLayer.add(bg);
        // engine-blink secondaries streaking across the painted fleet
        for (let i = 0; i < 4; i++) {
          const sy = this.H * 0.2 + i * 26;
          const tr = this.add.rectangle(-140, sy, 90, 2.2, 0x76c7ff, 0.3).setOrigin(1, 0.5).setDepth(11).setBlendMode(Phaser.BlendModes.ADD);
          const en = this.add.circle(-140, sy, 2.4, 0x76c7ff, 1).setDepth(12);
          this.tweens.add({ targets: [tr, en], x: this.W + 200, duration: 5200 + i * 700, ease: 'Sine.easeInOut', delay: i * 500 });
          this.stageLayer.add([tr, en]);
        }
        this.sfx('low');
        return;
      }
    }
    if (kind === 'burn') {
      const beam = this.add.rectangle(cx, cy, 10, 640, 0xffffff, 0.95).setRotation(0.5).setDepth(12);
      const beamGlow = this.add.rectangle(cx, cy, 34, 640, 0xbfd9ff, 0.35).setRotation(0.5).setDepth(11).setBlendMode(Phaser.BlendModes.ADD);
      this.stageLayer.add([beamGlow, beam]);
      this.tweens.add({ targets: [beam, beamGlow], alpha: { from: 0, to: 1 }, scaleX: { from: 0.2, to: 9 }, duration: 500, ease: 'Cubic.easeIn', onComplete: () => {
        const wash = this.add.rectangle(this.W / 2, this.H / 2, this.W, this.H, 0xb9a3ff, 0).setDepth(13);
        this.tweens.add({ targets: wash, fillAlpha: 0.6, duration: 260, onComplete: () => this.tweens.add({ targets: wash, fillAlpha: 0, duration: 1500 }) });
        for (let i = 0; i < 3; i++) {
          const rw = this.add.circle(cx, cy, 26, 0, 0).setStrokeStyle(3 - i * 0.7, 0xffffff, 0.9).setDepth(14);
          this.tweens.add({ targets: rw, scale: 8 + i * 3, alpha: 0, duration: 900 + i * 220, ease: 'Cubic.easeOut' });
        }
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          const ray = this.add.rectangle(cx, cy, 4, 140, 0xe8d6ff, 0).setDepth(13).setBlendMode(Phaser.BlendModes.ADD).setRotation(a);
          this.tweens.add({ targets: ray, alpha: 0.6, y: cy + Math.sin(a) * 90, x: cx + Math.cos(a) * 90, duration: 420, onComplete: () => this.tweens.add({ targets: ray, alpha: 0, duration: 380 }) });
        }
        this.cameras.main.shake(260, 0.008);
        this.sfx('flare');
      } });
      this.sfx('burn');
      return;
    }
    if (kind === 'title') {
      if (this.textures.exists('cin_titlebg')) {
        const tex = this.textures.get('cin_titlebg').getSourceImage();
        const sc = Math.max(this.W / tex.width, this.H / tex.height) * 1.02;
        const bg = this.add.image(this.W / 2, this.H / 2, 'cin_titlebg').setScale(sc).setDepth(9).setAlpha(0);
        this.tweens.add({ targets: bg, alpha: 1, scale: sc * 1.04, duration: 2600, ease: 'Sine.easeOut' });
        this.stageLayer.add(bg);
      }
      const halo = this.add.circle(this.W / 2, this.H * 0.34, 170, 0x2c5d9e, 0.16).setDepth(11).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: halo, scale: 1.35, alpha: 0.06, duration: 2400, yoyo: true, repeat: -1 });
      const streak = this.add.ellipse(this.W / 2, this.H * 0.34, 620, 8, 0xbfd9ff, 0.3).setDepth(12).setBlendMode(Phaser.BlendModes.ADD).setScale(0.1, 1).setAlpha(0);
      this.tweens.add({ targets: streak, scaleX: 1, alpha: 0.5, duration: 700, ease: 'Cubic.easeOut', onComplete: () => this.tweens.add({ targets: streak, alpha: 0.12, duration: 1600 }) });
      const ghostR = this.add.text(this.W / 2 + 3, this.H * 0.34, 'STARFRONT', { fontFamily: DISPLAY, fontSize: '84px', color: '#ff7a6b', fontWeight: '900' }).setOrigin(0.5).setDepth(11).setAlpha(0).setScale(1.6);
      const ghostB = this.add.text(this.W / 2 - 3, this.H * 0.34 - 2, 'STARFRONT', { fontFamily: DISPLAY, fontSize: '84px', color: '#4ea1ff', fontWeight: '900' }).setOrigin(0.5).setDepth(11).setAlpha(0).setScale(1.62);
      const big = this.add.text(this.W / 2, this.H * 0.34, 'STARFRONT', { fontFamily: DISPLAY, fontSize: '84px', color: '#f4f9ff', fontWeight: '900' }).setOrigin(0.5).setDepth(12).setScale(1.6).setAlpha(0);
      const sub = this.add.text(this.W / 2, this.H * 0.34 + 74, 'C O N F L I C T', { fontFamily: BODY, fontSize: '26px', color: '#7db8ff', fontWeight: '700' }).setOrigin(0.5).setDepth(12).setAlpha(0);
      this.tweens.add({ targets: [ghostR, ghostB], alpha: 0.5, scale: 1, duration: 900, ease: 'Cubic.easeOut' });
      this.tweens.add({ targets: big, alpha: 1, scale: 1, duration: 900, ease: 'Cubic.easeOut' });
      this.tweens.add({ targets: [ghostR, ghostB], x: '+=0', onUpdate: (t) => { const k = Math.max(0, 1 - t.progress); ghostR.x = this.W / 2 + 3 * k; ghostB.x = this.W / 2 - 3 * k; }, duration: 1400 });
      this.tweens.add({ targets: sub, alpha: 1, delay: 500, duration: 700 });
      this.stageLayer.add([halo, streak, ghostR, ghostB, big, sub]);
      cin.impact(0.6);
      return;
    }
    // fallback: painted plates unavailable (offline/missing) — legacy vector set
    const g = this.add.graphics().setDepth(10);
    g.fillStyle(0x243349, 1).fillTriangle(cx - 340, cy + 46, cx - 40, cy - 34, cx - 130, cy + 96);
    g.lineStyle(2, 0x55719b, 0.9).lineBetween(cx - 210, cy + 24, cx + 160, cy + 64);
    this.stageLayer.add(g);
  }

  fx(kind, color) {
    this.clearFx();
    const col = parseInt((color || '#ff5c5c').slice(1), 16);
    if (kind === 'radar') {
      const cx = this.W * 0.82, cy = this.H * 0.22;
      const gg = this.add.graphics().setDepth(20);
      gg.lineStyle(1.5, col, 0.7).strokeCircle(cx, cy, 120).strokeCircle(cx, cy, 70);
      gg.lineStyle(1, col, 0.25).strokeCircle(cx, cy, 170);
      const sweep = this.add.graphics().setDepth(21);
      sweep.fillStyle(col, 0.45); sweep.slice(cx, cy, 120, -0.5, 0.2); sweep.fillPath();
      this.tweens.add({ targets: sweep, angle: 360, duration: 1600, ease: 'linear' });
      const blip = this.add.circle(cx + 50, cy - 40, 5, col, 1).setDepth(22).setAlpha(0);
      this.tweens.add({ targets: blip, alpha: { from: 1, to: 0 }, scale: 2.2, duration: 1200, delay: 600 });
      const halo = this.add.circle(cx + 50, cy - 40, 12, col, 0.25).setDepth(21).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: halo, alpha: 0, scale: 3, duration: 1400, delay: 600 });
      const tag = this.add.text(cx, cy + 150, this.pendingFxText || 'CONTACT', { fontFamily: BODY, fontSize: '14px', color: '#dbe7ff', fontWeight: '700', letterSpacing: 1, backgroundColor: '#' + col.toString(16).padStart(6, '0') + '33', padding: { x: 8, y: 4 } }).setOrigin(0.5).setDepth(21);
      this.fxLayer.add([gg, sweep, blip, halo]);
      this.stageLayer.add(tag);
      this.sfx('radar');
      return;
    }
    if (kind === 'burn') {
      const flash = this.add.rectangle(this.W / 2, this.H / 2, this.W, this.H, 0xffffff, 0).setDepth(20);
      this.tweens.add({ targets: flash, fillAlpha: { from: 0, to: 0.85 }, duration: 220, onComplete: () => this.tweens.add({ targets: flash, fillAlpha: 0, duration: 900 }) });
      this.fxLayer.add(flash);
      this.sfx('burn');
      return;
    }
    if (kind === 'jump') { this.drawJump(); }
  }

  drawJump() {
    this.clearStage();
    const cx = this.W / 2, cy = this.H / 2;
    const center = this.add.circle(cx, cy, 60, 0xcfe4ff, 0).setStrokeStyle(2, 0x9fc8ff, 0.9).setDepth(11);
    this.tweens.add({ targets: center, scale: 7, alpha: 0, duration: 900, ease: 'Cubic.easeIn' });
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + Math.random() * 0.2;
      const len = 30 + Math.random() * 60;
      const ln = this.add.rectangle(0, 0, len, 1.6, 0xcfe4ff, 0.75).setDepth(12).setBlendMode(Phaser.BlendModes.ADD).setRotation(a);
      ln.x = cx + Math.cos(a) * 30; ln.y = cy + Math.sin(a) * 30;
      this.tweens.add({ targets: ln, x: cx + Math.cos(a) * (cx + 60), y: cy + Math.sin(a) * (cy + 60), scaleX: 3 + Math.random() * 3, alpha: 0, duration: 700 + Math.random() * 300, ease: 'Cubic.easeIn', delay: Math.random() * 160 });
    }
    const flash = this.add.circle(cx, cy, 40, 0xffffff, 0).setDepth(13).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: flash, scale: 14, alpha: 0.7, duration: 240, onComplete: () => this.tweens.add({ targets: flash, alpha: 0, duration: 700 }) });
    this.stageLayer.add([center, flash]);
    this.sfx('flare');
  }

  staticFlash() {
    const gg = this.add.graphics().setDepth(30);
    for (let y = 0; y < this.H; y += 6) {
      const a = 0.15 + Math.random() * 0.5;
      gg.fillStyle(0xbfd0e8, a).fillRect(0, y, this.W, 3 + Math.random() * 3);
    }
    this.fxLayer.add(gg);
    const n = cin.staticBed(0.5);
    if (n) { this.time.delayedCall(700, () => { try { n.s.stop(); } catch (e) {} }); }
    try { window.__SCC2?.audio2?.noise?.(0.9, 0.09, 3000); } catch (e) {}
  }

  card(text, voKey) {
    const wipe = this.add.rectangle(this.W / 2, this.H * 0.4, 10, 3, 0xffd23f, 0.9).setDepth(24).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: wipe, width: this.W * 0.8, alpha: 0, duration: 420, ease: 'Cubic.easeOut' });
    const t = this.add.text(this.W / 2, this.H * 0.4, text, { fontFamily: DISPLAY, fontSize: '44px', color: '#ffffff', fontWeight: '900', align: 'center', letterSpacing: 3 }).setOrigin(0.5).setDepth(25).setAlpha(0).setScale(1.5);
    this.tweens.add({ targets: t, alpha: 1, scale: 1, duration: 340, ease: 'Back.easeOut' });
    const glow = this.add.text(this.W / 2, this.H * 0.4, text, { fontFamily: DISPLAY, fontSize: '44px', color: '#ffd23f', fontWeight: '900', align: 'center', letterSpacing: 3 }).setOrigin(0.5).setDepth(24).setAlpha(0).setScale(1.5);
    this.tweens.add({ targets: glow, alpha: 0.35, scale: 1.06, duration: 900 });
    this.stageLayer.add([glow, t, wipe]);
    cin.impact(0.7);
    if (voKey && cin.isReady(voKey)) cin.voice(voKey, 0.95);
  }

  stamp(text) {
    const t = this.add.text(this.W / 2, this.H - 170, text, { fontFamily: BODY, fontSize: '22px', color: '#ffd23f', fontWeight: '700', letterSpacing: 2 }).setOrigin(0.5).setDepth(25).setAlpha(0).setScale(1.4);
    this.tweens.add({ targets: t, alpha: 1, scale: 1, duration: 280, ease: 'Back.easeOut' });
    const box = this.add.rectangle(this.W / 2, this.H - 170, 0, 30, 0, 0).setDepth(24).setStrokeStyle(2, 0xffd23f, 0.8);
    this.tweens.add({ targets: box, width: Math.max(240, text.length * 13), alpha: 0, duration: 800 });
    this.sfx('stamp');
    this.stageLayer.add([box, t]);
  }

  // ---------- beat sequencer ----------
  playNext() {
    if (this._closing) return;
    this.clearStage(); this.clearFx();
    const beat = this.script[this.i];
    if (!beat) { this.close(); return; }
    let wait = (beat.wait || 3) * 1000;
    this.pendingFxText = beat.text && beat.kind === 'fx' ? beat.text : null;

    if (beat.kind === 'scene') this.drawArt(beat.art);
    else if (beat.kind === 'radio') {
      const r = this.say(beat.who, beat.text, beat.vo);
      if (r && r.vDur) wait = Math.max(wait, (r.vDur + 0.6) * 1000);
    }
    else if (beat.kind === 'fx') this.fx(beat.fx, beat.color);
    else if (beat.kind === 'static') this.staticFlash();
    else if (beat.kind === 'card') this.card(beat.text, beat.vo);
    else if (beat.kind === 'obj') this.stamp(beat.text);

    this.i++;
    this._advance = this.time.delayedCall(wait, () => this.playNext());
  }

  close() {
    if (this._closed) return;
    this._closed = true;
    if (this._advance) this._advance.remove();
    this.events.off('update', this._grainTick, this);
    this.events.off('update', this._dustTick, this);
    cin.stopAll(this._audioNodes);
    const cb = this.onComplete || this.done;
    cin.whoosh(0.5);
    this.cameras.main.fadeOut(260, 4, 8, 16);
    this.time.delayedCall(280, () => {
      this.scene.stop();
      if (typeof cb === 'function') { try { cb(); } catch (e) {} }
      else if (this.mode === 'brief') this.scene.start('Battle', this.launchArgs || undefined);
    });
  }

  // for briefing mode: pass launch args through to Battle
  launch(args) { this.launchArgs = args; this.close(); }
}
