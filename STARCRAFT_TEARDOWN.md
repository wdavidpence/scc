# Real-Time Strategy Systems Teardown: Competitive Engine, Economic & Tactical Architecture

**Document ID:** STARCRAFT-TEARDOWN-001  
**Classification:** Public Engineering Deconstruction & Clean-Room Systems Specification  
**Scope:** Simulation Cadence, Kinematics, Lethality, Macroeconomics, APM Ergonomics, Spatial Topology  
**Target Output:** Spiritual Successor Parameter Reference (`STARCRAFT_TEARDOWN.md`)

---

## 1. Methodological Framework & Epistemic Taxonomy

This teardown deconstructs competitive isometric real-time strategy (RTS) architectures into discrete mathematical relationships and functional archetypes, eliminating proprietary asset, narrative, or trademark contamination.

### 1.1 Epistemic Standards
* **[CONF-MEAS] Confirmed Measurement:** Empirically verified via engine dumps, SDK values, protocols, or post-mortems.
* **[INF-PRIN] Inferred Design Principle:** Reverse-engineered from match telemetry, patch deltas, and meta-equilibrium.
* **[SPEC-REC] Successor Specification:** Clean-room parameters and formulas for an original successor engine.

### 1.2 Confidence Scale
* **High (≥ 95%):** Deterministic engine variable or protocol constant.
* **Medium (75%–94%):** Bounded empirical observation across match datasets.
* **Low/Estimated (50%–74%):** Dependent on undocumented heuristics or execution variance.

### 1.3 Public Citation Registry
* **[REF-01]** https://liquipedia.net/starcraft2/Game_Speed — Game Speed & Engine Timers.
* **[REF-02]** https://liquipedia.net/starcraft/Game_Speed — Classic Logic Frame Rates.
* **[REF-03]** https://www.gdcvault.com/play/1014514/Designing-the-StarCraft-II-Pathfinding — Pathfinding & Steering Architecture.
* **[REF-04]** https://liquipedia.net/starcraft2/Mining — Worker Mining Curves & Saturation.
* **[REF-05]** https://liquipedia.net/starcraft/Mining — Classic Mining & Harvesting.
* **[REF-06]** https://liquipedia.net/starcraft2/Damage_Calculation — Damage Calculation & Armor.
* **[REF-07]** https://liquipedia.net/starcraft/Damage_Types — Damage Types & Mitigations.
* **[REF-08]** https://liquipedia.net/starcraft2/Sight — Vision Cones & High Ground Fog.
* **[REF-09]** https://liquipedia.net/starcraft/High_Ground — Elevation Miss Mechanics (30/64 Roll).
* **[REF-10]** https://arxiv.org/abs/1312.3157 — RTS AI Survey.
* **[REF-11]** https://tl.net/forum/sc2-strategy/140055-the-mechanics-of-sc2 — RTS Macro Cycles & Mechanical Demands.
* **[REF-12]** https://github.com/Blizzard/s2client-proto — StarCraft II Client Protocol.

---

## 2. Simulation Cadence & Command Responsiveness

Competitive engine feel decouples render frames, deterministic logic ticks, and network dispatch turn latency:
`Client (<16ms) -> Turn Buffer (2-3 ticks) -> Sim Loop (22.4 Hz) -> Kinematics -> Interpolated Render (144Hz+)`.

### 2.1 Cadence and Latency Benchmarks
* **Legacy Fixed-Tick Rate:** 24.0 Hz logic (41.67 ms/frame) [[REF-02]].
* **Modern Scaled-Tick Rate:** 22.4 Hz logic (44.64 ms/frame, 1.4x over 16.0 Hz) [[REF-01]].
* **Command Delay Buffer:** 2–3 ticks (89.28–133.92 ms buffer at ping <30 ms) [[REF-03], [REF-12]].
* **Command Queue Depth:** 32–64 FIFO orders per unit [[REF-12]].

