import fs from "node:fs";
import path from "node:path";

const outDir = path.resolve("src/game/maps");
fs.mkdirSync(outDir, { recursive: true });

const DEFAULT_MODIFIERS = {
  globalSpeedMultiplier: 1,
  archerRangeMultiplier: 1,
  horsemanSpeedMultiplier: 1,
  peasantGatherMultiplier: 1,
  mageDamageMultiplier: 1,
  shieldGuardHpMultiplier: 1,
};

const MODIFIERS = {
  grasslands: DEFAULT_MODIFIERS,
  silent_forest: { ...DEFAULT_MODIFIERS, peasantGatherMultiplier: 1.14 },
  muddy_fields: { ...DEFAULT_MODIFIERS, globalSpeedMultiplier: 0.92, peasantGatherMultiplier: 1.08 },
  storm_valley: { ...DEFAULT_MODIFIERS, archerRangeMultiplier: 0.88 },
  dry_steppe: { ...DEFAULT_MODIFIERS, globalSpeedMultiplier: 1.04, peasantGatherMultiplier: 0.92 },
  desert: { ...DEFAULT_MODIFIERS, horsemanSpeedMultiplier: 1.12, peasantGatherMultiplier: 0.82 },
  frozen_pass: { ...DEFAULT_MODIFIERS, globalSpeedMultiplier: 0.86, mageDamageMultiplier: 1.1, shieldGuardHpMultiplier: 1.12 },
  infernal_dungeon: { ...DEFAULT_MODIFIERS, globalSpeedMultiplier: 1.02, mageDamageMultiplier: 1.16 },
};

const PALETTES = {
  grasslands: { base: 0x79a95c, lane: 0xcab17c, hi: 0xe0cb9d, edge: 0x74613f },
  silent_forest: { base: 0x426b47, lane: 0xa48e66, hi: 0xc8b98e, edge: 0x31452f },
  muddy_fields: { base: 0x77744f, lane: 0xad976b, hi: 0xd0bc8a, edge: 0x514831 },
  storm_valley: { base: 0x687780, lane: 0xa99f89, hi: 0xcec5ae, edge: 0x414b53 },
  dry_steppe: { base: 0xb18a54, lane: 0xcfad72, hi: 0xe6cb92, edge: 0x715638 },
  desert: { base: 0xd2ad69, lane: 0xdfc184, hi: 0xf1dca5, edge: 0x8f6c3d },
  frozen_pass: { base: 0xdce9ed, lane: 0xb8cbd0, hi: 0xf4fbfd, edge: 0x758d97 },
  infernal_dungeon: { base: 0x332d2d, lane: 0x765648, hi: 0xa87a5c, edge: 0x191515 },
};

const MATERIAL_COLORS = {
  grass: 0x6f9f50,
  soil: 0xae895c,
  forest_floor: 0x536444,
  mud: 0x6d6244,
  dry_soil: 0x9f7448,
  sand: 0xd8b66f,
  snow: 0xeaf3f5,
  stone: 0x727b7b,
  ash: 0x4a4140,
  water: 0x5799b5,
  lava: 0xc94724,
};

const X_POINTS = [310, 530, 750, 970];
const LANE_IDS = ["top", "middle", "bottom"];
const PLAYER_CASTLE = { x: 248, y: 560 };
const ENEMY_CASTLE = { x: 1032, y: 105 };
const PROP_MIN_X = 390;
const PROP_MAX_X = 890;

const TREE_ASSETS = {
  pine_tall: { assetKey: "map-prop-shared-pine-tree", scale: 0.34 },
  pine_dense: { assetKey: "map-prop-shared-pine-tree", scale: 0.38 },
  pine_young: { assetKey: "map-prop-shared-pine-tree", scale: 0.27 },
  pine_snow: { assetKey: "map-prop-frozen_pass-snow-pine", scale: 0.23 },
  dead_tree: { assetKey: "map-prop-muddy_fields-dead-tree", scale: 0.22 },
  burned_tree: { assetKey: "map-prop-infernal_dungeon-burned-tree", scale: 0.22 },
};

