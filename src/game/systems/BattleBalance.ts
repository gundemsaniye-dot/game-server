import {
  DEFAULT_COMBAT_LOADOUT,
  UNIT_CONFIGS,
  UNIT_UNLOCK_AFTER_LEVEL,
  isRangedUnit,
  isWorkerUnit,
} from "../config/units.config";
import type { LevelConfig } from "../types/LevelTypes";
import type { UnitId } from "../types/UnitTypes";
import type { AdaptiveDifficultyBand } from "./AdaptiveDifficulty";

export type BalanceResult = "victory" | "defeat";
export type BalanceClassification =
  | "too_easy"
  | "too_hard"
  | "too_short"
  | "too_long"
  | "on_target";

export interface MatchDurationTarget {
  targetSeconds: number;
  minSeconds: number;
  maxSeconds: number;
  skilledFloorSeconds: number;
  timeoutSeconds: number;
}

export interface BalanceTeamMetrics {
  passiveGold: number;
  workerGold: number;
  spentGold: number;
  unitsSpawned: Partial<Record<UnitId, number>>;
  unitsLost: Partial<Record<UnitId, number>>;
  workerDeaths: number;
  carriedWoodLost: number;
  castleDamageDealt: number;
  maxWorkers: number;
  maxCombatUnits: number;
  deliveries: number;
  workerIdleMs: number;
  zeroWorkerMs: number;
  longestZeroWorkerMs: number;
  workerReplacementCount: number;
  workerReplacementMs: number;
  longestWorkerReplacementMs: number;
}

export interface EconomyTelemetryEvent {
  second: number;
  team: "player" | "enemy";
  type: "start" | "passive" | "worker_delivery" | "queue" | "spawn" | "refund" | "worker_reserve";
  amount: number;
  bank: number;
  detail?: string;
}

export interface PowerTelemetryEvent {
  second: number;
  team: "player" | "enemy";
  power: "missile" | "ice";
  type: "decision" | "opportunity" | "telegraph" | "cast";
  targetCount: number;
  affectedCount?: number;
  damage?: number;
  reason?: string;
  targetX?: number;
  targetY?: number;
  castleDistance?: number;
  decisionDelayMs?: number;
  castIndex?: number;
  powerCastIndex?: number;
  escapedCount?: number;
  primaryTargetType?: UnitId;
  targetPolicyViolation?: boolean;
}

export interface EnemyPowerSummary {
  opportunities: number;
  telegraphs: number;
  casts: number;
  missileCasts: number;
  iceCasts: number;
  maxDecisionDelayMs: number;
  targetingViolations: number;
  workerPrimaryTargets: number;
  escapedUnits: number;
}

export interface StallTelemetryEvent {
  second: number;
  type: "zero_workers" | "no_defenders" | "seal_wait" | "overtime" | "hard_stop";
  durationMs?: number;
  detail?: string;
}

export interface BalanceSnapshot {
  second: number;
  fps: number;
  jsHeapMb: number | null;
  playerGold: number;
  enemyGold: number;
  playerCastleHp: number;
  enemyCastleHp: number;
  playerWorkers: number;
  enemyWorkers: number;
  playerCombatUnits: number;
  enemyCombatUnits: number;
  playerFrontX: number | null;
  enemyFrontX: number | null;
  playerWorkerState: string[];
  enemyWorkerState: string[];
  tension: number;
  frontControl: number;
  playerIncomeLast60: number;
  enemyIncomeLast60: number;
  playerArmyGold: number;
  enemyArmyGold: number;
  combatTempo: number;
  avgSimulationMs: number;
  avgUnitUpdateMs: number;
}

export interface DirectorTelemetryEvent {
  second: number;
  type: "phase" | "warning" | "spawn" | "complete" | "final_siege";
  phaseId?: string;
  triggerReason?: string;
  delayReason?: string;
  budget?: number;
  units?: UnitId[];
}