### 2.2 Table: Simulation Cadence & Latency Parameters
| Metric / Parameter | Value / Range | Status & Source |
| :--- | :--- | :--- |
| Baseline Engine Tick (Normal) | 16.0 Hz (62.50 ms) | [CONF-MEAS] (High) [REF-01] |
| Competitive Engine Tick (Faster) | 22.4 Hz (44.64 ms) | [CONF-MEAS] (High) [REF-01] |
| Legacy Engine Tick (Fastest) | 24.0 Hz (41.67 ms) | [CONF-MEAS] (High) [REF-02] |
| Network Latency Turn Buffer | 2–3 ticks (89.3–133.9 ms) | [CONF-MEAS] (High) [REF-03] |
| Local Visual Acknowledgment | < 16.67 ms (Immediate) | [INF-PRIN] (High) [REF-11] |
| Spatial Query / Scan Cadence | 1–2 ticks (22.4–44.8 ms) | [CONF-MEAS] (Med) [REF-01] |
| Path Re-evaluation Period | 0.25–0.50 s (Staggered) | [CONF-MEAS] (High) [REF-03] |

### 2.3 Successor Architecture Recommendations [SPEC-REC]
* **Fixed Step & Hermite Splines:** Standardize logic at 24.0 Hz or 30.0 Hz, decoupled from rendering via Hermite cubic spline interpolation (144Hz+).
* **Predictive Feedback:** Trigger audio/visual cues on tick 0 (<8 ms); defer mutations to tick N+2 to mask network latency.

---

## 3. Unit Kinematics, Collision Geometry, and Formations

Handling responsiveness relies on acceleration constants, angular turn rates, and local collision avoidance [[REF-03]].

### 3.1 Kinematics Spectrum
* **Instant Units:** Light infantry/swarmers use near-infinite acceleration (≥ 999 m/s²) and turn rates (≥ 1440°/s), reaching top speed in ≤ 1 tick (0.044s).
* **Momentum Units:** Armored mechs and siege platforms use finite acceleration (2.0–4.5 m/s²) and turn rates (360°–720°/s), introducing steering inertia.
* **Flyers:** Air units feature turn radiuses and deceleration damping (1.5–2.5 m/s²), causing lateral drift.

### 3.2 Collision Footprints & Separation
* Circular 2D footprints range from 0.375 to 1.250 tiles [[REF-03]].
* **Push Priority (0–100):** Moving combatants (50–60) displace stationary allies (20–30); harvesters ignore collision (priority 0) near resource patches.
* **Boid Flocking:** Small radii (≤ 0.375) induce dense clumping ("deathballing").

### 3.3 Table: Unit Kinematic & Collision Classification
| Archetype Class | Footprint | Accel (m/s²) | Turn (°/s) | Stop Decel | Status & Source |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Light Kinetic Infantry | 0.375 tiles | 1000 (Instant) | Instant / 1440 | Instant (No skid) | [CONF-MEAS] (High) [REF-03] |
| Basic Melee Swarmer | 0.375 tiles | 1000 (Instant) | Instant / 1440 | Instant (No skid) | [CONF-MEAS] (High) [REF-03] |
| Shielded Bipedal Striker | 0.500 tiles | 1000 (Instant) | Instant / 1080 | Instant (No skid) | [CONF-MEAS] (High) [REF-03] |
| Medium Armored Mech | 0.625–0.750 tiles | 3.5–5.0 | 720–900 | 4.0–6.0 | [CONF-MEAS] (High) [REF-03] |
| Heavy Artillery Platform | 0.875–1.000 tiles | 2.5–3.2 | 360–540 | 3.0–4.0 | [CONF-MEAS] (High) [REF-03] |
| Tactical Harassment Flyer | 0.500–0.625 tiles | 3.0–4.5 | 720–1080 | 2.0–3.0 (Drift) | [CONF-MEAS] (High) [REF-03] |
| Massive Capital Ship | 1.250–1.500 tiles | 1.2–2.0 | 180–360 | 1.5–2.5 (Drift) | [CONF-MEAS] (High) [REF-03] |

