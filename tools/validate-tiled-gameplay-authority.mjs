import { readFile } from "node:fs/promises";
import path from "node:path";
import { tiledLevelFiles } from "./lib/tiled-level-manifest.mjs";

const root = process.cwd();
const sourceMapsRoot = path.join(root, "art", "tiled", "maps");
const runtimeMapsRoot = path.join(root, "public", "assets", "tiled", "maps");
const CASTLE_CONTACT_CLEARANCE = 10;
const errors = [];

const json = async (file) => JSON.parse(await readFile(file, "utf8"));
const properties = (object) => new Map((object.properties ?? []).map((property) => [property.name, property.value]));
const objectType = (object) => object.type || object.class || "";
const layerMap = (map) => new Map((map.layers ?? []).map((layer) => [layer.name, layer]));
const finite = (value) => typeof value === "number" && Number.isFinite(value);

function objects(map) {
  return (map.layers ?? [])
    .filter((layer) => layer.type === "objectgroup")
    .flatMap((layer) => layer.objects ?? []);
}

function objectCenter(object) {
  return {
    x: (object.x ?? 0) + (object.width ?? 0) / 2,
    y: (object.y ?? 0) + (object.height ?? 0) / 2,
  };
}

function zoneFrom(object) {
  return {
    x: (object.x ?? 0) + (object.width ?? 0) / 2,
    width: object.width ?? 0,
    minY: Math.max(0, object.y ?? 0),
    maxY: Math.min(720, (object.y ?? 0) + (object.height ?? 0)),
  };
}

function blockedAt(layers, column, row) {
  const blocked = layers.get("NAV_BLOCKED");
  const bridges = layers.get("05_BRIDGES");
  const index = row * 32 + column;
  return Boolean(blocked?.data?.[index]) && !Boolean(bridges?.data?.[index]);
}

function fineNavigationGrid(map) {
  const layers = layerMap(map);
  const grid = Array.from({ length: 36 }, () => Array(64).fill(false));
  const blocked = layers.get("NAV_BLOCKED");
  const bridges = layers.get("05_BRIDGES");
  for (let tileY = 0; tileY < 18; tileY += 1) {
    for (let tileX = 0; tileX < 32; tileX += 1) {
      const index = tileY * 32 + tileX;
      if (!blocked?.data?.[index] || bridges?.data?.[index]) continue;
      for (let offsetY = 0; offsetY < 2; offsetY += 1) {
        for (let offsetX = 0; offsetX < 2; offsetX += 1) {
          grid[tileY * 2 + offsetY][tileX * 2 + offsetX] = true;
        }
      }
    }
  }
  for (const object of objects(map)) {
    if (objectType(object) !== "CastleAnchor") continue;
    if (properties(object).get("blocksNavigation") !== true) continue;
    if (!finite(object.x) || !finite(object.y) || !finite(object.width) || !finite(object.height)) continue;
    const firstColumn = Math.max(0, Math.min(63, Math.floor(object.x / 20)));
    const lastColumn = Math.max(0, Math.min(63, Math.floor((object.x + object.width - 0.001) / 20)));
    const firstRow = Math.max(0, Math.min(35, Math.floor(object.y / 20)));
    const lastRow = Math.max(0, Math.min(35, Math.floor((object.y + object.height - 0.001) / 20)));
    for (let row = firstRow; row <= lastRow; row += 1) {
      for (let column = firstColumn; column <= lastColumn; column += 1) {
        grid[row][column] = true;
      }
    }
  }
  return grid;
}

function fineCellsForZone(object) {
  const cells = [];
  for (let x = object.x; x < object.x + object.width; x += 20) {
    for (let y = object.y; y < object.y + object.height; y += 20) {
      cells.push([Math.floor(x / 20), Math.floor(y / 20)]);
    }
  }
  return cells;
}

function fineCellsForVerticalLine(x) {
  const cells = [];
  for (let y = 0; y < 720; y += 20) {
    cells.push([Math.floor(x / 20), Math.floor(y / 20)]);
  }
  return cells;
}

