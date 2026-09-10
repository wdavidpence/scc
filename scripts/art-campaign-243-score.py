#!/usr/bin/env python3
"""v2.43 campaign scorer: chroma-key + auto-filter + contact sheets.
Per unit: key magenta, trim, score candidates (silhouette edge energy, faction color fit,
magenta residue, fill ratio). Pick best per unit -> contact sheet PNGs per faction for human review.
"""
import os, sys, math
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.expanduser('~/scc-work')
SRC = f'{ROOT}/ai_raw/campaign243'
KEYED = f'{ROOT}/ai_raw/campaign243_keyed'
SHEETS = f'{ROOT}/qa-shots/campaign243'
os.makedirs(KEYED, exist_ok=True)
os.makedirs(SHEETS, exist_ok=True)

FACTION = {}
for k in ['rigger','marine','incinerator','tank','duster','ballista','wraith','battlecruiser','ghost','medic','drone','dropship']: FACTION[k]='terran'
for k in ['skarling','skarnling','razorspine','vexwing','tremorclaw','skywarden','airstinger','burrower','sporecaster','corroder']: FACTION[k]='skarn'
for k in ['artificer','bladeguard','sentinel','stormcaller','nightblade','radiant','ark','voidlance','umbral']: FACTION[k]='auraxis'
FCOL = {'terran':(78,161,255),'skarn':(255,123,46),'auraxis':(255,79,163)}

def chroma_key(im, thr=115):
    im = im.convert('RGBA'); px = im.load(); W,H = im.size
    for y in range(H):
        for x in range(W):
            r,g,b,a = px[x,y]
            dmag = math.sqrt((r-255)**2+(g-0)**2+(b-255)**2)
            if dmag < thr: px[x,y]=(r,g,b,0)
            elif dmag < thr+60: px[x,y]=(r,g,b,int(255*(dmag-thr)/60))
    return im

def edge_energy(a):
    px=a.load(); W,H=a.size; e=0
    for y in range(1,H,2):
        for x in range(1,W,2):
            p=px[x,y]
            if p[3]<40: continue
            q=px[x-1,y]
            if q[3]<40: e+=1; continue
            e+= abs(p[0]-q[0])+abs(p[1]-q[1])+abs(p[2]-q[2])
    return e/max(1,(W*H)//4)

def score(a, faction):
    px=a.load(); W,H=a.size
    fg=0; mag=0; fc=0; lum=0
    fr,fgb,fb=FCOL[faction]
    for y in range(0,H,2):
        for x in range(0,W,2):
            r,g,b,al=px[x,y]
            if al<40: continue
            fg+=1
            dmag=math.sqrt((r-255)**2+(g-0)**2+(b-255)**2)
            if dmag<90: mag+=1
            dfc=math.sqrt((r-fr)**2+(g-fgb)**2+(b-fb)**2)
            if dfc<110: fc+=1
            lum+=0.299*r+0.587*g+0.114*b
    if fg<200: return 0,'empty'
    # blue-sky residue detector (vision QA 2026-09-09: Flux sometimes ignores magenta bg)
    sky=0
    for y in range(0,H,2):
        for x in range(0,W,2):
            r,g,b,al=px[x,y]
            if al<40: continue
            if b>150 and b>r+40 and g>90 and r<160: sky+=1
    fill=fg/((W*H)//4)
    skyr=sky/max(1,fg)
    return {
        'fill': min(1,fill*2.2),
        'fc': fc/fg,               # faction colors present
        'magres': 1-min(1,mag/fg*12),  # magenta residue penalty
        'skyres': 1-min(1,skyr*8),     # blue-sky background residue penalty
        'lum': min(1,lum/fg/120),      # prefer brighter art (panel: all too dark)
    }, {'fill':round(fill,3),'fc':round(fc/fg,3),'mag':round(mag/fg,4),'sky':round(skyr,3),'lum':round(lum/fg,1)}

units = sorted(set(fn.split('_c')[0][2:] for fn in os.listdir(SRC) if fn.endswith('.png')))
results = {}
for u in units:
    faction = FACTION.get(u,'auraxis')
    scores = []
    for ci in (1,2,3):
        f = f'{SRC}/u_{u}_c{ci}.png'
        if not os.path.exists(f): continue
        im = Image.open(f).convert('RGB')
        k = chroma_key(im)
        bbox = k.getbbox()
        if bbox: k = k.crop(bbox)
        k.save(f'{KEYED}/u_{u}_c{ci}.png')
        s, dbg = score(k, faction)
        if isinstance(s,dict):
            total = s['fill']*0.22 + s['fc']*0.30 + s['magres']*0.18 + s['skyres']*0.15 + s['lum']*0.15
            scores.append((total, ci, dbg))
    if not scores: continue
    scores.sort(reverse=True)
    best = scores[0]
    results[u] = best
    print(f"{u:14s} best=c{best[1]} {best[0]:.3f} {best[2]}  alts={[f'c{c}:{t:.2f}' for t,c,_ in scores[1:]]}")

# contact sheets per faction, best candidate + alts labeled
for faction in ['terran','skarn','auraxis']:
    us = [u for u in results if FACTION.get(u)==faction]
    if not us: continue
    cols = 4; rows = math.ceil(len(us)/cols)
    sheet = Image.new('RGBA',(cols*200, rows*220),(10,14,22,255))
    d = ImageDraw.Draw(sheet)
    for i,u in enumerate(us):
        ci = results[u][1]
        im = Image.open(f'{KEYED}/u_{u}_c{ci}.png').convert('RGBA')
        im.thumbnail((190,190))
        x,y=(i%cols)*200,(i//cols)*220
        # checker bg to reveal alpha
        for cy in range(0,200,16):
            for cx in range(0,190,16):
                if (cx//16+cy//16)%2: d.rectangle([x+cx,y+cy,x+cx+16,y+cy+16],fill=(30,36,48,255))
        sheet.paste(im,(x+(190-im.width)//2,y+(190-im.height)//2),im)
        d.text((x+4,y+196),f'{u} c{ci} {results[u][0]:.2f}',fill=(230,235,245,255))
    p=f'{SHEETS}/sheet_{faction}.png'
    sheet.convert('RGB').save(p)
    print('SHEET',p)
print('SCORE_DONE')
