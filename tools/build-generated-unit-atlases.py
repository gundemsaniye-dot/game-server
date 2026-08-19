#!/usr/bin/env python3
"""Build Phaser-ready 16x3 unit atlases from generated 4x4 key-pose sheets."""

from __future__ import annotations

import colorsys
from collections import deque
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "source-assets" / "units" / "keyposes-alpha"
RUN_CYCLE_DIR = ROOT / "source-assets" / "units" / "run-cycles"
ATLAS_DIR = ROOT / "public" / "assets" / "units" / "atlases"

FRAME_SIZE = 128
ATLAS_COLUMNS = 16
ATLAS_ROWS = 3

SOURCES = {
    "mage": SOURCE_DIR / "mage-keyposes-alpha.png",
    "knife_thrower": SOURCE_DIR / "knife-thrower-keyposes-alpha.png",
    "mace_guard": SOURCE_DIR / "mace-guard-keyposes-alpha.png",
    "long_spearman": SOURCE_DIR / "long-spearman-keyposes-alpha.png",
}

# These replacement cycles keep the existing idle/attack poses untouched while
# giving the problematic units a dedicated, readable foot-contact loop.
RUN_CYCLE_SOURCES = {
    "mage": RUN_CYCLE_DIR / "mage-run-v2.png",
    "knife_thrower": RUN_CYCLE_DIR / "knife-thrower-run-v2.png",
    "long_spearman": RUN_CYCLE_DIR / "long-spearman-run-v2.png",
}

# The game plays the first eight run frames for generated units. The remaining
# atlas slots mirror that loop solely to retain the common 8/16/8 file layout.
SEQUENCES = {
    "idle": [0, 1, 2, 3, 2, 1, 0, 3],
    "run": [4, 5, 6, 7, 8, 9, 10, 11, 4, 5, 6, 7, 8, 9, 10, 11],
    "attack": [12, 13, 14, 15, 14, 13, 12, 15],
}

ACTION_ROWS = {"idle": 0, "run": 1, "attack": 2}

# The original four production units keep a fixed run-frame height and a fixed
# foot line. Generated poses contain weapons with very different silhouettes,
# so fitting every pose independently makes the whole unit appear to jump.
# These per-unit heights are the largest stable values that keep each run pose
# inside its 128px frame while preserving one scale throughout the cycle.
GROUND_BASELINE = 113
RUN_BODY_ANCHOR_X = 58
# Preserve a common silhouette height throughout each run cycle. The values
# are the largest non-clipping heights shared by all eight frames.
RUN_TARGET_HEIGHTS = {
    "mage": 93,
    "knife_thrower": 108,
    "mace_guard": 96,
    "long_spearman": 61,
}


def slice_key_poses(source: Image.Image) -> list[Image.Image]:
    poses: list[Image.Image] = []
    for row in range(4):
        for column in range(4):
            left = round(column * source.width / 4)
            right = round((column + 1) * source.width / 4)
            top = round(row * source.height / 4)
            bottom = round((row + 1) * source.height / 4)
            cell = source.crop((left, top, right, bottom))
            alpha = cell.getchannel("A").point(lambda value: 255 if value > 12 else 0)
            bounds = alpha.getbbox()
            if bounds is None:
                raise RuntimeError(f"Generated key-pose cell {row},{column} is empty")
            poses.append(cell.crop(bounds))
    return poses


def slice_run_cycle(source: Image.Image) -> list[Image.Image]:
    """Read the eight poses in a 4 x 2 dedicated run-cycle sheet."""
    poses: list[Image.Image] = []
    for row in range(2):
        for column in range(4):
            left = round(column * source.width / 4)
            right = round((column + 1) * source.width / 4)
            top = round(row * source.height / 2)
            bottom = round((row + 1) * source.height / 2)
            cell = source.crop((left, top, right, bottom))
            alpha = cell.getchannel("A").point(lambda value: 255 if value > 12 else 0)
            bounds = alpha.getbbox()
            if bounds is None:
                raise RuntimeError(f"Run-cycle cell {row},{column} is empty")
            poses.append(cell.crop(bounds))
    return poses


