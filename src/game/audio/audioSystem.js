/**
 * Procedural audio system for SCC mobile game.
 * Uses the Web Audio API to generate all sounds at runtime — no external assets required.
 * Provides: attack, explosion, resource pickup/delivery, and ambient music.
 */

export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.initialized = false;
    this.muted = false;
    this.musicGain = null;
    this.sfxGain = null;
    this.ambientNodes = [];
  }

  /**
   * Initialize the Web Audio context. Must be called from a user gesture.
   * Returns true on success, false if audio is not supported.
   */
  init() {
    if (this.initialized) return true;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return false;

      this.ctx = new AudioCtx();

      // Master gain: SFX
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.7;
      this.sfxGain.connect(this.ctx.destination);

      // Music gain (lower volume for ambient)
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.25;
      this.musicGain.connect(this.sfxGain);

      this.initialized = true;
      return true;
    } catch (e) {
      console.warn('[AudioSystem] Web Audio not available:', e.message);
      return false;
    }
  }

  /** Resume context if suspended (browser policy). */
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /** Mute/unmute all audio. */
  setMuted(muted) {
    this.muted = muted;
    if (this.sfxGain) {
      this.sfxGain.gain.value = muted ? 0 : 0.7;
    }
    if (this.musicGain) {
      this.musicGain.gain.value = muted ? 0 : 0.25;
    }
  }

  /* ──────────────── ATTACK SOUNDS ──────────────── */

  /**
   * Play a melee attack sound (short punchy impact).
   * Used by: marines, zealots, zerglings, hydralisk melee.
   */
  playMeleeAttack() {
    if (!this.initialized || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Quick noise burst for impact
    const duration = 0.06;
    const bufSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      const t = i / ctx.sampleRate;
      // Exponentially decaying noise with a low-frequency thump
      const env = Math.exp(-t * 60);
      data[i] = (Math.random() * 2 - 1) * env * 0.5
              + Math.sin(2 * Math.PI * 80 * t) * env * 0.3;
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    // Bandpass to shape the impact character
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 400;
    bp.Q.value = 1.5;

    src.connect(bp);
    bp.connect(this.sfxGain);
    src.start(now);
    src.stop(now + duration);
  }

  /**
   * Play a ranged/energy attack sound (laser/zap).
   * Used by: marines (plasma), stalkers, hydralisks.
   */
  playRangedAttack() {
    if (!this.initialized || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Sine sweep up + quick noise burst
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1800, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.08);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.25, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3000, now);
    lp.frequency.exponentialRampToValueAtTime(400, now + 0.08);

    osc.connect(lp);
    lp.connect(env);
    env.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.12);

    // Add a short noise burst for the "hit"
    this._playNoiseBurst(now, 0.03, 2000, 3);
  }

  /**
   * Play an energy/psionic attack sound (Protoss style).
   * Used by: zealots (psi blade), probes attacking.
   */
  playEnergyAttack() {
    if (!this.initialized || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Two detuned oscillators for shimmer
    [440, 445].forEach((freq) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.5, now + 0.15);

      const env = ctx.createGain();
      env.gain.setValueAtTime(0.12, now);
      env.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = freq;
      bp.Q.value = 8;

      osc.connect(bp);
      bp.connect(env);
      env.connect(this.sfxGain);

      osc.start(now);
      osc.stop(now + 0.18);
    });
  }

  /**
   * Play a structure attack sound (heavy, explosive).
   * Used by: tanks, siege mode, siege tanks.
   */
  playStructureAttack() {
    if (!this.initialized || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Low boom + noise
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.25);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.4, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.connect(env);
    env.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.35);

    // Noise burst for the explosion
    this._playNoiseBurst(now, 0.15, 600, 0.8);
  }

  /* ──────────────── EXPLOSION / DEATH SOUNDS ──────────────── */

  /**
   * Play a small explosion (unit death).
   * Used by: soldier/unit destruction.
   */
  playSmallExplosion() {
    if (!this.initialized || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const duration = 0.35;

    this._playNoiseBurst(now, duration, 800, 0.6);

    // Low rumble
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(100, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + duration);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.3, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(env);
    env.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  /**
   * Play a large explosion (structure destruction).
   * Used by: command center, barracks, etc. being destroyed.
   */
  playLargeExplosion() {
    if (!this.initialized || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const duration = 0.6;

    this._playNoiseBurst(now, duration, 500, 0.9);

    // Deep rumble
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(60, now);
    osc.frequency.exponentialRampToValueAtTime(15, now + duration);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.5, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(env);
    env.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + duration + 0.1);

    // Secondary crackle
    this._playNoiseBurst(now + 0.1, 0.2, 1500, 0.3);
  }

  /* ──────────────── RESOURCE SOUNDS ──────────────── */

  /**
   * Play mineral pickup sound (worker picking up minerals).
   * A bright "bloop" — short sine sweep up.
   */
  playMineralPickup() {
    if (!this.initialized || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.06);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.15, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(env);
    env.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  /**
   * Play mineral delivery sound (worker returning minerals to base).
   * A satisfying ascending chime.
   */
  playMineralDelivery() {
    if (!this.initialized || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Two-tone chime
    [800, 1200].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;

      const env = ctx.createGain();
      const tStart = now + i * 0.06;
      env.gain.setValueAtTime(0, tStart);
      env.gain.linearRampToValueAtTime(0.12, tStart + 0.01);
      env.gain.exponentialRampToValueAtTime(0.001, tStart + 0.2);

      osc.connect(env);
      env.connect(this.sfxGain);
      osc.start(tStart);
      osc.stop(tStart + 0.25);
    });
  }

  /**
   * Play gas pickup sound (worker at geyser).
   * A hissing/pulsing tone.
   */
  playGasPickup() {
    if (!this.initialized || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Shimmering high-frequency noise with amplitude modulation
    const bufSize = ctx.sampleRate * 0.2;
    const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      const t = i / ctx.sampleRate;
      // AM: modulate at 8 Hz for a pulsing gas effect
      const am = 0.5 + 0.5 * Math.sin(2 * Math.PI * 8 * t);
      data[i] = (Math.random() * 2 - 1) * am * Math.exp(-t * 8);
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2000;

    src.connect(hp);
    hp.connect(this.sfxGain);
    src.start(now);
    src.stop(now + 0.25);
  }

  /**
   * Play gas delivery sound (worker returning gas to base).
   * A brighter, longer version of pickup.
   */
  playGasDelivery() {
    if (!this.initialized || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // High chime + noise shimmer
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(2000, now + 0.1);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.1, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(env);
    env.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.25);

    this._playNoiseBurst(now, 0.15, 3000, 0.15);
  }

  /* ──────────────── AMBIENT MUSIC ──────────────── */

  /**
   * Start a subtle ambient background music loop.
   * Uses layered oscillators for a sci-fi atmosphere.
   */
  startAmbient() {
    if (!this.initialized || this.muted) return;
    this.stopAmbient();

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const bpm = 60;
    const beatDur = 60 / bpm;

    // Pad voice: low drone
    const padFreqs = [55, 82.5, 110]; // A1, E2, A2
    padFreqs.forEach((freq) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;

      const env = ctx.createGain();
      env.gain.value = 0.12;

      // Slow LFO on volume for movement
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.1 + Math.random() * 0.1; // 0.1-0.2 Hz
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.04;
      lfo.connect(lfoGain);
      lfoGain.connect(env.gain);

      osc.connect(env);
      env.connect(this.musicGain);

      osc.start(now);
      lfo.start(now);

      this.ambientNodes.push({ osc, lfo });
    });

    // Sparkle voice: high ethereal tones
    const sparkleFreqs = [440, 554.37, 659.25]; // A4, C#5, E5
    sparkleFreqs.forEach((freq) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      // Arpeggiate slowly
      const arpIndex = sparkleFreqs.indexOf(freq);
      osc.frequency.setValueAtTime(freq, now);
      // Slow frequency modulation
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.05 + arpIndex * 0.02;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = freq * 0.02;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);

      const env = ctx.createGain();
      env.gain.value = 0.03;

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2000;

      osc.connect(lp);
      lp.connect(env);
      env.connect(this.musicGain);

      osc.start(now);
      lfo.start(now);

      this.ambientNodes.push({ osc, lfo });
    });

    // Sub bass pulse (heartbeat-like)
    const subOsc = ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.value = 36.7; // F1

    const subEnv = ctx.createGain();
    subEnv.gain.value = 0;

    // Pulse at half-time
    const pulseLfo = ctx.createOscillator();
    pulseLfo.type = 'sine';
    pulseLfo.frequency.value = 0.5; // half-beat pulse

    const pulseEnv = ctx.createGain();
    pulseEnv.gain.value = 0.15;

    pulseLfo.connect(pulseEnv);
    subOsc.connect(subEnv);
    subEnv.connect(this.musicGain);

    subOsc.start(now);
    pulseLfo.start(now);

    this.ambientNodes.push({ osc: subOsc, lfo: pulseLfo });
  }

  /** Stop the ambient music. */
  stopAmbient() {
    const now = this.ctx ? this.ctx.currentTime : 0;
    this.ambientNodes.forEach((node) => {
      try {
        node.osc.stop(now + 0.5);
        if (node.lfo) node.lfo.stop(now + 0.5);
      } catch (_) { /* already stopped */ }
    });
    this.ambientNodes = [];
  }

  /* ──────────────── UI SOUNDS ──────────────── */

  /**
   * Play a button click sound (HUD interaction).
   */
  playClick() {
    if (!this.initialized || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.02);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.08, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

    osc.connect(env);
    env.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  /**
   * Play a warning/alert sound (enemy wave incoming).
   */
  playWarning() {
    if (!this.initialized || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Alternating beeps
    [523, 659].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = freq;

      const env = ctx.createGain();
      const tStart = now + i * 0.15;
      env.gain.setValueAtTime(0, tStart);
      env.gain.linearRampToValueAtTime(0.12, tStart + 0.02);
      env.gain.exponentialRampToValueAtTime(0.001, tStart + 0.12);

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1500;

      osc.connect(lp);
      lp.connect(env);
      env.connect(this.sfxGain);

      osc.start(tStart);
      osc.stop(tStart + 0.15);
    });
  }

  /**
   * Play victory/defeat fanfare.
   */
  playVictory() {
    if (!this.initialized || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Ascending major arpeggio
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;

      const env = ctx.createGain();
      const tStart = now + i * 0.12;
      env.gain.setValueAtTime(0, tStart);
      env.gain.linearRampToValueAtTime(0.15, tStart + 0.02);
      env.gain.exponentialRampToValueAtTime(0.001, tStart + 0.5);

      osc.connect(env);
      env.connect(this.sfxGain);

      osc.start(tStart);
      osc.stop(tStart + 0.55);
    });
  }

  /**
   * Play a defeat sound (descending minor).
   */
  playDefeat() {
    if (!this.initialized || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Descending minor arpeggio
    const notes = [392, 349.23, 311.13, 261.63]; // G4 Eb4 C#4 C4
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;

      const env = ctx.createGain();
      const tStart = now + i * 0.15;
      env.gain.setValueAtTime(0, tStart);
      env.gain.linearRampToValueAtTime(0.13, tStart + 0.02);
      env.gain.exponentialRampToValueAtTime(0.001, tStart + 0.6);

      osc.connect(env);
      env.connect(this.sfxGain);

      osc.start(tStart);
      osc.stop(tStart + 0.65);
    });
  }

  /* ──────────────── INTERNAL HELPERS ──────────────── */

  /**
   * Internal: generate a noise burst for impacts/explosions.
   * @param {number} now - AudioContext.currentTime to start
   * @param {number} duration - Duration in seconds
   * @param {number} freq - Center frequency for bandpass filter
   * @param {number} volume - Volume multiplier (0-1)
   */
  _playNoiseBurst(now, duration, freq, volume) {
    const ctx = this.ctx;
    const bufSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufSize; i++) {
      const t = i / ctx.sampleRate;
      data[i] = (Math.random() * 2 - 1) * Math.exp(-t * (8 / duration));
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = 1;

    const env = ctx.createGain();
    env.gain.value = volume || 0.5;

    src.connect(bp);
    bp.connect(env);
    env.connect(this.sfxGain);
    src.start(now);
    src.stop(now + duration + 0.01);
  }

  /** Cleanup all audio nodes. */
  destroy() {
    this.stopAmbient();
    try { this.ctx?.close(); } catch (_) {}
    this.initialized = false;
  }
}

// Export a singleton instance
export const audioSystem = new AudioSystem();
