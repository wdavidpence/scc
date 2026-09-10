// Replay viewer: scrubs tactical snapshots recorded during battle (localStorage).
// v2.37: polished scrubber — event markers, transport buttons, speed cycle, hover time, tick ruler.
import Phaser from 'phaser';
import { TILE, MAP_W, MAP_H } from '../data/sc1.js';

const MAP_PX = MAP_W * TILE;

export class ReplayScene extends Phaser.Scene {
  constructor() { super('Replay'); }

  create() {
    this.W = this.scale.width; this.H = this.scale.height;
    let data = null;
    try { data = JSON.parse(localStorage.getItem('scc.replay.last') || 'null'); } catch (e) { /* noop */ }
    this.add.rectangle(0, 0, this.W, this.H, 0x04070d).setOrigin(0, 0);
    if (!data || !data.frames || data.frames.length < 2) {
      this.add.text(this.W / 2, this.H / 2, 'NO REPLAY DATA — play a mission first (ESC to return)', { fontFamily: 'Menlo, monospace', fontSize: '16px', color: '#8fa3c8' }).setOrigin(0.5);
      this.input.keyboard.on('keydown-ESC', () => this.scene.start('Title'));
      return;
    }
    this.data = data;
    this.dur = data.frames[data.frames.length - 1].t || 1;
    this.t = 0;
    this.playing = true;
    this.speed = 4; // replay playback multiplier
    this.speeds = [1, 2, 4, 8];
    this.speedIdx = 2;

    const size = Math.min(this.W - 40, this.H - 130);
    this.mmX = (this.W - size) / 2; this.mmY = 46; this.size = size;
    this.add.rectangle(this.mmX - 2, this.mmY - 2, size + 4, size + 4, 0x0a140f, 1).setOrigin(0, 0).setStrokeStyle(1, 0x2f3a49);

    this.add.text(this.W / 2, 18, `TACTICAL REPLAY — ${data.result === 'victory' ? 'VICTORY' : 'DEFEAT'} · APM ${data.apm || 0} · ${Math.floor((data.time || 0) / 60)}:${String(Math.floor((data.time || 0) % 60)).padStart(2, '0')}`, { fontFamily: 'Menlo, monospace', fontSize: '14px', color: '#e8f1ff' }).setOrigin(0.5);
    this.g = this.add.graphics().setScrollFactor(0).setDepth(2);
    this.ovG = this.add.graphics().setScrollFactor(0).setDepth(4);
    this.tLabel = this.add.text(this.W / 2, this.H - 24, '', { fontFamily: 'Menlo, monospace', fontSize: '12px', color: '#8fa3c8' }).setOrigin(0.5);
    // live fleet census at current scrub position
    this.censusTxt = this.add.text(this.mmX + size, this.mmY - 8, '', { fontFamily: 'Menlo, monospace', fontSize: '10px', color: '#8fa3c8' }).setOrigin(1, 0.5);

    // ---- event markers (derived from recorded frames) ----
    this.marks = this.buildMarkers();

    // timeline
    this.tlY = this.H - 56;
    this.tl = this.add.graphics().setScrollFactor(0).setDepth(3);
    const zone = this.add.zone(this.mmX, this.tlY - 10, size, 28).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    const scrub = (px) => { this.t = Phaser.Math.Clamp(((px - this.mmX) / size) * this.dur, 0, this.dur); this.playing = false; };
    zone.on('pointerdown', (p) => {
      // click on a marker? jump exactly to it
      const near = this.marks.find(m => Math.abs(this.mmX + (m.t / this.dur) * size - p.x) < 6);
      if (near) { this.t = near.t; this.audio?.select?.(); } else scrub(p.x);
    });
    zone.on('pointerdrag', (p) => scrub(p.x));
    zone.on('pointermove', (p) => { this._hoverX = p.x; });
    zone.on('pointerout', () => { this._hoverX = null; });

    // ---- transport buttons ----
    const bx = this.mmX;
    this.mkTransport(bx, this.tlY + 18, '❚❚', () => { this.playing = !this.playing; }, 'PLAY / PAUSE [SPACE]', () => this.playing ? '▶' : '❚❚');
    this.mkTransport(bx + 46, this.tlY + 18, '↺', () => { this.t = 0; this.playing = true; }, 'RESTART [R]');
    this.speedBtn = this.mkTransport(bx + 92, this.tlY + 18, `${this.speeds[this.speedIdx]}x`, () => {
      this.speedIdx = (this.speedIdx + 1) % this.speeds.length; this.speed = this.speeds[this.speedIdx];
      this.speedBtn.txt.setText(`${this.speed}x`);
    }, 'PLAYBACK SPEED');
    // jump-to-previous / next battle event arrows
    this.mkTransport(this.mmX + size - 92, this.tlY + 18, '◀◆', () => this.jumpMark(-1), 'PREVIOUS EVENT');
    this.mkTransport(this.mmX + size - 46, this.tlY + 18, '◆▶', () => this.jumpMark(1), 'NEXT EVENT');

    this.input.keyboard.on('keydown-SPACE', () => { this.playing = !this.playing; });
    this.input.keyboard.on('keydown-R', () => { this.t = 0; this.playing = true; });
    this.input.keyboard.on('keydown-LEFT', () => this.jumpMark(-1));
    this.input.keyboard.on('keydown-RIGHT', () => this.jumpMark(1));
    this.input.keyboard.on('keydown-ESC', () => this.scene.start('Title'));
    this.add.text(this.mmX, this.H - 24, 'SPACE play · R restart · ←/→ jump events · drag timeline · ESC menu', { fontFamily: 'Menlo, monospace', fontSize: '11px', color: '#54688a' }).setOrigin(0, 0.5);
  }

