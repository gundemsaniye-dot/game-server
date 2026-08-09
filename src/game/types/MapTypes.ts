import type { UnitId } from "./UnitTypes";

export const BATTLE_MAP_SCHEMA_VERSION = 4 as const;

export type BiomeId =
  | "grasslands"
  | "silent_forest"
  | "muddy_fields"
  | "storm_valley"
  | "dry_steppe"
  | "desert"
  | "frozen_pass"
  | "infernal_dungeon";

export type WeatherType =
  | "none"
  | "mist"
  | "rain"
  | "storm"
  | "dust"
  | "sandstorm"
  | "snow"
  | "embers";

export interface MapPoint {
  x: number;
  y: number;
}

export interface BiomeModifiers {
  globalSpeedMultiplier: number;
  archerRangeMultiplier: number;
  horsemanSpeedMultiplier: number;
  peasantGatherMultiplier: number;
  mageDamageMultiplier: number;
  shieldGuardHpMultiplier: number;
}

export interface MapAnchorConfig extends MapPoint {
  locked: true;
}

export interface MapZoneConfig {
  x: number;
  width: number;
  minY: number;
  maxY: number;
  locked: true;
}

export interface TerrainPatchConfig extends MapPoint {
  id: string;
  shape: "ellipse" | "rectangle";
  width: number;
  height: number;
  color: number;
  alpha: number;
  rotation: number;
  depth: number;
  material: GroundMaterialId;
  collision: TerrainCollision;
  variant: number;
}

export type GroundMaterialId =
  | "grass"
  | "soil"
  | "forest_floor"
  | "mud"
  | "dry_soil"
  | "sand"
  | "snow"
  | "stone"
  | "ash"
  | "water"
  | "lava";

export type TerrainCollision = "none" | "water" | "lava";

export type ProceduralVisualId =
  | "pine_tall"
  | "pine_dense"
  | "pine_young"
  | "pine_snow"
  | "broadleaf_tree"
  | "dead_tree"
  | "burned_tree"
  | "rock_cluster"
  | "pebbles"
  | "branch"
  | "fallen_log"
  | "reeds"
  | "cactus"
  | "crystal"
  | "obsidian"
  | "lava_vent";

export type MapVisualConfig =
  | { source: "procedural"; id: ProceduralVisualId; variant: number }
  | { source: "asset"; assetKey: string };

export interface TerrainConfig {
  baseColor: number;
  laneColor: number;
  laneHighlightColor: number;
  laneEdgeColor: number;
  patches: TerrainPatchConfig[];
}

export interface ResourceNodeConfig extends MapPoint {
  id: string;
  type: "tree" | "crystal" | "ore" | "lava_rock";
  amount: number;
  visual: MapVisualConfig;
  scale: number;
  rotation: number;
  depth: number;
}

export interface LaneConfig {
  id: "top" | "middle" | "bottom";
  width: number;
  points: MapPoint[];
}

export interface MapObjectConfig extends MapPoint {
  id: string;
  kind: "decoration" | "obstacle";
  visual: MapVisualConfig;
  scale: number;
  rotation: number;
  depth: number;
  footprintRadius: number;
  blocksDeploy: boolean;
}

export interface BattleMapConfig {
  schemaVersion: typeof BATTLE_MAP_SCHEMA_VERSION;
  id: string;
  displayName: string;
  biome: BiomeId;
  seed: number;
  world: { width: 1280; height: 720 };
  anchors: {
    playerCastle: MapAnchorConfig;
    enemyCastle: MapAnchorConfig;
  };
  deployZone: MapZoneConfig;
  enemySpawnZone: MapZoneConfig;
  terrain: TerrainConfig;
  lanes: LaneConfig[];
  resources: ResourceNodeConfig[];
  objects: MapObjectConfig[];
  modifiers: BiomeModifiers;
  weather: { type: WeatherType; intensity: number };
  recommendedUnits: UnitId[];
}

export interface CampaignMapBundle {
  kind: "castle-raid-map-bundle";
  schemaVersion: typeof BATTLE_MAP_SCHEMA_VERSION;
  maps: BattleMapConfig[];
}

export interface SingleMapExport {
  kind: "castle-raid-map";
  schemaVersion: typeof BATTLE_MAP_SCHEMA_VERSION;
  map: BattleMapConfig;
}
