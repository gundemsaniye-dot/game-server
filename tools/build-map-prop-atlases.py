#!/usr/bin/env python3
"""Pack every editable map prop PNG into Phaser hash atlases."""

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = ROOT / "public" / "assets" / "maps" / "props"
OUTPUT_ROOT = ROOT / "public" / "assets" / "maps" / "atlases"
PADDING = 12


def packed_image(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    alpha_bounds = image.getchannel("A").getbbox()
    if alpha_bounds:
        image = image.crop(alpha_bounds)
    max_dimension = max(image.size)
    if max_dimension > 512:
        scale = 512 / max_dimension
        image = image.resize(
            (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
            Image.Resampling.LANCZOS,
        )
    return image


def build_atlas(biome: str, names: list[str]) -> None:
    images = []
    for name in names:
        source = SOURCE_ROOT / biome / f"{name}.png"
        if not source.exists():
            raise SystemExit(f"Missing map prop source: {source}")
        images.append((name, packed_image(source)))

    cell_width = max(image.width for _, image in images) + PADDING * 2
    cell_height = max(image.height for _, image in images) + PADDING * 2
    columns = max(2, int(len(images) ** 0.5 + 0.999))
    rows = (len(images) + columns - 1) // columns
    atlas_width = cell_width * columns
    atlas_height = cell_height * rows
    atlas = Image.new("RGBA", (atlas_width, atlas_height), (0, 0, 0, 0))
    frames = {}

    for index, (name, image) in enumerate(images):
        column = index % columns
        row = index // columns
        x = column * cell_width + (cell_width - image.width) // 2
        y = row * cell_height + (cell_height - image.height) // 2
        atlas.alpha_composite(image, (x, y))
        frames[f"{name}.png"] = {
            "frame": {"x": x, "y": y, "w": image.width, "h": image.height},
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": image.width, "h": image.height},
            "sourceSize": {"w": image.width, "h": image.height},
        }

    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    atlas.save(OUTPUT_ROOT / f"{biome}.png", optimize=True)
    metadata = {
        "frames": frames,
        "meta": {
            "app": "Castle Raid 2 map prop atlas builder",
            "version": "1.0",
            "image": f"{biome}.png",
            "format": "RGBA8888",
            "size": {"w": atlas_width, "h": atlas_height},
            "scale": "1",
        },
    }
    (OUTPUT_ROOT / f"{biome}.json").write_text(
        json.dumps(metadata, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Packed {biome}: {atlas_width}x{atlas_height}")


def main() -> None:
    for folder in sorted(SOURCE_ROOT.iterdir()):
        if not folder.is_dir():
            continue
        biome = folder.name
        names = sorted(path.stem for path in folder.glob("*.png"))
        if not names:
            continue
        build_atlas(biome, names)


if __name__ == "__main__":
    main()
