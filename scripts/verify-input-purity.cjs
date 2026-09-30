// P1.027-i3b GATE (pure Node): input-callback purity scan, LIVE scope.
// Contract under test (cmdQueue kernel): input handlers may only ENQUEUE
// (__cmd) + touch presentation/UI (cursor, ghost, mode flags, selection,
// camera, audio). Every SIM state write must execute at the tick head
// (execCmd / execSimTimer), never inside a pointer/keydown/HUD-event
// callback, and never from a render-clock timer whose body also mutates.
// Three check families:
//  1) createInput() body contains ZERO forbidden state-write tokens and
//     EVERY i3b command type has its __cmd site there;
//  2) execCmd dispatches every queued type (enqueue without dispatch =
//     silently-dead command, the classic half-migration);
//  3) the migrated cast chains contain no render-clock timer with state
//     effects inside (deletion means deletion — guard keeps them deleted).
// Run: node scripts/verify-input-purity.cjs
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'src2', 'scenes', 'BattleScene.js'), 'utf8');
const lines = SRC.split('\n');
let pass = 0, fail = 0;
const ok = (id, cond, note) => { if (cond) { pass++; console.log(`PASS ${id}`); } else { fail++; console.log(`FAIL ${id}${note ? ' :: ' + note : ''}`); } };

// ---- region helpers -------------------------------------------------------
function regionBetween(startRe, endRe, from) {
  const start = lines.findIndex((l, i) => i >= (from || 0) && startRe.test(l));
  if (start < 0) return null;
  for (let i = start + 1; i < lines.length; i++) if (endRe.test(lines[i])) return { start, end: i };
  return null;
}
// Method body: from the line matching startRe to the first line that closes
// a method at 2-space indent (template literals never emit that pattern).
function methodBody(nameRe) {
  const r = regionBetween(nameRe, /^  \}/);
  if (!r) return null;
  return lines.slice(r.start, r.end + 1).join('\n');
}
const createInput = methodBody(/createInput\(\) \{/);
ok('REGION-FOUND', !!createInput, 'createInput() body locate failed');

// ---- 1) forbidden state-write tokens in input callbacks -------------------
// Every token here is a SIM write (unit state/orders, buildings, economy,
// queues, fog). Selection/cursor/ghost/mode/camera/audio are the allowed
// UI layer (documented in BACKLOG i3b).
const FORBIDDEN = [
  /setOrder\(/, /issueMove\(/, /takeDamage\(/, /spawnUnit\(/,
  /deployMCV\(/, /summonRadiant\(/, /morphSelected\(/,
  /tryPlace\(/, /queueFromHud\(/, /queueResearchFromHud\(/,
  /\.queueUnit\(/, /\.queueResearch\(/,
  /patrolPoints\s*=/, /\.energy\s*-=/, /spend\(/,
  /\.order\s*=\s*[^=]/, /\.state\s*=\s*['"]/,
  /_tempReveals/, /_scanCd\s*=/, /this\.seen\[/,
  /buildings\.push\(/, /this\.units\s*=\s*/,
];
if (createInput) {
  let hits = [];
  for (const re of FORBIDDEN) {
    const m = createInput.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'));
    if (m) hits.push(re.source + ' x' + m.length);
  }
  ok('INPUT-NO-STATE-WRITES', hits.length === 0, hits.join('; ').slice(0, 200));
}

// ---- every i3b enqueue site present in the input region -------------------
const CMD_SITES = ['patrol', 'ult', 'scan', 'ucast', 'place', 'deploy', 'merge', 'morph', 'queue', 'research', 'hold'];
if (createInput) {
  const missing = CMD_SITES.filter(t => !createInput.includes(`__cmd('${t}'`));
  ok('CMD-SITES-PRESENT', missing.length === 0, 'missing: ' + missing.join(','));
}

// ---- 2) execCmd dispatches every queued type ------------------------------
const execBody = methodBody(/execCmd\(c\) \{/);
ok('EXEC-FOUND', !!execBody, 'execCmd() body locate failed');
if (execBody) {
  const missing = CMD_SITES.filter(t => !execBody.includes(`'${t}'`));
  ok('EXEC-DISPATCH-COMPLETE', missing.length === 0, 'no exec case for: ' + missing.join(','));
}

// ---- 3) migrated cast chains: no render-clock state timers ----------------
// Scope = the four migrated chains (ult / unit storm / caustic / scan). A
// time.addEvent or delayedCall whose first 35 lines contain a state-write
// call = render-paced damage (the bug class P1.028 + i3b delete).
const CHAINS = [/^\s+castUltimate\(/, /^\s+castUnitPsiStorm\(/, /^\s+castCausticCloud\(/, /^\s+castMaelstrom\(/, /^\s+scannerSweep\(/];
const STATE_WRITE = /takeDamage\(|spawnUnit\(|setOrder\(|issueMove\(|spend\(/;
let chainLeaks = [];
for (const re of CHAINS) {
  const r = regionBetween(re, /^  \}/);
  if (!r) { chainLeaks.push('chain not found: ' + re.source); continue; }
  for (let i = r.start; i <= r.end; i++) {
    if (/time\.(addEvent|delayedCall)\(/.test(lines[i])) {
      const win = lines.slice(i, Math.min(i + 35, r.end + 1)).join('\n');
      if (STATE_WRITE.test(win)) chainLeaks.push(`render-clock state timer at line ${i + 1} (chain ${re.source})`);
    }
  }
}
ok('CAST-CHAINS-TICK-SIDE', chainLeaks.length === 0, chainLeaks.join('; ').slice(0, 250));

// ---- 4) real kernel used by the scene (mock-harness trap guard) -----------
ok('SCENE-USES-REAL-KERNEL', /from '\.\.\/engine\/cmdQueue\.js'/.test(SRC), 'BattleScene must import the real cmdQueue kernel');
const timers = fs.readFileSync(path.join(__dirname, '..', 'src2', 'engine', 'simTimers.js'), 'utf8');
ok('SIM-TIMERS-KERNEL-INTACT', /function drain\(t, nowTick\)/.test(timers), 'simTimers kernel shape changed');

console.log(`RESULT INPUT-PURITY ${fail === 0 ? 'PASS' : 'FAIL'} ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);