def keep_largest_connected_silhouette(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A")
    width, height = image.size
    pixels = alpha.load()
    occupied = bytearray(width * height)
    for y in range(height):
        for x in range(width):
            if pixels[x, y] > 16:
                occupied[y * width + x] = 1

    visited = bytearray(width * height)
    largest: list[int] = []
    for start in range(width * height):
        if not occupied[start] or visited[start]:
            continue
        component: list[int] = []
        queue: deque[int] = deque([start])
        visited[start] = 1
        while queue:
            current = queue.popleft()
            component.append(current)
            x = current % width
            y = current // width
            for next_y in range(max(0, y - 1), min(height, y + 2)):
                for next_x in range(max(0, x - 1), min(width, x + 2)):
                    neighbor = next_y * width + next_x
                    if occupied[neighbor] and not visited[neighbor]:
                        visited[neighbor] = 1
                        queue.append(neighbor)
        if len(component) > len(largest):
            largest = component

    if not largest:
        raise RuntimeError("Generated run pose has no connected silhouette")

    # Expand by two pixels so the original antialiased edge remains intact.
    keep = bytearray(width * height)
    for index in largest:
        x = index % width
        y = index // width
        for keep_y in range(max(0, y - 2), min(height, y + 3)):
            for keep_x in range(max(0, x - 2), min(width, x + 3)):
                keep[keep_y * width + keep_x] = 1

    cleaned = image.copy()
    cleaned_alpha = cleaned.getchannel("A")
    cleaned_pixels = cleaned_alpha.load()
    for y in range(height):
        for x in range(width):
            if not keep[y * width + x]:
                cleaned_pixels[x, y] = 0
    cleaned.putalpha(cleaned_alpha)
    bounds = cleaned_alpha.getbbox()
    if bounds is None:
        raise RuntimeError("Generated run pose became empty after cleanup")
    return cleaned.crop(bounds)


def lower_body_anchor_x(image: Image.Image) -> float:
    alpha = image.getchannel("A")
    pixels = alpha.load()
    lower_start = int(image.height * 0.55)
    weighted_x = 0
    alpha_weight = 0
    for y in range(lower_start, image.height):
        for x in range(image.width):
            value = pixels[x, y]
            if value <= 16:
                continue
            weighted_x += x * value
            alpha_weight += value
    return weighted_x / alpha_weight if alpha_weight else image.width / 2


def fit_pose(pose: Image.Image, unit_id: str, action: str, frame_index: int) -> Image.Image:
    max_width = 120 if unit_id == "long_spearman" else 112
    max_height = 116
    scale = (
        RUN_TARGET_HEIGHTS[unit_id] / pose.height
        if action == "run"
        else min(max_width / pose.width, max_height / pose.height)
    )

    width = max(1, round(pose.width * scale))
    height = max(1, round(pose.height * scale))
    resized = pose.resize((width, height), Image.Resampling.LANCZOS)

    frame = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
    if action == "run":
        body_anchor = lower_body_anchor_x(resized)
        x = round(RUN_BODY_ANCHOR_X - body_anchor)
        x = max(0, min(FRAME_SIZE - width, x))
    else:
        cycle_offsets = (-3, -2, -1, 0, 1, 2, 3, 4)
        x = (FRAME_SIZE - width) // 2 + cycle_offsets[frame_index]
    y = GROUND_BASELINE - height
    frame.alpha_composite(resized, (x, y))
    return frame


def validate_run_stability(atlas: Image.Image, unit_id: str) -> None:
    bottoms: list[int] = []
    heights: list[int] = []
    for frame_index in range(16):
        frame = atlas.crop(
            (
                frame_index * FRAME_SIZE,
                FRAME_SIZE,
                (frame_index + 1) * FRAME_SIZE,
                FRAME_SIZE * 2,
            )
        )
        alpha = frame.getchannel("A").point(lambda value: 255 if value > 16 else 0)
        bounds = alpha.getbbox()
        if bounds is None:
            raise RuntimeError(f"{unit_id} run frame {frame_index} is empty")
        bottoms.append(bounds[3] - 1)
        heights.append(bounds[3] - bounds[1])

    if max(bottoms) - min(bottoms) > 0 or max(heights) - min(heights) > 1:
        raise RuntimeError(
            f"{unit_id} unstable run frames: "
            f"bottom={min(bottoms)}..{max(bottoms)} "
            f"height={min(heights)}..{max(heights)}"
        )


def recolor_red_to_player_blue(image: Image.Image) -> Image.Image:
    recolored = image.copy()
    pixels = recolored.load()
    for y in range(recolored.height):
        for x in range(recolored.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha == 0:
                continue
            hue, saturation, value = colorsys.rgb_to_hsv(red / 255, green / 255, blue / 255)
            is_red_fabric = (hue <= 0.065 or hue >= 0.96) and saturation >= 0.34
            if not is_red_fabric:
                continue
            player_hue = 0.59
            new_red, new_green, new_blue = colorsys.hsv_to_rgb(
                player_hue,
                min(1.0, saturation * 0.92),
                min(1.0, value * 1.04),
            )
            pixels[x, y] = (
                round(new_red * 255),
                round(new_green * 255),
                round(new_blue * 255),
                alpha,
            )
    return recolored


def build_atlas(unit_id: str, source_path: Path) -> Image.Image:
    source = Image.open(source_path).convert("RGBA")
    poses = slice_key_poses(source)
    for pose_index in range(4, 12):
        poses[pose_index] = keep_largest_connected_silhouette(poses[pose_index])
    run_cycle_path = RUN_CYCLE_SOURCES.get(unit_id)
    run_poses = (
        slice_run_cycle(Image.open(run_cycle_path).convert("RGBA"))
        if run_cycle_path is not None
        else None
    )
    atlas = Image.new(
        "RGBA",
        (ATLAS_COLUMNS * FRAME_SIZE, ATLAS_ROWS * FRAME_SIZE),
        (0, 0, 0, 0),
    )

    unit_sequences = dict(SEQUENCES)
    if unit_id == "long_spearman":
        # The first generated idle pose holds the pike vertically. Keeping that
        # silhouette across the idle loop prevents the character from shrinking
        # when later horizontal-pike key poses are fitted into a 128px cell.
        unit_sequences["idle"] = [0] * 8

    for action, sequence in unit_sequences.items():
        row = ACTION_ROWS[action]
        for frame_index, pose_index in enumerate(sequence):
            pose = run_poses[frame_index % len(run_poses)] if action == "run" and run_poses else poses[pose_index]
            frame = fit_pose(pose, unit_id, action, frame_index)
            atlas.alpha_composite(frame, (frame_index * FRAME_SIZE, row * FRAME_SIZE))

    return atlas


def main() -> None:
    ATLAS_DIR.mkdir(parents=True, exist_ok=True)
    for unit_id, source_path in SOURCES.items():
        if not source_path.exists():
            raise FileNotFoundError(source_path)
        # Generated advanced-unit sources are authored in red. Runtime team
        # identity is player=blue and enemy=red, matching the four base units.
        enemy_atlas = build_atlas(unit_id, source_path)
        validate_run_stability(enemy_atlas, unit_id)
        player_atlas = recolor_red_to_player_blue(enemy_atlas)
        player_atlas.save(ATLAS_DIR / f"player-{unit_id}.png", optimize=True)
        enemy_atlas.save(ATLAS_DIR / f"enemy-{unit_id}.png", optimize=True)
        print(f"Built player/enemy atlases: {unit_id}")


if __name__ == "__main__":
    main()
