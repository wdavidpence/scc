const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const csvPath = path.join(root, 'baseline', 'phase0.csv');
const run1Path = path.join(root, 'baseline', 'phase0-run1.json');
const run2Path = path.join(root, 'baseline', 'phase0-run2.json');

const EXPECTED_HEADERS = [
  'run_id', 'commit', 'bundle', 'build_exit', 'build_ms',
  'startup_ms', 'peak_rss_mb', 'console_errors', 'play_seconds', 'restart_ok'
];

const REQUIRED_EXERCISE_KEYS = [
  'title_start', 'selection', 'move_order', 'terrain_navigation',
  'economy', 'combat', 'end_state', 'return_restart'
];

const REQUIRED_COMMAND_KEYS = [
  'build_command', 'stage_command', 'serve_command', 'measure_rss_command'
];

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

if (!fs.existsSync(csvPath)) {
  fail(`CURRENT FAILURE: ${csvPath} does not exist.\nNo two-run baseline records are available.`);
}

if (!fs.existsSync(run1Path) || !fs.existsSync(run2Path)) {
  fail(`CURRENT FAILURE: Baseline run JSON artifacts missing (${run1Path} or ${run2Path}).\nNo two-run baseline records are available.`);
}

let expectedCommit = '';
try {
  expectedCommit = execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim();
} catch (e) {
  expectedCommit = '';
}

const csvRaw = fs.readFileSync(csvPath, 'utf8');
const lines = csvRaw.split('\n').map(l => l.trim()).filter(Boolean);
const commentLines = lines.filter(l => l.startsWith('#'));
const dataLines = lines.filter(l => !l.startsWith('#'));

if (dataLines.length !== 3) {
  fail(`Expected header and exactly 2 CSV data rows, got ${dataLines.length - 1} data rows.`);
}

const headerCols = dataLines[0].split(',').map(c => c.trim());
if (headerCols.length !== EXPECTED_HEADERS.length || !EXPECTED_HEADERS.every((col, i) => headerCols[i] === col)) {
  fail(`CSV header mismatch. Expected: ${EXPECTED_HEADERS.join(',')}, got: ${headerCols.join(',')}`);
}

const rows = [dataLines[1].split(',').map(c => c.trim()), dataLines[2].split(',').map(c => c.trim())];
const rowObjs = rows.map(cols => {
  if (cols.length !== EXPECTED_HEADERS.length) fail(`CSV row column count mismatch. Expected ${EXPECTED_HEADERS.length}, got ${cols.length}`);
  const obj = {};
  EXPECTED_HEADERS.forEach((h, i) => { obj[h] = cols[i]; });
  return obj;
});

if (rowObjs[0].run_id === rowObjs[1].run_id) {
  fail(`Runs must have distinct run_ids: ${rowObjs[0].run_id} vs ${rowObjs[1].run_id}`);
}

if (rowObjs[0].commit !== rowObjs[1].commit) {
  fail(`Runs must share the same commit: ${rowObjs[0].commit} vs ${rowObjs[1].commit}`);
}

if (expectedCommit && rowObjs[0].commit !== expectedCommit) {
  fail(`CSV commit ${rowObjs[0].commit} does not match current HEAD ${expectedCommit}`);
}

rowObjs.forEach((r, idx) => {
  if (parseInt(r.build_exit, 10) !== 0) fail(`Run ${r.run_id} build_exit must be 0, got ${r.build_exit}`);
  if (parseFloat(r.play_seconds) < 300) fail(`Run ${r.run_id} play_seconds must be >= 300, got ${r.play_seconds}`);
  if (r.restart_ok !== 'true') fail(`Run ${r.run_id} restart_ok must be true, got ${r.restart_ok}`);
  if (parseFloat(r.build_ms) <= 0) fail(`Run ${r.run_id} build_ms must be positive, got ${r.build_ms}`);
  if (parseFloat(r.startup_ms) <= 0) fail(`Run ${r.run_id} startup_ms must be positive, got ${r.startup_ms}`);
  if (parseFloat(r.peak_rss_mb) <= 0) fail(`Run ${r.run_id} peak_rss_mb must be positive, got ${r.peak_rss_mb}`);
});

const runPaths = [run1Path, run2Path];
const runJsons = runPaths.map(p => {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    fail(`Invalid JSON in evidence file ${p}: ${e.message}`);
  }
});

runJsons.forEach((json, idx) => {
  const r = rowObjs[idx];
  if (String(json.run_id) !== String(r.run_id)) fail(`JSON run_id ${json.run_id} != CSV run_id ${r.run_id}`);
  if (json.commit !== r.commit) fail(`JSON commit ${json.commit} != CSV commit ${r.commit}`);
  if (String(json.bundle) !== String(r.bundle)) fail(`JSON bundle != CSV bundle`);
  if (json.build_exit !== 0) fail(`JSON build_exit must be 0`);
  if (json.play_seconds < 300) fail(`JSON play_seconds must be >= 300, got ${json.play_seconds}`);
  if (json.restart_ok !== true) fail(`JSON restart_ok must be true`);

  if (!json.commands || typeof json.commands !== 'object') {
    fail(`JSON missing commands object in ${runPaths[idx]}`);
  }
  for (const cmdKey of REQUIRED_COMMAND_KEYS) {
    if (!json.commands[cmdKey] || typeof json.commands[cmdKey] !== 'string') {
      fail(`JSON commands missing required key ${cmdKey} in ${runPaths[idx]}`);
    }
  }

  if (!json.exercise || typeof json.exercise !== 'object') {
    fail(`JSON missing exercise evidence object in ${runPaths[idx]}`);
  }
  for (const exKey of REQUIRED_EXERCISE_KEYS) {
    if (json.exercise[exKey] === undefined) {
      fail(`JSON exercise missing required key ${exKey} in ${runPaths[idx]}`);
    }
  }
});

console.log('PASS: verify-p0001-baseline validated 2 runs successfully.');
console.log(`Commit: ${rowObjs[0].commit}`);
console.log(`Run 1: ${rowObjs[0].play_seconds}s play, build ${rowObjs[0].build_ms}ms, peak RSS ${rowObjs[0].peak_rss_mb} MB`);
console.log(`Run 2: ${rowObjs[1].play_seconds}s play, build ${rowObjs[1].build_ms}ms, peak RSS ${rowObjs[1].peak_rss_mb} MB`);
process.exit(0);
