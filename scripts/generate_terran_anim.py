#!/usr/bin/env python3.11
"""Generate animated Terran spritesheets (Marine, Marauder, SCV).

Creates multi-frame spritesheets with idle bob, walk cycle,
attack (aim+fire), and death animations in the same pixel art style.

Output: public/assets/sprites/terran-anim/{marine|marauder|scv}.png
"""

from PIL import Image, ImageDraw
import os

OUTPUT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    'public', 'assets', 'sprites', 'terran-anim'
)

os.makedirs(OUTPUT_DIR, exist_ok=True)

# ── colour palettes matching existing sprites ──────────────────────
C = {
    'bg':        (15, 23, 42),   # #0f172a dark backdrop
    'blue':      (37, 99, 235),  # #2563eb
    'blueL':     (59, 130, 246), # #3b82f6
    'blueLL':    (191, 219, 254),# #bfdbfe
    'blueLLL':   (219, 234, 254),# #dbeafe
    'grey':      (100, 116, 139),# #64748b
    'greyL':     (226, 232, 240),# #e2e8f0
    'red':       (248, 113, 113),# #f87171
    'amber':     (251, 191, 36), # #fbff24
    'navy':      (30, 63, 135),  # #1e3f87 (marauder)
    'greyDark':  (51, 65, 85),   # #334155 (scv)
    'greyMid':   (74, 85, 104),  # #4a5568 (scv)
    'steel':     (147, 197, 253),# #93c5fd
}

def draw_pixel_rect(draw, x, y, w, h, color):
    """Draw a solid rectangle at pixel coordinates."""
    if w <= 0 or h <= 0:
        return
    draw.rectangle([x, y, x + w - 1, y + h - 1], fill=color)

