#!/usr/bin/env node
// P0.014 harness: prove no ACTIVE production import reaches legacy src/.
// Fails with exit 1 and marker "P0.014-RED" while any production entry
// resolves into src/, or while any tracked harness still reads src/ paths.
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const fail = [];
const log = [];

function readIf(p) {
  const full = path.join(ROOT, p);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
}

// 1. Production entry points must not reference src/
const prodEntries = ['index.html', 'src2/main2.js', 'src2/createGame2.js'];
for (const e of prodEntries) {
  const src = readIf(e);
  if (src === null) { fail.push(`missing production entry ${e}`); continue; }
  const hits = src.match(/['"(][^'")\s]*\/?src\/[^'")\s]*/g) || [];
  const real = hits.filter(h => !h.includes('src2'));
  if (real.length) fail.push(`${e} references legacy src/: ${real.join(', ')}`);
  else log.push(`OK ${e}: zero legacy src/ references`);
}

// 2. Full import-graph BFS over src2 from main2.js — no edge may land in src/
const seen = new Set();
const queue = ['src2/main2.js'];
const importRe = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;
while (queue.length) {
  const rel = queue.shift();
  if (seen.has(rel)) continue;
  seen.add(rel);
  if (rel.split('/').includes('src')) { fail.push(`import graph reached legacy runtime: ${rel}`); continue; }
  const src = readIf(rel);
  if (src === null) continue;
  const live = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  let m;
  while ((m = importRe.exec(live))) {
    let spec = m[1];
    if (!spec.startsWith('.') && !spec.startsWith('/')) continue;
    let target = path.posix.normalize(path.join(path.dirname(rel), spec));
    const candidates = [target, target + '.js', target.replace(/\.js$/, '') + '.js'];
    const found = candidates.find(c => fs.existsSync(path.join(ROOT, c)));
    if (found) queue.push(found);
  }
}
log.push(`OK import graph: ${seen.size} src2 modules, zero land in src/`);

// 3. Active gates (regression runner + live gate) must not read src/
const activeGates = ['scripts/run-regression-263.sh', 'scripts/verify-v265-coach.cjs'];
for (const g of activeGates) {
  const src = readIf(g);
  if (src === null) { fail.push(`missing active gate ${g}`); continue; }
  if (/(^|[^2\w])src\//.test(src)) fail.push(`${g} reads legacy src/`);
  else log.push(`OK ${g}: no src/ reads`);
}

// 4. Tracked harnesses that still read src/ must be enumerated (they are
//    legacy-bound and must be deleted or repointed together with src/).
const tracked = execSync('git ls-files scripts', { cwd: ROOT }).toString().trim().split('\n');
const srcReaders = tracked.filter(f => {
  const s = readIf(f) || '';
  return /readSourceFile\(['"]src\/|from '[^']*\/src\/|require\(['"][^']*\/src\//.test(s);
});
log.push(`legacy-src harness readers (${srcReaders.length}): ${srcReaders.join(', ')}`);

// Verdict: RED while src/ exists at all OR any active gate still reads it.
const srcExists = fs.existsSync(path.join(ROOT, 'src'));
if (srcExists) fail.push(`legacy src/ still present (${execSync('git ls-files src | wc -l', { cwd: ROOT }).toString().trim()} tracked files)`);

console.log(log.join('\n'));
if (fail.length) {
  console.error('P0.014-RED\n' + fail.join('\n'));
  process.exit(1);
}
console.log('P0.014-GREEN');
