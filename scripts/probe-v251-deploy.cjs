// probe: why does terran MCV deploy fail in fresh Battle start?
const path = require('path');
const pwPath = require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => console.log('PAGEERR', String(e)));
  await p.goto('http://127.0.0.1:4177/scc/', { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.setItem('starfront.cutseen.v1', '1'));
  await p.goto('http://127.0.0.1:4177/scc/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);
  const r = await p.evaluate(async () => {
    const sm = window.__SCC2.scene;
    for (const s of sm.getScenes(true)) sm.stop(s.scene.key);
    await new Promise(r => setTimeout(r, 400));
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn' });
    await new Promise(r => setTimeout(r, 6000));
    const b = window.__SCC2.scene.getScene('Battle');
    const units = b.units.map(u => ({ t: u.team, k: u.def.id || u.def.name, dead: !!u.dead }));
    const mcv = b.units.find(u => u.team === 0 && !u.dead && u.def.mcv);
    let dep = null;
    if (mcv) {
      const pd = mcv.def.deploysTo || 'commandCenter';
      const min = b.minerals[0];
      const snapOK = min ? b.placementValid(pd, min.x + 32, min.y) : null;
      if (min) {
        outer: for (let r2 = 2; r2 < 14; r2++) for (const [dx, dy] of [[r2,0],[-r2,0],[0,r2],[0,-r2]]) if (b.placementValid(pd, min.x + dx * 16, min.y + dy * 16)) { mcv.setPos(min.x + dx * 16, min.y + dy * 16); break outer; }
      }
      dep = { pd, snapOK, posOK: b.placementValid(pd, mcv.x, mcv.y) };
      try { b.deployMCV(mcv); } catch (e) { dep.err = String(e); }
      await new Promise(r => setTimeout(r, 2500));
      dep.built = b.buildings.filter(x => x.team === 0).map(x => x.def.id || x.def.name);
      dep.unitsAfter = b.units.filter(u => u.team === 0 && !u.dead).length;
    }
    return { units, mcvFound: !!mcv, dep, startMode: b.startMode || null, workers: b.players[0].idleWorkers };
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})().catch(e => { console.error('CRASH', e); process.exit(2); });
