import type { BiomeId, ProceduralVisualId, ResourceNodeConfig } from "../types/MapTypes";

export type LibraryCategory = "flora" | "stone_wood" | "ground" | "water" | "signature" | "legacy" | "resource";
export type AssetCollision = "none" | "water";

export interface MapAssetDefinition {
  key: string;
  path: string;
  atlasKey: string;
  frame: string;
  biome: BiomeId | "shared";
  label: string;
  category: "decoration" | "obstacle" | "resource";
  libraryCategory: LibraryCategory;
  renderLayer: "ground" | "world";
  collision: AssetCollision;
  defaultScale: number;
  defaultDepth?: number;
  footprintRadius: number;
  searchTerms: string[];
  featuredMapId?: string;
}

export interface ProceduralVisualDefinition {
  id: ProceduralVisualId;
  label: string;
  libraryCategory: "flora" | "stone_wood" | "resource";
  defaultScale: number;
  footprintRadius: number;
  resourceType?: ResourceNodeConfig["type"];
}

export const PROCEDURAL_VISUALS: readonly ProceduralVisualDefinition[] = [
  { id: "pine_tall", label: "Uzun Çam", libraryCategory: "flora", defaultScale: 0.82, footprintRadius: 25, resourceType: "tree" },
  { id: "pine_dense", label: "Yoğun Çam", libraryCategory: "flora", defaultScale: 0.78, footprintRadius: 29, resourceType: "tree" },
  { id: "pine_young", label: "Genç Çam", libraryCategory: "flora", defaultScale: 0.64, footprintRadius: 19, resourceType: "tree" },
  { id: "pine_snow", label: "Karlı Çam", libraryCategory: "flora", defaultScale: 0.8, footprintRadius: 27, resourceType: "tree" },
  { id: "broadleaf_tree", label: "Geniş Yapraklı Ağaç", libraryCategory: "flora", defaultScale: 0.78, footprintRadius: 30, resourceType: "tree" },
  { id: "dead_tree", label: "Kuru Ağaç", libraryCategory: "flora", defaultScale: 0.8, footprintRadius: 25, resourceType: "tree" },
  { id: "burned_tree", label: "Yanmış Ağaç", libraryCategory: "flora", defaultScale: 0.8, footprintRadius: 25, resourceType: "tree" },
  { id: "rock_cluster", label: "Kaya Kümesi", libraryCategory: "stone_wood", defaultScale: 0.82, footprintRadius: 27, resourceType: "ore" },
  { id: "pebbles", label: "Çakıl", libraryCategory: "stone_wood", defaultScale: 0.7, footprintRadius: 18 },
  { id: "branch", label: "Dal", libraryCategory: "stone_wood", defaultScale: 0.72, footprintRadius: 18 },
  { id: "fallen_log", label: "Kütük", libraryCategory: "stone_wood", defaultScale: 0.78, footprintRadius: 27 },
  { id: "reeds", label: "Sazlık", libraryCategory: "flora", defaultScale: 0.72, footprintRadius: 19 },
  { id: "cactus", label: "Kaktüs", libraryCategory: "flora", defaultScale: 0.76, footprintRadius: 21, resourceType: "tree" },
  { id: "crystal", label: "Kristal", libraryCategory: "resource", defaultScale: 0.76, footprintRadius: 23, resourceType: "crystal" },
  { id: "obsidian", label: "Obsidyen", libraryCategory: "resource", defaultScale: 0.76, footprintRadius: 24, resourceType: "ore" },
  { id: "lava_vent", label: "Lav Bacası", libraryCategory: "resource", defaultScale: 0.76, footprintRadius: 24, resourceType: "lava_rock" },
];

export const PROCEDURAL_VISUALS_BY_ID = Object.fromEntries(
  PROCEDURAL_VISUALS.map((definition) => [definition.id, definition]),
) as Record<ProceduralVisualId, ProceduralVisualDefinition>;

