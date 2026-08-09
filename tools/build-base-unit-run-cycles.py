#!/usr/bin/env python3
"""Replace the four original unit run rows with stable authored 8-frame loops."""

from __future__ import annotations

import colorsys
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ATLAS_DIR = ROOT / "public" / "assets" / "units" / "atlases"
RUN_CYCLE_DIR = ROOT / "source-assets" / "units" / "run-cycles"
FRAME_SIZE = 128
GROUND_BASELINE = 113
RUN_BODY_ANCHOR_X = 58

RUN_CYCLES = {
    "horseman": (RUN_CYCLE_DIR / "horseman-run-v2.png", 86, 124, 2, 8),
    "archer": (RUN_CYCLE_DIR / "archer-run-v3.png", 113, 112, 4, 8),
    "swordsman": (RUN_CYCLE_DIR / "swordsman-run-v3.png", 106, 112, 4, 8),
    "peasant": (RUN_CYCLE_DIR / "peasant-run-v5.png", 100, 112, 2, 8),
}


def lower_body_anchor_x(image: Image.Image) -> float:
    alpha = image.getchannel("A")
    pixels = alpha.load()
    start_y = int(image.height * 0.55)
    weight = weighted_x = 0
    for y in range(start_y, image.height):
        for x in range(image.width):
            value = pixels[x, y]
            if value > 16:
                weight += value
                weighted_x += x * value
    return weighted_x / weight if weight else image.width / 2


def slice_cycle(path: Path, rows: int) -> list[Image.Image]:
    image = Image.open(path).convert("RGBA")
    frames: list[Image.Image] = []
    for row in range(rows):
        for column in range(4):
            box = (
                round(column * image.width / 4),
                round(row * image.height / rows),
                round((column + 1) * image.width / 4),
                round((row + 1) * image.height / rows),
            )
            cell = image.crop(box)
            alpha = cell.getchannel("A").point(lambda value: 255 if value > 12 else 0)
            bounds = alpha.getbbox()
            if bounds is None:
                raise RuntimeError(f"{path.name} contains an empty frame")
            frames.append(cell.crop(bounds))
    return frames


def place_frame(pose: Image.Image, target_height: int, max_width: int) -> Image.Image:
    scale = target_height / pose.height
    width = round(pose.width * scale)
    if width > max_width:
        raise RuntimeError(f"Run frame would clip at {width}px (limit: {max_width}px)")
    resized = pose.resize((width, target_height), Image.Resampling.LANCZOS)
    frame = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
    x = round(RUN_BODY_ANCHOR_X - lower_body_anchor_x(resized))
    x = max(0, min(FRAME_SIZE - width, x))
    frame.alpha_composite(resized, (x, GROUND_BASELINE - target_height))
    return frame


def recolor_player_blue_to_enemy_red(image: Image.Image) -> Image.Image:
    output = image.copy()
    pixels = output.load()
    for y in range(output.height):
        for x in range(output.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha == 0:
                continue
            hue, saturation, value = colorsys.rgb_to_hsv(red / 255, green / 255, blue / 255)
            if not (0.53 <= hue <= 0.70 and saturation >= 0.28):
                continue
            new_red, new_green, new_blue = colorsys.hsv_to_rgb(0.0, min(1.0, saturation * 0.9), min(1.0, value * 1.03))
            pixels[x, y] = (round(new_red * 255), round(new_green * 255), round(new_blue * 255), alpha)
    return output


def verify(frames: list[Image.Image], unit_id: str) -> None:
    bounds = []
    for frame in frames:
        alpha = frame.getchannel("A").point(lambda value: 255 if value > 16 else 0)
        box = alpha.getbbox()
        if box is None:
            raise RuntimeError(f"{unit_id} has an empty run frame")
        bounds.append(box)
    bottoms = [box[3] - 1 for box in bounds]
    heights = [box[3] - box[1] for box in bounds]
    if max(bottoms) != min(bottoms) or max(heights) != min(heights):
        raise RuntimeError(f"{unit_id} run loop is unstable")


def main() -> None:
    for unit_id, (source, target_height, max_width, rows, frame_count) in RUN_CYCLES.items():
        frames = [place_frame(pose, target_height, max_width) for pose in slice_cycle(source, rows)[:frame_count]]
        verify(frames, unit_id)
        for team in ("player", "enemy"):
            path = ATLAS_DIR / f"{team}-{unit_id}.png"
            atlas = Image.open(path).convert("RGBA")
            for index in range(16):
                frame = frames[index % len(frames)]
                output = frame if team == "player" else recolor_player_blue_to_enemy_red(frame)
                atlas.paste((0, 0, 0, 0), (index * FRAME_SIZE, FRAME_SIZE, (index + 1) * FRAME_SIZE, FRAME_SIZE * 2))
                atlas.alpha_composite(output, (index * FRAME_SIZE, FRAME_SIZE))
            atlas.save(path)
        print(f"Built player/enemy run cycles: {unit_id}")


if __name__ == "__main__":
    main()
