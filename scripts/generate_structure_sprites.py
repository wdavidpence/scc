#!/usr/bin/env python3
"""Generate Terran structure sprite sheets matching the existing pixel-art style.

These sprite sheets replicate the canvas textures from GameScene.js as actual
PNG files, so they can be loaded as spritesheets in PreloadScene.js.

Output:
  src/assets/sprites/terran/command-center.png   (110x72)
  src/assets/sprites/terran/barracks.png          (88x56)
  src/assets/sprites/terran/factory.png           (76x52)

Each file is a single-frame spritesheet matching the existing canvas texture
definitions in GameScene.js createBattleTextures().
"""

from PIL import Image, ImageDraw


# --- Palette from GameScene.js createBattleTextures() ---
PALETTE = {
    'navy':   (15, 23, 42),
    'navy2':  (30, 41, 59),
    'blue':   (37, 99, 235),
    'blue2':  (59, 130, 246),
    'blue3':  (147, 197, 253),
    'blue4':  (219, 234, 254),
    'purple': (124, 58, 237),
    'purple2':(168, 85, 247),
    'cyan':   (56, 189, 248),
    'cyan2':  (14, 165, 233),
    'steel':  (100, 116, 139),
    'steel2': (226, 232, 240),
    'amber':  (245, 158, 11),
    'lime':   (34, 197, 94),
    'mineral':(103, 234, 249),
    'mineral2':(219, 234, 254),
    'gas':    (192, 132, 252),
    'gas2':   (240, 171, 252),
    'dark':   (2, 6, 23),
}


def fill(draw, x, y, w, h, color_name):
    """Fill a rectangle with a palette color."""
    draw.rectangle([x, y, x + w - 1, y + h - 1], fill=PALETTE[color_name])


def draw_panel(draw, x, y, w, h, outer, inner):
    """Draw a panel: outer border with inner fill."""
    draw.rectangle([x, y, x + w - 1, y + h - 1], fill=PALETTE[outer])
    draw.rectangle([x + 2, y + 2, x + w - 3, y + h - 3], fill=PALETTE[inner])


def create_command_center():
    """Command Center sprite sheet (110x72) — matches GameScene.js canvas texture.

    Terran Command Center: large blue structure with antenna array,
    glowing core, and side pylons.
    """
    img = Image.new('RGBA', (110, 72), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Base panel (dark navy outer, dark slate inner)
    draw_panel(draw, 10, 16, 90, 44, 'dark', 'navy2')

    # Top accent strip (bright blue)
    fill(draw, 16, 22, 78, 6, 'blue')

    # Main body (medium blue)
    fill(draw, 18, 28, 74, 18, 'blue2')

    # Upper structure (lighter blue)
    fill(draw, 26, 8, 58, 18, 'blue3')

    # Roof highlight (very light blue)
    fill(draw, 34, 6, 42, 12, 'blue4')

    # Front lights (cyan)
    fill(draw, 44, 12, 22, 4, 'cyan')

    # Lower dark section
    fill(draw, 26, 38, 58, 14, 'dark')

    # Base plate (steel)
    fill(draw, 20, 48, 70, 6, 'steel')

    # Side pylons (steel2)
    fill(draw, 12, 20, 8, 34, 'steel2')
    fill(draw, 90, 20, 8, 34, 'steel2')

    # Warning lights (amber)
    fill(draw, 15, 21, 4, 8, 'amber')
    fill(draw, 91, 21, 4, 8, 'amber')

    # Core light (cyan2 vertical)
    fill(draw, 50, 18, 10, 36, 'cyan2')

    # Antenna base
    fill(draw, 52, 10, 6, 8, 'steel2')

    # Front vents (dark horizontal)
    fill(draw, 37, 24, 36, 4, 'dark')

    # Front glow line (cyan)
    fill(draw, 30, 34, 50, 3, 'cyan')

    # Bottom accent (blue3)
    fill(draw, 24, 40, 62, 2, 'blue3')

    return img


def create_barracks():
    """Barracks (Production) sprite sheet (88x56) — matches GameScene.js canvas texture.

    Terran Barracks: compact blue production building with gun ports
    and central command core.
    """
    img = Image.new('RGBA', (88, 56), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Base panel
    draw_panel(draw, 8, 12, 72, 36, 'dark', 'navy2')

    # Top accent strip (bright blue)
    fill(draw, 14, 16, 60, 6, 'blue')

    # Main body (medium blue)
    fill(draw, 16, 22, 56, 10, 'blue2')

    # Upper structure (lighter blue)
    fill(draw, 20, 10, 48, 8, 'blue3')

    # Roof highlight (very light blue)
    fill(draw, 28, 8, 32, 4, 'blue4')

    # Lower dark section
    fill(draw, 18, 34, 52, 8, 'dark')

    # Base plate (steel)
    fill(draw, 12, 38, 64, 4, 'steel')

    # Side pylons (steel2)
    fill(draw, 10, 18, 4, 22, 'steel2')
    fill(draw, 74, 18, 4, 22, 'steel2')

    # Gun ports (cyan)
    fill(draw, 22, 28, 10, 4, 'cyan')
    fill(draw, 56, 28, 10, 4, 'cyan')

    # Central core (amber)
    fill(draw, 40, 24, 8, 14, 'amber')

    # Front vent (dark)
    fill(draw, 34, 19, 20, 2, 'dark')

    return img


def create_factory():
    """Factory/Tech Lab sprite sheet (76x52) — matches GameScene.js canvas texture.

    Terran Tech Lab: purple-themed research building with glass
    observation windows and central processing core.
    """
    img = Image.new('RGBA', (76, 52), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Base panel
    draw_panel(draw, 7, 12, 62, 32, 'dark', 'navy2')

    # Top accent strip (purple)
    fill(draw, 14, 16, 48, 6, 'purple')

    # Main body (medium purple)
    fill(draw, 16, 22, 44, 10, 'purple2')

    # Upper structure (lighter blue)
    fill(draw, 20, 8, 36, 8, 'blue3')

    # Roof highlight (very light blue)
    fill(draw, 26, 6, 24, 4, 'blue4')

    # Lower dark section
    fill(draw, 18, 32, 40, 6, 'dark')

    # Base plate (steel)
    fill(draw, 10, 36, 56, 4, 'steel')

    # Side pylons (steel2)
    fill(draw, 8, 18, 4, 18, 'steel2')
    fill(draw, 64, 18, 4, 18, 'steel2')

    # Glass observation windows (gas2)
    fill(draw, 24, 28, 6, 4, 'gas2')
    fill(draw, 46, 28, 6, 4, 'gas2')

    # Central processing core (cyan)
    fill(draw, 34, 20, 8, 14, 'cyan')

    # Front vent (dark)
    fill(draw, 30, 16, 16, 2, 'dark')

    return img


def main():
    out_dir = '/Users/wdpence/Projects/phaser-html5-mobile-standard/src/assets/sprites/terran/'

    # Command Center
    cc = create_command_center()
    cc.save(f'{out_dir}command-center.png', 'PNG')
    print(f'Created command-center.png: {cc.size}')

    # Barracks (Production)
    bax = create_barracks()
    bax.save(f'{out_dir}barracks.png', 'PNG')
    print(f'Created barracks.png: {bax.size}')

    # Factory/Tech Lab
    fab = create_factory()
    fab.save(f'{out_dir}factory.png', 'PNG')
    print(f'Created factory.png: {fab.size}')

    print('All 3 Terran structure sprite sheets generated.')


if __name__ == '__main__':
    main()
