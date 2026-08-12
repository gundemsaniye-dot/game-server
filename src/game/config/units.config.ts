import type { UnitId, UnitRole, UnitTarget, UnitVisualId } from "../types/UnitTypes";

export interface UnitConfig {
  id: UnitId;
  label: string;
  shortLabel: string;
  role: UnitRole;
  cost: number;
  hp: number;
  damage: number;
  range: number;
  releaseRange: number;
  visionRange: number;
  visionReleaseRange: number;
  fovDegrees: number;
  cooldown: number;
  speed: number;
  castleDamage: number;
  damageMultipliers?: Partial<Record<UnitId, number>>;
  targetPriority: UnitTarget[];
  tags: string[];
  visualAs: UnitVisualId;
  unlockLevel: number;
  economy?: {
    carryLimit: number;
    gatherIntervalMs: number;
    depositGold: number;
  };
  areaDamage?: {
    radius: number;
    splashMultiplier: number;
  };
  support?: {
    healAmount: number;
    healIntervalMs: number;
    auraRadius: number;
  };
}

export const UNIT_CONFIGS: Record<UnitId, UnitConfig> = {
  peasant: {
    id: "peasant",
    label: "Worker",
    shortLabel: "WORK",
    role: "economy",
    cost: 2,
    hp: 62,
    damage: 0,
    range: 28,
    releaseRange: 46,
    visionRange: 90,
    visionReleaseRange: 130,
    fovDegrees: 84,
    cooldown: 1200,
    speed: 32,
    castleDamage: 0,
    targetPriority: ["resource"],
    tags: ["worker", "light"],
    visualAs: "peasant",
    unlockLevel: 1,
    economy: { carryLimit: 3, gatherIntervalMs: 680, depositGold: 6 },
  },
  swordsman: {
    id: "swordsman",
    label: "Sword",
    shortLabel: "SWORD",
    role: "melee",
    cost: 4,
    hp: 115,
    damage: 18,
    range: 42,
    releaseRange: 62,
    visionRange: 230,
    visionReleaseRange: 300,
    // Forward combat cone. A small separate proximity bubble handles enemies
    // that physically reach the unit's shoulders; this cone must stay narrow.
    fovDegrees: 150,
    cooldown: 810,
    speed: 43,
    castleDamage: 13,
    damageMultipliers: { long_spearman: 1.2, knife_thrower: 1.15 },
    targetPriority: ["unit", "castle"],
    tags: ["melee", "basic"],
    visualAs: "swordsman",
    unlockLevel: 1,
  },
  archer: {
    id: "archer",
    label: "Archer",
    shortLabel: "ARCH",
    role: "ranged",
    cost: 5,
    hp: 78,
    damage: 13,
    range: 109,
    releaseRange: 130,
    visionRange: 310,
    visionReleaseRange: 375,
    fovDegrees: 130,
    cooldown: 1120,
    speed: 35,
    castleDamage: 8,
    damageMultipliers: {
      swordsman: 1.15,
      long_spearman: 1.15,
      horseman: 0.75,
      mace_guard: 0.75,
    },
    targetPriority: ["unit", "castle"],
    tags: ["ranged", "light"],
    visualAs: "archer",
    unlockLevel: 1,
  },
  horseman: {
    id: "horseman",
    label: "Horse",
    shortLabel: "HORSE",
    role: "cavalry",
    cost: 10,
    hp: 230,
    damage: 29,
    range: 48,
    releaseRange: 70,
    visionRange: 260,
    visionReleaseRange: 330,
    fovDegrees: 150,
    cooldown: 1000,
    speed: 59,
    castleDamage: 24,
    damageMultipliers: {
      archer: 1.35,
      mage: 1.35,
      knife_thrower: 1.3,
      long_spearman: 0.65,
    },
    targetPriority: ["unit", "castle"],
    tags: ["cavalry", "fast"],
    visualAs: "horseman",
    unlockLevel: 1,
  },
  long_spearman: {
    id: "long_spearman",
    label: "Long Spear",
    shortLabel: "PIKE",
    role: "counter",
    cost: 6,
    hp: 96,
    damage: 16,
    range: 68,
    releaseRange: 92,
    visionRange: 245,
    visionReleaseRange: 315,
    fovDegrees: 150,
    cooldown: 900,
    speed: 42,
    castleDamage: 10,
    damageMultipliers: { horseman: 1.6, swordsman: 0.85 },
    targetPriority: ["unit", "castle"],
    tags: ["melee", "anti_cavalry", "long_reach"],
    visualAs: "long_spearman",
    unlockLevel: 6,
  },
  mace_guard: {
    id: "mace_guard",
    label: "Mace Guard",
    shortLabel: "MACE",
    role: "tank",
    cost: 8,
    hp: 260,
    damage: 13,
    range: 46,
    releaseRange: 66,
    visionRange: 218,
    visionReleaseRange: 286,
    fovDegrees: 160,
    cooldown: 1050,
    speed: 30,
    castleDamage: 18,
    damageMultipliers: {
      swordsman: 1.15,
      long_spearman: 1.15,
      mage: 0.8,
    },
    targetPriority: ["unit", "castle"],
    tags: ["tank", "slow", "stun", "castle_breaker"],
    visualAs: "mace_guard",
    unlockLevel: 10,
  },
  mage: {
    id: "mage",
    label: "Mage",
    shortLabel: "MAGE",
    role: "magic",
    cost: 10,
    hp: 86,
    damage: 20,
    range: 178,
    releaseRange: 218,
    visionRange: 302,
    visionReleaseRange: 360,
    fovDegrees: 130,
    cooldown: 1400,
    speed: 34,
    castleDamage: 9,
    damageMultipliers: { mace_guard: 1.45 },
    targetPriority: ["unit", "castle"],
    tags: ["magic", "aoe", "fragile", "ranged"],
    visualAs: "mage",
    unlockLevel: 18,
    areaDamage: { radius: 70, splashMultiplier: 0.65 },
    support: { healAmount: 3, healIntervalMs: 2200, auraRadius: 105 },
  },
  knife_thrower: {
    id: "knife_thrower",
    label: "Knife Thrower",
    shortLabel: "KNIFE",
    role: "ranged",
    cost: 7,
    hp: 86,
    damage: 14,
    range: 154,
    releaseRange: 194,
    visionRange: 284,
    visionReleaseRange: 344,
    fovDegrees: 140,
    cooldown: 760,
    speed: 48,
    castleDamage: 6,
    damageMultipliers: { peasant: 1.4, mage: 1.35, mace_guard: 0.7 },
    targetPriority: ["unit", "castle"],
    tags: ["ranged", "light", "fast"],
    visualAs: "knife_thrower",
    unlockLevel: 14,
  },
};