const title = (name: string) => name.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
const legacy = (biome: BiomeId, name: string, label: string, category: MapAssetDefinition["category"], scale: number, radius: number): MapAssetDefinition => ({
  key: `map-prop-${biome}-${name}`, path: `maps/props/${biome}/${name}.png`, atlasKey: `map-props-${biome}`,
  frame: `${name}.png`, biome, label, category, libraryCategory: category === "resource" ? "resource" : "legacy",
  renderLayer: "world", collision: "none", defaultScale: scale, footprintRadius: radius, searchTerms: [name, label, biome],
});

const expanded = (biome: BiomeId, name: string, category: LibraryCategory, featuredMapId?: string): MapAssetDefinition => {
  const water = category === "water";
  const ground = category === "ground" || water;
  return {
    key: `map-prop-${biome}-${name}`, path: `maps/props/${biome}/${name}.png`, atlasKey: `map-props-${biome}`,
    frame: `${name}.png`, biome, label: title(name), category: "decoration", libraryCategory: featuredMapId ? "signature" : category,
    renderLayer: ground ? "ground" : "world", collision: water ? "water" : "none",
    defaultScale: ground ? 0.34 : 0.24, defaultDepth: ground ? 6 : undefined,
    footprintRadius: water ? 64 : ground ? 34 : 20, searchTerms: [name, title(name), biome, category], featuredMapId,
  };
};

const sharedPine: MapAssetDefinition = {
  key: "map-prop-shared-pine-tree", path: "maps/props/shared/pine-tree.png", atlasKey: "map-props-shared", frame: "pine-tree.png",
  biome: "shared", label: "Çam Ağacı", category: "decoration", libraryCategory: "flora", renderLayer: "world", collision: "none",
  defaultScale: 0.28, footprintRadius: 26, searchTerms: ["çam", "pine", "tree", "ağaç", "shared"],
};

const BIOME_ITEMS: Record<BiomeId, Array<[string, LibraryCategory]>> = {
  grasslands: [["wildflower-patch", "flora"], ["poppy-clump", "flora"], ["daisy-clump", "flora"], ["grass-tuft", "flora"], ["clover-patch", "flora"], ["pebble-scatter", "stone_wood"], ["fallen-branch", "stone_wood"], ["mossy-stump", "stone_wood"], ["dirt-patch", "ground"], ["meadow-soil", "ground"], ["shallow-puddle", "ground"], ["round-pond", "water"]],
  silent_forest: [["fern-cluster", "flora"], ["mushroom-ring", "flora"], ["leaf-litter", "ground"], ["exposed-roots", "stone_wood"], ["pinecone-scatter", "ground"], ["moss-patch", "ground"], ["fallen-twig", "stone_wood"], ["forest-stone", "stone_wood"], ["dark-forest-soil", "ground"], ["forest-stream", "water"], ["tiny-puddle", "ground"], ["ancient-stump", "stone_wood"]],
  muddy_fields: [["cattail-tuft", "flora"], ["lily-pads", "flora"], ["swamp-grass", "flora"], ["mud-splatter", "ground"], ["wet-mud", "ground"], ["marsh-stone", "stone_wood"], ["driftwood", "stone_wood"], ["small-puddle", "ground"], ["marsh-pond", "water"], ["swamp-mushroom", "flora"], ["waterlogged-branch", "stone_wood"], ["reed-shore", "flora"]],
  storm_valley: [["heather-bush", "flora"], ["wind-grass", "flora"], ["slate-pebbles", "stone_wood"], ["slate-rock", "stone_wood"], ["lichen-patch", "ground"], ["wet-earth", "ground"], ["rain-puddle", "ground"], ["mountain-stream", "water"], ["broken-branch", "stone_wood"], ["wind-shrub", "flora"], ["crystal-shard", "stone_wood"], ["scorched-soil", "ground"]],
  dry_steppe: [["dry-grass", "flora"], ["thorn-bush", "flora"], ["steppe-pebbles", "stone_wood"], ["small-sandstone", "stone_wood"], ["dry-twig", "stone_wood"], ["cracked-earth", "ground"], ["dust-ground", "ground"], ["dry-creek", "ground"], ["steppe-flower", "flora"], ["tumbleweed", "flora"], ["brittle-shrub", "flora"], ["bleached-wood", "stone_wood"]],
  desert: [["small-cactus", "flora"], ["desert-shrub", "flora"], ["sand-ripple", "ground"], ["desert-pebbles", "stone_wood"], ["small-sandstone", "stone_wood"], ["desert-twig", "stone_wood"], ["palm-debris", "stone_wood"], ["beetle-tracks", "ground"], ["sunbaked-sand", "ground"], ["oasis-pond", "water"], ["desert-flower", "flora"], ["prickly-bush", "flora"]],
  frozen_pass: [["snow-drift", "ground"], ["ice-stone", "stone_wood"], ["ice-shard", "stone_wood"], ["frost-grass", "flora"], ["packed-snow", "ground"], ["cracked-ice", "ground"], ["icy-stream", "water"], ["frozen-pond", "water"], ["snowy-branch", "stone_wood"], ["blue-ice-boulder", "stone_wood"], ["ice-flower", "flora"], ["snow-pebbles", "ground"]],
  infernal_dungeon: [["ash-pile", "ground"], ["black-pebbles", "stone_wood"], ["charred-wood", "stone_wood"], ["obsidian-shard", "stone_wood"], ["lava-crack", "ground"], ["burnt-earth", "ground"], ["ember-grass", "flora"], ["ash-swirl", "ground"], ["warm-ash-trace", "ground"], ["scorched-stump", "stone_wood"], ["ember-mushroom", "flora"], ["blackened-stone", "stone_wood"]],
};

