#!/bin/bash
# v2.46/2.47 live marker sweep (bundle already fetched)
F=${1:-/tmp/live247.js}
echo "bundle: $(wc -c < "$F") bytes"
echo "chr-topbar:    $(grep -o chr-topbar "$F" | wc -l | tr -d ' ')"
echo "ico-mineral:   $(grep -o ico-mineral "$F" | wc -l | tr -d ' ')"
echo "grade-vignette:$(grep -o grade-vignette "$F" | wc -l | tr -d ' ')"
echo "cur-attack:    $(grep -o cur-attack "$F" | wc -l | tr -d ' ')"
echo "mm_shroud:     $(grep -o mm_shroud "$F" | wc -l | tr -d ' ')"
echo "DEPLOY [D]:    $(grep -o 'DEPLOY \[D\]' "$F" | wc -l | tr -d ' ')"
echo "ip_banned:     $(grep -io 'zerg\|protoss' "$F" | wc -l | tr -d ' ')"