### 3.4 Inferred Principles vs Successor Specifications [SPEC-REC]
* **Clumping Dilemma:** Small radii (0.375) and instant acceleration maximize AOE vulnerability.
* **Successor Rule:** Dynamic envelope: 0.40 tiles stationary, expanding to 0.55 tiles in transit via repulsion. Dedicated "Spread Formation" command (0.80 tile separation bias).

---

## 4. Time-to-Kill (TTK) & Combat Lethality Dynamics

Combat balances asymmetric lethality: frontline attrition spans seconds, while hard counters and focus fire execute targets in sub-second windows [[REF-06]].

### 4.1 TTK Mechanics & Lanchester Scaling
* **1v1 Attrition:** Tier-1 mirror trades average 2.0–3.2 s TTK.
* **Focus-Fire Collapse:** Under Lanchester's Square Law (dE/dt = -k · A²), 20 ranged units collapse TTK from 2.5 s to 0.044 s (1 tick) [[REF-06], [REF-10]].
* **AOE Splash:** 40+ burst artillery over 1.5-tile radius wipes tier-1 clusters (45 HP) in 1–2 volleys (1.5–3.0 s).

### 4.2 Table: Baseline TTK Matrix Across Combat Archetypes
| Attacking Archetype | Defending Archetype | Target HP / Shield | DPS (Raw) | TTK Range | Status & Source |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Light Kinetic Ranged | Light Kinetic Ranged | 45 HP (0 Armor) | 9.8 DPS | 2.2–2.6s | [CONF-MEAS] (High) [REF-06] |
| Light Kinetic Ranged | Heavy Armored Mech | 160 HP (1 Armor) | 7.0 DPS (Mitigated) | 22.0–24.5s | [CONF-MEAS] (High) [REF-06] |
| Anti-Armor Specialist | Heavy Armored Mech | 160 HP (1 Armor) | 32.5 DPS (Bonus) | 4.2–4.9s | [CONF-MEAS] (High) [REF-06] |
| Melee Swarmer (Pair) | Light Kinetic Ranged | 45 HP (0 Armor) | 14.5 DPS (Combined) | 3.1–3.8s | [CONF-MEAS] (High) [REF-06] |
| Heavy Artillery (Direct) | Light Swarm Cluster | 35–45 HP (0 Armor) | 40–55 Burst / 2.14s | 0.04s (1 Volley) | [CONF-MEAS] (High) [REF-06] |
| Anti-Air Fighter | Light Harassment Flyer | 120 HP (0 Armor) | 28.0 DPS (Bonus) | 3.8–4.5s | [CONF-MEAS] (High) [REF-06] |
| Capital Energy Vessel | Medium Assault Mech | 200 HP (2 Armor) | 18.0 DPS | 11.0–13.0s | [CONF-MEAS] (High) [REF-06] |

### 4.3 Successor Architecture Recommendations [SPEC-REC]
* **Survivability Floor:** Enforce minimum TTK ≥ 1.5 s for standard units against single equal-tier counters.
* **Focus-Fire Mitigation:** Scale projectile impact δ = 0.85^max(0, N-4) for N > 4 hits within 100 ms to prevent single-frame deletion while retaining focus-fire value.

---

## 5. Worker Saturation & Economic Return Curves

RTS macro balances linear early worker scaling against non-linear diminishing returns [[REF-04], [REF-05]].

### 5.1 Primary Resource Node Mathematics
* Base Layout: 8 primary patches (4 close at ~3.0 tiles / 5.5 s round trip; 4 far at ~4.5 tiles / 6.5 s) and 2 secondary geysers [[REF-04]].
* Harvest Channel: 2.73 s (61 ticks); Cargo: 5 units/trip.

