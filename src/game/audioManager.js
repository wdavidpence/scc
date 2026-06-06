/**
 * AudioManager — programmatic sound effects for SCC.
 *
 * Uses the Web Audio API to synthesize all sounds at runtime, keeping the game
 * footprint tiny (no audio files to load).  Generates short, punchy retro-arcade
 * tones suitable for a StarCraft-inspired mobile RTS.
 *
 * Sound catalogue:
 *   select       — short ascending chirp (unit selected)
 *   deselect     — brief downward blip (selection cleared)
 *   moveCommand  — low whoosh / footstep thud (movement order issued)
 *   attackCmd    — sharper, higher whoosh (attack-move order)
 *   error        – short discordant buzz (unavailable action)
 *   buildStart   — mechanical click + rise (construction begins)
 *   trainComplete — bright arpeggio burst (unit deployed)
 *   waveWarn     — pulsing alert tone (enemy wave incoming)
 *   hit          — short impact burst (unit takes damage)
 *   explosion    — noise burst + low rumble (unit death)
 *   complete     — bright ascending chime (building/unit completes)
 *   chargeHit    — sharp impact + high ring (Protoss charge hit)
 *
 * Usage:  create the instance in a scene's `create()` and call methods by name.
 */

export function createAudioManager(game) {
  let audioCtx = null;
  let masterGain = null;
  let enabled = true;
  const cueCooldowns = new Map();

  function nowMs() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  function cueKey(base, entity) {
    return entity && entity.id != null ? `${base}:${entity.id}` : base;
  }

  function canPlay(key, minGapMs) {
    const now = nowMs();
    if (!cueCooldowns.has(key)) {
      cueCooldowns.set(key, now);
      return true;
    }
    const last = cueCooldowns.get(key) || 0;
    if (now - last < minGapMs) return false;
    cueCooldowns.set(key, now);
    return true;
  }

  // Lazy-initialise AudioContext on first user gesture (required by browsers).
  function ensureAudio() {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.35; // keep cues present without crowding the mix
      masterGain.connect(audioCtx.destination);
    } catch (_) {
      // Audio API not available — silently skip.
      audioCtx = null;
    }
  }

  // --- helpers ---------------------------------------------------------------

  /** Create an OscillatorNode, connect to masterGain, schedule start/stop. */
  function playTone(freq, type, duration, volume = 1, detune = 0) {
    if (!enabled || !audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain).connect(masterGain);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + duration);
  }

  /** Play a short frequency sweep (ramp from startFreq to endFreq). */
  function playSweep(startFreq, endFreq, duration, type, volume = 0.6) {
    if (!enabled || !audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), audioCtx.currentTime + duration);
    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain).connect(masterGain);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + duration);
  }

  /** Play a noise burst (white noise through a bandpass filter). */
  function playNoise(duration, freq = 800, q = 2, volume = 0.3) {
    if (!enabled || !audioCtx) return;
    const bufferSize = audioCtx.sampleRate * duration;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.5;
    }
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = q;

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

    source.connect(filter).connect(gain).connect(masterGain);
    source.start(audioCtx.currentTime);
    source.stop(audioCtx.currentTime + duration);
  }

  // --- sound effects ---------------------------------------------------------

  /** Selection chirp: quick ascending two-tone. */
  function select(entity = null) {
    if (!canPlay(cueKey('select', entity), 80)) return;
    ensureAudio();
    playTone(860, 'square', 0.05, 0.22);
    setTimeout(() => playTone(1240, 'square', 0.07, 0.18), 35);
  }

  /** Deselect blip: short downward tone. */
  function deselect(entity = null) {
    if (!canPlay(cueKey('deselect', entity), 90)) return;
    ensureAudio();
    playSweep(560, 240, 0.09, 'square', 0.16);
  }

  /** Move command: low whoosh (filtered noise burst). */
  function moveCommand() {
    if (!canPlay('moveCommand', 100)) return;
    ensureAudio();
    playNoise(0.14, 420, 3, 0.16);
    playSweep(120, 320, 0.12, 'triangle', 0.12);
  }

  /** Attack move: sharper, higher whoosh. */
  function attackCommand() {
    if (!canPlay('attackCommand', 100)) return;
    ensureAudio();
    playNoise(0.12, 900, 2, 0.18);
    playSweep(220, 620, 0.1, 'sawtooth', 0.12);
    setTimeout(() => playTone(1080, 'sawtooth', 0.05, 0.09), 55);
  }

  /** Unit attack impact: a subtle cue for weapons firing/combat engagement. */
  function attack(unit = null) {
    const key = cueKey('attack', unit);
    if (!canPlay(key, 60)) return;
    ensureAudio();

    const range = unit?.range ?? 0;
    const isStructure = unit?.type === 'structure' || unit?.type === 'construction';
    const isMelee = isStructure ? false : (unit?.isCharging || range <= 50 || unit?.attackType === 'melee');

    if (isStructure) {
      playNoise(0.05, 560, 2.8, 0.12);
      playSweep(180, 85, 0.08, 'sine', 0.08);
      return;
    }

    if (isMelee) {
      playNoise(0.04, 1250, 4, 0.11);
      playTone(230, 'triangle', 0.045, 0.09);
      setTimeout(() => playTone(170, 'square', 0.025, 0.05), 12);
      return;
    }

    playSweep(1220, 360, 0.065, 'sawtooth', 0.08);
    playTone(920, 'sine', 0.03, 0.06, 6);
  }

  /** Error buzz: low, discordant. */
  function error() {
    if (!canPlay('error', 110)) return;
    ensureAudio();
    playTone(150, 'sawtooth', 0.16, 0.16);
    playTone(157, 'sawtooth', 0.16, 0.12); // slight detune for dissonance
  }

  /** Construction start: mechanical click + rising tone. */
  function buildStart() {
    if (!canPlay('buildStart', 120)) return;
    ensureAudio();
    playNoise(0.035, 3000, 5, 0.1);
    setTimeout(() => playSweep(200, 560, 0.2, 'square', 0.12), 24);
  }

  /** Training complete: bright ascending arpeggio. */
  function trainComplete() {
    ensureAudio();
    const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      setTimeout(() => playTone(freq, 'square', 0.12, 0.2), i * 50);
    });
  }

  /** Wave warning: pulsing alert. */
  function waveWarn() {
    if (!canPlay('waveWarn', 200)) return;
    ensureAudio();
    for (let i = 0; i < 3; i++) {
      setTimeout(() => playTone(440, 'square', 0.09, 0.18), i * 140);
    }
  }

  /** Hit sound: short impact burst (unit takes damage). */
  function hit(unit = null) {
    const key = cueKey('hit', unit);
    if (!canPlay(key, 55)) return;
    ensureAudio();
    const shielded = (unit?.shield ?? 0) > 0;
    // Quick percussive click + low thud
    playNoise(0.04, shielded ? 2100 : 1550, 4.5, shielded ? 0.12 : 0.14);
    setTimeout(() => playTone(shielded ? 520 : 190, 'square', 0.032, shielded ? 0.08 : 0.1), 8);
  }

  /** Explosion: noise burst with low rumble (unit death). */
  function explosion(unit = null) {
    const key = cueKey('explosion', unit);
    if (!canPlay(key, unit?.type === 'structure' || unit?.type === 'construction' ? 70 : 55)) return;
    ensureAudio();
    const isStructure = unit?.type === 'structure' || unit?.type === 'construction';
    const volume = isStructure ? 0.22 : 0.16;
    const freq = isStructure ? 520 : 720;
    const q = isStructure ? 1.8 : 2.4;
    // Noise burst (explosion crackle)
    playNoise(isStructure ? 0.22 : 0.16, freq, q, volume);
    // Low rumble
    setTimeout(() => playSweep(isStructure ? 92 : 120, isStructure ? 36 : 52, isStructure ? 0.22 : 0.16, 'sine', isStructure ? 0.12 : 0.08), 40);
  }

  /** Completion chime: bright ascending tones (building/unit completes). */
  function complete() {
    if (!canPlay('complete', 180)) return;
    ensureAudio();
    const notes = [660, 880, 1100]; // E5 A5 C6
    notes.forEach((freq, i) => {
      setTimeout(() => playTone(freq, 'square', 0.085, 0.12), i * 38);
    });
  }

  /** Charge hit: sharp impact with high frequency ring (Protoss charge). */
  function chargeHit() {
    ensureAudio();
    // Sharp impact
    playNoise(0.06, 2000, 5, 0.3);
    // High ring
    setTimeout(() => playTone(1600, 'sine', 0.12, 0.2), 15);
    // Secondary shimmer
    setTimeout(() => playTone(2200, 'sine', 0.08, 0.12), 40);
  }

  // --- public API ------------------------------------------------------------

  return {
    /** Toggle all sound on/off. */
    setEnabled(state) {
      enabled = state;
    },
    isEnabled() {
      return enabled && !!audioCtx;
    },

    // Individual SFX handlers
    select,
    deselect,
    moveCommand,
    attackCommand,
    attack,
    error,
    buildStart,
    trainComplete,
    waveWarn,
    hit,
    explosion,
    complete,
    chargeHit,

    /** Return true if the Web Audio API is available. */
    get available() {
      return !!audioCtx;
    },

    /** Clean up on scene shutdown. */
    destroy() {
      if (masterGain) {
        masterGain.disconnect();
        masterGain = null;
      }
      if (audioCtx) {
        audioCtx.close().catch(() => {});
        audioCtx = null;
      }
    }
  };
}