function fineCanReach(grid, starts, targets) {
  const targetKeys = new Set(
    targets
      .filter(([x, y]) => x >= 0 && x < 64 && y >= 0 && y < 36 && !grid[y][x])
      .map(([x, y]) => `${x}:${y}`),
  );
  const queue = [];
  const visited = new Set();
  for (const [x, y] of starts) {
    if (x < 0 || x >= 64 || y < 0 || y >= 36 || grid[y][x]) continue;
    const key = `${x}:${y}`;
    if (visited.has(key)) continue;
    visited.add(key);
    queue.push([x, y]);
  }
  for (let index = 0; index < queue.length; index += 1) {
    const [x, y] = queue[index];
    if (targetKeys.has(`${x}:${y}`)) return true;
    for (const [nextX, nextY] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const key = `${nextX}:${nextY}`;
      if (
        nextX < 0 ||
        nextY < 0 ||
        nextX >= 64 ||
        nextY >= 36 ||
        visited.has(key) ||
        grid[nextY][nextX]
      ) continue;
      visited.add(key);
      queue.push([nextX, nextY]);
    }
  }
  return false;
}

function canReach(map, from, to) {
  const layers = layerMap(map);
  const targets = [];
  if (typeof to.width === "number" && typeof to.minY === "number" && typeof to.maxY === "number") {
    for (let x = to.x - to.width / 2; x <= to.x + to.width / 2; x += 40) {
      for (let y = to.minY; y <= to.maxY; y += 40) {
        const column = Math.max(0, Math.min(31, Math.floor(x / 40)));
        const row = Math.max(0, Math.min(17, Math.floor(y / 40)));
        if (!blockedAt(layers, column, row)) targets.push(`${column}:${row}`);
      }
    }
  } else {
    targets.push(`${Math.max(0, Math.min(31, Math.floor(to.x / 40)))}:${Math.max(0, Math.min(17, Math.floor(to.y / 40)))}`);
  }
  const targetKeys = new Set(targets);
  const starts = [];
  for (let x = from.x - from.width / 2; x <= from.x + from.width / 2; x += 40) {
    for (let y = from.minY; y <= from.maxY; y += 40) {
      const column = Math.max(0, Math.min(31, Math.floor(x / 40)));
      const row = Math.max(0, Math.min(17, Math.floor(y / 40)));
      if (!blockedAt(layers, column, row)) starts.push([column, row]);
    }
  }
  const queue = starts;
  const visited = new Set(starts.map(([x, y]) => `${x}:${y}`));
  for (let index = 0; index < queue.length; index += 1) {
    const [x, y] = queue[index];
    if (targetKeys.has(`${x}:${y}`)) return true;
    for (const [nextX, nextY] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const key = `${nextX}:${nextY}`;
      if (
        nextX < 0 ||
        nextY < 0 ||
        nextX >= 32 ||
        nextY >= 18 ||
        visited.has(key) ||
        blockedAt(layers, nextX, nextY)
      ) continue;
      visited.add(key);
      queue.push([nextX, nextY]);
    }
  }
  return false;
}

function primaryCastle(allObjects, team) {
  return allObjects.find((object) => {
    const props = properties(object);
    return objectType(object) === "CastleAnchor" && props.get("team") === team && props.get("isPrimary") !== false;
  });
}

function zoneObject(allObjects, type, team) {
  return allObjects.find((object) => {
    const props = properties(object);
    return objectType(object) === type && props.get("team") === team && props.get("enabled") !== false;
  });
}

function gameplayContract(map) {
  return objects(map)
    .filter((object) => ["CastleAnchor", "DeployZone", "SpawnZone"].includes(objectType(object)))
    .map((object) => ({
      name: object.name,
      type: objectType(object),
      x: object.x,
      y: object.y,
      width: object.width,
      height: object.height,
      properties: [...properties(object)].sort(([left], [right]) => left.localeCompare(right)),
    }))
    .sort((left, right) => `${left.type}:${left.name}`.localeCompare(`${right.type}:${right.name}`));
}

