#!/usr/bin/env python3
"""Pack ImageGen 4x4 motion sheets into 60 Hz-friendly unit atlases.

Each action uses 16 unique authored poses. Runtime timing deliberately remains
separate so movement speed and combat cooldown can pace those poses naturally
without increasing the existing texture dimensions or runtime texture count.
"""

from __future__ import annotations

import colorsys
from collections import deque
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "source-assets" / "units" / "60fps" / "alpha"
RUN_CYCLE_DIR = ROOT / "source-assets" / "units" / "run-cycles"
KEYPOSE_DIR = ROOT / "source-assets" / "units" / "keyposes-alpha"
ATLAS_DIR = ROOT / "public" / "assets" / "units" / "atlases"
FRAME_SIZE = 128
GROUND_BASELINE = 113
BODY_ANCHOR_X = 58
SOURCE_GRID = 4
SOURCE_EDGE_INSET = 2
ALPHA_THRESHOLD = 16

UNITS = (
    "peasant",
    "swordsman",
    "archer",
    "horseman",
    "long_spearman",
    "mace_guard",
    "mage",
    "knife_thrower",
)
BASE_BLUE_UNITS = {"peasant", "swordsman", "archer", "horseman"}
ACTIONS = {"run": 1, "attack": 2}

# A generated contact sheet is not automatically an animation: the 60fps/run
# sheets contain attractive poses, but several units jump between unrelated
# foot phases. These ImageGen sheets were authored as chronological cycles and
# therefore remain the source of truth for locomotion. Eight-pose cycles are
# held for two atlas slots so every unit still has the same 16-slot timeline.
RUN_CYCLES = {
    "peasant": (RUN_CYCLE_DIR / "peasant-run-v5.png", 2, 100, None),
    "swordsman": (RUN_CYCLE_DIR / "swordsman-run-v3.png", 4, 106, None),
    "archer": (RUN_CYCLE_DIR / "archer-run-v3.png", 4, 111, None),
    "horseman": (RUN_CYCLE_DIR / "horseman-run-v3.png", 2, 86, None),
    "long_spearman": (RUN_CYCLE_DIR / "long-spearman-run-v2.png", 2, 61, None),
    "mace_guard": (KEYPOSE_DIR / "mace-guard-keyposes-alpha.png", 4, 96, slice(4, 12)),
    "mage": (RUN_CYCLE_DIR / "mage-run-v2.png", 2, 93, None),
    "knife_thrower": (RUN_CYCLE_DIR / "knife-thrower-run-v2.png", 2, 108, None),
}


def alpha_bounds(image: Image.Image) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A").point(lambda value: 255 if value > ALPHA_THRESHOLD else 0)
    bounds = alpha.getbbox()
    if bounds is None:
        raise RuntimeError("Animation frame is empty")
    return bounds


def keep_primary_silhouette(image: Image.Image) -> Image.Image:
    """Drop chroma remnants/grid edges while retaining the connected actor."""
    alpha = image.getchannel("A")
    width, height = image.size
    pixels = alpha.load()
    occupied = bytearray(width * height)
    for y in range(height):
        for x in range(width):
            if pixels[x, y] > ALPHA_THRESHOLD:
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
        raise RuntimeError("Animation frame has no connected silhouette")

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
    return cleaned


def slice_sheet(path: Path) -> list[Image.Image]:
    source = Image.open(path).convert("RGBA")
    frames: list[Image.Image] = []
    for row in range(SOURCE_GRID):
        for column in range(SOURCE_GRID):
            left = round(column * source.width / SOURCE_GRID) + SOURCE_EDGE_INSET
            right = round((column + 1) * source.width / SOURCE_GRID) - SOURCE_EDGE_INSET
            top = round(row * source.height / SOURCE_GRID) + SOURCE_EDGE_INSET
            bottom = round((row + 1) * source.height / SOURCE_GRID) - SOURCE_EDGE_INSET
            cell = source.crop((left, top, right, bottom))
            # Normalize the one-pixel width differences produced by 1254 / 4.
            cell = cell.resize((310, 310), Image.Resampling.LANCZOS)
            cell = keep_primary_silhouette(cell)
            alpha_bounds(cell)
            frames.append(cell)
    if len(frames) != 16:
        raise RuntimeError(f"{path.name}: expected 16 frames, found {len(frames)}")
    return frames


