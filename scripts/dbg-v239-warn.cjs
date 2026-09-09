const path = require('path');
const pwPath = require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('http://127.0.0.1:4177/scc/', { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.setItem('starfront.cutseen.v1', '1'));
  await p.goto('http://127.0.0.1:4177/scc/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  const r = await p.evaluate(async () => {
    const g = window.__SCC2; const sm = g.scene;
    for (const s of sm.getScenes(true)) sm.stop(s.scene.key);
    await new Promise(r => setTimeout(r, 400));
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn', difficulty: 'normal' });
    await new Promise(r => setTimeout(r, 4000));
    const bs = sm.getScene('Battle');
    const names = bs.textures.getTextureKeys();
    const u = bs.units;
    const kids = u && u.getChildren ? u.getChildren() : null;
    const sample = (kids || []).slice(0, 4).map(x => ({ team: x.team, tex: x.sprite ? x.sprite.texture.key : (x.texture ? x.texture.key : '?') }));
    return {
      fxExists: ['explosion', 'rubble', 'smoke'].map(k => { const t = bs.textures.get(k); return k + ':' + t.getSourceImage().width + 'x' + t.getSourceImage().height; }),
      unitsType: u ? u.constructor.name : 'none', unitsLen: u ? u.length : -1, kids: kids ? kids.length : -1, sample,
      afxBaked: names.filter(k => k.startsWith('afx-src-')).length,
    };
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
