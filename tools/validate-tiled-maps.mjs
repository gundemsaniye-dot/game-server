import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  forbiddenCellsUnderTreeFootprint,
  isTreeLikeObject,
  isTreeResource,
  navigationMask,
  TREE_NAV_CLEARANCE,
} from "./lib/tiled-tree-placement.mjs";
import { tiledLevelFiles } from "./lib/tiled-level-manifest.mjs";

const root = process.cwd();
const sourceMapsRoot = path.join(root, "art", "tiled", "maps");
const legacyMapsRoot = path.join(root, "src", "game", "maps");
const mapsRoot = path.join(root, "public", "assets", "tiled", "maps");
const tilesetRoot = path.join(root, "public", "assets", "tiled", "tilesets");
const requiredLayers = ["05_BRIDGES", "NAV_BLOCKED", "GAMEPLAY_ZONES"];
const navigationMarkerGids = {
  "05_BRIDGES": new Set([577]),
  NAV_BLOCKED: new Set([578]),
};
const errors = [];
const json = async (file) => JSON.parse(await readFile(file, "utf8"));
const layerMap = (map) => new Map(map.layers.map((layer) => [layer.name, layer]));

async function files(directory, extension) {
  try { return (await readdir(directory)).filter((file) => file.endsWith(extension)).sort(); }
  catch { errors.push(`Missing directory: ${directory}`); return []; }
}

function blockedAt(blocked, bridges, column, row) {
  return Boolean(blocked.data[row * 32 + column]) && !Boolean(bridges.data[row * 32 + column]);
}

function canReach(map, from, to) {
  const layers = layerMap(map);
  const blocked = layers.get("NAV_BLOCKED");
  const bridges = layers.get("05_BRIDGES");
  const centerY = (point) => point.y ?? ((point.minY + point.maxY) / 2);
  const targetX = Math.max(0, Math.min(31, Math.floor(to.x / 40)));
  const targetY = Math.max(0, Math.min(17, Math.floor(centerY(to) / 40)));
  const starts = [];
  if (typeof from.width === "number" && typeof from.minY === "number" && typeof from.maxY === "number") {
    for (let x = from.x - from.width / 2; x <= from.x + from.width / 2; x += 40) {
      for (let y = from.minY; y <= from.maxY; y += 40) {
        const column = Math.max(0, Math.min(31, Math.floor(x / 40)));
        const row = Math.max(0, Math.min(17, Math.floor(y / 40)));
        if (!blockedAt(blocked, bridges, column, row)) starts.push([column, row]);
      }
    }
  } else {
    starts.push([
      Math.max(0, Math.min(31, Math.floor(from.x / 40))),
      Math.max(0, Math.min(17, Math.floor(centerY(from) / 40))),
    ]);
  }
  const queue = starts;
  const visited = new Set(starts.map(([x, y]) => `${x}:${y}`));
  for (let index = 0; index < queue.length; index += 1) {
    const [x, y] = queue[index];
    if (x === targetX && y === targetY) return true;
    for (const [nextX, nextY] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const key = `${nextX}:${nextY}`;
      if (nextX < 0 || nextY < 0 || nextX >= 32 || nextY >= 18 || visited.has(key) || blockedAt(blocked, bridges, nextX, nextY)) continue;
      visited.add(key);
      queue.push([nextX, nextY]);
    }
  }
  return false;
}

const sourceFiles = await files(sourceMapsRoot, ".tmj");
const legacyFiles = await files(legacyMapsRoot, ".json");
const runtimeFiles = await files(mapsRoot, ".json");
const expected = legacyFiles.map((file) => file.replace(/\.json$/, ""));
const levelFiles = await tiledLevelFiles(root);
const sourceFileByMapId = new Map(levelFiles.map(({ mapId, file }) => [mapId, file]));
if (sourceFiles.length !== expected.length) errors.push(`Expected ${expected.length} source TMJ maps, found ${sourceFiles.length}.`);
if (runtimeFiles.length !== expected.length) errors.push(`Expected ${expected.length} runtime JSON maps, found ${runtimeFiles.length}.`);

