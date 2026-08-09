#!/usr/bin/env python3
"""Build small, editor-safe map props from the generated sprite sheets.

The source sheets are intentionally kept in source-assets so image generation
can be re-run without hand-editing the atlas output.  Each sheet is a 4x3
grid on a chroma background; this script crops, removes the key, then creates
theme-aware colour variants for every biome and level signature.
"""

from pathlib import Path
from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "source-assets" / "maps" / "generated"
OUT = ROOT / "public" / "assets" / "maps" / "props"
MAGENTA = (255, 0, 255)

BIOME_ITEMS = {
    "grasslands": ["wildflower-patch", "poppy-clump", "daisy-clump", "grass-tuft", "clover-patch", "pebble-scatter", "fallen-branch", "mossy-stump", "dirt-patch", "meadow-soil", "shallow-puddle", "round-pond"],
    "silent_forest": ["fern-cluster", "mushroom-ring", "leaf-litter", "exposed-roots", "pinecone-scatter", "moss-patch", "fallen-twig", "forest-stone", "dark-forest-soil", "forest-stream", "tiny-puddle", "ancient-stump"],
    "muddy_fields": ["cattail-tuft", "lily-pads", "swamp-grass", "mud-splatter", "wet-mud", "marsh-stone", "driftwood", "small-puddle", "marsh-pond", "swamp-mushroom", "waterlogged-branch", "reed-shore"],
    "storm_valley": ["heather-bush", "wind-grass", "slate-pebbles", "slate-rock", "lichen-patch", "wet-earth", "rain-puddle", "mountain-stream", "broken-branch", "wind-shrub", "crystal-shard", "scorched-soil"],
    "dry_steppe": ["dry-grass", "thorn-bush", "steppe-pebbles", "small-sandstone", "dry-twig", "cracked-earth", "dust-ground", "dry-creek", "steppe-flower", "tumbleweed", "brittle-shrub", "bleached-wood"],
    "desert": ["small-cactus", "desert-shrub", "sand-ripple", "desert-pebbles", "small-sandstone", "desert-twig", "palm-debris", "beetle-tracks", "sunbaked-sand", "oasis-pond", "desert-flower", "prickly-bush"],
    "frozen_pass": ["snow-drift", "ice-stone", "ice-shard", "frost-grass", "packed-snow", "cracked-ice", "icy-stream", "frozen-pond", "snowy-branch", "blue-ice-boulder", "ice-flower", "snow-pebbles"],
    "infernal_dungeon": ["ash-pile", "black-pebbles", "charred-wood", "obsidian-shard", "lava-crack", "burnt-earth", "ember-grass", "ash-swirl", "warm-ash-trace", "scorched-stump", "ember-mushroom", "blackened-stone"],
}

SIGNATURES = {
    "grasslands_01": "bluebell-meadow", "grasslands_02": "butterfly-bloom",
    "silent_forest_01": "foxglove-cluster", "silent_forest_02": "mossy-hooftrail", "silent_forest_03": "elderwood-stump",
    "muddy_fields_01": "cattail-crown", "muddy_fields_02": "lily-pad-crown", "muddy_fields_03": "bog-mushroom-circle",
    "storm_valley_01": "storm-scar-bush", "storm_valley_02": "rainwater-rill", "storm_valley_03": "charged-crystal-sprig",
    "dry_steppe_01": "steppe-thistle", "dry_steppe_02": "dusty-grass-whorl", "dry_steppe_03": "windflower-clump",
    "desert_01": "oasis-reed-crown", "desert_02": "beetle-trail-crown",
    "frozen_pass_01": "ice-flower-crown", "frozen_pass_02": "snowy-log-crown",
    "infernal_dungeon_01": "ember-mushroom-crown", "ash_citadel_final": "ash-blossom-crown",
}

TINTS = {
    "grasslands": (1.0, 1.0, 1.0), "silent_forest": (0.72, 0.94, 0.78),
    "muddy_fields": (0.88, 0.78, 0.60), "storm_valley": (0.66, 0.78, 0.94),
    "dry_steppe": (1.05, 0.83, 0.52), "desert": (1.10, 0.86, 0.50),
    "frozen_pass": (0.74, 0.90, 1.10), "infernal_dungeon": (1.12, 0.54, 0.38),
}

def keyed_crop(sheet: Image.Image, index: int) -> Image.Image:
    cell_w, cell_h = sheet.width // 4, sheet.height // 3
    x, y = (index % 4) * cell_w, (index // 4) * cell_h
    image = sheet.crop((x, y, x + cell_w, y + cell_h)).convert("RGBA")
    pixels = image.load()
    for py in range(image.height):
        for px in range(image.width):
            r, g, b, a = pixels[px, py]
            if r > 205 and b > 145 and g < 80:
                pixels[px, py] = (r, g, b, 0)
    bbox = image.getchannel("A").getbbox()
    return image.crop(bbox) if bbox else image

def tint(image: Image.Image, rgb: tuple[float, float, float]) -> Image.Image:
    red, green, blue, alpha = image.split()
    red = red.point(lambda value: min(255, int(value * rgb[0])))
    green = green.point(lambda value: min(255, int(value * rgb[1])))
    blue = blue.point(lambda value: min(255, int(value * rgb[2])))
    return Image.merge("RGBA", (red, green, blue, alpha))

def save(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, optimize=True)

def main() -> None:
    grass = Image.open(SOURCE / "grasslands-sheet.png")
    universal = Image.open(SOURCE / "universal-sheet.png")
    grass_cells = [keyed_crop(grass, index) for index in range(12)]
    universal_cells = [keyed_crop(universal, index) for index in range(12)]
    save(universal_cells[0], OUT / "shared" / "pine-tree.png")

    for biome, names in BIOME_ITEMS.items():
        for index, name in enumerate(names):
            # Ground and water images use the universal set; flora/props use the
            # generated grasslands sheet, then receive a restrained biome tint.
            source = universal_cells[index % 12] if any(token in name for token in ("pond", "stream", "puddle", "earth", "soil", "sand", "snow", "ice", "ground", "tracks", "creek")) else grass_cells[index % 12]
            image = tint(source, TINTS[biome])
            if index % 2:
                image = ImageEnhance.Color(image).enhance(0.82 + (index % 3) * 0.12)
            save(image, OUT / biome / f"{name}.png")

    for map_id, name in SIGNATURES.items():
        biome = "infernal_dungeon" if map_id.startswith("ash_") else map_id.rsplit("_", 1)[0]
        source = grass_cells[(len(name) + len(map_id)) % 12]
        save(tint(source, TINTS[biome]), OUT / biome / f"{name}.png")

if __name__ == "__main__":
    main()
