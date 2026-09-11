// v2.46 HUD CHROME engine: baked 9-slice panel textures, resource icons,
// minimap shroud pattern, v2.47 command cursor frames.
// All textures are baked ONCE at 2x supersample then downscaled (LINEAR-friendly),
// per the AAA pipeline accepted in v2.33 — no raw Phaser createCanvas (3.90 trap).
import Phaser from 'phaser';

const S = 2; // supersample factor

function bake(scene, key, w, h, draw) {
  if (scene.textures.exists(key)) return key;
  const c = document.createElement('canvas');
  c.width = w * S; c.height = h * S;
  const ctx = c.getContext('2d');
  ctx.save(); ctx.scale(S, S);
  draw(ctx, w, h);
  ctx.restore();
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const ox = out.getContext('2d');
  ox.imageSmoothingEnabled = true; ox.imageSmoothingQuality = 'high';
  ox.drawImage(c, 0, 0, w, h);
  scene.textures.addCanvas(key, out);
  return key;
}

// Metal panel face: dark gunmetal gradient, brushed streaks, lit top bevel,
// inset shadow line, corner rivets. Corner slice = 10px.
function panelFace(ctx, w, h, opts = {}) {
  const { tone = 'blue', accent = null } = opts;
  const tones = {
    blue: { lo: '#0b1220', hi: '#1b2738', bev: '#46586f', rivet: '#5e7089' },
    dark: { lo: '#07090f', hi: '#141a26', bev: '#38455a', rivet: '#4b5a72' },
  };
  const T = tones[tone] || tones.blue;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, T.hi); g.addColorStop(0.12, T.lo); g.addColorStop(0.85, T.lo); g.addColorStop(1, '#04070c');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  // brushed streaks
  ctx.globalAlpha = 0.05;
  for (let y = 2; y < h - 2; y += 3) {
    ctx.fillStyle = (y % 6 === 2) ? '#9fb6d4' : '#000000';
    ctx.fillRect(2, y, w - 4, 1);
  }
  ctx.globalAlpha = 1;
  // bevel frame: lit top/left, dark bottom/right, hard outer edge
  ctx.fillStyle = T.bev; ctx.fillRect(0, 0, w, 1); ctx.fillRect(0, 0, 1, h);
  ctx.fillStyle = '#02040a'; ctx.fillRect(0, h - 1, w, 1); ctx.fillRect(w - 1, 0, 1, h);
  ctx.fillStyle = '#00000088'; ctx.fillRect(1, 1, w - 2, 1);
  // inner recess line
  ctx.strokeStyle = '#2c3a50'; ctx.lineWidth = 1;
  ctx.strokeRect(4.5, 4.5, w - 9, h - 9);
  ctx.strokeStyle = '#04060c';
  ctx.strokeRect(5.5, 5.5, w - 11, h - 11);
  // rivets in corners
  const rv = (cx, cy) => {
    const rg = ctx.createRadialGradient(cx - 0.7, cy - 0.7, 0.3, cx, cy, 2.4);
    rg.addColorStop(0, '#c8d6ea'); rg.addColorStop(0.55, T.rivet); rg.addColorStop(1, '#141c28');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(cx, cy, 2.2, 0, Math.PI * 2); ctx.fill();
  };
  rv(8, 8); rv(w - 8, 8); rv(8, h - 8); rv(w - 8, h - 8);
  // optional team accent rail along top inside edge
  if (accent) { ctx.globalAlpha = 0.5; ctx.fillStyle = accent; ctx.fillRect(7, 6, w - 14, 1); ctx.globalAlpha = 1; }
}

