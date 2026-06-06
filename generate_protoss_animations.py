#!/usr/bin/env python3.11
"""Generate multi-frame spritesheets for Protoss units (Probe, Zealot, Dragoon).

Each spritesheet encodes 16 frames: 4 idle bob, 4 walk cycle, 4 attack (aim+fire), 4 death.
Frames are laid out horizontally (standard Phaser spritesheet format).

Protoss palette: deep indigo (#1e1b4b) base, blue energy (#60a5fa), purple glow (#7c3aed),
light purple (#a78bfa), lavender (#c4b5fd), pale violet (#ddd6fe).
"""

from PIL import Image
import os

# Protoss color palette (matching existing pixel art)
INDIGO    = (30, 27, 75)     # dark base
PURPLE    = (124, 58, 237)   # primary purple
BLUE_ENRG = (96, 165, 250)   # blue energy glow
LAVENDER  = (167, 139, 250)  # light purple
LILAC     = (196, 181, 253)  # pale lavender
VIOLET    = (221, 214, 254)  # very pale violet
BRIGHT    = (237, 233, 254)  # near-white energy
TRANSPARENT = (0, 0, 0, 0)

# Frame dimensions for each unit
UNIT_SPECS = {
    'probe':  {'frame_w': 28, 'frame_h': 28, 'base_w': 56, 'base_h': 28},
    'zealot': {'frame_w': 32, 'frame_h': 32, 'base_w': 64, 'base_h': 32},
    'dragoon':{'frame_w': 34, 'frame_h': 34, 'base_w': 68, 'base_h': 34},
}

FRAMES_PER_ANIM = 4  # idle, walk, attack, death (4 frames each)
TOTAL_FRAMES = FRAMES_PER_ANIM * 4  # 16 frames


def crop_to_frame(base_img, spec):
    """Crop the base image to a single frame (left half)."""
    fw = spec['frame_w']
    fh = spec['frame_h']
    return base_img.crop((0, 0, fw, fh))


def apply_bob(frame_img, bob_amount):
    """Shift the image up/down by bob_amount pixels."""
    fw = frame_img.width
    fh = frame_img.height
    result = Image.new('RGBA', (fw, fh), TRANSPARENT)
    px = frame_img.load()
    rx = result.load()
    for y in range(frame_img.height):
        for x in range(frame_img.width):
            c = px[x, y]
            if c[3] > 0:
                ny = y + bob_amount
                if 0 <= ny < fh:
                    rx[x, ny] = c[:4]
    return result


def apply_walk_offset(frame_img, x_offset, bob_amount):
    """Shift the image with walk cycle movement."""
    fw = frame_img.width
    fh = frame_img.height
    result = Image.new('RGBA', (fw, fh), TRANSPARENT)
    px = frame_img.load()
    rx = result.load()
    for y in range(frame_img.height):
        for x in range(frame_img.width):
            c = px[x, y]
            if c[3] > 0:
                nx = x + x_offset
                ny = y + bob_amount
                if 0 <= nx < fw and 0 <= ny < fh:
                    rx[nx, ny] = c[:4]
    return result


def add_energy_glow(canvas, positions, bright=True):
    """Add energy glow dots to a canvas."""
    color = BRIGHT if bright else BLUE_ENRG
    for x, y in positions:
        canvas.putpixel((x, y), color)


