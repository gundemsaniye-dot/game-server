import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { applySpans, navigationRegionsByMapId } from "./lib/tiled-impassable-regions.mjs";
import { requireTmjMutationApproval } from "./lib/require-tmj-mutation-approval.mjs";

requireTmjMutationApproval("standardize-tiled-navigation");

const root = process.cwd();
const mapsRoot = path.join(root, "art", "tiled", "maps");
const markerGids = { bridge: 577, blocked: 578 };
const markerTilesets = [
  { firstgid: markerGids.bridge, source: "../tilesets/navigation-bridge.tsj" },
  { firstgid: markerGids.blocked, source: "../tilesets/navigation-blocked.tsj" },
];
const layer = (map, name) => {
  const result = map.layers.find((candidate) => candidate.name === name && candidate.type === "tilelayer");
  if (!result) throw new Error(`${map.properties?.find((property) => property.name === "mapId")?.value ?? "map"}: missing ${name}.`);
  return result;
};

const files = (await readdir(mapsRoot)).filter((file) => file.endsWith(".tmj"));
for (const file of files) {
  const filePath = path.join(mapsRoot, file);
  const map = JSON.parse(await readFile(filePath, "utf8"));
  const reference = map.tilesets.find((tileset) => tileset.firstgid === 1);
  if (!reference) throw new Error(`${file}: missing reference-art tileset.`);
  map.tilesets = [reference, ...markerTilesets];

  const blocked = layer(map, "NAV_BLOCKED");
  const bridges = layer(map, "05_BRIDGES");
  for (let index = 0; index < blocked.data.length; index += 1) {
    const authored = [blocked.data[index], bridges.data[index]];
    blocked.data[index] = authored.includes(markerGids.blocked) ? markerGids.blocked : 0;
    bridges.data[index] = authored.includes(markerGids.bridge) ? markerGids.bridge : 0;
  }
  const mapId = map.properties?.find((property) => property.name === "mapId")?.value;
  const regions = navigationRegionsByMapId[mapId];
  if (!regions) throw new Error(`${file}: no hand-authored navigation regions for ${mapId}.`);
  if (map.width !== 32 || map.height !== 18) throw new Error(`${file}: expected a 32 x 18 navigation grid.`);
  blocked.data.fill(0);
  bridges.data.fill(0);
  applySpans(blocked.data, regions.blocked, markerGids.blocked, map.width, map.height);
  applySpans(bridges.data, regions.bridges, markerGids.bridge, map.width, map.height);
  Object.assign(blocked, { visible: true, opacity: 0.55 });
  Object.assign(bridges, { visible: true, opacity: 0.82 });

  // The bridge layer must be above the blocked layer in Tiled so green
  // crossings remain visible when painted over red water/cliff cells.
  map.layers = map.layers.filter((candidate) => candidate !== bridges);
  const objectsIndex = map.layers.findIndex((candidate) => candidate.name === "GAMEPLAY_ZONES");
  map.layers.splice(objectsIndex === -1 ? map.layers.length : objectsIndex, 0, bridges);
  await writeFile(filePath, `${JSON.stringify(map)}\n`);
  console.log(`Standardized navigation layers: ${file}`);
}
