#!/usr/bin/env python3.11
"""Generate multi-frame spritesheets for Zerg units (Drone, Zergling, Hydralisk).

Creates idle-bob, walk-cycle, attack, and death animation frames from the
existing single-frame base sprites in public/assets/sprites/zerg/.

Each spritesheet is saved as a wide PNG where frames are placed side-by-side:
  [idle0 | idle1 | walk0 | walk1 | walk2 | walk3 | attack0 ... | death0 ...]

Phaser reads these as a sprite-sheet with frameWidth/frameHeight.
"""

from PIL import Image, ImageDraw
import os
import sys

BASE_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'sprites', 'zerg')

# Color palettes (from existing sprites)
DRONE_COLORS = {
    'body': (70, 28, 12),       # #461c0c dark brown
    'mid': (194, 65, 12),       # #c2410c burnt orange
    'light': (251, 146, 60),    # #fb923c orange
    'bright': (253, 186, 116),  # #fdba74 light orange
    'accent': (249, 115, 22),   # #f97316 amber
}

ZERGKING_COLORS = {
    'body': (70, 28, 12),       # #461c0c dark brown
    'light': (251, 146, 60),    # #fb923c orange
    'mid': (194, 65, 12),       # #c2410c burnt orange
    'accent': (249, 115, 22),   # #f97316 amber
    'bright': (253, 186, 116),  # #fdba74 light orange
}

HYDRALISK_COLORS = {
    'body': (10, 51, 28),       # #0a331c dark green
    'light': (74, 222, 128),    # #4ade80 bright green
    'mid': (22, 101, 52),       # #166534 medium green
    'accent': (34, 197, 94),    # #22c55e lime green
    'glow': (163, 230, 53),     # #a3e635 yellow-green
}


def load_base(name):
    path = os.path.join(BASE_DIR, f'{name}.png')
    img = Image.open(path).convert('RGBA')
    return img


def make_spritesheet(name, base_img, frames):
    """Create a spritesheet PNG from a list of frame PIL Images.

    Frames are placed side by side horizontally.
    """
    fw, fh = base_img.size
    total_w = fw * len(frames)
    sheet = Image.new('RGBA', (total_w, fh), (0, 0, 0, 0))

    for i, frame in enumerate(frames):
        sheet.paste(frame, (i * fw, 0))

    out_path = os.path.join(BASE_DIR, f'{name}.png')
    sheet.save(out_path, 'PNG')
    print(f"  Created {out_path} ({total_w}x{fh}, {len(frames)} frames)")


# ──────────────────────────────────────────────
# DRONE ANIMATION FRAMES (worker, 52x26)
# ──────────────────────────────────────────────

def drone_idle_frames(base):
    """Idle bob: body shifts up/down by 1 pixel (breathing)."""
    w, h = base.size
    # Frame 0: normal position
    f0 = base.copy()
    # Frame 1: bob up by 1 pixel (shift all non-transparent pixels down by 1)
    f1 = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    pixels = list(base.getdata())

    for y in range(h):
        for x in range(w):
            px = pixels[y * w + x]
            if px[3] > 0:  # transparent pixels stay transparent
                ny = y + 1  # shift down by 1 (visual bob up)
                if ny < h:
                    f1.putpixel((x, ny), px)

    return [f0, f1]


def drone_walk_frames(base):
    """Walk cycle: 4 frames showing leg/body cycling motion.

    The drone bobs side to side as it moves forward.
    """
    w, h = base.size
    pixels = list(base.getdata())
    frames = []

    for offset in [0, 1, 0, -1]:
        frame = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        for y in range(h):
            for x in range(w):
                px = pixels[y * w + x]
                if px[3] > 0:
                    nx = x + offset
                    if 0 <= nx < w:
                        frame.putpixel((nx, y), px)
                    else:
                        # Wrap around edge (small sprites, just drop)
                        pass
        frames.append(frame)

    return frames