for (const mapId of expected) {
  const sourceName = sourceFileByMapId.get(mapId);
  const runtimeName = `${mapId}.json`;
  if (!sourceName || !sourceFiles.includes(sourceName)) { errors.push(`${mapId}: missing source TMJ.`); continue; }
  if (!runtimeFiles.includes(runtimeName)) { errors.push(`${mapId}: missing runtime JSON.`); continue; }
  const [source, map, legacy] = await Promise.all([
    json(path.join(sourceMapsRoot, sourceName)),
    json(path.join(mapsRoot, runtimeName)),
    json(path.join(legacyMapsRoot, runtimeName)),
  ]);
  if (!source.tilesets.some((tileset) => tileset.source)) errors.push(`${mapId}: source must retain its external TSJ reference.`);
  if (!source.layers.some((layer) => layer.name === "REFERENCE_ART_PREVIEW" && layer.type === "imagelayer")) {
    errors.push(`${mapId}: source is missing REFERENCE_ART_PREVIEW.`);
  }
  if (map.tilesets.some((tileset) => tileset.source)) errors.push(`${mapId}: runtime map contains an external TSJ source.`);
  if (map.width !== 32 || map.height !== 18 || map.tilewidth !== 40 || map.tileheight !== 40 || map.orientation !== "orthogonal" || map.infinite !== false) errors.push(`${mapId}: expected a finite 32x18 orthogonal 40px map.`);
  const layers = layerMap(map);
  requiredLayers.forEach((name) => { if (!layers.has(name)) errors.push(`${mapId}: missing ${name}.`); });
  const tileCount = (map.tilesets ?? []).reduce((total, tileset) => total + (tileset.tilecount ?? 0), 0);
  for (const layer of map.layers.filter((candidate) => candidate.type === "tilelayer")) {
    if (layer.data.length !== 576) errors.push(`${mapId}: ${layer.name} has invalid cell count.`);
    if (layer.data.some((gid) => gid < 0 || gid > tileCount)) errors.push(`${mapId}: ${layer.name} has an unknown GID.`);
  }
  Object.entries(navigationMarkerGids).forEach(([layerName, allowedGids]) => {
    const navigationLayer = layers.get(layerName);
    navigationLayer?.data.forEach((gid, index) => {
      if (gid && !allowedGids.has(gid)) errors.push(`${mapId}: ${layerName} has an invalid marker at ${index % 32},${Math.floor(index / 32)}.`);
    });
  });
  for (const tileset of map.tilesets ?? []) {
    if (!tileset.name || !tileset.image) errors.push(`${mapId}: embedded tileset metadata missing.`);
    try { await access(path.join(tilesetRoot, path.basename(tileset.image))); } catch { errors.push(`${mapId}: missing tileset image ${path.basename(tileset.image)}.`); }
  }
  for (const objectLayer of map.layers.filter((candidate) => candidate.type === "objectgroup")) {
    for (const object of objectLayer.objects ?? []) if (object.x < 0 || object.y < 0 || object.x > 1280 || object.y > 720) errors.push(`${mapId}: ${objectLayer.name} object outside map.`);
  }
  const gameplayObjects = layers.get("GAMEPLAY_ZONES")?.objects ?? [];
  const gameplayTypes = gameplayObjects.map((object) => object.type || object.class || "");
  if (gameplayObjects.length !== 4) errors.push(`${mapId}: GAMEPLAY_ZONES must contain exactly four objects.`);
  if (gameplayTypes.filter((type) => type === "CastleAnchor").length !== 2) errors.push(`${mapId}: expected two CastleAnchor objects.`);
  if (gameplayTypes.filter((type) => type === "DeployZone").length !== 1) errors.push(`${mapId}: expected one DeployZone object.`);
  if (gameplayTypes.filter((type) => type === "SpawnZone").length !== 1) errors.push(`${mapId}: expected one SpawnZone object.`);
  const blocked = layers.get("NAV_BLOCKED");
  const bridges = layers.get("05_BRIDGES");
  const treeNavigation = navigationMask(map);
  for (const objectLayer of source.layers.filter((candidate) => candidate.type === "objectgroup")) {
    for (const object of objectLayer.objects ?? []) {
      if (!isTreeLikeObject(object)) continue;
      const occupied = forbiddenCellsUnderTreeFootprint(treeNavigation, object, Math.max(TREE_NAV_CLEARANCE, Number(object.footprintRadius) || 0));
      if (occupied.length) errors.push(`${mapId}: Tiled tree '${object.name || object.id}' overlaps a bridge/NAV_BLOCKED footprint at ${occupied.map(({ column, row }) => `${column},${row}`).join(" | ")}.`);
    }
  }
  for (const resource of legacy.resources ?? []) {
    if (!isTreeResource(resource)) continue;
    const occupied = forbiddenCellsUnderTreeFootprint(treeNavigation, resource);
    if (occupied.length) errors.push(`${mapId}: resource tree '${resource.id}' overlaps a bridge/NAV_BLOCKED footprint at ${occupied.map(({ column, row }) => `${column},${row}`).join(" | ")}.`);
  }
  for (const object of legacy.objects ?? []) {
    if (!isTreeLikeObject(object)) continue;
    const clearance = Math.max(TREE_NAV_CLEARANCE, Number(object.footprintRadius) || 0);
    const occupied = forbiddenCellsUnderTreeFootprint(treeNavigation, object, clearance);
    if (occupied.length) errors.push(`${mapId}: map tree '${object.id}' overlaps a bridge/NAV_BLOCKED footprint at ${occupied.map(({ column, row }) => `${column},${row}`).join(" | ")}.`);
  }
  const deploy = legacy.deployZone;
  let deployCellCount = 0;
  let walkableDeployCellCount = 0;
  for (let x = deploy.x - deploy.width / 2; x <= deploy.x + deploy.width / 2; x += 40) {
    for (let y = deploy.minY; y <= deploy.maxY; y += 40) {
      deployCellCount += 1;
      if (!blockedAt(blocked, bridges, Math.floor(x / 40), Math.floor(y / 40))) walkableDeployCellCount += 1;
    }
  }
  // Water/cliffs may legitimately cut holes out of the tall deployment stripe.
  // Runtime placement already rejects blocksDeploy cells; require usable land
  // instead of forcing every sampled cell in the stripe to be walkable.
  if (deployCellCount === 0 || walkableDeployCellCount === 0) errors.push(`${mapId}: player deploy has no walkable cell.`);
  if (!canReach(map, legacy.deployZone, legacy.enemySpawnZone)) errors.push(`${mapId}: player cannot reach enemy spawn.`);
  legacy.resources.forEach((resource) => { if (!canReach(map, legacy.deployZone, resource)) errors.push(`${mapId}: resource ${resource.id} is unreachable.`); });
}

if (errors.length) {
  console.error(errors.map((error) => `Tiled validation: ${error}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Tiled validation passed for ${expected.length} source/runtime maps.`);
}
