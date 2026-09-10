// v2.39 AI art kit loader — overlays Pollinations Flux art (original-IP prompts) on top
// of the procedural texture keys so entities/HUD consume them unchanged.
// Manifest lists only what actually got generated; missing entries fall back to procedural art.
import MANIFEST from '../data/ai-manifest.json';

export function preloadAIKit(scene) {
  for (const k of MANIFEST.u) if (!scene.textures.exists('au-src-' + k)) scene.load.image('au-src-' + k, 'assets/ai/u/' + k + '.png');
  for (const k of MANIFEST.b) { scene.load.image('ab-src-' + k, 'assets/ai/b/' + k + '.png'); }
  for (const k of MANIFEST.fx) if (!scene.textures.exists('afx-src-' + k)) scene.load.image('afx-src-' + k, 'assets/ai/fx/' + k + '.png');
}

const TEAM_COL = [[78, 161, 255], [255, 123, 46], [255, 79, 163]];

// 2.39 footprints in world tiles (16px each) — mirrors scripts/process-ai-deep-v239.py
const BUILDING_FP = { commandCenter:[5,4], supplyDepot:[2,2], refinery:[4,3], barracks:[4,3], factory:[4,3], machineShop:[2,2],
  starport:[4,3], controlTower:[2,2], academy:[3,3], missileTurret:[2,2], engineeringBay:[2,2], scienceFacility:[4,3],
  bunker:[2,2], broodNest:[4,4], geneForge:[3,3], blightNode:[2,2], clawPit:[3,3], spineWarren:[3,3], aerie:[3,3],
  hive:[4,4], deepWarren:[4,4], tremorCavern:[3,3], stingerColony:[2,2], gasSiphon:[4,3],
  aegis:[5,4], conduit:[2,2], essenceTap:[4,3], portal:[3,3], fabricator:[4,3], synapseCore:[3,3], runeworks:[3,3],
  psiVault:[3,3], convocation:[3,3], skyPortal:[4,3], skyAnchor:[3,3], lanceTurret:[2,2], forge:[2,2] };

// replace procedural u-*/b-* keys with AI-baked team variants + rebuild walk frames
const UNIT_TARGET = { // desired on-screen footprint px at zoom1 (16px world tiles) — generous for AI detail
  battlecruiser: [56, 36], ark: [56, 36], tank: [34, 20], ballista: [36, 22], wraith: [36, 18], dropship: [36, 18],
  tremorclaw: [38, 22], burrower: [42, 18], skywarden: [42, 22], sporecaster: [32, 28], corroder: [30, 24], voidlance: [38, 16],
  razorspine: [26, 16], sentinel: [26, 26], mcv: [40, 28], broodmatron: [42, 30], atlaswalker: [40, 30], aegisX: 0 };
const UNIT_DEFAULT = { small: 24, medium: 28, large: 34 };
export const EMBLEM_PAD = 7; // v2.42: canvas pad added around emblem-baked units; consumers must compensate scale
const LARGE = ['tank','ballista','wraith','battlecruiser','dropship','tremorclaw','skywarden','burrower','sentinel','ark','voidlance','sporecaster','corroder','razorspine'];
const MED = ['duster','bladeguard','nightblade','umbral','ghost','marine','incinerator','stormcaller','radiant','skarling','skarnling','artificer','vexwing','airstinger','drone','medic','rigger'];