const SIGNATURES: Array<[BiomeId, string, string]> = [
  ["grasslands", "bluebell-meadow", "grasslands_01"], ["grasslands", "butterfly-bloom", "grasslands_02"],
  ["silent_forest", "foxglove-cluster", "silent_forest_01"], ["silent_forest", "mossy-hooftrail", "silent_forest_02"], ["silent_forest", "elderwood-stump", "silent_forest_03"],
  ["muddy_fields", "cattail-crown", "muddy_fields_01"], ["muddy_fields", "lily-pad-crown", "muddy_fields_02"], ["muddy_fields", "bog-mushroom-circle", "muddy_fields_03"],
  ["storm_valley", "storm-scar-bush", "storm_valley_01"], ["storm_valley", "rainwater-rill", "storm_valley_02"], ["storm_valley", "charged-crystal-sprig", "storm_valley_03"],
  ["dry_steppe", "steppe-thistle", "dry_steppe_01"], ["dry_steppe", "dusty-grass-whorl", "dry_steppe_02"], ["dry_steppe", "windflower-clump", "dry_steppe_03"],
  ["desert", "oasis-reed-crown", "desert_01"], ["desert", "beetle-trail-crown", "desert_02"],
  ["frozen_pass", "ice-flower-crown", "frozen_pass_01"], ["frozen_pass", "snowy-log-crown", "frozen_pass_02"],
  ["infernal_dungeon", "ember-mushroom-crown", "infernal_dungeon_01"], ["infernal_dungeon", "ash-blossom-crown", "ash_citadel_final"],
];

