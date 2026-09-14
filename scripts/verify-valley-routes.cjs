/**
 * scripts/verify-valley-routes.cjs - P0.008 Valley routes verifier
 */
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const { execSync } = require('node:child_process');

let chromium;
try { chromium = require('playwright').chromium; }
catch { chromium = require(path.join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')).chromium; }

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };

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
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
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
      return b && b.nav && b.mountains && b.terrainCanvas && b.valleys && b.elev && b.ramp;
    }, null, { timeout: 20000 });

    const report = await page.evaluate(async () => {
      const b = window.__SCC2.scene.getScene('Battle'), nav = b.nav, { w, tileSize } = nav;
      const HQ_A = { tx: 19, ty: 19, x: 19.5 * tileSize, y: 19.5 * tileSize };
      const HQ_B = { tx: 140, ty: 140, x: 140.5 * tileSize, y: 140.5 * tileSize };

      function getCrossingY(pth) {
        if (!pth) return null;
        let closest = Infinity, bestY = null;
        for (let k = 0; k < pth.length - 1; k++) {
          const p0 = pth[k], p1 = pth[k + 1], d = Math.hypot(p1.x - p0.x, p1.y - p0.y);
          const steps = Math.max(1, Math.ceil(d / (tileSize * 0.5)));
          for (let s = 0; s <= steps; s++) {
            const tx = (p0.x + (p1.x - p0.x) * (s / steps)) / tileSize;
            const ty = (p0.y + (p1.y - p0.y) * (s / steps)) / tileSize;
            if (Math.abs(tx - 80) < closest) { closest = Math.abs(tx - 80); bestY = ty; }
          }
        }
        return bestY;
      }

      function checkPassSegmentFlat(pth) {
        if (!pth) return false;
        for (let k = 0; k < pth.length - 1; k++) {
          const p0 = pth[k], p1 = pth[k + 1], d = Math.hypot(p1.x - p0.x, p1.y - p0.y);
          const steps = Math.max(1, Math.ceil(d / (tileSize * 0.5)));
          for (let s = 0; s <= steps; s++) {
            const x = p0.x + (p1.x - p0.x) * (s / steps), y = p0.y + (p1.y - p0.y) * (s / steps);
            if (Math.floor(x / tileSize) >= 65 && Math.floor(x / tileSize) <= 95 && b.elevAt(x, y) !== 0) return false;
          }
        }
        return true;
      }

      function checkWaypointsWalkable(pth) {
        return Boolean(pth && pth.every(wp => nav.walkable(Math.floor(wp.x / tileSize), Math.floor(wp.y / tileSize))));
      }

      // (a) Explicit pass waypoints
      const waypoints = { north: { tx: 80, ty: 46 }, center: { tx: 82, ty: 84 }, south: { tx: 76, ty: 114 } };
      const explicitRoutes = {};
      for (const [name, wp] of Object.entries(waypoints)) {
        const wx = (wp.tx + 0.5) * tileSize, wy = (wp.ty + 0.5) * tileSize;
        const p1 = nav.findPath(HQ_A.x, HQ_A.y, wx, wy, 0, -1, 15000);
        const p2 = nav.findPath(wx, wy, HQ_B.x, HQ_B.y, 0, -1, 15000);
        const ok = Boolean(p1 && !p1.partial && p2 && !p2.partial);
        const full = ok ? [...p1, ...p2.slice(1)] : null;
        explicitRoutes[name] = {
          wp, connected: ok, crossingY: full ? getCrossingY(full) : null,
          passFlat: full ? checkPassSegmentFlat(full) : false,
          wpWalkable: full ? checkWaypointsWalkable(full) : false, fullPath: full,
        };
      }

      // (b) Iterative recomputation with blocked corridors
      const origSolid = new Uint8Array(nav.solid), iterRoutes = [];
      for (let step = 0; step < 5; step++) {
        const p = nav.findPath(HQ_A.x, HQ_A.y, HQ_B.x, HQ_B.y, 0, -1, 15000);
        if (!p || p.partial) break;
        const cy = getCrossingY(p);
        iterRoutes.push({ step: step + 1, crossingY: cy, passFlat: checkPassSegmentFlat(p), wpWalkable: checkWaypointsWalkable(p), waypointCount: p.length });
        const [by0, by1] = cy < 60 ? [42, 54] : (cy > 100 ? [108, 120] : [66, 94]);
        for (let ty = by0; ty <= by1; ty++) {
          const cx = Math.round(w * 0.5 + Math.sin(ty * 0.09 + 1.7) * 11);
          const c2 = cx + 12 + Math.round(Math.sin(ty * 0.13) * 4);
          for (let tx = cx - 3; tx <= c2 + 2; tx++) if (nav.inBounds(tx, ty)) nav.solid[ty * w + tx] = 1;
        }
      }
      nav.solid.set(origSolid);

      // Overlays for screenshot
      const g = b.add.graphics().setDepth(9999);
      b.cameras.main.centerOn(1280, 1280).setZoom(0.31);
      const colors = { north: 0x00e5ff, center: 0x00e676, south: 0xff9100 };

      for (const [name, col] of Object.entries(colors)) {
        const r = explicitRoutes[name];
        if (r?.fullPath?.length > 1) {
          g.lineStyle(8, col, 0.9).beginPath().moveTo(r.fullPath[0].x, r.fullPath[0].y);
          for (let k = 1; k < r.fullPath.length; k++) g.lineTo(r.fullPath[k].x, r.fullPath[k].y);
          g.strokePath();
          for (const pt of r.fullPath) g.fillStyle(col, 1.0).fillCircle(pt.x, pt.y, 7);
          const lbl = (r.wp.tx + 0.5) * tileSize;
          b.add.text(lbl, (r.wp.ty + 0.5) * tileSize - 30, `${name.toUpperCase()} ROUTE`, {
            fontSize: '32px', fontFamily: 'Rajdhani, sans-serif', fontStyle: 'bold', color: '#fff', backgroundColor: 'rgba(0,0,0,0.75)', padding: { x: 10, y: 6 }
          }).setOrigin(0.5).setDepth(10000);
        }
      }

      const drawHq = (hq, name, col) => {
        g.lineStyle(6, col, 1.0).fillStyle(0x000000, 0.6).strokeCircle(hq.x, hq.y, 48).fillCircle(hq.x, hq.y, 48);
        b.add.text(hq.x, hq.y + 60, `${name} (${hq.tx},${hq.ty})`, {
          fontSize: '36px', fontFamily: 'Rajdhani, sans-serif', fontStyle: 'bold', color: '#ffff00', backgroundColor: 'rgba(0,0,0,0.85)', padding: { x: 12, y: 8 }
        }).setOrigin(0.5).setDepth(10000);
      };
      drawHq(HQ_A, 'HQ A', 0x00ffff);
      drawHq(HQ_B, 'HQ B', 0xff0055);
      b.add.text(1280, 80, 'P0.008: THREE FLAT-GROUND VALLEY ROUTES', {
        fontSize: '40px', fontFamily: 'Rajdhani, sans-serif', fontStyle: 'bold', color: '#00ffff', backgroundColor: 'rgba(0,0,0,0.85)', padding: { x: 20, y: 10 }
      }).setOrigin(0.5).setDepth(10000);

      // (c) Valley registry validation and pass coverage
      const isArray = Array.isArray(b.valleys);
      const reportedLength = (b.valleys || []).length;
      const iteratedList = Array.from(b.valleys || []);
      const valleySet = new Set();
      for (const pt of iteratedList) {
        if (Array.isArray(pt) && pt.length >= 2) valleySet.add(`${pt[0]},${pt[1]}`);
      }
      const uniqueCount = valleySet.size;

      const routeCounts = { north: 0, center: 0, south: 0, other: 0, total: uniqueCount };
      for (const key of valleySet) {
        const [tx, ty] = key.split(',').map(Number);
        if (ty >= 44 && ty <= 52) routeCounts.north++;
        else if (ty >= 68 && ty <= 92) routeCounts.center++;
        else if (ty >= 110 && ty <= 118) routeCounts.south++;
        else routeCounts.other++;
      }

      const passConfigs = {
        north: { rowMin: 44, rowMax: 52 },
        center: { rowMin: 68, rowMax: 92 },
        south: { rowMin: 110, rowMax: 118 }
      };
      const passCoverage = {
        north: { required: 0, registered: 0, missing: 0, nonZeroElev: 0, solid: 0, unwalkable: 0 },
        center: { required: 0, registered: 0, missing: 0, nonZeroElev: 0, solid: 0, unwalkable: 0 },
        south: { required: 0, registered: 0, missing: 0, nonZeroElev: 0, solid: 0, unwalkable: 0 }
      };
      for (const [pName, cfg] of Object.entries(passConfigs)) {
        const cov = passCoverage[pName];
        for (let ty = cfg.rowMin; ty <= cfg.rowMax; ty++) {
          const cx = Math.round(w * 0.5 + Math.sin(ty * 0.09 + 1.7) * 11);
          const c2 = cx + 12 + Math.round(Math.sin(ty * 0.13) * 4);
          for (let wo = -2; wo <= 2; wo++) {
            const tx = cx + wo;
            cov.required++;
            if (valleySet.has(`${tx},${ty}`)) cov.registered++; else cov.missing++;
            const idx = ty * w + tx;
            const el = b.elev ? b.elev[idx] : b.elevAt((tx + 0.5) * tileSize, (ty + 0.5) * tileSize);
            if (el !== 0) cov.nonZeroElev++;
            if (nav.solid[idx] !== 0) cov.solid++;
            if (!nav.walkable(tx, ty)) cov.unwalkable++;
          }
          for (let wo = -1; wo <= 1; wo++) {
            const tx = c2 + wo;
            cov.required++;
            if (valleySet.has(`${tx},${ty}`)) cov.registered++; else cov.missing++;
            const idx = ty * w + tx;
            const el = b.elev ? b.elev[idx] : b.elevAt((tx + 0.5) * tileSize, (ty + 0.5) * tileSize);
            if (el !== 0) cov.nonZeroElev++;
            if (nav.solid[idx] !== 0) cov.solid++;
            if (!nav.walkable(tx, ty)) cov.unwalkable++;
          }
        }
      }

      return {
        explicitRoutes: {
          north: { connected: explicitRoutes.north.connected, crossingY: explicitRoutes.north.crossingY, passFlat: explicitRoutes.north.passFlat, wpWalkable: explicitRoutes.north.wpWalkable },
          center: { connected: explicitRoutes.center.connected, crossingY: explicitRoutes.center.crossingY, passFlat: explicitRoutes.center.passFlat, wpWalkable: explicitRoutes.center.wpWalkable },
          south: { connected: explicitRoutes.south.connected, crossingY: explicitRoutes.south.crossingY, passFlat: explicitRoutes.south.passFlat, wpWalkable: explicitRoutes.south.wpWalkable },
        },
        iterRoutes,
        valleys: { isArray, reportedLength, uniqueCount, routeCounts, passCoverage }
      };
    });

    await page.waitForTimeout(300);
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath });
    return report;
  } finally {
    await browser.close();
  }
}

