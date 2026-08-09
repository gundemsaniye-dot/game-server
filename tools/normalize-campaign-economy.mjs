import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  forbiddenCellsUnderTreeFootprint,
  isTreeLikeObject,
  navigationMask,
  TREE_NAV_CLEARANCE,
  treeVisualsOverlap,
} from "./lib/tiled-tree-placement.mjs";

const root = process.cwd();
const tiledRoot = path.join(root, "art", "tiled", "maps");
const legacyRoot = path.join(root, "src", "game", "maps");
const checkOnly = process.argv.includes("--check");
const mapFiles = (await readdir(tiledRoot)).filter((file) => file.endsWith(".tmj")).sort();

const styleByAssetKey = {
  "map-prop-shared-pine-tree": { source: "asset", assetKey: "map-prop-shared-pine-tree", scale: 0.28 },
  "map-prop-frozen_pass-snow-pine": { source: "asset", assetKey: "map-prop-frozen_pass-snow-pine", scale: 0.17 },
  "map-prop-muddy_fields-dead-tree": { source: "asset", assetKey: "map-prop-muddy_fields-dead-tree", scale: 0.15 },
  "map-prop-infernal_dungeon-burned-tree": { source: "asset", assetKey: "map-prop-infernal_dungeon-burned-tree", scale: 0.155 },
};
function resourceStyleForOrder(order) {
  if (order <= 4 || order === 8) return styleByAssetKey["map-prop-frozen_pass-snow-pine"];
  if (order === 10 || order === 18 || order === 19) return styleByAssetKey["map-prop-muddy_fields-dead-tree"];
  if (order === 20) return styleByAssetKey["map-prop-infernal_dungeon-burned-tree"];
  return styleByAssetKey["map-prop-shared-pine-tree"];
}
const desiredCount = (order) => order <= 4 ? 5 : order <= 12 ? 4 : 3;
// Reference maps are flattened paintings, so a few decorative tree crowns are
// not represented by Tiled obstacle objects. Keep live resource sprites away
// from those crowns; otherwise they can only render pasted on top of the art.
const referenceArtTreeClearance = {
  grasslands_02: [{ x: 780, y: 520, radius: 76 }],
};
const json = async (file) => JSON.parse(await readFile(file, "utf8"));
const property = (map, name) => map.properties?.find((entry) => entry.name === name)?.value;

function insideCollisionPatch(point, patch, clearance = TREE_NAV_CLEARANCE) {
  if (patch.collision === "none") return false;
  const dx = point.x - patch.x;
  const dy = point.y - patch.y;
  const cos = Math.cos(-(patch.rotation ?? 0));
  const sin = Math.sin(-(patch.rotation ?? 0));
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;
  const halfWidth = patch.width / 2 + clearance;
  const halfHeight = patch.height / 2 + clearance;
  if (patch.shape === "rectangle") return Math.abs(localX) <= halfWidth && Math.abs(localY) <= halfHeight;
  return (localX ** 2) / (halfWidth ** 2) + (localY ** 2) / (halfHeight ** 2) <= 1;
}

function shortestCells(mask, startPoint, targetPoint) {
  const start = { column: Math.floor(startPoint.x / 40), row: Math.floor(startPoint.y / 40) };
  const target = { column: Math.floor(targetPoint.x / 40), row: Math.floor(targetPoint.y / 40) };
  const queue = [{ ...start, distance: 0 }];
  const seen = new Set([`${start.column}:${start.row}`]);
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (current.column === target.column && current.row === target.row) return current.distance;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const column = current.column + dx;
      const row = current.row + dy;
      const key = `${column}:${row}`;
      if (seen.has(key) || mask.blockedAt(column, row)) continue;
      seen.add(key);
      queue.push({ column, row, distance: current.distance + 1 });
    }
  }
  return Number.POSITIVE_INFINITY;
}

function candidateIsSafe(mask, legacy, candidate, fixedTrees, placed) {
  if (candidate.x < 390 || candidate.x > 890 || candidate.y < 72 || candidate.y > 648) return false;
  if (forbiddenCellsUnderTreeFootprint(mask, candidate).length) return false;
  if ((legacy.terrain?.patches ?? []).some((patch) => insideCollisionPatch(candidate, patch))) return false;
  if ((referenceArtTreeClearance[legacy.id] ?? []).some((zone) =>
    Math.hypot(candidate.x - zone.x, candidate.y - zone.y) < zone.radius
  )) return false;
  return [...fixedTrees, ...placed].every((tree) => !treeVisualsOverlap(candidate, tree, 14));
}

