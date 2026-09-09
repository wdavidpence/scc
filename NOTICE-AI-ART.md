# AI-Generated Art Notice — STARFRONT (SCC) v2.38+

All raster artwork under:
- `public/assets/ai/` (terrain tiles, rocks, minerals, gas geyser, title)
- `public/assets/cinematic/` (cutscene backdrops)
- `public/assets/hero/` (faction commander portraits)

is **original AI-generated artwork** produced with the free Pollinations.AI
image API (Flux model, `image.pollinations.ai`), from prompts written for this
project.

## Copyright / IP posture
- Every prompt is an ORIGINAL description of invented sci-fi content. No
  franchise names, no character names, no logos, no "in the style of" the
  rights-holders of any existing game appear in any prompt (see
  `scripts/gen-ai-graphics-v238.sh`).
- The game's own IP is already sanitized (Skarn / Auraxis / Terran Dominion —
  see the v2.31 IP sweep). Unit rosters, names, lore, and audio are original.
- Generated images are post-processed locally (seam-fixing, chroma keying,
  scaling, compression) by `scripts/process-ai-assets-v238.py`.
- Pollinations' API is MIT-licensed; generated outputs are used here as
  original project assets. Raw generation outputs are preserved in
  `ai_raw/` with their exact prompts, seeds, and dates for provenance.

## Provenance
Regenerate the full kit deterministically with:
`bash scripts/gen-ai-graphics-v238.sh && python3 scripts/process-ai-assets-v238.py`
(1 free request / 15 s; ~3 minutes total).
