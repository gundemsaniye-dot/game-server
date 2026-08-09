import type { BiomeId } from "./MapTypes";

export type CampaignNodeType = "normal" | "elite" | "boss" | "final";
export type CampaignNodeState = "locked" | "open" | "completed" | "current";

export interface CampaignNodeConfig {
  levelId: string;
  x: number;
  y: number;
  nodeType: CampaignNodeType;
  regionId: BiomeId;
}

export interface CampaignConfig {
  id: string;
  backgroundKey: string;
  worldWidth: number;
  worldHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  nodes: readonly CampaignNodeConfig[];
}
