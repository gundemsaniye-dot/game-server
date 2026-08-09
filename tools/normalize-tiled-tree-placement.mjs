import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  forbiddenCellsUnderTreeFootprint,
  findNearestTreeSafePosition,
  isTreeLikeObject,
  isTreeResource,
  navigationMask,
  TREE_NAV_CLEARANCE,
  treeVisualsOverlap,
} from "./lib/tiled-tree-placement.mjs";

const root = process.cwd();
const mapsRoot = path.join(root, "art", "tiled", "maps");
const legacyMapsRoot = path.join(root, "src", "game", "maps");
const checkOnly = process.argv.includes("--check");
const FORTRESS_PROP_MIN_X = 390;
const FORTRESS_PROP_MAX_X = 890;
const TREE_TO_TREE_GAP = 12;
let changed = 0;
const violations = [];

const json = async (file) => JSON.parse(await readFile(file, "utf8"));
const describeCells = (cells) => cells.map(({ column, row }) => `${column},${row}`).join(" | ");

const clearanceFor = (point) => Math.max(TREE_NAV_CLEARANCE, Number(point.footprintRadius) || 0);

function pointInsidePatch(point, patch, clearance) {
  const dx = point.x - patch.x;
  const dy = point.y - patch.y;
  const cos = Math.cos(-(patch.rotation ?? 0));
  const sin = Math.sin(-(patch.rotation ?? 0));
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;
  const halfWidth = patch.width / 2 + clearance;
  const halfHeight = patch.height / 2 + clearance;
  if (patch.shape === "rectangle") return Math.abs(localX) <= halfWidth && Math.abs(localY) <= halfHeight;
  return (localX * localX) / (halfWidth * halfWidth) + (localY * localY) / (halfHeight * halfHeight) <= 1;
}

function acceptsLegacyTreePosition(legacy, point, kind) {
  const clearance = clearanceFor(point);
  const insideFortressBounds = kind === "resource"
    ? point.x >= FORTRESS_PROP_MIN_X && point.x <= FORTRESS_PROP_MAX_X
    : point.x - clearance >= FORTRESS_PROP_MIN_X && point.x + clearance <= FORTRESS_PROP_MAX_X;
  if (!insideFortressBounds) return false;
  return !(legacy.terrain?.patches ?? []).some((patch) =>
    patch.collision !== "none" && pointInsidePatch(point, patch, clearance),
  );
}

function clearsPlacedTrees(point, placedTrees) {
  return placedTrees.every((placed) => !treeVisualsOverlap(point, placed, TREE_TO_TREE_GAP));
}

function normalizePoint(mask, point, label, accepts = () => true) {
  const clearance = clearanceFor(point);
  const blockedCells = forbiddenCellsUnderTreeFootprint(mask, point, clearance);
  if (!blockedCells.length && accepts(point)) return undefined;
  const replacement = findNearestTreeSafePosition(mask, point, clearance, accepts);
  if (!replacement) {
    violations.push(`${label}: no safe position found (blocked: ${describeCells(blockedCells)}).`);
    return undefined;
  }
  return replacement;
}

for (const file of (await readdir(mapsRoot)).filter((entry) => entry.endsWith(".tmj")).sort()) {
  const mapPath = path.join(mapsRoot, file);
  const map = await json(mapPath);
  const mapId = map.properties?.find((property) => property.name === "mapId")?.value;
  if (typeof mapId !== "string" || !mapId) throw new Error(`${file}: missing mapId property.`);
  const legacyPath = path.join(legacyMapsRoot, `${mapId}.json`);
  const legacy = await json(legacyPath);
  const mask = navigationMask(map);
  let mapChanged = false;
  let legacyChanged = false;
  const fixedVisualTrees = [];
  const placedResourceTrees = [];

  for (const layer of map.layers.filter((candidate) => candidate.type === "objectgroup")) {
    for (const object of layer.objects ?? []) {
      if (!isTreeLikeObject(object)) continue;
      const replacement = normalizePoint(mask, object, `${file}:${layer.name}/${object.name || object.id}`);
      if (replacement) {
        if (checkOnly) {
          violations.push(`${file}:${layer.name}/${object.name || object.id} overlaps a bridge/NAV_BLOCKED footprint and must move to ${replacement.x},${replacement.y}.`);
        } else {
          object.x = replacement.x;
          object.y = replacement.y;
          mapChanged = true;
          changed += 1;
          console.log(`${file}: moved Tiled tree '${object.name || object.id}' to ${replacement.x},${replacement.y}.`);
        }
      }
      const finalPoint = replacement ?? object;
      fixedVisualTrees.push({
        x: finalPoint.x,
        y: finalPoint.y,
        scale: 0.85,
        visual: { source: "procedural", id: "broadleaf_tree", variant: 0 },
      });
    }
  }

  for (const resource of legacy.resources ?? []) {
    if (!isTreeResource(resource)) continue;
    const accepts = (candidate) => {
      const next = { ...resource, ...candidate };
      return acceptsLegacyTreePosition(legacy, next, "resource")
        && clearsPlacedTrees(next, [...fixedVisualTrees, ...placedResourceTrees]);
    };
    const replacement = normalizePoint(mask, resource, `${file}:resource/${resource.id}`, accepts);
    if (replacement) {
      if (checkOnly) {
        violations.push(`${file}:resource/${resource.id} uses an unsafe or overlapping tree position and must move to ${replacement.x},${replacement.y}.`);
      } else {
        resource.x = replacement.x;
        resource.y = replacement.y;
        legacyChanged = true;
        changed += 1;
        console.log(`${file}: moved resource '${resource.id}' to ${replacement.x},${replacement.y}.`);
      }
    }
    const finalPoint = replacement ?? resource;
    placedResourceTrees.push({ ...resource, x: finalPoint.x, y: finalPoint.y });
  }

  for (const object of legacy.objects ?? []) {
    if (!isTreeLikeObject(object)) continue;
    const accepts = (candidate) => {
      const next = { ...object, ...candidate };
      return acceptsLegacyTreePosition(legacy, next, "object") && clearsPlacedTrees(next, placedResourceTrees);
    };
    const replacement = normalizePoint(mask, object, `${file}:object/${object.id}`, accepts);
    if (replacement) {
      if (checkOnly) {
        violations.push(`${file}:object/${object.id} uses an unsafe or overlapping tree position and must move to ${replacement.x},${replacement.y}.`);
      } else {
        const yDelta = replacement.y - object.y;
        object.x = replacement.x;
        object.y = replacement.y;
        if (typeof object.depth === "number") object.depth += yDelta;
        legacyChanged = true;
        changed += 1;
        console.log(`${file}: moved map tree '${object.id}' to ${replacement.x},${replacement.y}.`);
      }
    }
  }

  if (!checkOnly) {
    if (mapChanged) await writeFile(mapPath, `${JSON.stringify(map)}\n`);
    if (legacyChanged) await writeFile(legacyPath, `${JSON.stringify(legacy, null, 2)}\n`);
  }
}

if (violations.length) {
  console.error(violations.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`${checkOnly ? "Tree placement check passed" : "Normalized tree placement"}: ${changed} change(s).`);
}
