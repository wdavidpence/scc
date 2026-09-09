#!/bin/bash
# v2.38 AI graphics batch — Pollinations (Flux), free tier, 1 req/15s.
# All prompts: ORIGINAL sci-fi IP, no franchise names, no logos, no existing characters.
set -u
OUT=~/scc-work/ai_raw
mkdir -p "$OUT"
gen() { # name prompt w h seed
  local name="$1" prompt="$2" w="$3" h="$4" seed="$5"
  local enc
  enc=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$prompt")
  for attempt in 1 2 3; do
    curl -s -o "$OUT/$name.png" -w "%{http_code}" --max-time 180 \
      "https://image.pollinations.ai/prompt/$enc?width=$w&height=$h&seed=$seed&nologo=true&model=flux" > "$OUT/.code_$name"
    code=$(cat "$OUT/.code_$name")
    sz=$(stat -f%z "$OUT/$name.png" 2>/dev/null || echo 0)
    if [ "$code" = "200" ] && [ "$sz" -gt 20000 ]; then echo "OK $name ($sz B)"; return 0; fi
    echo "RETRY $name (code=$code sz=$sz)"; sleep 20
  done
  echo "FAIL $name"
}

gen ground_moss "seamless tileable texture, alien planet dark ground, deep teal-green bioluminescent moss patches over dark basalt rock, tiny glowing cyan spores, damp soil, stylized painterly AAA game terrain, perfectly top-down orthographic view, no objects, no shadows, no vignette, original IP" 1024 1024 701
sleep 16
gen ground_cracked "seamless tileable texture, scorched alien volcanic ground, dark grey-black cooled lava rock with glowing orange fissure cracks, ember sparks, subtle heat glow, stylized painterly AAA game terrain, perfectly top-down orthographic, no objects, no vignette, original IP" 1024 1024 702
sleep 16
gen ground_highland "seamless tileable texture, pale alien highland stone plateau, light grey-blue smooth worn rock with faint glowing mineral veins, fine pale dust, stylized painterly AAA game terrain, perfectly top-down orthographic, no objects, no vignette, original IP" 1024 1024 703
sleep 16
gen ground_ash "seamless tileable texture, dark alien ash and gravel wasteland, charcoal gravel with scattered pale bone-like mineral shards and faint purple energy dust, stylized painterly AAA game terrain, top-down orthographic, no objects, no vignette, original IP" 1024 1024 704
sleep 16
gen rock_v8 "massive alien boulder centered alone, jagged dark basalt rock with teal bioluminescent moss and glowing cyan crystal veins, game sprite asset, flat solid pure magenta background #FF00FF, no shadow, rim lighting, painterly AAA game art, original IP" 512 512 104
sleep 16
gen rock_v9 "cluster of three alien volcanic rocks centered alone, dark cooled lava stone with glowing orange ember cracks, game sprite asset, flat solid pure magenta background #FF00FF, no shadow, rim lighting, painterly AAA game art, original IP" 512 512 117
sleep 16
gen rock_v10 "twin alien spire rocks centered alone, pale grey-blue crystal-flecked stone formations leaning apart, faint blue mineral glow, game sprite asset, flat solid pure magenta background #FF00FF, no shadow, rim lighting, painterly AAA game art, original IP" 512 512 130
sleep 16
gen minerals_chroma "cluster of glowing raw blue crystal mineral shards, luminous azure gemstones erupting from dark rock base, game resource node sprite, flat solid pure magenta background #FF00FF, no shadow on background, glowing refractions, painterly AAA game art, original IP" 512 512 706
sleep 16
gen geyser_chroma "alien gas geyser vent, twisted organic rock chimney with glowing green toxic gas flame rising, game sprite asset, flat solid pure magenta background #FF00FF, no shadow on background, eerie glow, painterly AAA game art, original IP" 512 512 707
sleep 16
gen titlebg "epic matte painting of an alien dual-sunset battlefield, vast ruined sci-fi fortress valley, bioluminescent rivers, floating rock shards in violet sky, tiny distant armies silhouettes, cinematic wide shot, ultra detailed, dramatic god rays, concept art masterpiece, original IP, no text, no logos" 1536 864 708
echo ALLDONE
