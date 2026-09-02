// Pixel forensics via compositor screenshot + offline PNG decode (WebGL canvas has no getImageData readback).
const PW = '/Users/davidpence/.hermes/node/lib/node_modules/playwright';
const zlib = require('zlib');
const fs = require('fs');
const { chromium } = require(PW);

function decodePNG(buf) {
  let off = 8, w = 0, h = 0, bpp = 4;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off); const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.slice(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bpp = data[8] === 6 ? 4 : 3; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(w * h * bpp);
  const stride = w * bpp;
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[pos++];
    const line = raw.slice(pos, pos + stride); pos += stride;
    const prev = y > 0 ? out.slice((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (f === 1) v = v + a; else if (f === 2) v = v + b; else if (f === 3) v = v + ((a + b) >> 1); else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      out[y * stride + x] = v & 255;
    }
  }
  return { w, h, bpp, px: out };
}

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  await page.goto('http://127.0.0.1:5175/index2.html', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { try { localStorage.setItem('starfront.cutseen.v1', '1'); } catch (e) {} });
  await page.evaluate(() => {
    const g = window.__SCC2;
    const T = g.scene.getScene('Title');
    g.scene.start('Battle', { race: 'terran', enemyRace: 'zerg', difficulty: 'easy', campaign: T.camp, mission: { n: 1, name: 'TEST', waves: [], pool: 'basic', mods: {} } });
  });
  await page.waitForTimeout(3000);
  // pin camera onto crate[3], freeze input
  const pos = await page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle');
    const cam = g.cameras.main;
    // pick crate + critter already inside the live worldView
    const vis = (x, y) => x > cam.worldView.x + 40 && x < cam.worldView.right - 40 && y > cam.worldView.y + 40 && y < cam.worldView.bottom - 40;
    let c = g.crates.find(cr => vis(cr.x, cr.y)) || g.crates[0];
    let cr = g.critters.find(x => vis(x.x, x.y)) || g.critters[0];
    if (c === g.crates[0] || !vis(c.x, c.y)) { c.x = cam.midPoint.x; c.y = cam.midPoint.y; c.spr.setPosition(c.x, c.y); }
    cr.x = c.x + 50; cr.y = c.y; cr.vx = 0; cr.vy = 0; cr.spr.setPosition(cr.x, cr.y);
    const sx = Math.round((c.x - cam.worldView.x) * cam.zoom), sy = Math.round((c.y - cam.worldView.y) * cam.zoom);
    return { sx, sy, zoom: cam.zoom, canvas: [g.game.canvas.width, g.game.canvas.height] };
  });
  await page.waitForTimeout(120);
  const shot = '/Users/davidpence/scc-work/verify/v216-crate-shot.png';
  await page.screenshot({ path: shot });
  const img = decodePNG(fs.readFileSync(shot));
  const scale = img.w / pos.canvas[0];
  const px = (x, y) => { const i = (Math.round(y * scale) * img.w + Math.round(x * scale)) * img.bpp; return [img.px[i], img.px[i + 1], img.px[i + 2]]; };
  let crateHit = null;
  for (let dy = -14; dy <= 14 && crateHit === null; dy += 1)
    for (let dx = -14; dx <= 14; dx += 1) {
      const [r, g_, b] = px(pos.sx + dx, pos.sy + dy);
      if (r > 60 && r > b + 25 && g_ > b) { crateHit = [pos.sx + dx, pos.sy + dy, r, g_, b]; break; }
    }
  let critHit = null;
  const csx = pos.sx + Math.round(50 * pos.zoom), csy = pos.sy;
  let critBase = null;
  for (let dy = -10; dy <= 10 && critHit === null; dy += 1)
    for (let dx = -10; dx <= 10; dx += 1) {
      const [r, g_, b] = px(csx + dx, csy + dy);
      // brown: r>g>b, warm-dominant
      if (r > g_ + 12 && g_ >= b && r > 40) { critHit = [dx, dy, r, g_, b]; break; }
    }
  console.log('CRATE_PIXEL', JSON.stringify({ crateHit, critHit, pos }));
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(2); });
