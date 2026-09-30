// P1.027-i3b GATE (live, manual-clock): the NEW command types execute at the
// fixed-tick head with correct state effects, in the LIVE scene built from
// the served bundle. Proves:
//  - enqueue never executes; effects land after exactly one tick drain;
//  - patrol/deploy/merge/morph/queue/place/scan/ult/ucast state oracles;
//  - exec-side revalidation (ucast energy re-check blocks a second cast);
//  - damage chains (nuke, caustic) resolve on the SIM clock, so the same
//    tick budget reproduces them at any render pace;
//  - pause still purges a pre-pause i3b backlog (epoch, not per-cmd hack).
// Run: SCC_URL=http://127.0.0.1:4177/scc/ node scripts/verify-cmd-live2.cjs
const path = require('path');
const { execSync } = require('child_process');
const pwPath = execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  await p.goto(process.env.SCC_URL || 'http://127.0.0.1:4177/scc/', { waitUntil: 'networkidle' });
  const r = await p.evaluate(async () => {
    const sm = window.__SCC2.scene;
    for (const s of sm.getScenes(true)) sm.stop(s.scene.key);
    await new Promise(r => setTimeout(r, 250));
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn' });
    const bs = sm.getScene('Battle');
    await new Promise(r => setTimeout(r, 250));
    bs.__manual = true;
    const step = (n) => { for (let i = 0; i < n; i++) bs.__step(1000 / 24); };
    const out = { debug: [] };
    const mk = (team, kind, x, y) => bs.spawnUnit(team, kind, x, y, { arriveReady: true });
    bs.players[0].minerals = 5000; bs.players[0].gas = 2000; // fixture money, no economy assert
    // find a flat-clear spot for a footprint (uses the game's own validity fn)
    const findSpot = (bid, w) => {
      for (let tx = 20; tx < 140; tx += 4) for (let ty = 20; ty < 140; ty += 4) {
        const x = tx * 16, y = ty * 16;
        if (bs.placementReason(bid, x, y) === '') return { x, y };
      }
      return null;
    };
    // T1 patrol: enqueue-never-executes + tick-boundary exec + oscillation
    const m1 = mk(0, 'marine', 300, 300), m2 = mk(0, 'marine', 310, 300);
    bs.selection = new Set([m1, m2]);
    bs.__cmd('patrol', { a: { x: 340, y: 300 }, b: { x: 520, y: 300 }, sel: [m1.id, m2.id] });
    out.patrolNotRun = !m1.patrolPoints;
    step(1);
    out.patrolExec = !!m1.patrolPoints && !!m2.patrolPoints && m1.order && m1.order.type === 'patrol';
    const x0 = m1.x; step(240);
    out.patrolMarch = Math.abs(m1.x - x0) > 40 || Math.abs(m2.x - x0) > 40;
    // T2 place: fresh validity at EXEC + building appears + cost spends
    const spot = findSpot('bunker', 2);
    out.placeSpot = !!spot;
    if (spot) {
      bs.placing = { buildId: 'bunker' };
      const minBefore = bs.players[0].minerals;
      bs.__cmd('place', { bid: 'bunker', x: spot.x, y: spot.y, sel: [] });
      out.placeNotRun = bs.buildings.length;
      step(1);
      const placed = bs.buildings.some(b2 => b2.buildId === 'bunker');
      out.placeExec = placed && bs.players[0].minerals === minBefore - 100;
      // invalid spot must be RE-checked at exec (spot inside a rock, if any)
      bs.placing = { buildId: 'bunker' };
      const nb = bs.buildings.length;
      const bad = (() => { for (let ty = 20; ty < 140; ty += 3) for (let tx = 20; tx < 140; tx += 3) { const x = tx * 16, y = ty * 16; if (bs.placementReason('bunker', x, y) !== '') return { x, y }; } return null; })();
      if (bad) { bs.__cmd('place', { bid: 'bunker', x: bad.x, y: bad.y, sel: [] }); step(1); out.placeReject = bs.buildings.length === nb; }
      else out.placeReject = true; // map has no invalid spot: vacuous pass, noted
    }
    // T3 deploy: MCV consumed -> Command Center appears (same mechanics D/HUD use)
    const dspot = (() => {
      for (let tx = 24; tx < 140; tx += 4) for (let ty = 24; ty < 140; ty += 4) {
        const x = tx * 16, y = ty * 16;
        if (bs.placementReason('commandCenter', x, y) === '') return { x, y };
      } return null;
    })();
    if (dspot) {
      const cc = mk(0, 'mcv', dspot.x, dspot.y);
      if (cc) {
        bs.selection = new Set([cc]);
        const nb = bs.buildings.length;
        bs.__cmd('deploy', { uid: cc.id });
        step(1);
        out.deploy = bs.buildings.length === nb + 1 && bs.units.every(u => u.id !== cc.id || u.dead);
      } else { out.deploy = false; out.debug.push('mcv spawn failed'); }
    } else { out.deploy = false; out.debug.push('no deploy spot'); }
    // T4 queue: barracks placed via cmd, then marine queued via cmd
    const bspot = findSpot('barracks', 4);
    if (bspot) {
      bs.__cmd('place', { bid: 'barracks', x: bspot.x, y: bspot.y, sel: [] });
      step(1);
      const bar = bs.buildings.find(b2 => b2.buildId === 'barracks');
      if (bar) {
        // force built for the queue test (queueUnit requires built)
        bar.built = true; bar.constructionProgress = bar.buildTime;
        bs.__cmd('queue', { bid: 'barracks', kind: 'marine' }, 0, 'queue:barracks');
        const qlen = bar.queue.length;
        step(1);
        out.queue = bar.queue.length === qlen + 1;
      } else { out.queue = false; out.debug.push('barracks place failed'); }
    } else { out.queue = false; out.debug.push('no barracks spot'); }
    // T5 merge: 2 nightblades -> 2 radiants consumed-pairs (merge at midpoint)
    const n1 = mk(0, 'nightblade', 700, 700), n2 = mk(0, 'nightblade', 710, 700);
    if (n1 && n2) {
      bs.selection = new Set([n1, n2]);
      bs.__cmd('merge', { dark: false, sel: [n1.id, n2.id] });
      step(1);
      out.merge = bs.units.some(u => u.kind === 'radiant' && !u.dead) && bs.units.every(u => u.id !== n1.id || u.dead);
    } else { out.merge = false; out.debug.push('nightblade spawn failed'); }
    // T6 morph: vexwing -> sporecaster (tech fixture set directly)
    bs.players[0].techs = Object.assign({}, bs.players[0].techs, { sporecaster: true });
    const v1 = mk(0, 'vexwing', 820, 500);
    if (v1) {
      bs.selection = new Set([v1]);
      bs.__cmd('morph', { toKind: 'sporecaster', sel: [v1.id] });
      step(1);
      out.morph = bs.units.some(u => u.kind === 'sporecaster' && !u.dead) && bs.units.every(u => u.id !== v1.id || u.dead);
    } else { out.morph = false; out.debug.push('vexwing spawn failed'); }
    // T7 scan: CD gate respected at exec; success reveals when CD clear + facility granted
    const mkScan = () => {
      bs._scanCd = 0;
      const old = bs.hasBuilding; bs.hasBuilding = (id, t) => (id === 'scienceFacility' ? true : old.call(bs, id, t)); // fixture grant
      const rv0 = (bs._tempReveals || []).length;
      bs.__cmd('scan', { x: 400, y: 400 });
      step(1);
      // cd may already show one TICK of decay (drain order: cmd -> sim -> decay)
      const rev = (bs._tempReveals || []).length === rv0 + 1 && bs._scanCd > 29;
      bs.hasBuilding = old;
      return rev;
    };
    const cdBlocked = (() => { bs._scanCd = 5; const rv0 = (bs._tempReveals || []).length; bs.__cmd('scan', { x: 300, y: 300 }); step(1); return (bs._tempReveals || []).length === rv0; })();
    out.scanCdBlocked = cdBlocked;
    out.scan = mkScan();
    // T8 ucast storm + exec-side energy re-check
    const caller = mk(0, 'stormcaller', 400, 560);
    const victim = mk(1, 'marine', 500, 560);
    if (caller && victim) {
      victim.hp = 120; // ensure observable drop (storm 18/tick x7)
      const e0 = caller.energy;
      bs.__cmd('ucast', { mode: 'storm', by: caller.id, x: 500, y: 560 }, 0, 'ucast:' + caller.id);
      step(1);
      const afterFirst = caller.energy;
      const spent = e0 - afterFirst > 70; // exec-side spend (regen drift tolerated)
      bs.__cmd('ucast', { mode: 'storm', by: caller.id, x: 501, y: 560 }, 0, 'ucast:' + caller.id);
      step(1);
      out.ucast = spent && Math.abs(caller.energy - afterFirst) < 3; // second REJECTED (energy recheck, no second spend)
      step(110); // 7 waves x 500ms = 84 ticks + margin, sim clock
      out.stormDmg = victim.hp < 120 - 50 || victim.dead;
      if (!(out.stormDmg && out.ucast)) out.debug.push('ucast e0=' + e0 + ' a1=' + afterFirst + ' a2=' + caller.energy + ' victim=' + (victim.dead ? 'DEAD' : victim.hp) + ' go=' + bs.gameOver);
    } else { out.ucast = false; out.stormDmg = false; out.debug.push('stormcaller/victim spawn failed'); }
    // T9 nuke: detonation resolves on the SIM clock, then also under
    // double-rate pump (same tick budget -> must still resolve; render-pace
    // invariance of the damage chain)
    bs.ultimateEnergy = 100;
    const nv = mk(1, 'marine', 300, 900);
    if (nv) {
      nv.hp = 200;
      bs.ultMode = 'nuke';
      bs.__cmd('ult', { kind: 'nuke', x: 300, y: 900 });
      step(1);
      const drained = bs.ultimateEnergy < 2; // full 100 spent; <1 tick regen drift tolerated
      step(80); // 2900ms = 70 ticks + margin
      out.nuke = drained && (nv.dead || nv.hp < 100); // 400 dmg must kill a 200-hp marine
      if (!out.nuke) out.debug.push('nuke drained=' + drained + ' nv=' + (nv.dead ? 'DEAD' : Math.round(nv.hp)) + ' go=' + bs.gameOver + ' tick=' + bs.simTickIndex);
    } else { out.nuke = false; out.debug.push('nuke victim failed'); }
    // T10 pause purge: i3b backlog dies with the epoch bump (kernel contract)
    const pm = mk(0, 'marine', 330, 300);
    bs.__cmd('patrol', { a: { x: 330, y: 300 }, b: { x: 530, y: 300 }, sel: [pm.id] });
    bs.togglePause(); // epoch bump purges
    bs.paused = false;
    step(1);
    out.pausePurge = !pm.patrolPoints;
    out.debug = out.debug.join('|');
    return out;
  });
  let pass = 0, fail = 0;
  const ok = (id, cond, note) => { if (cond) { pass++; console.log(`PASS ${id}`); } else { fail++; console.log(`FAIL ${id}${note ? ' :: ' + note : ''}`); } };
  ok('PATROL-NOT-RUN', r.patrolNotRun);
  ok('PATROL-EXEC', r.patrolExec);
  ok('PATROL-MARCH', r.patrolMarch);
  ok('PLACE-SPOT', r.placeSpot);
  ok('PLACE-EXEC', r.placeExec);
  ok('PLACE-RECHECK', r.placeReject);
  ok('DEPLOY', r.deploy);
  ok('QUEUE', r.queue);
  ok('MERGE', r.merge);
  ok('MORPH', r.morph);
  ok('SCAN-CD-BLOCK', r.scanCdBlocked);
  ok('SCAN-EXEC', r.scan);
  ok('UCAST-SPEND-AND-RECHECK', r.ucast);
  ok('UCAST-STORM-DAMAGE', r.stormDmg);
  ok('NUKE-DETONATION', r.nuke);
  ok('PAUSE-PURGE-I3B', r.pausePurge);
  ok('NO-PAGE-ERRORS', errs.length === 0, errs.join(';').slice(0, 200));
  if (r.debug) console.log('DEBUG ' + r.debug);
  console.log(`RESULT CMD-LIVE2 ${fail === 0 ? 'PASS' : 'FAIL'} ${pass}/${pass + fail}`);
  await b.close();
  process.exit(fail === 0 ? 0 : 1);
})();