export const MAP_ASSETS: readonly MapAssetDefinition[] = [
  legacy("grasslands", "oak", "Meşe Ağacı", "resource", 0.3, 30), legacy("grasslands", "wheat", "Buğday Tarlası", "decoration", 0.34, 28), legacy("grasslands", "fence", "Çiftlik Çiti", "obstacle", 0.34, 30), legacy("grasslands", "cottage", "Çiftlik Evi", "obstacle", 0.32, 42),
  legacy("silent_forest", "pine-cluster", "Çam Kümesi", "resource", 0.32, 34), legacy("silent_forest", "moss-rock", "Yosunlu Kaya", "obstacle", 0.3, 30), legacy("silent_forest", "fallen-log", "Devrilmiş Kütük", "obstacle", 0.34, 34), legacy("silent_forest", "watchtower", "Orman Gözetleme Kulesi", "obstacle", 0.3, 40),
  legacy("muddy_fields", "dead-tree", "Kuru Ağaç", "resource", 0.31, 30), legacy("muddy_fields", "reeds", "Sazlık", "decoration", 0.34, 22), legacy("muddy_fields", "mud-pool", "Çamur Havuzu", "decoration", 0.38, 36), legacy("muddy_fields", "log-bridge", "Kütük Köprü", "obstacle", 0.36, 38),
  legacy("storm_valley", "cliff-rock", "Uçurum Kayası", "obstacle", 0.32, 34), legacy("storm_valley", "lightning-mast", "Yıldırım Direği", "obstacle", 0.29, 34), legacy("storm_valley", "ruined-arch", "Yıkık Kemer", "obstacle", 0.32, 40), legacy("storm_valley", "storm-crystal", "Fırtına Kristali", "resource", 0.29, 28),
  legacy("dry_steppe", "cracked-rock", "Çatlak Kaya", "obstacle", 0.31, 32), legacy("dry_steppe", "dry-bush", "Kuru Çalı", "decoration", 0.3, 22), legacy("dry_steppe", "banner", "Yol Sancağı", "decoration", 0.3, 24), legacy("dry_steppe", "supply-wagon", "Erzak Arabası", "obstacle", 0.31, 40),
  legacy("desert", "cactus", "Kaktüs", "decoration", 0.3, 24), legacy("desert", "palm", "Palmiye", "resource", 0.31, 30), legacy("desert", "sandstone-ruin", "Kumtaşı Harabesi", "obstacle", 0.31, 40), legacy("desert", "bone-pile", "Kemik Yığını", "decoration", 0.31, 24),
  legacy("frozen_pass", "snow-pine", "Karlı Çam", "resource", 0.31, 30), legacy("frozen_pass", "ice-crystal", "Buz Kristali", "resource", 0.29, 26), legacy("frozen_pass", "ice-rock", "Buz Kayası", "obstacle", 0.31, 32), legacy("frozen_pass", "frozen-tower", "Donmuş Kule", "obstacle", 0.29, 42),
  legacy("infernal_dungeon", "obsidian-spike", "Obsidyen İğne", "obstacle", 0.3, 30), legacy("infernal_dungeon", "lava-vent", "Lav Bacası", "resource", 0.3, 28), legacy("infernal_dungeon", "burned-tree", "Yanmış Ağaç", "decoration", 0.31, 26), legacy("infernal_dungeon", "infernal-ruin", "Cehennem Harabesi", "obstacle", 0.31, 42),
  sharedPine,
  ...Object.entries(BIOME_ITEMS).flatMap(([biome, items]) => items.map(([name, category]) => expanded(biome as BiomeId, name, category))),
  ...SIGNATURES.map(([biome, name, mapId]) => expanded(biome, name, "signature", mapId)),
];

export const MAP_ASSETS_BY_KEY = Object.fromEntries(MAP_ASSETS.map((definition) => [definition.key, definition])) as Record<string, MapAssetDefinition>;
export const RESOURCE_ASSET_BY_TYPE: Record<ResourceNodeConfig["type"], string> = { tree: "map-prop-grasslands-oak", crystal: "map-prop-frozen_pass-ice-crystal", ore: "map-prop-storm_valley-storm-crystal", lava_rock: "map-prop-infernal_dungeon-lava-vent" };
export const mapAssetsForBiome = (biome: BiomeId) => MAP_ASSETS.filter((definition) => definition.biome === biome || definition.biome === "shared");
export const MAP_PROP_ATLASES = [...new Set(MAP_ASSETS.map((definition) => definition.biome))].map((biome) => ({ biome, key: `map-props-${biome}`, imagePath: `maps/atlases/${biome}.png`, dataPath: `maps/atlases/${biome}.json` }));
