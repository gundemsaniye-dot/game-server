#!/usr/bin/env python3
"""Build the Tiled editor preview and matching reference tileset."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "art" / "tiled" / "reference-sources"
IMAGE_DIR = ROOT / "art" / "tiled" / "images"
TILESET_DIR = ROOT / "art" / "tiled" / "tilesets"
MAP_DIR = ROOT / "art" / "tiled" / "maps"

TILE_SIZE = 40
MAP_COLUMNS = 32
MAP_ROWS = 18
# Keep atlas rows identical to map rows. Tile IDs stay row-major and the
# Tilesets panel now shows the coherent map instead of wrapping each 32-tile
# map row across a 24-column square texture.
ATLAS_COLUMNS = MAP_COLUMNS
ATLAS_ROWS = MAP_ROWS

MANIFEST_PATH = ROOT / "art" / "tiled" / "level-manifest.json"


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, separators=(",", ":")) + "\n", encoding="utf-8")


def reference_tileset(level: int) -> dict[str, object]:
    return {
        "columns": ATLAS_COLUMNS,
        "image": f"../images/reference-map-{level}.png",
        "imageheight": ATLAS_ROWS * TILE_SIZE,
        "imagewidth": ATLAS_COLUMNS * TILE_SIZE,
        "margin": 0,
        "name": f"reference-map-{level}",
        "spacing": 0,
        "tilecount": ATLAS_COLUMNS * ATLAS_ROWS,
        "tileheight": TILE_SIZE,
        "tilewidth": TILE_SIZE,
        "tiledversion": "1.11.0",
        "type": "tileset",
        "version": "1.10",
    }


def build_level(level: int, map_file: str) -> None:
    source = SOURCE_DIR / f"{level}.png"
    if not source.exists():
        raise FileNotFoundError(f"Missing approved reference image: {source}")

    with Image.open(source) as raw:
        reference = raw.convert("RGBA").resize(
            (MAP_COLUMNS * TILE_SIZE, MAP_ROWS * TILE_SIZE), Image.Resampling.LANCZOS
        )

    atlas = Image.new("RGBA", (ATLAS_COLUMNS * TILE_SIZE, ATLAS_ROWS * TILE_SIZE))
    for row in range(MAP_ROWS):
        for column in range(MAP_COLUMNS):
            index = row * MAP_COLUMNS + column
            tile = reference.crop((column * TILE_SIZE, row * TILE_SIZE, (column + 1) * TILE_SIZE, (row + 1) * TILE_SIZE))
            atlas.paste(tile, ((index % ATLAS_COLUMNS) * TILE_SIZE, (index // ATLAS_COLUMNS) * TILE_SIZE))

    atlas.save(IMAGE_DIR / f"reference-map-{level}.png", optimize=True)
    # Editor preview: keep the approved reference composition visible as one
    # image while the separate atlas remains available to Phaser at runtime.
    reference.save(IMAGE_DIR / f"reference-preview-{level}.png", optimize=True)
    write_json(TILESET_DIR / f"reference-map-{level}.tsj", reference_tileset(level))

    map_path = MAP_DIR / map_file
    tiled_map = json.loads(map_path.read_text(encoding="utf-8"))
    navigation_tilesets = [
        {"firstgid": 577, "source": "../tilesets/navigation-bridge.tsj"},
        {"firstgid": 578, "source": "../tilesets/navigation-blocked.tsj"},
    ]
    expected_tilesets = [{"firstgid": 1, "source": f"../tilesets/reference-map-{level}.tsj"}, *navigation_tilesets]

    preview_name = "REFERENCE_ART_PREVIEW"
    preview = next((layer for layer in tiled_map["layers"] if layer["name"] == preview_name), None)
    expected_preview = {
        "type": "imagelayer", "visible": True, "locked": True,
        "image": f"../images/reference-preview-{level}.png",
        "imagewidth": MAP_COLUMNS * TILE_SIZE,
        "imageheight": MAP_ROWS * TILE_SIZE,
    }
    if tiled_map.get("tilesets") != expected_tilesets or preview is None or any(
        preview.get(key) != value for key, value in expected_preview.items()
    ):
        raise ValueError(
            f"{map_file}: locked TMJ metadata does not match generated reference assets. "
            "The source map was not modified; notify the user and update it deliberately in Tiled."
        )


def main() -> None:
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    levels = manifest["levels"]
    if len(levels) != manifest["levelCount"]:
        raise ValueError("Tiled level manifest count does not match its levels list.")
    for entry in levels:
        build_level(entry["level"], Path(entry["file"]).name)
    print(f"Built {len(levels)} reference Tilemap atlases (32x18 @ {TILE_SIZE}px).")


if __name__ == "__main__":
    main()
