// Visual wow audit v2.57: title + battle captures, sharpness (Laplacian var),
// color richness, sprite-motion census between frames.
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const pwPath = process.env.PW || '/Users/davidpence/.hermes/node/lib/node_modules';
const { chromium } = require(path.join(pwPath, 'playwright'));
const OUT = '/Users/davidpence/scc-work/qa-shots/wow257';
fs.mkdirSync(OUT, { recursive: true });

const sharpnessAndPalette = () => {
  // runs in page: snapshot canvas to offscreen, compute Laplacian variance + unique colors
  const g = window.__SCC2;
  const cv = g.canvas;
  const off = document.createElement('canvas');
  off.width = cv.width; off.height = cv.height;
  const ctx = off.getContext('2d');
  ctx.drawImage(cv, 0, 0);
  const d = ctx.getImageData(0, 0, off.width, off.height).data;
  const W = off.width, H = off.height;
  const gray = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    gray[i] = 0.299 * d[i*4] + 0.587 * d[i*4+1] + 0.114 * d[i*4+2];
  }
  // Laplacian variance (sharpness proxy)
  let sum = 0, sum2 = 0, n = 0;
  for (let y = 1; y < H-1; y++) {
    for (let x = 1; x < W-1; x++) {
      const i = y*W+x;
      const l = 4*gray[i] - gray[i-1] - gray[i+1] - gray[i-W] - gray[i+W];
      sum += l; sum2 += l*l; n++;
    }
  }
  const mean = sum/n, lapVar = sum2/n - mean*mean;
  // color buckets
  const buckets = new Map();
  let nonBlack = 0;
  for (let i = 0; i < W*H; i += 7) {
    const r = d[i*4]>>4, gg = d[i*4+1]>>4, b = d[i*4+2]>>4;
    const k = (r<<8)|(gg<<4)|b;
    buckets.set(k, (buckets.get(k)||0)+1);
    if (d[i*4]+d[i*4+1]+d[i*4+2] > 40) nonBlack++;
  }
  const top = [...buckets.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8)
    .map(([k,c])=>({hex:'#'+k.toString(16).padStart(6,'0'), pct:+(100*c/ (W*H/7)).toFixed(1)}));
  // pixel scale: is the game canvas backing store 1:1 with CSS (crisp) or upscaled (blurry)?
  const rect = cv.getBoundingClientRect();
  const pxScale = +(cv.width / rect.width).toFixed(2);
  return { W, H, cssW: Math.round(rect.width), cssH: Math.round(rect.height), pxScale,
    lapVar: Math.round(lapVar), uniqueColors4bit: buckets.size, nonBlackPct: +(100*nonBlack/(W*H/7)).toFixed(1), top };
};

(async () => {
  const url = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.setItem('starfront.cutseen.v1', '1'));
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);

  const shot = async (name) => {
    const du = await p.evaluate(() => new Promise(r => window.__SCC2.renderer.snapshot(img => r(img.src))));
    fs.writeFileSync(path.join(OUT, name), Buffer.from(du.split(',')[1], 'base64'));
    console.log('shot', name);
  };

  // TITLE
  await shot('01-title.png');
  console.log('TITLE_METRICS', JSON.stringify(await p.evaluate(sharpnessAndPalette)));

  // direct boot Battle per harness recipe
  await p.evaluate(async () => {
    const sm = window.__SCC2.scene;
    for (const s of sm.getScenes(true)) sm.stop(s.scene.key);
    await new Promise(r => setTimeout(r, 400));
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn' });
    sm.start('Hud', { race: 'terran' });
    await new Promise(r => setTimeout(r, 5000));
    const bt = window.__SCC2.scene.getScene('Battle');
    if (bt.polish) bt.polish._cheap = () => true;
    const mcv = bt.units.find(u => u && u.def && u.team === 0 && !u.dead && u.def.mcv);
    if (mcv) {
      const pd = mcv.def.deploysTo || 'commandCenter';
      const min = bt.minerals[0];
      if (min) {
        outer: for (let rr = 2; rr < 14; rr++) {
          for (const dd of [[rr,0],[-rr,0],[0,rr],[0,-rr]]) {
            if (bt.placementValid(pd, min.x + dd[0]*16, min.y + dd[1]*16)) { mcv.setPos(min.x + dd[0]*16, min.y + dd[1]*16); break outer; }
          }
        }
      }
      bt.deployMCV(mcv);
      await new Promise(r => setTimeout(r, 3000));
    }
  });
  await shot('02-base.png');
  console.log('BASE_METRICS', JSON.stringify(await p.evaluate(sharpnessAndPalette)));

  // spawn combat: units + attack
  await p.evaluate(async () => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const cam = bt.cameras.main;
    const mid = cam.midPoint;
    for (let i = 0; i < 6; i++) bt.spawnUnit(0, 'marine', mid.x - 80 + i*24, mid.y - 40 + (i%2)*20, { arriveReady: true });
    for (let i = 0; i < 5; i++) bt.spawnUnit(1, 'skarling', mid.x + 100 + i*20, mid.y + 10 + (i%3)*14, { arriveReady: true });
    const mine = bt.units.filter(u => u && !u.dead && u.team === 0 && !u.def.worker);
    const foes = bt.units.filter(u => u && !u.dead && u.team === 1);
    for (const u of mine) { const f = foes[Math.floor(Math.random()*foes.length)]; if (f) bt.issueGroupMove([u], f.x, f.y, true); }
  });
  await p.waitForTimeout(3000);
  await shot('03-combat.png');

  // motion census: sprite positions across two frames
  const motion = await p.evaluate(async () => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const snap = () => bt.children.list.filter(o => o.active && o.type === 'Sprite' && o.visible)
      .map(o => ({ k: o.texture.key, x: Math.round(o.x*10)/10, y: Math.round(o.y*10)/10, f: o.frame.name, a: +o.alpha.toFixed(2), s: +o.scale.toFixed(2) }));
    const a = snap();
    await new Promise(r => setTimeout(r, 800));
    const c = snap();
    let moved = 0, animChanged = 0, fx = 0;
    for (const s of c) {
      const prev = a.find(o => o.k === s.k && Math.abs(o.x - s.x) < 60 && Math.abs(o.y - s.y) < 60);
      if (!prev) { fx++; continue; }
      if (prev.x !== s.x || prev.y !== s.y) moved++;
      if (prev.f !== s.f) animChanged++;
    }
    return { spritesNow: c.length, moved, animChanged, newFx: fx,
      tweens: bt.tweens.getTweens().filter(t => t.isActive()).length };
  });
  console.log('MOTION', JSON.stringify(motion));
  console.log('COMBAT_METRICS', JSON.stringify(await p.evaluate(sharpnessAndPalette)));

  // zoom-in closeup for crispness judgment
  await p.evaluate(async () => {
    const bt = window.__SCC2.scene.getScene('Battle');
    bt.cameras.main.setZoom(2.2);
    await new Promise(r => setTimeout(r, 900));
  });
  await shot('04-zoom22.png');
  console.log('ZOOM_METRICS', JSON.stringify(await p.evaluate(sharpnessAndPalette)));

  console.log('ERRS', JSON.stringify(errs.slice(0, 5)));
  await b.close();
  console.log('DONE');
})().catch(e => { console.log('E', String(e).slice(0, 300)); process.exit(1); });
