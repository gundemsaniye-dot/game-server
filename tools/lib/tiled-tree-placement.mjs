/** Shared placement rules for every Tiled-authored battle map.
 *
 * A tree is treated as a 64px square footprint, rather than a point. This
 * keeps its trunk and collision crown clear of water/lava/solid cells and
 * bridge approaches even when its anchor sits just outside a forbidden tile.
 */
export const TILED_TILE_SIZE = 40;
export const TREE_NAV_CLEARANCE = 32;
export const TREE_SEARCH_STEP = 20;
export const TREE_SEARCH_RADIUS = 480;

const TREE_VISUAL_DIMENSIONS = {
  "map-prop-shared-pine-tree": { width: 200, height: 289, originY: 0.82 },
  "map-prop-frozen_pass-snow-pine": { width: 325, height: 512, originY: 0.82 },
  "map-prop-muddy_fields-dead-tree": { width: 391, height: 512, originY: 0.82 },
  "map-prop-infernal_dungeon-burned-tree": { width: 378, height: 512, originY: 0.82 },
  pine_tall: { width: 76, height: 122, originY: 0.94 },
  pine_dense: { width: 92, height: 106, originY: 0.94 },
  pine_young: { width: 58, height: 78, originY: 0.94 },
  pine_snow: { width: 78, height: 106, originY: 0.94 },
  broadleaf_tree: { width: 108, height: 108, originY: 0.94 },
  dead_tree: { width: 70, height: 92, originY: 0.94 },
  burned_tree: { width: 70, height: 92, originY: 0.94 },
};

const textFor = (value) => String(value ?? "").toLowerCase();

export function propertyValues(object) {
  return Object.fromEntries((object.properties ?? []).map((property) => [property.name, property.value]));
}

export function isTreeLikeObject(object) {
  const properties = propertyValues(object);
  const identity = [
    object.name,
    object.type,
    object.visual?.id,
    object.visual?.assetKey,
    properties.assetKey,
    properties.obstacleId,
    properties.resourceType,
  ]
    .map(textFor)
    .join(" ");
  return /(?:tree|pine|oak|broadleaf|dead_tree|burned_tree)/.test(identity);
}

export function isTreeResource(resource) {
  return resource.type === "tree";
}

export function treeVisualBounds(point, gap = 0) {
  const identity = point.visual?.source === "asset" ? point.visual.assetKey : point.visual?.id;
  const dimensions = TREE_VISUAL_DIMENSIONS[identity] ?? { width: 84, height: 108, originY: 0.9 };
  const scale = Number(point.scale) || 1;
  const halfGap = gap / 2;
  const width = dimensions.width * scale;
  const height = dimensions.height * scale;
  return {
    left: point.x - width / 2 - halfGap,
    right: point.x + width / 2 + halfGap,
    top: point.y - height * dimensions.originY - halfGap,
    bottom: point.y + height * (1 - dimensions.originY) + halfGap,
  };
}

export function treeVisualsOverlap(first, second, gap = 0) {
  const a = treeVisualBounds(first, gap);
  const b = treeVisualBounds(second, gap);
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export function navigationMask(map) {
  const layers = new Map(map.layers.map((layer) => [layer.name, layer]));
  const blocked = layers.get("NAV_BLOCKED");
  const bridges = layers.get("05_BRIDGES");
  if (!blocked?.data || !bridges?.data) throw new Error("NAV_BLOCKED and 05_BRIDGES layers are required.");
  return {
    width: map.width,
    height: map.height,
    blockedAt(column, row) {
      if (column < 0 || row < 0 || column >= map.width || row >= map.height) return true;
      const index = row * map.width + column;
      // Green bridge cells explicitly override the red layer beneath them.
      return Boolean(blocked.data[index]) && !Boolean(bridges.data[index]);
    },
    treeForbiddenAt(column, row) {
      if (column < 0 || row < 0 || column >= map.width || row >= map.height) return true;
      const index = row * map.width + column;
      // Units may cross green bridge cells, but trees must never occupy the
      // bridge deck or its authored water/lava/solid footprint.
      return Boolean(blocked.data[index]) || Boolean(bridges.data[index]);
    },
  };
}

export function forbiddenCellsUnderTreeFootprint(mask, point, clearance = TREE_NAV_CLEARANCE) {
  const cells = [];
  const left = Math.floor((point.x - clearance) / TILED_TILE_SIZE);
  const right = Math.floor((point.x + clearance) / TILED_TILE_SIZE);
  const top = Math.floor((point.y - clearance) / TILED_TILE_SIZE);
  const bottom = Math.floor((point.y + clearance) / TILED_TILE_SIZE);
  for (let row = top; row <= bottom; row += 1) {
    for (let column = left; column <= right; column += 1) {
      if (mask.treeForbiddenAt(column, row)) cells.push({ column, row });
    }
  }
  return cells;
}

export function findNearestTreeSafePosition(mask, point, clearance = TREE_NAV_CLEARANCE, accepts = () => true) {
  const worldWidth = mask.width * TILED_TILE_SIZE;
  const worldHeight = mask.height * TILED_TILE_SIZE;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const seen = new Set();
  const candidates = [];
  for (let radius = 0; radius <= TREE_SEARCH_RADIUS; radius += TREE_SEARCH_STEP) {
    for (let offsetY = -radius; offsetY <= radius; offsetY += TREE_SEARCH_STEP) {
      for (let offsetX = -radius; offsetX <= radius; offsetX += TREE_SEARCH_STEP) {
        if (Math.max(Math.abs(offsetX), Math.abs(offsetY)) !== radius) continue;
        const x = clamp(point.x + offsetX, clearance, worldWidth - clearance);
        const y = clamp(point.y + offsetY, clearance, worldHeight - clearance);
        const key = `${x}:${y}`;
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push({ x, y, distanceSquared: offsetX ** 2 + offsetY ** 2 });
      }
    }
  }
  candidates.sort((first, second) => first.distanceSquared - second.distanceSquared);
  return candidates.find((candidate) =>
    forbiddenCellsUnderTreeFootprint(mask, candidate, clearance).length === 0 && accepts(candidate),
  );
}
