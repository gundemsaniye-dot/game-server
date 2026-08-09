from __future__ import annotations

import json
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path("/Users/devhtc/Downloads/ChatGPT Image 8 Tem 2026 20_07_13.png")
PUBLIC_OUT = ROOT / "public" / "assets" / "ui" / "menu"
REVIEW_OUT = ROOT / "outputs" / "menu-assets" / "castle-start-menu-v1"
GAME_SIZE = (1280, 720)


ASSETS = [
    {
        "id": "start",
        "file": "menu-start-button-v1.png",
        "box": (558, 438, 1118, 608),
        "mask": "beveled",
        "game_center": (640, 400),
        "game_size": (430, 130),
        "action": "start-game",
    },
    {
        "id": "upgrades",
        "file": "menu-upgrades-button-v1.png",
        "box": (407, 637, 668, 827),
        "mask": "rounded",
        "radius": 28,
        "game_center": (412, 560),
        "game_size": (200, 145),
        "action": "placeholder",
    },
    {
        "id": "shop",
        "file": "menu-shop-button-v1.png",
        "box": (704, 637, 975, 827),
        "mask": "rounded",
        "radius": 28,
        "game_center": (642, 560),
        "game_size": (207, 145),
        "action": "placeholder",
    },
    {
        "id": "settings",
        "file": "menu-settings-button-v1.png",
        "box": (1017, 637, 1262, 827),
        "mask": "rounded",
        "radius": 28,
        "game_center": (877, 560),
        "game_size": (198, 145),
        "action": "placeholder",
    },
    {
        "id": "quests",
        "file": "menu-quests-button-v1.png",
        "box": (47, 756, 166, 931),
        "mask": "rounded",
        "radius": 22,
        "game_center": (84, 645),
        "game_size": (97, 134),
        "action": "placeholder",
    },
    {
        "id": "daily_rewards",
        "file": "menu-daily-rewards-button-v1.png",
        "box": (1439, 756, 1611, 931),
        "mask": "rounded",
        "radius": 24,
        "game_center": (1186, 645),
        "game_size": (168, 134),
        "action": "placeholder",
    },
    {
        "id": "tagline_banner",
        "file": "menu-tagline-banner-v1.png",
        "box": (554, 828, 1120, 921),
        "mask": "beveled",
        "game_center": (640, 655),
        "game_size": (433, 71),
        "action": "decor",
    },
    {
        "id": "logo_panel",
        "file": "menu-logo-panel-v1.png",
        "box": (455, 20, 1218, 430),
        "mask": "logo_panel",
        "clear_boxes": [(708, 0, 763, 92)],
        "game_center": (640, 165),
        "game_size": (650, 356),
        "action": "decor",
    },
    {
        "id": "reference_currency_bar",
        "file": "reference-currency-bar.png",
        "box": (1190, 20, 1656, 101),
        "mask": "rounded",
        "radius": 24,
        "action": "reference-only",
    },
]


def ensure_dirs() -> None:
    PUBLIC_OUT.mkdir(parents=True, exist_ok=True)
    REVIEW_OUT.mkdir(parents=True, exist_ok=True)


