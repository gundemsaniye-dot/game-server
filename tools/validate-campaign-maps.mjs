import fs from "node:fs";
import path from "node:path";
import { treeVisualsOverlap } from "./lib/tiled-tree-placement.mjs";

const mapsDir = path.resolve("src/game/maps");
const files = fs.readdirSync(mapsDir).filter((file) => file.endsWith(".json")).sort();
const tiledMapsDir = path.resolve("art/tiled/maps");
const campaignOrderByMapId = new Map(
  fs.readdirSync(tiledMapsDir)
    .filter((file) => file.endsWith(".tmj"))
    .map((file) => JSON.parse(fs.readFileSync(path.join(tiledMapsDir, file), "utf8")))
    .map((map) => {
      const properties = Object.fromEntries((map.properties ?? []).map((entry) => [entry.name, entry.value]));
      return [properties.mapId, Number(properties.campaignIndex)];
    }),
);
const knownBiomes = new Set(["grasslands", "silent_forest", "muddy_fields", "storm_valley", "dry_steppe", "desert", "frozen_pass", "infernal_dungeon"]);
const knownWeather = new Set(["none", "mist", "rain", "storm", "dust", "sandstorm", "snow", "embers"]);
const knownMaterials = new Set(["grass", "soil", "forest_floor", "mud", "dry_soil", "sand", "snow", "stone", "ash", "water", "lava"]);
const knownProcedural = new Set(["pine_tall", "pine_dense", "pine_young", "pine_snow", "broadleaf_tree", "dead_tree", "burned_tree", "rock_cluster", "pebbles", "branch", "fallen_log", "reeds", "cactus", "crystal", "obsidian", "lava_vent"]);
const knownAssets = new Set([
  "map-prop-shared-pine-tree",
  "map-prop-frozen_pass-snow-pine",
  "map-prop-muddy_fields-dead-tree",
  "map-prop-infernal_dungeon-burned-tree",
]);
const ids = new Set();
const laneSignatures = new Set();
const errors = [];
const FORTRESS_PROP_MIN_X = 390;
const FORTRESS_PROP_MAX_X = 890;
const expectedResourceStyle = (order) => {
  if (order <= 4 || order === 8) return { assetKey: "map-prop-frozen_pass-snow-pine", scale: 0.17 };
  if (order === 10 || order === 18 || order === 19) return { assetKey: "map-prop-muddy_fields-dead-tree", scale: 0.15 };
  if (order === 20) return { assetKey: "map-prop-infernal_dungeon-burned-tree", scale: 0.155 };
  return { assetKey: "map-prop-shared-pine-tree", scale: 0.28 };
};
const expectedResourceCount = (order) => order <= 4 ? 5 : order <= 12 ? 4 : 3;

function hasKnownVisual(visual) {
  return visual?.source === "procedural"
    ? knownProcedural.has(visual.id)
    : visual?.source === "asset" && knownAssets.has(visual.assetKey);
}

function distanceToSegment(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
}

function pointInsidePatch(point, patch, clearance = 0) {
  const dx = point.x - patch.x;
  const dy = point.y - patch.y;
  const cos = Math.cos(-patch.rotation);
  const sin = Math.sin(-patch.rotation);
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;
  const halfWidth = patch.width / 2 + clearance;
  const halfHeight = patch.height / 2 + clearance;
  if (patch.shape === "rectangle") return Math.abs(localX) <= halfWidth && Math.abs(localY) <= halfHeight;
  return (localX * localX) / (halfWidth * halfWidth) + (localY * localY) / (halfHeight * halfHeight) <= 1;
}

function patchOverlapsZone(patch, zone) {
  for (let x = zone.x - zone.width / 2; x <= zone.x + zone.width / 2; x += 24) {
    for (let y = zone.minY; y <= zone.maxY; y += 28) if (pointInsidePatch({ x, y }, patch, 14)) return true;
  }
  return false;
}

function walkability(map) {
  const step = 24;
  const minX = map.deployZone.x;
  const maxX = map.enemySpawnZone.x;
  const minY = 78;
  const maxY = 642;
  const columns = Math.floor((maxX - minX) / step) + 1;
  const rows = Math.floor((maxY - minY) / step) + 1;
  const blocked = (column, row) => map.terrain.patches.some((patch) => patch.collision !== "none" && pointInsidePatch({ x: minX + column * step, y: minY + row * step }, patch, 14));
  const queue = [];
  const visited = new Set();
  for (let row = 0; row < rows; row += 1) if (!blocked(0, row)) { queue.push([0, row]); visited.add(`0:${row}`); }
  for (let index = 0; index < queue.length; index += 1) {
    const [column, row] = queue[index];
    for (const [nextColumn, nextRow] of [[column + 1, row], [column - 1, row], [column, row + 1], [column, row - 1]]) {
      if (nextColumn < 0 || nextRow < 0 || nextColumn >= columns || nextRow >= rows) continue;
      const key = `${nextColumn}:${nextRow}`;
      if (visited.has(key) || blocked(nextColumn, nextRow)) continue;
      visited.add(key);
      queue.push([nextColumn, nextRow]);
    }
  }
  return { visited, columns, rows, minX, minY, step };
}