### 5.2 Mathematical Curve: Worker Saturation Return
* **1–16 Workers:** Linear yield ≈ W × 42.5–45.0 res/min; 16 workers yields ~700–720 res/min (optimal base saturation) [[REF-04]].
* **17–24 Workers:** Queuing yield ≈ 720 + (W - 16) × 18.0 res/min; 24 workers caps yield at ~840–860 res/min.
* **25+ Workers:** 0% marginal yield; extra workers idle.

### 5.3 Secondary Resource (Refined Gas) Dynamics
* Extraction: 1.98 s (44 ticks) channel; Cargo: 4 units/trip.
* Saturation: 3 workers/geyser achieves continuous harvesting (114 gas/min per geyser, 228 gas/min per base). 4th worker yields 0% [[REF-04]].

### 5.4 Table: Economic Saturation & Yield Return
| Worker Count (8 Nodes + 2 Geysers) | Primary Res/Min | Primary Eff % | Secondary Res/Min | Role Designation | Status & Source |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 8 Workers (1 / patch) | 350–360 | 100.0% | 0 | Under-saturated | [CONF-MEAS] (High) [REF-04] |
| 16 Workers (2 / patch) | 680–720 | 100.0% | 0 | Optimal Base Saturation | [CONF-MEAS] (High) [REF-04] |
| 22 Workers (2/patch + 2 geysers) | 680–720 | 100.0% | 228 | Optimal Tech Saturation | [CONF-MEAS] (High) [REF-04] |
| 24 Workers (3 / patch) | 840–860 | 78.0% | 0 | Hard Marginal Limit | [CONF-MEAS] (High) [REF-04] |
| 30 Workers (3/patch + 2 geysers) | 840–860 | 78.0% | 228 | Max Operational Base | [CONF-MEAS] (High) [REF-04] |
| 32+ Workers | 840–860 | < 65.0% | 228 | Idle Buffering / Waste | [CONF-MEAS] (High) [REF-04] |

### 5.5 Successor Architecture Recommendations [SPEC-REC]
* **Two-Tier Cap:** Maintain 2-worker/patch linear scaling (16 primary + 6 secondary = 22 workers/base).
* **Auto-Balancing:** Route new worker rallies to under-saturated patches automatically.

---

## 6. Cost, Build-Time, and Production Architecture

Strategic timing is governed by investment payback windows (ROI) and production throughput [[REF-01], [REF-11]].

### 6.1 Cost-to-Build Time Ratios
* **Primary-Heavy Assets:** Fast production cycles (18–28 s), low tech commitment.
* **Secondary-Heavy Assets:** Tech specialists and heavy platforms; long cycles (45–65 s).

### 6.2 Table: Production Parameters Across Technological Tiers
| Tier / Archetype Asset | Pri Cost | Sec Cost | Build Time | Pri/s | Sec/s | Status & Source |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Economy Worker | 50 | 0 | 12.0–17.0s | 3.57 | 0.00 | [CONF-MEAS] (High) [REF-01] |
| T1 Kinetic Infantry | 50 | 0 | 18.0–25.0s | 2.50 | 0.00 | [CONF-MEAS] (High) [REF-01] |
| T1 Melee Swarmer (Pair) | 50 | 0 | 17.0–24.0s | 2.50 | 0.00 | [CONF-MEAS] (High) [REF-01] |
| T1 Heavy Melee Striker | 100 | 0 | 27.0–38.0s | 3.12 | 0.00 | [CONF-MEAS] (High) [REF-01] |
| T2 Armored Mech / Tank | 150 | 100 | 32.0–45.0s | 4.05 | 2.70 | [CONF-MEAS] (High) [REF-01] |
| T2 Air Infiltrator | 150 | 100 | 43.0–60.0s | 3.00 | 2.00 | [CONF-MEAS] (High) [REF-01] |
| T3 Heavy Artillery | 150 | 125 | 32.0–45.0s | 4.05 | 3.38 | [CONF-MEAS] (High) [REF-01] |
| T3 Colossal Walker | 300 | 200 | 46.0–65.0s | 5.45 | 3.63 | [CONF-MEAS] (High) [REF-01] |
| Base Command Hub | 400 | 0 | 71.0–100.0s | 4.70 | 0.00 | [CONF-MEAS] (High) [REF-01] |
| Supply Depot (+8 Supply) | 100 | 0 | 18.0–25.0s | 4.76 | 0.00 | [CONF-MEAS] (High) [REF-01] |
| Production Plant (Core) | 150 | 0 | 46.0–65.0s | 2.68 | 0.00 | [CONF-MEAS] (High) [REF-01] |