def scaled_mask(size: tuple[int, int], kind: str, radius: int = 24) -> Image.Image:
    scale = 4
    w, h = size
    mask = Image.new("L", (w * scale, h * scale), 0)
    draw = ImageDraw.Draw(mask)

    if kind == "beveled":
        bevel = int(min(w, h) * 0.2 * scale)
        points = [
            (bevel, 0),
            (w * scale - bevel, 0),
            (w * scale, h * scale // 2),
            (w * scale - bevel, h * scale),
            (bevel, h * scale),
            (0, h * scale // 2),
        ]
        draw.polygon(points, fill=255)
    elif kind == "soft_polygon":
        inset_x = int(w * 0.04 * scale)
        inset_y = int(h * 0.02 * scale)
        points = [
            (inset_x, int(h * 0.25 * scale)),
            (int(w * 0.18 * scale), inset_y),
            (int(w * 0.82 * scale), inset_y),
            (w * scale - inset_x, int(h * 0.25 * scale)),
            (int(w * 0.94 * scale), int(h * 0.85 * scale)),
            (int(w * 0.5 * scale), h * scale - inset_y),
            (int(w * 0.06 * scale), int(h * 0.85 * scale)),
        ]
        draw.polygon(points, fill=255)
    elif kind == "logo_panel":
        inset_x = int(w * 0.015 * scale)
        inset_y = int(h * 0.015 * scale)
        points = [
            (int(w * 0.10 * scale), inset_y),
            (int(w * 0.90 * scale), inset_y),
            (w * scale - inset_x, int(h * 0.18 * scale)),
            (w * scale - inset_x, int(h * 0.76 * scale)),
            (int(w * 0.76 * scale), h * scale - inset_y),
            (int(w * 0.24 * scale), h * scale - inset_y),
            (inset_x, int(h * 0.76 * scale)),
            (inset_x, int(h * 0.18 * scale)),
        ]
        draw.polygon(points, fill=255)
    else:
        pad = 3 * scale
        draw.rounded_rectangle(
            (pad, pad, w * scale - pad, h * scale - pad),
            radius=radius * scale,
            fill=255,
        )

    mask = mask.filter(ImageFilter.GaussianBlur(0.65 * scale))
    return mask.resize(size, Image.Resampling.LANCZOS)


def make_background(src: Image.Image) -> Image.Image:
    base = src.resize(GAME_SIZE, Image.Resampling.LANCZOS).convert("RGB")
    scenic = ImageEnhance.Color(base).enhance(1.08)
    scenic = ImageEnhance.Contrast(scenic).enhance(1.05)
    scenic = ImageEnhance.Brightness(scenic).enhance(0.84)
    deep_blur = scenic.filter(ImageFilter.GaussianBlur(18))

    mask = Image.new("L", GAME_SIZE, 0)
    draw = ImageDraw.Draw(mask)
    zones = [
        (315, 18, 965, 330),
        (420, 332, 858, 480),
        (300, 490, 980, 690),
        (0, 570, 160, 720),
        (1095, 570, 1280, 720),
        (910, 8, 1280, 92),
    ]
    for box in zones:
        draw.rounded_rectangle(box, radius=36, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(32))

    bg = Image.composite(deep_blur, scenic, mask)
    overlay = Image.new("RGB", GAME_SIZE, (8, 20, 28))
    bg = Image.blend(bg, overlay, 0.18)
    return bg


def crop_asset(src: Image.Image, spec: dict) -> Image.Image:
    crop = src.crop(spec["box"]).convert("RGBA")
    mask = scaled_mask(
        crop.size,
        spec.get("mask", "rounded"),
        int(spec.get("radius", 24)),
    )
    crop.putalpha(mask)
    if "clear_boxes" in spec:
        alpha = crop.getchannel("A")
        draw = ImageDraw.Draw(alpha)
        for box in spec["clear_boxes"]:
            draw.rectangle(box, fill=0)
        crop.putalpha(alpha)
    return crop


def build_contact_sheet(paths: list[Path]) -> Image.Image:
    thumbs = []
    for path in paths:
        img = Image.open(path).convert("RGBA")
        img.thumbnail((260, 150), Image.Resampling.LANCZOS)
        tile = Image.new("RGBA", (300, 205), (247, 248, 246, 255))
        tile.alpha_composite(img, ((300 - img.width) // 2, 18))
        draw = ImageDraw.Draw(tile)
        draw.text((14, 168), path.name, fill=(34, 40, 48, 255))
        thumbs.append(tile)

    cols = 3
    rows = (len(thumbs) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * 300, rows * 205), (235, 238, 234, 255))
    for index, tile in enumerate(thumbs):
        sheet.alpha_composite(tile, ((index % cols) * 300, (index // cols) * 205))
    return sheet.convert("RGB")


def main() -> None:
    ensure_dirs()
    src = Image.open(SOURCE).convert("RGB")
    shutil.copy2(SOURCE, REVIEW_OUT / "source-reference.png")

    background = make_background(src)
    background.save(PUBLIC_OUT / "menu-background-v1.png")
    background.save(REVIEW_OUT / "menu-background-v1.png")

    exported_paths: list[Path] = [REVIEW_OUT / "menu-background-v1.png"]
    manifest = {
        "source": str(SOURCE),
        "gameSize": GAME_SIZE,
        "assets": [],
    }

    for spec in ASSETS:
        asset = crop_asset(src, spec)
        public_path = PUBLIC_OUT / spec["file"]
        review_path = REVIEW_OUT / spec["file"]
        asset.save(public_path)
        asset.save(review_path)
        exported_paths.append(review_path)

        record = {
            "id": spec["id"],
            "file": f"public/assets/ui/menu/{spec['file']}",
            "sourceBox": spec["box"],
            "pixelSize": asset.size,
            "action": spec["action"],
        }
        if "game_center" in spec:
            record["gameCenter"] = spec["game_center"]
            record["gameSize"] = spec["game_size"]
        manifest["assets"].append(record)

    (REVIEW_OUT / "manifest.json").write_text(
        json.dumps(manifest, indent=2),
        encoding="utf-8",
    )
    contact_sheet = build_contact_sheet(exported_paths)
    contact_sheet.save(REVIEW_OUT / "contact-sheet.png", quality=94)


if __name__ == "__main__":
    main()
