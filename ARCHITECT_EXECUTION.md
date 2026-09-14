# Architect execution

Defaults accepted by user.

## Worker constraints
- Local Qwen3.8-Flash-Next: exactly one active task at a time. Approx. 400 tok/s prefill, 30 tok/s output at 256K context. Never queue parallel Qwen tasks.
- Antigravity: primary build/run/debug and multi-file worker.
- Luna GPT-5.6: escalation only; executes an approved ticket without replanning.
- Claude/Anthropic: prohibited.

## Active sequence
1. JOB-000 repository/build/play digest via Antigravity. Output: DIGEST.md.
2. JOB-001 public gameplay-parameter teardown via Antigravity, independent of repository. Output: STARCRAFT_TEARDOWN.md.
3. JOB-002 context-pack generator via Antigravity after JOB-000. Output: tooling plus validated sample pack.
4. Architect reads only the job digests, then emits PILLARS.md, REALITY_GATE.md, ART.md, AGENTS.md, EVALS.md and PLAN.md bullets 001-100.
5. Stop for user NEXT before PLAN bullets 101-200.

## Gate
No Phase 1 implementation begins until JOB-000/001/002 and the governance/design documents are accepted.