def slice_authored_run_cycle(
    path: Path,
    rows: int,
    selection: slice | None,
) -> list[Image.Image]:
    source = Image.open(path).convert("RGBA")
    poses: list[Image.Image] = []
    for row in range(rows):
        for column in range(4):
            bounds = (
                round(column * source.width / 4),
                round(row * source.height / rows),
                round((column + 1) * source.width / 4),
                round((row + 1) * source.height / rows),
            )
            cell = keep_primary_silhouette(source.crop(bounds))
            poses.append(cell.crop(alpha_bounds(cell)))
    if selection is not None:
        poses = poses[selection]
    if len(poses) not in (8, 16):
        raise RuntimeError(f"{path.name}: expected 8 or 16 chronological run poses, found {len(poses)}")
    return poses


def idle_visual_height(atlas: Image.Image) -> int:
    heights = []
    for index in range(8):
        frame = atlas.crop((index * FRAME_SIZE, 0, (index + 1) * FRAME_SIZE, FRAME_SIZE))
        bounds = alpha_bounds(frame)
        heights.append(bounds[3] - bounds[1])
    return max(heights)


def lower_body_anchor_x(image: Image.Image) -> float:
    alpha = image.getchannel("A")
    pixels = alpha.load()
    start_y = int(image.height * 0.55)
    weight = weighted_x = 0
    for y in range(start_y, image.height):
        for x in range(image.width):
            value = pixels[x, y]
            if value <= ALPHA_THRESHOLD:
                continue
            weight += value
            weighted_x += x * value
    return weighted_x / weight if weight else image.width / 2


def fit_action_frames(
    source_frames: list[Image.Image],
    target_height: int,
    action: str,
) -> tuple[list[Image.Image], int]:
    source_bounds = [alpha_bounds(frame) for frame in source_frames]
    source_heights = [bounds[3] - bounds[1] for bounds in source_bounds]
    source_widths = [bounds[2] - bounds[0] for bounds in source_bounds]

    # ImageGen varies empty space, crouch depth and weapon reach from cell to
    # cell. A single sheet-wide scale made the visible actor shrink by up to
    # 40 px during one attack. Normalize every pose to the largest common
    # non-clipping silhouette height; runtime applies one action-level scale.
    stable_height = int(min(
        target_height,
        108,
        min(122 * height / width for height, width in zip(source_heights, source_widths)),
    ))
    if stable_height < 48:
        raise RuntimeError(f"{action}: stable silhouette height is implausibly small ({stable_height})")

    packed: list[Image.Image] = []
    for source, bounds in zip(source_frames, source_bounds):
        pose = source.crop(bounds)
        scale = stable_height / pose.height
        width = max(1, round(pose.width * scale))
        pose = pose.resize((width, stable_height), Image.Resampling.LANCZOS)
        frame = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
        if action == "run":
            x = round(BODY_ANCHOR_X - lower_body_anchor_x(pose))
            x = max(2, min(FRAME_SIZE - width - 2, x))
        else:
            x = (FRAME_SIZE - width) // 2
        y = GROUND_BASELINE - stable_height
        frame.alpha_composite(pose, (x, y))
        packed.append(frame)
    return packed, stable_height


def fit_authored_run_frames(
    source_frames: list[Image.Image],
    target_height: int,
) -> list[Image.Image]:
    packed: list[Image.Image] = []
    for pose in source_frames:
        width = max(1, round(pose.width * target_height / pose.height))
        if width > FRAME_SIZE - 2:
            raise RuntimeError(f"Authored run pose would clip at {width}px")
        resized = pose.resize((width, target_height), Image.Resampling.LANCZOS)
        frame = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
        x = round(BODY_ANCHOR_X - lower_body_anchor_x(resized))
        x = max(1, min(FRAME_SIZE - width - 1, x))
        frame.alpha_composite(resized, (x, GROUND_BASELINE - target_height))
        packed.append(frame)

    if len(packed) == 8:
        packed = [frame for pose in packed for frame in (pose, pose.copy())]
    return packed


