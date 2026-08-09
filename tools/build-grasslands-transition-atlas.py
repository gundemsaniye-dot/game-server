"""Extract a deterministic Phaser atlas from the generated 4x4 terrain sheet."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "art" / "tiled" / "images" / "grasslands-transition-reference-v1.png"
OUTPUT = ROOT / "art" / "tiled" / "images" / "grasslands-terrain-v2.png"
TILE = 40

sheet = Image.open(SOURCE).convert("RGBA")
width, height = sheet.size

# The image is a clean four-column sheet with a narrow white gutter. Crop the
# inner 82% of each cell: the reference sheet has a decorative rounded outer
# border on every preview tile. It must not become a repeated grid in-game.
def frame(column, row):
    left = round(column * width / 4 + width / 4 * 0.09)
    top = round(row * height / 4 + height / 4 * 0.09)
    right = round((column + 1) * width / 4 - width / 4 * 0.09)
    bottom = round((row + 1) * height / 4 - height / 4 * 0.09)
    return sheet.crop((left, top, right, bottom)).resize((TILE, TILE), Image.Resampling.LANCZOS)

grass = frame(0, 0)
soil = frame(1, 0)
horizontal = frame(2, 0)       # grass above, soil below
vertical = frame(3, 0)         # grass left, soil right

# Slots 0..3 remain compatible with the old runtime map. Slots 4..15 are
# authored transition/detail frames referenced by 02_GROUND_TRANSITIONS.
hazard = Image.new("RGBA", (TILE, TILE), (54, 119, 162, 255))
road = Image.new("RGBA", (TILE, TILE), (145, 105, 61, 255))
road_draw = ImageDraw.Draw(road)
road_draw.rectangle((0, 6, TILE, 33), fill=(162, 133, 86, 255))
road_draw.line((0, 7, TILE, 7), fill=(109, 81, 49, 255), width=2)
road_draw.line((0, 33, TILE, 33), fill=(109, 81, 49, 255), width=2)

frames = [
    grass, soil, hazard, road,
    horizontal,
    horizontal.rotate(180),
    vertical,
    vertical.transpose(Image.Transpose.FLIP_LEFT_RIGHT),
    frame(0, 1), frame(1, 1), frame(2, 1), frame(3, 1),
    frame(0, 2), frame(1, 2), frame(2, 2), frame(3, 2),
]

atlas = Image.new("RGBA", (TILE * 8, TILE * 2), (0, 0, 0, 0))
for index, tile in enumerate(frames):
    atlas.alpha_composite(tile, ((index % 8) * TILE, (index // 8) * TILE))
atlas.save(OUTPUT)
print(f"Wrote {OUTPUT}")