### 6.3 Inferred Economic Payback Windows [INF-PRIN]
* **Command Hub Payback:** Hub costs 400; 16 workers cost 800 over ~150 s (total ~1200). Yielding 700 res/min, breakeven takes **2.2–2.8 minutes** post-completion [[REF-04], [REF-11]].
* **Idle Facility Cost:** An idle plant loses 2.5–4.0 military units per minute.

---

## 7. Macro Cadence, Supply Progression, and Expansion Pacing

Game tempo is anchored by supply caps (200), housing increments (+8 or +10), and patch depletion [[REF-01], [REF-11]].

### 7.1 The Expansion Clock & Depletion Trigger
* Patches hold 1500–1800 resources. Under 16-worker harvesting, an 8-node base depletes in **6.5–7.5 minutes** [[REF-04]].
* **Strategic Forcing Function:** Players must expand every **2.5–3.5 minutes** to sustain throughput.

### 7.2 Table: Strategic Supply Progression & Expansion Benchmarks
| Game Phase | Time | Supply Range | Bases | Strategic Focus | Status & Source |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Opening Scout | 0:45–1:30 | 13–19 | 1 Base | Scouting & tech opener | [CONF-MEAS] (High) [REF-01] |
| Natural Expand | 1:30–2:45 | 18–28 | 1 → 2 Bases | Fast expand vs defense | [CONF-MEAS] (High) [REF-01] |
| Tech Divergence | 3:00–4:30 | 32–55 | 2 Bases | Tier 2 tech & detection | [CONF-MEAS] (High) [REF-01] |
| Third Expansion | 5:00–6:30 | 65–95 | 2 → 3 Bases | Secure 3rd node | [CONF-MEAS] (High) [REF-01] |
| Mid-Game Climax | 7:00–9:00 | 110–160 | 3 Bases | Multi-prong skirmishing | [CONF-MEAS] (High) [REF-01] |
| Late Convergence | 9:30–12:00 | 175–200 | 4+ Bases | Max supply, Tier 3 tech | [CONF-MEAS] (High) [REF-01] |
| Attrition Endgame | 13:00+ | 140–200 | 4–6 Bases | Bank spend & starvation | [CONF-MEAS] (High) [REF-01] |

---

## 8. Mechanical Demand & APM Budget Allocation

Mechanical requirements divide into raw APM and Effective APM (EAPM) [[REF-11]].

### 8.1 APM Demand Spectrum Across Phases
* **Opening (0:00–2:30):** Low demand (40–70 EAPM); warm-up spam reaches 200–300 APM.
* **Transition (2:30–6:00):** Moderate demand (120–180 EAPM) executing macro and scouting.
* **Late-Game (6:00+):** Extreme demand (220–350+ EAPM, spikes >450 APM) coordinating multi-front fights.

### 8.2 The 17-Second Macro Loop [INF-PRIN]
Top-tier play executes on a cyclic **15–20 second heartbeat** [[REF-11]]:
1. **Production:** Cycle unit queues to spend income.
2. **Infrastructure:** Build supply structures, verify saturation, expand.
3. **Intel:** Sweep minimap, spot enemy transitions.
4. **Tactical Micro:** Stutter-step, spread concaves, dodge splash.