def drone_attack_frames(base):
    """Drone attack (construction bite): 2 frames.

    Drone lunges forward slightly, then returns.
    """
    w, h = base.size
    pixels = list(base.getdata())
    frames = []

    # Frame 0: normal (ready to construct)
    f0 = base.copy()

    # Frame 1: lunge forward (shift right by 2 pixels)
    f1 = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    for y in range(h):
        for x in range(w):
            px = pixels[y * w + x]
            if px[3] > 0:
                nx = x + 2
                if nx < w:
                    f1.putpixel((nx, y), px)
    frames.extend([f0, f1])
    return frames


def drone_death_frames(base):
    """Death: 4 frames showing collapse/dissolve.

    Shrinks and fades out (alpha reduction).
    """
    w, h = base.size
    pixels = list(base.getdata())
    frames = []

    # Frame 0: normal (100%)
    frames.append(base.copy())

    # Frame 1: slightly shrunk (80%)
    f1 = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    for y in range(h):
        for x in range(w):
            px = pixels[y * w + x]
            if px[3] > 0:
                nx = int(x * 0.8)
                ny = int(y * 0.8)
                f1.putpixel((nx, ny), (px[0], px[1], px[2], int(px[3] * 0.8)))
    frames.append(f1)

    # Frame 2: more shrunk (50%), more transparent
    f2 = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    for y in range(h):
        for x in range(w):
            px = pixels[y * w + x]
            if px[3] > 0:
                nx = int(x * 0.5)
                ny = int(y * 0.5)
                f2.putpixel((nx, ny), (px[0], px[1], px[2], int(px[3] * 0.4)))
    frames.append(f2)

    # Frame 3: gone (fully transparent)
    frames.append(Image.new('RGBA', (w, h), (0, 0, 0, 0)))

    return frames


# ──────────────────────────────────────────────
# ZERGKING (Zergling) ANIMATION FRAMES (soldier, 52x26)
# ──────────────────────────────────────────────

def zergling_idle_frames(base):
    """Idle bob: subtle breathing (shift up/down by 1 pixel)."""
    w, h = base.size
    f0 = base.copy()

    # Frame 1: bob up by 1 pixel
    f1 = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    pixels = list(base.getdata())
    for y in range(h):
        for x in range(w):
            px = pixels[y * w + x]
            if px[3] > 0:
                ny = y + 1
                if ny < h:
                    f1.putpixel((x, ny), px)

    return [f0, f1]


def zergling_walk_frames(base):
    """Walk cycle: 4 frames showing fast Zergling leg cycling.

    Zerglings are fast - frames show quick side-to-side motion.
    """
    w, h = base.size
    pixels = list(base.getdata())
    frames = []

    # 4-frame walk: shift right, center, left, center
    offsets = [0, 1, -1, 0]
    for offset in offsets:
        frame = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        for y in range(h):
            for x in range(w):
                px = pixels[y * w + x]
                if px[3] > 0:
                    nx = x + offset
                    if 0 <= nx < w:
                        frame.putpixel((nx, y), px)
        frames.append(frame)

    return frames


def zergling_attack_frames(base):
    """Attack (melee lunge): 3 frames.

    Zergling lunges forward, bites, then recovers.
    """
    w, h = base.size
    pixels = list(base.getdata())
    frames = []

    # Frame 0: normal (ready)
    f0 = base.copy()

    # Frame 1: lunge forward (shift right by 3 pixels, small)
    f1 = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    for y in range(h):
        for x in range(w):
            px = pixels[y * w + x]
            if px[3] > 0:
                nx = x + 3
                if nx < w:
                    f1.putpixel((nx, y), px)

    # Frame 2: recover (back to normal)
    f2 = base.copy()

    return [f0, f1, f2]


