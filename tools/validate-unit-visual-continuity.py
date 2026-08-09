#!/usr/bin/env python3
"""Reject atlas changes that visually resize a unit between idle and run."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ATLAS_DIR = ROOT / "public" / "assets" / "units" / "atlases"
FRAME_SIZE = 128
RUN_FRAME_COUNTS = {
    "horseman": 8, "archer": 8, "swordsman": 8, "peasant": 8,
    "mage": 8, "knife_thrower": 8, "mace_guard": 8, "long_spearman": 8,
}
# Must stay in lockstep with UNIT_IDLE_TO_RUN_VISUAL_SCALE in Game.ts.
IDLE_TO_RUN_SCALE = {
    "horseman": 104 / 86, "archer": 102 / 113, "swordsman": 101 / 106,
    "peasant": 1, "mage": 113 / 93, "knife_thrower": 113 / 108,
    "mace_guard": 113 / 96, "long_spearman": 113 / 61,
}


def bounds(frame: Image.Image):
    alpha = frame.getchannel("A").point(lambda value: 255 if value > 16 else 0)
    box = alpha.getbbox()
    if box is None:
        raise RuntimeError("empty frame")
    return box


def action_bounds(atlas: Image.Image, row: int, count: int):
    return [
        bounds(atlas.crop((index * FRAME_SIZE, row * FRAME_SIZE, (index + 1) * FRAME_SIZE, (row + 1) * FRAME_SIZE)))
        for index in range(count)
    ]


errors = []
for team in ("player", "enemy"):
    for unit_id, run_count in RUN_FRAME_COUNTS.items():
        atlas = Image.open(ATLAS_DIR / f"{team}-{unit_id}.png").convert("RGBA")
        idle = action_bounds(atlas, 0, 8)
        run = action_bounds(atlas, 1, run_count)
        idle_heights = [box[3] - box[1] for box in idle]
        run_heights = [box[3] - box[1] for box in run]
        run_bottoms = [box[3] - 1 for box in run]
        normalized_run_height = max(run_heights) * IDLE_TO_RUN_SCALE[unit_id]

        if max(idle_heights) - min(idle_heights) > 2:
            errors.append(f"{team}-{unit_id}: idle height changes across frames")
        if max(run_heights) != min(run_heights):
            errors.append(f"{team}-{unit_id}: run height changes across frames")
        if max(run_bottoms) != min(run_bottoms):
            errors.append(f"{team}-{unit_id}: run ground line changes across frames")
        if abs(normalized_run_height - max(idle_heights)) > 1:
            errors.append(f"{team}-{unit_id}: idle/run visual height mismatch")

if errors:
    print("Unit visual continuity validation failed:")
    for error in errors:
        print(f"- {error}")
    raise SystemExit(1)

print("Unit visual continuity validation passed.")