for (const file of files) {
  const map = JSON.parse(fs.readFileSync(path.join(mapsDir, file), "utf8"));
  const fail = (message) => errors.push(`${file}: ${message}`);
  if (map.schemaVersion !== 4) fail("schemaVersion must be 4");
  if (ids.has(map.id)) fail(`duplicate id ${map.id}`);
  ids.add(map.id);
  if (`${map.id}.json` !== file) fail("filename must match map id");
  if (!knownBiomes.has(map.biome)) fail(`unknown biome ${map.biome}`);
  const campaignOrder = campaignOrderByMapId.get(map.id);
  if (!campaignOrder) fail("missing campaignIndex in matching Tiled map");
  if ((map.resources?.length ?? 0) !== expectedResourceCount(campaignOrder ?? 1)) {
    fail(`resource count must be ${expectedResourceCount(campaignOrder ?? 1)} for campaign level ${campaignOrder}`);
  }
  if (map.modifiers?.peasantGatherMultiplier < 0.9 || map.modifiers?.peasantGatherMultiplier > 1.1) {
    fail("peasantGatherMultiplier must stay within 0.90-1.10");
  }
  if (!knownWeather.has(map.weather?.type)) fail(`unknown weather ${map.weather?.type}`);
  if (map.world?.width !== 1280 || map.world?.height !== 720) fail("world must be 1280x720");
  if (map.anchors?.playerCastle?.x !== 248 || map.anchors.playerCastle.y !== 560) fail("player castle must use the locked v12 anchor");
  if (map.anchors?.enemyCastle?.x !== 1032 || map.anchors.enemyCastle.y !== 105) fail("enemy castle must use the locked v12 anchor");
  if (!Array.isArray(map.lanes) || map.lanes.length !== 3) fail("exactly three lanes are required");
  const laneSignature = JSON.stringify(map.lanes?.map((lane) => [lane.width, ...lane.points.map((point) => point.y)]));
  if (laneSignatures.has(laneSignature)) fail("lane composition duplicates another level");
  laneSignatures.add(laneSignature);
  for (const lane of map.lanes ?? []) {
    if (!Array.isArray(lane.points) || lane.points.length !== 4) fail(`${lane.id} must have four points`);
    for (let index = 1; index < (lane.points?.length ?? 0); index += 1) {
      if (lane.points[index].x <= lane.points[index - 1].x) fail(`${lane.id} x values must increase`);
    }
  }
  for (const object of map.objects ?? []) {
    if (!hasKnownVisual(object.visual)) fail(`${object.id} must use a known map visual`);
    if (object.x - object.footprintRadius < FORTRESS_PROP_MIN_X || object.x + object.footprintRadius > FORTRESS_PROP_MAX_X) {
      fail(`${object.id} enters a fortress backdrop clear zone`);
    }
    if (object.kind !== "obstacle") continue;
    for (const lane of map.lanes ?? []) {
      for (let index = 1; index < lane.points.length; index += 1) {
        const distance = distanceToSegment(object, lane.points[index - 1], lane.points[index]);
        if (distance < lane.width / 2 + object.footprintRadius + 16) fail(`${object.id} overlaps ${lane.id} safe corridor`);
      }
    }
    const halfDeploy = map.deployZone.width / 2 + 24;
    if (Math.abs(object.x - map.deployZone.x) < halfDeploy && object.y >= map.deployZone.minY - 24 && object.y <= map.deployZone.maxY + 24) fail(`${object.id} overlaps player deploy zone`);
    const halfEnemy = map.enemySpawnZone.width / 2 + 24;
    if (Math.abs(object.x - map.enemySpawnZone.x) < halfEnemy && object.y >= map.enemySpawnZone.minY - 24 && object.y <= map.enemySpawnZone.maxY + 24) fail(`${object.id} overlaps enemy spawn zone`);
    for (const [name, anchor] of Object.entries(map.anchors ?? {})) {
      if (Math.hypot(object.x - anchor.x, object.y - anchor.y) < object.footprintRadius + 32) fail(`${object.id} overlaps ${name}`);
    }
  }
  for (const resource of map.resources ?? []) {
    if (!hasKnownVisual(resource.visual)) fail(`${resource.id} must use a known map visual`);
    if (resource.type !== "tree") fail(`${resource.id} must be a biome tree resource`);
    if (resource.amount !== 12) fail(`${resource.id} must contain exactly 12 wood`);
    const expectedStyle = expectedResourceStyle(campaignOrder ?? 1);
    if (resource.visual?.source !== "asset" || resource.visual.assetKey !== expectedStyle.assetKey) {
      fail(`${resource.id} does not match the actual level ${campaignOrder} reference art`);
    }
    if (Math.abs(resource.scale - expectedStyle.scale) > 0.0001) {
      fail(`${resource.id} scale must match normal decorative trees (${expectedStyle.scale})`);
    }
    if (resource.x < FORTRESS_PROP_MIN_X || resource.x > FORTRESS_PROP_MAX_X) {
      fail(`${resource.id} enters a fortress backdrop clear zone`);
    }
    if (resource.type === "tree") {
      for (const other of map.resources ?? []) {
        if (resource.id >= other.id || other.type !== "tree") continue;
        if (treeVisualsOverlap(resource, other, 12)) {
          fail(`${resource.id} visually overlaps resource tree ${other.id}`);
        }
      }
      for (const object of map.objects ?? []) {
        const identity = object.visual?.source === "asset" ? object.visual.assetKey : object.visual?.id;
        if (!/(?:tree|pine|oak|broadleaf)/.test(String(identity ?? ""))) continue;
        if (treeVisualsOverlap(resource, object, 12)) {
          fail(`${resource.id} visually overlaps decorative tree ${object.id}`);
        }
      }
    }
  }
  const materials = new Set((map.terrain?.patches ?? []).map((patch) => patch.material));
  if (materials.size < 2) fail("at least two terrain materials are required");
  for (const patch of map.terrain?.patches ?? []) {
    if (!knownMaterials.has(patch.material)) fail(`${patch.id} has unknown material ${patch.material}`);
    const expectedCollision = patch.material === "water" ? "water" : patch.material === "lava" ? "lava" : "none";
    if (patch.collision !== expectedCollision) fail(`${patch.id} material/collision mismatch`);
    if (!Number.isInteger(patch.variant) || patch.variant < 0) fail(`${patch.id} has invalid variant`);
    if (patch.collision === "none") continue;
    if (patchOverlapsZone(patch, map.deployZone)) fail(`${patch.id} overlaps player deploy zone`);
    if (patchOverlapsZone(patch, map.enemySpawnZone)) fail(`${patch.id} overlaps enemy spawn zone`);
    for (const [name, anchor] of Object.entries(map.anchors ?? {})) if (pointInsidePatch(anchor, patch, 48)) fail(`${patch.id} overlaps ${name}`);
    for (const lane of map.lanes ?? []) {
      for (let segment = 1; segment < lane.points.length; segment += 1) {
        for (let sample = 0; sample <= 12; sample += 1) {
          const t = sample / 12;
          const point = {
            x: lane.points[segment - 1].x + (lane.points[segment].x - lane.points[segment - 1].x) * t,
            y: lane.points[segment - 1].y + (lane.points[segment].y - lane.points[segment - 1].y) * t,
          };
          if (pointInsidePatch(point, patch, lane.width / 2 + 10)) fail(`${patch.id} overlaps ${lane.id} safe corridor`);
        }
      }
    }
    for (const resource of map.resources ?? []) if (pointInsidePatch(resource, patch, 24)) fail(`${resource.id} is inside ${patch.id}`);
  }
  const routes = walkability(map);
  if (![...routes.visited].some((key) => Number(key.split(":")[0]) === routes.columns - 1)) fail("water/lava blocks the whole battlefield");
  for (const resource of map.resources ?? []) {
    const column = Math.max(0, Math.min(routes.columns - 1, Math.round((resource.x - routes.minX) / routes.step)));
    const row = Math.max(0, Math.min(routes.rows - 1, Math.round((resource.y - routes.minY) / routes.step)));
    const reachable = [...routes.visited].some((key) => {
      const [visitedColumn, visitedRow] = key.split(":").map(Number);
      return Math.abs(visitedColumn - column) <= 1 && Math.abs(visitedRow - row) <= 1;
    });
    if (!reachable) fail(`${resource.id} is unreachable`);
  }
}

if (files.length !== 20) errors.push(`expected 20 maps, found ${files.length}`);

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Validated ${files.length} campaign maps without errors.`);
}
