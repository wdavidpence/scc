# ART

## Direction [P1][P2]
Readable military science fiction with grounded materials, exaggerated silhouettes, restrained bloom, and terrain shapes legible at strategic zoom. Art never disguises collision, ramps, traversable valleys, team ownership, range, or selection.

## Silhouette rules [P1]
- Every unit is identifiable in grayscale at 64 px and strategic zoom.
- Each combat role owns a distinct footprint, height profile, weapon axis, and motion rhythm.
- Friendly/enemy recognition must not depend on hue alone; use team-color blocks plus shape.
- Weapons and ability origins must remain visible in a 200-unit battle.
- Buildings expose entrance, production exit, rally direction, damage state, and footprint.

## Faction palettes [P1]
- Industrial Coalition: gunmetal `#27313d`, ceramic `#aeb8c4`, hazard amber `#f2a93b`, energy cyan `#4fc7ff`.
- Mycelial Covenant: chitin `#392b33`, bone `#c6b58f`, biolume coral `#ff6b52`, toxin chartreuse `#a7d948`.
- Lattice Ascendancy: obsidian `#17152a`, ivory `#d7d3e8`, phase violet `#a576ff`, plasma mint `#69f0d0`.
- Reserved team-color mask occupies 12–18% of visible unit area and passes color-blind simulation.

## Budgets [P3]
- Hero unit: 45k triangles, 2×2K texture set; standard unit: 18k, 1×2K; worker: 12k, 1×1K.
- Major structure: 80k, 2×2K; minor structure: 35k, 1×2K; prop cluster: 8k, 1×1K.
- Terrain tile set: 1×2K trim sheet per biome plus 2×2K material arrays.
- Texture channels: base color, normal, packed ORM, emissive; no unique channel outside schema.
- VFX budget: 2 ms GPU at 200-unit battle; transparent overdraw below 3× median.

## LOD tiers [P3]
- LOD0: full budget, <18 m camera distance.
- LOD1: 50% triangles, 18–40 m.
- LOD2: 20% triangles, 40–80 m.
- LOD3: impostor/silhouette card beyond 80 m.
- Hysteresis 10%; no visible silhouette pop during standard camera motion.

## Naming
`faction_role_variant_lodN_v###`; materials `m_`; textures `t_`; rigs `r_`; animations `a_`; VFX `fx_`. Names are lowercase ASCII, underscore-delimited, unique, and manifest-addressed.

## Acquisition strategy
Buy commercially licensed marketplace packs, kitbash modular parts, and modify materials/silhouettes under one art bible. One contract artist owns final silhouette, faction consistency, hero assets, and legal provenance. Never ship unmodified marketplace hero assets.

## Automated pipeline [P1][P3]
One Antigravity-owned importer validates license metadata, scale, pivots, collision proxy, naming, triangle/texture budgets, UV bounds, material schema, LOD ratios, animation clips, team-color mask, atlas packing, and manifest hashes. Invalid assets fail CI; import never silently repairs source.

## Human gates
Contact sheets at gameplay scale, grayscale silhouette test, color-blind test, 200-unit readability capture, ramp/valley topology overlay, material close-up, and contract-artist approval are required before asset acceptance.