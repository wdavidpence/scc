import fs from 'node:fs';
import path from 'node:path';

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function generateContextPack(opts) {
  if (!opts.id) throw new Error('Missing bullet ID');
  const escapedId = escapeRegex(opts.id);
  const done = fs.readFileSync(opts.done, 'utf8');
  if (new RegExp(`(?<![A-Za-z0-9.-])${escapedId}(?![A-Za-z0-9.-])`).test(done)) {
    throw new Error(`ID "${opts.id}" is found in DONE`);
  }
  const plan = fs.readFileSync(opts.plan, 'utf8');
  let parsedSpec = '';
  let parsedDoneWhen = '';
  let parsedDeps = '';

  const checklistRegex = new RegExp(`^[-*]\\s*\\[[ xX ]\\]\\s*${escapedId}\\s*:\\s*([^\\n]+)(?:\\n\\s+DONE-WHEN:\\s*([^\\n]+))?`, 'm');
  const checklistMatch = plan.match(checklistRegex);
  if (checklistMatch) {
    parsedSpec = checklistMatch[1].trim();
    parsedDoneWhen = checklistMatch[2] ? checklistMatch[2].trim() : '';
  } else {
    const pipeRegex = new RegExp(`^[ \\t]*${escapedId}[ \\t]*\\|[ \\t]*(.*)$`, 'm');
    const pipeMatch = plan.match(pipeRegex);
    if (pipeMatch) {
      const segments = pipeMatch[1].split('|').map(s => s.trim());
      parsedSpec = segments[0] || '';
      const doneWhenSeg = segments.find(s => /^DONE-WHEN\b/i.test(s));
      parsedDoneWhen = doneWhenSeg ? doneWhenSeg.replace(/^DONE-WHEN\s*[:\s]\s*/i, '').trim() : '';
      const depsSeg = segments.find(s => /^DEPS\b/i.test(s));
      parsedDeps = depsSeg ? depsSeg.replace(/^DEPS\s*[:\s]\s*/i, '').trim() : '';
    } else {
      throw new Error(`ID "${opts.id}" is absent from PLAN`);
    }
  }

  const state = JSON.parse(fs.readFileSync(opts.state, 'utf8'));
  const files = Array.isArray(opts.files) ? opts.files : opts.files ? opts.files.split(',').map(s => s.trim()) : [];
  const liveJobs = [
    ...(state.activeJobs || []),
    ...((state.tickets || []).filter(t => t.status === 'active' || t.status === 'review'))
  ];
  for (const job of liveJobs) {
    if (job.id === opts.id) continue;
    const overlap = files.find(f => (job.files || []).includes(f));
    if (overlap) throw new Error(`Overlapping live file ownership from STATE for file: ${overlap}`);
  }
  const spec = opts.spec || parsedSpec;
  const rawDoneWhen = opts.doneWhen !== undefined ? String(opts.doneWhen) : parsedDoneWhen;
  const doneWhen = rawDoneWhen.trim();
  if (!doneWhen) throw new Error('Missing DONE-WHEN');
  if (!/(exit[s]?\s+\d+|exit\s*code\s*\d+|pass(es|ing)?\b|fail(s|ing)?\b|===?|>=?|<=?|[≥≤]|\b0\s+errors\b|\bcontains\b)/i.test(doneWhen)) {
    throw new Error('Unmeasurable DONE-WHEN');
  }
  const signatures = Array.isArray(opts.signatures) ? opts.signatures : opts.signatures ? opts.signatures.split(',').map(s => s.trim()) : [];
  const deps = Array.isArray(opts.deps)
    ? opts.deps
    : (opts.deps && opts.deps !== 'none'
        ? opts.deps.split(',').map(s => s.trim())
        : (parsedDeps && parsedDeps !== 'none' ? parsedDeps.split(',').map(s => s.trim()) : []));
  const forbidden = Array.isArray(opts.forbiddenScope) ? opts.forbiddenScope : (opts.forbiddenScope ? opts.forbiddenScope.split(';').map(s => s.trim()) : []);
  const failingTestContent = fs.readFileSync(opts.failingTest, 'utf8').trim();
  const diffCap = Number(opts.diffCap || 400);
  const md = `# Ticket: ${opts.id}\nSpec: ${spec}\n\n## DONE-WHEN\n${doneWhen}\n\n## Exact Owned Files\n${files.map(f => `- ${f}`).join('\n')}\n\n## Required Interface Signatures\n${signatures.map(s => `- ${s}`).join('\n')}\n\n## Existing Failing Test & Command\nCommand: ${opts.testCommand}\n\`\`\`\n${failingTestContent}\n\`\`\`\n\n## Dependencies\n${deps.length ? deps.map(d => `- ${d}`).join('\n') : 'None'}\n\n## Diff Cap\n${diffCap} lines\n\n## Forbidden Scope\n${forbidden.map(f => `- ${f}`).join('\n')}\n`;
  const budget = Number(opts.budget || 4096);
  if (Buffer.byteLength(md, 'utf8') > budget) throw new Error(`Output exceeds context budget: ${Buffer.byteLength(md, 'utf8')} > ${budget}`);
  const manifest = { id: opts.id, spec, doneWhen, files, signatures, failingTest: opts.failingTest, testCommand: opts.testCommand, deps, diffCap, forbiddenScope: forbidden };
  const outDir = opts.outDir || 'context-packs';
  fs.mkdirSync(outDir, { recursive: true });
  const mdPath = path.join(outDir, `${opts.id}.md`);
  const manifestPath = path.join(outDir, `${opts.id}.manifest.json`);
  fs.writeFileSync(mdPath, md, 'utf8');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return { mdPath, manifestPath, md, manifest };
}

if (process.argv[1] && (process.argv[1].endsWith('context-pack.mjs') || process.argv[1].endsWith('context-pack'))) {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const k = args[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const hasVal = i + 1 < args.length && !args[i + 1].startsWith('--');
      opts[k] = hasVal ? args[++i] : true;
    }
  }
  try {
    generateContextPack(opts);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
