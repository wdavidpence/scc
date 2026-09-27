// Dump every ADD-blend sprite in/near the player base cluster + check
// whether the loaded bundle is the tamed one (bglow alpha target 0.13).
const path = require('path');
const { execSync } = require('child_process');
const pwPath = execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(process.env.SCC_URL || 'http://127.0.0.1:4177/scc/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  const r = await p.evaluate(async () => {
    const sm = window.__SCC2.scene;
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn' });
    await new Promise(r => setTimeout(r, 3000));
    const bt = sm.getScene('Battle');
    const mcv = bt.units.find(u => u.def.mcv && u.team === 0 && !u.dead);
    bt.deployMCV(mcv, true);
    await new Promise(r => setTimeout(r, 30000)); // let workers build it out
    const out = { tamed: !!bt.__tamed || null, lights: [] };
    const bb = bt.buildings.filter(b2 => b2.team === 0);
    out.base = bb.map(b2 => ({ k: b2.def.name || b2.defKey, x: Math.round(b2.x), y: Math.round(b2.y), built: b2.constructionProgress }));
    const cx = bb.reduce((a, b2) => a + b2.x, 0) / Math.max(1, bb.length);
    const cy = bb.reduce((a, b2) => a + b2.y, 0) / Math.max(1, bb.length);
    if (bt.lightLayer) {
      for (const ch of bt.lightLayer.list) {
        if (!ch.active) continue;
        const d = Math.hypot(ch.x - cx, ch.y - cy);
        if (d < 140) out.lights.push({ tex: ch.texture?.key, tint: ch.tintTopLeft?.toString(16), a: +ch.alpha.toFixed(2), s: +ch.scaleX.toFixed(2), d: Math.round(d) });
      }
    }
    // any other ADD images near cluster outside lightLayer?
    let others = 0;
    bt.children.list.forEach(o => {
      if (o !== bt.lightLayer && o.active && o.blendMode === 1 && o.type === 'Image') {
        if (Math.hypot(o.x - cx, o.y - cy) < 140) others++;
      }
    });
    out.addOthers = others;
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
