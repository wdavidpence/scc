#!/usr/bin/env python3
"""Create placeholder sprite PNGs for missing assets and animation directories."""

import os
import struct
import zlib

def create_png(filepath, r=128, g=128, b=128, width=64, height=64):
    """Create a minimal valid PNG file with a solid color."""
    os.makedirs(os.path.dirname(filepath), exist_ok=True)

    def make_png_chunk(chunk_type, data):
        chunk = chunk_type + data
        crc = struct.pack('>I', zlib.crc32(chunk) & 0xffffffff)
        return struct.pack('>I', len(data)) + chunk + crc

    header = b'\x89PNG\r\n\x1A\n'
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    ihdr = make_png_chunk(b'IHDR', ihdr_data)

    raw = b''
    for y in range(height):
        raw += b'\x00'  # filter byte
        for x in range(width):
            raw += bytes([r, g, b])  # RGB

    compressed = zlib.compress(raw)
    idat = make_png_chunk(b'IDAT', compressed)
    iend = make_png_chunk(b'IEND', b'')

    with open(filepath, 'wb') as f:
        f.write(header + ihdr + idat + iend)

# Missing structure sprites (64x64, race-colored)
race_colors = {
    'terran': (100, 200, 150),   # green
    'zerg': (180, 80, 200),       # purple
    'protoss': (80, 160, 255),    # blue
}

# Missing structure sprites
missing_structures = [
    ('zerg', 'spawning-pool.png'),
    ('zerg', 'spire.png'),
    ('protoss', 'nexus.png'),
    ('protoss', 'gateway.png'),
    ('protoss', 'cybernetics-core.png'),
]

base_dir = '/Users/wdpence/Projects/phaser-html5-mobile-standard/src/assets/sprites'

for race, sprite in missing_structures:
    filepath = os.path.join(base_dir, race, sprite)
    color = race_colors.get(race, (128, 128, 128))
    create_png(filepath, *color)
    print(f'Created: {filepath}')

# Create animation frame directories with placeholder sprites
unit_sprites = ['marine', 'scv', 'drone', 'zergling', 'hydralisk', 'zealot', 'probe', 'dragoon']
anim_types = ['attack', 'death', 'idle', 'move']

for race in ['terran', 'zerg', 'protoss']:
    for anim_type in anim_types:
        anim_dir = os.path.join(base_dir, race, anim_type)
        os.makedirs(anim_dir, exist_ok=True)

        # Create a few frames per animation type (4 frames)
        for frame in range(1, 5):
            filepath = os.path.join(anim_dir, f'{race}-unit-frame{frame}.png')
            # Slightly vary color per frame for animation feel
            base_color = race_colors.get(race, (128, 128, 128))
            # Shift color slightly per frame
            shifted = tuple(min(255, c + (frame - 2) * 10) for c in base_color)
            create_png(filepath, *shifted)

        print(f'Created {race}/{anim_type}/ (4 frames)')

print('\nDone! Created all missing structure sprites and animation directories.')
