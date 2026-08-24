import type { BattleStartData } from "../systems/LevelRuntime";

export type StoryBubbleKind = "caption" | "speech";

export interface StoryBubble {
  kind: StoryBubbleKind;
  text: string;
  speaker?: string;
  x: number;
  y: number;
  width: number;
  align?: "left" | "center" | "right";
}

export interface StoryPage {
  image: string;
  title?: string;
  bubbles: StoryBubble[];
}

export interface CampaignStoryEntry {
  title: string;
  body: string;
  objective: string;
  image: string;
}

export interface CampaignStoryData {
  language: "en";
  prologue: { pages: StoryPage[] };
  levels: Record<string, CampaignStoryEntry>;
}

export interface StorySceneData {
  battleStartData: BattleStartData;
}
