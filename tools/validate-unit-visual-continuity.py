#!/usr/bin/env python3
"""Validate natural 16-pose motion without ground-line or scale popping."""

import colorsys
from pathlib import Path
from statistics import median

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ATLAS_DIR = ROOT / "public" / "assets" / "units" / "atlases"
FRAME_SIZE = 128
UNIT_IDS = (
    "horseman", "archer", "swordsman", "peasant",
    "mage", "knife_thrower", "mace_guard", "long_spearman",
)

# Must stay in lockstep with the runtime normalization tables in Game.ts.
ACTION_VISUAL_SCALE = {
    "run": {
        "horseman": 104 / 86, "archer": 102 / 111,
        "swordsman": 101 / 106, "peasant": 1,
        "mage": 113 / 93, "knife_thrower": 113 / 108,
        "mace_guard": 113 / 96, "long_spearman": 113 / 61,
    },
    "attack": {
        "horseman": 104 / 78, "archer": 1, "swordsman": 101 / 74,
        "peasant": 100 / 82, "mage": 113 / 87,
        "knife_thrower": 113 / 97, "mace_guard": 113 / 70,
        "long_spearman": 113 / 54,
    },
}


def bounds(frame: Image.Image):
    alpha = frame.getchannel("A").point(lambda value: 255 if value > 16 else 0)
    box = alpha.getbbox()
    if box is None:
        raise RuntimeError("empty frame")
    return box


def action_frames(atlas: Image.Image, row: int, count: int):
    return [
        atlas.crop((index * FRAME_SIZE, row * FRAME_SIZE, (index + 1) * FRAME_SIZE, (row + 1) * FRAME_SIZE))
        for index in range(count)
    ]


def team_color_counts(atlas: Image.Image):
    red_pixels = 0
    blue_pixels = 0
    pixel_data = (
        atlas.get_flattened_data()
        if hasattr(atlas, "get_flattened_data")
        else atlas.getdata()
    )
    for red, green, blue, alpha in pixel_data:
        if alpha < 32:
            continue
        hue, saturation, value = colorsys.rgb_to_hsv(
            red / 255, green / 255, blue / 255
        )
        if (hue <= 0.045 or hue >= 0.97) and saturation >= 0.45 and value >= 0.18:
            red_pixels += 1
        if 0.53 <= hue <= 0.70 and saturation >= 0.35 and value >= 0.18:
            blue_pixels += 1
    return red_pixels, blue_pixels


errors = []
for team in ("player", "enemy"):
    for unit_id in UNIT_IDS:
        atlas = Image.open(ATLAS_DIR / f"{team}-{unit_id}.png").convert("RGBA")
        red_pixels, blue_pixels = team_color_counts(atlas)
        if team == "player" and blue_pixels <= red_pixels * 2:
            errors.append(
                f"{team}-{unit_id}: player atlas is not predominantly blue "
                f"(red={red_pixels}, blue={blue_pixels})"
            )
        if team == "enemy" and red_pixels <= blue_pixels * 2:
            errors.append(
                f"{team}-{unit_id}: enemy atlas is not predominantly red "
                f"(red={red_pixels}, blue={blue_pixels})"
            )
        idle_frames = action_frames(atlas, 0, 8)
        idle_bounds = [bounds(frame) for frame in idle_frames]
        idle_heights = [box[3] - box[1] for box in idle_bounds]
        idle_height = median(idle_heights)

        if max(idle_heights) - min(idle_heights) > 2:
            errors.append(f"{team}-{unit_id}: idle height changes across frames")

        for action_name, row in (("run", 1), ("attack", 2)):
            frames = action_frames(atlas, row, 16)
            boxes = [bounds(frame) for frame in frames]
            heights = [box[3] - box[1] for box in boxes]
            bottoms = [box[3] - 1 for box in boxes]
            fingerprints = {frame.tobytes() for frame in frames}
            normalized_height = median(heights) * ACTION_VISUAL_SCALE[action_name][unit_id]

            minimum_unique = 8 if action_name == "run" else 16
            if len(fingerprints) < minimum_unique:
                errors.append(
                    f"{team}-{unit_id}-{action_name}: expected at least "
                    f"{minimum_unique} unique frames"
                )
            if max(bottoms) != min(bottoms):
                errors.append(f"{team}-{unit_id}-{action_name}: ground line changes across frames")
            if min(heights) / max(heights) < 0.48:
                errors.append(f"{team}-{unit_id}-{action_name}: implausible silhouette-height jump")
            if abs(normalized_height - idle_height) > 1.5:
                errors.append(
                    f"{team}-{unit_id}-{action_name}: normalized median height "
                    f"{normalized_height:.1f} does not match idle {idle_height:.1f}"
                )

if errors:
    print("Unit visual continuity validation failed:")
    for error in errors:
        print(f"- {error}")
    raise SystemExit(1)

print("Unit visual continuity validation passed: 8 units, 2 teams, chronological run cycles + 16-frame attacks.")
