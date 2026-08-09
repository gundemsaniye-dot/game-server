import { deflateSync } from "node:zlib";
import { access, copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { tiledLevelFiles } from "./lib/tiled-level-manifest.mjs";

const root = process.cwd();
const sourceRoot = path.join(root, "art", "tiled");
const mapsRoot = path.join(sourceRoot, "maps");
const tilesetsRoot = path.join(sourceRoot, "tilesets");
const imagesRoot = path.join(sourceRoot, "images");
const legacyMapsRoot = path.join(root, "src", "game", "maps");
const width = 32;
const height = 18;
const tileSize = 40;
const size = width * height;

const BIOMES = {
  grasslands: { file: "grasslands-terrain", base: [83, 138, 67], terrain: [145, 105, 61], hazard: [52, 119, 162], road: [160, 133, 86], terrainType: "ground", moveCost: 1 },
  silent_forest: { file: "forest-terrain", base: [48, 88, 58], terrain: [79, 102, 61], hazard: [42, 103, 127], road: [112, 91, 61], terrainType: "forest_floor", moveCost: 1.08 },
  muddy_fields: { file: "muddy-terrain", base: [105, 96, 64], terrain: [91, 73, 52], hazard: [54, 113, 137], road: [135, 111, 72], terrainType: "mud", moveCost: 1.35 },
  storm_valley: { file: "storm-terrain", base: [79, 98, 103], terrain: [100, 111, 107], hazard: [52, 100, 137], road: [131, 124, 103], terrainType: "stone", moveCost: 1.08 },
  dry_steppe: { file: "dry-steppe-terrain", base: [158, 120, 70], terrain: [128, 90, 55], hazard: [64, 125, 145], road: [181, 145, 90], terrainType: "dry_soil", moveCost: 1.1 },
  desert: { file: "desert-terrain", base: [210, 171, 100], terrain: [176, 133, 72], hazard: [53, 138, 151], road: [193, 151, 87], terrainType: "sand", moveCost: 1.15 },
  frozen_pass: { file: "snow-terrain", base: [207, 225, 229], terrain: [151, 182, 193], hazard: [102, 171, 201], road: [175, 186, 184], terrainType: "snow", moveCost: 1.2 },
  infernal_dungeon: { file: "infernal-terrain", base: [75, 61, 59], terrain: [103, 75, 61], hazard: [211, 67, 35], road: [123, 93, 66], terrainType: "ash", moveCost: 1.12 },
};

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const header = Buffer.alloc(4);
  header.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([header, typeBytes, data, checksum]);
}

function tilePng(palette) {
  const imageWidth = 160;
  const pixels = Buffer.alloc((imageWidth * 40 * 4) + 40);
  for (let y = 0; y < 40; y += 1) {
    const row = y * (imageWidth * 4 + 1);
    pixels[row] = 0;
    for (let x = 0; x < imageWidth; x += 1) {
      const tile = Math.floor(x / 40);
      const offset = row + 1 + x * 4;
      const shade = ((x * 13 + y * 7) % 9) - 4;
      let [r, g, b] = [palette.base, palette.terrain, palette.hazard, palette.road][tile];
      if (tile === 3 && (y < 5 || y > 34)) [r, g, b] = palette.terrain;
      pixels[offset] = Math.max(0, r + shade);
      pixels[offset + 1] = Math.max(0, g + shade);
      pixels[offset + 2] = Math.max(0, b + shade);
      pixels[offset + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(imageWidth, 0);
  ihdr.writeUInt32BE(40, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]);
}

function property(name, type, value) { return { name, type, value }; }

function tileset(name, terrainType, moveCost, columns = 4, tilecount = 4) {
  return {
    columns,
    image: `../images/${name}.png`,
    imageheight: Math.ceil(tilecount / columns) * 40,
    imagewidth: columns * 40,
    margin: 0,
    name,
    spacing: 0,
    tilecount,
    tileheight: 40,
    tilewidth: 40,
    tiles: [
      { id: 0, properties: [property("terrainType", "string", terrainType), property("walkable", "bool", true), property("moveCost", "float", moveCost)] },
      { id: 1, properties: [property("terrainType", "string", terrainType), property("walkable", "bool", true), property("moveCost", "float", moveCost)] },
      { id: 2, properties: [property("terrainType", "string", "hazard"), property("walkable", "bool", false), property("moveCost", "float", 999), property("blocksDeploy", "bool", true)] },
      { id: 3, properties: [property("terrainType", "string", "bridge"), property("walkable", "bool", true), property("moveCost", "float", 1)] },
      ...Array.from({ length: Math.max(0, tilecount - 4) }, (_, index) => ({ id: index + 4 })),
    ],
    tiledversion: "1.11.0",
    tileoffset: { x: 0, y: 0 },
    type: "tileset",
    version: "1.10",
  };
}

function layer(id, name, data, visible = true) {
  return { id, name, type: "tilelayer", x: 0, y: 0, width, height, opacity: 1, visible, data };
}

function cellIndex(x, y) { return y * width + x; }
function tilePoint(x, y) { return { x: (x + 0.5) * tileSize, y: (y + 0.5) * tileSize }; }

function insidePatch(point, patch) {
  const dx = point.x - patch.x;
  const dy = point.y - patch.y;
  const cos = Math.cos(-patch.rotation);
  const sin = Math.sin(-patch.rotation);
  const x = dx * cos - dy * sin;
  const y = dx * sin + dy * cos;
  if (patch.shape === "rectangle") return Math.abs(x) <= patch.width / 2 && Math.abs(y) <= patch.height / 2;
  return (x * x) / ((patch.width / 2) ** 2) + (y * y) / ((patch.height / 2) ** 2) <= 1;
}

function drawLine(data, from, to, gid) {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 18));
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const x = Math.max(0, Math.min(width - 1, Math.floor((from.x + (to.x - from.x) * t) / tileSize)));
    const y = Math.max(0, Math.min(height - 1, Math.floor((from.y + (to.y - from.y) * t) / tileSize)));
    data[cellIndex(x, y)] = gid;
  }
}

