import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const mapsRoot = path.join(root, "art", "tiled", "maps");
const legacyRoot = path.join(root, "src", "game", "maps");

function layerByName(map, name) {
  return map.layers.find((layer) => layer.name === name);
}

function clearCell(layer, col, row) {
  if (!layer?.data) return;
  if (col < 0 || row < 0 || col >= 32 || row >= 18) return;
  layer.data[row * 32 + col] = 0;
}

function clearRect(layer, minCol, minRow, maxCol, maxRow) {
  for (let row = minRow; row <= maxRow; row += 1) {
    for (let col = minCol; col <= maxCol; col += 1) clearCell(layer, col, row);
  }
}

function clearWorldRect(layer, x, y, width, height, paddingTiles = 1) {
  const minCol = Math.floor((x - width / 2) / 40) - paddingTiles;
  const maxCol = Math.floor((x + width / 2) / 40) + paddingTiles;
  const minRow = Math.floor(y / 40) - paddingTiles;
  const maxRow = Math.floor((y + height) / 40) + paddingTiles;
  clearRect(layer, minCol, minRow, maxCol, maxRow);
}

function clearZone(layer, zone, paddingTiles = 1) {
  const minCol = Math.floor((zone.x - zone.width / 2) / 40) - paddingTiles;
  const maxCol = Math.floor((zone.x + zone.width / 2) / 40) + paddingTiles;
  const minRow = Math.floor(zone.minY / 40) - paddingTiles;
  const maxRow = Math.floor(zone.maxY / 40) + paddingTiles;
  clearRect(layer, minCol, minRow, maxCol, maxRow);
}

function clearPoint(layer, x, y, radiusTiles = 2) {
  const col = Math.max(0, Math.min(31, Math.floor(x / 40)));
  const row = Math.max(0, Math.min(17, Math.floor(y / 40)));
  clearRect(layer, col - radiusTiles, row - radiusTiles, col + radiusTiles, row + radiusTiles);
}

function clearManhattan(layer, fromX, fromY, toX, toY, radiusTiles = 1) {
  const aCol = Math.max(0, Math.min(31, Math.floor(fromX / 40)));
  const aRow = Math.max(0, Math.min(17, Math.floor(fromY / 40)));
  const bCol = Math.max(0, Math.min(31, Math.floor(toX / 40)));
  const bRow = Math.max(0, Math.min(17, Math.floor(toY / 40)));
  clearRect(layer, Math.min(aCol, bCol) - radiusTiles, aRow - radiusTiles, Math.max(aCol, bCol) + radiusTiles, aRow + radiusTiles);
  clearRect(layer, bCol - radiusTiles, Math.min(aRow, bRow) - radiusTiles, bCol + radiusTiles, Math.max(aRow, bRow) + radiusTiles);
}

let patched = 0;
for (const file of (await readdir(mapsRoot)).filter((name) => name.endsWith(".tmj")).sort()) {
  const mapPath = path.join(mapsRoot, file);
  const map = JSON.parse(await readFile(mapPath, "utf8"));
  const mapId = map.properties?.find((property) => property.name === "mapId")?.value;
  if (typeof mapId !== "string" || !mapId) throw new Error(`${file}: missing mapId property.`);
  const legacyPath = path.join(legacyRoot, `${mapId}.json`);
  const legacy = JSON.parse(await readFile(legacyPath, "utf8"));
  const blocked = layerByName(map, "NAV_BLOCKED");
  if (!blocked?.data) continue;

  clearZone(blocked, legacy.deployZone, 2);
  clearZone(blocked, legacy.enemySpawnZone, 2);

  const deployCenterY = (legacy.deployZone.minY + legacy.deployZone.maxY) / 2;
  const enemyCenterY = (legacy.enemySpawnZone.minY + legacy.enemySpawnZone.maxY) / 2;
  clearManhattan(blocked, legacy.deployZone.x, deployCenterY, legacy.enemySpawnZone.x, enemyCenterY, 1);

  for (const resource of legacy.resources ?? []) {
    const resourceY = resource.y ?? ((resource.minY + resource.maxY) / 2);
    clearPoint(blocked, resource.x, resourceY, 2);
    clearManhattan(blocked, legacy.deployZone.x, deployCenterY, resource.x, resourceY, 1);
  }

  // Keep top/bottom resource edges from becoming isolated by one blocked border tile.
  for (const resource of legacy.resources ?? []) {
    const resourceY = resource.y ?? ((resource.minY + resource.maxY) / 2);
    if (resourceY < 120 || resourceY > 600) clearPoint(blocked, resource.x, resourceY, 3);
  }

  await writeFile(mapPath, `${JSON.stringify(map)}\n`);
  patched += 1;
}
console.log(`Patched NAV_BLOCKED corridors in ${patched} Tiled source map(s).`);
