/**
 * scripts/verify-air-ground-routing.cjs - P0.010 real-browser routing gate
 *
 * Spawns actual BattleScene units, gives both the same order, and records the
 * resulting plans and movement trails. The only speed changes are on these
 * test instances so the verifier remains practical in headless Chromium.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

let chromium;
try { chromium = require('playwright').chromium; }
catch { chromium = require(path.join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')).chromium; }

const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.woff': 'font/woff', '.woff2': 'font/woff2'
};

function createServer(stageDir) {
  return http.createServer((req, res) => {
    let reqPath = req.url.replace(/^\/scc\/?/, '').split('?')[0];
    if (!reqPath || reqPath === '/') reqPath = 'index.html';
    const fp = path.join(stageDir, reqPath);
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
      fs.createReadStream(fp).pipe(res);
    } else { res.writeHead(404); res.end(); }
  });
}

async function runVerifier(targetUrl, screenshotPath) {
  const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--enable-gpu'] });
  const pageErrors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', error => pageErrors.push(error.message || String(error)));
    await page.goto(targetUrl, { waitUntil: 'load' });
    await page.evaluate(() => localStorage.setItem('starfront.cutseen.v1', '1'));
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__SCC2?.scene?.isActive('Title'), null, { timeout: 20000 });

    await page.evaluate(() => {
      const sm = window.__SCC2.scene;
      for (const sc of sm.getScenes(true)) if (sc.scene.key !== 'Boot' && sc.scene.key !== 'Preload') sm.stop(sc.scene.key);
      sm.start('Battle', { race: 'terran', enemyRace: 'skarn', difficulty: 'normal' });
    });
    await page.waitForFunction(() => {
      const b = window.__SCC2?.scene?.getScene('Battle');
      return b && b.nav && b.terrainCanvas && b.valleys && b.elev;
    }, null, { timeout: 20000 });

    const report = await page.evaluate(async () => {
      const b = window.__SCC2.scene.getScene('Battle');
      const nav = b.nav;
      const tileSize = nav.tileSize || 16;
      const { w, h } = nav;

      const valleySet = new Set();
      for (const cell of Array.from(b.valleys || [])) {
        if (Array.isArray(cell) && cell.length >= 2) valleySet.add(`${cell[0]},${cell[1]}`);
      }
      const cellCenter = (tx, ty) => ({ tx, ty, x: (tx + 0.5) * tileSize, y: (ty + 0.5) * tileSize });
      const inBounds = (tx, ty) => tx >= 0 && ty >= 0 && tx < w && ty < h;
      const walkable = (tx, ty) => inBounds(tx, ty) && nav.walkable(tx, ty);

      function sampleSegments(points) {
        const samples = [];
        for (let i = 0; i < points.length - 1; i++) {
          const a = points[i], z = points[i + 1];
          const d = Math.hypot(z.x - a.x, z.y - a.y);
          const steps = Math.max(1, Math.ceil(d / (tileSize * 0.5)));
          for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            const point = { x: a.x + (z.x - a.x) * t, y: a.y + (z.y - a.y) * t };
            const prev = samples[samples.length - 1];
            if (!prev || Math.hypot(point.x - prev.x, point.y - prev.y) > 0.01) samples.push(point);
          }
        }
        if (!samples.length && points.length) samples.push(points[0]);
        return samples;
      }

      function classify(points) {
        const samples = sampleSegments(points);
        const cells = samples.map(point => {
          const tx = Math.floor(point.x / tileSize), ty = Math.floor(point.y / tileSize);
          const valid = inBounds(tx, ty);
          const key = `${tx},${ty}`;
          return {
            x: point.x, y: point.y, tx, ty, valid,
            solid: valid ? nav.solid[nav.idx(tx, ty)] !== 0 : true,
            walkable: valid && nav.walkable(tx, ty),
            valley: valleySet.has(key)
          };
        });
        return {
          samples,
          solid: cells.filter(cell => cell.solid),
          nonwalkable: cells.filter(cell => !cell.walkable),
          valleys: cells.filter(cell => cell.valley),
          cells
        };
      }

      function pathPoints(start, path) {
        const points = [start, ...path.map(point => ({ x: point.x, y: point.y }))];
        return points.filter((point, index) => index === 0 || Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) > 0.01);
      }

      function length(points) {
        let total = 0;
        for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
        return total;
      }

      function directCandidateStats(start, target) {
        const direct = classify([start, target]);
        return { direct, directLength: Math.hypot(target.x - start.x, target.y - start.y) };
      }

      function candidateCells(minTx, maxTx, minTy, maxTy, step) {
        const cells = [];
        for (let ty = minTy; ty <= maxTy; ty += step) {
          for (let tx = minTx; tx <= maxTx; tx += step) {
            if (walkable(tx, ty)) cells.push(cellCenter(tx, ty));
          }
        }
        return cells;
      }

      // Search opposite map quadrants in a stable order. The direct-solid and
      // valley tests select the actual ridge endpoints rather than a fixture.
      function chooseEndpoints() {
        const bands = [
          { source: [8, Math.floor(w * 0.38), 8, Math.floor(h * 0.38)], target: [Math.ceil(w * 0.62), w - 9, Math.ceil(h * 0.62), h - 9], step: 4 },
          { source: [4, Math.floor(w * 0.46), 4, Math.floor(h * 0.46)], target: [Math.ceil(w * 0.54), w - 5, Math.ceil(h * 0.54), h - 5], step: 2 }
        ];
        for (const band of bands) {
          const sources = candidateCells(...band.source, band.step);
          const targets = candidateCells(...band.target, band.step);
          for (const start of sources) {
            for (const target of targets) {
              const directResult = directCandidateStats(start, target);
              if (!directResult.direct.solid.length) continue;
              const path = nav.findPath(start.x, start.y, target.x, target.y, 0, -1, 15000);
              if (!path || path.partial || !path.length) continue;
              const groundPoints = pathPoints(start, path);
              const ground = classify(groundPoints);
              if (ground.solid.length || ground.nonwalkable.length || !ground.valleys.length) continue;
              const groundLength = length(groundPoints);
              if (groundLength <= directResult.directLength + 1) continue;
              return {
                start, target, direct: directResult.direct, path,
                ground: ground, directLength: directResult.directLength, groundLength
              };
            }
          }
        }
        return null;
      }

      const endpoints = chooseEndpoints();
      if (!endpoints) throw new Error('could not algorithmically find opposite-ridge endpoints with a direct solid crossing and legal valley route');

      // The test instances are real spawned units. Freeze unrelated units so
      // AI activity and crowd separation cannot perturb the paired order.
      for (const unit of b.units) {
        unit.order = null;
        unit.state = 'idle';
        unit.path = [];
        unit.speed = 0;
      }
      const marine = b.spawnUnit(0, 'marine', endpoints.start.x, endpoints.start.y, { arriveReady: true });
      const wraith = b.spawnUnit(0, 'wraith', endpoints.start.x, endpoints.start.y, { arriveReady: true });
      if (!marine || !wraith) throw new Error('BattleScene.spawnUnit did not return both real test units');
      // Instance-only speed cloning keeps real Unit.update/stepAlongPath active.
      marine.speed = 430;
      wraith.speed = 560;
      marine.repathTimer = 9999;
      wraith.repathTimer = 9999;
      marine.issueMove(endpoints.target.x, endpoints.target.y, false);
      wraith.issueMove(endpoints.target.x, endpoints.target.y, false);

      function frame() { return new Promise(resolve => requestAnimationFrame(resolve)); }
      for (let i = 0; i < 120 && (!marine.lastPathResult || !wraith.lastPathResult); i++) await frame();
      if (!marine.lastPathResult || !wraith.lastPathResult) throw new Error('real move orders did not produce both path results');

      const marinePlan = pathPoints(endpoints.start, marine.path);
      const wraithPlan = pathPoints(endpoints.start, wraith.path);
      const marinePlanStats = classify(marinePlan);
      const wraithPlanStats = classify(wraithPlan);
      const marineTrail = [endpoints.start];
      const wraithTrail = [endpoints.start];
      const deadline = performance.now() + 22000;
      while (performance.now() < deadline) {
        marineTrail.push({ x: marine.x, y: marine.y });
        wraithTrail.push({ x: wraith.x, y: wraith.y });
        const marineDone = Math.hypot(marine.x - endpoints.target.x, marine.y - endpoints.target.y) <= 16 && !marine.order;
        const wraithDone = Math.hypot(wraith.x - endpoints.target.x, wraith.y - endpoints.target.y) <= 16 && !wraith.order;
        if (marineDone && wraithDone) break;
        await frame();
      }
      marineTrail.push({ x: marine.x, y: marine.y });
      wraithTrail.push({ x: wraith.x, y: wraith.y });

      const marineTrailStats = classify(marineTrail);
      const wraithTrailStats = classify(wraithTrail);
      const directLength = endpoints.directLength;
      const marineTrailLength = length(marineTrail);
      const wraithTrailLength = length(wraithTrail);
      const arrival = {
        marine: Math.hypot(marine.x - endpoints.target.x, marine.y - endpoints.target.y),
        wraith: Math.hypot(wraith.x - endpoints.target.x, wraith.y - endpoints.target.y)
      };

      const overlay = b.add.graphics().setDepth(9999);
      const drawTrail = (trail, color, width) => {
        overlay.lineStyle(width, color, 0.95).beginPath().moveTo(trail[0].x, trail[0].y);
        for (let i = 1; i < trail.length; i++) overlay.lineTo(trail[i].x, trail[i].y);
        overlay.strokePath();
      };
      drawTrail(wraithTrail, 0xff4fd8, 10);
      drawTrail(marineTrail, 0x25e6a4, 10);
      overlay.lineStyle(5, 0xffd54a, 1).strokeCircle(endpoints.start.x, endpoints.start.y, 30).strokeCircle(endpoints.target.x, endpoints.target.y, 30);
      overlay.fillStyle(0xffd54a, 1).fillCircle(endpoints.start.x, endpoints.start.y, 8).fillCircle(endpoints.target.x, endpoints.target.y, 8);

      const label = (x, y, text, color, size = 56) => b.add.text(x, y, text, {
        fontSize: `${size}px`, fontFamily: 'Rajdhani, sans-serif', fontStyle: 'bold',
        color, backgroundColor: 'rgba(0,0,0,0.84)', padding: { x: 12, y: 8 }
      }).setOrigin(0.5).setDepth(10000);
      label((endpoints.start.x + endpoints.target.x) * 0.5, (endpoints.start.y + endpoints.target.y) * 0.5 - 74, 'WRAITH DIRECT', '#ff8bea');
      label((endpoints.start.x + endpoints.target.x) * 0.5, (endpoints.start.y + endpoints.target.y) * 0.5 + 74, 'MARINE VALLEY', '#65ffd0');
      label(endpoints.start.x, endpoints.start.y - 58, 'START', '#ffe477', 48);
      label(endpoints.target.x, endpoints.target.y - 58, 'TARGET', '#ffe477', 48);
      label(1280, 74, 'P0.010 AIR / GROUND ROUTING', '#ffffff', 52);
      b.cameras.main.centerOn(1280, 1280).setZoom(0.31);

      return {
        endpoints: {
          start: endpoints.start, target: endpoints.target,
          startCell: [Math.floor(endpoints.start.x / tileSize), Math.floor(endpoints.start.y / tileSize)],
          targetCell: [Math.floor(endpoints.target.x / tileSize), Math.floor(endpoints.target.y / tileSize)]
        },
        paths: {
          wraithWaypoints: wraith.path.length,
          marineWaypoints: marine.path.length,
          wraithStatus: wraith.lastPathResult.status,
          marineStatus: marine.lastPathResult.status,
          wraithPlan: { solid: wraithPlanStats.solid.length, nonwalkable: wraithPlanStats.nonwalkable.length },
          marinePlan: { solid: marinePlanStats.solid.length, nonwalkable: marinePlanStats.nonwalkable.length, valley: marinePlanStats.valleys.length },
          directSamplesSolid: endpoints.direct.solid.length,
          directLength,
          marineLength: endpoints.groundLength
        },
        trails: {
          wraithSamples: wraithTrail.length,
          marineSamples: marineTrail.length,
          wraithLength: wraithTrailLength,
          marineLength: marineTrailLength,
          wraithDirectRatio: wraithTrailLength / directLength,
          marineSolid: marineTrailStats.solid.length,
          marineNonwalkable: marineTrailStats.nonwalkable.length,
          marineValley: marineTrailStats.valleys.length
        },
        arrival,
        labels: ['WRAITH DIRECT', 'MARINE VALLEY', 'START', 'TARGET'],
        valleyRegistry: valleySet.size
      };
    });

    await page.waitForTimeout(350);
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath });
    const image = fs.readFileSync(screenshotPath);
    const width = image.readUInt32BE(16), height = image.readUInt32BE(20);
    return { report, pageErrors, screenshot: { width, height, bytes: image.length } };
  } finally {
    await browser.close();
  }
}

async function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const stageDir = path.join('/tmp', 'scc-build-air-ground-' + Date.now());
  const screenshotPath = path.join(repoRoot, 'verify', 'p0010-air-ground-routing.png');
  console.log('=== P0.010 Air/Ground Routing Verifier ===');
  console.log('--- Staging Vite build in /tmp ---');
  execSync(`npx vite build --outDir ${stageDir} --emptyOutDir`, { cwd: repoRoot, stdio: 'inherit' });
  const server = createServer(stageDir);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const targetUrl = `http://127.0.0.1:${server.address().port}/scc/`;
  try {
    const result = await runVerifier(targetUrl, screenshotPath);
    const r = result.report;
    console.log('\n--- VERIFIER RESULTS ---');
    console.log(JSON.stringify(result, null, 2));
    const failures = [];
    if (result.pageErrors.length) failures.push(`page errors: ${result.pageErrors.join(' | ')}`);
    if (r.paths.wraithWaypoints !== 1) failures.push(`Wraith route has ${r.paths.wraithWaypoints} waypoints, expected 1`);
    if (r.paths.wraithStatus !== 'flying') failures.push(`Wraith path status is ${r.paths.wraithStatus}, expected flying`);
    if (r.paths.directSamplesSolid < 1) failures.push('direct Wraith segment did not sample a solid cell');
    if (r.paths.marineStatus !== 'ok') failures.push(`Marine path status is ${r.paths.marineStatus}, expected ok`);
    if (r.paths.marinePlan.solid || r.paths.marinePlan.nonwalkable) failures.push(`Marine planned route has solid=${r.paths.marinePlan.solid}, nonwalkable=${r.paths.marinePlan.nonwalkable}`);
    if (r.paths.marinePlan.valley < 1 || r.trails.marineValley < 1) failures.push('Marine route did not sample a registered valley cell');
    if (r.paths.marineLength <= r.paths.directLength) failures.push(`Marine path ${r.paths.marineLength.toFixed(1)} is not longer than air ${r.paths.directLength.toFixed(1)}`);
    if (r.trails.wraithDirectRatio > 1.05) failures.push(`Wraith trajectory/direct ratio ${r.trails.wraithDirectRatio.toFixed(4)} > 1.05`);
    if (r.trails.marineSolid || r.trails.marineNonwalkable) failures.push(`Marine trail has solid=${r.trails.marineSolid}, nonwalkable=${r.trails.marineNonwalkable}`);
    if (r.arrival.marine > 16 || r.arrival.wraith > 16) failures.push(`arrival errors marine=${r.arrival.marine.toFixed(2)} wraith=${r.arrival.wraith.toFixed(2)} > 16px`);
    if (result.screenshot.width < 1280 || result.screenshot.height < 720) failures.push(`screenshot ${result.screenshot.width}x${result.screenshot.height} < 1280x720`);
    if (result.screenshot.bytes < 10000) failures.push(`screenshot is only ${result.screenshot.bytes} bytes`);
    if (failures.length) {
      console.error('\nCURRENT FAILURE:\n' + failures.map(failure => `  - ${failure}`).join('\n'));
      process.exitCode = 1;
    } else {
      console.log('\nPASS: Real Wraith direct and Marine valley movement verified with identical endpoints.');
      console.log('PASS: Direct solid crossing, legal valley route, trajectory ratio, arrivals, page errors, and screenshot dimensions verified.');
    }
  } finally {
    server.close();
    try { fs.rmSync(stageDir, { recursive: true, force: true }); } catch {}
  }
}

main().catch(error => { console.error('FATAL:', error.message || error); process.exitCode = 1; });
