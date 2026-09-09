#!/usr/bin/env python3
"""v2.39 deep pass phase B: trim + resize + pack AI gens into drop-in textures.
- Units: ai_raw/u_<kind>.png -> public/assets/ai/u/<kind>.png (<=128px, tight bbox, transparent)
- Buildings: ai_raw/s_<bid>.png -> public/assets/ai/b/<bid>.png (exact footprint px @64/tile 2x, baseline-stuck)
- FX: ai_raw/fx_*.png -> public/assets/ai/fx/<name>.png
- Writes src2/data/ai-manifest.json listing what exists (JS preloads these).
Team tinting happens in-engine at bake time (no per-team network cost)."""
import os, json
import numpy as np
from PIL import Image, ImageFilter

RAW = os.path.expanduser('~/scc-work/ai_raw')
OUT = os.path.expanduser('~/scc-work/public/assets/ai')
MAN = os.path.expanduser('~/scc-work/src2/data/ai-manifest.json')
os.makedirs(f'{OUT}/u', exist_ok=True); os.makedirs(f'{OUT}/b', exist_ok=True); os.makedirs(f'{OUT}/fx', exist_ok=True)

U = ['rigger','marine','incinerator','tank','duster','ballista','wraith','battlecruiser','ghost','medic','drone','dropship',
     'skarling','skarnling','razorspine','vexwing','tremorclaw','skywarden','airstinger','burrower',
     'artificer','bladeguard','sentinel','stormcaller','nightblade','radiant','ark','voidlance','umbral','sporecaster','corroder']
B = {'commandCenter':(5,4),'supplyDepot':(2,2),'refinery':(4,3),'barracks':(4,3),'factory':(4,3),'machineShop':(2,2),
     'starport':(4,3),'controlTower':(2,2),'academy':(3,3),'missileTurret':(2,2),'engineeringBay':(2,2),'scienceFacility':(4,3),
     'bunker':(2,2),'broodNest':(4,4),'geneForge':(3,3),'blightNode':(2,2),'clawPit':(3,3),'spineWarren':(3,3),'aerie':(3,3),
     'hive':(4,4),'deepWarren':(4,4),'tremorCavern':(3,3),'stingerColony':(2,2),'gasSiphon':(4,3),
     'aegis':(5,4),'conduit':(2,2),'essenceTap':(4,3),'portal':(3,3),'fabricator':(4,3),'synapseCore':(3,3),'runeworks':(3,3),
     'psiVault':(3,3),'convocation':(3,3),'skyPortal':(4,3),'skyAnchor':(3,3),'lanceTurret':(2,2),'forge':(2,2)}
FX = {'explosion':128,'inferno':128,'rubble':192,'crater':128,'smoke':96}
GEYSER_ALT = {'refinery':'refinery_geyser','gasSiphon':'gasSiphon_geyser','essenceTap':'essenceTap_geyser'}

def chroma_key(im, thr=115):
    a = np.asarray(im.convert('RGB')).astype(int)
    r, g, b = a[...,0], a[...,1], a[...,2]
    score = (r - g) + (b - g)
    alpha = np.clip(255 - score * (255.0 / thr), 0, 255).astype('uint8')
    sp = alpha > 24
    rr = np.where(sp, np.minimum(r, g + 70), 0).astype('uint8')
    gg = np.where(sp, g, 0).astype('uint8')
    bb = np.where(sp, np.minimum(b, g + 70), 0).astype('uint8')
    return Image.fromarray(np.dstack([rr, gg, bb, alpha]))

def clean_alpha(im):
    a = np.asarray(im).copy()
    al = a[..., 3]
    al2 = np.asarray(Image.fromarray(al).filter(ImageFilter.MinFilter(3)))
    a[..., 3] = np.where(al > 200, al, al2)
    return Image.fromarray(a)

def trim(im, pad=2):
    a = np.asarray(im)[..., 3] > 30
    ys = np.where(a.any(axis=1))[0]; xs = np.where(a.any(axis=0))[0]
    if len(ys) == 0: return None
    return im.crop((max(0, xs[0]-pad), max(0, ys[0]-pad), min(im.width, xs[-1]+1+pad), min(im.height, ys[-1]+1+pad)))

manifest = {'u': [], 'b': [], 'bg': [], 'fx': []}
ok = 0; fail = []

for k in U:
    f = f'{RAW}/u_{k}.png'
    if not os.path.exists(f): fail.append(k); continue
    im = trim(clean_alpha(chroma_key(Image.open(f))))
    if im is None: fail.append(k+'(empty)'); continue
    maxs = 128 if k not in ('rigger','marine','incinerator','ghost','medic','skarling','skarnling','artificer','stormcaller','airstinger','bladeguard','nightblade','umbral','duster','drone') else 96
    sc = min(maxs / im.width, maxs / im.height, 1.0)
    im = im.resize((max(1, int(im.width*sc)), max(1, int(im.height*sc))), Image.LANCZOS)
    im.save(f'{OUT}/u/{k}.png', optimize=True)
    manifest['u'].append(k); ok += 1

for bid, (tw, th) in B.items():
    srcs = [(bid, bid)] + ([(GEYSER_ALT[bid], bid + '_geyser')] if bid in GEYSER_ALT else [])
    placed = False
    for srck, tag in srcs:
        f = f'{RAW}/s_{srck}.png'
        if not os.path.exists(f): continue
        im = trim(clean_alpha(chroma_key(Image.open(f))))
        if im is None: continue
        TW, TH = tw * 64, th * 64
        sc = min((TW - 4) / im.width, (TH - 4) / im.height)
        im = im.resize((max(1, int(im.width*sc)), max(1, int(im.height*sc))), Image.LANCZOS)
        cv = Image.new('RGBA', (TW, TH), (0, 0, 0, 0))
        cv.paste(im, ((TW - im.width)//2, TH - im.height), im)  # baseline stick
        cv.save(f'{OUT}/b/{tag}.png', optimize=True)
        placed = True
    if placed: manifest['b'].append(bid); ok += 1
    else: fail.append('s_'+bid)

for fx, size in FX.items():
    f = f'{RAW}/fx_{fx}.png'
    if not os.path.exists(f): fail.append('fx_'+fx); continue
    im = trim(clean_alpha(chroma_key(Image.open(f))))
    if im is None: continue
    sc = size / max(im.width, im.height)
    im = im.resize((max(1, int(im.width*sc)), max(1, int(im.height*sc))), Image.LANCZOS)
    im.save(f'{OUT}/fx/{fx}.png', optimize=True)
    manifest['fx'].append(fx); ok += 1

json.dump(manifest, open(MAN, 'w'), separators=(',', ':'))
tot = sum(os.path.getsize(os.path.join(dp, fn)) for base in ('u','b','fx') for dp in [f'{OUT}/{base}'] for fn in os.listdir(dp))
print(f'deep OK {ok} fail {len(fail)} {fail[:10]} | payload {tot/1e6:.2f} MB | manifest u:{len(manifest["u"])} b:{len(manifest["b"])} fx:{len(manifest["fx"])}')
