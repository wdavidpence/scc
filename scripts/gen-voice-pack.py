#!/usr/bin/env python3
"""Generate missing VO lines (edge-tts -> m4a into public/vo/{race}/) + merge manifest.
Only ADDS files; never overwrites existing recordings. Run from repo root."""
import asyncio, json, os, subprocess, sys
import edge_tts

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VO = os.path.join(ROOT, 'public', 'vo')

VOICE = {
    'terran':  ('en-US-GuyNeural', '-4Hz',  '+2%'),   # clipped military baritone
    'skarn':   ('en-US-ChristopherNeural', '-12Hz', '-4%'),  # deep, slinky
    'auraxis': ('en-US-AriaNeural', '+2Hz', '+0%'),    # calm, elevated
}
# action -> lines (same for every race unless table says otherwise; race voice differs anyway)
ADMIN = ['All workers are busy.', 'You must build more supply.', 'Cannot comply.']
BOSS_ON = 'Massive biosignature detected.'
BOSS_OFF = 'Threat eliminated.'
NUKE = 'Nuclear launch detected.'
PACK = {
    'terran': {
        'ultimate': ['Nuclear strike inbound.', 'Keystone lance, free!'],
        'admin': ADMIN, 'nuke': [NUKE],
        'bselect': ['Systems online.', 'Structural. Functional.', 'Command post reporting.', 'Facility standing by.'],
        'boss_on': [BOSS_ON], 'boss_off': [BOSS_OFF],
        # extend select rotation with role-flavored lines (select_3+)
        'select_add': ['Working.', 'Lock and load!', 'Artillery in position.', 'Wings up.'],
        'radio1': ['Dig in. Come out when he does.'],
        'radio2': ['Nobody is safe behind my lines. Including you.'],
        'radio3': ['You will die at 40,000 feet. Or 4 meters. I can arrange either.'],
    },
    'skarn': {
        'ultimate': ['The swarm descends!', 'Surge!'],
        'admin': ADMIN, 'nuke': [NUKE],
        'bselect': ['The hive pulsed.', 'It breathes.', 'Flesh binds stone.', 'Brood structure awake.'],
        'boss_on': [BOSS_ON], 'boss_off': [BOSS_OFF],
        'select_add': ['At service.', 'Kill.', 'Siege ready.', 'Soaring.'],
        'radio1': ['The swarm smells fear. Run, little marine.'],
        'radio2': ['Overwhelming force. Overwhelming hunger.'],
        'radio3': ['The ground beneath you is already ours.'],
    },
    'auraxis': {
        'ultimate': ['Psionic storm!', 'Storm them!'],
        'admin': ADMIN, 'nuke': [NUKE],
        'bselect': ['The spire listens.', 'Light held in lattice.', 'Sanctum answers.', 'Warp steady.'],
        'boss_on': [BOSS_ON], 'boss_off': [BOSS_OFF],
        'select_add': ['Affirmative.', 'For Auraxis.', 'Target locked.', 'Eyes skyward.'],
        'radio1': ['Your destruction will be orderly.'],
        'radio2': ['The storm gathers at my command.'],
        'radio3': ['The light ascends. Your sky darkens with my fleet.'],
    },
}

async def gen_one(text, voice, pitch, rate, out):
    c = edge_tts.Communicate(text, voice, pitch=pitch, rate=rate)
    tmp = out + '.mp3.tmp'
    await c.save(tmp)
    # mux to m4a (AAC) to match the existing pack convention
    r = subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac', tmp, out],
                       capture_output=True, text=True)
    if r.returncode != 0 or not os.path.exists(out):
        os.replace(tmp, out)   # fallback: raw mp3 bytes under .m4a name (browsers sniff)
    else:
        os.remove(tmp)

async def main():
    jobs = []
    for race, acts in PACK.items():
        for act, lines in acts.items():
            real_act = 'select' if act == 'select_add' else act
            start = 0
            if act == 'select_add':
                # append after existing select_N files (exact select_N only, not select2_/select3_)
                import re as _re
                have = [f for f in os.listdir(os.path.join(VO, race)) if _re.match(r'^select_\d+\.m4a$', f)]
                start = max(int(f[7:-4]) for f in have) if have else 0
            for i, ln in enumerate(lines):
                idx = start + i + 1
                fn = f'{real_act}_{idx}.m4a'
                fp = os.path.join(VO, race, fn)
                if os.path.exists(fp):
                    continue
                jobs.append((race, real_act, idx, ln, fp))
    print(f'{len(jobs)} files to generate')
    for race, act, idx, ln, fp in jobs:
        v, pitch, rate = VOICE[race]
        try:
            await gen_one(ln, v, pitch, rate, fp)
            print('ok', race, act, idx, '|', ln[:40])
        except Exception as e:
            print('FAIL', race, act, idx, repr(e)[:80])
    # merge manifest: recount files
    mf_path = os.path.join(VO, 'manifest.json')
    with open(mf_path) as f:
        man = json.load(f)
    for race in PACK:
        d = os.path.join(VO, race)
        counts = {}
        for f in os.listdir(d):
            if f.endswith('.m4a'):
                k, n = f[:-4].rsplit('_', 1)
                counts[k] = max(counts.get(k, 0), int(n))
        man[race] = counts
    with open(mf_path, 'w') as f:
        json.dump(man, f, indent=1)
    print('manifest merged:', {r: sum(v.values()) for r, v in man.items()})

asyncio.run(main())