  mkTransport(x, y, label, cb, tip, liveTxt) {
    const bg = this.add.rectangle(x, y, 38, 22, 0x18202c, 1).setOrigin(0, 0).setScrollFactor(0).setStrokeStyle(1, 0x3f4a5a).setInteractive({ useHandCursor: true });
    const txt = this.add.text(x + 19, y + 11, label, { fontFamily: 'Menlo, monospace', fontSize: '12px', color: '#dbe7ff' }).setOrigin(0.5);
    bg.on('pointerdown', () => { this.audio?.select?.(); cb(); });
    bg.on('pointerover', () => { bg.setFillStyle(0x22304a, 1); this._tipTxt = tip; });
    bg.on('pointerout', () => { bg.setFillStyle(0x18202c, 1); this._tipTxt = null; });
    const btn = { bg, txt, liveTxt };
    (this._tbtns = this._tbtns || []).push(btn);
    return btn;
  }

  // derive combat/building event markers from frames: enemy deaths, own losses, first contact
  buildMarkers() {
    const fs = this.data.frames;
    const marks = [];
    let prevEnemyAlive = 0, prevOwnAlive = 0, contact = false;
    for (let i = 1; i < fs.length; i++) {
      const f = fs[i], p = fs[i - 1];
      const e = f.b.concat(f.u).filter(x => x[2] === 1).length, o = f.b.concat(f.u).filter(x => x[2] === 0).length;
      if (!contact && f.u.some(a => f.u.some(b2 => b2[2] === 1 && Math.hypot(a[0] - b2[0], a[1] - b2[1]) < TILE * 4 && a[2] === 0))) { contact = true; marks.push({ t: f.t, col: 0xffd23f, kind: 'contact' }); }
      if (prevEnemyAlive && e < prevEnemyAlive - 1) marks.push({ t: f.t, col: 0x6ee7a0, kind: 'kill' });
      if (prevOwnAlive && o < prevOwnAlive - 1) marks.push({ t: f.t, col: 0xff5c5c, kind: 'loss' });
      prevEnemyAlive = e; prevOwnAlive = o;
    }
    const last = fs[fs.length - 1];
    marks.push({ t: last.t, col: this.data.result === 'victory' ? 0x6ee7a0 : 0xff5c5c, kind: 'end' });
    marks.sort((a, b) => a.t - b.t);
    return marks;
  }

  jumpMark(dir) {
    const ts = this.marks.map(m => m.t);
    if (dir > 0) { const nx = ts.find(t => t > this.t + 0.5); if (nx !== undefined) this.t = nx; }
    else { for (let i = ts.length - 1; i >= 0; i--) if (ts[i] < this.t - 0.5) { this.t = ts[i]; break; } }
    this.playing = false;
    this.audio?.select?.();
  }

  frameAt(t) {
    const fs = this.data.frames;
    let lo = 0, hi = fs.length - 1;
    while (lo < hi - 1) { const mid = (lo + hi) >> 1; if (fs[mid].t <= t) lo = mid; else hi = mid; }
    return fs[lo];
  }

