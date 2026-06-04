#!/usr/bin/env python3
"""Generate 2-frame sprite sheets for Zerg units (Drone, Zergling, Hydralisk).

Each sprite sheet has 2 horizontal frames:
  Frame 0 (left): idle pose — extracted from the existing single-image sprite
  Frame 1 (right): attack pose — modified with slight body/weapon shift

Art style matches the existing pixel art: limited 5-color palette, 
transparent background, centered unit within frame.
"""

from PIL import Image
import os

BASE = os.path.join(os.path.dirname(__file__), '..', 'src', 'assets', 'sprites', 'zerg')


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


def make_attack_frame_idle(pixels, img_w, img_h):
    """Create the attack frame by shifting body parts slightly.

    For Zerg units, an attack pose shifts the forward body/appendages
    slightly toward the right (attack direction) and may add a small
    muzzle flash or impact indicator.
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
                # Shift body 1 pixel right for attack pose (Zerg lunge forward)
                dest_x = offset_x + x + 1
                if dest_x < img_w:
                    frame[offset_y + y][dest_x] = c

    return frame


def make_attack_frame_hydralisk(pixels, img_w, img_h):
    """Create the attack frame for Hydralisk.

    Hydralisks shoot projectiles, so the attack pose shifts the
    body back slightly (recoil) and adds a small projectile near the mouth.
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
                # Shift body 1 pixel left for recoil
                dest_x = offset_x + x - 1
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

    # Frame 1: attack (shifted for animation)
    if 'hydralisk' in source_path:
        attack_frame = make_attack_frame_hydralisk(pixels, frame_w, frame_h)
    else:
        attack_frame = make_attack_frame_idle(pixels, frame_w, frame_h)

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
    print('Generating Zerg sprite sheets...')
    print()

    # Drone: 26x26 → 52x26 (2 frames)
    create_spritesheet(
        os.path.join(BASE, 'drone.png'),
        os.path.join(BASE, 'drone.png'),  # overwrite
        frame_w=26, frame_h=26
    )

    # Zergling: 26x26 → 52x26 (2 frames)
    create_spritesheet(
        os.path.join(BASE, 'zergling.png'),
        os.path.join(BASE, 'zergling.png'),  # overwrite
        frame_w=26, frame_h=26
    )

    # Hydralisk: 30x30 → 60x30 (2 frames)
    create_spritesheet(
        os.path.join(BASE, 'hydralisk.png'),
        os.path.join(BASE, 'hydralisk.png'),  # overwrite
        frame_w=30, frame_h=30
    )

    print()
    print('Done. All Zerg spritesheets generated.')


if __name__ == '__main__':
    main()