function visualFor(id, variant) {
  const treeAsset = TREE_ASSETS[id];
  return treeAsset
    ? { source: "asset", assetKey: treeAsset.assetKey }
    : { source: "procedural", id, variant };
}

function scaleFor(id, random, resource = false) {
  const treeAsset = TREE_ASSETS[id];
  if (!treeAsset) return resource ? 0.72 : Number((0.62 + random() * 0.28).toFixed(2));
  const variation = resource ? 1.04 : 0.9 + random() * 0.18;
  return Number((treeAsset.scale * variation).toFixed(2));
}

const RECIPES = [
  { id: "grasslands_01", name: "The Faded Field", biome: "grasslands", widths: [102, 116, 100], ys: [[145,132,148,160],[350,342,372,360],[580,596,570,558]], materials: ["grass","soil","dry_soil"], props: ["pine_snow","rock_cluster","pebbles","branch"], resource: "pine_snow", resourceCount: 3, hazards: [], weather: ["none",0], recommended: ["peasant","swordsman"] },
  { id: "grasslands_02", name: "First Arrows", biome: "grasslands", widths: [88,104,88], ys: [[155,172,138,162],[356,382,338,358],[568,548,590,558]], materials: ["grass","soil","dry_soil"], props: ["pine_snow","rock_cluster","pebbles","fallen_log"], resource: "pine_snow", resourceCount: 3, hazards: [[650,252,190,54,"water",0.04]], weather: ["none",0], recommended: ["swordsman","archer"] },
  { id: "silent_forest_01", name: "Silent Woodline", biome: "silent_forest", widths: [80,92,80], ys: [[150,202,128,160],[360,314,404,358],[570,520,606,560]], materials: ["forest_floor","soil","grass"], props: ["pine_snow","rock_cluster","branch","fallen_log"], resource: "pine_snow", resourceCount: 4, hazards: [[602,257,176,50,"water",-0.08]], weather: ["mist",0.25], recommended: ["peasant","archer"] },
  { id: "silent_forest_02", name: "Hoofbreak Trail", biome: "silent_forest", widths: [94,108,92], ys: [[142,126,178,158],[352,374,326,362],[584,608,548,558]], materials: ["forest_floor","soil","mud"], props: ["pine_snow","rock_cluster","branch","fallen_log"], resource: "pine_snow", resourceCount: 3, hazards: [[770,462,168,48,"water",0.1]], weather: ["mist",0.18], recommended: ["horseman","swordsman"] },
  { id: "silent_forest_03", name: "Deep Forest Clash", biome: "silent_forest", widths: [68,78,68], ys: [[152,226,248,162],[356,330,390,360],[568,492,466,558]], materials: ["forest_floor","mud","soil"], props: ["pine_dense","pine_tall","fallen_log","rock_cluster"], resource: "pine_dense", resourceCount: 5, hazards: [[522,282,148,48,"water",0.18],[802,438,144,46,"water",-0.12]], weather: ["mist",0.35], recommended: ["peasant","horseman"] },
  { id: "muddy_fields_01", name: "Mire Spear", biome: "muddy_fields", widths: [74,86,74], ys: [[148,178,142,160],[358,344,376,360],[572,542,590,560]], materials: ["mud","soil","grass"], props: ["pine_tall","reeds","fallen_log","pebbles"], resource: "pine_tall", resourceCount: 3, hazards: [[612,258,206,62,"water",-0.05],[742,472,152,58,"water",0.08]], weather: ["rain",0.35], recommended: ["long_spearman","swordsman"] },
  { id: "muddy_fields_02", name: "Worker's Bog", biome: "muddy_fields", widths: [66,78,66], ys: [[152,118,188,160],[360,394,324,360],[568,612,522,558]], materials: ["mud","forest_floor","soil"], props: ["reeds","pine_tall","branch","rock_cluster"], resource: "pine_tall", resourceCount: 5, hazards: [[475,254,146,64,"water",0.1],[690,464,220,66,"water",-0.08]], weather: ["rain",0.42], recommended: ["archer","peasant"] },
  { id: "muddy_fields_03", name: "Shield in the Mire", biome: "muddy_fields", widths: [58,68,58], ys: [[150,214,252,162],[360,332,386,360],[570,500,458,558]], materials: ["mud","soil","forest_floor"], props: ["pine_snow","branch","fallen_log","rock_cluster"], resource: "pine_snow", resourceCount: 4, hazards: [[600,286,168,58,"water",-0.14],[790,442,162,60,"water",0.12]], weather: ["rain",0.5], recommended: ["mace_guard","archer"] },
  { id: "storm_valley_01", name: "Thunder Approach", biome: "storm_valley", widths: [76,88,76], ys: [[148,116,194,160],[358,392,324,360],[574,614,520,558]], materials: ["stone","mud","soil"], props: ["rock_cluster","pebbles","pine_dense","crystal"], resource: "rock_cluster", resourceCount: 3, hazards: [[620,256,214,48,"water",0.02]], weather: ["storm",0.46], recommended: ["long_spearman","mace_guard"] },
  { id: "storm_valley_02", name: "Ranged Pressure", biome: "storm_valley", widths: [82,96,82], ys: [[154,164,142,160],[362,348,378,358],[566,582,548,560]], materials: ["stone","soil","mud"], props: ["rock_cluster","crystal","pebbles","branch"], resource: "crystal", resourceCount: 3, hazards: [[520,266,150,46,"water",-0.12],[794,454,170,48,"water",0.08]], weather: ["storm",0.55], recommended: ["horseman","archer"] },
  { id: "storm_valley_03", name: "First Flame of Magic", biome: "storm_valley", widths: [62,86,62], ys: [[150,206,238,160],[360,346,374,360],[572,510,478,558]], materials: ["stone","mud","ash"], props: ["crystal","rock_cluster","pine_dense","pebbles"], resource: "crystal", resourceCount: 3, hazards: [[600,278,154,44,"water",0.14],[812,448,136,44,"water",-0.1]], weather: ["storm",0.68], recommended: ["mage","mace_guard"] },
  { id: "dry_steppe_01", name: "Cracked Provision", biome: "dry_steppe", widths: [82,96,82], ys: [[148,190,126,160],[358,316,406,360],[574,520,598,558]], materials: ["dry_soil","soil","stone"], props: ["pine_dense","rock_cluster","pebbles","branch"], resource: "pine_dense", resourceCount: 3, hazards: [], weather: ["dust",0.25], recommended: ["horseman","long_spearman"] },
  { id: "dry_steppe_02", name: "Fast Dust", biome: "dry_steppe", widths: [98,112,96], ys: [[142,126,158,160],[354,370,346,360],[586,604,570,558]], materials: ["dry_soil","sand","soil"], props: ["pine_tall","pebbles","rock_cluster","branch"], resource: "pine_tall", resourceCount: 2, hazards: [], weather: ["dust",0.35], recommended: ["swordsman","horseman"] },
  { id: "dry_steppe_03", name: "Banner of the Last Road", biome: "dry_steppe", widths: [64,74,64], ys: [[150,220,258,160],[360,338,382,360],[570,496,452,560]], materials: ["dry_soil","stone","sand"], props: ["rock_cluster","pine_dense","fallen_log","pebbles"], resource: "rock_cluster", resourceCount: 3, hazards: [], weather: ["dust",0.45], recommended: ["knife_thrower","mace_guard"] },
  { id: "desert_01", name: "Widening Desert", biome: "desert", widths: [88,102,88], ys: [[148,120,186,160],[360,386,330,360],[572,606,530,558]], materials: ["sand","dry_soil","stone"], props: ["pine_dense","crystal","pebbles","rock_cluster"], resource: "pine_dense", resourceCount: 3, hazards: [[700,258,190,58,"water",-0.06]], weather: ["sandstorm",0.35], recommended: ["horseman","peasant"] },
  { id: "desert_02", name: "Needles in Sand", biome: "desert", widths: [66,78,66], ys: [[150,176,146,160],[360,342,382,360],[570,546,590,558]], materials: ["sand","dry_soil","ash"], props: ["pine_dense","fallen_log","rock_cluster","branch"], resource: "rock_cluster", resourceCount: 2, hazards: [[510,270,148,56,"water",0.12],[782,456,188,58,"water",-0.1]], weather: ["sandstorm",0.55], recommended: ["long_spearman","horseman"] },
  { id: "frozen_pass_01", name: "Frozen Seal", biome: "frozen_pass", widths: [78,90,78], ys: [[150,196,130,160],[358,314,406,360],[572,516,600,560]], materials: ["snow","stone","soil"], props: ["pine_tall","pine_young","rock_cluster","branch"], resource: "pine_tall", resourceCount: 3, hazards: [[620,258,194,54,"water",0.05]], weather: ["snow",0.35], recommended: ["mace_guard","mage"] },
  { id: "frozen_pass_02", name: "Long Winter Siege", biome: "frozen_pass", widths: [60,72,60], ys: [[150,182,148,160],[360,340,380,360],[570,542,592,558]], materials: ["snow","stone","ash"], props: ["dead_tree","rock_cluster","crystal","fallen_log"], resource: "crystal", resourceCount: 3, hazards: [[500,270,150,50,"water",-0.12],[790,448,202,56,"water",0.08]], weather: ["snow",0.6], recommended: ["mage","knife_thrower"] },
  { id: "infernal_dungeon_01", name: "Infernal Gate", biome: "infernal_dungeon", widths: [64,88,64], ys: [[150,208,240,160],[360,350,370,360],[570,506,476,558]], materials: ["ash","stone","dry_soil"], props: ["dead_tree","obsidian","rock_cluster","branch"], resource: "lava_vent", resourceCount: 2, hazards: [[612,280,170,48,"lava",0.14],[806,440,142,46,"lava",-0.1]], weather: ["embers",0.55], recommended: ["mage","mace_guard"] },
  { id: "ash_citadel_final", name: "Ash Citadel Final", biome: "infernal_dungeon", widths: [58,106,58], ys: [[150,204,194,160],[360,326,394,360],[570,514,524,558]], materials: ["ash","stone","dry_soil"], props: ["burned_tree","obsidian","lava_vent","rock_cluster"], resource: "lava_vent", resourceCount: 3, hazards: [[494,276,132,44,"lava",-0.08],[785,446,150,46,"lava",0.1]], weather: ["embers",0.8], recommended: ["knife_thrower","mage","horseman"] },
];

