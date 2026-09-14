# AGENTS

## Doctrine
- One ticket equals one PLAN bullet ID. No work exists outside a bullet ID.
- Grep `DONE.md` before starting. A completed ID is invalid work.
- Every ticket requires a generated context pack from `tools/context-pack.mjs`.
- Context packs contain only the bullet spec, exact owned files, required signatures, failing test, dependencies, diff cap, and forbidden scope.
- Never scan the repository from a ticket. Request a corrected context pack instead.
- No unrequested features. Record noticed work in `BACKLOG.md`, then abandon it.
- No refactor without an authorizing bullet. Revert cosmetic drift before gameplay gates.
- Diff cap is approximately 400 changed lines. Stop, split, and report on breach.
- Two consecutive DONE-WHEN failures: stop and escalate in at most 10 lines; never attempt a third fix.
- Build the harness before the feature. Every passing change adds or strengthens a test.
- Small, reversible diffs; concrete code over abstraction; specification is truth and code is artifact.
- Unmeasurable outcomes require an explicit human gate.

## Worker routing
- Antigravity: primary build, run, debug, local edits, and multi-file tickets.
- Qwen3.8-Flash-Next: one active task maximum on M3 Ultra/96 GB; use for bounded analysis, test design, asset census, and data work. Never queue parallel Qwen jobs.
- Luna GPT-5.6: escalation only after two failures or when Qwen-class pass rate for the ticket class falls below 60%; executes the approved pack and never replans.
- Claude/Anthropic models are prohibited.
- Primary frontier operator alone performs commits, pushes, releases, GitHub mutations, and final gate verdicts.
- Parallel tickets require disjoint file ownership recorded in `STATE.json`.

## STATE.json kanban
Statuses: `blocked`, `ready`, `active`, `review`, `done`, `failed`. Each item records ID, owner, exact files, dependencies, attempt count, started time, and context-pack path. One live owner per file.

## SRP V2
One ticket has one reason to change, one measurable DONE-WHEN, and one bounded file ownership set. If implementation reveals two responsibilities, stop and split the ticket.

## Bootstrap Kit
Before work: context pack, clean diff baseline, failing test, exact test command, build command, rollback point, and ledger row. Missing any item means STOP.

## Fixed report
`TICKET | STATUS | DONE-WHEN result | diff stat | next | blockers`

## AUTORUN
Pull the next unblocked PLAN bullet from `STATE.json`; verify not in `DONE.md`; claim files; execute; run DONE-WHEN; commit locally on pass; append `DONE.md` and `ledger.csv`; release files; loop for N hours. Exit only at gate, two failures, diff breach, blocker, or time cap.

## Gate handling
Run full EVALS, build a release candidate, write `RELEASE_NOTES.md`, and return a 20-line digest only. Architect verdict is PASS or FAIL plus at most 10 corrective tickets.

## Golden replays
Every simulation bug becomes a replay in `tests/golden/` and runs in CI forever. Nightly headless suite finishes under 10 minutes.

## Ledger
`ledger.csv`: bullet ID, model, attempts, input tokens, output tokens, wall-clock seconds, pass/fail, changed lines. Weekly routing uses measured cost per passed ticket.

## Fun gate
Every phase gate includes five outside testers playing 30 minutes. Score clarity, weight, control, tension, and would-play-again from 1–5. Median below 3.5 is FAIL regardless of automated results.