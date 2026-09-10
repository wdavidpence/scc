#!/usr/bin/env python3
"""Swap v2.43 campaign winners into public/assets/ai/u/ at live dims. Backups: .bak245."""
import os, json, glob
from PIL import Image
ROOT = os.path.expanduser('~/scc-work')
KEYED = f'{ROOT}/ai_raw/campaign243_keyed'
LIVE = f'{ROOT}/public/assets/ai/u'
import subprocess
# rerun scorer to capture best-per-unit json from stdout
out = subprocess.run(['python3', f'{ROOT}/scripts/art-campaign-243-score.py'], capture_output=True, text=True).stdout
best = {}
reject = []
for line in out.splitlines():
    parts = line.split()
    if len(parts) >= 2 and parts[1].startswith('best='):
        unit = parts[0]
        metrics = line[line.find('{'):] if '{' in line else ''
        try: m = eval(metrics)
        except Exception: m = {}
        if m.get('sky', 0) > 0.05 or m.get('mag', 0) > 0.02:
            reject.append(unit); continue  # sky/magenta residue: regenerate instead of swap
        best[unit] = parts[1].split('=')[1].split()[0]
swapped, skipped = [], []
for unit, b in sorted(best.items()):
    src = f'{KEYED}/u_{unit}_{b}.png'
    dst = f'{LIVE}/{unit}.png'
    if not os.path.exists(src):
        skipped.append((unit, 'no-keyed')); continue
    if not os.path.exists(dst):
        skipped.append((unit, 'no-live-slot')); continue
    live = Image.open(dst).size
    im = Image.open(src).convert('RGBA')
    # trim transparent margins
    bbox = im.getbbox()
    if bbox: im = im.crop(bbox)
    # fit into live dims preserving aspect
    r = min(live[0] / im.width, live[1] / im.height)
    im = im.resize((max(1, round(im.width * r)), max(1, round(im.height * r))), Image.LANCZOS)
    canvas = Image.new('RGBA', live, (0, 0, 0, 0))
    ox = (live[0] - im.width) // 2; oy = (live[1] - im.height) // 2
    canvas.paste(im, (ox, oy), im)
    if not os.path.exists(dst + '.bak245'):
        os.rename(dst, dst + '.bak245')
    else:
        os.remove(dst)
    canvas.save(dst)
    swapped.append(unit)
print(json.dumps({'swapped': len(swapped), 'skipped': skipped, 'units': swapped}, indent=0))
