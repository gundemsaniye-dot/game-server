import type { TiledBattleMapDefinition } from "./TiledTypes";
import {
  CAMPAIGN_MAP_PACKAGE_ASSIGNMENTS,
  type CampaignMapId,
  type CampaignMapPackageAssignment,
} from "../../../shared/maps/CampaignMapPackages";

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

/**
 * The generated reference images were imported in the wrong campaign order.
 * Remap complete authored packages here; never mix a reference image with a
 * different TMJ because its navigation, bridges and castle anchors are drawn
 * specifically for that image.
 */
export { CAMPAIGN_MAP_PACKAGE_ASSIGNMENTS };

export function validateCampaignMapPackageAssignments() {
  const errors: string[] = [];
  const assignments = Object.entries(CAMPAIGN_MAP_PACKAGE_ASSIGNMENTS) as [CampaignMapId, CampaignMapPackageAssignment][];
  const sourceLevels = new Set<number>();
  const sourceMapIds = new Set<string>();
  for (const [mapId, assignment] of assignments) {
    if (sourceLevels.has(assignment.sourcePackageLevel)) errors.push(`${mapId} reuses source package ${assignment.sourcePackageLevel}`);
    if (sourceMapIds.has(assignment.sourceMapId)) errors.push(`${mapId} reuses source map ${assignment.sourceMapId}`);
    sourceLevels.add(assignment.sourcePackageLevel);
    sourceMapIds.add(assignment.sourceMapId);
  }
  if (assignments.length !== 20 || sourceLevels.size !== 20 || sourceMapIds.size !== 20) {
    errors.push(`campaign package permutation must contain 20 unique complete packages`);
  }
  return errors;
}

function createDefinition(mapId: CampaignMapId): TiledBattleMapDefinition {
  const assignment = CAMPAIGN_MAP_PACKAGE_ASSIGNMENTS[mapId];
  const referenceLevel = assignment.sourcePackageLevel;
  const tilesetName = `reference-map-${referenceLevel}`;
  return {
    mapId,
    sourceMapId: assignment.sourceMapId,
    sourcePackageLevel: referenceLevel,
    visualBiome: assignment.visualBiome,
    tilemapKey: `tiled-${mapId}`,
    mapUrl: `tiled/maps/${assignment.sourceMapId}.json`,
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
  Object.keys(MAP_BIOMES).map((mapId) => [mapId, createDefinition(mapId as CampaignMapId)]),
);

export function getTiledBattleMapDefinition(mapId: string) {
  return TILED_BATTLE_MAPS[mapId];
}
