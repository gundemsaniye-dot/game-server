import { MAP_ASSETS_BY_KEY, PROCEDURAL_VISUALS_BY_ID } from "./mapAssets";
import {
  BATTLE_MAP_SCHEMA_VERSION,
  type BattleMapConfig,
  type CampaignMapBundle,
  type MapPoint,
  type SingleMapExport,
} from "../types/MapTypes";

const DRAFT_STORAGE_KEY = "castle_raid_2_map_drafts_v1";
const PUBLISHED_STORAGE_KEY = "castle_raid_2_published_maps_v1";
const MAP_CONTENT_VERSION_KEY = "castle_raid_2_map_content_version";
const MAP_CONTENT_VERSION = "v5-biome-compatible-visuals";
const FORTRESS_PROP_MIN_X = 390;
const FORTRESS_PROP_MAX_X = 890;

const shippedModules = import.meta.glob("../maps/*.json", {
  eager: true,
  import: "default",
}) as Record<string, BattleMapConfig>;

export const BATTLE_MAPS: Record<string, BattleMapConfig> = Object.fromEntries(
  Object.values(shippedModules).map((map) => [map.id, map]),
) as Record<string, BattleMapConfig>;

export interface MapValidationResult {
  valid: boolean;
  errors: string[];
}

function getStorage() {
  try {
    return typeof window !== "undefined" ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}

function migrateMapContent() {
  const storage = getStorage();
  if (!storage || storage.getItem(MAP_CONTENT_VERSION_KEY) === MAP_CONTENT_VERSION) return;
  storage.removeItem(DRAFT_STORAGE_KEY);
  storage.removeItem(PUBLISHED_STORAGE_KEY);
  storage.setItem(MAP_CONTENT_VERSION_KEY, MAP_CONTENT_VERSION);
}

function cloneMap(map: BattleMapConfig): BattleMapConfig {
  return JSON.parse(JSON.stringify(map)) as BattleMapConfig;
}

function readStoredMaps(storageKey: string): Record<string, BattleMapConfig> {
  const storage = getStorage();
  if (!storage) return {};
  try {
    const parsed = JSON.parse(storage.getItem(storageKey) ?? "{}") as Record<string, BattleMapConfig>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStoredMaps(storageKey: string, maps: Record<string, BattleMapConfig>) {
  getStorage()?.setItem(storageKey, JSON.stringify(maps));
}

function distanceToSegment(point: MapPoint, start: MapPoint, end: MapPoint) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
}

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function visualIsKnown(visual: BattleMapConfig["objects"][number]["visual"]) {
  return visual?.source === "procedural"
    ? Boolean(PROCEDURAL_VISUALS_BY_ID[visual.id]) && Number.isInteger(visual.variant)
    : visual?.source === "asset"
      ? Boolean(MAP_ASSETS_BY_KEY[visual.assetKey])
      : false;
}

function pointInsidePatch(point: MapPoint, patch: BattleMapConfig["terrain"]["patches"][number], clearance = 0) {
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

function patchOverlapsZone(patch: BattleMapConfig["terrain"]["patches"][number], zone: BattleMapConfig["deployZone"]) {
  const minX = zone.x - zone.width / 2;
  const maxX = zone.x + zone.width / 2;
  for (let x = minX; x <= maxX; x += 24) {
    for (let y = zone.minY; y <= zone.maxY; y += 28) {
      if (pointInsidePatch({ x, y }, patch, 14)) return true;
    }
  }
  return false;
}

function walkability(map: BattleMapConfig) {
  const step = 24;
  const minX = map.deployZone.x;
  const maxX = map.enemySpawnZone.x;
  const minY = 78;
  const maxY = 642;
  const columns = Math.floor((maxX - minX) / step) + 1;
  const rows = Math.floor((maxY - minY) / step) + 1;
  const blocked = (column: number, row: number) => {
    const point = { x: minX + column * step, y: minY + row * step };
    return map.terrain.patches.some((patch) => patch.collision !== "none" && pointInsidePatch(point, patch, 14));
  };
  const queue: Array<[number, number]> = [];
  const visited = new Set<string>();
  for (let row = 0; row < rows; row += 1) {
    if (!blocked(0, row)) {
      queue.push([0, row]);
      visited.add(`0:${row}`);
    }
  }
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
  const reachesEnemy = [...visited].some((key) => Number(key.split(":")[0]) === columns - 1);
  const resourceReachable = (resource: MapPoint) => {
    const column = Math.max(0, Math.min(columns - 1, Math.round((resource.x - minX) / step)));
    const row = Math.max(0, Math.min(rows - 1, Math.round((resource.y - minY) / step)));
    return [...visited].some((key) => {
      const [visitedColumn, visitedRow] = key.split(":").map(Number);
      return Math.abs(visitedColumn - column) <= 1 && Math.abs(visitedRow - row) <= 1;
    });
  };
  return { reachesEnemy, resourceReachable };
}

export function validateBattleMap(map: BattleMapConfig): MapValidationResult {
  const errors: string[] = [];
  const fail = (message: string) => errors.push(message);

  if (!map || typeof map !== "object") {
    return { valid: false, errors: ["Map data not found."] };
  }
  if (map.schemaVersion !== BATTLE_MAP_SCHEMA_VERSION) fail("Unsupported map schema version.");
  if (!BATTLE_MAPS[map.id]) fail(`Unknown map id: ${map.id}`);
  if (map.world?.width !== 1280 || map.world?.height !== 720) fail("Map size must be 1280x720.");
  if (map.anchors?.playerCastle?.x !== 248 || map.anchors.playerCastle.y !== 560) fail("Player castle must remain at the locked v12 position.");
  if (map.anchors?.enemyCastle?.x !== 1032 || map.anchors.enemyCastle.y !== 105) fail("Enemy castle must remain at the locked v12 position.");
  if (!Array.isArray(map.lanes) || map.lanes.length !== 3) fail("Map must contain exactly 3 lanes.");

  const ids = new Set<string>();
  const registerId = (id: string, kind: string) => {
    if (!id) fail(`${kind} id is missing.`);
    if (ids.has(id)) fail(`Duplicate object id: ${id}`);
    ids.add(id);
  };

  for (const lane of map.lanes ?? []) {
    registerId(lane.id, "Lane");
    if (!finite(lane.width) || lane.width < 40 || lane.width > 160) fail(`${lane.id} has an invalid lane width.`);
    if (!Array.isArray(lane.points) || lane.points.length !== 4) {
      fail(`${lane.id} must contain 4 control points.`);
      continue;
    }
    lane.points.forEach((point, index) => {
      if (!finite(point.x) || !finite(point.y)) fail(`${lane.id} point ${index} is invalid.`);
      if (index > 0 && point.x <= lane.points[index - 1].x) fail(`${lane.id} X coordinates must increase.`);
    });
  }

  if ((map.objects?.length ?? 0) > 160) fail("A map may contain no more than 160 objects.");
  for (const object of map.objects ?? []) {
    registerId(object.id, "Object");
    if (!visualIsKnown(object.visual)) fail(`${object.id} uses an unknown visual.`);
    if (![object.x, object.y, object.scale, object.rotation, object.depth, object.footprintRadius].every(finite)) fail(`${object.id} has invalid numeric values.`);
    if (object.x - object.footprintRadius < FORTRESS_PROP_MIN_X || object.x + object.footprintRadius > FORTRESS_PROP_MAX_X) {
      fail(`${object.id} enters the protected area behind the castle.`);
    }
    const assetCollision = object.visual?.source === "asset" ? MAP_ASSETS_BY_KEY[object.visual.assetKey]?.collision : "none";
    if (object.kind !== "obstacle" && assetCollision === "none") continue;
    for (const lane of map.lanes ?? []) {
      for (let index = 1; index < lane.points.length; index += 1) {
        if (distanceToSegment(object, lane.points[index - 1], lane.points[index]) < lane.width / 2 + object.footprintRadius + 16) {
          fail(`${object.id} enters the safe corridor of ${lane.id}.`);
        }
      }
    }
    const playerHalfWidth = map.deployZone.width / 2 + 24;
    if (Math.abs(object.x - map.deployZone.x) < playerHalfWidth && object.y >= map.deployZone.minY - 24 && object.y <= map.deployZone.maxY + 24) fail(`${object.id} player deploy alanina giriyor.`);
    const enemyHalfWidth = map.enemySpawnZone.width / 2 + 24;
    if (Math.abs(object.x - map.enemySpawnZone.x) < enemyHalfWidth && object.y >= map.enemySpawnZone.minY - 24 && object.y <= map.enemySpawnZone.maxY + 24) fail(`${object.id} enemy spawn alanina giriyor.`);
    for (const [name, anchor] of Object.entries(map.anchors ?? {})) {
      if (Math.hypot(object.x - anchor.x, object.y - anchor.y) < object.footprintRadius + 32) fail(`${object.id} is too close to the ${name} anchor.`);
    }
  }

  for (const resource of map.resources ?? []) {
    registerId(resource.id, "Resource");
    if (!visualIsKnown(resource.visual)) fail(`${resource.id} uses an unknown visual.`);
    if (!finite(resource.amount) || resource.amount < 1 || resource.amount > 99) fail(`${resource.id} amount must be 1-99.`);
    if (![resource.x, resource.y, resource.scale, resource.rotation, resource.depth].every(finite)) fail(`${resource.id} has invalid numeric values.`);
    if (resource.x < FORTRESS_PROP_MIN_X || resource.x > FORTRESS_PROP_MAX_X) fail(`${resource.id} enters the protected area behind the castle.`);
  }

  for (const patch of map.terrain?.patches ?? []) {
    registerId(patch.id, "Terrain patch");
    if (![patch.x, patch.y, patch.width, patch.height, patch.color, patch.alpha, patch.rotation, patch.depth].every(finite)) fail(`${patch.id} has invalid values.`);
    if (!Number.isInteger(patch.variant) || patch.variant < 0) fail(`${patch.id} has an invalid variant.`);
    const expectedCollision = patch.material === "water" ? "water" : patch.material === "lava" ? "lava" : "none";
    if (patch.collision !== expectedCollision) fail(`${patch.id} material and collision do not match.`);
    if (patch.collision !== "none") {
      if (patchOverlapsZone(patch, map.deployZone)) fail(`${patch.id} player deploy alanina giriyor.`);
      if (patchOverlapsZone(patch, map.enemySpawnZone)) fail(`${patch.id} enemy spawn alanina giriyor.`);
      for (const [name, anchor] of Object.entries(map.anchors ?? {})) {
        if (pointInsidePatch(anchor, patch, 48)) fail(`${patch.id} is too close to the ${name} anchor.`);
      }
      for (const lane of map.lanes ?? []) {
        for (let index = 1; index < lane.points.length; index += 1) {
          for (let sample = 0; sample <= 12; sample += 1) {
            const t = sample / 12;
            const point = {
              x: lane.points[index - 1].x + (lane.points[index].x - lane.points[index - 1].x) * t,
              y: lane.points[index - 1].y + (lane.points[index].y - lane.points[index - 1].y) * t,
            };
            if (pointInsidePatch(point, patch, lane.width / 2 + 10)) fail(`${patch.id} enters the safe corridor of ${lane.id}.`);
          }
        }
      }
      for (const resource of map.resources ?? []) {
        if (pointInsidePatch(resource, patch, 24)) fail(`${resource.id} is inside or too close to ${patch.id}.`);
      }
    }
  }

  const routes = walkability(map);
  if (!routes.reachesEnemy) fail("Water/lava areas completely block the battlefield.");
  for (const resource of map.resources ?? []) {
    if (!routes.resourceReachable(resource)) fail(`${resource.id} cannot be reached by a worker.`);
  }

  return { valid: errors.length === 0, errors };
}

export function getShippedBattleMap(mapId: string) {
  const map = BATTLE_MAPS[mapId];
  if (!map) throw new Error(`Unknown map: ${mapId}`);
  return cloneMap(map);
}

export function getPublishedBattleMap(mapId: string) {
  migrateMapContent();
  const map = readStoredMaps(PUBLISHED_STORAGE_KEY)[mapId];
  return map && validateBattleMap(map).valid ? cloneMap(map) : undefined;
}

export function getBattleMapConfig(mapId: string) {
  return getPublishedBattleMap(mapId) ?? getShippedBattleMap(mapId);
}

export function getDraftBattleMap(mapId: string) {
  migrateMapContent();
  const map = readStoredMaps(DRAFT_STORAGE_KEY)[mapId];
  const visualsAreKnown = map?.objects?.every((object) => visualIsKnown(object.visual)) &&
    map?.resources?.every((resource) => visualIsKnown(resource.visual));
  if (!map || map.id !== mapId || map.schemaVersion !== BATTLE_MAP_SCHEMA_VERSION || !visualsAreKnown) return undefined;
  const normalized = cloneMap(map);
  // Castle/deploy anchors are editor-locked. Normalize older local drafts so a
  // previous visual experiment cannot move gameplay away from the v12 layout.
  const shipped = BATTLE_MAPS[mapId];
  normalized.anchors = cloneMap(shipped).anchors;
  normalized.deployZone = { ...shipped.deployZone };
  normalized.enemySpawnZone = { ...shipped.enemySpawnZone };
  return normalized;
}

export function getEditableBattleMap(mapId: string) {
  migrateMapContent();
  return getDraftBattleMap(mapId) ?? getPublishedBattleMap(mapId) ?? getShippedBattleMap(mapId);
}

export function saveDraftBattleMap(map: BattleMapConfig) {
  const maps = readStoredMaps(DRAFT_STORAGE_KEY);
  maps[map.id] = cloneMap(map);
  writeStoredMaps(DRAFT_STORAGE_KEY, maps);
}

export function publishBattleMap(map: BattleMapConfig) {
  const validation = validateBattleMap(map);
  if (!validation.valid) return validation;
  const maps = readStoredMaps(PUBLISHED_STORAGE_KEY);
  maps[map.id] = cloneMap(map);
  writeStoredMaps(PUBLISHED_STORAGE_KEY, maps);
  saveDraftBattleMap(map);
  return validation;
}

export function resetDraftBattleMap(mapId: string) {
  const maps = readStoredMaps(DRAFT_STORAGE_KEY);
  delete maps[mapId];
  writeStoredMaps(DRAFT_STORAGE_KEY, maps);
  return getPublishedBattleMap(mapId) ?? getShippedBattleMap(mapId);
}

export function createSingleMapExport(map: BattleMapConfig): SingleMapExport {
  return { kind: "castle-raid-map", schemaVersion: BATTLE_MAP_SCHEMA_VERSION, map: cloneMap(map) };
}

export function createCampaignMapBundle(): CampaignMapBundle {
  return {
    kind: "castle-raid-map-bundle",
    schemaVersion: BATTLE_MAP_SCHEMA_VERSION,
    maps: Object.keys(BATTLE_MAPS).sort().map((mapId) => getEditableBattleMap(mapId)),
  };
}

export function parseMapImport(text: string): { maps: BattleMapConfig[]; errors: string[] } {
  try {
    const parsed = JSON.parse(text) as SingleMapExport | CampaignMapBundle | BattleMapConfig;
    if (!parsed || typeof parsed !== "object") {
      return { maps: [], errors: ["Import dosyasi map icermiyor."] };
    }
    const maps = "kind" in parsed
      ? parsed.kind === "castle-raid-map"
        ? [parsed.map]
        : parsed.kind === "castle-raid-map-bundle"
          ? parsed.maps
          : []
      : [parsed];
    if (maps.length === 0) return { maps: [], errors: ["Import dosyasi map icermiyor."] };
    const errors = maps.flatMap((map) => validateBattleMap(map).errors.map((error) => `${map.id ?? "unknown"}: ${error}`));
    return errors.length > 0 ? { maps: [], errors } : { maps: maps.map(cloneMap), errors: [] };
  } catch {
    return { maps: [], errors: ["JSON okunamadi."] };
  }
}