async function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const stageDir = path.join('/tmp', 'scc-build-valley-routes-' + Date.now());
  const screenshotPath = path.join(repoRoot, 'verify', 'p0008-valley-routes.png');

  console.log('=== P0.008 Valley Routes Verifier ===');
  console.log('--- Staging Vite build in /tmp ---');
  execSync(`npx vite build --outDir ${stageDir} --emptyOutDir`, { cwd: repoRoot, stdio: 'inherit' });

  const server = createServer(stageDir);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const targetUrl = `http://127.0.0.1:${server.address().port}/scc/`;

  try {
    const report = await runVerifier(targetUrl, screenshotPath);
    console.log('\n--- VERIFIER RESULTS ---');
    console.log('Explicit routes:', JSON.stringify(report.explicitRoutes, null, 2));
    console.log('Iterative routes found:', report.iterRoutes.length, JSON.stringify(report.iterRoutes, null, 2));
    console.log('Honest valley registry counts per route:', JSON.stringify(report.valleys.routeCounts));
    console.log('Valley pass coverage:', JSON.stringify(report.valleys.passCoverage, null, 2));

    const failures = [];
    if (!report.valleys.isArray) {
      failures.push('b.valleys must be a true Array (Array.isArray is false)');
    }
    if (report.valleys.reportedLength !== report.valleys.uniqueCount) {
      failures.push(`b.valleys.length (${report.valleys.reportedLength}) does not equal unique registered cell count (${report.valleys.uniqueCount})`);
    }
    for (const [name, stats] of Object.entries(report.valleys.passCoverage)) {
      if (stats.missing > 0) {
        failures.push(`${name} pass has ${stats.missing} unregistered pass cells (registered ${stats.registered}/${stats.required})`);
      }
      if (stats.nonZeroElev > 0) {
        failures.push(`${name} pass has ${stats.nonZeroElev} non-zero elevation cells`);
      }
      if (stats.solid > 0) {
        failures.push(`${name} pass has ${stats.solid} solid cells`);
      }
      if (stats.unwalkable > 0) {
        failures.push(`${name} pass has ${stats.unwalkable} unwalkable cells`);
      }
    }
    if (!fs.existsSync(screenshotPath)) {
      failures.push(`Screenshot not created at ${screenshotPath}`);
    } else {
      const buf = fs.readFileSync(screenshotPath);
      const width = buf.readUInt32BE(16), height = buf.readUInt32BE(20), bytes = buf.length;
      console.log(`Screenshot: ${screenshotPath} (${width}x${height}, ${bytes} bytes)`);
      if (width < 1280 || height < 720) failures.push(`Screenshot dimensions ${width}x${height} < 1280x720`);
      if (bytes < 10000) failures.push(`Screenshot bytes ${bytes} too small (blank/empty)`);
    }

    const iterCount = report.iterRoutes.length;
    if (iterCount !== 3) {
      failures.push(`Iterative blocked-corridor recomputation found ${iterCount} routes (required exactly 3)`);
    }

    for (const name of ['north', 'center', 'south']) {
      const r = report.explicitRoutes[name];
      if (!r.connected) failures.push(`Explicit ${name} route not connected`);
      if (!r.passFlat) failures.push(`Explicit ${name} route pass segment not flat (elev !== 0)`);
      if (!r.wpWalkable) failures.push(`Explicit ${name} route contains unwalkable waypoints`);
    }

    const crossings = [report.explicitRoutes.north.crossingY, report.explicitRoutes.center.crossingY, report.explicitRoutes.south.crossingY];
    if (crossings.every(y => typeof y === 'number')) {
      const [dNC, dCS, dNS] = [Math.abs(crossings[0] - crossings[1]), Math.abs(crossings[1] - crossings[2]), Math.abs(crossings[0] - crossings[2])];
      console.log(`Crossing spine pairwise delta-Y: |N-C|=${dNC.toFixed(2)}, |C-S|=${dCS.toFixed(2)}, |N-S|=${dNS.toFixed(2)}`);
      if (dNC < 30) failures.push(`Crossing spine delta-Y |North - Center| = ${dNC.toFixed(2)} < 30`);
      if (dCS < 30) failures.push(`Crossing spine delta-Y |Center - South| = ${dCS.toFixed(2)} < 30`);
      if (dNS < 30) failures.push(`Crossing spine delta-Y |North - South| = ${dNS.toFixed(2)} < 30`);
    }

    if (failures.length > 0) {
      console.error('\nCURRENT FAILURE: only ' + iterCount + ' of 3 required legal flat-ground valley routes exists between HQ A tile (19,19) and HQ B tile (140,140).');
      console.error('Only the central vertical-ridge gap at ty=68..92 is authored; north and south pass corridors are absent.');
      console.error('Required gate: three legal infantry routes with zero solid/unwalkable waypoints; blocked-corridor recomputation finds all 3; crossing spine delta-Y >=30 tiles at tx≈80; all route/pass cells elevation 0; screenshot overlay labels North, Center, South and both HQs.');
      console.error('\nFailures:\n' + failures.map(f => `  - ${f}`).join('\n'));
      process.exit(1);
    }

    console.log('\nPASS: Exactly 3 topologically distinct legal infantry routes verified.');
    console.log('PASS: All waypoints walkable, pass segments flat (elev===0), pairwise delta-Y >= 30.');
    console.log('PASS: Screenshot with route overlays and HQ markers verified.');
    process.exit(0);
  } finally {
    server.close();
    try { fs.rmSync(stageDir, { recursive: true, force: true }); } catch {}
  }
}

main().catch(err => { console.error('FATAL:', err.message || err); process.exit(1); });
