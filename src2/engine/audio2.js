// Lightweight procedural audio for SCC2 (Web Audio API, no assets).
export class Audio2 {
  constructor(scene) {
    this.scene = scene;
    this.ctx = null;
    this.enabled = true;
    // unlock/create on first input (headless-safe)
    scene.input.once('pointerdown', () => this.init());
    scene.input.keyboard.once('keydown', () => this.init());
  }
  init() {
    if (this.ctx || !this.enabled) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
      this.resume();
    } catch (e) { this.enabled = false; }
  }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  tone(freq, dur, type = 'square', vol = 0.05, slide = 0) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, vol = 0.08, lp = 800) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, (dur * this.ctx.sampleRate) | 0);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.ctx.destination);
    src.start(t);
  }
  select() { this.tone(720, 0.07, 'square', 0.03); }
  deselect() { this.tone(420, 0.06, 'square', 0.025); }
  move() { this.tone(320, 0.08, 'sine', 0.03, -80); }
  attackCmd() { this.tone(880, 0.06, 'square', 0.03, -200); }
  attack(kind) {
    if (kind === 'tank' || kind === 'turret') { this.noise(0.22, 0.09, 500); this.tone(90, 0.18, 'sawtooth', 0.05, -40); }
    else if (kind === 'firebat') this.noise(0.18, 0.05, 1200);
    else if (kind === 'zealot' || kind === 'darkTemplar' || kind === 'archon') this.tone(1400, 0.08, 'sawtooth', 0.03, -600);
    else if (kind === 'stim') { this.tone(500, 0.1, 'square', 0.04, 300); }
    else this.noise(0.05, 0.03, 2400);
  }
  harvest() { this.tone(1100 + Math.random() * 200, 0.05, 'triangle', 0.02); }
  deposit() { this.tone(600, 0.09, 'triangle', 0.03, -150); }
  buildStart() { this.noise(0.2, 0.04, 900); }
  buildComplete() { this.tone(520, 0.1, 'square', 0.04); this.tone(780, 0.14, 'square', 0.04); }
  queue() { this.tone(640, 0.05, 'square', 0.025); }
  spawn() { this.tone(400, 0.12, 'triangle', 0.035, 200); }
  researchComplete() { this.tone(700, 0.12, 'sine', 0.04, 300); }
  death(big) { this.noise(big ? 0.4 : 0.15, big ? 0.1 : 0.05, big ? 300 : 900); }
  error() { this.tone(180, 0.12, 'square', 0.04, -60); }
  gameEnd(win) {
    const seq = win ? [523, 659, 784, 1046] : [392, 330, 262, 196];
    seq.forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 'triangle', 0.05), i * 180));
  }
}
