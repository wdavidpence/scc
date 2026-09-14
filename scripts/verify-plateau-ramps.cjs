/**
 * scripts/verify-plateau-ramps.cjs - P0.007 plateau ramp & cliff blocking verifier
 */
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), { execSync } = require('node:child_process');
let chromium;
try { chromium = require('playwright').chromium; } catch {
  const gRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
  chromium = require(path.join(gRoot, 'playwright')).chromium;
}

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };
function createStaticServer(dir) {
  return http.createServer((req, res) => {
    let p = req.url.replace(/^\/scc\/?/, '').split('?')[0];
    if (!p || p === '/') p = 'index.html';
    const fp = path.join(dir, p);
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
      fs.createReadStream(fp).pipe(res);
    } else { res.writeHead(404); res.end('Not Found'); }
  });
}

async function runVerification(url) {
  const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--enable-gpu'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(url, { waitUntil: 'load' });
    await page.evaluate(() => localStorage.setItem('starfront.cutseen.v1', '1'));
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__SCC2 && window.__SCC2.scene.isActive('Title'), null, { timeout: 20000 });
    await page.evaluate(() => {
      const sm = window.__SCC2.scene;
      for (const sc of sm.getScenes(true)) if (sc.scene.key !== 'Boot' && sc.scene.key !== 'Preload') sm.stop(sc.scene.key);
      sm.start('Battle', { race: 'terran', enemyRace: 'skarn', difficulty: 'normal' });
    });
    await page.waitForFunction(() => {
      const b = window.__SCC2?.scene?.getScene('Battle');
      return b && b.nav && b.mountains && b.terrainCanvas && b.valleys && b.elev && b.ramp;
    }, null, { timeout: 20000 });

    return await page.evaluate(() => {
      const b = window.__SCC2.scene.getScene('Battle');
      const nav = b.nav, { w, h, tileSize } = nav, elev = b.elev, ramp = b.ramp, solid = nav.solid;
      const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const res = {
        plateauCount: 0, plateaus: [], totalRampCells: 0, solidRamps: 0, unwalkableRamps: 0,
        unblockedCliffEdges: 0, lineClearLeaks: 0, pathElevViolations: 0,
        valleysTotal: (b.valleys || []).length, valleysBad: 0, hqConnected: false, flyingPreserved: false,
      };

      // 1. Exactly 3 four-connected elevation===1 plateau components
      const visited = new Uint8Array(w * h), comps = [];
      for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
        const i = ty * w + tx;
        if (elev[i] === 1 && !visited[i]) {
          const comp = [], q = [[tx, ty]]; visited[i] = 1;
          while (q.length) {
            const [cx, cy] = q.pop(); comp.push({ tx: cx, ty: cy, idx: cy * w + cx });
            for (const [dx, dy] of DIRS) {
              const nx = cx + dx, ny = cy + dy, ni = ny * w + nx;
              if (nx >= 0 && ny >= 0 && nx < w && ny < h && elev[ni] === 1 && !visited[ni]) { visited[ni] = 1; q.push([nx, ny]); }
            }
          }
          comps.push(comp);
        }
      }
      res.plateauCount = comps.length;

      // 2. Authored ramp groups per plateau
      for (let pIdx = 0; pIdx < comps.length; pIdx++) {
        const comp = comps[pIdx], cSet = new Set(comp.map(c => c.idx)), rList = comp.filter(c => ramp[c.idx] === 1);
        const rSeen = new Set(), groups = [];
        for (const rc of rList) {
          if (rSeen.has(rc.idx)) continue;
          const grp = [], rq = [rc]; rSeen.add(rc.idx);
          while (rq.length) {
            const cur = rq.pop(); grp.push(cur);
            for (const [dx, dy] of DIRS) {
              const nx = cur.tx + dx, ny = cur.ty + dy, ni = ny * w + nx;
              if (nx >= 0 && ny >= 0 && nx < w && ny < h && ramp[ni] === 1 && cSet.has(ni) && !rSeen.has(ni)) {
                rSeen.add(ni); rq.push({ tx: nx, ty: ny, idx: ni });
              }
            }
          }
          groups.push(grp);
        }
        let maxW = 0, touchesBoth = false;
        for (const grp of groups) {
          if (grp.length > maxW) maxW = grp.length;
          let tElev = false, tFlat = false;
          for (const c of grp) for (const [dx, dy] of DIRS) {
            const nx = c.tx + dx, ny = c.ty + dy, ni = ny * w + nx;
            if (nx >= 0 && ny >= 0 && nx < w && ny < h) {
              if (elev[ni] === 0) tFlat = true;
              if (elev[ni] === 1 && ramp[ni] === 0) tElev = true;
            }
          }
          if (tElev && tFlat && grp.length >= 2) touchesBoth = true;
        }
        res.plateaus.push({ id: pIdx, cells: comp.length, ramps: rList.length, maxRampWidth: maxW, touchesBoth });
      }

      // 3. Ramp cells solid and walkable check
      for (let i = 0; i < w * h; i++) if (ramp[i] === 1) {
        res.totalRampCells++;
        if (solid[i] !== 0) res.solidRamps++;
        if (!nav.walkable(i % w, (i / w) | 0)) res.unwalkableRamps++;
      }

      // 4. Non-ramp cardinal elevation transitions & lineClear
      const checked = new Set();
      for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
        const i = ty * w + tx, e = elev[i];
        for (const [dx, dy] of DIRS) {
          const nx = tx + dx, ny = ty + dy, ni = ny * w + nx;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (e !== elev[ni]) {
            const k = i < ni ? `${i}-${ni}` : `${ni}-${i}`;
            if (checked.has(k)) continue; checked.add(k);
            if (!((e === 1 && ramp[i]) || (elev[ni] === 1 && ramp[ni]))) {
              const cliffIdx = e === 1 ? i : ni;
              if (solid[cliffIdx] === 0) res.unblockedCliffEdges++;
              if (nav.lineClear((tx + 0.5) * tileSize, (ty + 0.5) * tileSize, (nx + 0.5) * tileSize, (ny + 0.5) * tileSize)) {
                res.lineClearLeaks++;
              }
            }
          }
        }
      }

      // 5. Sampled ground findPath elevation transitions
      const checkPath = (pth) => {
        if (!pth) return;
        for (let k = 0; k < pth.length - 1; k++) {
          const p0 = pth[k], p1 = pth[k + 1];
          const t0x = Math.floor(p0.x / tileSize), t0y = Math.floor(p0.y / tileSize);
          const t1x = Math.floor(p1.x / tileSize), t1y = Math.floor(p1.y / tileSize);
          if (elev[t0y * w + t0x] !== elev[t1y * w + t1x]) {
            const steps = Math.max(4, Math.ceil(Math.hypot(p1.x - p0.x, p1.y - p0.y) / (tileSize * 0.25)));
            let prevElev = -1, prevTile = null;
            for (let s = 0; s <= steps; s++) {
              const tx = Math.floor((p0.x + (p1.x - p0.x) * (s / steps)) / tileSize);
              const ty = Math.floor((p0.y + (p1.y - p0.y) * (s / steps)) / tileSize);
              if (!nav.inBounds(tx, ty)) continue;
              const ce = elev[ty * w + tx];
              if (prevElev !== -1 && ce !== prevElev) {
                const eTile = ce === 1 ? { tx, ty } : prevTile;
                if (ramp[eTile.ty * w + eTile.tx] !== 1) res.pathElevViolations++;
              }
              prevTile = { tx, ty }; prevElev = ce;
            }
          }
        }
      };

      for (let pIdx = 0; pIdx < comps.length; pIdx++) {
        const comp = comps[pIdx], rList = comp.filter(c => ramp[c.idx] === 1);
        if (!rList.length) continue;
        const interior = comp.find(c => !ramp[c.idx] && DIRS.every(([dx, dy]) => elev[(c.ty + dy) * w + c.tx + dx] === 1)) || comp[0];
        let app = null;
        for (const [dx, dy] of DIRS) {
          const ax = rList[0].tx + dx, ay = rList[0].ty + dy;
          if (nav.inBounds(ax, ay) && elev[ay * w + ax] === 0 && nav.walkable(ax, ay)) { app = { tx: ax, ty: ay }; break; }
        }
        if (app && interior) checkPath(nav.findPath((app.tx + 0.5) * tileSize, (app.ty + 0.5) * tileSize, (interior.tx + 0.5) * tileSize, (interior.ty + 0.5) * tileSize));

        const nCliff = comp.find(c => !ramp[c.idx] && elev[(c.ty - 1) * w + c.tx] === 0 && nav.walkable(c.tx, c.ty - 1));
        if (nCliff && interior) checkPath(nav.findPath((nCliff.tx + 0.5) * tileSize, (nCliff.ty - 0.5) * tileSize, (interior.tx + 0.5) * tileSize, (interior.ty + 0.5) * tileSize));
      }

      // 6. Valleys, HQ connectivity, flying behavior
      for (const [vx, vy] of (b.valleys || [])) {
        const vi = vy * w + vx;
        if (elev[vi] !== 0 || solid[vi] !== 0 || !nav.walkable(vx, vy)) res.valleysBad++;
      }
      const hqA = { x: Math.floor(w * 0.12), y: Math.floor(h * 0.12) };
      const hqB = { x: Math.floor(w * 0.88), y: Math.floor(h * 0.88) };
      const hqSeen = new Uint8Array(w * h), hqQ = [hqA.x + hqA.y * w]; hqSeen[hqQ[0]] = 1;
      while (hqQ.length) {
        const cur = hqQ.pop(), cx = cur % w, cy = (cur / w) | 0;
        if (Math.abs(cx - hqB.x) <= 6 && Math.abs(cy - hqB.y) <= 6) { res.hqConnected = true; break; }
        for (const [dx, dy] of DIRS) {
          const nx = cx + dx, ny = cy + dy, ni = ny * w + nx;
          if (nav.inBounds(nx, ny) && !hqSeen[ni] && nav.walkable(nx, ny)) { hqSeen[ni] = 1; hqQ.push(ni); }
        }
      }
      const flyUnit = b.spawnUnit(0, 'wraith', 100, 100, { arriveReady: true });
      if (flyUnit) {
        const moveRes = flyUnit.repath(800, 800);
        res.flyingPreserved = flyUnit.flying && moveRes?.status === 'flying' && moveRes?.reachable && flyUnit.path?.length === 1;
        flyUnit.destroy();
      }

      return res;
    });
  } finally { await browser.close(); }
}

