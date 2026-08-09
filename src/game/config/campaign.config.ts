import type { CampaignConfig, CampaignNodeConfig } from "../types/CampaignTypes";

export const CAMPAIGN_WORLD = {
  width: 4096,
  height: 1365,
  viewportWidth: 1280,
  viewportHeight: 720,
} as const;

export const CAMPAIGN_NODES: readonly CampaignNodeConfig[] = [
  { levelId: "level_001", x: 430, y: 600, nodeType: "normal", regionId: "grasslands" },
  { levelId: "level_002", x: 650, y: 430, nodeType: "normal", regionId: "grasslands" },
  { levelId: "level_003", x: 860, y: 760, nodeType: "normal", regionId: "silent_forest" },
  { levelId: "level_004", x: 1065, y: 535, nodeType: "normal", regionId: "silent_forest" },
  { levelId: "level_005", x: 1265, y: 880, nodeType: "elite", regionId: "silent_forest" },
  { levelId: "level_006", x: 1485, y: 520, nodeType: "normal", regionId: "muddy_fields" },
  { levelId: "level_007", x: 1660, y: 300, nodeType: "normal", regionId: "muddy_fields" },
  { levelId: "level_008", x: 1840, y: 660, nodeType: "elite", regionId: "muddy_fields" },
  { levelId: "level_009", x: 2025, y: 385, nodeType: "normal", regionId: "storm_valley" },
  { levelId: "level_010", x: 2190, y: 820, nodeType: "normal", regionId: "storm_valley" },
  { levelId: "level_011", x: 2380, y: 505, nodeType: "boss", regionId: "storm_valley" },
  { levelId: "level_012", x: 2570, y: 820, nodeType: "normal", regionId: "dry_steppe" },
  { levelId: "level_013", x: 2740, y: 480, nodeType: "normal", regionId: "dry_steppe" },
  { levelId: "level_014", x: 2925, y: 730, nodeType: "elite", regionId: "dry_steppe" },
  { levelId: "level_015", x: 3100, y: 465, nodeType: "normal", regionId: "desert" },
  { levelId: "level_016", x: 3270, y: 820, nodeType: "elite", regionId: "desert" },
  { levelId: "level_017", x: 3450, y: 455, nodeType: "normal", regionId: "frozen_pass" },
  { levelId: "level_018", x: 3605, y: 690, nodeType: "boss", regionId: "frozen_pass" },
  { levelId: "level_019", x: 3785, y: 430, nodeType: "boss", regionId: "infernal_dungeon" },
  // Keep the final pin inside the camera-safe area. At x=3960 its badge and
  // label were clipped by the 4096px world edge at the normal map zoom.
  { levelId: "level_020", x: 3860, y: 705, nodeType: "final", regionId: "infernal_dungeon" },
];

export const MAIN_CAMPAIGN: CampaignConfig = {
  id: "main_campaign",
  backgroundKey: "world-map-v1",
  worldWidth: CAMPAIGN_WORLD.width,
  worldHeight: CAMPAIGN_WORLD.height,
  viewportWidth: CAMPAIGN_WORLD.viewportWidth,
  viewportHeight: CAMPAIGN_WORLD.viewportHeight,
  nodes: CAMPAIGN_NODES,
};
