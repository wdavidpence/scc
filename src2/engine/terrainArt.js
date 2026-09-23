// terrainArt — high-fidelity mountain / rock / cliff sprites for SCC.
// Everything is baked ONCE at 2x supersample into native canvases with
// LINEAR filtering (same pipeline the AAA building studio uses), drawn with
// deterministic hash-PRNGs so every map variant is stable across reloads.
import Phaser from 'phaser';

function hashRng(seedStr) {
  // FNV-1a → mulberry32
  let h = 0x811c9dc5;
  for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  let s = h >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function blobPoints(rng, cx, baseY, w, h, n) {
  // Closed blob around an ellipse anchor at (cx, baseY - h/2); bottom edge pinned near baseY.
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const rr = 0.78 + rng() * 0.26;
    pts.push([cx + Math.cos(a) * w * 0.5 * rr, baseY - h * 0.5 + Math.sin(a) * h * 0.5 * rr]);
  }
  return pts;
}

function strokeBlob(ctx, pts, style, lw) {
  ctx.strokeStyle = style; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath(); ctx.stroke();
}

// One shaded rock body: dark silhouette outline, vertical gradient fill,
// crevice lines, rim light on the sun-facing (upper) edges.
function drawRock(ctx, rng, cx, baseY, w, h, pal) {
  const pts = blobPoints(rng, cx, baseY, w, h, 9 + ((rng() * 4) | 0));

  // contact shadow
  ctx.fillStyle = 'rgba(6,8,12,0.30)';
  ctx.beginPath(); ctx.ellipse(cx, baseY - 1, w * 0.52, Math.max(2, h * 0.16), 0, 0, Math.PI * 2); ctx.fill();

  // body: gradient light top -> dark bottom
  const g = ctx.createLinearGradient(0, baseY - h, 0, baseY);
  g.addColorStop(0, pal.hi); g.addColorStop(0.45, pal.mid); g.addColorStop(1, pal.lo);
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = g; ctx.fill();

  // crevices: short jagged cracks running downhill
  ctx.save();
  ctx.clip();
  const nCrack = 2 + ((rng() * 3) | 0);
  for (let c = 0; c < nCrack; c++) {
    let x = cx + (rng() - 0.5) * w * 0.6;
    let y = baseY - h * (0.45 + rng() * 0.4);
    ctx.strokeStyle = 'rgba(14,17,23,0.55)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let k = 0; k < 3; k++) { x += (rng() - 0.3) * 5; y += h * 0.16; ctx.lineTo(x, y); }
    ctx.stroke();
    // lit crack edge
    ctx.strokeStyle = 'rgba(210,222,236,0.14)';
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let k = 0; k < 3; k++) { x += (rng() - 0.3) * 4; y += h * 0.12; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  // sub-surface tint band along the bottom for weight
  const gg = ctx.createLinearGradient(0, baseY - h * 0.32, 0, baseY);
  gg.addColorStop(0, 'rgba(0,0,0,0)'); gg.addColorStop(1, 'rgba(4,6,10,0.38)');
  ctx.fillStyle = gg; ctx.fillRect(cx - w, baseY - h, w * 2, h);
  ctx.restore();

  // dark outline keeps the silhouette crisp even with LINEAR filtering
  strokeBlob(ctx, pts, pal.edge, 1.4);

  // rim light: stroke only the upper-half edges (light from NW)
  ctx.save();
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.clip();
  ctx.strokeStyle = pal.rim || 'rgba(224,236,248,0.5)'; ctx.lineWidth = 1.1;
  // trace the top chain: find vertex chain from leftmost-top to rightmost-top
  const top = pts.filter((p) => p[1] < baseY - h * 0.28);
  if (top.length > 1) {
    ctx.beginPath(); ctx.moveTo(top[0][0], top[0][1]);
    for (let i = 1; i < top.length; i++) ctx.lineTo(top[i][0], top[i][1]);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMountainVariant(ctx, W, H, variant, rng) {
  const baseY = H - 2;
  if (variant === 0) {
    // grand massif — snow-dusted grey peaks
    drawRock(ctx, rng, W * 0.46, baseY, W * 0.62, H * 0.92, { hi: '#77839a', mid: '#48525f', lo: '#242b36', edge: '#11151b', rim: 'rgba(232,240,250,0.6)' });
    drawRock(ctx, rng, W * 0.74, baseY, W * 0.4, H * 0.6, { hi: '#68748a', mid: '#3e4754', lo: '#1f252e', edge: '#0e1217', rim: 'rgba(224,234,248,0.5)' });
    drawRock(ctx, rng, W * 0.2, baseY - 1, W * 0.3, H * 0.42, { hi: '#5e6a80', mid: '#3a4350', lo: '#1c222b', edge: '#0d1015' });
  } else if (variant === 1) {
    // warm granite cluster
    drawRock(ctx, rng, W * 0.36, baseY, W * 0.5, H * 0.74, { hi: '#8a7460', mid: '#57483a', lo: '#2e251d', edge: '#17110c', rim: 'rgba(240,226,204,0.5)' });
    drawRock(ctx, rng, W * 0.66, baseY, W * 0.44, H * 0.86, { hi: '#7a6450', mid: '#4c3f33', lo: '#282018', edge: '#150f0a', rim: 'rgba(236,220,196,0.5)' });
    drawRock(ctx, rng, W * 0.14, baseY - 1, W * 0.24, H * 0.4, { hi: '#75604c', mid: '#4a3d31', lo: '#261f18', edge: '#130e0a' });
  } else {
    // low mossy rocks — dark with vegetation accents
    drawRock(ctx, rng, W * 0.4, baseY, W * 0.66, H * 0.6, { hi: '#5c6e5c', mid: '#3a4639', lo: '#1e241e', edge: '#0e1210', rim: 'rgba(200,226,200,0.45)' });
    drawRock(ctx, rng, W * 0.72, baseY - 1, W * 0.34, H * 0.44, { hi: '#54644f', mid: '#374234', lo: '#1c221b', edge: '#0d110d' });
    // moss tufts
    for (let i = 0; i < 4; i++) {
      const x = W * (0.15 + rng() * 0.7), y = baseY - 2 - rng() * 4;
      ctx.strokeStyle = 'rgba(96,150,96,0.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rng() * 3 - 1.5, y - 3 - rng() * 2); ctx.stroke();
    }
  }
}

function drawRockVariant(ctx, W, H, variant, rng) {
  // single small boulder; sits on a 16px tile, ~10px tall
  const pals = [
    { hi: '#6d7889', mid: '#454e5b', lo: '#232932', edge: '#10141a', rim: 'rgba(220,232,246,0.5)' },
    { hi: '#7d6a56', mid: '#50432f', lo: '#2a231a', edge: '#140f0a', rim: 'rgba(236,214,186,0.45)' },
    { hi: '#57685a', mid: '#39473b', lo: '#1f2820', edge: '#0e130f', rim: 'rgba(196,224,200,0.4)' },
  ];
  drawRock(ctx, rng, W * 0.5, H - 1.5, W * 0.86, H * (0.58 + variant * 0.06), pals[variant % 3]);
  if (variant === 2) {
    for (let i = 0; i < 3; i++) {
      const x = W * (0.25 + rng() * 0.5), y = H - 3 - rng() * 3;
      ctx.strokeStyle = 'rgba(96,150,96,0.55)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rng() * 2 - 1, y - 2 - rng() * 2); ctx.stroke();
    }
  }
}

function bakeSS(scene, key, w, h, drawFn, seedStr) {
  if (scene.textures.exists(key)) { // v2.67: preloaded baked PNG wins; ensure smooth filtering
    try { scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR); } catch (e) { /* older phaser */ }
    return;
  }
  const SS = 2;
  const c = document.createElement('canvas');
  c.width = w * SS; c.height = h * SS;
  const ctx = c.getContext('2d');
  ctx.scale(SS, SS);
  drawFn(ctx, w, h, hashRng(seedStr));
  scene.textures.addCanvas(key, c);
  try { scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR); } catch (e) { /* older phaser */ }
  const src = scene.textures.get(key).getSourceImage();
  if (src) src.style.imageRendering = 'auto';
}

// Creates mtn-0/1/2 (mountain cluster sprites, ~44x38 native -> drawn at
// 1.1-1.45 scale) and rock-hi0/1/2 (boulders, 26x16 native -> ~1.25x).
export function createTerrainArt(scene) {
  if (!scene.textures.exists('mtn-0')) bakeSS(scene, 'mtn-0', 44, 38, (x, w, h, rng) => drawMountainVariant(x, w, h, 0, rng), 'mtn-0');
  if (!scene.textures.exists('mtn-1')) bakeSS(scene, 'mtn-1', 44, 34, (x, w, h, rng) => drawMountainVariant(x, w, h, 1, rng), 'mtn-1');
  if (!scene.textures.exists('mtn-2')) bakeSS(scene, 'mtn-2', 40, 30, (x, w, h, rng) => drawMountainVariant(x, w, h, 2, rng), 'mtn-2');
  if (!scene.textures.exists('rock-hi0')) bakeSS(scene, 'rock-hi0', 26, 16, (x, w, h, rng) => drawRockVariant(x, w, h, 0, rng), 'rock-hi0');
  if (!scene.textures.exists('rock-hi1')) bakeSS(scene, 'rock-hi1', 26, 16, (x, w, h, rng) => drawRockVariant(x, w, h, 1, rng), 'rock-hi1');
  if (!scene.textures.exists('rock-hi2')) bakeSS(scene, 'rock-hi2', 24, 15, (x, w, h, rng) => drawRockVariant(x, w, h, 2, rng), 'rock-hi2');
}