def recolor_opposing_team(image: Image.Image, unit_id: str) -> Image.Image:
    output = image.copy()
    pixels = output.load()
    for y in range(output.height):
        for x in range(output.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha == 0:
                continue
            hue, saturation, value = colorsys.rgb_to_hsv(red / 255, green / 255, blue / 255)
            if unit_id in BASE_BLUE_UNITS:
                selected = 0.53 <= hue <= 0.70 and saturation >= 0.28
                target_hue = 0.0
            else:
                selected = (hue <= 0.065 or hue >= 0.96) and saturation >= 0.34
                target_hue = 0.59
            if not selected:
                continue
            new_red, new_green, new_blue = colorsys.hsv_to_rgb(
                target_hue,
                min(1.0, saturation * 0.92),
                min(1.0, value * 1.04),
            )
            pixels[x, y] = (
                round(new_red * 255),
                round(new_green * 255),
                round(new_blue * 255),
                alpha,
            )
    return output


def validate_frames(unit_id: str, action: str, frames: list[Image.Image]) -> None:
    fingerprints: set[bytes] = set()
    bottoms: list[int] = []
    heights: list[int] = []
    for index, frame in enumerate(frames):
        bounds = alpha_bounds(frame)
        if bounds[0] <= 0 or bounds[1] <= 0 or bounds[2] >= FRAME_SIZE or bounds[3] >= FRAME_SIZE:
            raise RuntimeError(f"{unit_id}-{action} frame {index} clips: {bounds}")
        bottoms.append(bounds[3] - 1)
        heights.append(bounds[3] - bounds[1])
        fingerprint = frame.resize((32, 32), Image.Resampling.LANCZOS).tobytes()
        fingerprints.add(fingerprint)
    minimum_unique = 8 if action == "run" else 16
    if len(fingerprints) < minimum_unique:
        raise RuntimeError(
            f"{unit_id}-{action}: only {len(fingerprints)} unique frames "
            f"(expected at least {minimum_unique})"
        )
    if max(bottoms) != min(bottoms):
        raise RuntimeError(f"{unit_id}-{action}: unstable baseline {min(bottoms)}..{max(bottoms)}")
    if max(heights) - min(heights) > 1:
        raise RuntimeError(f"{unit_id}-{action}: unstable silhouette height {min(heights)}..{max(heights)}")


def main() -> None:
    for unit_id in UNITS:
        player_path = ATLAS_DIR / f"player-{unit_id}.png"
        enemy_path = ATLAS_DIR / f"enemy-{unit_id}.png"
        player_atlas = Image.open(player_path).convert("RGBA")
        enemy_atlas = Image.open(enemy_path).convert("RGBA")
        target_height = idle_visual_height(player_atlas)

        for action, row in ACTIONS.items():
            if action == "run":
                source_path, rows, stable_height, selection = RUN_CYCLES[unit_id]
                frames = fit_authored_run_frames(
                    slice_authored_run_cycle(source_path, rows, selection),
                    stable_height,
                )
            else:
                source_path = SOURCE_DIR / f"{unit_id}-{action}-v1.png"
                if not source_path.exists():
                    raise FileNotFoundError(source_path)
                frames, stable_height = fit_action_frames(
                    slice_sheet(source_path),
                    target_height,
                    action,
                )
            validate_frames(unit_id, action, frames)
            player_atlas.paste((0, 0, 0, 0), (0, row * FRAME_SIZE, player_atlas.width, (row + 1) * FRAME_SIZE))
            enemy_atlas.paste((0, 0, 0, 0), (0, row * FRAME_SIZE, enemy_atlas.width, (row + 1) * FRAME_SIZE))
            for index, source_frame in enumerate(frames):
                # Base animation sources are blue; generated advanced-unit
                # sources are red. Normalize every runtime atlas to the same
                # ownership contract: player=blue and enemy=red.
                opposing_frame = recolor_opposing_team(source_frame, unit_id)
                if unit_id in BASE_BLUE_UNITS:
                    player_frame, enemy_frame = source_frame, opposing_frame
                else:
                    player_frame, enemy_frame = opposing_frame, source_frame
                destination = (index * FRAME_SIZE, row * FRAME_SIZE)
                player_atlas.alpha_composite(player_frame, destination)
                enemy_atlas.alpha_composite(enemy_frame, destination)
            print(f"  {action}: stable silhouette height={stable_height}px")

        player_atlas.save(player_path, optimize=True)
        enemy_atlas.save(enemy_path, optimize=True)
        print(f"Built 16-frame run+attack atlases: {unit_id}")


if __name__ == "__main__":
    main()
