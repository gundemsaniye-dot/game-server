import { Math as PhaserMath, type Scene } from "phaser";
import type {
  BattleMapConfig,
  LaneConfig,
  MapVisualConfig,
  MapObjectConfig,
  ProceduralVisualId,
  ResourceNodeConfig,
  WeatherType,
} from "../types/MapTypes";
import { MAP_ASSETS_BY_KEY } from "../config/mapAssets";

export interface MapRenderOptions {
  showBackground?: boolean;
  showLegacyTerrain?: boolean;
  showObjects?: boolean;
  showResources?: boolean;
  showWeather?: boolean;
  animateWeather?: boolean;
  depthOffset?: number;
}

export interface MapRenderResult {
  objects: Phaser.GameObjects.GameObject[];
  tweens: Phaser.Tweens.Tween[];
  destroy: () => void;
}

function seededRandom(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function colorMix(color: number, target: number, amount: number) {
  const channel = (shift: number) => {
    const from = (color >> shift) & 0xff;
    const to = (target >> shift) & 0xff;
    return Math.round(from + (to - from) * amount);
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

function stringSeed(value: string) {
  let seed = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    seed ^= value.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

function organicPatchPoints(
  patch: BattleMapConfig["terrain"]["patches"][number],
  random: () => number,
  scale = 1,
) {
  const points: Phaser.Math.Vector2[] = [];
  const steps = patch.shape === "ellipse" ? 20 : 16;
  for (let index = 0; index < steps; index += 1) {
    let localX = 0;
    let localY = 0;
    if (patch.shape === "ellipse") {
      const angle = (index / steps) * Math.PI * 2;
      const wobble = 0.88 + random() * 0.2;
      localX = Math.cos(angle) * patch.width * 0.5 * wobble * scale;
      localY = Math.sin(angle) * patch.height * 0.5 * wobble * scale;
    } else {
      const side = Math.floor(index / 4);
      const t = (index % 4) / 3;
      const halfWidth = patch.width * 0.5 * scale;
      const halfHeight = patch.height * 0.5 * scale;
      const jitter = (random() - 0.5) * Math.min(patch.width, patch.height) * 0.12;
      if (side === 0) { localX = -halfWidth + patch.width * scale * t; localY = -halfHeight + jitter; }
      if (side === 1) { localX = halfWidth + jitter; localY = -halfHeight + patch.height * scale * t; }
      if (side === 2) { localX = halfWidth - patch.width * scale * t; localY = halfHeight + jitter; }
      if (side === 3) { localX = -halfWidth + jitter; localY = halfHeight - patch.height * scale * t; }
    }
    const cos = Math.cos(patch.rotation);
    const sin = Math.sin(patch.rotation);
    points.push(new PhaserMath.Vector2(
      patch.x + localX * cos - localY * sin,
      patch.y + localX * sin + localY * cos,
    ));
  }
  return points;
}

function renderBaseVariation(
  scene: Scene,
  map: BattleMapConfig,
  objects: Phaser.GameObjects.GameObject[],
  depthOffset: number,
) {
  const random = seededRandom(map.seed ^ 0x7a4d91c3);
  const graphics = scene.add.graphics().setDepth(depthOffset + 1);
  const shadow = colorMix(map.terrain.baseColor, map.terrain.laneEdgeColor, 0.24);
  const light = colorMix(map.terrain.baseColor, map.terrain.laneHighlightColor, 0.18);

  // Large, low-contrast shapes break the digital flat fill before the authored
  // terrain regions are painted. Their seed is stable, so editor and gameplay
  // always show exactly the same surface.
  for (let index = 0; index < 22; index += 1) {
    const patch = {
      id: `base_variation_${index}`,
      shape: "ellipse" as const,
      x: 130 + random() * 1020,
      y: 20 + random() * 680,
      width: 150 + random() * 310,
      height: 54 + random() * 150,
      color: index % 3 === 0 ? light : shadow,
      alpha: 0.035 + random() * 0.055,
      rotation: (random() - 0.5) * 0.5,
      depth: 1,
      material: "grass" as const,
      collision: "none" as const,
      variant: index % 4,
    };
    graphics.fillStyle(patch.color, patch.alpha);
    graphics.fillPoints(organicPatchPoints(patch, seededRandom(map.seed ^ stringSeed(patch.id))), true);
  }
  objects.push(graphics);
}

function renderTerrainPatch(
  scene: Scene,
  map: BattleMapConfig,
  patch: BattleMapConfig["terrain"]["patches"][number],
  objects: Phaser.GameObjects.GameObject[],
  depthOffset: number,
) {
  const graphics = scene.add.graphics().setDepth(depthOffset + patch.depth);
  const seed = map.seed ^ stringSeed(patch.id);
  const pointsAt = (scale: number) => organicPatchPoints(patch, seededRandom(seed), scale);
  const isImpassable = patch.collision !== "none";
  const isRegion = patch.alpha >= 0.55 || isImpassable;

  if (isRegion) {
    const outer = pointsAt(1.08);
    const edgeTarget = patch.material === "water"
      ? 0x244f69
      : patch.material === "lava"
        ? 0x4a1510
        : map.terrain.laneEdgeColor;
    const lightTarget = patch.material === "water"
      ? 0xc9f4ff
      : patch.material === "lava"
        ? 0xffd058
        : map.terrain.laneHighlightColor;
    const edge = colorMix(patch.color, edgeTarget, 0.58);
    const inner = colorMix(patch.color, lightTarget, isImpassable ? 0.42 : 0.22);

    graphics.fillStyle(edge, Math.min(0.92, patch.alpha));
    graphics.fillPoints(outer, true);
    graphics.fillStyle(patch.color, Math.min(0.97, patch.alpha + 0.04));
    graphics.fillPoints(pointsAt(1), true);
    graphics.fillStyle(inner, (isImpassable ? 0.14 : 0.2) + patch.alpha * 0.2);
    graphics.fillPoints(pointsAt(0.84), true);

    graphics.lineStyle(isImpassable ? 3 : 2.5, edge, isImpassable ? 0.9 : 0.78);
    graphics.strokePoints(outer, true, false);

    if (patch.material === "grass" || patch.material === "forest_floor") {
      graphics.fillStyle(edge, 0.88);
      outer.forEach((point, index) => {
        const next = outer[(index + 1) % outer.length];
        const length = Math.hypot(next.x - point.x, next.y - point.y);
        const steps = Math.max(1, Math.floor(length / 13));
        for (let step = 0; step < steps; step += 1) {
          const t = (step + 0.5) / steps;
          const x = point.x + (next.x - point.x) * t;
          const y = point.y + (next.y - point.y) * t;
          const radialX = x - patch.x;
          const radialY = y - patch.y;
          const radialLength = Math.max(1, Math.hypot(radialX, radialY));
          const outX = radialX / radialLength;
          const outY = radialY / radialLength;
          const tangentX = -outY;
          const tangentY = outX;
          graphics.fillTriangle(
            x - tangentX * 2.2, y - tangentY * 2.2,
            x + outX * (4 + (index % 3)), y + outY * (4 + (index % 3)),
            x + tangentX * 2.2, y + tangentY * 2.2,
          );
        }
      });
    }

    // Castle Raid's terrain borders read as a hand-painted/scalloped rim. Small
    // deterministic edge beads preserve that look without introducing a road.
    graphics.fillStyle(edge, 0.48);
    outer.forEach((point, index) => {
      const next = outer[(index + 1) % outer.length];
      graphics.fillCircle(point.x, point.y, 2.2 + (index % 3) * 0.7);
      graphics.fillCircle((point.x + next.x) / 2, (point.y + next.y) / 2, 1.8 + (index % 2) * 0.6);
    });

    if (patch.material === "water") {
      graphics.lineStyle(2, 0xd8f7ff, 0.42);
      for (let offset = -0.24; offset <= 0.28; offset += 0.26) {
        graphics.beginPath();
        graphics.moveTo(patch.x - patch.width * 0.25, patch.y + patch.height * offset);
        graphics.lineTo(patch.x - patch.width * 0.04, patch.y + patch.height * (offset - 0.035));
        graphics.lineTo(patch.x + patch.width * 0.18, patch.y + patch.height * (offset + 0.018));
        graphics.strokePath();
      }
    } else if (patch.material === "lava") {
      graphics.lineStyle(3, 0xffc04c, 0.72);
      graphics.lineBetween(patch.x - patch.width * 0.28, patch.y, patch.x - patch.width * 0.04, patch.y - patch.height * 0.14);
      graphics.lineBetween(patch.x - patch.width * 0.04, patch.y - patch.height * 0.14, patch.x + patch.width * 0.22, patch.y + patch.height * 0.09);
    }
  } else {
    graphics.fillStyle(patch.color, patch.alpha);
    graphics.fillPoints(pointsAt(1), true);
    graphics.fillStyle(colorMix(patch.color, 0xffffff, 0.1), patch.alpha * 0.22);
    graphics.fillPoints(pointsAt(0.76), true);
  }

  if (!isImpassable) {
    const detailRandom = seededRandom(seed ^ (patch.variant + 1) * 0x45d9f3b);
    const detailCount = Math.max(8, Math.min(34, Math.round((patch.width * patch.height) / 4200)));
    const dark = colorMix(patch.color, 0x243126, 0.42);
    const light = colorMix(patch.color, 0xffffff, 0.34);
    for (let index = 0; index < detailCount; index += 1) {
      const angle = detailRandom() * Math.PI * 2;
      const radius = Math.sqrt(detailRandom()) * 0.42;
      const localX = Math.cos(angle) * patch.width * radius;
      const localY = Math.sin(angle) * patch.height * radius;
      const cos = Math.cos(patch.rotation);
      const sin = Math.sin(patch.rotation);
      const x = patch.x + localX * cos - localY * sin;
      const y = patch.y + localX * sin + localY * cos;
      if (["grass", "forest_floor"].includes(patch.material)) {
        graphics.lineStyle(1.3, dark, 0.34);
        graphics.lineBetween(x, y + 4, x - 3, y - 2);
        graphics.lineBetween(x, y + 4, x + 3, y - 3);
      } else if (["soil", "mud", "dry_soil", "ash"].includes(patch.material)) {
        graphics.fillStyle(index % 4 === 0 ? light : dark, 0.18);
        graphics.fillEllipse(x, y, 4 + detailRandom() * 8, 1.5 + detailRandom() * 3);
      } else if (patch.material === "sand" || patch.material === "snow") {
        graphics.lineStyle(1.2, patch.material === "snow" ? 0xffffff : light, 0.28);
        graphics.beginPath();
        graphics.moveTo(x - 8, y);
        graphics.lineTo(x, y - 2);
        graphics.lineTo(x + 8, y);
        graphics.strokePath();
      } else if (patch.material === "stone") {
        graphics.lineStyle(1.3, dark, 0.3);
        graphics.strokeEllipse(x, y, 7 + detailRandom() * 8, 3 + detailRandom() * 5);
      }
    }
  }
  objects.push(graphics);
}

function renderGroundTexture(
  scene: Scene,
  map: BattleMapConfig,
  objects: Phaser.GameObjects.GameObject[],
  depthOffset: number,
) {
  const random = seededRandom(map.seed ^ 0x51f15e1d);
  const graphics = scene.add.graphics().setDepth(depthOffset + 2);
  const dark = colorMix(map.terrain.baseColor, 0x17361f, 0.34);
  const light = colorMix(map.terrain.baseColor, 0xffffff, 0.22);
  const count = map.biome === "grasslands"
    ? 270
    : map.biome === "silent_forest" || map.biome === "muddy_fields"
      ? 220
      : map.biome === "desert" || map.biome === "dry_steppe"
        ? 150
        : 180;

  for (let index = 0; index < count; index += 1) {
    const x = 126 + random() * 1028;
    const y = 18 + random() * 684;
    const size = 2 + random() * 5;
    if (map.biome === "grasslands" || map.biome === "silent_forest" || map.biome === "muddy_fields") {
      graphics.lineStyle(1.2, index % 4 === 0 ? light : dark, 0.25 + random() * 0.24);
      graphics.beginPath();
      graphics.moveTo(x, y + size);
      graphics.lineTo(x - size * 0.55, y);
      graphics.moveTo(x, y + size);
      graphics.lineTo(x + size * 0.55, y - size * 0.35);
      graphics.strokePath();
      if (index % 7 === 0) {
        graphics.fillStyle(dark, 0.11 + random() * 0.08);
        graphics.fillEllipse(x + size * 1.7, y + size * 0.7, size * 3.2, Math.max(1.4, size * 0.75));
      }
    } else if (map.biome === "frozen_pass") {
      graphics.fillStyle(index % 3 === 0 ? 0xffffff : dark, 0.12 + random() * 0.18);
      graphics.fillEllipse(x, y, size * 1.7, Math.max(1, size * 0.45));
    } else if (map.biome === "infernal_dungeon") {
      graphics.lineStyle(1.1, index % 5 === 0 ? 0xe8662a : dark, 0.16 + random() * 0.22);
      graphics.lineBetween(x - size, y, x + size, y + (random() - 0.5) * 4);
    } else {
      graphics.fillStyle(index % 4 === 0 ? light : dark, 0.14 + random() * 0.2);
      graphics.fillEllipse(x, y, size * 1.8, Math.max(1, size * 0.55));
    }
  }
  objects.push(graphics);
}

export function laneYAtX(lane: LaneConfig, x: number) {
  const points = lane.points;
  if (x <= points[0].x) return points[0].y;
  if (x >= points[points.length - 1].x) return points[points.length - 1].y;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (x > current.x) continue;
    const t = (x - previous.x) / Math.max(1, current.x - previous.x);
    return previous.y + (current.y - previous.y) * t;
  }
  return points[points.length - 1].y;
}

export function nearestLane(map: BattleMapConfig, x: number, y: number) {
  return [...map.lanes].sort(
    (first, second) => Math.abs(laneYAtX(first, x) - y) - Math.abs(laneYAtX(second, x) - y),
  )[0];
}

export function flowYAtX(map: BattleMapConfig, x: number, position: number) {
  const [top, middle, bottom] = map.lanes;
  const t = Math.max(0, Math.min(1, position));
  if (t <= 0.5) {
    const local = t * 2;
    return laneYAtX(top, x) + (laneYAtX(middle, x) - laneYAtX(top, x)) * local;
  }
  const local = (t - 0.5) * 2;
  return laneYAtX(middle, x) + (laneYAtX(bottom, x) - laneYAtX(middle, x)) * local;
}

export function flowPositionAtPoint(map: BattleMapConfig, x: number, y: number) {
  const top = laneYAtX(map.lanes[0], x);
  const middle = laneYAtX(map.lanes[1], x);
  const bottom = laneYAtX(map.lanes[2], x);
  if (y <= middle) {
    return 0.5 * Math.max(0, Math.min(1, (y - top) / Math.max(1, middle - top)));
  }
  return 0.5 + 0.5 * Math.max(0, Math.min(1, (y - middle) / Math.max(1, bottom - middle)));
}

function drawProceduralVisual(graphics: Phaser.GameObjects.Graphics, id: ProceduralVisualId, variant: number) {
  const shade = variant % 3;
  graphics.fillStyle(0x111812, 0.18);
  graphics.fillEllipse(0, 4, id.includes("tree") || id.includes("pine") ? 58 : 48, 14);

  if (id.startsWith("pine_")) {
    const snowy = id === "pine_snow";
    const young = id === "pine_young";
    const dense = id === "pine_dense";
    const height = young ? 72 : id === "pine_tall" ? 116 : 98;
    const half = young ? 25 : dense ? 43 : 35;
    graphics.fillStyle(0x79502d, 1);
    graphics.fillRect(-5, -height * 0.42, 10, height * 0.46);
    graphics.lineStyle(2, 0x49301d, 0.95);
    graphics.strokeRect(-5, -height * 0.42, 10, height * 0.46);
    const greens = snowy
      ? [0x285d49, 0x36775a, 0x438d68]
      : shade === 0
        ? [0x1c612d, 0x287d38, 0x35a047]
        : shade === 1
          ? [0x204f36, 0x2a6a40, 0x37864b]
          : [0x2a6431, 0x397d3d, 0x4a954a];
    const tiers = dense ? 4 : 3;
    for (let tier = 0; tier < tiers; tier += 1) {
      const top = -height + tier * height * 0.2;
      const bottom = -height * 0.28 + tier * height * 0.1;
      const width = half * (0.62 + tier * 0.15);
      graphics.fillStyle(greens[tier % greens.length], 1);
      graphics.fillTriangle(-width, bottom, 0, top, width, bottom);
      graphics.lineStyle(2, 0x174726, 0.95);
      graphics.strokeTriangle(-width, bottom, 0, top, width, bottom);
      if (snowy && tier < 3) {
        graphics.fillStyle(0xf3fbff, 0.76);
        graphics.fillTriangle(-width * 0.48, bottom - 5, 0, top + 13, width * 0.48, bottom - 5);
      }
    }
    return;
  }

  if (id === "broadleaf_tree") {
    graphics.fillStyle(0x76502c, 1);
    graphics.fillRect(-7, -54, 14, 58);
    graphics.lineStyle(3, 0x49301d, 0.9);
    graphics.strokeRect(-7, -54, 14, 58);
    const leaves = shade === 0 ? [0x397c38, 0x4d9645, 0x66ac51] : [0x2f6d38, 0x438444, 0x579b4d];
    [[-22, -64, 42], [22, -62, 44], [0, -89, 49], [0, -55, 52]].forEach(([x, y, size], index) => {
      graphics.fillStyle(leaves[index % leaves.length], 1);
      graphics.fillCircle(x, y, size / 2);
      graphics.lineStyle(2, 0x28562d, 0.9);
      graphics.strokeCircle(x, y, size / 2);
    });
    return;
  }

  if (id === "dead_tree" || id === "burned_tree") {
    const trunk = id === "burned_tree" ? 0x382a29 : 0x78583b;
    const edge = id === "burned_tree" ? 0x1d1718 : 0x4b3728;
    graphics.lineStyle(10, trunk, 1);
    graphics.lineBetween(0, 2, -2, -82);
    graphics.lineStyle(7, trunk, 1);
    graphics.lineBetween(-2, -54, -28, -75);
    graphics.lineBetween(-1, -42, 27, -65);
    graphics.lineStyle(2, edge, 1);
    graphics.lineBetween(0, 2, -2, -84);
    graphics.lineBetween(-2, -54, -30, -77);
    graphics.lineBetween(-1, -42, 29, -67);
    return;
  }

  if (id === "rock_cluster" || id === "pebbles") {
    const rocks = id === "pebbles" ? [[-15, -2, 18, 9], [5, 0, 15, 8], [20, -4, 12, 7]] : [[-17, -11, 33, 28], [12, -14, 39, 34], [1, -29, 31, 26]];
    rocks.forEach(([x, y, width, height], index) => {
      graphics.fillStyle([0x69736f, 0x818b83, 0x56615e][(index + shade) % 3], 1);
      graphics.fillEllipse(x, y, width, height);
      graphics.lineStyle(2, 0x3d4745, 0.9);
      graphics.strokeEllipse(x, y, width, height);
    });
    return;
  }

  if (id === "branch" || id === "fallen_log") {
    graphics.lineStyle(id === "fallen_log" ? 15 : 7, 0x77502f, 1);
    graphics.lineBetween(-35, -8, 34, -15);
    graphics.lineStyle(3, 0x49301f, 1);
    graphics.lineBetween(-37, -8, 36, -15);
    if (id === "branch") {
      graphics.lineBetween(-5, -12, 12, -29);
      graphics.lineBetween(17, -14, 30, -28);
    } else {
      graphics.strokeCircle(-34, -8, 8);
    }
    return;
  }

  if (id === "reeds") {
    for (let index = -3; index <= 3; index += 1) {
      const x = index * 7;
      const height = 28 + ((index + variant + 8) % 3) * 8;
      graphics.lineStyle(3, 0x4d7637, 1);
      graphics.lineBetween(x, 1, x + index, -height);
      graphics.fillStyle(0x8a6a37, 1);
      graphics.fillEllipse(x + index, -height, 6, 13);
    }
    return;
  }

  if (id === "cactus") {
    graphics.lineStyle(13, 0x3d8a4b, 1);
    graphics.lineBetween(0, 2, 0, -66);
    graphics.lineBetween(0, -38, -19, -51);
    graphics.lineBetween(-19, -51, -19, -62);
    graphics.lineBetween(0, -29, 20, -41);
    graphics.lineBetween(20, -41, 20, -54);
    graphics.lineStyle(2, 0x285c35, 1);
    graphics.lineBetween(0, 2, 0, -70);
    return;
  }

  const crystal = id === "crystal" || id === "obsidian" || id === "lava_vent";
  if (crystal) {
    const colors = id === "crystal" ? [0x69d6e8, 0x9cf1ff] : id === "obsidian" ? [0x332c46, 0x5c4f78] : [0xb73b21, 0xff7a2e];
    [[-18, 0, -8, -55, 4, 0], [0, 2, 13, -72, 24, 2], [18, 2, 30, -42, 38, 2]].forEach((points, index) => {
      graphics.fillStyle(colors[index % colors.length], 1);
      graphics.fillTriangle(...points as [number, number, number, number, number, number]);
      graphics.lineStyle(2, id === "lava_vent" ? 0x4f1711 : 0x29283b, 0.95);
      graphics.strokeTriangle(...points as [number, number, number, number, number, number]);
    });
  }
}

function fallbackVisual(): Extract<MapVisualConfig, { source: "procedural" }> {
  return { source: "procedural", id: "rock_cluster", variant: 0 };
}

export function createMapPropVisual(
  scene: Scene,
  config: Pick<MapObjectConfig | ResourceNodeConfig, "visual" | "x" | "y" | "scale" | "rotation" | "depth">,
) {
  const visual = config.visual ?? fallbackVisual();
  const definition = visual.source === "asset" ? MAP_ASSETS_BY_KEY[visual.assetKey] : undefined;
  if (visual.source === "asset" && definition && scene.textures.exists(definition.key)) {
    return scene.add
      .image(config.x, config.y, definition.key)
      .setOrigin(0.5, definition.renderLayer === "ground" ? 0.5 : 0.82)
      .setScale(config.scale)
      .setRotation(config.rotation)
      .setDepth(config.depth);
  }
  if (visual.source === "asset" && definition && scene.textures.exists(definition.atlasKey)) {
    return scene.add
      .image(config.x, config.y, definition.atlasKey, definition.frame)
      .setOrigin(0.5, definition.renderLayer === "ground" ? 0.5 : 0.82)
      .setScale(config.scale)
      .setRotation(config.rotation)
      .setDepth(config.depth);
  }

  const procedural = visual.source === "procedural" ? visual : fallbackVisual();
  const graphics = scene.add.graphics();
  drawProceduralVisual(graphics, procedural.id, procedural.variant);
  return scene.add
    .container(config.x, config.y, [graphics])
    .setScale(config.scale)
    .setRotation(config.rotation)
    .setDepth(config.depth);
}

function renderWeather(
  scene: Scene,
  map: BattleMapConfig,
  animate: boolean,
  objects: Phaser.GameObjects.GameObject[],
  tweens: Phaser.Tweens.Tween[],
  depthOffset: number,
) {
  const { type, intensity } = map.weather;
  if (type === "none" || intensity <= 0) return;
  const random = seededRandom(map.seed ^ 0x9e3779b9);
  const count = Math.round(10 + intensity * 34);

  if (type === "mist") {
    const overlay = scene.add.rectangle(640, 360, 1280, 720, 0xd9e7df, 0.08 + intensity * 0.18).setDepth(depthOffset + 610);
    objects.push(overlay);
    for (let index = 0; index < Math.max(4, Math.round(count / 4)); index += 1) {
      const cloud = scene.add.ellipse(random() * 1280, 80 + random() * 560, 180 + random() * 260, 45 + random() * 55, 0xe9f0ea, 0.05 + intensity * 0.1).setDepth(depthOffset + 611);
      objects.push(cloud);
      if (animate) tweens.push(scene.tweens.add({ targets: cloud, x: cloud.x + 120, duration: 7000 + random() * 5000, yoyo: true, repeat: -1, ease: "Sine.InOut" }));
    }
    return;
  }

  // A single emitter keeps weather in one atlas batch. The previous version
  // allocated one Shape and one Tween per particle (37 objects on Level 20).
  const weatherTextureKey = "weather-particle-v1";
  if (!scene.textures.exists(weatherTextureKey)) {
    const brush = scene.make.graphics({ x: 0, y: 0 });
    brush.fillStyle(0xffffff, 1).fillCircle(4, 4, 4);
    brush.generateTexture(weatherTextureKey, 8, 8);
    brush.destroy();
  }
  const isEmber = type === "embers";
  const isDust = type === "dust" || type === "sandstorm";
  const isRain = type === "rain" || type === "storm";
  const tint = isEmber ? 0xff6b2c : isDust ? 0xf0d29a : type === "snow" ? 0xffffff : 0xb9ddf3;
  if (type === "storm") {
    objects.push(scene.add.rectangle(640, 360, 1280, 720, 0x26384b, 0.12 + intensity * 0.12).setDepth(depthOffset + 609));
  } else if (isDust) {
    objects.push(scene.add.rectangle(640, 360, 1280, 720, type === "sandstorm" ? 0xd99d4a : 0xc6a26f, 0.05 + intensity * 0.15).setDepth(depthOffset + 610));
  }
  const lifespan = isDust ? 2_800 : isEmber ? 2_400 : 2_100;
  const emitter = scene.add.particles(0, 0, weatherTextureKey, {
    x: { min: isDust ? -20 : 0, max: isDust ? 200 : 1280 },
    y: { min: isEmber ? 720 : -20, max: isEmber ? 760 : isDust ? 720 : 0 },
    speedX: { min: isDust ? 300 : isEmber ? 8 : -36, max: isDust ? 480 : isEmber ? 30 : -18 },
    speedY: { min: isEmber ? -330 : isDust ? -8 : 300, max: isEmber ? -220 : isDust ? 8 : 480 },
    lifespan,
    frequency: Math.max(20, Math.round(lifespan / count)),
    maxAliveParticles: count,
    reserve: count,
    scaleX: isRain ? { min: 0.18, max: 0.3 } : { min: 0.35, max: 0.8 },
    scaleY: isRain ? { min: 2.2, max: 4.2 } : { min: 0.35, max: 0.8 },
    alpha: { start: 0.3 + intensity * 0.25, end: 0 },
    tint,
    advance: animate ? lifespan : 0,
    emitting: animate,
  }).setDepth(depthOffset + 612);
  objects.push(emitter);
  return;

  if (type === "dust" || type === "sandstorm") {
    const color = type === "sandstorm" ? 0xd99d4a : 0xc6a26f;
    const overlay = scene.add.rectangle(640, 360, 1280, 720, color, 0.05 + intensity * 0.15).setDepth(depthOffset + 610);
    objects.push(overlay);
    for (let index = 0; index < count; index += 1) {
      const dust = scene.add.ellipse(random() * 1280, random() * 720, 14 + random() * 30, 2 + random() * 5, 0xf0d29a, 0.12 + intensity * 0.18).setDepth(depthOffset + 612);
      objects.push(dust);
      if (animate) tweens.push(scene.tweens.add({ targets: dust, x: 1320, duration: 1700 + random() * 1800, repeat: -1, ease: "Linear" }));
    }
    return;
  }

  const particleColor = type === "snow" ? 0xffffff : type === "embers" ? 0xff6b2c : 0xb9ddf3;
  if (type === "storm") {
    objects.push(scene.add.rectangle(640, 360, 1280, 720, 0x26384b, 0.12 + intensity * 0.12).setDepth(depthOffset + 609));
  }
  for (let index = 0; index < count; index += 1) {
    const x = random() * 1280;
    const y = random() * 720;
    const particle = type === "rain" || type === "storm"
      ? scene.add.rectangle(x, y, 2, 18 + random() * 18, particleColor, 0.22 + intensity * 0.35).setRotation(-0.16)
      : scene.add.circle(x, y, type === "embers" ? 2 + random() * 3 : 2 + random() * 4, particleColor, 0.3 + intensity * 0.35);
    particle.setDepth(depthOffset + 612);
    objects.push(particle);
    if (!animate) continue;
    const targetY = type === "embers" ? -30 : 760;
    tweens.push(scene.tweens.add({
      targets: particle,
      x: particle.x + (type === "embers" ? 25 : -45),
      y: targetY,
      duration: 1100 + random() * 1700,
      repeat: -1,
      ease: "Linear",
    }));
  }
}

export function renderBattleMap(
  scene: Scene,
  map: BattleMapConfig,
  options: MapRenderOptions = {},
): MapRenderResult {
  const depthOffset = options.depthOffset ?? 0;
  const objects: Phaser.GameObjects.GameObject[] = [];
  const tweens: Phaser.Tweens.Tween[] = [];
  if (options.showBackground !== false) {
    const background = scene.add.rectangle(640, 360, map.world.width, map.world.height, map.terrain.baseColor).setDepth(depthOffset);
    objects.push(background);
  }
  if (options.showLegacyTerrain !== false) {
    renderBaseVariation(scene, map, objects, depthOffset);
    renderGroundTexture(scene, map, objects, depthOffset);
    for (const patch of map.terrain.patches.filter((candidate) => candidate.collision === "none")) {
      renderTerrainPatch(scene, map, patch, objects, depthOffset);
    }
    for (const patch of map.terrain.patches.filter((candidate) => candidate.collision !== "none")) {
      renderTerrainPatch(scene, map, patch, objects, depthOffset);
    }
  }

  if (options.showObjects !== false) {
    map.objects.forEach((config) => objects.push(createMapPropVisual(scene, config)));
  }
  if (options.showResources) {
    map.resources.forEach((config) => objects.push(createMapPropVisual(scene, config)));
  }

  if (options.showWeather !== false) renderWeather(scene, map, options.animateWeather ?? true, objects, tweens, depthOffset);

  return {
    objects,
    tweens,
    destroy: () => {
      tweens.forEach((tween) => tween.remove());
      objects.forEach((object) => object.destroy());
    },
  };
}

export function weatherLabel(type: WeatherType) {
  const labels: Record<WeatherType, string> = {
    none: "Acik",
    mist: "Sis",
    rain: "Yagmur",
    storm: "Firtina",
    dust: "Toz",
    sandstorm: "Kum Firtinasi",
    snow: "Kar",
    embers: "Koz",
  };
  return labels[type];
}
