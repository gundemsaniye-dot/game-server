import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { tiledLevelFiles } from "./lib/tiled-level-manifest.mjs";
import { requireTmjMutationApproval } from "./lib/require-tmj-mutation-approval.mjs";

requireTmjMutationApproval("simplify-tiled-maps");

const root = process.cwd();
const mapsRoot = path.join(root, "art", "tiled", "maps");
const gameplayTypes = new Set(["CastleAnchor", "DeployZone", "SpawnZone"]);

function objectType(object) {
  return object.type || object.class || "";
}

function propertyValue(object, name) {
  return object.properties?.find((property) => property.name === name)?.value;
}

function property(name, type, value) {
  return { name, type, value };
}

function simplifyObject(object) {
  const type = objectType(object);
  const team = propertyValue(object, "team");
  const base = {
    id: object.id,
    name: team === "player"
      ? type === "CastleAnchor" ? "playerCastle" : "playerDeploy"
      : type === "CastleAnchor" ? "enemyCastle" : "enemySpawn",
    type,
    x: object.x,
    y: object.y,
    width: object.width,
    height: object.height,
    rotation: 0,
    visible: true,
    properties: [property("team", "string", team)],
  };
  if (type === "CastleAnchor") {
    base.properties.push(
      property("anchorX", "float", propertyValue(object, "anchorX")),
      property("anchorY", "float", propertyValue(object, "anchorY")),
      property("blocksNavigation", "bool", true),
    );
  }
  return base;
}

for (const { file, mapId } of await tiledLevelFiles(root)) {
  const mapPath = path.join(mapsRoot, file);
  const map = JSON.parse(await readFile(mapPath, "utf8"));
  const originalObjects = map.layers
    .filter((layer) => layer.type === "objectgroup")
    .flatMap((layer) => layer.objects ?? []);
  const gameplayObjects = originalObjects
    .filter((object) => gameplayTypes.has(objectType(object)))
    .filter((object) => {
      const type = objectType(object);
      const team = propertyValue(object, "team");
      return (type === "CastleAnchor" && ["player", "enemy"].includes(team))
        || (type === "DeployZone" && team === "player")
        || (type === "SpawnZone" && team === "enemy");
    })
    .map(simplifyObject)
    .sort((first, second) => {
      const order = ["playerCastle", "playerDeploy", "enemySpawn", "enemyCastle"];
      return order.indexOf(first.name) - order.indexOf(second.name);
    });

  const counts = new Map(gameplayObjects.map((object) => [object.name, 0]));
  gameplayObjects.forEach((object) => counts.set(object.name, (counts.get(object.name) ?? 0) + 1));
  for (const name of ["playerCastle", "playerDeploy", "enemySpawn", "enemyCastle"]) {
    if (counts.get(name) !== 1) throw new Error(`${file}: expected exactly one ${name}.`);
  }

  const preview = map.layers.find((layer) => layer.name === "REFERENCE_ART_PREVIEW" && layer.type === "imagelayer");
  const blocked = map.layers.find((layer) => layer.name === "NAV_BLOCKED" && layer.type === "tilelayer");
  const bridges = map.layers.find((layer) => layer.name === "05_BRIDGES" && layer.type === "tilelayer");
  if (!preview || !blocked || !bridges) throw new Error(`${file}: missing preview or navigation layers.`);

  const oldGameplayLayer = map.layers.find((layer) => layer.name === "GAMEPLAY_ZONES")
    ?? map.layers.find((layer) => layer.type === "objectgroup");
  const gameplayLayer = {
    id: oldGameplayLayer?.id ?? Math.max(...map.layers.map((layer) => layer.id ?? 0)) + 1,
    name: "GAMEPLAY_ZONES",
    type: "objectgroup",
    x: 0,
    y: 0,
    opacity: 1,
    visible: true,
    draworder: "topdown",
    objects: gameplayObjects,
  };

  Object.assign(preview, { visible: true, opacity: 1, locked: true });
  Object.assign(blocked, { visible: true, opacity: 0.55 });
  Object.assign(bridges, { visible: true, opacity: 0.82 });
  map.layers = [preview, blocked, bridges, gameplayLayer];
  map.tilesets = map.tilesets.filter((tileset) => !String(tileset.source ?? tileset.name ?? "").includes("navigation-cost"));
  map.nextlayerid = Math.max(...map.layers.map((layer) => layer.id ?? 0)) + 1;
  map.nextobjectid = Math.max(...gameplayObjects.map((object) => object.id ?? 0)) + 1;
  await writeFile(mapPath, `${JSON.stringify(map)}\n`);
  console.log(`Simplified ${file} (${mapId}).`);
}