async function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const stageDir = path.join('/tmp', 'scc-build-plateau-ramps-' + Date.now());
  console.log('=== P0.007 Plateau Ramp Verifier ===');
  execSync(`npx vite build --outDir ${stageDir} --emptyOutDir`, { cwd: repoRoot, stdio: 'pipe' });
  const server = createStaticServer(stageDir);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const targetUrl = `http://127.0.0.1:${server.address().port}/scc/`;

  try {
    const res = await runVerification(targetUrl);
    console.log(`Plateau components: ${res.plateauCount} (req: 3)`);
    res.plateaus.forEach(p => console.log(`  Plateau ${p.id}: cells=${p.cells}, ramps=${p.ramps}, width=${p.maxRampWidth}, touchesBoth=${p.touchesBoth}`));
    console.log(`Ramps: total=${res.totalRampCells}, solid=${res.solidRamps}, unwalkable=${res.unwalkableRamps}`);
    console.log(`Non-ramp cliff edges: unblocked=${res.unblockedCliffEdges}, lineClearLeaks=${res.lineClearLeaks}`);
    console.log(`Path elevation crossing violations: ${res.pathElevViolations}`);
    console.log(`Valleys: total=${res.valleysTotal}, defects=${res.valleysBad}`);
    console.log(`HQ connectivity: ${res.hqConnected}, flying preserved: ${res.flyingPreserved}`);

    const failures = [];
    if (res.plateauCount !== 3) failures.push(`Expected 3 plateaus, got ${res.plateauCount}`);
    for (const p of res.plateaus) {
      if (p.maxRampWidth < 2) failures.push(`Plateau ${p.id} ramp width < 2`);
      if (!p.touchesBoth) failures.push(`Plateau ${p.id} ramp does not touch plateau and flat ground`);
    }
    if (res.solidRamps > 0) failures.push(`${res.solidRamps} ramp cells marked solid`);
    if (res.unwalkableRamps > 0) failures.push(`${res.unwalkableRamps} ramp cells unwalkable`);
    if (res.unblockedCliffEdges > 0) failures.push(`${res.unblockedCliffEdges} cliff edges unblocked`);
    if (res.lineClearLeaks > 0) failures.push(`${res.lineClearLeaks} cliff edges leak lineClear`);
    if (res.pathElevViolations > 0) failures.push(`${res.pathElevViolations} path elevation crossing violations`);
    if (res.valleysTotal !== 125 || res.valleysBad > 0) failures.push(`Valley regression: bad=${res.valleysBad}`);
    if (!res.hqConnected) failures.push('HQ connectivity broken');
    if (!res.flyingPreserved) failures.push('Flying behavior regression');

    if (failures.length) {
      console.error('\nFAIL:', failures.join('; '));
      process.exit(1);
    }
    console.log('\nPASS: All P0.007 plateau ramp and cliff blocking gates satisfied.');
    process.exit(0);
  } finally {
    server.close();
    try { fs.rmSync(stageDir, { recursive: true, force: true }); } catch {}
  }
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