export interface BattleBalanceReport {
  schema: 3;
  configVersion: "adaptive-campaign-v3";
  levelId: string;
  order: number;
  seed: number;
  simulationSpeed: number;
  qaStyle: string;
  adaptationBand: AdaptiveDifficultyBand;
  result: BalanceResult;
  durationSeconds: number;
  targetDuration: MatchDurationTarget;
  classification: BalanceClassification;
  referenceLoadout: UnitId[];
  enemyLoadout: UnitId[];
  config: {
    enemyHpMultiplier: number;
    enemyDamageMultiplier: number;
    enemyDecisionMs: number;
    enemyCastleHp: number;
    resourceNodes: number;
    castleDamagePacing: number;
  };
  ending: {
    playerGold: number;
    enemyGold: number;
    playerCastleHp: number;
    playerCastleHpRatio: number;
    enemyCastleHp: number;
    enemyCastleHpRatio: number;
  };
  player: BalanceTeamMetrics;
  enemy: BalanceTeamMetrics;
  director: {
    variant: string;
    reserveBudget: number;
    reserveSpent: number;
    phases: DirectorTelemetryEvent[];
  };
  matchupKills: Record<string, number>;
  economyEvents: EconomyTelemetryEvent[];
  powerEvents: PowerTelemetryEvent[];
  powerSummary: {
    enemy: EnemyPowerSummary;
  };
  stallEvents: StallTelemetryEvent[];
  defeatReason?: string;
  snapshots: BalanceSnapshot[];
}

const createTeamMetrics = (): BalanceTeamMetrics => ({
  passiveGold: 0,
  workerGold: 0,
  spentGold: 0,
  unitsSpawned: {},
  unitsLost: {},
  workerDeaths: 0,
  carriedWoodLost: 0,
  castleDamageDealt: 0,
  maxWorkers: 0,
  maxCombatUnits: 0,
  deliveries: 0,
  workerIdleMs: 0,
  zeroWorkerMs: 0,
  longestZeroWorkerMs: 0,
  workerReplacementCount: 0,
  workerReplacementMs: 0,
  longestWorkerReplacementMs: 0,
});

export function targetMatchDuration(level: LevelConfig): MatchDurationTarget {
  const targetSeconds = level.duration.targetSeconds;
  return {
    targetSeconds,
    minSeconds: Math.round(targetSeconds * (1 - level.duration.normalTolerance)),
    maxSeconds: Math.round(targetSeconds * (1 + level.duration.normalTolerance)),
    skilledFloorSeconds: Math.round(targetSeconds * level.duration.skilledFloorRatio),
    timeoutSeconds: Math.round(targetSeconds * level.duration.hardStopRatio),
  };
}

export function unlockedCombatUnitsAtLevel(order: number): UnitId[] {
  const unlocked = [...DEFAULT_COMBAT_LOADOUT];

  for (const [unitId, completedLevel] of Object.entries(UNIT_UNLOCK_AFTER_LEVEL) as Array<[
    UnitId,
    number,
  ]>) {
    if (completedLevel < order) unlocked.push(unitId);
  }

  return unlocked;
}

function counterScore(attackerId: UnitId, targetId: UnitId) {
  const attacker = UNIT_CONFIGS[attackerId];
  const multiplier = attacker.damageMultipliers?.[targetId] ?? 1;
  const dps = attacker.damage / Math.max(1, attacker.cooldown / 1000);
  const durability = attacker.hp / Math.max(1, attacker.cost);
  const rangedUtility = isRangedUnit(attackerId) ? 0.08 : 0;
  return multiplier * dps / Math.sqrt(attacker.cost) + durability * 0.12 + rangedUtility;
}

/** A deterministic, legal loadout for the balance bot. It only uses units
 * unlocked before the tested level and chooses a different counter for each
 * weighted enemy card where possible. */
export function referenceLoadoutForLevel(level: LevelConfig): UnitId[] {
  const unlocked = unlockedCombatUnitsAtLevel(level.order);
  const enemyCards = level.enemy.allowedUnits
    .filter((unitId) => !isWorkerUnit(unitId))
    .sort(
      (left, right) =>
        (level.enemy.unitWeights[right] ?? 0) -
        (level.enemy.unitWeights[left] ?? 0),
    );
  const selected: UnitId[] = [];

  for (const enemyId of enemyCards) {
    const best = unlocked
      .filter((unitId) => !selected.includes(unitId))
      .sort((left, right) => counterScore(right, enemyId) - counterScore(left, enemyId))[0];
    if (best) selected.push(best);
  }

  for (const fallback of unlocked) {
    if (selected.length >= 3) break;
    if (!selected.includes(fallback)) selected.push(fallback);
  }

  // A counter score alone can pick three melee cards against a protected
  // ranged deck. The balanced reference style must actually represent
  // combined arms, so reserve one card for ranged pressure when available.
  if (!selected.some((unitId) => isRangedUnit(unitId))) {
    const bestRanged = unlocked
      .filter((unitId) => isRangedUnit(unitId))
      .sort((left, right) => {
        const weightedDeckScore = (unitId: UnitId) => enemyCards.reduce(
          (total, enemyId) =>
            total +
            counterScore(unitId, enemyId) *
              ((level.enemy.unitWeights[enemyId] ?? 0) / 100),
          0,
        );
        return weightedDeckScore(right) - weightedDeckScore(left);
      })[0];
    if (bestRanged) selected[Math.min(2, selected.length - 1)] = bestRanged;
  }

  return selected.slice(0, 3);
}