function bridgeCells(blocked, bridges) {
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      if (!blocked[cellIndex(x, y)]) continue;
      const horizontal = blocked[cellIndex(x - 1, y)] && blocked[cellIndex(x + 1, y)] && !blocked[cellIndex(x, y - 1)] && !blocked[cellIndex(x, y + 1)];
      const vertical = blocked[cellIndex(x, y - 1)] && blocked[cellIndex(x, y + 1)] && !blocked[cellIndex(x - 1, y)] && !blocked[cellIndex(x + 1, y)];
      if ((horizontal || vertical) && (x + y) % 5 === 0) bridges[cellIndex(x, y)] = 4;
    }
  }
}

function makeMap(legacy, palette) {
  const terrain = Array(size).fill(0);
  const hazards = Array(size).fill(0);
  const roads = Array(size).fill(0);
  const blocked = Array(size).fill(0);
  const costs = Array(size).fill(0);
  const bridges = Array(size).fill(0);
  const transitions = Array(size).fill(0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const point = tilePoint(x, y);
      const patches = legacy.terrain.patches.filter((patch) => insidePatch(point, patch));
      const impassable = patches.find((patch) => patch.collision !== "none");
      if (impassable) {
        hazards[cellIndex(x, y)] = 3;
        blocked[cellIndex(x, y)] = 3;
      } else if (patches.length) {
        terrain[cellIndex(x, y)] = 2;
        if (["mud", "sand", "snow", "dry_soil"].includes(patches.at(-1).material)) costs[cellIndex(x, y)] = 2;
      }
    }
  }
  if (legacy.biome === "grasslands") {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = cellIndex(x, y);
        if (terrain[index] !== 2) continue;
        const north = y > 0 ? terrain[cellIndex(x, y - 1)] : 0;
        const south = y < height - 1 ? terrain[cellIndex(x, y + 1)] : 0;
        const west = x > 0 ? terrain[cellIndex(x - 1, y)] : 0;
        const east = x < width - 1 ? terrain[cellIndex(x + 1, y)] : 0;
        // GIDs 5..8 map to the four edge directions in the generated atlas.
        if (north !== 2) transitions[index] = 5;
        else if (south !== 2) transitions[index] = 6;
        else if (west !== 2) transitions[index] = 7;
        else if (east !== 2) transitions[index] = 8;
      }
    }
  }
  legacy.lanes.forEach((lane) => lane.points.slice(1).forEach((point, index) => drawLine(roads, lane.points[index], point, 4)));
  bridgeCells(blocked, bridges);
  // Level 2 is the deliberate water-and-bridge collision pilot. Keep a
  // guaranteed walkable bridge override even if the Tiled auto-layout changes.
  if (legacy.id === "grasslands_02") {
    const waterCells = blocked.map((gid, index) => gid ? index : -1).filter((index) => index >= 0);
    if (waterCells.length) bridges[waterCells[Math.floor(waterCells.length / 2)]] = 4;
  }
  const sortedObjects = legacy.objects
    .filter((object) => object.visual?.source === "asset")
    .map((object, index) => ({ id: index + 100, name: object.id, type: "prop", x: object.x, y: object.y, width: 0, height: 0, visible: true, properties: [property("assetKey", "string", object.visual.assetKey), property("depthMode", "string", "ySort"), property("scale", "float", object.scale), property("rotationOffset", "float", object.rotation)] }));
  return {
    compressionlevel: -1,
    height,
    infinite: false,
    layers: [
      layer(1, "00_GROUND_BASE", Array(size).fill(1)),
      layer(2, "01_GROUND_TERRAIN", terrain),
      layer(3, "02_GROUND_TRANSITIONS", transitions),
      layer(4, "03_HAZARD_VISUALS", hazards),
      layer(5, "04_ROADS", roads),
      layer(6, "05_BRIDGES", bridges),
      layer(7, "06_DETAILS_BELOW", Array(size).fill(0)),
      layer(8, "07_DETAILS_ABOVE", Array(size).fill(0)),
      layer(9, "NAV_BLOCKED", blocked, false),
      layer(10, "NAV_COST", costs, false),
      { id: 11, name: "OBJECTS_BELOW", type: "objectgroup", x: 0, y: 0, opacity: 1, visible: true, objects: [] },
      { id: 12, name: "OBJECTS_SORTED", type: "objectgroup", x: 0, y: 0, opacity: 1, visible: true, objects: sortedObjects },
    ],
    nextlayerid: 13,
    nextobjectid: sortedObjects.length + 101,
    orientation: "orthogonal",
    properties: [property("mapId", "string", legacy.id)],
    renderorder: "right-down",
    tiledversion: "1.11.0",
    tileheight: tileSize,
    tilesets: [{ firstgid: 1, source: `../tilesets/${palette.file}.tsj` }],
    tilewidth: tileSize,
    type: "map",
    version: "1.10",
    width,
  };
}

