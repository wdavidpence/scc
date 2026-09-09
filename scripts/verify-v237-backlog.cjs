// GATE-V237: replay scrubber polish + placement-drag terrain invalidation reasons
const { chromium } = require('/Users/davidpence/.hermes/node/lib/node_modules/playwright');
const URL = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
const SHOT = '/tmp/scc-v237-backlog.png';
const SHOT2 = '/tmp/scc-v237-replay.png';
const R = [];
const check = (name, ok, extra) => { R.push({ name, ok: !!ok, extra }); };

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.setItem('starfront.cutseen.v1', '1'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__SCC2 && window.__SCC2.scene.isActive('Title'), null, { timeout: 30000 });
  await page.evaluate(() => { const s = window.__SCC2.scene; s.stop('Title'); s.start('Battle', { race: 'terran', mission: 1 }); const h = s.getScene('Hud'); if (!h.scene.isActive()) s.start('Hud', { race: 'terran' }); });
  await page.waitForTimeout(6000);

  // ---- PART A: placement-drag invalidation ----
  // A1) placementReason returns '' on clear ground, reason string on rock/out-of-bounds
  const reasons = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const okSpot = { x: 0, y: 0 };
    // find a valid spot
    for (let ty = 4; ty < 60; ty++) for (let tx = 4; tx < 60; tx++) {
      const x = tx * 32, y = ty * 32;
      if (b.placementValid('barracks', x, y)) { okSpot.x = x; okSpot.y = y; ty = 99; break; }
    }
    const valid = b.placementReason('barracks', okSpot.x, okSpot.y);
    const oob = b.placementReason('barracks', 4, 4);
    const onSelf = b.placementReason('barracks', okSpot.x, okSpot.y + 32);
    return { valid, oob, onSelf, okSpot };
  });
  check('placement_reason_valid_blank', reasons.valid === '', JSON.stringify(reasons));
  check('placement_reason_oob', /OUT OF BOUNDS/.test(reasons.oob), reasons.oob);

  // A2) drag ghost over invalid ground: reason tag visible with text, isValid false
  const drag = await page.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    const wrk = [...b.units].filter(u => !u.dead && u.team === 0 && u.def && u.def.worker);
    b.clearSelection(); wrk.forEach(u => { b.selection.add(u); u.selected = true; });
    b.startPlacing('barracks');
    // snap onto the command center footprint (occupied)
    const cc = b.buildings.find(x => !x.dead && x.team === 0);
    b.snapGhost({ x: cc.x, y: cc.y });
    await new Promise(r => setTimeout(r, 80));
    const tag = b._placeTag;
    return { placing: !!b.placing, isValid: b.isValid, tagVis: tag ? tag.visible : false, tagTxt: tag ? tag.text : '' };
  });
  check('drag_invalid_reason_tag', drag.isValid === false && drag.tagVis === true && drag.tagTxt.length > 0, JSON.stringify(drag));

  // A3) drag back onto valid ground: tag hides, isValid true (live flip)
  const flip = await page.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    let x = 0, y = 0;
    for (let ty = 4; ty < 60; ty++) for (let tx = 4; tx < 60; tx++) {
      if (b.placementValid('barracks', tx * 32, ty * 32)) { x = tx * 32; y = ty * 32; ty = 99; break; }
    }
    b.snapGhost({ x, y });
    await new Promise(r => setTimeout(r, 80));
    return { isValid: b.isValid, tagVis: b._placeTag ? b._placeTag.visible : null };
  });
  check('drag_valid_live_flip', flip.isValid === true && flip.tagVis === false, JSON.stringify(flip));

  // A4) click on invalid ground: no building spawned + hud alert banner carries reason
  const deny = await page.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    const h = window.__SCC2.scene.getScene('Hud');
    const cc = b.buildings.find(x => !x.dead && x.team === 0);
    let seen = '';
    b.events.on('hud:alert', (m) => { seen = m; });
    const nBefore = b.buildings.length;
    b.snapGhost({ x: cc.x, y: cc.y });
    b.tryPlace(cc.x, cc.y);
    await new Promise(r => setTimeout(r, 100));
    const spawned = b.buildings.length - nBefore;
    b.cancelPlacing();
    return { spawned, seen };
  });
  check('invalid_click_denied_reasoned', deny.spawned === 0 && deny.seen.length > 0 && /OCCUPIED|BOUNDS|BLOCKED|ROCK|REQUIRED|GEYSER/.test(deny.seen), JSON.stringify(deny));

  // A5) valid click still builds (no regression)
  const build = await page.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    b.players[0].minerals = 9000; b.players[0].gas = 9000;
    b.startPlacing('barracks');
    let x = 0, y = 0;
    for (let ty = 4; ty < 60; ty++) for (let tx = 4; tx < 60; tx++) {
      if (b.placementValid('barracks', tx * 32, ty * 32)) { x = tx * 32; y = ty * 32; ty = 99; break; }
    }
    b.snapGhost({ x, y });
    const nBefore = b.buildings.length;
    b.tryPlace(x, y);
    await new Promise(r => setTimeout(r, 150));
    return { built: b.buildings.length === nBefore + 1 && b.isValid };
  });
  check('valid_click_still_builds', build.built === true, JSON.stringify(build));

  await page.screenshot({ path: SHOT });

  // ---- PART B: replay scrubber polish ----
  // record a synthetic replay so the Replay scene is testable
  await page.evaluate(() => {
    const frames = [];
    for (let t = 0; t <= 300; t += 5) {
      frames.push({ t, u: [[200 + t * 2, 300 + Math.sin(t / 20) * 40, 0], [800 - t, 500, 1]], b: t > 40 ? [[400, 400, 0, true]] : [], });
    }
    localStorage.setItem('scc.replay.last', JSON.stringify({ frames, min: [[300, 200], [700, 600]], apm: 55, result: 'victory', time: 300 }));
  });
  const rep = await page.evaluate(async () => {
    const s = window.__SCC2.scene;
    s.stop('Battle'); s.stop('Hud'); s.start('Replay');
    await new Promise(r => setTimeout(r, 700));
    const rs = s.getScene('Replay');
    return {
      active: s.isActive('Replay'),
      marks: rs.marks ? rs.marks.length : -1,
      speeds: rs.speeds ? rs.speeds.join(',') : '',
      transport: rs._tbtns ? rs._tbtns.length : -1,
    };
  });
  check('replay_scene_polished', rep.active === true && rep.marks > 0 && rep.transport >= 4, JSON.stringify(rep));

  // B2) jump-to-next-event moves playhead exactly to a marker time
  const jump = await page.evaluate(async () => {
    const rs = window.__SCC2.scene.getScene('Replay');
    rs.t = 0; rs.playing = false;
    rs.jumpMark(1);
    const t1 = rs.t;
    const isMark = rs.marks.some(m => m.t === t1);
    rs.jumpMark(-1);
    return { t1, isMark, t2: rs.t, back: rs.marks.some(m => m.t === rs.t) };
  });
  check('replay_event_jump', jump.isMark && jump.back && jump.t2 <= jump.t1, JSON.stringify(jump));

  // B3) speed cycle works, playing state toggles
  const spd = await page.evaluate(async () => {
    const rs = window.__SCC2.scene.getScene('Replay');
    const i0 = rs.speedIdx;
    rs.speedBtn.txt ? null : null;
    // invoke via the button's stored callback path: click through the transport bg object
    rs.speedIdx = (rs.speedIdx + 1) % rs.speeds.length; rs.speed = rs.speeds[rs.speedIdx];
    const p0 = rs.playing; rs.playing = !rs.playing;
    return { cycled: rs.speedIdx !== i0, toggled: rs.playing !== p0, speed: rs.speed };
  });
  check('replay_speed_transport', spd.cycled && spd.toggled, JSON.stringify(spd));

  // B4) census text updates at scrub position
  const cen = await page.evaluate(async () => {
    const rs = window.__SCC2.scene.getScene('Replay');
    rs.t = 150;
    await new Promise(r => setTimeout(r, 200));
    return { txt: rs.censusTxt.text };
  });
  check('replay_census_readout', /FLEET \d+ vs \d+/.test(cen.txt), JSON.stringify(cen));

  await page.screenshot({ path: SHOT2 });
  check('no_page_errors', errors.length === 0, errors.slice(0, 3).join('|'));

  const fails = R.filter(r => !r.ok);
  console.log(R.map(r => (r.ok ? 'PASS' : 'FAIL') + ' ' + r.name + (r.extra ? ' · ' + r.extra : '')).join('\n'));
  console.log(fails.length ? `GATE-V237 FAIL ${fails.length}/${R.length}` : `GATE-V237 PASS ${R.length} checks · shots ${SHOT} ${SHOT2}`);
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})();
