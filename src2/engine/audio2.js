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
    const seq = win ? [523, 659, 784, 1046] : [392, 330, 262, 196];
    seq.forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 'triangle', 0.05), i * 180));
  }

  // ---------- race tint ----------
  setRace(race) {
    this.race = race;
    this.setRaceVoice(race);
    this.raceChord = race === 'zerg' ? [110, 138, 164] : race === 'protoss' ? [196, 294, 392] : [131, 196, 262];
    this.raceWave = race === 'zerg' ? 'sawtooth' : race === 'protoss' ? 'sine' : 'triangle';
  }

  // ---------- ambient music: slow procedural pads ----------
  startMusic() {
    if (this.musicOn || !this.ctx) return;
    this.musicOn = true;
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.045;
    this.musicBus.connect(this.ctx.destination);
    this.setRace(this.scene?.race || 'terran');
    const playPad = () => {
      if (!this.musicOn || !this.ctx) return;
      const t = this.ctx.currentTime;
      const chord = this.raceChord;
      chord.forEach((f, i) => {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = this.raceWave;
        o.frequency.setValueAtTime(f * (i === 2 && Math.random() < 0.3 ? 1.5 : 1), t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.5, t + 2.2);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 7.5);
        o.connect(g); g.connect(this.musicBus);
        o.start(t); o.stop(t + 8);
      });
      // sparse arpeggio sparkle
      if (Math.random() < 0.7) {
        const arp = chord[Math.floor(Math.random() * 3)] * 2;
        const o2 = this.ctx.createOscillator(); const g2 = this.ctx.createGain();
        o2.type = 'triangle'; o2.frequency.setValueAtTime(arp, t + 3);
        g2.gain.setValueAtTime(0.0001, t + 3);
        g2.gain.exponentialRampToValueAtTime(0.25, t + 3.1);
        g2.gain.exponentialRampToValueAtTime(0.0001, t + 3.8);
        o2.connect(g2); g2.connect(this.musicBus); o2.start(t + 3); o2.stop(t + 4);
      }
      this._musicTimer = setTimeout(playPad, 6500 + Math.random() * 2000);
    };
    playPad();
  }
  stopMusic() { this.musicOn = false; if (this._musicTimer) clearTimeout(this._musicTimer); if (this.musicBus) { try { this.musicBus.gain.value = 0; } catch (e) {} } }

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
    if (this._intense === intense) return;
    this._intense = intense;
    if (this.musicBus && this.ctx) {
      try { this.musicBus.gain.linearRampToValueAtTime(intense ? 0.075 : 0.045, this.ctx.currentTime + 1.5); } catch (e) {}
    }
  }
}