export class BattleTelemetry {
  readonly player = createTeamMetrics();
  readonly enemy = createTeamMetrics();
  readonly snapshots: BalanceSnapshot[] = [];
  readonly directorEvents: DirectorTelemetryEvent[] = [];
  readonly economyEvents: EconomyTelemetryEvent[] = [];
  readonly powerEvents: PowerTelemetryEvent[] = [];
  readonly stallEvents: StallTelemetryEvent[] = [];
  readonly matchupKills: Record<string, number> = {};
  private readonly zeroWorkerStreakMs = { player: 0, enemy: 0 };
  directorVariant = "unknown";
  reserveBudget = 0;
  reserveSpent = 0;
  defeatReason?: string;

  constructor(
    readonly level: LevelConfig,
    readonly seed: number,
    readonly simulationSpeed: number,
    readonly referenceLoadout: UnitId[],
    readonly resourceNodeCount: number,
    readonly adaptationBand: AdaptiveDifficultyBand = "standard",
    readonly qaStyle = "manual",
  ) {}

  team(team: "player" | "enemy") {
    return team === "player" ? this.player : this.enemy;
  }

  recordSpawn(team: "player" | "enemy", unitId: UnitId, paidWithGold = true) {
    const metrics = this.team(team);
    metrics.unitsSpawned[unitId] = (metrics.unitsSpawned[unitId] ?? 0) + 1;
    if (paidWithGold) metrics.spentGold += UNIT_CONFIGS[unitId].cost;
  }

  recordLoss(team: "player" | "enemy", unitId: UnitId, carriedWood: number) {
    const metrics = this.team(team);
    metrics.unitsLost[unitId] = (metrics.unitsLost[unitId] ?? 0) + 1;
    if (isWorkerUnit(unitId)) {
      metrics.workerDeaths += 1;
      metrics.carriedWoodLost += carriedWood;
    }
  }

  recordDelivery(team: "player" | "enemy") {
    this.team(team).deliveries += 1;
  }

  recordWorkerIdle(team: "player" | "enemy", idleMs: number) {
    this.team(team).workerIdleMs += Math.max(0, idleMs);
  }

  recordMatchupKill(attackerId: UnitId, targetId: UnitId) {
    const key = `${attackerId}>${targetId}`;
    this.matchupKills[key] = (this.matchupKills[key] ?? 0) + 1;
  }

  recordDirectorEvent(event: DirectorTelemetryEvent) {
    this.directorEvents.push(event);
  }

  recordEconomyEvent(event: EconomyTelemetryEvent) {
    this.economyEvents.push(event);
  }

  recordPowerEvent(event: PowerTelemetryEvent) {
    this.powerEvents.push(event);
  }

  recordStallEvent(event: StallTelemetryEvent) {
    this.stallEvents.push(event);
  }

  recordWorkerReplacement(team: "player" | "enemy", durationMs: number) {
    const metrics = this.team(team);
    metrics.workerReplacementCount += 1;
    metrics.workerReplacementMs += Math.max(0, durationMs);
    metrics.longestWorkerReplacementMs = Math.max(metrics.longestWorkerReplacementMs, durationMs);
  }

  recordPopulation(
    team: "player" | "enemy",
    workers: number,
    combatUnits: number,
    sampleMs = 0,
  ) {
    const metrics = this.team(team);
    metrics.maxWorkers = Math.max(metrics.maxWorkers, workers);
    metrics.maxCombatUnits = Math.max(metrics.maxCombatUnits, combatUnits);
    if (workers === 0 && sampleMs > 0) {
      metrics.zeroWorkerMs += sampleMs;
      this.zeroWorkerStreakMs[team] += sampleMs;
      metrics.longestZeroWorkerMs = Math.max(
        metrics.longestZeroWorkerMs,
        this.zeroWorkerStreakMs[team],
      );
    } else if (workers > 0) {
      this.zeroWorkerStreakMs[team] = 0;
    }
  }

  addSnapshot(snapshot: BalanceSnapshot) {
    this.snapshots.push(snapshot);
  }