// v2.48 chip base plate: small engraved metal tile, accent-lit bevel.
function chipBase(ctx, w, h, col) {
  ctx.clearRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#232f42'); g.addColorStop(0.18, '#101827'); g.addColorStop(1, '#05080f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#46586f'; ctx.fillRect(0, 0, w, 1); ctx.fillRect(0, 0, 1, h);
  ctx.fillStyle = '#02040a'; ctx.fillRect(0, h - 1, w, 1); ctx.fillRect(w - 1, 0, 1, h);
  ctx.strokeStyle = col; ctx.globalAlpha = 0.35; ctx.lineWidth = 1;
  ctx.strokeRect(1.5, 1.5, w - 3, h - 3); ctx.globalAlpha = 1;
}

// Glyph vocab drawn centered at origin, accent color, chunky at 14px.
const GL = {
  attack: (ctx, c) => { ctx.strokeStyle = c; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-4.5, 4.5); ctx.lineTo(4, -4); ctx.stroke();
    ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(5.5, -5.5); ctx.lineTo(1.2, -4.4); ctx.lineTo(4.4, -1.2); ctx.closePath(); ctx.fill();
    ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(-4.5, 4.5, 2, 0, Math.PI * 2); ctx.stroke(); },
  stop: (ctx, c) => { ctx.fillStyle = c; ctx.fillRect(-4, -4, 8, 8);
    ctx.fillStyle = '#05080f'; ctx.fillRect(-2.4, -2.4, 4.8, 4.8); },
  deploy: (ctx, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(4.4, 1); ctx.lineTo(1.8, 1); ctx.lineTo(1.8, 4.6); ctx.lineTo(-1.8, 4.6); ctx.lineTo(-1.8, 1); ctx.lineTo(-4.4, 1); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = c; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-5, 5.5); ctx.lineTo(5, 5.5); ctx.stroke(); },
  siege: (ctx, c) => { ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-5.5, -1); ctx.lineTo(5.5, -1); ctx.stroke();
    ctx.fillStyle = c; ctx.beginPath(); ctx.arc(-2.6, 2.6, 2.2, 0, Math.PI * 2); ctx.arc(2.6, 2.6, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#05080f'; ctx.beginPath(); ctx.arc(-2.6, 2.6, 0.9, 0, Math.PI * 2); ctx.arc(2.6, 2.6, 0.9, 0, Math.PI * 2); ctx.fill(); },
  burrow: (ctx, c) => { ctx.strokeStyle = c; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-5.5, 3); ctx.quadraticCurveTo(0, 7, 5.5, 3); ctx.stroke();
    ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(0, -5); ctx.quadraticCurveTo(3.6, 0.5, 0, 3.4); ctx.quadraticCurveTo(-3.6, 0.5, 0, -5); ctx.closePath(); ctx.fill(); },
  stim: (ctx, c) => { ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-5.5, 0.5); ctx.lineTo(-2, 0.5); ctx.lineTo(-0.4, -3); ctx.lineTo(1.6, 4); ctx.lineTo(3, 0.5); ctx.lineTo(5.5, 0.5); ctx.stroke(); },
  cloak: (ctx, c) => { ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 1, 4.4, Math.PI, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-5.5, 1); ctx.lineTo(5.5, 1); ctx.stroke();
    ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.moveTo(-3, -2.2); ctx.lineTo(-1.4, -3.4); ctx.moveTo(1.6, -2.6); ctx.lineTo(3.2, -3.6); ctx.stroke(); ctx.globalAlpha = 1; },
  merge: (ctx, c) => { ctx.strokeStyle = c; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(-2.4, 0, 3.4, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(2.4, 0, 3.4, 0, Math.PI * 2); ctx.stroke(); },
  darkmerge: (ctx, c) => { ctx.strokeStyle = c; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(-2.4, 0, 3.4, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(2.4, 0, 3.4, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#d8ccff'; ctx.beginPath(); ctx.arc(0, 0, 1.4, 0, Math.PI * 2); ctx.fill(); },
  maelstrom: (ctx, c) => { ctx.strokeStyle = c; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, 5, 0.4, Math.PI * 1.7); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 2.6, Math.PI * 1.1, Math.PI * 0.6); ctx.stroke(); },
  guardian: (ctx, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(0, -5.5); ctx.lineTo(4.8, -1.4); ctx.lineTo(3.2, 4.8); ctx.lineTo(-3.2, 4.8); ctx.lineTo(-4.8, -1.4); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#05080f'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(0, 2.6); ctx.stroke(); },
  devourer: (ctx, c) => { ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 1.4, 4.4, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = c; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * 3 - 1, 1.4); ctx.lineTo(i * 3, 5); ctx.lineTo(i * 3 + 1, 1.4); ctx.closePath(); ctx.fill(); } },
  caustic: (ctx, c) => { ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(-2.2, -1.6, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(2.4, 0.4, 1.9, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(-0.4, 3.4, 1.5, 0, Math.PI * 2); ctx.fill(); },
  storm: (ctx, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(1.4, -5.5); ctx.lineTo(-3.4, 0.6); ctx.lineTo(-0.4, 0.6); ctx.lineTo(-1.6, 5.5); ctx.lineTo(3.4, -0.8); ctx.lineTo(0.4, -0.8); ctx.closePath(); ctx.fill(); },
  patrol: (ctx, c) => { ctx.strokeStyle = c; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-5, 3.4); ctx.lineTo(-1.6, 3.4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(1.6, -3.4); ctx.lineTo(5, -3.4); ctx.stroke();
    ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(-5, 1); ctx.lineTo(-5, 5.8); ctx.lineTo(-1.6, 3.4); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(5, -1); ctx.lineTo(5, -5.8); ctx.lineTo(1.6, -3.4); ctx.closePath(); ctx.fill(); },
  hold: (ctx, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(0, -5.5); ctx.lineTo(4.8, 4.8); ctx.lineTo(-4.8, 4.8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#05080f'; ctx.fillRect(-1, -1.6, 2, 3.4); },
  scan: (ctx, c) => { ctx.strokeStyle = c; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, 5, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 2.4, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
    ctx.fillStyle = c; ctx.fillRect(-0.7, -5.4, 1.4, 3); },
  train: (ctx, c) => { ctx.fillStyle = c; ctx.fillRect(-5, 2, 10, 2.6);
    ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-3.4, 2); ctx.lineTo(-3.4, -4.4); ctx.lineTo(3.4, -4.4); ctx.lineTo(3.4, 2); ctx.stroke(); },
  build: (ctx, c) => { ctx.save(); ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = c; ctx.fillRect(-1, -1.4, 7.4, 2.8); ctx.fillRect(-4.6, -4.6, 3.6, 9.2);
    ctx.restore();
    ctx.strokeStyle = c; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-5.4, 5.4); ctx.lineTo(1, 0); ctx.stroke(); },
  upgrade: (ctx, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(0, -5.5); ctx.lineTo(4.4, 0.4); ctx.lineTo(1.7, 0.4); ctx.lineTo(1.7, 5.4); ctx.lineTo(-1.7, 5.4); ctx.lineTo(-1.7, 0.4); ctx.lineTo(-4.4, 0.4); ctx.closePath(); ctx.fill(); },
};

// key -> [accent color, glyph fn]
const CHIP_SET = [
  ['chip-attack', '#ff7a6e', GL.attack], ['chip-stop', '#ffd23f', GL.stop], ['chip-deploy', '#6ee7a0', GL.deploy],
  ['chip-siege', '#ffb054', GL.siege], ['chip-burrow', '#d8a06a', GL.burrow], ['chip-stim', '#ff8fa3', GL.stim],
  ['chip-cloak', '#8f7dff', GL.cloak], ['chip-merge', '#ffe9a8', GL.merge], ['chip-mergeDark', '#d8ccff', GL.darkmerge],
  ['chip-mael', '#7dd3ff', GL.maelstrom], ['chip-guardian', '#a8e6a3', GL.guardian], ['chip-devourer', '#c9a0ff', GL.devourer],
  ['chip-caustic', '#b7e34a', GL.caustic], ['chip-storm', '#9fb8ff', GL.storm], ['chip-patrol', '#7fe0d4', GL.patrol],
  ['chip-hold', '#e0c98f', GL.hold], ['chip-scan', '#66d9ff', GL.scan], ['chip-train', '#4ea1ff', GL.train],
  ['chip-upgrade', '#ffd23f', GL.upgrade], ['chip-build', '#9fd68f', GL.build],
];

// v2.48 chip lookup: command id -> baked chip texture key ('' = no chip).
export const CHIPS = {
  attack: 'chip-attack', stop: 'chip-stop', deploy: 'chip-deploy',
  siege: 'chip-siege', burrow: 'chip-burrow', stim: 'chip-stim', cloak: 'chip-cloak',
  merge: 'chip-merge', mergeDark: 'chip-mergeDark', maelstrom: 'chip-mael',
  morphG: 'chip-guardian', morphD: 'chip-devourer', caustic: 'chip-caustic',
  storm: 'chip-storm', patrol: 'chip-patrol', hold: 'chip-hold', scan: 'chip-scan',
  train: 'chip-train', upgrade: 'chip-upgrade', build: 'chip-build',
};

export const CH = {
  SLICE: 10,

  // Bake every chrome texture once per Battle/Hud boot.
  init(scene) {
    bake(scene, 'chr-panel', 64, 48, (ctx, w, h) => panelFace(ctx, w, h, { tone: 'blue' }));
    bake(scene, 'chr-panel-dark', 64, 48, (ctx, w, h) => panelFace(ctx, w, h, { tone: 'dark' }));
    // topbar strip: wide, one rivet rhythm baked
    bake(scene, 'chr-topbar', 128, 34, (ctx, w, h) => {
      panelFace(ctx, w, h, { tone: 'dark' });
      ctx.globalAlpha = 0.16; ctx.fillStyle = '#6ea8ff';
      ctx.fillRect(6, h - 3, w - 12, 2); ctx.globalAlpha = 1;
    });
    // command card backing
    bake(scene, 'chr-card', 128, 96, (ctx, w, h) => {
      panelFace(ctx, w, h, { tone: 'blue' });
      ctx.globalAlpha = 0.10; ctx.strokeStyle = '#8fb8ff'; ctx.lineWidth = 1;
      for (let x = 12; x < w - 8; x += 16) { ctx.beginPath(); ctx.moveTo(x, 8); ctx.lineTo(x - 4, h - 8); ctx.stroke(); }
      ctx.globalAlpha = 1;
    });
    // resource icons (16px, chunky sci-fi readable at 1x)
    bake(scene, 'ico-mineral', 16, 16, (ctx, w, h) => {
      const g = ctx.createLinearGradient(2, 2, 14, 14);
      g.addColorStop(0, '#bfe3ff'); g.addColorStop(0.5, '#4ea1ff'); g.addColorStop(1, '#123a70');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(8, 1.5); ctx.lineTo(14, 6); ctx.lineTo(11.5, 14.5); ctx.lineTo(3, 13); ctx.lineTo(1.5, 5.5); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#0a1830'; ctx.lineWidth = 1; ctx.stroke();
      ctx.strokeStyle = '#eaf6ff'; ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.moveTo(5, 4.5); ctx.lineTo(8, 7.5); ctx.lineTo(7, 11); ctx.stroke(); ctx.globalAlpha = 1;
    });
    bake(scene, 'ico-gas', 16, 16, (ctx, w, h) => {
      const g = ctx.createRadialGradient(8, 9, 1, 8, 9, 7.5);
      g.addColorStop(0, '#eaffef'); g.addColorStop(0.4, '#3ad0a0'); g.addColorStop(1, '#0b4a3a');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(8, 9, 6.4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#06281f'; ctx.lineWidth = 1; ctx.stroke();
      // vapor wisps
      ctx.globalAlpha = 0.8; ctx.strokeStyle = '#c9ffe9'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(6, 2.4); ctx.quadraticCurveTo(8, 0.6, 10, 2.6); ctx.stroke();
      ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(6, 7, 2, Math.PI * 0.9, Math.PI * 1.7); ctx.stroke(); ctx.globalAlpha = 1;
    });
    bake(scene, 'ico-supply', 16, 16, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 3, 0, 14);
      g.addColorStop(0, '#ffe9a8'); g.addColorStop(1, '#b0761c');
      ctx.fillStyle = g;
      ctx.fillRect(2.5, 4.5, 11, 9);
      ctx.strokeStyle = '#3a2708'; ctx.lineWidth = 1; ctx.strokeRect(2.5, 4.5, 11, 9);
      ctx.fillStyle = '#3a2708'; ctx.fillRect(4, 2, 8, 2.6);
      ctx.strokeStyle = '#7d5410'; ctx.beginPath(); ctx.moveTo(8, 4.5); ctx.lineTo(8, 13.5); ctx.stroke();
      ctx.fillStyle = '#fff3cf'; ctx.fillRect(4, 6.5, 3, 1); ctx.fillRect(9, 10, 3, 1);
    });
    // shroud tile: fibrous fog pattern painted as OPAQUE pigment — the scene
    // layer's globalAlpha is the single source of transparency (pattern-alpha
    // stacking multiplied 0.16*0.55*0.85 ≈ opaque and was untestable)
    bake(scene, 'chr-shroud', 64, 64, (ctx, w, h) => {
      ctx.fillStyle = '#5b6678'; ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 0.16;
      for (let i = 0; i < 26; i++) {
        const x = Math.random() * w, y = Math.random() * h, r = 4 + Math.random() * 14;
        const g = ctx.createRadialGradient(x, y, 0.5, x, y, r);
        g.addColorStop(0, '#c2cede'); g.addColorStop(1, '#c2cede00');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 0.12; ctx.fillStyle = '#0a0e18';
      for (let i = 0; i < 14; i++) { const x = Math.random() * w, y = Math.random() * h; ctx.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 2); }
      ctx.globalAlpha = 1;
    });
    // v2.47 command cursor frames
    bake(scene, 'cur-normal', 24, 28, (ctx) => arrow(ctx, '#e8f1ff'));
    bake(scene, 'cur-attack', 24, 28, (ctx) => crosshair(ctx, '#ff5c5c'));
    bake(scene, 'cur-cast', 24, 28, (ctx) => crosshair(ctx, '#8f7dff'));
    bake(scene, 'cur-place', 24, 28, (ctx) => crosshair(ctx, '#6ee7a0'));
    // v2.48 command-card glyph chips: engraved 14px metal tiles, one per command.
    // Base plate is shared; glyph strokes are per-key vector art in accent color.
    for (const [key, col, draw] of CHIP_SET) {
      bake(scene, key, 14, 14, (ctx, w, h) => { chipBase(ctx, w, h, col); ctx.save(); ctx.translate(w / 2, h / 2); draw(ctx, col); ctx.restore(); });
    }
    // v2.48 tooltip 9-slice (dark panel, gold hairline inner edge)
    bake(scene, 'chr-tip', 64, 40, (ctx, w, h) => {
      panelFace(ctx, w, h, { tone: 'dark' });
      ctx.strokeStyle = '#c9a23f'; ctx.globalAlpha = 0.75; ctx.lineWidth = 1;
      ctx.strokeRect(3.5, 3.5, w - 7, h - 7); ctx.globalAlpha = 1;
    });
    // v2.48 killfeed row strip (low profile, tintable per team outcome)
    bake(scene, 'chr-kfrow', 96, 15, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#1b2738'); g.addColorStop(0.2, '#0a121e'); g.addColorStop(1, '#04070c');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#46586f'; ctx.fillRect(0, 0, w, 1);
      ctx.fillStyle = '#02040a'; ctx.fillRect(0, h - 1, w, 1);
      ctx.globalAlpha = 0.18; ctx.fillStyle = '#9fb6d4';
      for (let x = 14; x < w - 4; x += 12) ctx.fillRect(x, 2, 6, 1);
      ctx.globalAlpha = 1;
    });
    // v2.47 vignette frame (screen overlay, radial transparent->dark)
    bake(scene, 'grade-vignette', 512, 288, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.42, w / 2, h / 2, h * 0.98);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.62, 'rgba(4,7,14,0.10)');
      g.addColorStop(1, 'rgba(2,4,10,0.46)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    });
  },

  // Nine-slice a chrome panel. Native nineSlice (Phaser >=3.60) preserves the
  // rivet/bevel corners while stretching the face. Returns a thin wrapper so
  // callers don't care which path ran: { obj, resize(w,h), setTint(c) }.
  panel(scene, key, x, y, w, h, opts = {}) {
    const depth = opts.depth ?? 0;
    const mk = scene.add.nineslice || scene.add.nineSlice; // Phaser 3.90 ships lowercase 'nineslice'
    if (typeof mk === 'function') {
      const ns = mk.call(scene.add, x, y, key, undefined, w, h, CH.SLICE, CH.SLICE, CH.SLICE, CH.SLICE);
      ns.setOrigin(0, 0).setScrollFactor(0).setDepth(depth);
      if (opts.alpha !== undefined) ns.setAlpha(opts.alpha);
      return { obj: ns, native: true, resize(nw, nh) { if (ns.active) { ns.setSize(nw, nh); if (ns.updateSlices) ns.updateSlices(); } }, setTint(c) { if (ns.active && c !== undefined && ns.setTint) ns.setTint(c); } };
    }
    // safe fallback: a plain image, stretched (corners soften, never crashes)
    const img = scene.add.image(x, y, key).setOrigin(0, 0).setScrollFactor(0).setDepth(depth).setDisplaySize(w, h);
    if (opts.alpha !== undefined) img.setAlpha(opts.alpha);
    return { obj: img, native: false, resize(nw, nh) { if (img.active) img.setDisplaySize(nw, nh); }, setTint(c) { if (img.active && c !== undefined) img.setTint(c); } };
  },
};