function findMirroredPair(mask, legacy, fixedTrees, placed, targetY, resourceStyle) {
  const visual = { source: resourceStyle.source, assetKey: resourceStyle.assetKey };
  const scale = resourceStyle.scale;
  const leftCandidates = [];
  const rightCandidates = [];
  for (let y = 80; y <= 640; y += 20) {
    for (let x = 400; x <= 610; x += 20) {
      const point = { x, y, scale, visual };
      if (!candidateIsSafe(mask, legacy, point, fixedTrees, placed)) continue;
      const distance = shortestCells(mask, { x: 310, y: 360 }, point);
      if (Number.isFinite(distance)) leftCandidates.push({ point, distance });
    }
    for (let x = 660; x <= 880; x += 20) {
      const point = { x, y, scale, visual };
      if (!candidateIsSafe(mask, legacy, point, fixedTrees, placed)) continue;
      const distance = shortestCells(mask, { x: 970, y: 360 }, point);
      if (Number.isFinite(distance)) rightCandidates.push({ point, distance });
    }
  }
  const pairs = [];
  for (const left of leftCandidates) {
    for (const right of rightCandidates) {
      if (!candidateIsSafe(mask, legacy, right.point, fixedTrees, [...placed, left.point])) continue;
      const ratio = Math.max(left.distance, right.distance) / Math.max(1, Math.min(left.distance, right.distance));
      if (ratio > 1.1) continue;
      pairs.push({
        left: left.point,
        right: right.point,
        score:
          Math.abs(left.point.y - targetY) +
          Math.abs(right.point.y - targetY) +
          Math.abs(left.point.x - 470) * 0.5 +
          Math.abs(right.point.x - 810) * 0.5 +
          Math.abs(left.point.y - right.point.y) * 0.25 +
          (ratio - 1) * 400,
      });
    }
  }
  pairs.sort((a, b) => a.score - b.score);
  return pairs[0];
}

function findContestedTrees(mask, legacy, fixedTrees, placed, resourceStyle) {
  const candidates = [];
  const scale = resourceStyle.scale;
  for (let x = 420; x <= 860; x += 20) {
    for (let y = 80; y <= 640; y += 20) {
      const point = {
        x,
        y,
        scale,
        visual: { source: resourceStyle.source, assetKey: resourceStyle.assetKey },
      };
      if (!candidateIsSafe(mask, legacy, point, fixedTrees, placed)) continue;
      const playerDistance = shortestCells(mask, { x: 310, y: 360 }, point);
      const enemyDistance = shortestCells(mask, { x: 970, y: 360 }, point);
      const ratio = Math.max(playerDistance, enemyDistance) / Math.max(1, Math.min(playerDistance, enemyDistance));
      if (!Number.isFinite(ratio)) continue;
      candidates.push({
        point,
        score: Math.abs(x - 640) + Math.abs(y - 360) * 0.35 + Math.max(0, ratio - 1.1) * 80,
      });
    }
  }
  candidates.sort((a, b) => a.score - b.score);
  return candidates.map((candidate) => candidate.point);
}

let changed = 0;
const staleMaps = [];
for (const file of mapFiles) {
  const tiled = await json(path.join(tiledRoot, file));
  const mapId = property(tiled, "mapId");
  const order = Number(property(tiled, "campaignIndex"));
  if (!mapId || !order) throw new Error(`${file}: missing mapId/campaignIndex`);
  const legacyPath = path.join(legacyRoot, `${mapId}.json`);
  const legacy = await json(legacyPath);
  const mask = navigationMask(tiled);
  const fixedTrees = [];
  for (const layer of tiled.layers.filter((entry) => entry.type === "objectgroup")) {
    for (const object of layer.objects ?? []) {
      if (isTreeLikeObject(object)) {
        fixedTrees.push({
          x: object.x,
          y: object.y,
          scale: 0.85,
          visual: { source: "procedural", id: "broadleaf_tree", variant: 0 },
        });
      }
    }
  }
  // Legacy decorative trees are normalized after resources. They are allowed
  // to move so a level never loses a fair economy node because of decoration.

  const count = desiredCount(order);
  const resourceStyle = resourceStyleForOrder(order);
  const placed = [];
  if (count === 5) {
    const contested = findContestedTrees(mask, legacy, fixedTrees, placed, resourceStyle)[0];
    if (!contested) throw new Error(`${mapId}: could not place contested resource tree`);
    placed.push(contested);
  }
  if (count === 3) {
    let solution;
    for (const contested of findContestedTrees(mask, legacy, fixedTrees, placed, resourceStyle)) {
      const pair = findMirroredPair(mask, legacy, fixedTrees, [contested], 360, resourceStyle);
      if (pair) {
        solution = { contested, pair };
        break;
      }
    }
    if (!solution) throw new Error(`${mapId}: could not place one contested tree and one balanced pair`);
    placed.push(solution.contested, solution.pair.left, solution.pair.right);
  } else {
    const pairTargets = count === 5 ? [210, 510] : [220, 500];
    for (const targetY of pairTargets) {
      const pair = findMirroredPair(mask, legacy, fixedTrees, placed, targetY, resourceStyle);
      if (!pair) throw new Error(`${mapId}: could not place balanced resource pair near y=${targetY}`);
      placed.push(pair.left, pair.right);
    }
  }

  legacy.resources = placed.map((point, index) => ({
    id: `${mapId}_wood_${index + 1}`,
    type: "tree",
    x: point.x,
    y: point.y,
    amount: 12,
    visual: { source: resourceStyle.source, assetKey: resourceStyle.assetKey },
    scale: resourceStyle.scale,
    rotation: 0,
    depth: 8,
  }));
  legacy.modifiers.peasantGatherMultiplier = Math.max(0.9, Math.min(1.1, legacy.modifiers.peasantGatherMultiplier));
  const next = `${JSON.stringify(legacy, null, 2)}\n`;
  const previous = await readFile(legacyPath, "utf8");
  if (next !== previous) {
    if (checkOnly) staleMaps.push(mapId);
    else await writeFile(legacyPath, next);
    changed += 1;
  }
}

if (checkOnly && staleMaps.length) {
  console.error(`Campaign economy is stale for: ${staleMaps.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`${checkOnly ? "Campaign economy check passed" : "Normalized campaign economy resources"}: ${changed} map(s) changed.`);
}
