import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { castleContactX } from "../../../shared/online/CastleContact";
import { createSideGeometry, type AxisAlignedBounds, type SideGeometry } from "../../../shared/online/SideGeometry";

interface TiledProperty {
  name: string;
  value: unknown;
}

interface TiledObject {
  type?: string;
  class?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  properties?: TiledProperty[];
}

interface TiledLayer {
  name?: string;
  width?: number;
  height?: number;
  data?: number[];
  objects?: TiledObject[];
}

interface TiledMap {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: TiledLayer[];
  properties?: TiledProperty[];
}

export interface OnlineMapContract {
  mapId: string;
  worldWidth: number;
  worldHeight: number;
  castleContactX: { left: number; right: number };
  tileSize: number;
  columns: number;
  rows: number;
  blocked: boolean[];
  bridges: boolean[];
  sides: Record<"left" | "right", SideGeometry>;
  deployBounds: {
    left: { minX: number; maxX: number; minY: number; maxY: number };
    right: { minX: number; maxX: number; minY: number; maxY: number };
  };
}

const mapPath = resolve(__dirname, "../../../public/assets/tiled/maps/grasslands_01.json");

function property(properties: TiledProperty[] | undefined, name: string) {
  return properties?.find((candidate) => candidate.name === name)?.value;
}

function finite(value: number | undefined, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Online TMJ contract is missing ${label}.`);
  }
  return value;
}

function loadOnlineMapContract(): OnlineMapContract {
  const map = JSON.parse(readFileSync(mapPath, "utf8")) as TiledMap;
  const gameplay = map.layers.find((layer) => layer.name === "GAMEPLAY_ZONES");
  if (!gameplay?.objects) throw new Error("Online TMJ contract is missing GAMEPLAY_ZONES.");

  const objectFor = (type: string, team: string) => gameplay.objects?.find((object) =>
    (object.type === type || object.class === type) && property(object.properties, "team") === team
  );
  const playerCastle = objectFor("CastleAnchor", "player");
  const enemyCastle = objectFor("CastleAnchor", "enemy");
  const playerDeploy = objectFor("DeployZone", "player");
  const enemySpawn = objectFor("SpawnZone", "enemy");
  if (!playerCastle || !enemyCastle || !playerDeploy || !enemySpawn) {
    throw new Error("Online TMJ contract requires both castles and both deployment zones.");
  }

  const zone = (object: TiledObject, label: string) => {
    const minX = finite(object.x, `${label}.x`);
    const minY = finite(object.y, `${label}.y`);
    return {
      minX,
      maxX: minX + finite(object.width, `${label}.width`),
      minY,
      maxY: minY + finite(object.height, `${label}.height`),
    };
  };
  const bounds = (object: TiledObject, label: string): AxisAlignedBounds => zone(object, label);
  const blockedLayer = map.layers.find((layer) => layer.name === "NAV_BLOCKED");
  const bridgeLayer = map.layers.find((layer) => layer.name === "05_BRIDGES");
  const cellCount = map.width * map.height;
  if (blockedLayer?.data?.length !== cellCount || bridgeLayer?.data?.length !== cellCount) {
    throw new Error("Online TMJ contract requires complete NAV_BLOCKED and 05_BRIDGES layers.");
  }
  const world = { minX: 120, maxX: map.width * map.tilewidth - 120, minY: 52, maxY: map.height * map.tileheight - 52 };
  const leftDeploy = bounds(playerDeploy, "playerDeploy");
  const rightDeploy = bounds(enemySpawn, "enemySpawn");
  const leftCastle = bounds(playerCastle, "playerCastle");
  const rightCastle = bounds(enemyCastle, "enemyCastle");

  return {
    mapId: String(property(map.properties, "mapId") ?? "frozen_pass_01"),
    worldWidth: map.width * map.tilewidth,
    worldHeight: map.height * map.tileheight,
    tileSize: map.tilewidth,
    columns: map.width,
    rows: map.height,
    blocked: blockedLayer.data.map((gid, index) => gid !== 0 && bridgeLayer.data![index] === 0),
    bridges: bridgeLayer.data.map((gid) => gid !== 0),
    castleContactX: {
      left: castleContactX(leftCastle, "left"),
      right: castleContactX(rightCastle, "right"),
    },
    deployBounds: {
      left: leftDeploy,
      right: rightDeploy,
    },
    sides: {
      left: createSideGeometry("left", leftDeploy, leftCastle, world, 0),
      right: createSideGeometry("right", rightDeploy, rightCastle, world, 35),
    },
  };
}

export const ONLINE_MAP_CONTRACT = Object.freeze(loadOnlineMapContract());