function arrow(ctx, col) {
  ctx.clearRect(0, 0, 24, 28);
  ctx.beginPath(); ctx.moveTo(2, 1.5); ctx.lineTo(2, 21); ctx.lineTo(7, 16.5); ctx.lineTo(10.5, 25.5); ctx.lineTo(13.5, 24.4); ctx.lineTo(10, 15.8); ctx.lineTo(17, 15.8); ctx.closePath();
  ctx.fillStyle = '#0a0f18'; ctx.lineWidth = 3; ctx.strokeStyle = '#0a0f18'; ctx.stroke();
  const g = ctx.createLinearGradient(2, 0, 14, 24);
  g.addColorStop(0, '#ffffff'); g.addColorStop(1, col);
  ctx.fillStyle = g; ctx.fill();
  ctx.globalAlpha = 0.9; ctx.strokeStyle = '#bcd8ff'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(4, 5); ctx.lineTo(4, 16); ctx.stroke(); ctx.globalAlpha = 1;
}

function crosshair(ctx, col) {
  ctx.clearRect(0, 0, 24, 28);
  ctx.save(); ctx.translate(12, 14);
  ctx.lineWidth = 3; ctx.strokeStyle = '#0a0f18';
  ctx.beginPath(); ctx.arc(0, 0, 7.5, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 1.6; ctx.strokeStyle = col;
  ctx.beginPath(); ctx.arc(0, 0, 7.5, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, 1.6, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 4.4, Math.sin(a) * 4.4); ctx.lineTo(Math.cos(a) * 5.6, Math.sin(a) * 5.6); ctx.stroke(); }
  ctx.restore();
}
