/**
 * P0.011 deterministic golden replay.
 *
 * The BattleScene module imports browser-only Phaser assets, so the harness
 * evaluates that source with inert dependency bindings. The destroyRock
 * implementation itself is the checked-in source method; the scene below is
 * only the smallest fixture needed by that method.
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');

function loadBattleSceneClass() {
  const sourcePath = path.join(ROOT, 'src2/scenes/BattleScene.js');
  const source = fs.readFileSync(sourcePath, 'utf8')
    .replace(/^import [^\n]+;\n/gm, '')
    .replace('export class BattleScene', 'class BattleScene');
  const context = {
    Phaser: { Scene: class Scene {} },
    TILE: 16,
    MAP_W: 160,
    MAP_H: 160,
    console,
  };
  vm.runInNewContext(`${source}\nglobalThis.__BattleScene = BattleScene;`, context, { filename: sourcePath });
  return context.__BattleScene;
}

function loadUnitClass(data) {
  const sourcePath = path.join(ROOT, 'src2/engine/entity.js');
  const source = fs.readFileSync(sourcePath, 'utf8')
    .replace(/^import [^\n]+;\n/gm, '')
    .replace(/export /g, '');
  const context = {
    Phaser: {},
    ...data,
    liveProjectiles: new Set(),
    console,
  };
  vm.runInNewContext(`${source}\nglobalThis.__Unit = Unit;`, context, { filename: sourcePath });
  return context.__Unit;
}

function displayObject(x = 0, y = 0) {
  return {
    x, y, active: true,
    setPosition(nx, ny) { this.x = nx; this.y = ny; return this; },
    setScale() { return this; },
    setDepth() { return this; },
    setAlpha() { return this; },
    setY(ny) { this.y = ny; return this; },
    setRotation() { return this; },
    setFlipX() { return this; },
    setTexture() { return this; },
    clearTint() { return this; },
    setTint() { return this; },
    add() { return this; },
    clear() { return this; },
    destroy() { this.active = false; },
  };
}

function makeWorld(nav) {
  return {
    nav,
    units: [],
    textures: { exists: () => false },
    add: {
      container: (x, y) => displayObject(x, y),
      image: () => displayObject(),
      graphics: () => displayObject(),
    },
    separationVector: () => ({ x: 0, y: 0 }),
    events: { emit() {} },
    time: { now: 0 },
  };
}

function makeScene(BattleScene, nav, flows) {
  return Object.assign(Object.create(BattleScene.prototype), {
    nav,
    flows,
    rockTiles: [],
    destructibles: [],
    children: { list: [] },
    shake() {},
    camNear: () => false,
    events: { emit() {} },
    gameTime: 0,
  });
}

function wallGrid(NavGrid, w, h, tileSize) {
  const nav = new NavGrid(w, h, tileSize);
  for (let x = 0; x < w; x++) {
    nav.solid[nav.idx(x, 0)] = 1;
    nav.solid[nav.idx(x, h - 1)] = 1;
  }
  for (let y = 0; y < h; y++) {
    nav.solid[nav.idx(0, y)] = 1;
    nav.solid[nav.idx(w - 1, y)] = 1;
  }
  for (let y = 1; y < h - 1; y++) {
    if (y !== 4) nav.solid[nav.idx(7, y)] = 1;
  }
  return nav;
}

function sampleAStarRoute(route, nav, tileSize, gapX, gapY) {
  if (!Array.isArray(route) || route.length < 2) return { complete: false, blocked: 1, gap: false };
  let blocked = 0, gap = false;
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i], b = route[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (tileSize * 0.5)));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      const tx = Math.floor(x / tileSize), ty = Math.floor(y / tileSize);
      if (!nav.walkable(tx, ty)) blocked++;
      if (tx === gapX && ty === gapY) gap = true;
    }
  }
  return { complete: !route.partial && blocked === 0 && gap, blocked, gap };
}

function sampleFlowRoute(field, unit, nav, tileSize, gapX, gapY) {
  let tx = Math.floor(unit.x / tileSize), ty = Math.floor(unit.y / tileSize);
  const seen = new Set();
  let blocked = 0, gap = false;
  for (let step = 0; step <= nav.w * nav.h; step++) {
    const key = `${tx},${ty}`;
    if (seen.has(key)) return { complete: false, blocked, gap };
    seen.add(key);
    if (!nav.walkable(tx, ty)) blocked++;
    if (tx === gapX && ty === gapY) gap = true;
    if (field.distAt((tx + 0.5) * tileSize, (ty + 0.5) * tileSize) === 0) {
      return { complete: blocked === 0 && gap, blocked, gap };
    }
    const i = nav.idx(tx, ty);
    const dx = field.dir[i * 2], dy = field.dir[i * 2 + 1];
    if (!dx && !dy) return { complete: false, blocked, gap };
    if (dx && dy && (!nav.walkable(tx + dx, ty) || !nav.walkable(tx, ty + dy))) blocked++;
    tx += dx; ty += dy;
    if (!nav.inBounds(tx, ty)) return { complete: false, blocked, gap };
  }
  return { complete: false, blocked, gap };
}

function runTrial({ BattleScene, FlowManager, NavGrid, Unit, TILE }, trial) {
  const nav = wallGrid(NavGrid, 16, 9, TILE);
  const flows = new FlowManager(nav, nav.w, nav.h);
  const scene = makeScene(BattleScene, nav, flows);
  const rock = { tx: 7, ty: 4, hp: 1 };
  nav.blockRect(-2, rock.tx, rock.ty, rock.tx, rock.ty);
  scene.rockTiles.push(rock);
  scene.destructibles.push(rock);

  const world = makeWorld(nav);
  scene.units = world.units;
  const goal = { x: 13 * TILE + 8, y: (2 + (trial % 5)) * TILE + 8 };
  const starts = [
    [2, 2], [2, 3], [2, 5], [2, 6],
    [3, 2], [3, 3], [3, 5], [3, 6],
  ];
  const astar = [], flow = [];
  for (let i = 0; i < 4; i++) {
    const u = new Unit(world, 0, 'marine', starts[i][0] * TILE + 8, starts[i][1] * TILE + 8);
    u.issueMove(goal.x, goal.y);
    u.needsPath = false;
    u.repath(goal.x, goal.y);
    u.needsPath = false;
    u.repathTimer = 0.5;
    astar.push(u);
    world.units.push(u);
  }
  const key = `valley:${trial}`;
  const sharedField = flows.ensure(key, goal.x, goal.y, 0, 0.6, 0);
  for (let i = 0; i < 4; i++) {
    const u = new Unit(world, 0, 'marine', starts[i + 4][0] * TILE + 8, starts[i + 4][1] * TILE + 8);
    u.issueMove(goal.x, goal.y);
    u.needsPath = false;
    u.flowField = sharedField;
    flow.push(u);
    world.units.push(u);
  }

  const initiallyBlocked = astar.every(u => u.unreachable) && flow.every(u => !sharedField.flowAt(u.x, u.y));
  BattleScene.prototype.destroyRock.call(scene, rock);
  const recorded = Array.isArray(flows.topologyChanges) && flows.topologyChanges.length === 1;

  scene.gameTime = 0.05;
  if (typeof BattleScene.prototype.processTopologyChanges === 'function') {
    BattleScene.prototype.processTopologyChanges.call(scene);
  }
  for (const u of world.units) Unit.prototype.update.call(u, 0.05);

  const astarSamples = astar.map(u => sampleAStarRoute(u.path, nav, TILE, rock.tx, rock.ty));
  const flowSamples = flow.map(u => sampleFlowRoute(u.flowField, u, nav, TILE, rock.tx, rock.ty));
  const staleFields = [...flows.fields.values()].filter(rec => rec.stale || !rec.field.valid || !Number.isFinite(rec.field.distAt(starts[4][0] * TILE + 8, starts[4][1] * TILE + 8))).length;
  return {
    initiallyBlocked,
    recorded,
    astarComplete: astar.filter((u, i) => u.lastPathResult?.reachable && !u.unreachable && astarSamples[i].complete).length,
    flowComplete: flow.filter((u, i) => flowSamples[i].complete).length,
    blockedSamples: astarSamples.reduce((n, s) => n + s.blocked, 0) + flowSamples.reduce((n, s) => n + s.blocked, 0),
    staleFields,
    latencyMs: 50,
  };
}

async function main() {
  const imports = await Promise.all([
    import(pathToFileURL(path.join(ROOT, 'src2/engine/pathfinding.js')).href),
    import(pathToFileURL(path.join(ROOT, 'src2/engine/flowfield.js')).href),
    import(pathToFileURL(path.join(ROOT, 'src2/data/sc1.js')).href),
  ]);
  const [{ NavGrid }, { FlowManager }, data] = imports;
  const { TILE, UNITS, BUILDINGS, TECHS, SIZE_MULT } = data;
  const Unit = loadUnitClass({ TILE, UNITS, BUILDINGS, TECHS, SIZE_MULT });
  const BattleScene = loadBattleSceneClass();
  const results = Array.from({ length: 50 }, (_, trial) => runTrial({ BattleScene, FlowManager, NavGrid, Unit, TILE }, trial));
  const totals = results.reduce((a, r) => ({
    initial: a.initial + (r.initiallyBlocked ? 1 : 0),
    recorded: a.recorded + (r.recorded ? 1 : 0),
    astar: a.astar + r.astarComplete,
    flow: a.flow + r.flowComplete,
    blocked: a.blocked + r.blockedSamples,
    stale: a.stale + r.staleFields,
  }), { initial: 0, recorded: 0, astar: 0, flow: 0, blocked: 0, stale: 0 });
  const passed = totals.initial === 50 && totals.recorded === 50 && totals.astar === 200 && totals.flow === 200 && totals.blocked === 0 && totals.stale === 0 && results.every(r => r.latencyMs <= 50);
  console.log(`P0.011 trials=50 initial_blocked=${totals.initial}/50 topology_recorded=${totals.recorded}/50`);
  console.log(`P0.011 astar_routes=${totals.astar}/200 flow_routes=${totals.flow}/200 stale_shared_fields=${totals.stale} blocked_route_samples=${totals.blocked} latency_ms_max=${Math.max(...results.map(r => r.latencyMs))}`);
  if (!passed) {
    console.error('P0.011 FAIL: expected 200 A-star + 200 shared-flow legal routes after one 50ms tick');
    process.exit(1);
  }
  console.log('P0.011 PASS: all 400 units have legal opened-valley routes after exactly one fixed 50ms tick');
}

main().catch(err => {
  console.error('Harness error:', err.stack || err);
  process.exit(1);
});
