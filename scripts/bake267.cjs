// v2.67 bake: generated flat-background sprites -> transparent, bbox-cropped,
// exact-footprint PNGs consumed by the existing aiKit/terrainArt pipelines.
const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'ai267');
const OUT_U = path.join(__dirname, '..', 'public', 'assets', 'ai', 'u');
const OUT_T = path.join(__dirname, '..', 'public', 'assets', 'ai267');
fs.mkdirSync(OUT_U, { recursive: true });
fs.mkdirSync(OUT_T, { recursive: true });

// key: [sourcePng (relative to SRC dir), w, h] — sizes = on-screen footprints
const UNIT_TARGET = {
  battlecruiser: [56, 36], ark: [56, 36], tank: [34, 20], ballista: [36, 22],
  wraith: [36, 18], dropship: [36, 18], tremorclaw: [38, 22], burrower: [42, 18],
  skywarden: [42, 22], sporecaster: [32, 28], corroder: [30, 24], voidlance: [38, 16],
  razorspine: [26, 16], sentinel: [26, 26], mcv: [40, 28], broodmatron: [42, 30],
  atlaswalker: [40, 30],
};
const LARGE = ['tank', 'ballista', 'wraith', 'battlecruiser', 'dropship', 'tremorclaw', 'skywarden', 'burrower', 'sentinel', 'ark', 'voidlance', 'sporecaster', 'corroder', 'razorspine', 'tremor'];
function unitSize(k) {
  if (UNIT_TARGET[k]) return UNIT_TARGET[k];
  return LARGE.includes(k) ? [34, 34] : [24, 24];
}

// key -> source file
const JOBS = {};
for (const k of ['airstinger', 'ark', 'artificer', 'atlaswalker', 'ballista', 'battlecruiser',
  'bladeguard', 'broodmatron', 'burrower', 'caller', 'corroder', 'drone', 'dropship', 'duster',
  'ghost', 'incinerator', 'marine', 'mcv', 'medic', 'nblade', 'radiant', 'razor', 'rigger',
  'sentinel', 'skarling', 'skywarden', 'sporecaster', 'tank', 'tremor', 'umbral', 'vex',
  'voidlance', 'wraith']) JOBS[k] = [k, ...unitSize(k)];
// aliases (kind names whose icon art reuses another sprite)
JOBS.stormcaller = ['caller', ...unitSize('stormcaller')];
JOBS.nightblade = ['nblade', ...unitSize('nightblade')];
JOBS.vexwing = ['vex', ...unitSize('vexwing')];
JOBS.razorspine = ['razor', ...unitSize('razorspine')];
JOBS.tremorclaw = ['tremor', ...unitSize('tremorclaw')];
JOBS.skarnling = ['skarling', ...unitSize('skarnling')];
// terrain (2x of current footprints for real detail)
JOBS['mtn-0'] = ['mtn-0', 88, 76];
JOBS['mtn-1'] = ['mtn-1', 88, 68];
JOBS['mtn-2'] = ['mtn-2', 80, 60];
JOBS['rock-hi0'] = ['rock-0', 52, 32];
JOBS['rock-hi1'] = ['rock-1', 52, 32];
JOBS['rock-hi2'] = ['rock-0', 48, 30];

function loadRGB(src) {
  return PNG.sync.read(fs.readFileSync(path.join(SRC, src + '.png')));
}

// Flood-key: kill background-connected pixels whose color is within tol of the
// corner color. Works for both flat-black-bg and already-transparent sources.
function keycut(png) {
  const { width: W, height: H, data } = png;
  if (data[3] === 0) return png; // already transparent
  // global key: any near-black pixel becomes transparent (art palettes are midtone)
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 0 && data[i] <= 26 && data[i + 1] <= 26 && data[i + 2] <= 26) data[i + 3] = 0;
  }
  return png;
}

function bbox(png) {
  const { width: W, height: H, data } = png;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (data[(y * W + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) throw new Error('empty after keycut');
  return [x0 - 1 < 0 ? 0 : x0 - 1, y0 - 1 < 0 ? 0 : y0 - 1, Math.min(W, x1 + 2) - (x0 - 1 < 0 ? 0 : x0 - 1), Math.min(H, y1 + 2) - (y0 - 1 < 0 ? 0 : y0 - 1)];
}

function boxResize(src, sx, sy, sw, sh, dw, dh) {
  const out = new PNG({ width: dw, height: dh });
  const ratioX = sw / dw, ratioY = sh / dh;
  for (let oy = 0; oy < dh; oy++) {
    for (let ox = 0; ox < dw; ox++) {
      const x0 = Math.floor(ox * ratioX), x1 = Math.max(x0 + 1, Math.min(sw, Math.ceil((ox + 1) * ratioX)));
      const y0 = Math.floor(oy * ratioY), y1 = Math.max(y0 + 1, Math.min(sh, Math.ceil((oy + 1) * ratioY)));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
        const i = ((yy + sy) * src.width + (xx + sx)) * 4;
        // premultiplied average so transparent pixels don't bleed colors
        const al = src.data[i + 3] / 255;
        r += src.data[i] * al; g += src.data[i + 1] * al; b += src.data[i + 2] * al; a += src.data[i + 3];
        n++;
      }
      const o = (oy * dw + ox) * 4;
      if (!n || a === 0) { out.data[o + 3] = 0; continue; }
      out.data[o] = Math.round(r / (n || 1)); out.data[o + 1] = Math.round(g / (n || 1));
      out.data[o + 2] = Math.round(b / (n || 1)); out.data[o + 3] = Math.round(a / (n || 1));
    }
  }
  return out;
}

let fail = 0;
for (const [key, [src, tw, th]] of Object.entries(JOBS)) {
  try {
    const png = keycut(loadRGB(src));
    const [bx, by, bw, bh] = bbox(png);
    // fit bbox into target box, then paste centered on exact target-size canvas
    const sc = Math.min(tw / bw, th / bh);
    const rw = Math.max(1, Math.round(bw * sc)), rh = Math.max(1, Math.round(bh * sc));
    const resized = boxResize(png, bx, by, bw, bh, rw, rh);
    const final = new PNG({ width: tw, height: th });
    final.data.fill(0);
    const offX = Math.floor((tw - rw) / 2), offY = Math.floor((th - rh) / 2);
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
      const s = (y * rw + x) * 4, d = ((y + offY) * tw + (x + offX)) * 4;
      final.data[d] = resized.data[s]; final.data[d + 1] = resized.data[s + 1];
      final.data[d + 2] = resized.data[s + 2]; final.data[d + 3] = resized.data[s + 3];
    }
    const isTerrain = key.startsWith('mtn-') || key.startsWith('rock-hi');
    const dir = isTerrain ? OUT_T : OUT_U;
    fs.writeFileSync(path.join(dir, key + '.png'), PNG.sync.write(final));
    const opq = (() => { let c = 0; for (let i = 3; i < final.data.length; i += 4) if (final.data[i] > 10) c++; return (100 * c / (tw * th)).toFixed(0); })();
    console.log(`OK  ${key} -> ${dir.split('/').pop()}/${key}.png ${tw}x${th} fill=${opq}%`);
  } catch (e) { console.log(`FAIL ${key}: ${e.message}`); fail++; }
}
console.log(fail ? `BAKE-FAIL ${fail}` : 'BAKE-OK');