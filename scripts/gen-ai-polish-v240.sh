#!/bin/bash
# v2.40 polish AI pass — fog mist, blight spreads (per-team), HUD chrome plate.
# Pollinations Flux free tier (1 req/15s). ORIGINAL-IP prompts only.
set -u
OUT=~/scc-work/ai_raw
mkdir -p "$OUT"
gen() {
  local name="$1" prompt="$2" w="$3" h="$4" seed="$5"
  if [ -f "$OUT/$name.png" ] && [ "$(stat -f%z "$OUT/$name.png")" -gt 15000 ]; then echo "SKIP $name"; return 0; fi
  local enc
  enc=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$prompt")
  for attempt in 1 2 3; do
    curl -s -o "$OUT/$name.png" -w "%{http_code}" --max-time 180 \
      "https://image.pollinations.ai/prompt/$enc?width=$w&height=$h&seed=$seed&nologo=true&model=flux" > "$OUT/.code_$name"
    code=$(cat "$OUT/.code_$name")
    sz=$(stat -f%z "$OUT/$name.png" 2>/dev/null || echo 0)
    if [ "$code" = "200" ] && [ "$sz" -gt 15000 ]; then echo "OK $name"; return 0; fi
    sleep 20
  done
  echo "FAIL $name"
}

SEAM=", perfectly seamless tileable texture, edge to edge repeatable, no borders, no frame, no text, no watermark, no logos, no people, no creatures"

gen fog_mist "thick rolling luminous fog mist clouds, soft volumetric wisps, cool pale blue-white on pure black background, dark void gaps between swirling cloud banks, atmospheric god-game ambient layer, high detail painterly$SEAM" 512 512 1401
sleep 16
gen blight_player "alien corrupted ground corruption creep spread, bioluminescent teal and deep blue glowing veins threaded through dark wet organic membrane, pulsing symbiotic tendrils over black soil, top-down game texture, painterly AAA sci-fi$SEAM" 512 512 1402
sleep 16
gen blight_enemy "alien corrupted ground corruption creep spread, acid green and magenta glowing pustules and veins through charred dark organic soil, toxic bioluminescent fungal mat, top-down game texture, painterly AAA sci-fi$SEAM" 512 512 1403
sleep 16
gen hud_chrome "futuristic starship interior brushed gunmetal metal panel, riveted armor plating, subtle cyan holographic trim glow along edges, dark anodized surface with fine scratches and wear, industrial sci-fi user interface panel background, straight-on flat view$SEAM" 512 512 1404
echo DONE
