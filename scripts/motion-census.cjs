// motion census on bt.units + sprite texture audit (native bake size vs display scale)
const path = require('path');
const { execSync } = require('child_process');
const pwPath = '/Users/davidpence/.hermes/node/lib/node_modules';
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await p.goto('http://127.0.0.1:4177/scc/', { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.setItem('starfront.cutseen.v1', '1'));
  await p.goto('http://127.0.0.1:4177/scc/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);
  await p.evaluate(async () => {
    const sm = window.__SCC2.scene;
    for (const s of sm.getScenes(true)) sm.stop(s.scene.key);
    await new Promise(r => setTimeout(r, 400));
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn' });
    sm.start('Hud', { race: 'terran' });
    await new Promise(r => setTimeout(r, 5000));
    const bt = window.__SCC2.scene.getScene('Battle');
    const mid = bt.cameras.main.midPoint;
    for (let i = 0; i < 6; i++) bt.spawnUnit(0, 'marine', mid.x - 80 + i*24, mid.y - 40 + (i%2)*20, { arriveReady: true });
    for (let i = 0; i < 5; i++) bt.spawnUnit(1, 'skarling', mid.x + 100 + i*20, mid.y + 10 + (i%3)*14, { arriveReady: true });
    const mine = bt.units.filter(u => u && !u.dead && u.team === 0 && !u.def.worker);
    const foes = bt.units.filter(u => u && !u.dead && u.team === 1);
    for (const u of mine) { const f = foes[Math.floor(Math.random()*foes.length)]; if (f) bt.issueGroupMove([u], f.x, f.y, true); }
  });
  await p.waitForTimeout(2500);
  const res = await p.evaluate(async () => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const snap = () => bt.units.filter(u => u && !u.dead && u.sprite).map(u => ({ id: u.id, x: +u.x.toFixed(1), y: +u.y.toFixed(1), f: u.sprite.frame.name, sc: +u.sprite.scale.toFixed(2), tex: u.sprite.texture.key, tw: u.sprite.width, th: u.sprite.height }));
    const a = snap();
    await new Promise(r => setTimeout(r, 900));
    const c = snap();
    let moved = 0, anim = 0;
    const details = [];
    for (const s of c) {
      const prev = a.find(o => o.id === s.id);
      if (!prev) continue;
      const dx = Math.abs(prev.x - s.x), dy = Math.abs(prev.y - s.y);
      if (dx > 0.5 || dy > 0.5) moved++;
      if (prev.f !== s.f) anim++;
      details.push({ tex: s.tex, f: s.f, disp: s.tw + 'x' + s.th, sc: s.sc, d: Math.round(Math.hypot(prev.x-s.x, prev.y-s.y)) });
    }
    // texture atlas inventory
    const texs = [];
    for (const k of bt.textures.getTextureKeys()) {
      const t = bt.textures.get(k);
      texs.push({ k, frames: t.frameTotal, w: t.source[0]?.width, h: t.source[0]?.height });
    }
    return { units: c.length, moved, animChanged: anim, sample: details.slice(0, 12), texCount: texs.length,
      bigAtlases: texs.filter(t => t.frames > 1).slice(0, 12) };
  });
  console.log(JSON.stringify(res, null, 1));
  await b.close();
})().catch(e => { console.log('E', String(e).slice(0, 200)); process.exit(1); });
