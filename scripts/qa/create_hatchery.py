#!/usr/bin/env python3
"""Create missing zerg structure sprite."""

import os, struct, zlib

def create_png(filepath, r=128, g=128, b=128, width=64, height=64):
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    def chunk(ct, data):
        c = ct + data
        crc = struct.pack('>I', zlib.crc32(c) & 0xffffffff)
        return struct.pack('>I', len(data)) + c + crc
    header = b'\x89PNG\r\n\x1A\n'
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    ihdr = chunk(b'IHDR', ihdr_data)
    raw = b''
    for y in range(height):
        raw += b'\x00'
        for x in range(width):
            raw += bytes([r, g, b])
    compressed = zlib.compress(raw)
    idat = chunk(b'IDAT', compressed)
    iend = chunk(b'IEND', b'')
    with open(filepath, 'wb') as f:
        f.write(header + ihdr + idat + iend)

filepath = '/Users/wdpence/Projects/phaser-html5-mobile-standard/src/assets/sprites/zerg/hatchery.png'
create_png(filepath, 180, 80, 200)  # zerg purple
print(f'Created: {filepath}')