  finish(args: {
    result: BalanceResult;
    durationSeconds: number;
    playerGold: number;
    enemyGold: number;
    playerCastleHp: number;
    playerCastleMaxHp: number;
    enemyCastleHp: number;
    enemyCastleMaxHp: number;
  }): BattleBalanceReport {
    const targetDuration = targetMatchDuration(this.level);
    const playerCastleHpRatio = args.playerCastleHp / Math.max(1, args.playerCastleMaxHp);
    const enemyCastleHpRatio = args.enemyCastleHp / Math.max(1, args.enemyCastleMaxHp);
    const enemyPowerEvents = this.powerEvents.filter((event) => event.team === "enemy");
    const enemyPowerCasts = enemyPowerEvents.filter((event) => event.type === "cast");
    const enemyPowerSummary: EnemyPowerSummary = {
      opportunities: enemyPowerEvents.filter((event) => event.type === "opportunity").length,
      telegraphs: enemyPowerEvents.filter((event) => event.type === "telegraph").length,
      casts: enemyPowerCasts.length,
      missileCasts: enemyPowerCasts.filter((event) => event.power === "missile").length,
      iceCasts: enemyPowerCasts.filter((event) => event.power === "ice").length,
      maxDecisionDelayMs: enemyPowerEvents.reduce(
        (longest, event) => Math.max(longest, event.decisionDelayMs ?? 0),
        0,
      ),
      targetingViolations: enemyPowerCasts.filter((event) => event.targetPolicyViolation).length,
      workerPrimaryTargets: enemyPowerCasts.filter((event) => event.primaryTargetType === "peasant").length,
      escapedUnits: enemyPowerCasts.reduce(
        (total, event) => total + Math.max(0, event.escapedCount ?? 0),
        0,
      ),
    };
    let classification: BalanceClassification = "on_target";

    if (args.durationSeconds > targetDuration.maxSeconds) {
      classification = "too_long";
    } else if (args.result === "defeat" && args.durationSeconds < targetDuration.minSeconds) {
      classification = "too_hard";
    } else if (
      args.result === "victory" &&
      args.durationSeconds < targetDuration.minSeconds &&
      playerCastleHpRatio >= 0.55
    ) {
      classification = "too_easy";
    } else if (args.durationSeconds < targetDuration.minSeconds) {
      classification = "too_short";
    }

    return {
      schema: 3,
      configVersion: "adaptive-campaign-v3",
      levelId: this.level.id,
      order: this.level.order,
      seed: this.seed,
      simulationSpeed: this.simulationSpeed,
      qaStyle: this.qaStyle,
      adaptationBand: this.adaptationBand,
      result: args.result,
      durationSeconds: Math.round(args.durationSeconds * 10) / 10,
      targetDuration,
      classification,
      referenceLoadout: [...this.referenceLoadout],
      enemyLoadout: this.level.enemy.allowedUnits.filter((unitId) => !isWorkerUnit(unitId)),
      config: {
        enemyHpMultiplier: this.level.difficulty.enemyHpMultiplier,
        enemyDamageMultiplier: this.level.difficulty.enemyDamageMultiplier,
        enemyDecisionMs: this.level.enemy.spawnIntervalMs,
        enemyCastleHp: this.level.enemy.castleHp,
        resourceNodes: this.resourceNodeCount,
        castleDamagePacing: this.level.duration.castleDamagePacing,
      },
      ending: {
        playerGold: Math.floor(args.playerGold),
        enemyGold: Math.floor(args.enemyGold),
        playerCastleHp: Math.max(0, Math.round(args.playerCastleHp)),
        playerCastleHpRatio: Math.round(playerCastleHpRatio * 1000) / 1000,
        enemyCastleHp: Math.max(0, Math.round(args.enemyCastleHp)),
        enemyCastleHpRatio: Math.round(enemyCastleHpRatio * 1000) / 1000,
      },
      player: this.player,
      enemy: this.enemy,
      director: {
        variant: this.directorVariant,
        reserveBudget: this.reserveBudget,
        reserveSpent: this.reserveSpent,
        phases: this.directorEvents,
      },
      matchupKills: this.matchupKills,
      economyEvents: this.economyEvents,
      powerEvents: this.powerEvents,
      powerSummary: { enemy: enemyPowerSummary },
      stallEvents: this.stallEvents,
      defeatReason: this.defeatReason,
      snapshots: this.snapshots,
    };
  }
}
