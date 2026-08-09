import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourceRoot = path.join(root, "art", "tiled");
const mapSourceRoot = path.join(sourceRoot, "maps");
const tilesetSourceRoot = path.join(sourceRoot, "tilesets");
const imageSourceRoot = path.join(sourceRoot, "images");
const destinationRoot = path.join(root, "public", "assets", "tiled");
const mapDestinationRoot = path.join(destinationRoot, "maps");
const tilesetDestinationRoot = path.join(destinationRoot, "tilesets");

async function json(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

await Promise.all([mapDestinationRoot, tilesetDestinationRoot].map((dir) => mkdir(dir, { recursive: true })));
const mapFiles = (await readdir(mapSourceRoot)).filter((file) => file.endsWith(".tmj"));
for (const file of mapFiles) {
  const map = await json(path.join(mapSourceRoot, file));
  // The coherent reference image is only for Tiled authoring. The game uses
  // the generated ground Tilemap and must not render a second copy.
  map.layers = map.layers.filter((layer) => layer.name !== "REFERENCE_ART_PREVIEW");
  map.tilesets = await Promise.all(map.tilesets.map(async (reference) => {
    if (!reference.source) return reference;
    const sourcePath = path.resolve(mapSourceRoot, reference.source);
    const tileset = await json(sourcePath);
    const imageName = path.basename(tileset.image);
    tileset.image = `../tilesets/${imageName}`;
    return { ...reference, ...tileset, source: undefined };
  }));
  map.tilesets.forEach((tileset) => { delete tileset.source; });
  const mapId = map.properties?.find((property) => property.name === "mapId")?.value;
  if (typeof mapId !== "string" || !mapId) throw new Error(`${file}: missing mapId property.`);
  await writeFile(path.join(mapDestinationRoot, `${mapId}.json`), `${JSON.stringify(map)}\n`);
}
await cp(imageSourceRoot, tilesetDestinationRoot, { recursive: true });
console.log(`Built ${mapFiles.length} Tiled map(s) into public/assets/tiled.`);
