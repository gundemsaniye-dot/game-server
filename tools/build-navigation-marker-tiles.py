#!/usr/bin/env python3
"""Create the visible navigation marker tiles used by Tiled authors.

These tiles are editor-only helpers. Phaser reads their presence/properties for
navigation but renders only the reference-art ground layer in the game.
"""

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "art" / "tiled" / "images"
SIZE = 40
MARKERS = {
    "navigation-bridge.png": [(46, 229, 107, 190)],
    "navigation-blocked.png": [(239, 51, 64, 156)],
    "navigation-cost.png": [
        (42, 163, 240, 145),
        (37, 112, 222, 158),
        (115, 70, 185, 170),
    ],
}


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for filename, colors in MARKERS.items():
        image = Image.new("RGBA", (SIZE * len(colors), SIZE), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)
        for index, color in enumerate(colors):
            left = index * SIZE
            draw.rounded_rectangle((left + 2, 2, left + SIZE - 3, SIZE - 3), radius=5, fill=color, outline=(255, 255, 255, 220), width=2)
        image.save(OUTPUT_DIR / filename, optimize=True)


if __name__ == "__main__":
    main()