function rng(seed) {
  let value = seed >>> 0 || 1;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function distanceToSegment(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
}

function laneClear(point, radius, lanes, margin = 16) {
  return lanes.every((lane) => lane.points.slice(1).every((current, index) =>
    distanceToSegment(point, lane.points[index], current) >= lane.width / 2 + radius + margin));
}

function insideHazard(point, radius, hazard) {
  const [x, y, width, height] = hazard;
  return ((point.x - x) ** 2) / ((width / 2 + radius) ** 2) + ((point.y - y) ** 2) / ((height / 2 + radius) ** 2) < 1;
}

function placePoints(random, count, lanes, hazards, radius, existing = []) {
  const points = [];
  let attempts = 0;
  while (points.length < count && attempts < 8000) {
    attempts += 1;
    const point = {
      x: Math.round(PROP_MIN_X + radius + random() * (PROP_MAX_X - PROP_MIN_X - radius * 2)),
      y: Math.round(44 + radius + random() * (632 - radius * 2)),
    };
    const spaced = [...existing, ...points].every((candidate) => Math.hypot(candidate.x - point.x, candidate.y - point.y) >= radius + (candidate.radius ?? 18) + 8);
    const deployClear = !((Math.abs(point.x - 310) < 104 || Math.abs(point.x - 970) < 104) && point.y >= 66 && point.y <= 654);
    const castleClear = Math.hypot(point.x - PLAYER_CASTLE.x, point.y - PLAYER_CASTLE.y) >= radius + 38 && Math.hypot(point.x - ENEMY_CASTLE.x, point.y - ENEMY_CASTLE.y) >= radius + 38;
    if (laneClear(point, radius, lanes) && hazards.every((hazard) => !insideHazard(point, radius + 10, hazard)) && spaced && deployClear && castleClear) {
      points.push({ ...point, radius });
    }
  }
  if (points.length !== count) throw new Error(`Could not place ${count} points`);
  return points;
}

function laneYAtX(lane, x) {
  for (let index = 1; index < lane.points.length; index += 1) {
    if (x > lane.points[index].x) continue;
    const previous = lane.points[index - 1];
    const current = lane.points[index];
    const t = (x - previous.x) / (current.x - previous.x);
    return previous.y + (current.y - previous.y) * t;
  }
  return lane.points[lane.points.length - 1].y;
}

function normalizeHazards(lanes, hazards) {
  return hazards.map(([x, requestedY, width, requestedHeight, material, rotation]) => {
    const safeWidth = Math.min(width, 2 * Math.max(30, Math.min(x - 410, 870 - x)));
    const gapIndex = requestedY < 360 ? 0 : 1;
    const upperLane = lanes[gapIndex];
    const lowerLane = lanes[gapIndex + 1];
    const sampleXs = Array.from({ length: 9 }, (_, index) => x - safeWidth / 2 + safeWidth * index / 8);
    const upperBoundary = Math.max(...sampleXs.map((sampleX) => laneYAtX(upperLane, sampleX) + upperLane.width / 2 + 12));
    const lowerBoundary = Math.min(...sampleXs.map((sampleX) => laneYAtX(lowerLane, sampleX) - lowerLane.width / 2 - 12));
    const availableHeight = lowerBoundary - upperBoundary;
    if (availableHeight >= 24) {
      const height = Math.min(requestedHeight, Math.floor(availableHeight));
      return [x, Math.round((upperBoundary + lowerBoundary) / 2), safeWidth, height, material, 0];
    }
    const outerLane = gapIndex === 0 ? lanes[0] : lanes[2];
    const boundary = gapIndex === 0
      ? Math.min(...sampleXs.map((sampleX) => laneYAtX(outerLane, sampleX) - outerLane.width / 2 - 12))
      : Math.max(...sampleXs.map((sampleX) => laneYAtX(outerLane, sampleX) + outerLane.width / 2 + 12));
    const outerAvailable = gapIndex === 0 ? boundary - 8 : 712 - boundary;
    const height = Math.max(16, Math.min(requestedHeight, Math.floor(outerAvailable)));
    const y = gapIndex === 0 ? boundary - height / 2 : boundary + height / 2;
    return [x, y, safeWidth, height, material, 0];
  });
}

function makeTerrain(recipe, random, hazards) {
  const layouts = [
    [390, 150, 390, 220], [790, 170, 370, 216], [610, 360, 470, 246],
    [420, 570, 382, 205], [820, 555, 350, 194], [640, 88, 260, 116],
  ];
  const patches = layouts.map(([x, y, width, height], index) => {
    const material = recipe.materials[index % recipe.materials.length];
    return {
      id: `${recipe.id}_terrain_${index + 1}`,
      shape: index % 3 === 1 ? "rectangle" : "ellipse",
      x: Math.round(x + (random() - 0.5) * 58),
      y: Math.round(y + (random() - 0.5) * 38),
      width: Math.round(width + (random() - 0.5) * 54),
      height: Math.round(height + (random() - 0.5) * 34),
      color: MATERIAL_COLORS[material],
      alpha: Number((0.76 + random() * 0.16).toFixed(2)),
      rotation: Number(((random() - 0.5) * 0.24).toFixed(2)),
      depth: 3,
      material,
      collision: "none",
      variant: (index + Math.floor(random() * 3)) % 4,
    };
  });
  hazards.forEach(([x, y, width, height, material, rotation], index) => patches.push({
    id: `${recipe.id}_${material}_${index + 1}`,
    shape: "ellipse",
    x, y, width, height,
    color: MATERIAL_COLORS[material],
    alpha: material === "lava" ? 0.92 : 0.84,
    rotation,
    depth: 7,
    material,
    collision: material,
    variant: index % 3,
  }));
  return patches;
}

for (let index = 0; index < RECIPES.length; index += 1) {
  const recipe = RECIPES[index];
  const seed = 9101 + index * 7919;
  const random = rng(seed);
  const lanes = LANE_IDS.map((id, laneIndex) => ({
    id,
    width: recipe.widths[laneIndex],
    points: X_POINTS.map((x, pointIndex) => ({ x, y: recipe.ys[laneIndex][pointIndex] })),
  }));
  const hazards = normalizeHazards(lanes, recipe.hazards);
  const terrainPatches = makeTerrain(recipe, random, hazards);
  const resourceRadius = 26;
  const resourcePoints = placePoints(random, recipe.resourceCount, lanes, hazards, resourceRadius);
  const resourceType = recipe.resource === "crystal" ? "crystal" : recipe.resource === "obsidian" || recipe.resource === "rock_cluster" ? "ore" : recipe.resource === "lava_vent" ? "lava_rock" : "tree";
  const resources = resourcePoints.map((point, resourceIndex) => ({
    id: `${recipe.id}_resource_${resourceIndex + 1}`,
    type: resourceType,
    x: point.x,
    y: point.y,
    amount: Math.max(5, 10 - Math.floor(index / 5) + (resourceIndex % 2)),
    visual: visualFor(recipe.resource, (resourceIndex + index) % 3),
    scale: scaleFor(recipe.resource, random, true),
    rotation: Number(((random() - 0.5) * 0.1).toFixed(2)),
    depth: 8,
  }));

  const objectCount = 8 + (index % 2) + (recipe.biome === "silent_forest" ? 2 : 0);
  const objectPoints = placePoints(random, objectCount, lanes, hazards, 20, resourcePoints);
  const objects = objectPoints.map((point, objectIndex) => {
    const visualId = recipe.props[objectIndex % recipe.props.length];
    const obstacle = ["rock_cluster", "fallen_log", "obsidian"].includes(visualId);
    return {
      id: `${recipe.id}_object_${objectIndex + 1}`,
      kind: obstacle ? "obstacle" : "decoration",
      visual: visualFor(visualId, (objectIndex + index) % 4),
      x: point.x,
      y: point.y,
      scale: scaleFor(visualId, random),
      rotation: Number(((random() - 0.5) * 0.22).toFixed(2)),
      depth: point.y + 6,
      footprintRadius: point.radius,
      blocksDeploy: obstacle,
    };
  });

  const palette = PALETTES[recipe.biome];
  const map = {
    schemaVersion: 4,
    id: recipe.id,
    displayName: recipe.name,
    biome: recipe.biome,
    seed,
    world: { width: 1280, height: 720 },
    anchors: {
      playerCastle: { ...PLAYER_CASTLE, locked: true },
      enemyCastle: { ...ENEMY_CASTLE, locked: true },
    },
    deployZone: { x: 310, width: 156, minY: 90, maxY: 630, locked: true },
    enemySpawnZone: { x: 970, width: 156, minY: 90, maxY: 630, locked: true },
    terrain: {
      baseColor: palette.base,
      laneColor: palette.lane,
      laneHighlightColor: palette.hi,
      laneEdgeColor: palette.edge,
      patches: terrainPatches,
    },
    lanes,
    resources,
    objects,
    modifiers: MODIFIERS[recipe.biome],
    weather: { type: recipe.weather[0], intensity: recipe.weather[1] },
    recommendedUnits: recipe.recommended,
  };
  fs.writeFileSync(path.join(outDir, `${recipe.id}.json`), `${JSON.stringify(map, null, 2)}\n`);
}

console.log(`Generated ${RECIPES.length} procedural campaign maps in ${outDir}`);