def draw_pixel_line(draw, x1, y1, x2, y2, color, thickness=1):
    """Bresenham line with optional thickness."""
    dx = abs(x2 - x1)
    dy = abs(y2 - y1)
    sx = 1 if x1 < x2 else -1
    sy = 1 if y1 < y2 else -1
    err = dx - dy
    cx, cy = x1, y1
    while True:
        for ox in range(-thickness // 2, thickness // 2 + 1):
            for oy in range(-thickness // 2, thickness // 2 + 1):
                nx, ny = cx + ox, cy + oy
                if 0 <= nx < 120 and 0 <= ny < 68:
                    draw.point([(nx, ny)], fill=color)
        if cx == x2 and cy == y2:
            break
        e2 = 2 * err
        if e2 > -dy:
            err -= dy
            cx += sx
        if e2 < dx:
            err += dx
            cy += sy

def draw_pixel_circle(draw, cx, cy, r, color):
    """Simple pixel circle."""
    for y in range(cy - r, cy + r + 1):
        for x in range(cx - r, cx + r + 1):
            if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                draw.point([(x, y)], fill=color)

def generate_marine():
    """Generate marine.png spritesheet (60x30 per frame, 11 frames).

    Frame layout: [idle:0-1][walk:2-5][attack:6-8][death:9-10]
    """
    W, H = 60, 30
    FRAME_COUNT = 11
    sheet_w = W * FRAME_COUNT
    sheet_h = H

    img = Image.new('RGBA', (sheet_w, sheet_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    cx = W // 2  # center x of unit body

    for frame in range(FRAME_COUNT):
        ctx = ImageDraw.Draw(img)

        if frame < 2:
            # ── IDLE frames (0-1) ──────────────────────────────
            bob = 1 if frame == 1 else 0

            # Shadow / ground line
            draw_pixel_rect(ctx, 8, H - 3, 44, 2, C['bg'])

            # Boots
            draw_pixel_rect(ctx, 14, H - 7 + bob, 8, 5, C['grey'])
            draw_pixel_rect(ctx, 38, H - 7 + bob, 8, 5, C['grey'])

            # Legs
            draw_pixel_rect(ctx, 16, H - 15 + bob, 6, 8, C['blue'])
            draw_pixel_rect(ctx, 38, H - 15 + bob, 6, 8, C['blue'])

            # Body / torso
            draw_pixel_rect(ctx, 18, H - 28 + bob, 24, 13, C['blue'])
            # Chest detail
            draw_pixel_rect(ctx, 20, H - 26 + bob, 20, 2, C['blueL'])
            # Belt / waist
            draw_pixel_rect(ctx, 18, H - 16 + bob, 24, 3, C['grey'])
            draw_pixel_rect(ctx, 28, H - 15 + bob, 4, 3, C['amber'])

            # Backpack (smaller than marauder)
            draw_pixel_rect(ctx, 16, H - 27 + bob, 8, 10, C['greyDark'])
            draw_pixel_rect(ctx, 36, H - 27 + bob, 8, 10, C['greyDark'])

            # Head / helmet
            draw_pixel_rect(ctx, 24, H - 30 + bob, 12, 5, C['blueL'])
            # Visor (red)
            draw_pixel_rect(ctx, 30, H - 29 + bob, 6, 2, C['red'])
            # Helmet highlight
            draw_pixel_rect(ctx, 26, H - 30 + bob, 4, 1, C['blueLL'])

            # Weapon (rifle) — pointing right
            draw_pixel_rect(ctx, 40, H - 22 + bob, 16, 3, C['grey'])
            draw_pixel_rect(ctx, 52, H - 23 + bob, 4, 5, C['greyDark'])
            # Muzzle tip
            draw_pixel_rect(ctx, 56, H - 22 + bob, 2, 3, C['amber'])

            # Hand
            draw_pixel_rect(ctx, 40, H - 21 + bob, 3, 3, C['greyL'])

        elif frame < 6:
            # ── WALK frames (2-5) ───────────────────────────────
            phase = frame - 2

            draw_pixel_rect(ctx, 8, H - 3, 44, 2, C['bg'])

            # Walk bob offset (subtle vertical shift)
            walk_bob = 1 if phase % 2 == 0 else 0

            if phase == 0:
                # Left leg forward
                draw_pixel_rect(ctx, 12, H - 5 + walk_bob, 8, 4, C['grey'])
                draw_pixel_rect(ctx, 12, H - 9 + walk_bob, 6, 5, C['blue'])
                draw_pixel_rect(ctx, 40, H - 15 + walk_bob, 6, 9, C['blue'])
                draw_pixel_rect(ctx, 40, H - 15 + walk_bob, 8, 5, C['grey'])
            elif phase == 1:
                # Both legs slightly bent (mid-stride)
                draw_pixel_rect(ctx, 15, H - 6 + walk_bob, 7, 5, C['grey'])
                draw_pixel_rect(ctx, 15, H - 14 + walk_bob, 6, 9, C['blue'])
                draw_pixel_rect(ctx, 38, H - 6 + walk_bob, 7, 5, C['grey'])
                draw_pixel_rect(ctx, 38, H - 14 + walk_bob, 6, 9, C['blue'])
            elif phase == 2:
                # Right leg forward (mirrored)
                draw_pixel_rect(ctx, 40, H - 5 + walk_bob, 8, 4, C['grey'])
                draw_pixel_rect(ctx, 40, H - 9 + walk_bob, 6, 5, C['blue'])
                draw_pixel_rect(ctx, 14, H - 15 + walk_bob, 6, 9, C['blue'])
                draw_pixel_rect(ctx, 14, H - 15 + walk_bob, 8, 5, C['grey'])
            elif phase == 3:
                # Both legs slightly bent (mid-stride return)
                draw_pixel_rect(ctx, 15, H - 6 + walk_bob, 7, 5, C['grey'])
                draw_pixel_rect(ctx, 15, H - 14 + walk_bob, 6, 9, C['blue'])
                draw_pixel_rect(ctx, 38, H - 6 + walk_bob, 7, 5, C['grey'])
                draw_pixel_rect(ctx, 38, H - 14 + walk_bob, 6, 9, C['blue'])

            # Body (shifts slightly with walk)
            body_y = H - 28 + walk_bob
            draw_pixel_rect(ctx, 18, body_y, 24, 13, C['blue'])
            draw_pixel_rect(ctx, 20, body_y + 2, 20, 2, C['blueL'])
            draw_pixel_rect(ctx, 18, body_y + 12, 24, 3, C['grey'])
            draw_pixel_rect(ctx, 28, body_y + 13, 4, 3, C['amber'])

            # Backpack
            draw_pixel_rect(ctx, 16, body_y + 1, 8, 10, C['greyDark'])
            draw_pixel_rect(ctx, 36, body_y + 1, 8, 10, C['greyDark'])

            # Head
            draw_pixel_rect(ctx, 24, body_y - 2, 12, 5, C['blueL'])
            draw_pixel_rect(ctx, 30, body_y - 1, 6, 2, C['red'])
            draw_pixel_rect(ctx, 26, body_y - 2, 4, 1, C['blueLL'])

            # Weapon — slight bob with walk
            weapon_y = H - 22 + walk_bob
            draw_pixel_rect(ctx, 40, weapon_y, 16, 3, C['grey'])
            draw_pixel_rect(ctx, 52, weapon_y - 1, 4, 5, C['greyDark'])
            draw_pixel_rect(ctx, 56, weapon_y, 2, 3, C['amber'])
            draw_pixel_rect(ctx, 40, weapon_y + 1, 3, 3, C['greyL'])

        elif frame < 9:
            # ── ATTACK frames (6-8) ─────────────────────────────
            attack_phase = frame - 6

            draw_pixel_rect(ctx, 8, H - 3, 44, 2, C['bg'])

            # Feet planted (no walk bob)
            draw_pixel_rect(ctx, 14, H - 7, 8, 5, C['grey'])
            draw_pixel_rect(ctx, 40, H - 7, 8, 5, C['grey'])

            # Legs
            draw_pixel_rect(ctx, 16, H - 15, 6, 9, C['blue'])
            draw_pixel_rect(ctx, 40, H - 15, 6, 9, C['blue'])

            # Body
            body_y = H - 28
            draw_pixel_rect(ctx, 18, body_y, 24, 13, C['blue'])
            draw_pixel_rect(ctx, 20, body_y + 2, 20, 2, C['blueL'])
            draw_pixel_rect(ctx, 18, body_y + 12, 24, 3, C['grey'])
            draw_pixel_rect(ctx, 28, body_y + 13, 4, 3, C['amber'])

            # Backpack
            draw_pixel_rect(ctx, 16, body_y + 1, 8, 10, C['greyDark'])
            draw_pixel_rect(ctx, 36, body_y + 1, 8, 10, C['greyDark'])

            # Head
            draw_pixel_rect(ctx, 24, body_y - 2, 12, 5, C['blueL'])
            draw_pixel_rect(ctx, 30, body_y - 1, 6, 2, C['red'])

            if attack_phase == 0:
                # AIM — weapon raised slightly, body leans forward
                draw_pixel_rect(ctx, 18, body_y + 1, 24, 13, C['blue'])
                weapon_y = H - 24
                draw_pixel_rect(ctx, 38, weapon_y, 16, 3, C['grey'])
                draw_pixel_rect(ctx, 50, weapon_y - 1, 4, 5, C['greyDark'])
                draw_pixel_rect(ctx, 54, weapon_y, 2, 3, C['amber'])
                draw_pixel_rect(ctx, 38, weapon_y + 1, 3, 3, C['greyL'])
                # Lean body forward (shift right by 1)
            elif attack_phase == 1:
                # FIRE — weapon extended, muzzle flash!
                weapon_y = H - 23
                draw_pixel_rect(ctx, 38, weapon_y, 16, 3, C['grey'])
                draw_pixel_rect(ctx, 54, weapon_y - 1, 4, 5, C['greyDark'])
                # Muzzle flash (amber + white)
                draw_pixel_rect(ctx, 58, weapon_y - 2, 3, 2, C['amber'])
                draw_pixel_rect(ctx, 59, weapon_y - 3, 1, 1, C['blueLL'])
                draw_pixel_rect(ctx, 58, weapon_y + 2, 3, 2, C['amber'])
                draw_pixel_rect(ctx, 59, weapon_y + 3, 1, 1, C['blueLL'])
                # Recoil — body shifted back slightly
            elif attack_phase == 2:
                # RETURN TO AIM — weapon coming back down
                weapon_y = H - 22
                draw_pixel_rect(ctx, 40, weapon_y, 16, 3, C['grey'])
                draw_pixel_rect(ctx, 52, weapon_y - 1, 4, 5, C['greyDark'])
                draw_pixel_rect(ctx, 56, weapon_y, 2, 3, C['amber'])
                draw_pixel_rect(ctx, 40, weapon_y + 1, 3, 3, C['greyL'])

        else:
            # ── DEATH frames (9-10) ─────────────────────────────
            death_phase = frame - 9

            # Fading / darkening effect
            alpha = 1.0 if death_phase == 0 else 0.4

            def darken(color, a):
                return tuple(int(c * a) for c in color)

            draw_pixel_rect(ctx, 8, H - 3, 44, 2, darken(C['bg'], alpha))

            # Unit falling / collapsing
            if death_phase == 0:
                # Just died — body tilts left
                draw_pixel_rect(ctx, 12, H - 7, 8, 5, darken(C['grey'], alpha))
                draw_pixel_rect(ctx, 38, H - 7, 8, 5, darken(C['grey'], alpha))
                draw_pixel_rect(ctx, 14, H - 15, 6, 9, darken(C['blue'], alpha))
                draw_pixel_rect(ctx, 40, H - 13, 6, 7, darken(C['blue'], alpha))
                body_y = H - 28
                draw_pixel_rect(ctx, 16, body_y + 2, 24, 13, darken(C['blue'], alpha))
                draw_pixel_rect(ctx, 16, body_y + 3, 20, 2, darken(C['blueL'], alpha))
                draw_pixel_rect(ctx, 16, body_y + 12, 24, 3, darken(C['grey'], alpha))
                draw_pixel_rect(ctx, 14, body_y + 1, 8, 10, darken(C['greyDark'], alpha))
                draw_pixel_rect(ctx, 34, body_y + 1, 8, 10, darken(C['greyDark'], alpha))
                draw_pixel_rect(ctx, 22, body_y - 2, 12, 5, darken(C['blueL'], alpha))
                draw_pixel_rect(ctx, 28, body_y - 1, 6, 2, darken(C['red'], alpha))
                # Weapon on ground
                draw_pixel_rect(ctx, 36, H - 10, 16, 3, darken(C['grey'], alpha))
                draw_pixel_rect(ctx, 48, H - 11, 4, 5, darken(C['greyDark'], alpha))
            else:
                # Gone — just a shadow fading out
                draw_pixel_rect(ctx, 20, H - 14, 20, 13, darken(C['blue'], alpha * 0.5))
                draw_pixel_rect(ctx, 24, H - 16, 10, 5, darken(C['blueL'], alpha * 0.3))

    img.save(os.path.join(OUTPUT_DIR, 'marine.png'), 'PNG')
    print(f'  marine.png: {sheet_w}x{sheet_h} ({FRAME_COUNT} frames @ {W}x{H})')


def generate_marauder():
    """Generate marauder.png spritesheet (68x34 per frame, 12 frames).

    Heavier armor, bigger weapon. Frames: [idle:0-1][walk:2-5][attack:6-9][death:10-11]
    """
    W, H = 68, 34
    FRAME_COUNT = 12
    sheet_w = W * FRAME_COUNT
    sheet_h = H

    img = Image.new('RGBA', (sheet_w, sheet_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    for frame in range(FRAME_COUNT):
        ctx = ImageDraw.Draw(img)

        if frame < 2:
            # ── IDLE frames (0-1) ───────────────────────────────
            bob = 1 if frame == 1 else 0

            # Shadow / ground line
            draw_pixel_rect(ctx, 10, H - 3, 48, 2, C['bg'])

            # Heavy boots
            draw_pixel_rect(ctx, 14, H - 8 + bob, 10, 6, C['grey'])
            draw_pixel_rect(ctx, 44, H - 8 + bob, 10, 6, C['grey'])

            # Heavy legs (thicker than marine)
            draw_pixel_rect(ctx, 16, H - 18 + bob, 8, 10, C['navy'])
            draw_pixel_rect(ctx, 44, H - 18 + bob, 8, 10, C['navy'])

            # Heavy body / torso (bigger)
            draw_pixel_rect(ctx, 18, H - 32 + bob, 32, 14, C['navy'])
            # Armor plates
            draw_pixel_rect(ctx, 20, H - 30 + bob, 28, 3, C['blue'])
            draw_pixel_rect(ctx, 20, H - 25 + bob, 28, 3, C['blueL'])
            # Belt / waist
            draw_pixel_rect(ctx, 18, H - 19 + bob, 32, 4, C['grey'])
            draw_pixel_rect(ctx, 28, H - 18 + bob, 4, 3, C['amber'])

            # Heavy backpack (bigger)
            draw_pixel_rect(ctx, 14, H - 31 + bob, 10, 12, C['grey'])
            draw_pixel_rect(ctx, 44, H - 31 + bob, 10, 12, C['grey'])
            # Backpack detail
            draw_pixel_rect(ctx, 16, H - 29 + bob, 6, 2, C['amber'])
            draw_pixel_rect(ctx, 46, H - 29 + bob, 6, 2, C['amber'])

            # Head / helmet (bigger)
            draw_pixel_rect(ctx, 26, H - 34 + bob, 16, 5, C['blueL'])
            # Visor (larger)
            draw_pixel_rect(ctx, 32, H - 33 + bob, 8, 3, C['red'])
            # Helmet highlight
            draw_pixel_rect(ctx, 28, H - 34 + bob, 6, 1, C['blueLL'])
            # Shoulder pads (bigger than marine)
            draw_pixel_rect(ctx, 14, H - 30 + bob, 6, 8, C['grey'])
            draw_pixel_rect(ctx, 48, H - 30 + bob, 6, 8, C['grey'])

            # Heavy weapon (cannon) — pointing right
            draw_pixel_rect(ctx, 48, H - 24 + bob, 16, 4, C['grey'])
            draw_pixel_rect(ctx, 60, H - 25 + bob, 6, 6, C['greyDark'])
            # Muzzle tip
            draw_pixel_rect(ctx, 64, H - 24 + bob, 3, 4, C['amber'])

            # Arm
            draw_pixel_rect(ctx, 48, H - 22 + bob, 3, 4, C['greyL'])

        elif frame < 6:
            # ── WALK frames (2-5) ───────────────────────────────
            phase = frame - 2

            draw_pixel_rect(ctx, 10, H - 3, 48, 2, C['bg'])

            if phase == 0:
                draw_pixel_rect(ctx, 12, H - 6 + phase, 10, 5, C['grey'])
                draw_pixel_rect(ctx, 12, H - 16 + phase, 8, 10, C['navy'])
                draw_pixel_rect(ctx, 46, H - 18 + phase, 8, 12, C['navy'])
                draw_pixel_rect(ctx, 46, H - 18 + phase, 10, 5, C['grey'])
            elif phase == 1:
                draw_pixel_rect(ctx, 15, H - 7 + phase, 9, 6, C['grey'])
                draw_pixel_rect(ctx, 15, H - 17 + phase, 8, 11, C['navy'])
                draw_pixel_rect(ctx, 43, H - 7 + phase, 9, 6, C['grey'])
                draw_pixel_rect(ctx, 43, H - 17 + phase, 8, 11, C['navy'])
            elif phase == 2:
                draw_pixel_rect(ctx, 46, H - 6 + phase, 10, 5, C['grey'])
                draw_pixel_rect(ctx, 46, H - 16 + phase, 8, 10, C['navy'])
                draw_pixel_rect(ctx, 12, H - 18 + phase, 8, 12, C['navy'])
                draw_pixel_rect(ctx, 12, H - 18 + phase, 10, 5, C['grey'])
            elif phase == 3:
                draw_pixel_rect(ctx, 15, H - 7 + phase, 9, 6, C['grey'])
                draw_pixel_rect(ctx, 15, H - 17 + phase, 8, 11, C['navy'])
                draw_pixel_rect(ctx, 43, H - 7 + phase, 9, 6, C['grey'])
                draw_pixel_rect(ctx, 43, H - 17 + phase, 8, 11, C['navy'])

            body_y = H - 32 + phase
            draw_pixel_rect(ctx, 18, body_y, 32, 14, C['navy'])
            draw_pixel_rect(ctx, 20, body_y + 2, 28, 3, C['blue'])
            draw_pixel_rect(ctx, 20, body_y + 7, 28, 3, C['blueL'])
            draw_pixel_rect(ctx, 18, body_y + 13, 32, 4, C['grey'])
            draw_pixel_rect(ctx, 28, body_y + 14, 4, 3, C['amber'])

            draw_pixel_rect(ctx, 14, body_y + 1, 10, 12, C['grey'])
            draw_pixel_rect(ctx, 44, body_y + 1, 10, 12, C['grey'])
            draw_pixel_rect(ctx, 16, body_y - 1, 6, 2, C['amber'])
            draw_pixel_rect(ctx, 46, body_y - 1, 6, 2, C['amber'])

            draw_pixel_rect(ctx, 26, body_y - 2, 16, 5, C['blueL'])
            draw_pixel_rect(ctx, 32, body_y - 1, 8, 3, C['red'])
            draw_pixel_rect(ctx, 28, body_y - 2, 6, 1, C['blueLL'])
            draw_pixel_rect(ctx, 14, body_y + 0, 6, 8, C['grey'])
            draw_pixel_rect(ctx, 48, body_y + 0, 6, 8, C['grey'])

            weapon_y = H - 24 + phase
            draw_pixel_rect(ctx, 48, weapon_y, 16, 4, C['grey'])
            draw_pixel_rect(ctx, 60, weapon_y - 1, 6, 6, C['greyDark'])
            draw_pixel_rect(ctx, 64, weapon_y, 3, 4, C['amber'])
            draw_pixel_rect(ctx, 48, weapon_y + 1, 3, 4, C['greyL'])

        elif frame < 10:
            # ── ATTACK frames (6-9) ─────────────────────────────
            attack_phase = frame - 6

            draw_pixel_rect(ctx, 10, H - 3, 48, 2, C['bg'])

            # Feet planted
            draw_pixel_rect(ctx, 14, H - 8, 10, 6, C['grey'])
            draw_pixel_rect(ctx, 46, H - 8, 10, 6, C['grey'])

            # Legs
            draw_pixel_rect(ctx, 16, H - 18, 8, 10, C['navy'])
            draw_pixel_rect(ctx, 46, H - 18, 8, 10, C['navy'])

            body_y = H - 32
            draw_pixel_rect(ctx, 18, body_y, 32, 14, C['navy'])
            draw_pixel_rect(ctx, 20, body_y + 2, 28, 3, C['blue'])
            draw_pixel_rect(ctx, 20, body_y + 7, 28, 3, C['blueL'])
            draw_pixel_rect(ctx, 18, body_y + 13, 32, 4, C['grey'])
            draw_pixel_rect(ctx, 28, body_y + 14, 4, 3, C['amber'])

            draw_pixel_rect(ctx, 14, body_y + 1, 10, 12, C['grey'])
            draw_pixel_rect(ctx, 44, body_y + 1, 10, 12, C['grey'])
            draw_pixel_rect(ctx, 16, body_y - 1, 6, 2, C['amber'])
            draw_pixel_rect(ctx, 46, body_y - 1, 6, 2, C['amber'])

            draw_pixel_rect(ctx, 26, body_y - 2, 16, 5, C['blueL'])
            draw_pixel_rect(ctx, 32, body_y - 1, 8, 3, C['red'])
            draw_pixel_rect(ctx, 28, body_y - 2, 6, 1, C['blueLL'])
            draw_pixel_rect(ctx, 14, body_y + 0, 6, 8, C['grey'])
            draw_pixel_rect(ctx, 48, body_y + 0, 6, 8, C['grey'])

            if attack_phase == 0:
                # AIM — weapon raised, body leans forward
                draw_pixel_rect(ctx, 20, body_y + 1, 32, 14, C['navy'])
                weapon_y = H - 26
                draw_pixel_rect(ctx, 46, weapon_y, 16, 4, C['grey'])
                draw_pixel_rect(ctx, 58, weapon_y - 1, 6, 6, C['greyDark'])
                draw_pixel_rect(ctx, 62, weapon_y, 3, 4, C['amber'])
                draw_pixel_rect(ctx, 46, weapon_y + 1, 3, 4, C['greyL'])
            elif attack_phase == 1:
                # FIRE — muzzle flash!
                weapon_y = H - 25
                draw_pixel_rect(ctx, 46, weapon_y, 16, 4, C['grey'])
                draw_pixel_rect(ctx, 58, weapon_y - 1, 6, 6, C['greyDark'])
                draw_pixel_rect(ctx, 64, weapon_y - 2, 3, 2, C['amber'])
                draw_pixel_rect(ctx, 65, weapon_y - 3, 1, 1, C['blueLL'])
                draw_pixel_rect(ctx, 64, weapon_y + 2, 3, 2, C['amber'])
                draw_pixel_rect(ctx, 65, weapon_y + 3, 1, 1, C['blueLL'])
            elif attack_phase == 2:
                # RETURN TO AIM
                weapon_y = H - 24
                draw_pixel_rect(ctx, 48, weapon_y, 16, 4, C['grey'])
                draw_pixel_rect(ctx, 60, weapon_y - 1, 6, 6, C['greyDark'])
                draw_pixel_rect(ctx, 64, weapon_y, 3, 4, C['amber'])
                draw_pixel_rect(ctx, 48, weapon_y + 1, 3, 4, C['greyL'])
            elif attack_phase == 3:
                # RETURN TO IDLE — weapon lowering
                weapon_y = H - 23
                draw_pixel_rect(ctx, 48, weapon_y, 16, 4, C['grey'])
                draw_pixel_rect(ctx, 60, weapon_y - 1, 6, 6, C['greyDark'])
                draw_pixel_rect(ctx, 64, weapon_y, 3, 4, C['amber'])
                draw_pixel_rect(ctx, 48, weapon_y + 1, 3, 4, C['greyL'])

        else:
            # ── DEATH frames (10-11) ────────────────────────────
            death_phase = frame - 10
            alpha = 1.0 if death_phase == 0 else 0.4

            def dk(color, a):
                return tuple(int(c * a) for c in color)

            draw_pixel_rect(ctx, 10, H - 3, 48, 2, dk(C['bg'], alpha))

            if death_phase == 0:
                # Collapsing left
                draw_pixel_rect(ctx, 12, H - 8, 10, 6, dk(C['grey'], alpha))
                draw_pixel_rect(ctx, 44, H - 8, 10, 6, dk(C['grey'], alpha))
                draw_pixel_rect(ctx, 14, H - 18, 8, 10, dk(C['navy'], alpha))
                draw_pixel_rect(ctx, 46, H - 15, 8, 8, dk(C['navy'], alpha))
                body_y = H - 32
                draw_pixel_rect(ctx, 16, body_y + 2, 32, 14, dk(C['navy'], alpha))
                draw_pixel_rect(ctx, 16, body_y + 3, 28, 3, dk(C['blue'], alpha))
                draw_pixel_rect(ctx, 14, body_y + 1, 10, 12, dk(C['grey'], alpha))
                draw_pixel_rect(ctx, 34, body_y + 1, 10, 12, dk(C['grey'], alpha))
                draw_pixel_rect(ctx, 24, body_y - 2, 16, 5, dk(C['blueL'], alpha))
                draw_pixel_rect(ctx, 30, body_y - 1, 8, 3, dk(C['red'], alpha))
                # Weapon on ground
                draw_pixel_rect(ctx, 40, H - 12, 16, 4, dk(C['grey'], alpha))
                draw_pixel_rect(ctx, 52, H - 13, 6, 6, dk(C['greyDark'], alpha))
            else:
                # Fading shadow
                draw_pixel_rect(ctx, 22, H - 16, 24, 14, dk(C['navy'], alpha * 0.5))
                draw_pixel_rect(ctx, 26, H - 18, 14, 5, dk(C['blueL'], alpha * 0.3))

    img.save(os.path.join(OUTPUT_DIR, 'marauder.png'), 'PNG')
    print(f'  marauder.png: {sheet_w}x{sheet_h} ({FRAME_COUNT} frames @ {W}x{H})')


def generate_scv():
    """Generate scv.png spritesheet (56x28 per frame, 10 frames).

    Worker unit — smaller, no heavy armor. Frames: [idle:0-1][walk:2-5][attack:6-7][death:8-9]
    """
    W, H = 56, 28
    FRAME_COUNT = 10
    sheet_w = W * FRAME_COUNT
    sheet_h = H

    img = Image.new('RGBA', (sheet_w, sheet_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    for frame in range(FRAME_COUNT):
        ctx = ImageDraw.Draw(img)

        if frame < 2:
            # ── IDLE frames (0-1) ───────────────────────────────
            bob = 1 if frame == 1 else 0

            # Shadow / ground line
            draw_pixel_rect(ctx, 6, H - 3, 44, 2, C['bg'])

            # Boots
            draw_pixel_rect(ctx, 12, H - 6 + bob, 7, 4, C['greyMid'])
            draw_pixel_rect(ctx, 37, H - 6 + bob, 7, 4, C['greyMid'])

            # Legs
            draw_pixel_rect(ctx, 14, H - 13 + bob, 5, 7, C['greyDark'])
            draw_pixel_rect(ctx, 37, H - 13 + bob, 5, 7, C['greyDark'])

            # Body (uniform)
            draw_pixel_rect(ctx, 16, H - 25 + bob, 24, 12, C['steel'])
            # Uniform detail (stripes)
            draw_pixel_rect(ctx, 18, H - 23 + bob, 20, 2, C['greyMid'])
            # Belt
            draw_pixel_rect(ctx, 16, H - 14 + bob, 24, 3, C['greyDark'])
            draw_pixel_rect(ctx, 26, H - 13 + bob, 4, 3, C['amber'])

            # Backpack (tool pack)
            draw_pixel_rect(ctx, 14, H - 24 + bob, 6, 8, C['greyDark'])
            draw_pixel_rect(ctx, 36, H - 24 + bob, 6, 8, C['greyDark'])

            # Head / hard hat (yellow/amber)
            draw_pixel_rect(ctx, 22, H - 27 + bob, 12, 5, C['amber'])
            # Face area
            draw_pixel_rect(ctx, 28, H - 26 + bob, 6, 3, C['greyL'])
            # Hard hat highlight
            draw_pixel_rect(ctx, 24, H - 27 + bob, 4, 1, C['blueLL'])

            # Tool / weapon (welding tool) — pointing right
            draw_pixel_rect(ctx, 38, H - 19 + bob, 14, 3, C['greyMid'])
            draw_pixel_rect(ctx, 48, H - 20 + bob, 4, 5, C['greyDark'])
            # Tip (sparks)
            draw_pixel_rect(ctx, 52, H - 19 + bob, 3, 3, C['amber'])

            # Hand
            draw_pixel_rect(ctx, 38, H - 18 + bob, 3, 3, C['greyL'])

        elif frame < 6:
            # ── WALK frames (2-5) ───────────────────────────────
            phase = frame - 2

            draw_pixel_rect(ctx, 6, H - 3, 44, 2, C['bg'])

            if phase == 0:
                draw_pixel_rect(ctx, 10, H - 5 + phase, 7, 4, C['greyMid'])
                draw_pixel_rect(ctx, 10, H - 12 + phase, 5, 7, C['greyDark'])
                draw_pixel_rect(ctx, 39, H - 13 + phase, 5, 8, C['greyDark'])
                draw_pixel_rect(ctx, 39, H - 13 + phase, 7, 4, C['greyMid'])
            elif phase == 1:
                draw_pixel_rect(ctx, 13, H - 6 + phase, 6, 5, C['greyMid'])
                draw_pixel_rect(ctx, 13, H - 13 + phase, 5, 7, C['greyDark'])
                draw_pixel_rect(ctx, 36, H - 6 + phase, 6, 5, C['greyMid'])
                draw_pixel_rect(ctx, 36, H - 13 + phase, 5, 7, C['greyDark'])
            elif phase == 2:
                draw_pixel_rect(ctx, 39, H - 5 + phase, 7, 4, C['greyMid'])
                draw_pixel_rect(ctx, 39, H - 12 + phase, 5, 7, C['greyDark'])
                draw_pixel_rect(ctx, 10, H - 13 + phase, 5, 8, C['greyDark'])
                draw_pixel_rect(ctx, 10, H - 13 + phase, 7, 4, C['greyMid'])
            elif phase == 3:
                draw_pixel_rect(ctx, 13, H - 6 + phase, 6, 5, C['greyMid'])
                draw_pixel_rect(ctx, 13, H - 13 + phase, 5, 7, C['greyDark'])
                draw_pixel_rect(ctx, 36, H - 6 + phase, 6, 5, C['greyMid'])
                draw_pixel_rect(ctx, 36, H - 13 + phase, 5, 7, C['greyDark'])

            body_y = H - 25 + phase
            draw_pixel_rect(ctx, 16, body_y, 24, 12, C['steel'])
            draw_pixel_rect(ctx, 18, body_y + 2, 20, 2, C['greyMid'])
            draw_pixel_rect(ctx, 16, body_y + 11, 24, 3, C['greyDark'])
            draw_pixel_rect(ctx, 26, body_y + 12, 4, 3, C['amber'])

            draw_pixel_rect(ctx, 14, body_y + 1, 6, 8, C['greyDark'])
            draw_pixel_rect(ctx, 36, body_y + 1, 6, 8, C['greyDark'])

            draw_pixel_rect(ctx, 22, body_y - 2, 12, 5, C['amber'])
            draw_pixel_rect(ctx, 28, body_y - 1, 6, 3, C['greyL'])
            draw_pixel_rect(ctx, 24, body_y - 2, 4, 1, C['blueLL'])

            weapon_y = H - 19 + phase
            draw_pixel_rect(ctx, 38, weapon_y, 14, 3, C['greyMid'])
            draw_pixel_rect(ctx, 48, weapon_y - 1, 4, 5, C['greyDark'])
            draw_pixel_rect(ctx, 52, weapon_y, 3, 3, C['amber'])
            draw_pixel_rect(ctx, 38, weapon_y + 1, 3, 3, C['greyL'])

        elif frame < 8:
            # ── ATTACK frames (6-7) ─────────────────────────────
            attack_phase = frame - 6

            draw_pixel_rect(ctx, 6, H - 3, 44, 2, C['bg'])

            # Feet planted
            draw_pixel_rect(ctx, 12, H - 6, 7, 4, C['greyMid'])
            draw_pixel_rect(ctx, 39, H - 6, 7, 4, C['greyMid'])

            # Legs
            draw_pixel_rect(ctx, 14, H - 13, 5, 7, C['greyDark'])
            draw_pixel_rect(ctx, 39, H - 13, 5, 7, C['greyDark'])

            body_y = H - 25
            draw_pixel_rect(ctx, 16, body_y, 24, 12, C['steel'])
            draw_pixel_rect(ctx, 18, body_y + 2, 20, 2, C['greyMid'])
            draw_pixel_rect(ctx, 16, body_y + 11, 24, 3, C['greyDark'])
            draw_pixel_rect(ctx, 26, body_y + 12, 4, 3, C['amber'])

            draw_pixel_rect(ctx, 14, body_y + 1, 6, 8, C['greyDark'])
            draw_pixel_rect(ctx, 36, body_y + 1, 6, 8, C['greyDark'])

            draw_pixel_rect(ctx, 22, body_y - 2, 12, 5, C['amber'])
            draw_pixel_rect(ctx, 28, body_y - 1, 6, 3, C['greyL'])

            if attack_phase == 0:
                # AIM — tool raised
                weapon_y = H - 21
                draw_pixel_rect(ctx, 36, weapon_y, 14, 3, C['greyMid'])
                draw_pixel_rect(ctx, 46, weapon_y - 1, 4, 5, C['greyDark'])
                draw_pixel_rect(ctx, 50, weapon_y, 3, 3, C['amber'])
                draw_pixel_rect(ctx, 36, weapon_y + 1, 3, 3, C['greyL'])
            elif attack_phase == 1:
                # FIRE / WELD — sparks!
                weapon_y = H - 20
                draw_pixel_rect(ctx, 36, weapon_y, 14, 3, C['greyMid'])
                draw_pixel_rect(ctx, 46, weapon_y - 1, 4, 5, C['greyDark'])
                # Welding sparks (amber + bright)
                draw_pixel_rect(ctx, 50, weapon_y - 2, 3, 2, C['amber'])
                draw_pixel_rect(ctx, 51, weapon_y - 3, 1, 1, C['blueLL'])
                draw_pixel_rect(ctx, 50, weapon_y + 2, 3, 2, C['amber'])
                draw_pixel_rect(ctx, 51, weapon_y + 3, 1, 1, C['blueLL'])

        else:
            # ── DEATH frames (8-9) ──────────────────────────────
            death_phase = frame - 8
            alpha = 1.0 if death_phase == 0 else 0.4

            def dk(color, a):
                return tuple(int(c * a) for c in color)

            draw_pixel_rect(ctx, 6, H - 3, 44, 2, dk(C['bg'], alpha))

            if death_phase == 0:
                # Collapsing
                draw_pixel_rect(ctx, 10, H - 6, 7, 4, dk(C['greyMid'], alpha))
                draw_pixel_rect(ctx, 37, H - 6, 7, 4, dk(C['greyMid'], alpha))
                draw_pixel_rect(ctx, 12, H - 13, 5, 7, dk(C['greyDark'], alpha))
                draw_pixel_rect(ctx, 39, H - 10, 5, 5, dk(C['greyDark'], alpha))
                body_y = H - 25
                draw_pixel_rect(ctx, 14, body_y + 2, 24, 12, dk(C['steel'], alpha))
                draw_pixel_rect(ctx, 14, body_y + 1, 6, 8, dk(C['greyDark'], alpha))
                draw_pixel_rect(ctx, 34, body_y + 1, 6, 8, dk(C['greyDark'], alpha))
                draw_pixel_rect(ctx, 20, body_y - 2, 12, 5, dk(C['amber'], alpha))
                draw_pixel_rect(ctx, 26, body_y - 1, 6, 3, dk(C['greyL'], alpha))
                # Tool on ground
                draw_pixel_rect(ctx, 36, H - 10, 14, 3, dk(C['greyMid'], alpha))
                draw_pixel_rect(ctx, 46, H - 11, 4, 5, dk(C['greyDark'], alpha))
            else:
                # Fading shadow
                draw_pixel_rect(ctx, 18, H - 13, 20, 12, dk(C['steel'], alpha * 0.5))
                draw_pixel_rect(ctx, 22, H - 15, 10, 5, dk(C['amber'], alpha * 0.3))

    img.save(os.path.join(OUTPUT_DIR, 'scv.png'), 'PNG')
    print(f'  scv.png: {sheet_w}x{sheet_h} ({FRAME_COUNT} frames @ {W}x{H})')


if __name__ == '__main__':
    print('Generating Terran animated spritesheets...')

    print('\nMarine:')
    generate_marine()

    print('\nMarauder:')
    generate_marauder()

    print('\nSCV:')
    generate_scv()

    print('\nDone! Files written to:', OUTPUT_DIR)
    for f in sorted(os.listdir(OUTPUT_DIR)):
        if f.endswith('.png'):
            path = os.path.join(OUTPUT_DIR, f)
            img = Image.open(path)
            print(f'  {f}: {img.size[0]}x{img.size[1]}, mode={img.mode}')
