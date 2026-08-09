#!/usr/bin/env python3
"""Build Phaser/Tiled-ready 40px tile atlases from the approved map artwork.

Each supplied 1672x941 reference is scaled once to the fixed 1280x720 battle
area, then cut into the game's native 32x18 grid.  Using a unique tile for
every cell keeps the rendered result visually identical to the approved map
while retaining a real Phaser Tilemap for render order and navigation.
"""

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
ATLAS_COLUMNS = 24
ATLAS_ROWS = 24

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
        {"firstgid": 579, "source": "../tilesets/navigation-cost.tsj"},
    ]
    tiled_map["tilesets"] = [{"firstgid": 1, "source": f"../tilesets/reference-map-{level}.tsj"}, *navigation_tilesets]
    base = next(layer for layer in tiled_map["layers"] if layer["name"] == "00_GROUND_BASE")
    base["data"] = list(range(1, MAP_COLUMNS * MAP_ROWS + 1))
    base["visible"] = False
    # These legacy paint layers contain an earlier procedural layout. Phaser
    # already ignores them for reference-art maps; hide them in Tiled too so
    # authors see the approved single-piece composition without overlays.
    editor_hidden_layers = {
        "01_GROUND_TERRAIN", "02_GROUND_TRANSITIONS", "03_HAZARD_VISUALS",
        "04_ROADS", "06_DETAILS_BELOW", "07_DETAILS_ABOVE",
    }
    for layer in tiled_map["layers"]:
        if layer.get("name") in editor_hidden_layers:
            layer["visible"] = False

    preview_name = "REFERENCE_ART_PREVIEW"
    preview = next((layer for layer in tiled_map["layers"] if layer["name"] == preview_name), None)
    if preview is None:
        next_id = max((layer.get("id", 0) for layer in tiled_map["layers"]), default=0) + 1
        preview = {"id": next_id, "name": preview_name, "type": "imagelayer"}
        tiled_map["layers"] = [preview, *tiled_map["layers"]]
        tiled_map["nextlayerid"] = max(tiled_map.get("nextlayerid", 1), next_id + 1)
    preview.update({
        "x": 0, "y": 0, "offsetx": 0, "offsety": 0,
        "opacity": 1, "visible": True,
        "image": f"../images/reference-preview-{level}.png",
        "imagewidth": MAP_COLUMNS * TILE_SIZE,
        "imageheight": MAP_ROWS * TILE_SIZE,
        "repeatx": False, "repeaty": False,
    })
    write_json(map_path, tiled_map)


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
