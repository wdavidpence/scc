// Lightweight procedural audio for SCC2 (Web Audio API, no assets).
// Race-tinted SFX + procedural ambient music + voice barks (SpeechSynthesis, free).
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
    this.stopMusic();
    if (win) this.victoryFanfare(); else this.defeatDirge();
  }

  // ---------- race tint ----------
  setRace(race) {
    this.race = race;
    this.setRaceVoice(race);
    this.raceChord = race === 'zerg' ? [110, 138, 164] : race === 'protoss' ? [196, 294, 392] : [131, 196, 262];
    this.raceWave = race === 'zerg' ? 'sawtooth' : race === 'protoss' ? 'sine' : 'triangle';
  }

  // ================= adaptive multi-track music engine =================
  // Three real mixer layers (percussion bed / string pad / lead line) on
  // separate gain buses, crossfaded by a combat-intensity level (0..2).
  // Race selects scale, waveform, and groove. Free, procedural, no assets.
  MUSIC_SCALES = {
    terran:  { root: 130.81, steps: [0, 3, 5, 7, 10], pad: 'triangle', lead: 'square',   bpm: 84,  groove: [1, 0, 0, 1, 0, 0, 1, 0] },
    zerg:    { root: 110.00, steps: [0, 1, 5, 6, 8],  pad: 'sawtooth', lead: 'sawtooth', bpm: 116, groove: [1, 0, 1, 1, 0, 1, 0, 1] },
    protoss: { root: 146.83, steps: [0, 2, 4, 7, 9],   pad: 'sine',     lead: 'sine',     bpm: 72,  groove: [1, 0, 0, 0, 1, 0, 0, 0] },
  };
  freqAt(step) { const s = this.MUSIC_SCALES[this.race] || this.MUSIC_SCALES.terran; return s.root * Math.pow(2, step / 12); }

  startMusic(opts = {}) {
    if (this.musicOn || !this.ctx) return;
    this.musicOn = true;
    this.setRace(this.scene?.race || 'terran');
    this.bossMode = !!opts.boss;
    const t = this.ctx.currentTime;
    // master + per-layer buses with gentle master compression illusion
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.setValueAtTime(0.0001, t);
    this.musicBus.gain.linearRampToValueAtTime(0.09, t + 3);
    const comp = this.ctx.createDynamicsCompressor ? this.ctx.createDynamicsCompressor() : null;
    if (comp) { comp.threshold.value = -18; comp.ratio.value = 4; this.musicBus.connect(comp); comp.connect(this.ctx.destination); }
    else this.musicBus.connect(this.ctx.destination);
    this.layerBuses = {};
    for (const L of ['perc', 'pad', 'lead']) {
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(L === 'pad' ? 0.6 : 0.0001, t);
      // pad always present; perc arrives at intensity>=1; lead at >=2
      g.connect(this.musicBus);
      this.layerBuses[L] = g;
    }
    this._step = 0;
    this._leadMotif = [];
    this._tickMusic();
    if (opts.sting !== false) this.introSting();
  }

  _tickMusic() {
    if (!this.musicOn || !this.ctx) return;
    const s = this.MUSIC_SCALES[this.race] || this.MUSIC_SCALES.terran;
    const beat = 60 / (this.bossMode ? s.bpm + 24 : s.bpm); // seconds per 8th step
    const t = this.ctx.currentTime + 0.02;
    const i = this._intensity || 0;
    const st = this._step % 8;
    // ---- percussion bed (intensity >= 1) ----
    if (i >= 1 && s.groove[st]) {
      this._kick(t, this.layerBuses.perc, st === 0 ? 1 : 0.7);
      if (st % 2 === 1 || this.bossMode) this._hat(t, this.layerBuses.perc, 0.5 + i * 0.15);
    }
    if (i >= 1 && st === 0) this._kick(t, this.layerBuses.perc, 1);
    // ---- string pad: chord swap every 8 steps ----
    if (st === 0) this._padChord(t, s);
    // ---- lead line (intensity >= 2) ----
    if (i >= 2 && Math.random() < (this.bossMode ? 0.8 : 0.55)) {
      const step = s.steps[Math.floor(Math.random() * s.steps.length)] + (Math.random() < 0.3 ? 12 : 0);
      this._leadNote(t, this.freqAt(step), beat * (1 + Math.floor(Math.random() * 2)), s);
    }
    // layer crossfade toward targets
    const ramp = (bus, v) => { try { bus.gain.cancelScheduledValues(t); bus.gain.linearRampToValueAtTime(v, t + 1.2); } catch (e) {} };
    ramp(this.layerBuses.perc, i >= 1 ? (this.bossMode ? 0.9 : 0.55) : 0.0001);
    ramp(this.layerBuses.lead, i >= 2 ? 0.7 : 0.0001);
    this._step++;
    this._musicTimer = setTimeout(() => this._tickMusic(), beat * 1000);
  }

  _kick(t, bus, v = 1) {
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.12);
    g.gain.setValueAtTime(0.9 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.25);
  }
  _hat(t, bus, v = 1) {
    const len = Math.max(1, (0.05 * this.ctx.sampleRate) | 0);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let k = 0; k < len; k++) d[k] = (Math.random() * 2 - 1) * (1 - k / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    const g = this.ctx.createGain(); g.gain.value = 0.12 * v;
    src.connect(f); f.connect(g); g.connect(bus); src.start(t);
  }
  _padChord(t, s) {
    // diatonic triad from scale, slow attack, held ~4 beats; boss = minor cluster
    const degs = this.bossMode ? [0, 1, 6] : [0, 2, 4];
    if (Math.random() < 0.35) degs.push(s.steps[3] ?? 7);
    for (const dg of degs) {
      const f = this.freqAt(dg) * (dg === 0 ? 0.5 : 1);
      const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
      o.type = s.pad; o.detune.setValueAtTime((Math.random() * 8 - 4), t);
      o.frequency.setValueAtTime(f, t);
      const dur = (60 / s.bpm) * 4;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + dur * 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.4);
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = this.bossMode ? 900 : 1600;
      o.connect(lp); lp.connect(g); g.connect(this.layerBuses.pad);
      o.start(t); o.stop(t + dur + 0.5);
    }
  }
  _leadNote(t, f, dur, s) {
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = s.lead; o.frequency.setValueAtTime(f * (this.bossMode ? 0.94 : 1), t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.13, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const dly = this.ctx.createDelay ? this.ctx.createDelay(1) : null;
    if (dly) { dly.delayTime.value = 0.28; const fb = this.ctx.createGain(); fb.gain.value = 0.32; const wet = this.ctx.createGain(); wet.gain.value = 0.5; o.connect(g); g.connect(this.layerBuses.lead); g.connect(dly); dly.connect(fb); fb.connect(dly); dly.connect(wet); wet.connect(this.layerBuses.lead); }
    else { o.connect(g); g.connect(this.layerBuses.lead); }
    o.start(t); o.stop(t + dur + 0.1);
  }

  // ---- cinematic stings ----
  introSting() { // mission start: rising swell + low thud
    if (!this.ctx || !this.musicBus) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(this.freqAt(0) * 0.5, t);
    o.frequency.exponentialRampToValueAtTime(this.freqAt(7), t + 2.4);
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(300, t); lp.frequency.exponentialRampToValueAtTime(4000, t + 2.2);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 1.8); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    o.connect(lp); lp.connect(g); g.connect(this.musicBus); o.start(t); o.stop(t + 3.3);
    this._kick(t + 2.3, this.musicBus, 1.4);
  }
  bossTheme(on) { // switch groove under boss fight
    if (this.bossMode === on || !this.ctx) return;
    this.bossMode = on;
    this.bark(on ? 'Massive biosignature detected.' : 'Threat eliminated.', 0.55, 0.95);
    if (on) { // descending minor stinger
      const t = this.ctx.currentTime;
      [0, 1, 6, 5].forEach((dg, k) => this.tone(this.freqAt(dg) * (k === 3 ? 0.5 : 1), 0.5, 'sawtooth', 0.05));
    }
  }
  victoryFanfare() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const notes = [0, 4, 7, 12, 7, 12, 16];
    notes.forEach((dg, k) => {
      const f = this.freqAt(dg);
      const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(f, t + k * 0.16);
      g.gain.setValueAtTime(0.0001, t + k * 0.16);
      g.gain.exponentialRampToValueAtTime(0.16, t + k * 0.16 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + k * 0.16 + (k >= 5 ? 1.4 : 0.4));
      o.connect(g); g.connect(this.ctx.destination); o.start(t + k * 0.16); o.stop(t + k * 0.16 + 1.6);
      const o2 = this.ctx.createOscillator(); const g2 = this.ctx.createGain();
      o2.type = 'sine'; o2.frequency.setValueAtTime(f * 2, t + k * 0.16);
      g2.gain.setValueAtTime(0.0001, t + k * 0.16); g2.gain.exponentialRampToValueAtTime(0.07, t + k * 0.16 + 0.03); g2.gain.exponentialRampToValueAtTime(0.0001, t + k * 0.16 + 0.5);
      o2.connect(g2); g2.connect(this.ctx.destination); o2.start(t + k * 0.16); o2.stop(t + k * 0.16 + 0.6);
    });
    this._kick(t + 0.96, this.ctx.destination, 1.2);
  }
  defeatDirge() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [7, 5, 3, 0].forEach((dg, k) => {
      const f = this.freqAt(dg) * 0.5;
      const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t + k * 0.4);
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
      g.gain.setValueAtTime(0.0001, t + k * 0.4); g.gain.exponentialRampToValueAtTime(0.12, t + k * 0.4 + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + k * 0.4 + (k === 3 ? 2.2 : 0.8));
      o.connect(lp); lp.connect(g); g.connect(this.ctx.destination); o.start(t + k * 0.4); o.stop(t + k * 0.4 + 2.4);
    });
  }

  stopMusic() {
    this.musicOn = false;
    if (this._musicTimer) clearTimeout(this._musicTimer);
    if (this.musicBus && this.ctx) { try { this.musicBus.gain.cancelScheduledValues(this.ctx.currentTime); this.musicBus.gain.linearRampToValueAtTime(0.0001, this.ctx.currentTime + 0.8); } catch (e) { try { this.musicBus.gain.value = 0; } catch (e2) {} } }
  }

  // ---------- voice barks (SpeechSynthesis; silent fallback) ----------
  bark(text, pitch = 0.8, rate = 1.05) {
    if (!('speechSynthesis' in window)) return;
    try {
      // rate-limit: never overlap, min gap between barks
      const now = Date.now();
      if (this._lastBark && now - this._lastBark < 1400) return;
      this._lastBark = now;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const rp = this.racePitch || 0.8;
      u.pitch = pitch * rp; u.rate = rate; u.volume = 0.9;
      window.speechSynthesis.speak(u);
    } catch (e) { /* silent */ }
  }
  // race-flavored player voice: Terran crisp-low, Zerg guttural, Protoss resonant
  setRaceVoice(race) {
    this.racePitch = race === 'zerg' ? 0.55 : race === 'protoss' ? 1.25 : 0.85;
  }
  readyBark() { const L = { terran: ['Ready.', 'SIR, yes sir.', 'Awaiting orders.'], zerg: ['Yes master.', 'Hatching now.', 'Ready to kill.'], protoss: ['My life for Aiur.', 'Orders?', 'Ready.'] }; const a = L[this.race] || L.terran; this.bark(a[Math.floor(Math.random() * a.length)]); }
  moveBark() { const L = { terran: ['Moving out.', 'On my way.', 'Copy that.'], zerg: ['Obey.', 'We move.', 'Hunting.'], protoss: ['It is done.', 'Advancing.', 'En taro Adun.'] }; const a = L[this.race] || L.terran; if (Math.random() < 0.5) this.bark(a[Math.floor(Math.random() * a.length)]); }
  attackBark() { const L = { terran: ['Attack!', 'Weapons free!', 'Light them up!'], zerg: ['KILL!', 'Slay them all!', 'For the Overmind!'], protoss: ['Attack!', 'Purge the enemy!', 'For the Daelaam!'] }; const a = L[this.race] || L.terran; this.bark(a[Math.floor(Math.random() * a.length)], 0.7); }
  underAttackBark() { this.bark('We are under attack!', 1.1, 1.1); }
  buildBark() { const L = ['Construction started.', 'Building.', 'Task began.']; this.bark(L[Math.floor(Math.random() * L.length)], 0.9); }
  adminBark() { const L = ['All workers are busy.', 'You must build more supply.', 'Cannot comply.']; this.bark(L[Math.floor(Math.random() * L.length)], 1.0); }
  nukeBark() { this.bark('Nuclear launch detected.', 0.6, 0.9); }
  groupBark(n) { this.bark('Group ' + n, 0.95, 1.15); }
  ultimateBark() { const L = { terran: ['Nuclear strike inbound.', 'Yamato, fire!'], zerg: ['The swarm descends!', 'Surge!'], protoss: ['Psionic storm!', 'Storm them!'] }; const a = L[this.race] || L.terran; this.bark(a[Math.floor(Math.random() * a.length)], 0.7); }

  selectBark(unitKinds) {
    // selection-dependent voice groups with rotation (never repeats the same line twice in a row)
    const G = {
      worker: { terran: ['Yes sir.', 'Working.', 'Reporting.'], zerg: ['Sss.', 'At service.', 'Yes.'], protoss: ['Affirmative.', 'Ready.', 'Awaiting.'] },
      marine: { terran: ['Rock and stone!', 'Sir!', 'Marines up!', 'Let\'s rock!'], zerg: ['Ready.', 'Kill.', 'Here.'], protoss: ['Ready.', 'For Aiur.', 'Adept standing.'] },
      tank: { terran: ['Artillery in position.', 'Give me a target.', 'Locked and loaded.'], zerg: ['Siege ready.', 'Fire soon.'], protoss: ['Target locked.', 'Ready to fire.'] },
      air: { terran: ['Airborne.', 'Flight ready.', 'Wings up.'], zerg: ['Wings up.', 'Soaring.'], protoss: ['Squadrons ready.', 'Eyes skyward.'] },
      default: { terran: ['Ready.', 'Orders?', 'Standing by.'], zerg: ['Ready.', 'Waiting.', 'Yes.'], protoss: ['Ready.', 'Command?', 'Standing by.'] }
    };
    let group = 'default';
    if (unitKinds.includes('scv') || unitKinds.includes('drone') || unitKinds.includes('probe')) group = 'worker';
    else if (unitKinds.includes('marine') || unitKinds.includes('firebat') || unitKinds.includes('zereling') || unitKinds.includes('hydralisk') || unitKinds.includes('zealot')) group = 'marine';
    else if (unitKinds.includes('tank') || unitKinds.includes('goliath') || unitKinds.includes('siege')) group = 'tank';
    else if (unitKinds.some(k => ['wraith', 'banshee', 'corsair', 'phoenix', 'mutalisk', 'viper', 'carrier', 'battlecruiser', 'observer', 'overlord', 'scout', 'raven', 'medic', 'darktemplar'].includes(k))) group = 'air';
    const race = this.race || 'terran';
    const lines = G[group][race] || G.default.terran;
    this._selIdx = this._selIdx || {};
    const i = ((this._selIdx[group] || 0) + 1) % lines.length;
    this._selIdx[group] = i;
    this.bark(lines[i], group === 'worker' ? 1.0 : 0.75, 1.08);
  }

  // ---------- signature ability SFX ----------
  nukeLaunch() { this.tone(220, 0.5, 'sawtooth', 0.05, -150); this.noise(0.6, 0.06, 400); }
  nukeImpact() { this.noise(1.2, 0.16, 250); this.tone(60, 0.9, 'sawtooth', 0.08, -30); }
  psiCast() { this.tone(200, 0.4, 'sine', 0.05, 1400); }
  zap() { this.tone(1800 + Math.random() * 600, 0.07, 'sawtooth', 0.02, -1200); }
  orderPing() { this.tone(1050, 0.045, 'sine', 0.02); }
  objective() { const seq = [659, 830, 988]; seq.forEach((f, i) => setTimeout(() => this.tone(f, 0.15, 'triangle', 0.04), i * 120)); }
  setCombat(intense) {
    // intensity levels: 0 calm (pad) -> 1 skirmish (+perc) -> 2 full battle (+lead).
    // Sticky with decay: a blip of combat holds the level up for a few seconds
    // so the music doesn't stutter when engagement flickers frame to frame.
    const now = Date.now();
    if (intense) this._lastCombat = now;
    if (this._heavyCombat && this._heavyCombat > now - 4000) this._lastHeavy = now;
    let lvl = 0;
    if (now - (this._lastCombat || 0) < 6000) lvl = 1;
    if (now - (this._lastHeavy || 0) < 5000) lvl = 2;
    if (this._intensity === lvl) return;
    this._intensity = lvl;
    // crossfade handled in _tickMusic on next step; nudge pad down as layers enter
    if (this.layerBuses && this.ctx) {
      try {
        this.layerBuses.pad.gain.cancelScheduledValues(this.ctx.currentTime);
        this.layerBuses.pad.gain.linearRampToValueAtTime(lvl === 0 ? 0.6 : 0.35, this.ctx.currentTime + 1.5);
      } catch (e) {}
    }
    if (lvl >= 1) this.resume();
  }
  markHeavyCombat() { this._heavyCombat = Date.now(); }
}

