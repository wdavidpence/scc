"""Generate a 32x32 baneling sprite (single frame, static).
Baneling: round bio-organic blob, red-orange, with small spikes."""
import os

BASE = '/Users/wdpence/Projects/phaser-html5-mobile-standard/src/assets/sprites/zerg'
os.makedirs(BASE, exist_ok=True)

IMG_W, IMG_H = 32, 32

from PIL import Image, ImageDraw

img = Image.new('RGBA', (IMG_W, IMG_H), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

cx, cy = 16, 18  # center (slightly lower for ground contact)

# Draw body as filled circle using point-by-point (pixel art style)
body_color = (255, 69, 0)       # #ff4500 - bright red-orange (baneling color)
body_dark = (160, 35, 0)        # darker red
body_highlight = (255, 160, 60) # lighter orange
eye_color = (50, 10, 0)         # dark brown eyes

# Body circle
for y in range(IMG_H):
    for x in range(IMG_W):
        dx = x - cx
        dy = (y - cy) * 1.3  # stretch vertically slightly for oval
        dist = (dx*dx + dy*dy) ** 0.5

        if dist <= 12:
            if dist <= 4:
                draw.point((x, y), fill=body_highlight)
            elif dist <= 8:
                draw.point((x, y), fill=body_color)
            else:
                draw.point((x, y), fill=body_dark)

# 3 spikes on top
spike_color = (255, 100, 0)
for sx in [8, 16, 24]:
    draw.point((sx, 5), fill=spike_color)
    if sx == 16:
        draw.point((sx, 4), fill=body_highlight)

# Dark eyes (2 small dots on body)
draw.point((12, 19), fill=eye_color)
draw.point((20, 19), fill=eye_color)

# Belly highlight (lighter orange oval at bottom)
belly = (255, 180, 80)
for y in range(21, 27):
    for x in range(13, 20):
        dx = x - 16
        dy = (y - 24) * 1.5
        if dx*dx + dy*dy <= 16:
            draw.point((x, y), fill=belly)

# Dark ground shadow (flat bottom)
shadow = (120, 30, 0)
for x in range(5, 27):
    draw.point((x, 28), fill=shadow)
    draw.point((x, 29), fill=(100, 25, 0))

path = os.path.join(BASE, 'baneling.png')
img.save(path, 'PNG')
print(f"Saved baneling sprite: {path} ({IMG_W}x{IMG_H})")
