import { isCavalryUnit, isRangedUnit, type UnitConfig } from "../config/units.config";
import type { LevelConfig, UnitWeightTable } from "../types/LevelTypes";
import type { BattleMapConfig } from "../types/MapTypes";
import type { UnitId } from "../types/UnitTypes";

export interface UnitRuntimeStats {
  hp: number;
  damage: number;
  range: number;
  releaseRange: number;
  visionRange: number;
  visionReleaseRange: number;
  cooldown: number;
  speed: number;
  castleDamage: number;
}

export function weightedPickUnit(
  weights: UnitWeightTable,
  allowedUnitIds: UnitId[],
  roll: number,
): UnitId {
  const candidates = allowedUnitIds
    .map((unitId) => ({ unitId, weight: Math.max(0, weights[unitId] ?? 0) }))
    .filter((candidate) => candidate.weight > 0);

  if (candidates.length === 0) {
    const index = Math.min(allowedUnitIds.length - 1, Math.floor(roll * allowedUnitIds.length));
    return allowedUnitIds[Math.max(0, index)] ?? "swordsman";
  }

  const totalWeight = candidates.reduce((total, candidate) => total + candidate.weight, 0);
  let cursor = Math.max(0, Math.min(0.999999, roll)) * totalWeight;

  for (const candidate of candidates) {
    cursor -= candidate.weight;

    if (cursor <= 0) {
      return candidate.unitId;
    }
  }

  return candidates[candidates.length - 1].unitId;
}

export function effectiveEnemySpawnInterval(level: LevelConfig) {
  return level.enemy.spawnIntervalMs;
}

export function applyUnitRuntimeStats(
  base: UnitConfig,
  level: LevelConfig,
  map: BattleMapConfig,
  team: "player" | "enemy",
): UnitRuntimeStats {
  const enemyHp = team === "enemy" ? level.difficulty.enemyHpMultiplier : 1;
  const enemyDamage = team === "enemy" ? level.difficulty.enemyDamageMultiplier : 1;
  const modifiers = map.modifiers;
  const speedMultiplier =
    modifiers.globalSpeedMultiplier *
    (isCavalryUnit(base.id) ? modifiers.horsemanSpeedMultiplier : 1);
  const rangedRangeMultiplier = isRangedUnit(base.id) ? modifiers.archerRangeMultiplier : 1;
  const mageDamageMultiplier = base.id === "mage" ? modifiers.mageDamageMultiplier : 1;
  const shieldHpMultiplier = base.id === "mace_guard" ? modifiers.shieldGuardHpMultiplier : 1;

  return {
    hp: Math.round(base.hp * enemyHp * shieldHpMultiplier),
    damage: Math.round(base.damage * enemyDamage * mageDamageMultiplier),
    range: Math.round(base.range * rangedRangeMultiplier),
    releaseRange: Math.round(base.releaseRange * rangedRangeMultiplier),
    visionRange: Math.round(base.visionRange * rangedRangeMultiplier),
    visionReleaseRange: Math.round(base.visionReleaseRange * rangedRangeMultiplier),
    cooldown: base.cooldown,
    speed: base.speed * speedMultiplier,
    castleDamage: Math.round(base.castleDamage * enemyDamage),
  };
}

export function difficultySummary(level: LevelConfig, map: BattleMapConfig) {
  return `order=${level.order} ai=${level.enemy.aiProfile} enemyHp=${level.difficulty.enemyHpMultiplier.toFixed(2)} enemyDmg=${level.difficulty.enemyDamageMultiplier.toFixed(2)} spawn=${effectiveEnemySpawnInterval(level)}ms biome=${map.biome}`;
}