def add_energy_beam(canvas, start_x, length, frame_idx):
    """Add energy beam/fire effect."""
    for bx in range(start_x, start_x + length):
        if bx < canvas.width:
            canvas.putpixel((bx, canvas.height // 2), BLUE_ENRG)
            if frame_idx == 3:  # final fire frame - bright center
                canvas.putpixel((bx, canvas.height // 2 - 1), BRIGHT)


def add_energy_blade(canvas, blade_positions):
    """Add energy blade slash."""
    for x, y in blade_positions:
        canvas.putpixel((x, y), BRIGHT)


def add_death_burst(canvas, cx, cy, radius):
    """Add energy burst for death animation."""
    for dx in range(-radius, radius + 1):
        for dy in range(-radius, radius + 1):
            dist = abs(dx) + abs(dy)
            if dist <= radius:
                ex = cx + dx
                ey = cy + dy
                if 0 <= ex < canvas.width and 0 <= ey < canvas.height:
                    if dist == 0:
                        canvas.putpixel((ex, ey), BRIGHT)
                    elif dist <= 2:
                        canvas.putpixel((ex, ey), BLUE_ENRG)
                    else:
                        canvas.putpixel((ex, ey), PURPLE)


def generate_probe_idle_frames(frame_img):
    """4 idle bob frames for Probe."""
    frames = []
    bobs = [0, -1, 0, 1]
    for i in range(FRAMES_PER_ANIM):
        result = apply_bob(frame_img, bobs[i])
        # Energy pulse on frames 1 and 3
        if i in [1, 3]:
            # Small energy glow on top of probe
            px = result.load()
            if 14 < frame_img.width and 3 < frame_img.height:
                result.putpixel((14, 3), BRIGHT)
        frames.append(result)
    return frames


def generate_probe_walk_frames(frame_img):
    """4 walk cycle frames for Probe."""
    frames = []
    offsets = [0, 1, 0, -1]
    bobs = [0, -1, 0, 1]
    for i in range(FRAMES_PER_ANIM):
        result = apply_walk_offset(frame_img, offsets[i], bobs[i])
        if i in [0, 2]:
            result.putpixel((14, 3), BRIGHT)  # energy on forward steps
        frames.append(result)
    return frames


def generate_probe_attack_frames(frame_img):
    """4 attack (aim+fire) frames for Probe."""
    frames = []
    aims = [-1, -1, 0, 2]
    bobs = [0, 0, 0, 1]
    for i in range(FRAMES_PER_ANIM):
        result = apply_walk_offset(frame_img, aims[i], bobs[i])
        # Energy beam on fire frames (2 and 3)
        if i >= 2:
            beam_len = [0, 0, 5, 10][i]
            mid_y = frame_img.height // 2
            for bx in range(frame_img.width - 4, frame_img.width - 4 + beam_len):
                if bx < result.width:
                    result.putpixel((bx, mid_y), BLUE_ENRG)
                    if i == 3:
                        result.putpixel((bx, mid_y - 1), BRIGHT)
        frames.append(result)
    return frames


def generate_probe_death_frames(frame_img):
    """4 death frames for Probe (disintegration + energy burst)."""
    frames = []
    # Start with the base frame (cropped)
    for i in range(FRAMES_PER_ANIM):
        result = Image.new('RGBA', frame_img.size, TRANSPARENT)
        px = frame_img.load()
        rx = result.load()

        # Copy base with progressive disintegration
        for y in range(frame_img.height):
            for x in range(frame_img.width):
                c = px[x, y]
                if c[3] > 0:
                    # Remove bottom rows progressively
                    if i == 1 and y >= 24:
                        continue  # remove bottom 4 pixels
                    if i == 2 and y >= 20:
                        continue  # remove bottom 8 + some top
                    if i == 3 and y >= 10:
                        continue  # mostly gone

                    rx[x, y] = c[:4]

        # Energy burst sparks on death frames 2 and 3
        if i >= 2:
            spark_positions = [
                (8, 8), (10, 6), (14, 5), (18, 6), (20, 8),
                (6, 12), (22, 12), (14, 3)
            ]
            for sx, sy in spark_positions:
                if i == 2:
                    result.putpixel((sx, sy), BLUE_ENRG)
                else:
                    result.putpixel((sx, sy), BRIGHT)
        frames.append(result)
    return frames


def generate_probe_spritesheet(frame_img):
    """Generate the full Probe spritesheet (16 frames, 448x28)."""
    frames = []
    frames.extend(generate_probe_idle_frames(frame_img))
    frames.extend(generate_probe_walk_frames(frame_img))
    frames.extend(generate_probe_attack_frames(frame_img))
    frames.extend(generate_probe_death_frames(frame_img))

    sheet_w = 16 * 28  # 448
    sheet_h = 28
    result = Image.new('RGBA', (sheet_w, sheet_h), TRANSPARENT)

    for fi, frame in enumerate(frames):
        result.paste(frame, (fi * 28, 0))

    return result


def generate_zealot_idle_frames(frame_img):
    """4 idle bob frames for Zealot."""
    frames = []
    bobs = [0, -1, 0, 1]
    for i in range(FRAMES_PER_ANIM):
        result = apply_bob(frame_img, bobs[i])
        # Energy blade glow - brighter on frames 1 and 3
        if i in [1, 3]:
            # Blade tip glow (top-right area of zealot)
            if 24 < frame_img.width and 3 < frame_img.height:
                result.putpixel((24, 3), BRIGHT)
                if i == 1:
                    result.putpixel((23, 5), BLUE_ENRG)
                    result.putpixel((25, 5), BLUE_ENRG)
        frames.append(result)
    return frames


def generate_zealot_walk_frames(frame_img):
    """4 walk cycle frames for Zealot."""
    frames = []
    offsets = [0, 1, 0, -1]
    bobs = [0, -1, 0, 1]
    for i in range(FRAMES_PER_ANIM):
        result = apply_walk_offset(frame_img, offsets[i], bobs[i])
        # Blade trail on forward steps
        if i in [0, 2] and 25 < frame_img.width:
            result.putpixel((25, 4), BLUE_ENRG)
        frames.append(result)
    return frames


def generate_zealot_attack_frames(frame_img):
    """4 attack frames for Zealot (energy blade lunge)."""
    frames = []
    lunges = [-1, -1, 0, 2]
    bobs = [0, 0, 0, 1]
    for i in range(FRAMES_PER_ANIM):
        result = apply_walk_offset(frame_img, lunges[i], bobs[i])
        # Energy blade slash on frames 2 and 3
        if i >= 2:
            slash = [(24, 8), (25, 7), (26, 6)]
            for sx, sy in slash:
                if sx < result.width and sy < result.height:
                    result.putpixel((sx, sy), BRIGHT)
                    if i == 3:
                        result.putpixel((sx, sy - 1), BLUE_ENRG)
        frames.append(result)
    return frames


def generate_zealot_death_frames(frame_img):
    """4 death frames for Zealot (massive energy burst)."""
    frames = []
    for i in range(FRAMES_PER_ANIM):
        result = Image.new('RGBA', frame_img.size, TRANSPARENT)
        px = frame_img.load()
        rx = result.load()

        for y in range(frame_img.height):
            for x in range(frame_img.width):
                c = px[x, y]
                if c[3] > 0:
                    if i == 1 and y >= 26:
                        continue
                    if i == 2 and y >= 18:
                        continue
                    if i == 3 and y >= 10:
                        continue

                    rx[x, y] = c[:4]

        # Massive energy burst (ring + center)
        if i >= 2:
            ring_pts = [
                (10, 10), (14, 7), (18, 7), (22, 10),
                (24, 14), (22, 18), (18, 20), (14, 20),
                (10, 18), (8, 14)
            ]
            for rx2, ry in ring_pts:
                if rx2 < result.width and ry < result.height:
                    result.putpixel((rx2, ry), BLUE_ENRG if i == 2 else BRIGHT)

            # Center explosion on final frame
            if i == 3:
                result.putpixel((16, 14), BRIGHT)
                result.putpixel((15, 13), BLUE_ENRG)
                result.putpixel((17, 13), BLUE_ENRG)
                result.putpixel((16, 12), BRIGHT)

        frames.append(result)
    return frames


def generate_zealot_spritesheet(frame_img):
    """Generate the full Zealot spritesheet (16 frames, 512x32)."""
    frames = []
    frames.extend(generate_zealot_idle_frames(frame_img))
    frames.extend(generate_zealot_walk_frames(frame_img))
    frames.extend(generate_zealot_attack_frames(frame_img))
    frames.extend(generate_zealot_death_frames(frame_img))

    sheet_w = 16 * 32  # 512
    sheet_h = 32
    result = Image.new('RGBA', (sheet_w, sheet_h), TRANSPARENT)

    for fi, frame in enumerate(frames):
        result.paste(frame, (fi * 32, 0))

    return result


def generate_dragon_idle_frames(frame_img):
    """4 idle bob frames for Dragoon."""
    frames = []
    bobs = [0, -1, 0, 1]
    for i in range(FRAMES_PER_ANIM):
        result = apply_bob(frame_img, bobs[i])
        # Cannon glow - pulses on frames 1 and 3
        if i in [1, 3] and 26 < frame_img.width:
            result.putpixel((26, 8), BLUE_ENRG)
        frames.append(result)
    return frames


def generate_dragon_walk_frames(frame_img):
    """4 walk cycle frames for Dragoon."""
    frames = []
    offsets = [0, 1, 0, -1]
    bobs = [0, -1, 0, 1]
    for i in range(FRAMES_PER_ANIM):
        result = apply_walk_offset(frame_img, offsets[i], bobs[i])
        frames.append(result)
    return frames


def generate_dragon_attack_frames(frame_img):
    """4 attack frames for Dragoon (plasma cannon fire)."""
    frames = []
    aims = [-1, -1, 0, 2]
    bobs = [0, 0, 0, 1]
    for i in range(FRAMES_PER_ANIM):
        result = apply_walk_offset(frame_img, aims[i], bobs[i])
        # Plasma bolt on frames 2 and 3
        if i >= 2:
            mid_y = frame_img.height // 2
            beam_len = [0, 0, 6, 14][i]
            for bx in range(frame_img.width - 6, frame_img.width - 6 + beam_len):
                if bx < result.width:
                    result.putpixel((bx, mid_y), BLUE_ENRG)
                    if i == 3:
                        result.putpixel((bx, mid_y - 1), BRIGHT)
                        result.putpixel((bx, mid_y + 1), BLUE_ENRG)
        frames.append(result)
    return frames


def generate_dragon_death_frames(frame_img):
    """4 death frames for Dragoon (plasma explosion)."""
    frames = []
    for i in range(FRAMES_PER_ANIM):
        result = Image.new('RGBA', frame_img.size, TRANSPARENT)
        px = frame_img.load()
        rx = result.load()

        for y in range(frame_img.height):
            for x in range(frame_img.width):
                c = px[x, y]
                if c[3] > 0:
                    if i == 1 and y >= 28:
                        continue
                    if i == 2 and y >= 20:
                        continue
                    if i == 3 and y >= 12:
                        continue

                    rx[x, y] = c[:4]

        # Plasma explosion on death frames
        if i >= 2:
            add_death_burst(result, 26, 16, 3)

        frames.append(result)
    return frames


def generate_dragon_spritesheet(frame_img):
    """Generate the full Dragoon spritesheet (16 frames, 544x34)."""
    frames = []
    frames.extend(generate_dragon_idle_frames(frame_img))
    frames.extend(generate_dragon_walk_frames(frame_img))
    frames.extend(generate_dragon_attack_frames(frame_img))
    frames.extend(generate_dragon_death_frames(frame_img))

    sheet_w = 16 * 34  # 544
    sheet_h = 34
    result = Image.new('RGBA', (sheet_w, sheet_h), TRANSPARENT)

    for fi, frame in enumerate(frames):
        result.paste(frame, (fi * 34, 0))

    return result


def main():
    base_dir = 'public/assets/sprites/protoss'

    # Generate Probe spritesheet
    probe_base = Image.open(os.path.join(base_dir, 'probe.png'))
    probe_frame = crop_to_frame(probe_base, UNIT_SPECS['probe'])
    print(f"Probe base: {probe_base.size}, cropped frame: {probe_frame.size}")
    probe_sheet = generate_probe_spritesheet(probe_frame)
    probe_sheet.save(os.path.join(base_dir, 'probe-anim.png'), 'PNG')
    print(f"  -> probe-anim.png: {probe_sheet.size} ({probe_sheet.width // 28} frames x 28px)")

    # Generate Zealot spritesheet
    zealot_base = Image.open(os.path.join(base_dir, 'zealot.png'))
    zealot_frame = crop_to_frame(zealot_base, UNIT_SPECS['zealot'])
    print(f"Zealot base: {zealot_base.size}, cropped frame: {zealot_frame.size}")
    zealot_sheet = generate_zealot_spritesheet(zealot_frame)
    zealot_sheet.save(os.path.join(base_dir, 'zealot-anim.png'), 'PNG')
    print(f"  -> zealot-anim.png: {zealot_sheet.size} ({zealot_sheet.width // 32} frames x 32px)")

    # Generate Dragoon spritesheet
    dragoon_base = Image.open(os.path.join(base_dir, 'dragoon.png'))
    dragoon_frame = crop_to_frame(dragoon_base, UNIT_SPECS['dragoon'])
    print(f"Dragoon base: {dragoon_base.size}, cropped frame: {dragoon_frame.size}")
    dragoon_sheet = generate_dragon_spritesheet(dragoon_frame)
    dragoon_sheet.save(os.path.join(base_dir, 'dragoon-anim.png'), 'PNG')
    print(f"  -> dragoon-anim.png: {dragoon_sheet.size} ({dragoon_sheet.width // 34} frames x 34px)")

    print("\nSpritesheets generated successfully!")
    print("Frame layout (all units):")
    print("  Frames 0-3:   Idle bob (4 frames)")
    print("  Frames 4-7:   Walk cycle (4 frames)")
    print("  Frames 8-11:  Attack/aim+fire (4 frames)")
    print("  Frames 12-15: Death (4 frames)")


if __name__ == '__main__':
    main()
