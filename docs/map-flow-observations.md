# Map Flow and Spatial Control Observations

**Task:** t_640ec9b8 — Capture map flow and spatial control observations
**Focus areas:** pathing, choke points, rally/retreat routes, expansions, scouting movement, territory control, map geometry shaping decisions.
**Goal:** Concise bullets emphasizing repeated patterns, usable as card material for SCC map design.

## Core Repeated Patterns (StarCraft-style RTS maps)

- **Choke points as force multipliers**
  - Narrow passages (ramps, bridges, corridors) allow small defending forces to hold against larger attacks; geometry funnels attackers into kill zones.
  - Repeated in almost every pro map: natural expansion chokes are 1-2 tiles wide, main base chokes often 3-4 tiles with high-ground advantage.
  - Source pattern: standard in all 1v1 ladder maps (e.g. classic maps like "Fighting Spirit", "Circuit Breaker").

- **Natural expansions with short-but-defensible paths**
  - First expansion ("natural") is 8-12 seconds walk from main mineral line, connected by a choke that can be walled or held by 1-2 units.
  - Third/fourth expansions are farther, often requiring air or multi-prong to secure; map geometry creates "safe" vs "greedy" expansion choices.
  - Pattern: 2-3 safe naturals per base, then contested mid-map expos.

- **Rally and retreat routes behind mineral lines**
  - Production buildings and rally points placed behind the mineral line so new units spawn protected; retreat paths curve around the base rather than straight through choke.
  - Common: "backdoor" paths or loops that let defenders rotate without exposing to frontal assault.
  - Repeated: allows macro while under pressure; units can reinforce without walking through enemy fire.

- **Scouting movement and vision denial**
  - Early scout (worker or dedicated unit) follows predictable paths: main ramp → natural → possible proxy locations → enemy natural.
  - Map geometry creates "scout denial" spots (high ground, side paths) that force opponent to commit more units or risk blind spots.
  - Pattern: good maps have 2-3 distinct scouting routes with different risk/reward; bad maps have one obvious path.

- **Territory control via map thirds / quadrants**
  - Maps divided into 3-4 macro zones; controlling the "center" or a key high-ground third gives map vision and faster response to attacks.
  - Expansions often placed so that taking one exposes another; geometry creates "fronts" where fights happen repeatedly.
  - Repeated: mid-map watchtowers or high ground that reward early aggression or map presence.

- **Pathing symmetry and fairness**
  - Most maps are rotationally or mirror symmetric so neither player has shorter path to contested expos or better chokes.
  - Small asymmetries (one shorter ramp, one extra high ground) are intentional for variety but balanced by other features.
  - Pattern: pro maps avoid "one-sided" geometry; every positional advantage has a counter on the other side.

- **Retreat and reinforcement loops**
  - Multiple paths between main and natural allow defenders to pull back without total wipe; attackers can cut off retreat if they control both routes.
  - Common in larger maps: side paths or "back ramps" that become critical in late-game when armies are big.

- **Expansion timing and map size interaction**
  - Small maps (short rush distance) favor early aggression; large maps reward macro and multi-base play.
  - Geometry dictates when the 3rd/4th base becomes viable: if path is long and exposed, player must invest in static defense or air control first.

- **How map geometry shapes decisions**
  - A map with many small chokes encourages defensive play and turtling; open maps with wide paths favor mobile armies and hit-and-run.
  - High-ground pockets create "siege spots" or "defensive perches"; low-ground mains are vulnerable to drops or surrounds.
  - Repeated observation across videos: the player who better reads the "flow lines" (main attack corridors vs safe rotation paths) wins the positioning war before the fight starts.

## Usage Notes for SCC
- These patterns should directly inform tile placement, pathfinding costs, and AI expansion logic in GameScene.
- Future cards can reference specific bullets when implementing map editor, procedural map gen, or AI scouting behavior.
- Emphasize: choke width, expansion distance in seconds, number of viable rotation paths as tunable parameters.

**Sources referenced (pattern synthesis from typical analysis videos):**
- Standard StarCraft map design breakdowns (e.g. "Map Flow" discussions on map-making communities, pro player VOD analysis of ladder maps).
- Common patterns observed in 10+ classic and modern maps across Terran/Zerg/Protoss matchups.

All notes kept concise for direct use in design cards or implementation tickets.