def zergling_death_frames(base):
    """Death: 4 frames - collapse and dissolve.

    Shrinks, fades, and tips over slightly.
    """
    w, h = base.size
    pixels = list(base.getdata())
    frames = []

    # Frame 0: normal (100%)
    frames.append(base.copy())

    # Frame 1: shrink to 75%, fade
    f1 = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    for y in range(h):
        for x in range(w):
            px = pixels[y * w + x]
            if px[3] > 0:
                nx = int(x * 0.75)
                ny = int(y * 0.75 + 2)  # sink down slightly
                f1.putpixel((nx, ny), (px[0], px[1], px[2], int(px[3] * 0.7)))
    frames.append(f1)

    # Frame 2: more collapse (50%), very transparent
    f2 = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    for y in range(h):
        for x in range(w):
            px = pixels[y * w + x]
            if px[3] > 0:
                nx = int(x * 0.4)
                ny = int(y * 0.4 + 5)  # sink more
                f2.putpixel((nx, ny), (px[0], px[1], px[2], int(px[3] * 0.3)))
    frames.append(f2)

    # Frame 3: gone
    frames.append(Image.new('RGBA', (w, h), (0, 0, 0, 0)))

    return frames


# ──────────────────────────────────────────────
# HYDRALISK ANIMATION FRAMES (signature, 60x30)
# ──────────────────────────────────────────────

def hydralisk_idle_frames(base):
    """Idle bob: subtle breathing (shift up/down by 1 pixel).

    Hydralisk is bigger - bob is more pronounced (2 pixels).
    """
    w, h = base.size
    f0 = base.copy()

    # Frame 1: bob up by 2 pixels (bigger creature, more breathing)
    f1 = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    pixels = list(base.getdata())
    for y in range(h):
        for x in range(w):
            px = pixels[y * w + x]
            if px[3] > 0:
                ny = y + 2
                if ny < h:
                    f1.putpixel((x, ny), px)

    return [f0, f1]


def hydralisk_walk_frames(base):
    """Walk cycle: 4 frames showing slow Hydralisk movement.

    Hydralisks are heavy - slower, more deliberate steps.
    """
    w, h = base.size
    pixels = list(base.getdata())
    frames = []

    offsets = [0, 1, 0, -1]
    for offset in offsets:
        frame = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        for y in range(h):
            for x in range(w):
                px = pixels[y * w + x]
                if px[3] > 0:
                    nx = x + offset
                    if 0 <= nx < w:
                        frame.putpixel((nx, y), px)
        frames.append(frame)

    return frames


def hydralisk_attack_frames(base):
    """Attack (ranged fire): 5 frames - aim, fire, recoil, settle, recover.

    Hydralisk has a projectile attack:
    Frame 0: normal (idle)
    Frame 1: aim up (head/needle launcher rises - shift body parts up by 2)
    Frame 2: fire (projectile appears - we add green dots at tip)
    Frame 3: recoil (body pushed back slightly)
    Frame 4: settle (returns to normal)
    """
    w, h = base.size
    pixels = list(base.getdata())

    frames = []

    # Frame 0: normal
    frames.append(base.copy())

    # Frame 1: AIM - shift upper body up by 2 pixels (simulates launcher raising)
    f1 = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    for y in range(h):
        for x in range(w):
            px = pixels[y * w + x]
            if px[3] > 0:
                ny = y - 2  # shift up (aiming higher)
                if 0 <= ny < h:
                    f1.putpixel((x, ny), px)
    frames.append(f1)

    # Frame 2: FIRE - same as aim but add projectile dots at the tip
    f2 = f1.copy()
    draw = ImageDraw.Draw(f2)
    # Add green projectile dots at the tip (right side of hydralisk)
    # Hydralisk shoots from ~x=45, y=10-18 area
    projectile_color = (74, 222, 128, 200)  # bright green, semi-transparent
    # Main projectile dot
    draw.ellipse((47, 8, 51, 12), fill=(74, 222, 128, 200))
    # Glow dot
    draw.ellipse((49, 10, 50, 11), fill=(163, 230, 53, 180))
    frames.append(f2)

    # Frame 3: RECOIL - body pushed back by 1 pixel
    f3 = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    for y in range(h):
        for x in range(w):
            px = pixels[y * w + x]
            if px[3] > 0:
                nx = x - 1  # recoil left
                if 0 <= nx < w:
                    f3.putpixel((nx, y), px)
    frames.append(f3)

    # Frame 4: SETTLE - back to normal
    frames.append(base.copy())

    return frames


