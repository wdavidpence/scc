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

  // Lazy-initialise AudioContext on first user gesture (required by browsers).
  function ensureAudio() {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.5; // default at 50 % volume
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
  function select() {
    ensureAudio();
    playTone(880, 'square', 0.06, 0.4);
    setTimeout(() => playTone(1320, 'square', 0.08, 0.35), 40);
  }

  /** Deselect blip: short downward tone. */
  function deselect() {
    ensureAudio();
    playSweep(600, 250, 0.1, 'square', 0.25);
  }

  /** Move command: low whoosh (filtered noise burst). */
  function moveCommand() {
    ensureAudio();
    playNoise(0.18, 400, 3, 0.25);
    playSweep(120, 350, 0.15, 'triangle', 0.2);
  }

  /** Attack move: sharper, higher whoosh. */
  function attackCommand() {
    ensureAudio();
    playNoise(0.15, 900, 2, 0.3);
    playSweep(200, 600, 0.12, 'sawtooth', 0.2);
    setTimeout(() => playTone(1100, 'sawtooth', 0.06, 0.15), 60);
  }

  /** Error buzz: low, discordant. */
  function error() {
    ensureAudio();
    playTone(150, 'sawtooth', 0.2, 0.3);
    playTone(155, 'sawtooth', 0.2, 0.2); // slight detune for dissonance
  }

  /** Construction start: mechanical click + rising tone. */
  function buildStart() {
    ensureAudio();
    playNoise(0.04, 3000, 5, 0.15);
    setTimeout(() => playSweep(200, 600, 0.25, 'square', 0.2), 30);
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
    ensureAudio();
    for (let i = 0; i < 3; i++) {
      setTimeout(() => playTone(440, 'square', 0.1, 0.3), i * 150);
    }
  }

  /** Hit sound: short impact burst (unit takes damage). */
  function hit() {
    ensureAudio();
    // Quick percussive click + low thud
    playNoise(0.05, 1500, 4, 0.2);
    setTimeout(() => playTone(200, 'square', 0.04, 0.15), 10);
  }

  /** Explosion: noise burst with low rumble (unit death). */
  function explosion() {
    ensureAudio();
    // Noise burst (explosion crackle)
    playNoise(0.25, 600, 2, 0.35);
    // Low rumble
    setTimeout(() => playSweep(80, 40, 0.2, 'sine', 0.25), 50);
  }

  /** Completion chime: bright ascending tones (building/unit completes). */
  function complete() {
    ensureAudio();
    const notes = [660, 880, 1100]; // E5 A5 C6
    notes.forEach((freq, i) => {
      setTimeout(() => playTone(freq, 'square', 0.1, 0.18), i * 40);
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