  update(time, delta) {
    if (!this.data) return;
    if (this.playing) {
      this.t += (Math.min(0.05, delta / 1000)) * this.speed;
      if (this.t >= this.dur) { this.t = this.dur; this.playing = false; }
    }
    const f = this.frameAt(this.t);
    const s = this.size / MAP_PX;
    const g = this.g;
    g.clear();
    // static terrain hints
    g.fillStyle(0x1d2b1f, 1); g.fillRect(this.mmX, this.mmY, this.size, this.size);
    g.fillStyle(0x2c4a7a, 0.9);
    for (const m of (this.data.min || [])) g.fillCircle(this.mmX + m[0] * s, this.mmY + m[1] * s, 2);
    for (const b of (f.b || [])) {
      g.fillStyle(b[2] === 0 ? 0x4ea1ff : 0xff7b2e, b[3] ? 1 : 0.45);
      g.fillRect(this.mmX + b[0] * s - 3, this.mmY + b[1] * s - 3, 6, 6);
    }
    for (const u of (f.u || [])) {
      g.fillStyle(u[2] === 0 ? 0x9fe0b0 : 0xff9c5c, 1);
      g.fillCircle(this.mmX + u[0] * s, this.mmY + u[1] * s, 2);
    }
    // ring pulse on the freshest event within 4s (draws the eye to what just happened)
    const ov = this.ovG; ov.clear();
    const recent = this.marks.filter(m => m.t <= this.t && this.t - m.t < 4);
    if (recent.length) {
      const m = recent[recent.length - 1];
      const fr = this.frameAt(m.t);
      const pool = (m.kind === 'kill' || m.kind === 'end') ? fr.b.concat(fr.u).filter(x => x[2] === 1) : fr.b.concat(fr.u).filter(x => x[2] === 0);
      if (pool.length) {
        const r = 8 + 6 * Math.abs(Math.sin(time / 220));
        ov.lineStyle(2, m.col, 0.9);
        ov.strokeCircle(this.mmX + pool[0][0] * s, this.mmY + pool[0][1] * s, r);
      }
    }
    // timeline: ruler ticks + event marker diamonds + playhead knob
    this.tl.clear();
    this.tl.fillStyle(0x101822, 1); this.tl.fillRect(this.mmX, this.tlY - 4, this.size, 8);
    this.tl.fillStyle(0x4ea1ff, 0.8); this.tl.fillRect(this.mmX, this.tlY - 4, this.size * (this.t / this.dur), 8);
    // minute ruler ticks
    this.tl.lineStyle(1, 0x3f4a5a, 0.9);
    for (let tm = 60; tm < this.dur; tm += 60) {
      const tx = this.mmX + (tm / this.dur) * this.size;
      this.tl.lineBetween(tx, this.tlY + 5, tx, this.tlY + 9);
    }
    // event diamonds
    for (const m of this.marks) {
      const mx = this.mmX + (m.t / this.dur) * this.size;
      this.tl.fillStyle(m.col, 1);
      this.tl.fillTriangle(mx, this.tlY - 10, mx - 4, this.tlY - 5, mx + 4, this.tlY - 5);
    }
    // playhead knob (wider grab bar)
    const px = this.mmX + this.size * (this.t / this.dur);
    this.tl.fillStyle(0xffffff, 1); this.tl.fillRect(px - 2, this.tlY - 8, 4, 16);
    this.tl.fillCircle(px, this.tlY - 10, 3.5);
    // hover time ghost
    if (this._hoverX !== null && this._hoverX >= this.mmX && this._hoverX <= this.mmX + this.size) {
      const hx = Phaser.Math.Clamp(this._hoverX, this.mmX, this.mmX + this.size);
      this.tl.lineStyle(1, 0xffffff, 0.35); this.tl.lineBetween(hx, this.tlY - 8, hx, this.tlY + 8);
      const ht = ((hx - this.mmX) / this.size) * this.dur;
      this.tl.fillStyle(0xffffff, 0.75);
      this.tl.fillRect(hx - 18, this.tlY - 26, 36, 13);
      const fmt2 = (v) => `${(v / 60 | 0)}:${String(v % 60 | 0).padStart(2, '0')}`;
      this.tl.fillStyle(0x000000, 1);
      // text drawn via tl graphics not possible — overlay text object kept single, repositioned
      if (!this._hoverT) this._hoverT = this.add.text(0, 0, '', { fontFamily: 'Menlo, monospace', fontSize: '9px', color: '#0b111c', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(5);
      this._hoverT.setText(fmt2(ht)).setPosition(hx, this.tlY - 19.5).setVisible(true);
    } else if (this._hoverT) this._hoverT.setVisible(false);
    // transport live states
    if (this._tbtns) for (const btn of this._tbtns) if (btn.liveTxt) btn.txt.setText(btn.liveTxt());
    // fleet census readout
    if (this.censusTxt) {
      const ou = (f.u || []).filter(x => x[2] === 0).length, eu = (f.u || []).filter(x => x[2] === 1).length;
      this.censusTxt.setText(`FLEET ${ou} vs ${eu}`);
    }
    // marker tooltip near transport row
    if (!this._tipLabel) this._tipLabel = this.add.text(this.mmX + this.size, this.H - 24, '', { fontFamily: 'Menlo, monospace', fontSize: '10px', color: '#ffd23f' }).setOrigin(1, 0.5);
    this._tipLabel.setText(this._tipTxt || '');
    const fmt = (v) => `${(v / 60 | 0)}:${String(v % 60 | 0).padStart(2, '0')}`;
    this.tLabel.setText(`${fmt(this.t)} / ${fmt(this.dur)}  ·  ${this.playing ? '▶' : '❚❚'}`);
  }
}
