import { readFile } from "node:fs/promises";
import path from "node:path";

export async function tiledLevelFiles(root) {
  const manifest = JSON.parse(await readFile(path.join(root, "art", "tiled", "level-manifest.json"), "utf8"));
  const entries = manifest.levels.map(({ mapId, file }) => ({
    mapId,
    file: path.basename(file),
  }));
  if (entries.length !== manifest.levelCount || entries.some(({ mapId, file }) => !mapId || !file.endsWith(".tmj"))) {
    throw new Error("Invalid Tiled level manifest.");
  }
  return entries;
}

export async function tiledFileForMapId(root, mapId) {
  const entry = (await tiledLevelFiles(root)).find((candidate) => candidate.mapId === mapId);
  if (!entry) throw new Error(`Unknown Tiled map id: ${mapId}`);
  return entry.file;
}
