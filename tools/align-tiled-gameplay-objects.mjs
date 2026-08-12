import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expectedGameplayObjects } from "./lib/tiled-gameplay-layouts.mjs";
import { tiledLevelFiles } from "./lib/tiled-level-manifest.mjs";
import { requireTmjMutationApproval } from "./lib/require-tmj-mutation-approval.mjs";

requireTmjMutationApproval("align-tiled-gameplay-objects");

const root = process.cwd();

function objectType(object) {
  return object.type || object.class || "";
}

function properties(object) {
  return new Map((object.properties ?? []).map((property) => [property.name, property]));
}

function findObject(map, type, team) {
  return (map.layers ?? [])
    .filter((layer) => layer.type === "objectgroup")
    .flatMap((layer) => layer.objects ?? [])
    .find((object) => objectType(object) === type && properties(object).get("team")?.value === team);
}

function applyRect(object, expected) {
  object.x = expected.x;
  object.y = expected.y;
  object.width = expected.width;
  object.height = expected.height;
}

function setProperty(object, name, value) {
  const property = properties(object).get(name);
  if (!property) throw new Error(`${object.name || object.id}: missing ${name} property.`);
  property.value = value;
}

const files = await tiledLevelFiles(root);
for (const { file: sourceFile, mapId } of files) {
  const sourcePath = path.join(root, "art", "tiled", "maps", sourceFile);
  const map = JSON.parse(await readFile(sourcePath, "utf8"));
  const expected = expectedGameplayObjects(mapId);
  const playerCastle = findObject(map, "CastleAnchor", "player");
  const enemyCastle = findObject(map, "CastleAnchor", "enemy");
  const playerDeploy = findObject(map, "DeployZone", "player");
  const enemySpawn = findObject(map, "SpawnZone", "enemy");
  if (!playerCastle || !enemyCastle || !playerDeploy || !enemySpawn) {
    throw new Error(`${sourceFile}: missing CastleAnchor, DeployZone, or SpawnZone object.`);
  }
  applyRect(playerCastle, expected.playerCastle);
  applyRect(enemyCastle, expected.enemyCastle);
  applyRect(playerDeploy, expected.playerDeploy);
  applyRect(enemySpawn, expected.enemySpawn);
  setProperty(playerCastle, "anchorX", expected.playerCastle.anchorX);
  setProperty(playerCastle, "anchorY", expected.playerCastle.anchorY);
  setProperty(enemyCastle, "anchorX", expected.enemyCastle.anchorX);
  setProperty(enemyCastle, "anchorY", expected.enemyCastle.anchorY);
  await writeFile(sourcePath, `${JSON.stringify(map)}\n`);
}

console.log(`Aligned gameplay objects to ${files.length} reference maps.`);
