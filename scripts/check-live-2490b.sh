#!/bin/bash
# v2.49 fragment markers (template-literal halves survive minification)
B=/tmp/live-2490.js
for M in "chr-card-" "cur-terran" "acc:0xff7b2e" "4ea1ff" "a78bfa" "tintTopLeft"; do
  printf "%s=%s\n" "$M" "$(grep -o "$M" "$B" | wc -l | tr -d ' ')"
done
