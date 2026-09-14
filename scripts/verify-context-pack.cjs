const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const tool = path.join(root, 'tools', 'context-pack.mjs');
const schemaPath = path.join(root, 'schemas', 'context-pack.schema.json');

const baseArgs = [
  tool,
  '--id', 'JOB-002-SAMPLE',
  '--plan', 'fixtures/PLAN.sample.md',
  '--state', 'fixtures/STATE.sample.json',
  '--done', 'fixtures/DONE.sample.md',
  '--files', 'src2/engine/pathfinding.js,scripts/verify-pathfinding.cjs',
  '--signatures', 'NavGrid.findPath,NavGrid.walkable',
  '--failing-test', 'fixtures/failing-pathfinding-test.txt',
  '--test-command', 'node scripts/verify-pathfinding.cjs',
  '--deps', 'JOB-000',
  '--diff-cap', '400',
  '--forbidden-scope', 'Do not modify source outside owned files, existing tests, images, config, git, DIGEST.md, or STARCRAFT_TEARDOWN.md',
  '--out-dir', 'context-packs'
];

function run(overrideArgs) {
  const map = new Map();
  for (let i = 1; i < baseArgs.length; i += 2) map.set(baseArgs[i], baseArgs[i + 1]);
  for (const [k, v] of Object.entries(overrideArgs)) {
    if (v === null) map.delete(k);
    else map.set(k, v);
  }
  const args = [baseArgs[0]];
  for (const [k, v] of map.entries()) {
    args.push(k);
    if (v !== true) args.push(String(v));
  }
  return spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
}

function validateSchema(schema, data) {
  for (const req of schema.required) {
    if (data[req] === undefined) throw new Error(`Missing required field: ${req}`);
  }
  for (const key of Object.keys(data)) {
    if (!schema.properties[key]) throw new Error(`Unexpected property: ${key}`);
    const t = schema.properties[key].type;
    if (t === 'array' && !Array.isArray(data[key])) throw new Error(`${key} must be array`);
    if (t === 'string' && typeof data[key] !== 'string') throw new Error(`${key} must be string`);
    if (t === 'integer' && !Number.isInteger(data[key])) throw new Error(`${key} must be integer`);
  }
}

let passed = 0;
let total = 0;
function test(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`PASS: ${name}`);
  } catch (e) {
    console.error(`FAIL: ${name} -> ${e.message}`);
  }
}

test('Reject ID absent from PLAN', () => {
  const res = run({ '--id': 'JOB-999-ABSENT' });
  if (res.status === 0 || !res.stderr.includes('absent from PLAN')) {
    throw new Error(`Expected absent from PLAN rejection, got: ${res.stderr || res.stdout}`);
  }
});

test('Reject ID found in DONE', () => {
  const res = run({ '--id': 'JOB-000' });
  if (res.status === 0 || !res.stderr.includes('found in DONE')) {
    throw new Error(`Expected found in DONE rejection, got: ${res.stderr || res.stdout}`);
  }
});

test('Reject overlapping live file ownership from STATE', () => {
  const res = run({ '--files': 'src2/engine/pathfinding.js,docs/STARCRAFT_TEARDOWN.md' });
  if (res.status === 0 || !res.stderr.includes('Overlapping live file ownership')) {
    throw new Error(`Expected overlapping ownership rejection, got: ${res.stderr || res.stdout}`);
  }
});

test('Reject missing DONE-WHEN', () => {
  const res = run({ '--done-when': '' });
  if (res.status === 0 || !res.stderr.includes('DONE-WHEN')) {
    throw new Error(`Expected missing DONE-WHEN rejection, got: ${res.stderr || res.stdout}`);
  }
});

test('Reject unmeasurable DONE-WHEN', () => {
  const res = run({ '--done-when': 'should make pathfinding better' });
  if (res.status === 0 || !res.stderr.includes('Unmeasurable DONE-WHEN')) {
    throw new Error(`Expected unmeasurable DONE-WHEN rejection, got: ${res.stderr || res.stdout}`);
  }
});

test('Reject output above context budget', () => {
  const res = run({ '--budget': '50' });
  if (res.status === 0 || !res.stderr.includes('exceeds context budget')) {
    throw new Error(`Expected context budget rejection, got: ${res.stderr || res.stdout}`);
  }
});

test('Valid generation and schema validation', () => {
  const res = run({});
  if (res.status !== 0) throw new Error(`Valid generation failed: ${res.stderr}`);
  const manifestPath = path.join(root, 'context-packs', 'JOB-002-SAMPLE.manifest.json');
  const mdPath = path.join(root, 'context-packs', 'JOB-002-SAMPLE.md');
  if (!fs.existsSync(manifestPath)) throw new Error('Manifest file not emitted');
  if (!fs.existsSync(mdPath)) throw new Error('Markdown bundle not emitted');
  
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  validateSchema(schema, manifest);

  const md = fs.readFileSync(mdPath, 'utf8');
  const sections = ['# Ticket: JOB-002-SAMPLE', '## DONE-WHEN', '## Exact Owned Files', '## Required Interface Signatures', '## Existing Failing Test & Command', '## Dependencies', '## Diff Cap', '## Forbidden Scope'];
  for (const s of sections) {
    if (!md.includes(s)) throw new Error(`Markdown missing section: ${s}`);
  }
});

