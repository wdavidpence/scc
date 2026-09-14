# EVALS

## Required automated gates [P1][P2][P3]
- `bench_tick`: p50/p95/p99 simulation ms at 200, 400, and 800 active units; Phase target at 400 is p95 ≤8 ms and p99 ≤10 ms.
- `bench_frame`: p95 frame ≤16.7 ms at 1080p; 1% low ≥50 FPS; GPU VFX budget ≤2 ms.
- `bench_memory`: peak resident memory ≤1.5 GB; growth after five restart cycles ≤25 MB.
- `replay_hash`: two machines run a 10-minute match and produce identical per-tick and final hashes.
- `input_latency`: pointerdown to selection/order marker/audio acknowledgment p95 <100 ms, target <50 ms local.
- `bench_path`: 400 ground units route in ≤8 ms/tick, zero solid-tile entry, zero diagonal corner cutting, <0.5% stuck after 10 s.
- `terrain_truth`: rasterized terrain mask equals navigation topology for 100% of mountain, cliff, ramp, valley, water, and building cells.
- `arrival_variance`: formation arrival standard deviation ≤0.6 s for 40 units across three valley routes.
- `overlap`: sustained unit overlap area <2% and no pair remains intersecting for >500 ms.
- `bot_matrix`: each matchup produces 45–55% win rate over 1,000 mirrored-seed games after balance lock.
- `economy_curve`: resource/minute and saturation breakpoints remain within ±5% of approved data curves.
- `ttk_matrix`: measured role-pair TTK remains within ±7% of approved tables.
- `readability_200`: role/faction/team classifier accuracy ≥95% from gameplay-scale screenshots.
- `audio_latency`: cached click/order/weapon SFX onset p95 <80 ms; no more than 1 dB clipping incidents per 30-minute run.
- `golden_suite`: all committed replay regressions pass headlessly in under 10 minutes nightly.

## Terrain acceptance gate [P2]
- A ground unit ordered across a mountain takes a legal ramp or valley and never enters a solid cell.
- A ground unit ordered directly onto an inaccessible summit stops at the nearest legal cell and displays unreachable feedback.
- Large units honor one-cell clearance and cannot squeeze through infantry-only gaps.
- Air units cross terrain directly while ground units route around it.
- Destroyed path blockers invalidate cached fields within one simulation tick.
- Automated coverage includes all ramps and at least 100 random cross-map start/goal pairs.

## Phase gate package
Every phase ends with: playable build, deletion-quota proof, automated results CSV, golden replay suite, memory profile, five-tester FUN-GATE digest, release notes, and a 20-line gate report.

## Human FUN-GATE
Five outside testers play 30 minutes. Each scores clarity, weight, control, tension, and would-play-again from 1–5. Median must be ≥3.5; comments are digested to 15 lines. Two failed phase fun gates trigger scope pivot.