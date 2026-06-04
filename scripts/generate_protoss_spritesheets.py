#!/usr/bin/env python3
"""Generate 2-frame sprite sheets for Protoss units (Probe, Zealot, Dragoon).

Each sprite sheet has 2 horizontal frames:
  Frame 0 (left): idle pose — extracted from the existing single-image sprite
  Frame 1 (right): attack pose — modified with unit-specific animation

Art style matches the existing pixel art: limited 7-color purple/gold palette,
transparent background, centered unit within frame.

Protoss color palette (from source sprites):
  #8040f0 — primary purple (blades, energy)
  #a090100 — medium purple (armor plates)
  #202050 — dark blue (shadows, base)
  #e0d0100 / #f0f0100 — gold highlights (energy glow)
  #c0b0100 — warm purple (accents)
  #60a0100 — teal accent (energy trails)
"""

from PIL import Image
import os

BASE = os.path.join(os.path.dirname(__file__), '..', 'src', 'assets', 'sprites', 'protoss')


def extract_pixels(path):
    """Extract non-transparent pixel data from a sprite image."""
    img = Image.open(path)
    pixels = []
    for y in range(img.height):
        row = []
        for x in range(img.width):
            r, g, b, a = img.getpixel((x, y))
            if a > 10:  # threshold for visible pixel
                row.append((r, g, b))
            else:
                row.append(None)
        pixels.append(row)
    return img.width, img.height, pixels


def find_bounding_box(pixels):
    """Find the bounding box of non-transparent pixels."""
    min_x = width = len(pixels[0])
    max_x = 0
    min_y = len(pixels)
    max_y = 0
    for y, row in enumerate(pixels):
        for x, c in enumerate(row):
            if c is not None:
                min_x = min(min_x, x)
                max_x = max(max_x, x)
                min_y = min(min_y, y)
                max_y = max(max_y, y)
    return min_x, min_y, max_x, max_y


def center_crop(pixels, target_w, target_h):
    """Center a sprite within a frame of given dimensions."""
    min_x, min_y, max_x, max_y = find_bounding_box(pixels)
    content_w = max_x - min_x + 1
    content_h = max_y - min_y + 1

    # Create output frame
    frame = [[None] * target_w for _ in range(target_h)]

    # Center the content
    offset_x = (target_w - content_w) // 2
    offset_y = (target_h - content_h) // 2

    for y in range(content_h):
        for x in range(content_w):
            c = pixels[min_y + y][min_x + x]
            if c is not None:
                frame[offset_y + y][offset_x + x] = c

    return frame


def make_attack_frame_probe(pixels, img_w, img_h):
    """Create the attack frame for Probe (worker unit).

    Probe extends its tool arm/toolbox forward slightly when mining/attacking.
    The body shifts 1 pixel right, and the tool arm (right side) extends 2 more pixels.
    This is a subtle animation — the probe is a worker, not a combat unit.
    """
    min_x, min_y, max_x, max_y = find_bounding_box(pixels)
    content_w = max_x - min_x + 1
    content_h = max_y - min_y + 1

    frame = [[None] * img_w for _ in range(img_h)]
    offset_x = (img_w - content_w) // 2
    offset_y = (img_h - content_h) // 2

    for y in range(content_h):
        for x in range(content_w):
            c = pixels[min_y + y][min_x + x]
            if c is not None:
                # Determine if this pixel is part of the tool arm (right side)
                local_x = min_x + x
                is_tool = local_x > (min_x + max_x) * 0.65

                if is_tool:
                    # Tool arm extends 2 pixels further forward
                    dest_x = offset_x + x + 2
                    if dest_x < img_w:
                        frame[offset_y + y][dest_x] = c
                else:
                    # Body shifts 1 pixel right (subtle lunge)
                    dest_x = offset_x + x + 1
                    if dest_x < img_w:
                        frame[offset_y + y][dest_x] = c

    return frame


def make_attack_frame_zealot(pixels, img_w, img_h):
    """Create the attack frame for Zealot (melee soldier).

    Zealots use psionic blades. The attack pose:
    - Body shifts 1 pixel back (recoil from blade strike)
    - Blades extend 2 pixels forward (they're on the right side of the sprite)
    This creates a satisfying blade-slash animation.
    """
    min_x, min_y, max_x, max_y = find_bounding_box(pixels)
    content_w = max_x - min_x + 1
    content_h = max_y - min_y + 1

    frame = [[None] * img_w for _ in range(img_h)]
    offset_x = (img_w - content_w) // 2
    offset_y = (img_h - content_h) // 2

    for y in range(content_h):
        for x in range(content_w):
            c = pixels[min_y + y][min_x + x]
            if c is not None:
                local_x = min_x + x
                is_blade = local_x > (min_x + max_x) * 0.6

                if is_blade:
                    # Blades extend 2 pixels forward (right side)
                    dest_x = offset_x + x + 2
                    if dest_x < img_w:
                        frame[offset_y + y][dest_x] = c
                else:
                    # Body shifts 1 pixel back (recoil)
                    dest_x = offset_x + x - 1
                    if dest_x >= 0:
                        frame[offset_y + y][dest_x] = c

    return frame


