export const CAMPAIGN_MAP_PACKAGE_ASSIGNMENTS = {
  grasslands_01: { sourceMapId: "muddy_fields_01", sourcePackageLevel: 6, visualBiome: "grasslands" },
  grasslands_02: { sourceMapId: "silent_forest_03", sourcePackageLevel: 5, visualBiome: "grasslands" },
  silent_forest_01: { sourceMapId: "dry_steppe_03", sourcePackageLevel: 14, visualBiome: "forest" },
  silent_forest_02: { sourceMapId: "storm_valley_03", sourcePackageLevel: 11, visualBiome: "wetlands" },
  silent_forest_03: { sourceMapId: "frozen_pass_01", sourcePackageLevel: 17, visualBiome: "forest" },
  muddy_fields_01: { sourceMapId: "dry_steppe_01", sourcePackageLevel: 12, visualBiome: "forest" },
  muddy_fields_02: { sourceMapId: "desert_02", sourcePackageLevel: 16, visualBiome: "wetlands" },
  muddy_fields_03: { sourceMapId: "storm_valley_01", sourcePackageLevel: 9, visualBiome: "wetlands" },
  storm_valley_01: { sourceMapId: "silent_forest_01", sourcePackageLevel: 3, visualBiome: "snow" },
  storm_valley_02: { sourceMapId: "silent_forest_02", sourcePackageLevel: 4, visualBiome: "snow" },
  storm_valley_03: { sourceMapId: "muddy_fields_03", sourcePackageLevel: 8, visualBiome: "snow" },
  dry_steppe_01: { sourceMapId: "muddy_fields_02", sourcePackageLevel: 7, visualBiome: "grasslands" },
  dry_steppe_02: { sourceMapId: "dry_steppe_02", sourcePackageLevel: 13, visualBiome: "grasslands" },
  dry_steppe_03: { sourceMapId: "storm_valley_02", sourcePackageLevel: 10, visualBiome: "rocky" },
  desert_01: { sourceMapId: "frozen_pass_02", sourcePackageLevel: 18, visualBiome: "desert" },
  desert_02: { sourceMapId: "infernal_dungeon_01", sourcePackageLevel: 19, visualBiome: "desert" },
  frozen_pass_01: { sourceMapId: "grasslands_01", sourcePackageLevel: 1, visualBiome: "snow" },
  frozen_pass_02: { sourceMapId: "grasslands_02", sourcePackageLevel: 2, visualBiome: "snow" },
  infernal_dungeon_01: { sourceMapId: "desert_01", sourcePackageLevel: 15, visualBiome: "mystic" },
  ash_citadel_final: { sourceMapId: "ash_citadel_final", sourcePackageLevel: 20, visualBiome: "infernal" },
} as const;

export type CampaignMapId = keyof typeof CAMPAIGN_MAP_PACKAGE_ASSIGNMENTS;
export type CampaignMapPackageAssignment = (typeof CAMPAIGN_MAP_PACKAGE_ASSIGNMENTS)[CampaignMapId];

export function campaignMapPackageFor(mapId: string) {
  return CAMPAIGN_MAP_PACKAGE_ASSIGNMENTS[mapId as CampaignMapId] ??
    CAMPAIGN_MAP_PACKAGE_ASSIGNMENTS.grasslands_01;
}
