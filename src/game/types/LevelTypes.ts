import type { BiomeId } from "./MapTypes";
import type { UnitId } from "./UnitTypes";

export type EnemyAiProfile =
  | "tutorial"
  | "balanced"
  | "rush"
  | "defensive"
  | "ranged"
  | "heavy"
  | "infernal";

export type EncounterType = "normal" | "elite" | "boss" | "final";

export interface EnemyPowerRule {
  cooldownMs: number;
  initialReadyMs: number;
  minCluster: number;
  minArmyGold: number;
}

export interface EnemyPowerConfig {
  targetingPolicy: "castle_defense";
  defenseRadius: number;
  telegraphMs: number;
  globalLockoutMs: number;
  maxCastsPerMatch: number;
  maxCastsPerPower: number;
  missile?: EnemyPowerRule;
  ice?: EnemyPowerRule;
}

export interface PlayerPowerProgressionConfig {
  iceUnlockLevel: number;
  missileUnlockLevel: number;
}

export type UnitWeightTable = Partial<Record<UnitId, number>>;

export type DirectorPhaseKind =
  | "opening"
  | "pressure"
  | "peak"
  | "relief"
  | "counterattack"
  | "siege";

export type DirectorLanePattern = "center" | "alternating" | "pincer";

export interface DirectorPhaseConfig {
  id: string;
  kind: DirectorPhaseKind;
  scheduledRatio: number;
  castleThresholdRatio: number;
  intensity: number;
  budgetShare: number;
  unitWeights: UnitWeightTable;
}

export interface DirectorVariantConfig {
  id: string;
  timingOffsetRatio: number;
  lanePattern: DirectorLanePattern;
}

export type MasteryGoalType =
  | "economy"
  | "counter_kills"
  | "worker_safety"
  | "castle_health"
  | "combined_arms";

export interface MasteryGoalConfig {
  type: MasteryGoalType;
  target: number;
  label: string;
}

export interface LevelConfig {
  id: string;
  order: number;
  title: string;
  mapId: string;
  regionId: BiomeId;
  encounterType: EncounterType;
  story: {
    intro: string;
    victory: string;
    defeatHint: string;
  };
  tactics: {
    lesson: string;
    peakEvent: string;
    strategies: [string, string];
  };
  duration: {
    targetSeconds: number;
    normalTolerance: number;
    skilledFloorRatio: number;
    overtimeRatio: number;
    hardStopRatio: number;
    tempoRampStartRatio: number;
    tempoAtTarget: number;
    tempoAtOvertime: number;
    castleDamagePacing: number;
  };
  director: {
    reserveBudget: number;
    warningMs: number;
    phases: DirectorPhaseConfig[];
    variants: DirectorVariantConfig[];
  };
  masteryGoal: MasteryGoalConfig;
  player: {
    startGold: number;
    castleHp: number;
    powers: PlayerPowerProgressionConfig;
  };
  enemy: {
    castleHp: number;
    startGold: number;
    aiProfile: EnemyAiProfile;
    spawnIntervalMs: number;
    workerTarget: number;
    powers: EnemyPowerConfig;
    allowedUnits: UnitId[];
    unitWeights: UnitWeightTable;
  };
  economy: {
    passiveGoldIntervalMs: number;
    passiveGoldAmount: number;
    maxWorkers: number;
    resourceRespawnMs: number;
  };
  difficulty: {
    enemyHpMultiplier: number;
    enemyDamageMultiplier: number;
  };
  rewards: {
    gold: number;
    starsAvailable: 3;
    unlockNextLevel?: string;
    unlockUnit?: UnitId;
  };
}
