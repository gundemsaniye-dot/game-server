import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { tiledFileForMapId } from "./lib/tiled-level-manifest.mjs";
import { requireTmjMutationApproval } from "./lib/require-tmj-mutation-approval.mjs";

requireTmjMutationApproval("apply-tiled-navigation");

const root = process.cwd();
const mapsRoot = path.join(root, "art", "tiled", "maps");
const navigationRoot = path.join(root, "art", "tiled", "navigation");
const columns = 32;
const rows = 18;
const cells = columns * rows;

const indexAt = (column, row) => row * columns + column;

function assertCell(column, row, mapId) {
  if (!Number.isInteger(column) || !Number.isInteger(row) || column < 0 || column >= columns || row < 0 || row >= rows) {
    throw new Error(`${mapId}: navigation cell (${column}, ${row}) is outside the ${columns}x${rows} grid.`);
  }
}

function layer(map, name) {
  const target = map.layers.find((candidate) => candidate.name === name && candidate.type === "tilelayer");
  if (!target) throw new Error(`${map.properties?.find((property) => property.name === "mapId")?.value ?? "map"}: missing ${name} layer.`);
  return target;
}

function applyRectangles(data, rectangles, value, mapId) {
  for (const rectangle of rectangles ?? []) {
    const [left, top, right, bottom] = rectangle;
    assertCell(left, top, mapId);
    assertCell(right, bottom, mapId);
    if (right < left || bottom < top) throw new Error(`${mapId}: invalid navigation rectangle.`);
    for (let row = top; row <= bottom; row += 1) {
      for (let column = left; column <= right; column += 1) data[indexAt(column, row)] = value;
    }
  }
}

function applyCells(data, entries, value, mapId) {
  for (const [column, row] of entries ?? []) {
    assertCell(column, row, mapId);
    data[indexAt(column, row)] = value;
  }
}

const files = (await readdir(navigationRoot)).filter((file) => file.endsWith(".json") && file !== "TEMPLATE.json");
for (const file of files) {
  const definition = JSON.parse(await readFile(path.join(navigationRoot, file), "utf8"));
  const mapId = definition.mapId;
  if (typeof mapId !== "string") throw new Error(`${file}: mapId is required.`);
  const mapPath = path.join(mapsRoot, await tiledFileForMapId(root, mapId));
  const map = JSON.parse(await readFile(mapPath, "utf8"));

  const blocked = Array(cells).fill(0);
  const bridges = Array(cells).fill(0);

  applyRectangles(blocked, definition.blocked?.rectangles, 1, mapId);
  applyCells(blocked, definition.blocked?.cells, 1, mapId);
  applyRectangles(bridges, definition.bridges?.rectangles, 1, mapId);
  applyCells(bridges, definition.bridges?.cells, 1, mapId);
  layer(map, "NAV_BLOCKED").data = blocked;
  layer(map, "05_BRIDGES").data = bridges;
  await writeFile(mapPath, `${JSON.stringify(map)}\n`);
  console.log(`Applied navigation: ${mapId}`);
}
