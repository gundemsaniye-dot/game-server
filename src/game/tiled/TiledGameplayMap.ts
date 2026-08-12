import type { BattleMapConfig } from "../types/MapTypes";
import { createSideGeometry, type AxisAlignedBounds, type SideGeometry } from "../../../shared/online/SideGeometry";

type TiledObject = Phaser.Types.Tilemaps.TiledObject & { class?: string };

const GAMEPLAY_LAYER = "GAMEPLAY_ZONES";

function cloneMap(map: BattleMapConfig): BattleMapConfig {
  return JSON.parse(JSON.stringify(map)) as BattleMapConfig;
}

function objectType(object: TiledObject) {
  return object.type || object.class || "";
}

function properties(object: TiledObject) {
  return new Map<string, unknown>(
    object.properties?.map((property: { name?: string; value?: unknown }) => [property.name ?? "", property.value]) ?? [],
  );
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function objectsFrom(tilemap: Phaser.Tilemaps.Tilemap) {
  return (tilemap.getObjectLayer(GAMEPLAY_LAYER)?.objects ?? []) as TiledObject[];
}

function objectCenter(object: TiledObject) {
  return {
    x: (object.x ?? 0) + (object.width ?? 0) / 2,
    y: (object.y ?? 0) + (object.height ?? 0) / 2,
  };
}

function castleAnchorPoint(object: TiledObject) {
  const props = properties(object);
  const anchorX = props.get("anchorX");
  const anchorY = props.get("anchorY");
  if (finite(anchorX) && finite(anchorY)) {
    return { x: anchorX, y: anchorY };
  }
  return objectCenter(object);
}

function zoneFrom(object: TiledObject) {
  const x = object.x ?? 0;
  const y = object.y ?? 0;
  const width = object.width ?? 0;
  const height = object.height ?? 0;
  return {
    x: x + width / 2,
    width,
    minY: y,
    maxY: y + height,
    locked: true as const,
  };
}

function boundsFrom(object: TiledObject): AxisAlignedBounds {
  const minX = object.x ?? 0;
  const minY = object.y ?? 0;
  return {
    minX,
    maxX: minX + (object.width ?? 0),
    minY,
    maxY: minY + (object.height ?? 0),
  };
}

export function onlineSideGeometry(
  tilemap: Phaser.Tilemaps.Tilemap,
  side: "left" | "right",
): SideGeometry | undefined {
  const objects = objectsFrom(tilemap);
  const team = side === "left" ? "player" : "enemy";
  const deployType = side === "left" ? "DeployZone" : "SpawnZone";
  const castle = objects.find((object) =>
    objectType(object) === "CastleAnchor" && properties(object).get("team") === team
  );
  const deploy = objects.find((object) =>
    objectType(object) === deployType && properties(object).get("team") === team && properties(object).get("enabled") !== false
  );
  if (!castle || !deploy) return undefined;
  return createSideGeometry(
    side,
    boundsFrom(deploy),
    boundsFrom(castle),
    { minX: 120, maxX: tilemap.widthInPixels - 120, minY: 52, maxY: tilemap.heightInPixels - 52 },
    side === "right" ? 35 : 0,
  );
}

export function applyTiledGameplayObjects(
  base: BattleMapConfig,
  tilemap: Phaser.Tilemaps.Tilemap,
): BattleMapConfig {
  const objects = objectsFrom(tilemap);
  const map = cloneMap(base);
  const castles = objects.filter((object) => objectType(object) === "CastleAnchor");
  const primaryCastle = (team: "player" | "enemy") => castles.find((object) => {
    const props = properties(object);
    return props.get("team") === team && props.get("isPrimary") !== false;
  });
  const playerCastle = primaryCastle("player");
  const enemyCastle = primaryCastle("enemy");
  if (playerCastle) map.anchors.playerCastle = { ...castleAnchorPoint(playerCastle), locked: true };
  if (enemyCastle) map.anchors.enemyCastle = { ...castleAnchorPoint(enemyCastle), locked: true };

  const playerDeploy = objects.find((object) =>
    objectType(object) === "DeployZone" && properties(object).get("team") === "player" && properties(object).get("enabled") !== false
  );
  const enemySpawn = objects.find((object) =>
    objectType(object) === "SpawnZone" && properties(object).get("team") === "enemy" && properties(object).get("enabled") !== false
  );
  if (playerDeploy) map.deployZone = zoneFrom(playerDeploy);
  if (enemySpawn) map.enemySpawnZone = zoneFrom(enemySpawn);

  return map;
}
