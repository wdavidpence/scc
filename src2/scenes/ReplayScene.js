// Replay viewer: scrubs tactical snapshots recorded during battle (localStorage).
import Phaser from 'phaser';
import { TILE } from '../data/sc1.js';

const MAP_PX = 96 * TILE;

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

    const size = Math.min(this.W - 40, this.H - 110);
    this.mmX = (this.W - size) / 2; this.mmY = 40; this.size = size;
    this.add.rectangle(this.mmX, this.mmY, size, size, 0x0a140f, 1).setOrigin(0, 0).setStrokeStyle(1, 0x2f3a49);

    this.add.text(this.W / 2, 18, `TACTICAL REPLAY — ${data.result === 'victory' ? 'VICTORY' : 'DEFEAT'} · APM ${data.apm || 0} · ${Math.floor((data.time || 0) / 60)}:${String(Math.floor((data.time || 0) % 60)).padStart(2, '0')}`, { fontFamily: 'Menlo, monospace', fontSize: '14px', color: '#e8f1ff' }).setOrigin(0.5);
    this.g = this.add.graphics().setScrollFactor(0);
    this.tLabel = this.add.text(this.W / 2, this.H - 22, '', { fontFamily: 'Menlo, monospace', fontSize: '12px', color: '#8fa3c8' }).setOrigin(0.5);

    // timeline
    this.tlY = this.H - 52;
    this.tl = this.add.graphics().setScrollFactor(0);
    const zone = this.add.zone(this.mmX, this.tlY - 8, size, 24).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    const scrub = (px) => { this.t = Phaser.Math.Clamp(((px - this.mmX) / size) * this.dur, 0, this.dur); this.playing = false; };
    zone.on('pointerdown', (p) => scrub(p.x));
    zone.on('pointerdrag', (p) => scrub(p.x));

    this.input.keyboard.on('keydown-SPACE', () => { this.playing = !this.playing; });
    this.input.keyboard.on('keydown-R', () => { this.t = 0; this.playing = true; });
    this.input.keyboard.on('keydown-ESC', () => this.scene.start('Title'));
    this.add.text(this.mmX, this.H - 22, 'SPACE play/pause · R restart · click timeline to scrub · ESC menu', { fontFamily: 'Menlo, monospace', fontSize: '11px', color: '#54688a' }).setOrigin(0, 0.5);
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
    // timeline
    this.tl.clear();
    this.tl.fillStyle(0x101822, 1); this.tl.fillRect(this.mmX, this.tlY - 4, this.size, 8);
    this.tl.fillStyle(0x4ea1ff, 0.8); this.tl.fillRect(this.mmX, this.tlY - 4, this.size * (this.t / this.dur), 8);
    this.tl.fillStyle(0xffffff, 1); this.tl.fillRect(this.mmX + this.size * (this.t / this.dur) - 1, this.tlY - 8, 2, 16);
    const fmt = (v) => `${(v / 60 | 0)}:${String(v % 60 | 0).padStart(2, '0')}`;
    this.tLabel.setText(`${fmt(this.t)} / ${fmt(this.dur)}  ·  ${this.playing ? '▶' : '❚❚'}`);
  }
}
