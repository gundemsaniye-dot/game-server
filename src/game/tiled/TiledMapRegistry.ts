import type { TiledBattleMapDefinition } from "./TiledTypes";

const MAP_BIOMES = {
  grasslands_01: "grasslands", grasslands_02: "grasslands",
  silent_forest_01: "silent_forest", silent_forest_02: "silent_forest", silent_forest_03: "silent_forest",
  muddy_fields_01: "muddy_fields", muddy_fields_02: "muddy_fields", muddy_fields_03: "muddy_fields",
  storm_valley_01: "storm_valley", storm_valley_02: "storm_valley", storm_valley_03: "storm_valley",
  dry_steppe_01: "dry_steppe", dry_steppe_02: "dry_steppe", dry_steppe_03: "dry_steppe",
  desert_01: "desert", desert_02: "desert",
  frozen_pass_01: "frozen_pass", frozen_pass_02: "frozen_pass",
  infernal_dungeon_01: "infernal_dungeon", ash_citadel_final: "infernal_dungeon",
} as const;

const REFERENCE_MAP_LEVEL: Record<keyof typeof MAP_BIOMES, number> = Object.fromEntries(
  Object.keys(MAP_BIOMES).map((mapId, index) => [mapId, index + 1]),
) as Record<keyof typeof MAP_BIOMES, number>;

function createDefinition(mapId: keyof typeof MAP_BIOMES): TiledBattleMapDefinition {
  const referenceLevel = REFERENCE_MAP_LEVEL[mapId];
  const tilesetName = `reference-map-${referenceLevel}`;
  return {
    mapId,
    tilemapKey: `tiled-${mapId}`,
    mapUrl: `tiled/maps/${mapId}.json`,
    tilesets: [{
      tiledName: tilesetName,
      textureKey: `tiles-${tilesetName}`,
      imageUrl: `tiled/tilesets/reference-map-${referenceLevel}.png`,
    }, {
      tiledName: "navigation-bridge",
      textureKey: "tiles-navigation-bridge",
      imageUrl: "tiled/tilesets/navigation-bridge.png",
    }, {
      tiledName: "navigation-blocked",
      textureKey: "tiles-navigation-blocked",
      imageUrl: "tiled/tilesets/navigation-blocked.png",
    }, {
      tiledName: "navigation-cost",
      textureKey: "tiles-navigation-cost",
      imageUrl: "tiled/tilesets/navigation-cost.png",
    }],
    mode: "tiled-hybrid",
    renderLegacyTerrain: false,
    renderLegacyObjects: false,
    renderLegacyResources: true,
    useTiledNavigation: true,
    usesReferenceVisuals: true,
    referenceTextureKey: `reference-preview-${referenceLevel}`,
    referenceImageUrl: `tiled/tilesets/reference-preview-${referenceLevel}.png`,
  };
}

/** All campaign maps now share one external-TSJ-to-runtime-JSON pipeline. */
export const TILED_BATTLE_MAPS: Record<string, TiledBattleMapDefinition> = Object.fromEntries(
  Object.keys(MAP_BIOMES).map((mapId) => [mapId, createDefinition(mapId as keyof typeof MAP_BIOMES)]),
);

export function getTiledBattleMapDefinition(mapId: string) {
  return TILED_BATTLE_MAPS[mapId];
}
