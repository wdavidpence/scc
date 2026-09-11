const path = require('path');
const pwPath = require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0, 200)));
  await p.goto('http://127.0.0.1:4177/scc/', { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.setItem('starfront.cutseen.v1', '1'));
  await p.goto('http://127.0.0.1:4177/scc/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);
  await p.evaluate(async () => {
    const sm = window.__SCC2.scene;
    for (const s of sm.getScenes(true)) sm.stop(s.scene.key);
    await new Promise(r => setTimeout(r, 400));
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn', difficulty: 'normal' });
    await new Promise(r => setTimeout(r, 4000));
    // instrument: wrap deploySpotValid to log verdicts near the AI MCV
    const bs = sm.getScene('Battle');
    window.__dspLog = [];
    const orig = bs.deploySpotValid.bind(bs);
    bs.deploySpotValid = (def, x, y, team) => {
      const v = orig(def, x, y, team);
      if (team === 1) window.__dspLog.push({ t: +bs.gameTime.toFixed(1), x: Math.round(x), y: Math.round(y), v });
      return v;
    };
  });
  await p.waitForTimeout(15000);
  const r = await p.evaluate(() => {
    const bs = window.__SCC2.scene.getScene('Battle');
    const m = bs.units.find(u => u.team === 1 && u.def.mcv);
    return { primary: bs.buildings.some(x => x.team === 1 && x.def.primary && !x.dead), mcv: m ? { dead: m.dead, pos: [Math.round(m.x), Math.round(m.y)] } : null, log: (window.__dspLog || []).slice(-8), aiStateThink: bs.aiState ? bs.aiState.lastThink : null };
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})().catch(e => { console.error('FATAL', String(e).slice(0, 300)); process.exit(1); });
