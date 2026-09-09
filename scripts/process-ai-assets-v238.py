#!/usr/bin/env python3
"""v2.38 — process Pollinations Flux raw assets into game-ready tiles/sprites.
All raw art generated from ORIGINAL prompts (no franchise names). Outputs:
  public/assets/ai/*.png          terrain tiles, rocks, minerals, geyser
  public/assets/cinematic/*.jpg   cutscene backdrops (overwritten)
  public/assets/hero/*.jpg        race hero portraits (overwritten)
"""
import os
import numpy as np
from PIL import Image, ImageFilter

RAW = os.path.expanduser('~/scc-work/ai_raw')
OUT = os.path.expanduser('~/scc-work/public/assets/ai')
CIN = os.path.expanduser('~/scc-work/public/assets/cinematic')
HERO = os.path.expanduser('~/scc-work/public/assets/hero')
os.makedirs(OUT, exist_ok=True)

def load(f): return Image.open(os.path.join(RAW, f)).convert('RGB')

def seamfix(im, size=512, blend=48):
    """Midpoint-wrap + feathered seam blend -> truly tileable square."""
    im = im.resize((size * 2, size * 2), Image.LANCZOS)
    a = np.asarray(im).copy()
    a = np.roll(np.roll(a, size, axis=0), size, axis=1)
    im = Image.fromarray(a)
    cx, cy = size, size
    patch = im.crop((cx - blend, cy - blend, cx + blend, cy + blend)).filter(ImageFilter.GaussianBlur(blend / 3))
    mg = np.zeros((blend * 2, blend * 2), dtype=float)
    for i in range(blend * 2):
        d = abs(i - blend) / blend
        mg[i, :] = 255 * max(0.0, 1.0 - d)
    im.paste(patch, (cx - blend, cy - blend), Image.fromarray(mg.astype('uint8')))
    patch2 = im.crop((cx - blend, cy - blend, cx + blend, cy + blend)).filter(ImageFilter.GaussianBlur(blend / 3))
    im.paste(patch2, (cx - blend, cy - blend), Image.fromarray(mg.astype('uint8').T))
    return im.resize((size, size), Image.LANCZOS)

def tint(im, mul):
    a = np.asarray(im.convert('RGB')).astype(float) * np.array(mul, dtype=float)
    return Image.fromarray(np.clip(a, 0, 255).astype('uint8'))

def chroma_key(im, thr=110):
    a = np.asarray(im.convert('RGB')).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    score = (r - g) + (b - g)
    alpha = np.clip(255 - score * (255 / thr), 0, 255).astype('uint8')
    sp = alpha > 0
    rr = np.where(sp, np.minimum(r, g + 60), 0).astype('uint8')
    gg = np.where(sp, g, 0).astype('uint8')
    bb = np.where(sp, np.minimum(b, g + 60), 0).astype('uint8')
    return Image.fromarray(np.dstack([rr, gg, bb, alpha]))

def tight(im, pad=2):
    a = np.asarray(im)[..., 3] > 40
    ys = np.where(a.any(axis=1))[0]; xs = np.where(a.any(axis=0))[0]
    if len(ys) == 0: return None
    return im.crop((max(0, xs[0] - pad), max(0, ys[0] - pad), min(im.width, xs[-1] + 1 + pad), min(im.height, ys[-1] + 1 + pad)))

def center(im, box):
    im = tight(im)
    if im is None: return None
    sc = min(box[0] / im.width, box[1] / im.height)
    im = im.resize((max(1, int(im.width * sc)), max(1, int(im.height * sc))), Image.LANCZOS)
    c = Image.new('RGBA', box, (0, 0, 0, 0))
    c.paste(im, ((box[0] - im.width) // 2, box[1] - im.height), im)  # sit on baseline
    return c

def save(im, path):
    im.save(path, 'PNG', optimize=True) if path.endswith('.png') else im.save(path, 'JPEG', quality=88)
    print(f'saved {os.path.relpath(path, os.path.expanduser("~/scc-work"))} {im.size} {os.path.getsize(path)} B')

# ---- grounds (seamless 512 tiles) ----
moss = seamfix(load('ground_moss.png'))
save(moss, f'{OUT}/ground_a.png')
save(tint(moss, (0.80, 0.92, 0.95)), f'{OUT}/ground_b.png')
save(seamfix(load('ground_cracked.png')), f'{OUT}/ground_cracked.png')
save(seamfix(load('ground_highland.png')), f'{OUT}/ground_highland.png')
save(tint(seamfix(load('ground_ash.png')), (0.92, 0.86, 1.0)), f'{OUT}/ground_ash.png')

# ---- rocks (centered chroma-keyed 96px) ----
for i, v in enumerate(['rock_v8', 'rock_v9', 'rock_v10']):
    c = center(chroma_key(load(f'{v}.png')), (96, 96))
    if c: save(c, f'{OUT}/rock{i}.png')

# ---- minerals / geyser ----
c = center(chroma_key(load('minerals_chroma.png')), (72, 72))
if c: save(c, f'{OUT}/minerals.png')
c = center(chroma_key(load('geyser_chroma.png')), (64, 64))
if c: save(c, f'{OUT}/geyser.png')

# ---- title + cinematic backdrops (match existing display sizes) ----
tb = load('titlebg2.png')
save(tb, f'{OUT}/titlebg.png')
save(tb, f'{CIN}/titlebg.jpg')
for k, size in [('wreckage', (1672, 941)), ('alien', (1536, 1024)), ('armada', (1916, 821))]:
    im = load(f'{k}.png')
    if im.size != size: im = im.resize(size, Image.LANCZOS)
    save(im, f'{CIN}/{k}.jpg')

# ---- hero portraits ----
for k, size in [('terran', (1145, 1374)), ('skarn', (1142, 1377)), ('auraxis', (1145, 1374))]:
    im = load(f'hero_{k}.png')
    if im.size != size: im = im.resize(size, Image.LANCZOS)
    save(im, f'{HERO}/{k}.jpg')

print('PIPELINE DONE')