def make_attack_frame_dragoon(pixels, img_w, img_h):
    """Create the attack frame for Dragoon (plasma cannon signature unit).

    Dragoons fire plasma bolts from a cannon arm. The attack pose:
    - Body shifts 2 pixels back (heavy recoil from plasma cannon)
    - Cannon arm extends 3 pixels forward with a small plasma bolt (gold highlight pixel)
    This is the most dramatic animation of the three Protoss units.
    """
    min_x, min_y, max_x, max_y = find_bounding_box(pixels)
    content_w = max_x - min_x + 1
    content_h = max_y - min_y + 1

    frame = [[None] * img_w for _ in range(img_h)]
    offset_x = (img_w - content_w) // 2
    offset_y = (img_h - content_h) // 2

    for y in range(content_h):
        for x in range(content_w):
            c = pixels[min_y + y][min_x + x]
            if c is not None:
                local_x = min_x + x
                is_cannon = local_x > (min_x + max_x) * 0.6

                if is_cannon:
                    # Cannon extends 3 pixels forward, plus add plasma bolt glow
                    dest_x = offset_x + x + 3
                    if dest_x < img_w:
                        frame[offset_y + y][dest_x] = c
                    # Add a gold plasma bolt pixel near the cannon tip
                    cannon_tip_x = offset_x + max_x - min_x + 3 + offset_x - (img_w - content_w) // 2
                    # Place a gold highlight pixel as plasma bolt (use the gold color from source)
                    gold_highlight_y = offset_y + (content_h // 2)
                    bolt_x = cannon_tip_x + 1
                    if 0 <= bolt_x < img_w and 0 <= gold_highlight_y < img_h:
                        # Check if there's already a pixel — don't overwrite non-transparent pixels
                        if frame[gold_highlight_y][bolt_x] is None:
                            frame[gold_highlight_y][bolt_x] = (240, 240, 16)
                else:
                    # Body shifts 2 pixels back (heavy recoil)
                    dest_x = offset_x + x - 2
                    if dest_x >= 0:
                        frame[offset_y + y][dest_x] = c

    return frame


def pixels_to_image(frame):
    """Convert a pixel frame to a PIL Image with RGBA."""
    h = len(frame)
    w = len(frame[0]) if h > 0 else 0
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    for y in range(h):
        for x in range(w):
            c = frame[y][x]
            if c is not None:
                img.putpixel((x, y), (*c, 255))
    return img


def create_spritesheet(source_path, output_path, frame_w, frame_h):
    """Create a 2-frame horizontal spritesheet from a single-image sprite.

    Frame 0 (left): idle pose — centered copy of source
    Frame 1 (right): attack pose — shifted for animation

    Args:
        source_path: path to the existing single-image sprite PNG
        output_path: path for the output spritesheet PNG
        frame_w: width of each frame (source image width)
        frame_h: height of each frame (source image height)
    """
    img_w, img_h, pixels = extract_pixels(source_path)

    # Frame 0: idle (centered copy of original)
    idle_frame = center_crop(pixels, frame_w, frame_h)

    # Frame 1: attack (unit-specific animation)
    basename = os.path.splitext(os.path.basename(source_path))[0]
    if basename == 'probe':
        attack_frame = make_attack_frame_probe(pixels, frame_w, frame_h)
    elif basename == 'zealot':
        attack_frame = make_attack_frame_zealot(pixels, frame_w, frame_h)
    elif basename == 'dragoon':
        attack_frame = make_attack_frame_dragoon(pixels, frame_w, frame_h)
    else:
        # Fallback: generic forward shift (same as Zerg approach)
        attack_frame = center_crop(pixels, frame_w, frame_h)
        # Shift body 1 pixel right
        min_x, min_y, max_x, max_y = find_bounding_box(pixels)
        content_w = max_x - min_x + 1
        attack_frame = [[None] * frame_w for _ in range(frame_h)]
        offset_x = (frame_w - content_w) // 2
        offset_y = (frame_h - content_h) // 2
        for y in range(content_h):
            for x in range(content_w):
                c = pixels[min_y + y][min_x + x]
                if c is not None:
                    dest_x = offset_x + x + 1
                    if dest_x < frame_w:
                        attack_frame[offset_y + y][dest_x] = c

    # Combine into horizontal spritesheet
    sheet_w = frame_w * 2
    sheet_h = frame_h
    idle_img = pixels_to_image(idle_frame)
    attack_img = pixels_to_image(attack_frame)

    sheet = Image.new('RGBA', (sheet_w, sheet_h), (0, 0, 0, 0))
    sheet.paste(idle_img, (0, 0))
    sheet.paste(attack_img, (frame_w, 0))

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    sheet.save(output_path, 'PNG')
    print(f'  Created: {output_path} ({sheet_w}x{sheet_h}, frames: {frame_w}x{frame_h})')


def main():
    print('Generating Protoss sprite sheets...')
    print()

    # Probe: 28x28 → 56x28 (2 frames)
    create_spritesheet(
        os.path.join(BASE, 'probe.png'),
        os.path.join(BASE, 'probe.png'),  # overwrite with spritesheet
        frame_w=28, frame_h=28
    )

    # Zealot: 32x32 → 64x32 (2 frames)
    create_spritesheet(
        os.path.join(BASE, 'zealot.png'),
        os.path.join(BASE, 'zealot.png'),  # overwrite with spritesheet
        frame_w=32, frame_h=32
    )

    # Dragoon: 34x34 → 68x34 (2 frames)
    create_spritesheet(
        os.path.join(BASE, 'dragoon.png'),
        os.path.join(BASE, 'dragoon.png'),  # overwrite with spritesheet
        frame_w=34, frame_h=34
    )

    print()
    print('Done. All Protoss spritesheets generated.')


if __name__ == '__main__':
    main()