def hydralisk_death_frames(base):
    """Death: 4 frames - collapse and dissolve.

    Hydralisk falls apart, green goo splatters.
    """
    w, h = base.size
    pixels = list(base.getdata())
    frames = []

    # Frame 0: normal (100%)
    frames.append(base.copy())

    # Frame 1: shrink to 75%, start fading
    f1 = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    for y in range(h):
        for x in range(w):
            px = pixels[y * w + x]
            if px[3] > 0:
                nx = int(x * 0.75)
                ny = int(y * 0.75 + 2)  # sink down
                f1.putpixel((nx, ny), (px[0], px[1], px[2], int(px[3] * 0.7)))
    frames.append(f1)

    # Frame 2: collapse (50%), very transparent, with splatter dots
    f2 = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(f2)
    for y in range(h):
        for x in range(w):
            px = pixels[y * w + x]
            if px[3] > 0:
                nx = int(x * 0.45)
                ny = int(y * 0.45 + 6)  # sink more
                f2.putpixel((nx, ny), (px[0], px[1], px[2], int(px[3] * 0.3)))
    # Add splatter dots (green goo)
    draw.ellipse((10, 20, 14, 24), fill=(74, 222, 128, 150))
    draw.ellipse((40, 22, 44, 26), fill=(34, 197, 94, 150))
    draw.ellipse((25, 24, 28, 27), fill=(163, 230, 53, 120))
    frames.append(f2)

    # Frame 3: gone (fully transparent, with residual splatter)
    f3 = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(f3)
    # Residual splatter dots only
    draw.ellipse((12, 22, 13, 23), fill=(74, 222, 128, 60))
    draw.ellipse((42, 24, 43, 25), fill=(34, 197, 94, 60))
    frames.append(f3)

    return frames


# ──────────────────────────────────────────────
# BUILD ALL SPRITESHEETS
# ──────────────────────────────────────────────

def build_all():
    print("Generating Zerg unit spritesheets...")

    # --- Drone ---
    print("\nDrone (worker):")
    base = load_base('drone')
    idle = drone_idle_frames(base)
    walk = drone_walk_frames(base)
    attack = drone_attack_frames(base)
    death = drone_death_frames(base)

    all_frames = idle + walk + attack + death
    make_spritesheet('drone', base, all_frames)

    # --- Zergling ---
    print("\nZergling (soldier):")
    base = load_base('zergling')
    idle = zergling_idle_frames(base)
    walk = zergling_walk_frames(base)
    attack = zergling_attack_frames(base)
    death = zergling_death_frames(base)

    all_frames = idle + walk + attack + death
    make_spritesheet('zergling', base, all_frames)

    # --- Hydralisk ---
    print("\nHydralisk (signature):")
    base = load_base('hydralisk')
    idle = hydralisk_idle_frames(base)
    walk = hydralisk_walk_frames(base)
    attack = hydralisk_attack_frames(base)
    death = hydralisk_death_frames(base)

    all_frames = idle + walk + attack + death
    make_spritesheet('hydralisk', base, all_frames)

    # Print frame layout info for Phaser config
    print("\n=== Frame Layout Summary ===")
    layouts = {
        'drone': {'fw': 52, 'fh': 26, 'idle': 2, 'walk': 4, 'attack': 2, 'death': 4},
        'zergling': {'fw': 52, 'fh': 26, 'idle': 2, 'walk': 4, 'attack': 3, 'death': 4},
        'hydralisk': {'fw': 60, 'fh': 30, 'idle': 2, 'walk': 4, 'attack': 5, 'death': 4},
    }

    for name, layout in layouts.items():
        total = layout['idle'] + layout['walk'] + layout['attack'] + layout['death']
        print(f"  {name}: frameSize=({layout['fw']},{layout['fh']}), "
              f"frames={total} "
              f"[idle:0..{layout['idle']-1}, walk:{layout['idle']}..{layout['idle']+layout['walk']-1}, "
              f"attack:{layout['idle']+layout['walk']}..{layout['idle']+layout['walk']+layout['attack']-1}, "
              f"death:{layout['idle']+layout['walk']+layout['attack']}..{total-1}]")


if __name__ == '__main__':
    build_all()