test('Live pipe PLAN parsing for P0.001', () => {
  const manifestPath = path.join(root, 'context-packs', 'P0.001.manifest.json');
  const mdPath = path.join(root, 'context-packs', 'P0.001.md');
  try {
    const res = run({
      '--id': 'P0.001',
      '--plan': 'PLAN.md'
    });
    if (res.status !== 0) throw new Error(`Valid generation for P0.001 failed: ${res.stderr || res.stdout}`);
    if (!fs.existsSync(manifestPath)) throw new Error('Manifest file not emitted');
    if (!fs.existsSync(mdPath)) throw new Error('Markdown bundle not emitted');

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    validateSchema(schema, manifest);

    const expectedSpec = 'Freeze v2.65.0 as a comparison baseline and record build, bundle, startup, memory, and five-minute console results [P3]';
    const expectedDoneWhen = 'baseline/phase0.csv contains reproducible commands and measurements from two runs';
    if (manifest.spec !== expectedSpec) throw new Error(`spec mismatch: got "${manifest.spec}"`);
    if (manifest.doneWhen !== expectedDoneWhen) throw new Error(`doneWhen mismatch: got "${manifest.doneWhen}"`);

    const md = fs.readFileSync(mdPath, 'utf8');
    if (!md.includes('# Ticket: P0.001')) throw new Error('Markdown missing ticket header');
    if (!md.includes(expectedSpec)) throw new Error('Markdown missing spec');
    if (!md.includes(expectedDoneWhen)) throw new Error('Markdown missing doneWhen');
  } finally {
    if (fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath);
    if (fs.existsSync(mdPath)) fs.unlinkSync(mdPath);
  }
});

test('DONE exact-ID rejection without dot wildcard false positives', () => {
  const tmpDone = path.join(root, 'fixtures', 'tmp-done-test.md');
  const manifestPath = path.join(root, 'context-packs', 'P0.001.manifest.json');
  const mdPath = path.join(root, 'context-packs', 'P0.001.md');
  try {
    fs.writeFileSync(tmpDone, '# DONE\n- [x] P0-001: baseline\n', 'utf8');
    const resWildcard = run({
      '--id': 'P0.001',
      '--plan': 'PLAN.md',
      '--done': 'fixtures/tmp-done-test.md'
    });
    if (resWildcard.stderr.includes('found in DONE')) {
      throw new Error('Dot wildcard false positive: P0-001 falsely rejected P0.001 as found in DONE');
    }

    fs.writeFileSync(tmpDone, '# DONE\n- [x] P0.001: baseline\n', 'utf8');
    const resExact = run({
      '--id': 'P0.001',
      '--plan': 'PLAN.md',
      '--done': 'fixtures/tmp-done-test.md'
    });
    if (resExact.status === 0 || !resExact.stderr.includes('found in DONE')) {
      throw new Error(`Expected exact ID rejection for P0.001 in DONE, got: ${resExact.stderr || resExact.stdout}`);
    }
  } finally {
    if (fs.existsSync(tmpDone)) fs.unlinkSync(tmpDone);
    if (fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath);
    if (fs.existsSync(mdPath)) fs.unlinkSync(mdPath);
  }
});

test('Overlap rejection from STATE.tickets status active/review', () => {
  const tmpState = path.join(root, 'fixtures', 'tmp-state-test.json');
  const tmpOut = path.join(root, 'fixtures', 'tmp-out');
  try {
    fs.writeFileSync(tmpState, JSON.stringify({
      tickets: [
        { id: 'P0.099', status: 'active', files: ['src2/engine/pathfinding.js'] }
      ]
    }, null, 2), 'utf8');
    const resActive = run({
      '--state': 'fixtures/tmp-state-test.json',
      '--files': 'src2/engine/pathfinding.js',
      '--out-dir': 'fixtures/tmp-out'
    });
    if (resActive.status === 0 || !resActive.stderr.includes('Overlapping live file ownership')) {
      throw new Error(`Expected active ticket overlap rejection, got: ${resActive.stderr || resActive.stdout}`);
    }

    fs.writeFileSync(tmpState, JSON.stringify({
      tickets: [
        { id: 'P0.099', status: 'review', files: ['src2/engine/pathfinding.js'] }
      ]
    }, null, 2), 'utf8');
    const resReview = run({
      '--state': 'fixtures/tmp-state-test.json',
      '--files': 'src2/engine/pathfinding.js',
      '--out-dir': 'fixtures/tmp-out'
    });
    if (resReview.status === 0 || !resReview.stderr.includes('Overlapping live file ownership')) {
      throw new Error(`Expected review ticket overlap rejection, got: ${resReview.stderr || resReview.stdout}`);
    }

    fs.writeFileSync(tmpState, JSON.stringify({
      tickets: [
        { id: 'P0.099', status: 'ready', files: ['src2/engine/pathfinding.js'] }
      ]
    }, null, 2), 'utf8');
    const resReady = run({
      '--state': 'fixtures/tmp-state-test.json',
      '--files': 'src2/engine/pathfinding.js',
      '--out-dir': 'fixtures/tmp-out'
    });
    if (resReady.stderr.includes('Overlapping live file ownership')) {
      throw new Error('Ready ticket falsely rejected for overlapping ownership');
    }
  } finally {
    if (fs.existsSync(tmpState)) fs.unlinkSync(tmpState);
    if (fs.existsSync(tmpOut)) fs.rmSync(tmpOut, { recursive: true, force: true });
  }
});

console.log(`\nResults: ${passed}/${total} checks passed.`);
if (passed !== total) process.exit(1);