export const UNIT_ORDER: UnitId[] = [
  "peasant",
  "swordsman",
  "archer",
  "horseman",
  "long_spearman",
  "mace_guard",
  "knife_thrower",
  "mage",
];

export const BASE_PLAYER_UNIT_IDS: readonly UnitId[] = [
  "peasant",
  "swordsman",
  "archer",
  "horseman",
];

export const DEFAULT_COMBAT_LOADOUT: readonly UnitId[] = [
  "swordsman",
  "archer",
  "horseman",
];

export const UNIT_UNLOCK_AFTER_LEVEL: Partial<Record<UnitId, number>> = {
  long_spearman: 5,
  mace_guard: 9,
  knife_thrower: 13,
  mage: 17,
};

export const BASE_VISUAL_UNIT_IDS: UnitVisualId[] = [
  "horseman",
  "archer",
  "swordsman",
  "peasant",
  "long_spearman",
  "mace_guard",
  "mage",
  "knife_thrower",
];

export function isWorkerUnit(unitId: UnitId) {
  return UNIT_CONFIGS[unitId].role === "economy";
}

export function isRangedUnit(unitId: UnitId) {
  return UNIT_CONFIGS[unitId].tags.includes("ranged") || UNIT_CONFIGS[unitId].role === "magic";
}

export function isCavalryUnit(unitId: UnitId) {
  return UNIT_CONFIGS[unitId].role === "cavalry";
}

export function visualUnitId(unitId: UnitId): UnitVisualId {
  return UNIT_CONFIGS[unitId].visualAs;
}