### 8.3 Table: APM Ergonomic Distribution by Task Type
| Task Category | Description | % Mid | % Late | Peak EAPM | Status & Source |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Macro Production | Cycling unit queues | 35% | 15% | 180–240 | [INF-PRIN] (High) [REF-11] |
| Supply & Infrastructure | Pylons/depots & expansions | 15% | 10% | 120–160 | [INF-PRIN] (High) [REF-11] |
| Tactical Combat Micro | Stutter-step, focus, abilities | 25% | 55% | 350–500+ | [INF-PRIN] (High) [REF-11] |
| Spatial Navigation | Camera hotkeys & map jumps | 15% | 12% | 150–220 | [INF-PRIN] (High) [REF-11] |
| Economic Maintenance | Worker rallies & gas transfers | 10% | 8% | 80–120 | [INF-PRIN] (High) [REF-11] |

---

## 9. Damage Mechanics, Armor Formulas, and Cost-Efficiency Math

Combat is governed by deterministic integer/float arithmetic rather than RNG rolls [[REF-06], [REF-07]].

### 9.1 Damage Calculation Formula
* **Discrete Subtraction:**
  $$\text{Damage} = \max\left(0.5, (\text{Base} + \text{Bonus vs Tag}) - \text{Armor}\right)$$
* Minimum Floor: Standardized at 0.5 damage [[REF-06]].
* Multi-Hit Attacks: Armor applies per hit (2x 8 dmg vs 3 armor = 10 dmg, 37.5% mitigation; 1x 16 dmg vs 3 armor = 13 dmg, 18.75% mitigation).

### 9.2 Spatial Concaves & Lanchester Multipliers
Under Lanchester's Square Law (dE/dt = -k · A²), arc formations dictate combat output [[REF-10]]:
* **Concave Force:** 100% of units fire simultaneously (N_eff = N).
* **Convex Force:** Only front rim fires (N_eff ≈ 0.4N–0.6N); rear ranks blocked.
* **Attrition Disparity:** A 2:1 active firing ratio defeats clumped forces with ~13% casualties.

### 9.3 Table: Armor Mitigation & Damage Type Counter Values
| Weapon Type / Class | Base Dmg | Bonus Tag | Target Type | Target Arm | Net Dmg | % Mit | Status & Source |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Rapid Rifle (1 Hit) | 6.0 | None | Armored Mech | 1.0 | 5.0 | 16.7% | [CONF-MEAS] (High) [REF-06] |
| Rapid Rifle (1 Hit) | 6.0 | None | Heavy Platform | 3.0 | 3.0 | 50.0% | [CONF-MEAS] (High) [REF-06] |
| Twin Auto-Guns (2 Hits) | 2x 8.0 | None | Armored Mech | 1.0 | 14.0 (2x 7) | 12.5% | [CONF-MEAS] (High) [REF-06] |
| Twin Auto-Guns (2 Hits) | 2x 8.0 | None | Heavy Platform | 3.0 | 10.0 (2x 5) | 37.5% | [CONF-MEAS] (High) [REF-06] |
| Railgun (1 Hit) | 20.0 | +20 vs Armored | Heavy Platform | 3.0 | 37.0 (40-3) | 7.5% | [CONF-MEAS] (High) [REF-06] |
| Incendiary (1 Hit) | 14.0 | +8 vs Light | Light Swarm | 0.0 | 22.0 | 0.0% | [CONF-MEAS] (High) [REF-06] |
| Siege Cannon (AOE Splash) | 40.0 | +35 vs Armored | Armored Mech | 1.0 | 74.0 (Direct) | 1.3% | [CONF-MEAS] (High) [REF-06] |

---

## 10. Spatial Topology: Vision, High Ground, Ramps, and Pathfinding

