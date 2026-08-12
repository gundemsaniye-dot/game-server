import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { requireTmjMutationApproval } from "./lib/require-tmj-mutation-approval.mjs";

const mapsRoot = path.join(process.cwd(), "art", "tiled", "maps");
const markerGids = new Map([
  ["05_BRIDGES", 577],
  ["NAV_BLOCKED", 578],
]);
const writeChanges = process.argv.includes("--write");
if (writeChanges) requireTmjMutationApproval("normalize-tiled-marker-gids --write");

let changedMaps = 0;
let changedMarkers = 0;
const files = (await readdir(mapsRoot)).filter((file) => file.endsWith(".tmj"));

for (const file of files) {
  const filePath = path.join(mapsRoot, file);
  const map = JSON.parse(await readFile(filePath, "utf8"));
  let mapChanged = false;

  for (const [layerName, expectedGid] of markerGids) {
    const layer = map.layers.find((candidate) => candidate.name === layerName && candidate.type === "tilelayer");
    if (!layer?.data) throw new Error(`${file}: missing ${layerName} tile layer.`);

    layer.data = layer.data.map((gid) => {
      if (gid === 0 || gid === expectedGid) return gid;
      mapChanged = true;
      changedMarkers += 1;
      return expectedGid;
    });
  }

  if (!mapChanged) continue;
  changedMaps += 1;
  if (writeChanges) await writeFile(filePath, `${JSON.stringify(map)}\n`);
}

if (changedMaps > 0 && !writeChanges) {
  console.error(`[TMJ KILIDI] ${changedMarkers} navigation marker GID değeri ${changedMaps} kaynak haritada değişiklik gerektiriyor.`);
  console.error("Kaynak TMJ otomatik değiştirilmedi. Kullanıcıya bildirin ve düzeltmeyi Tiled içinde yapın.");
  process.exit(1);
}
console.log(writeChanges
  ? `Normalized Tiled navigation marker GIDs: ${changedMarkers} marker(s) in ${changedMaps} map(s).`
  : "Tiled navigation marker GIDs verified without modifying source TMJ files.");