const sharedPalette = { base: [130, 110, 74], terrain: [113, 92, 61], hazard: [80, 120, 140], road: [180, 150, 95] };
const project = { compatibilityVersion: 1100, extensionsPath: "extensions", fileFormatVersion: 1, folders: ["maps", "tilesets", "images"], propertyTypes: [], type: "project" };

await Promise.all([mapsRoot, tilesetsRoot, imagesRoot].map((dir) => mkdir(dir, { recursive: true })));
for (const palette of Object.values(BIOMES)) {
  const generatedImage = path.join(imagesRoot, `${palette.file}.png`);
  const grasslandsV2 = path.join(imagesRoot, "grasslands-terrain-v2.png");
  const useOrganicGrasslands = palette.file === "grasslands-terrain" && await access(grasslandsV2).then(() => true).catch(() => false);
  await Promise.all([
    useOrganicGrasslands ? copyFile(grasslandsV2, generatedImage) : writeFile(generatedImage, tilePng(palette)),
    writeFile(path.join(tilesetsRoot, `${palette.file}.tsj`), `${JSON.stringify(tileset(palette.file, palette.terrainType, palette.moveCost, useOrganicGrasslands ? 8 : 4, useOrganicGrasslands ? 16 : 4), null, 2)}\n`),
  ]);
}
for (const name of ["shared-roads", "shared-details", "shared-props"]) {
  await Promise.all([
    writeFile(path.join(imagesRoot, `${name}.png`), tilePng(sharedPalette)),
    writeFile(path.join(tilesetsRoot, `${name}.tsj`), `${JSON.stringify(tileset(name, "ground", 1), null, 2)}\n`),
  ]);
}
const legacyFiles = (await readdir(legacyMapsRoot)).filter((file) => file.endsWith(".json"));
const tiledFilesByMapId = new Map((await tiledLevelFiles(root)).map(({ mapId, file }) => [mapId, file]));
for (const file of legacyFiles) {
  const legacy = JSON.parse(await readFile(path.join(legacyMapsRoot, file), "utf8"));
  const palette = BIOMES[legacy.biome];
  if (!palette) throw new Error(`No Tiled palette for ${legacy.id} (${legacy.biome}).`);
  const tiledFile = tiledFilesByMapId.get(legacy.id);
  if (!tiledFile) throw new Error(`No Tiled filename configured for ${legacy.id}.`);
  await writeFile(path.join(mapsRoot, tiledFile), `${JSON.stringify(makeMap(legacy, palette), null, 2)}\n`);
}
await writeFile(path.join(sourceRoot, "castle-stormers.tiled-project"), `${JSON.stringify(project, null, 2)}\n`);
console.log(`Created ${legacyFiles.length} Tiled source maps and ${Object.keys(BIOMES).length} biome tilesets.`);
