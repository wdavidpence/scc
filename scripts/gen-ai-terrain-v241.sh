#!/bin/bash
# v2.41 terrain variety + deco scatter gen. Pollinations Flux free tier 1req/15s. ORIGINAL-IP only.
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
SEAM=", perfectly seamless tileable texture, edge to edge repeatable, no borders, no frame, no text, no watermark, no logos, no creatures, no buildings"
TT=", centered alone, flat solid pure magenta background #FF00FF, no shadow, single cluster, no text, no watermark, original IP"

gen ground_moss2 "alien forest floor bioluminescent moss terrain, cool teal and deep cyan glowing lichen patches over dark damp earth, fine mycelium threads catching faint light, top-down game ground texture, painterly AAA sci-fi$SEAM" 512 512 1501
sleep 16
gen ground_rust "barren alien highland ground, warm rust-orange and umber cracked mineral soil with pale quartz veins, dry dusty regolith, top-down game ground texture, painterly AAA sci-fi$SEAM" 512 512 1502
sleep 16
gen deco_grass "alien flora cluster, slender glowing teal grass blades and small luminous fungi growing from dark soil, clump viewed slightly above$TT" 256 256 1503
sleep 16
gen deco_fungal "alien fungal cluster, bulbous bioluminescent mushroom pods with soft cyan glow caps on pale stalks, clump viewed slightly above$TT" 256 256 1504
sleep 16
gen deco_spire "alien mineral formation, jagged thin crystal spires cluster growing from rock base, faint inner azure glow, viewed slightly above$TT" 256 256 1505
echo DONE
