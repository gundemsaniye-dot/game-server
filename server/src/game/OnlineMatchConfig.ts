import { ONLINE_MAP_CONTRACT } from "./OnlineMapContract";

export const ONLINE_MATCH_CONFIG = {
  mapId: ONLINE_MAP_CONTRACT.mapId,
  // Online matches have no time-limit result; they end by castle destruction
  // or disconnect. Zero communicates that the server timer is unlimited.
  durationMs: 0,
  startingGold: 8,
  passiveGoldAmount: 1,
  passiveGoldIntervalMs: 4_000,
  workerDeliveryGold: 6,
  workerGatherIntervalMs: 680,
  workerCarryCapacity: 3,
  resourceAmount: 12,
  resourceRespawnMs: 12_000,
  castleHp: 2_500,
  workerCap: 2,
  leftCastleFrontX: ONLINE_MAP_CONTRACT.castleContactX.left,
  rightCastleFrontX: ONLINE_MAP_CONTRACT.castleContactX.right,
  resourceRespawnNearMin: 82,
  resourceRespawnNearMax: 150,
  resourceSeparation: 64,
  deployBounds: ONLINE_MAP_CONTRACT.deployBounds,
  powers: {
    missile: { cooldownMs: 35_000, radius: 67, damage: 9_999, impactDelayMs: 520, minLocalX: 92 },
    ice: { cooldownMs: 45_000, radius: 72, durationMs: 6_000, impactDelayMs: 0 },
  },
} as const;

export interface OnlineUnitStats {
  cost: number;
  hp: number;
  damage: number;
  range: number;
  speed: number;
  cooldownMs: number;
  castleDamage: number;
  worker?: boolean;
}

export const ONLINE_UNIT_STATS: Record<string, OnlineUnitStats> = {
  peasant: { cost: 2, hp: 62, damage: 0, range: 28, speed: 32, cooldownMs: 1_200, castleDamage: 0, worker: true },
  swordsman: { cost: 4, hp: 115, damage: 18, range: 42, speed: 43, cooldownMs: 810, castleDamage: 13 },
  archer: { cost: 5, hp: 78, damage: 13, range: 109, speed: 35, cooldownMs: 1_120, castleDamage: 8 },
  horseman: { cost: 10, hp: 230, damage: 29, range: 48, speed: 59, cooldownMs: 1_000, castleDamage: 24 },
  long_spearman: { cost: 6, hp: 96, damage: 16, range: 68, speed: 42, cooldownMs: 900, castleDamage: 10 },
  mace_guard: { cost: 8, hp: 260, damage: 13, range: 46, speed: 30, cooldownMs: 1_050, castleDamage: 18 },
  mage: { cost: 10, hp: 86, damage: 20, range: 178, speed: 34, cooldownMs: 1_400, castleDamage: 9 },
  knife_thrower: { cost: 7, hp: 86, damage: 14, range: 154, speed: 48, cooldownMs: 760, castleDamage: 6 },
};
