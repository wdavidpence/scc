// v2.30 AAA cinematic audio kit — real pre-baked SFX beds + Edge-TTS voice
// monologue for cutscenes. All assets ship in /public (free, no APIs at
// runtime). Falls back to silent-safe no-ops if an asset fails to decode.
const A = {};
let ctx = null;
let master = null;

export const INTRO_VO = {
  jem1: 'vo/intro/jem1.mp3', joey1: 'vo/intro/joey1.mp3', jem2: 'vo/intro/jem2.mp3',
  joey2: 'vo/intro/joey2.mp3', jem3: 'vo/intro/jem3.mp3',
  control1: 'vo/intro/control1.mp3', control2: 'vo/intro/control2.mp3', card1: 'vo/intro/card1.mp3',
};

// v2.35: voiced mission briefings (key = BRIEFS beat vo: b<mission><a|b>)
export const BRIEF_VO = {
  b1a: 'vo/brief/b1a.mp3', b1b: 'vo/brief/b1b.mp3', b2a: 'vo/brief/b2a.mp3', b2b: 'vo/brief/b2b.mp3',
  b3a: 'vo/brief/b3a.mp3', b3b: 'vo/brief/b3b.mp3', b4a: 'vo/brief/b4a.mp3', b4b: 'vo/brief/b4b.mp3',
  b5a: 'vo/brief/b5a.mp3', b5b: 'vo/brief/b5b.mp3', b6a: 'vo/brief/b6a.mp3', b6b: 'vo/brief/b6b.mp3',
  b7a: 'vo/brief/b7a.mp3', b7b: 'vo/brief/b7b.mp3', b8a: 'vo/brief/b8a.mp3', b8b: 'vo/brief/b8b.mp3',
  b9a: 'vo/brief/b9a.mp3', b9b: 'vo/brief/b9b.mp3', b10a: 'vo/brief/b10a.mp3', b10b: 'vo/brief/b10b.mp3',
};

function ac() {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
  } catch (e) { ctx = null; }
  return ctx;
}

// decode + cache an audio file
export function load(key, url) {
  const c = ac();
  if (!c) return;
  if (A[key]) return;
  A[key] = { buf: null, loading: true };
  fetch(url).then((r) => r.ok ? r.arrayBuffer() : Promise.reject(new Error('404 ' + url)))
    .then((ab) => new Promise((res, rej) => c.decodeAudioData(ab, res, rej)))
    .then((buf) => { A[key].buf = buf; A[key].loading = false; })
    .catch(() => { A[key] = null; });
}

export function preloadAll(base) {
  const b = typeof base === 'string' ? base : '';
  load('bed', b + 'audio/cinematic_bed.m4a');
  load('staticBed', b + 'audio/radio_static.m4a');
  load('impact', b + 'audio/impact_low.m4a');
  load('whoosh', b + 'audio/whoosh.m4a');
  load('click', b + 'audio/ui_click.m4a');
  for (const k of Object.keys(INTRO_VO)) load(k, b + INTRO_VO[k].replace(/^\//, ''));
  for (const k of Object.keys(BRIEF_VO)) load(k, b + BRIEF_VO[k].replace(/^\//, ''));
}

// lazily pull a briefing/vo clip by key if preload hasn't covered it yet
export function ensure(key, base = '') { if (!A[key]) { const p = (INTRO_VO[key] || BRIEF_VO[key]) || ('vo/brief/' + key + '.mp3'); load(key, base + p.replace(/^\//, '')); } }

export function resume() { const c = ac(); if (c && c.state === 'suspended') c.resume(); }

export function isReady(key) { return !!(A[key] && A[key].buf); }
export function durationOf(key) { return A[key] && A[key].buf ? A[key].buf.duration : 0; }

function play(key, { vol = 1, loop = false, offset = 0, onended = null, rate = 1 } = {}) {
  const c = ac();
  if (!c || !A[key] || !A[key].buf) return null;
  const s = c.createBufferSource();
  s.buffer = A[key].buf;
  s.loop = loop;
  s.playbackRate.value = rate;
  const g = c.createGain();
  g.gain.value = vol;
  s.connect(g); g.connect(master);
  if (onended) s.onended = onended;
  try { s.start(0, offset); } catch (e) { return null; }
  return { s, g };
}

export function bed(vol = 0.5) { return play('bed', { vol, loop: true }); }
export function staticBed(vol = 0.28) { return play('staticBed', { vol, loop: true }); }
export function impact(vol = 0.8) { return play('impact', { vol }); }
export function whoosh(vol = 0.6) { return play('whoosh', { vol }); }
export function click(vol = 0.5) { return play('click', { vol }); }

// play a voiced line; resolves after the clip finishes (or a fallback wait)
export function voice(key, vol = 0.95) {
  return new Promise((resolve) => {
    const c = ac();
    if (!c || !A[key] || !A[key].buf) { resolve(0); return; }
    const dur = A[key].buf.duration;
    const node = play(key, { vol, onended: () => resolve(dur) });
    if (!node) resolve(0);
    else setTimeout(() => resolve(dur), (dur + 0.6) * 1000); // safety net
  });
}

export function stopAll(nodes) {
  for (const n of nodes || []) { try { n.s.stop(); } catch (e) {} }
}

// debug/gate hook
if (typeof window !== 'undefined') {
  window.__CIN = {
    isReady, durationOf,
    readyCount: () => Object.keys(A).filter((k) => A[k] && A[k].buf).length,
    total: () => 5 + Object.keys(INTRO_VO).length,
    playing: () => !!(ctx && ctx.state === 'running'),
  };
}