const levelFiles = await tiledLevelFiles(root);
for (const { file, mapId } of levelFiles) {
  const source = await json(path.join(sourceMapsRoot, file));
  const map = await json(path.join(runtimeMapsRoot, `${mapId}.json`));
  if (JSON.stringify(gameplayContract(source)) !== JSON.stringify(gameplayContract(map))) {
    errors.push(`${mapId}: runtime gameplay geometry differs from the locked source TMJ.`);
  }
  const allObjects = objects(map);
  const playerCastle = primaryCastle(allObjects, "player");
  const enemyCastle = primaryCastle(allObjects, "enemy");
  if (!playerCastle) errors.push(`${mapId}: missing primary player CastleAnchor.`);
  if (!enemyCastle) errors.push(`${mapId}: missing primary enemy CastleAnchor.`);
  for (const [label, castle] of [["player", playerCastle], ["enemy", enemyCastle]]) {
    if (!castle) continue;
    const center = objectCenter(castle);
    if (!finite(center.x) || !finite(center.y) || center.x < 0 || center.x > 1280 || center.y < 0 || center.y > 720) {
      errors.push(`${mapId}: ${label} CastleAnchor has invalid center.`);
    }
    if ((castle.width ?? 0) <= 0 || (castle.height ?? 0) <= 0) {
      errors.push(`${mapId}: ${label} CastleAnchor needs a positive footprint.`);
    }
    const props = properties(castle);
    if (!finite(props.get("anchorX")) || !finite(props.get("anchorY"))) {
      errors.push(`${mapId}: ${label} CastleAnchor needs finite anchorX/anchorY properties.`);
    }
  }

  const deployObject = zoneObject(allObjects, "DeployZone", "player");
  const spawnObject = zoneObject(allObjects, "SpawnZone", "enemy");
  if (!deployObject) errors.push(`${mapId}: missing player DeployZone.`);
  if (!spawnObject) errors.push(`${mapId}: missing enemy SpawnZone.`);
  const deploy = deployObject ? zoneFrom(deployObject) : undefined;
  const spawn = spawnObject ? zoneFrom(spawnObject) : undefined;
  for (const [label, zone] of [["DeployZone", deploy], ["SpawnZone", spawn]]) {
    if (!zone) continue;
    if (zone.width <= 0 || zone.minY < -0.1 || zone.maxY > 720.1 || zone.minY >= zone.maxY) {
      errors.push(`${mapId}: ${label} has invalid dimensions.`);
    }
  }
  if (deploy && spawn && !canReach(map, deploy, spawn)) {
    errors.push(`${mapId}: player DeployZone cannot reach enemy SpawnZone.`);
  }
  if (deployObject && spawnObject) {
    const fineGrid = fineNavigationGrid(map);
    const playerAttackLineX = enemyCastle
      ? Math.floor(enemyCastle.x / 20) * 20 - CASTLE_CONTACT_CLEARANCE
      : undefined;
    const enemyAttackLineX = playerCastle
      ? Math.ceil((playerCastle.x + playerCastle.width) / 20) * 20 + CASTLE_CONTACT_CLEARANCE
      : undefined;
    if (playerAttackLineX === undefined || enemyAttackLineX === undefined) continue;
    if (!fineCanReach(fineGrid, fineCellsForZone(deployObject), fineCellsForVerticalLine(playerAttackLineX))) {
      errors.push(`${mapId}: player units cannot reach the enemy red attack line at x=${playerAttackLineX}.`);
    }
    if (!fineCanReach(fineGrid, fineCellsForZone(spawnObject), fineCellsForVerticalLine(enemyAttackLineX))) {
      errors.push(`${mapId}: enemy units cannot reach the player red attack line at x=${enemyAttackLineX}.`);
    }
  }

}

if (errors.length) {
  console.error(errors.map((error) => `Tiled gameplay authority: ${error}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Tiled gameplay authority passed for ${levelFiles.length} maps.`);
}
