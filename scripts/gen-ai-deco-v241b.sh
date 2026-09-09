#!/bin/bash
# v2.41 deco scatter retry (first pass failed at free tier). Pollinations Flux, 1req/15s, ORIGINAL-IP.
set -u
OUT=~/scc-work/ai_raw
gen() {
  local name="$1" prompt="$2" w="$3" h="$4" seed="$5"
  if [ -f "$OUT/$name.png" ] && [ "$(stat -f%z "$OUT/$name.png")" -gt 15000 ]; then echo "SKIP $name"; return 0; fi
  local enc
  enc=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$prompt")
  for attempt in 1 2 3 4; do
    curl -s -o "$OUT/$name.png" -w "%{http_code}" --max-time 240 \
      "https://image.pollinations.ai/prompt/$enc?width=$w&height=$h&seed=$seed&nologo=true&model=flux" > "$OUT/.code_$name"
    code=$(cat "$OUT/.code_$name")
    sz=$(stat -f%z "$OUT/$name.png" 2>/dev/null || echo 0)
    if [ "$code" = "200" ] && [ "$sz" -gt 15000 ]; then echo "OK $name"; return 0; fi
    echo "retry $name code=$code sz=$sz"
    sleep 25
  done
  echo "FAIL $name"; return 1
}
TT=", centered single small cluster, isolated subject, flat solid pure magenta background #FF00FF, no shadow, no ground plane, no text, no watermark, no logos, original IP"
gen deco_grass  "small clump of slender alien grass blades with faint glowing teal tips, three-quarter top view$TT" 256 256 2201
sleep 16
gen deco_fungal "small cluster of bioluminescent alien mushrooms with soft cyan glowing caps on pale stalks, three-quarter top view$TT" 256 256 2202
sleep 16
gen deco_spire  "cluster of thin jagged alien crystal spires rising from a small grey rock base, faint azure inner glow, three-quarter top view$TT" 256 256 2203
echo DONE
