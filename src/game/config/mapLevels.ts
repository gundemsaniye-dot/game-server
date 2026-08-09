export type MapBiome = "grasslands" | "mountain_pass" | "frost_fire";

export interface MapLevelConfig {
  id: number;
  mapId: string;
  title: string;
  biome: MapBiome;
  x: number;
  y: number;
}

export interface BattleStartData {
  levelId: number;
  mapId: string;
  biome: MapBiome;
}

export const MAP_WORLD = {
  width: 4096,
  height: 1365,
  viewportWidth: 1280,
  viewportHeight: 720,
} as const;

export const MAP_LEVELS: readonly MapLevelConfig[] = [
  {
    id: 1,
    mapId: "green_road",
    title: "Green Road",
    biome: "grasslands",
    x: 430,
    y: 600,
  },
  {
    id: 2,
    mapId: "stone_pass",
    title: "Stone Pass",
    biome: "mountain_pass",
    x: 2040,
    y: 370,
  },
  {
    id: 3,
    mapId: "frost_gate",
    title: "Frost Gate",
    biome: "frost_fire",
    x: 3440,
    y: 420,
  },
];