function bakeSprite(scene, srcKey, outKey, team, target, emblem) {
  if (scene.textures.exists(outKey)) scene.textures.remove(outKey);
  const src = scene.textures.get(srcKey).getSourceImage();
  // downscale body to target px (top-down footprints), then team wash + rim glow
  const sc = Math.min(target[0] / src.width, target[1] / src.height);
  const W = Math.max(8, Math.round(src.width * sc)), H = Math.max(8, Math.round(src.height * sc));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  x.drawImage(src, 0, 0, W, H);
  if (team < 0) { scene.textures.addCanvas(outKey, c); return; } // passthrough (fx)
  const d = x.getImageData(0, 0, W, H);
  const p = d.data;
  const tc = TEAM_COL[team]; const tm = (tc[0] + tc[1] + tc[2]) / 3;
  const A = 0.34;
  for (let i = 0; i < p.length; i += 4) {
    const al = p[i + 3]; if (al < 20) continue;
    const r = p[i], g = p[i + 1], b = p[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const tr = lum * (tc[0] / tm) * 0.78 + r * 0.22;
    const tg = lum * (tc[1] / tm) * 0.78 + g * 0.22;
    const tb = lum * (tc[2] / tm) * 0.78 + b * 0.22;
    const mix = (al / 255) * A;
    p[i] = r * (1 - mix) + tr * mix; p[i + 1] = g * (1 - mix) + tg * mix; p[i + 2] = b * (1 - mix) + tb * mix;
  }
  x.putImageData(d, 0, 0);
  // rim glow: tinted silhouette offsets behind
  const rim = document.createElement('canvas'); rim.width = W; rim.height = H;
  const rx = rim.getContext('2d');
  rx.drawImage(c, 0, 0);
  rx.globalCompositeOperation = 'source-in';
  // v2.41: strong team rim (was 0.5 — units read as blobs against fog at 24px)
  rx.fillStyle = `rgba(${tc[0]},${tc[1]},${tc[2]},0.88)`; rx.fillRect(0, 0, W, H);
  const out = document.createElement('canvas'); 
  // v2.42 faction emblems: instant faction language under every unit footprint
  const E = emblem ? 7 : 0;
  out.width = W + E * 2; out.height = H + E * 2;
  const ox = out.getContext('2d');
  if (emblem && team >= 0) {
    const cx = out.width / 2, cy = out.height / 2, R = Math.max(W, H) / 2 + E - 2;
    if (team === 1) { // skarn: jagged organic spore-pad
      ox.fillStyle = `rgba(${tc[0]},${tc[1]},${tc[2]},0.30)`;
      ox.beginPath();
      for (let a = 0; a <= 72; a++) {
        const th = a / 72 * Math.PI * 2, rr = R * (0.82 + 0.18 * Math.sin(th * 7 + W * 0.5));
        const px = cx + Math.cos(th) * rr * (W / Math.max(W, H)), py = cy + Math.sin(th) * rr * (H / Math.max(W, H));
        a ? ox.lineTo(px, py) : ox.moveTo(px, py);
      }
      ox.closePath(); ox.fill();
    } else if (team === 0) { // terran: angular hex plate
      const pw = Math.min(out.width - 2, W * 0.94 + 4), ph = Math.min(out.height - 2, H * 0.88 + 4);
      ox.beginPath();
      ox.moveTo(cx - pw / 2, cy - ph * 0.15);
      ox.lineTo(cx - pw * 0.32, cy - ph / 2);
      ox.lineTo(cx + pw * 0.32, cy - ph / 2);
      ox.lineTo(cx + pw / 2, cy - ph * 0.15);
      ox.lineTo(cx + pw * 0.34, cy + ph / 2);
      ox.lineTo(cx - pw * 0.34, cy + ph / 2);
      ox.closePath();
      ox.fillStyle = `rgba(${tc[0]},${tc[1]},${tc[2]},0.24)`;
      ox.fill();
      ox.strokeStyle = `rgba(${tc[0]},${tc[1]},${tc[2]},0.55)`; ox.lineWidth = 1; ox.stroke();
    } else { // auraxis: crystal ring + ticks
      ox.strokeStyle = `rgba(${tc[0]},${tc[1]},${tc[2]},0.5)`; ox.lineWidth = 1.5;
      ox.beginPath(); ox.arc(cx, cy, R * 0.9, 0, Math.PI * 2); ox.stroke();
      for (let i = 0; i < 8; i++) {
        const th = i / 8 * Math.PI * 2;
        ox.beginPath();
        ox.moveTo(cx + Math.cos(th) * R * 0.72, cy + Math.sin(th) * R * 0.72);
        ox.lineTo(cx + Math.cos(th) * R * 1.0, cy + Math.sin(th) * R * 1.0);
        ox.stroke();
      }
    }
  }
  const OFF = Math.max(1, Math.round(Math.min(W, H) / 28));
  // full 8-dir spread so the outline is unbroken at small sizes
  for (const [dx, dy] of [[-OFF, 0], [OFF, 0], [0, -OFF], [0, OFF], [-OFF, -OFF], [OFF, OFF], [-OFF, OFF], [OFF, -OFF]]) ox.drawImage(rim, E + dx, E + dy);
  ox.drawImage(c, E, E);
  scene.textures.addCanvas(outKey, out);
  // emblem ring overflows body footprint by design; sprite scale stays 1:1 (body=target px, ring=+7px marker)
}

export function applyAIKit(scene) {
  let n = 0;
  for (const k of MANIFEST.u) {
    const srcKey = 'au-src-' + k;
    if (!scene.textures.exists(srcKey)) continue;
    const src = scene.textures.get(srcKey).getSourceImage();
    const tgt = UNIT_TARGET[k] || [LARGE.includes(k) ? UNIT_DEFAULT.large : UNIT_DEFAULT.small, LARGE.includes(k) ? UNIT_DEFAULT.large : UNIT_DEFAULT.small];
    // v2.45.2: supersample 2x — was baking at exactly target px so any display >1 zoom upscaled blurry
    const TGT2 = [tgt[0] * 2, tgt[1] * 2];
    for (let team = 0; team < 3; team++) {
      try { bakeSprite(scene, srcKey, `u-${k}-t${team}`, team, TGT2, true); n++; } catch (e) { console.warn('ai-kit unit', k, String(e)); }
      // emblem pad adds 7px each side to the baked canvas; preserve the v2.42 total screen footprint
      const fin = scene.textures.get(`u-${k}-t${team}`).getSourceImage();
      const body = fin.width - EMBLEM_PAD * 2;
      if (body > 0) { scene.__emblemScale = scene.__emblemScale || {}; scene.__emblemScale[`u-${k}-t${team}`] = (tgt[0] + EMBLEM_PAD * 2) / fin.width; }
      // regenerate walk frames from the baked sprite (cut halves, offset legs)
      const finished = scene.textures.get(`u-${k}-t${team}`).getSourceImage();
      const FW = finished.width, FH = finished.height;
      const mid = Math.round(FH * 0.62);
      for (let fr = 0; fr < 3; fr++) {
        const key = `u-${k}-t${team}-w${fr}`;
        if (scene.textures.exists(key)) scene.textures.remove(key);
        const frC = document.createElement('canvas'); frC.width = FW; frC.height = FH;
        const fctx = frC.getContext('2d');
        fctx.imageSmoothingEnabled = false;
        const dx = fr === 1 ? 0 : (fr === 0 ? 1 : -1);
        const bob = fr === 2 ? -1 : 0;
        fctx.drawImage(finished, 0, 0, FW, mid, 0, bob, FW, mid);
        fctx.drawImage(finished, 0, mid, FW, FH - mid, dx, mid, FW, FH - mid);
        scene.textures.addCanvas(key, frC);
        if (scene.__emblemScale && scene.__emblemScale[`u-${k}-t${team}`]) scene.__emblemScale[key] = scene.__emblemScale[`u-${k}-t${team}`];
      }
    }
  }
  for (const k of MANIFEST.b) {
    const srcKey = 'ab-src-' + k;
    if (!scene.textures.exists(srcKey)) continue;
    // footprints baked at 64px/tile; world tiles are 16 -> display target = tiles*16
    const src = scene.textures.get(srcKey).getSourceImage();
    const fp = BUILDING_FP[k] || [4, 3];
    const tgt = [fp[0] * 32, fp[1] * 32]; // art3d parity: 2x supersampled, displayed at 1:1
    for (let team = 0; team < 3; team++) {
      try { bakeSprite(scene, srcKey, `b-${k}-t${team}`, team, tgt); n++; } catch (e) { console.warn('ai-kit bld', k, String(e)); }
    }
    if (scene.textures.exists('ab-src-' + k + '_geyser')) {
      for (let team = 0; team < 3; team++) {
        try { bakeSprite(scene, 'ab-src-' + k + '_geyser', `b-${k}-geyser-t${team}`, team, tgt); } catch (e) { /* optional */ }
      }
    }
  }
  // FX passthrough at fixed world sizes
  const FXS = { explosion: 40, inferno: 44, rubble: 40, crater: 40, smoke: 16 };
  for (const k of MANIFEST.fx) {
    if (scene.textures.exists('afx-src-' + k)) {
      try { if (scene.textures.exists(k)) scene.textures.remove(k); bakeSprite(scene, 'afx-src-' + k, k, 0, [FXS[k] || 40, FXS[k] || 40]); n++; } catch (e) { console.warn('ai-kit fx', k, String(e)); }
    }
  }
  return n;
}
