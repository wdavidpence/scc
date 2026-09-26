// Enumerate __MISSING-texture objects globally: what are they, where, count.
const path = require('path');
const { execSync } = require('child_process');
const pwPath = execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(process.env.SCC_URL || 'http://127.0.0.1:4177/scc/', { waitUntil: 'networkidle' });
  const out = await p.evaluate(async () => {
    const sm = window.__SCC2.scene;
    for (const s of sm.getScenes(true)) sm.stop(s.scene.key);
    await new Promise(r => setTimeout(r, 400));
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn' });
    await new Promise(r => setTimeout(r, 30000));
    const bt = sm.getScene('Battle');
    const miss = {};
    bt.children.list.forEach(go => {
      const k = go.texture && go.texture.key;
      if (k === '__MISSING') {
        const sig = (go.type||go.constructor.name)+'|'+Math.round(go.width)+'x'+Math.round(go.height)+'|d'+go.depth;
        (miss[sig] = miss[sig] || { n:0, sample:[] }).n++;
        if (miss[sig].sample.length < 4) miss[sig].sample.push(Math.round(go.x)+','+Math.round(go.y));
      }
    });
    // also: does any real unit/building show __MISSING? check a few known containers
    const unitMiss = bt.units.filter(u => u.sprite && u.sprite.texture && u.sprite.texture.key === '__MISSING').length;
    const bldMiss = (bt.buildings||[]).filter(b => b.sprite && b.sprite.texture && b.sprite.texture.key === '__MISSING').length;
    return { missBySig: miss, totalMissing: Object.values(miss).reduce((a,b)=>a+b.n,0), unitMiss, bldMiss, unitCount: bt.units.length };
  });
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();