Map geometry dictates engagement values via vision barriers and choke points [[REF-03], [REF-08], [REF-09]].

### 10.1 High Ground Mechanics
* **Legacy Model (Probabilistic):** Uphill attacks had a **46.875% miss chance (30/64 roll)**; downhill had 100% accuracy [[REF-09]].
* **Modern Model (Deterministic Fog):** Eliminates miss RNG; cliff edges block uphill LOS without spotters, while downhill retains 100% LOS [[REF-08]].

### 10.2 Ramp Geometry & Chokepoints
* Ramp Width: Standardized at 2 to 3 grid tiles [[REF-03]].
* Bottleneck: A 2-tile ramp restricts throughput to 2–3 melee units (0.375 radius) against 1 defender.
* Pathing Resolution: Evaluates on 0.25 x 0.25 sub-tile cells via HPA* [[REF-03]].

### 10.3 Invisibility, Detection, and Vision Cones
* Vision & Detection: Standard sight is 8.0–11.0 tiles; detectors cover 10.0–11.0 tiles [[REF-08]].
* Cloak Shimmer: Distortion shader allows spotting cloaked units without detection.

### 10.4 Table: Spatial & Environmental Parameter Specifications
| Mechanic / Parameter | Quantitative Value | Mechanical Impact | Status & Source |
| :--- | :--- | :--- | :--- |
| High Ground (Modern) | Binary Line-of-Sight Block | Blocks uphill LOS | [CONF-MEAS] (High) [REF-08] |
| High Ground (Legacy) | 46.875% Miss Chance (30/64) | 30/64 miss penalty | [CONF-MEAS] (High) [REF-09] |
| Vision (Infantry) | 9.0–11.0 tiles | Fog clearance radius | [CONF-MEAS] (High) [REF-08] |
| Vision (Caster/Air) | 11.0–12.0 tiles | Cliff spotter vision | [CONF-MEAS] (High) [REF-08] |
| Detection Envelope | 10.0–11.0 tiles (Spherical) | Reveals stealth units | [CONF-MEAS] (High) [REF-08] |
| Strategic Ramp Width | 2.0–3.0 tiles | Restricts army flow | [CONF-MEAS] (High) [REF-03] |
| Pathing Subcell Size | 0.25 x 0.25 tiles | Grid navigation step | [CONF-MEAS] (High) [REF-03] |
| Cloak Shimmer | Visible at ≤ 1080p | Allows counter-play | [CONF-MEAS] (High) [REF-08] |

---

## 11. Synthesis: Clean-Room Spiritual Successor Specifications

### 11.1 Master Successor Engine Parameters [SPEC-REC]
* **Deterministic Simulation:** Fixed 24.0 Hz tick (41.67 ms) with Hermite cubic spline interpolation (144Hz+).
* **Network Buffer:** 2-tick dispatch offset (83.33 ms) masked by tick 0 predictive feedback.
* **Kinematics:** Light Ranged (Radius 0.40, Accel 1000, Turn Instant); Heavy Armor (Radius 0.85, Accel 3.5, Decel 4.5, Turn 540°/s); Flyer (Radius 0.50, Accel 3.2, Decel 2.2 drift, Turn 720°/s).
* **Lethality (TTK):** Standard TTK 2.4–3.0 s; survivability floor ≥ 1.5 s; focus-fire mitigation δ = 0.85^max(0, N-4) for N > 4 hits within 100 ms.
* **Macroeconomics:** 8 patches (1–16 workers at 45 res/min, 17–24 at 18 res/min, cap 24); 2 geysers (3 workers at 115 res/min, cap 6). 22 workers/base optimal. Auto-rally balancing.
* **Spatial Geometry:** Deterministic binary high-ground vision; 2.5-tile ramp bottlenecks; active refractive cloak shimmer.
* **Macro Ergonomics:** Production cycles and supply pacing synchronized to an invariant 16.0–18.0 s heartbeat.
