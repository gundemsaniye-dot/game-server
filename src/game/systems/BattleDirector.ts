import { UNIT_CONFIGS, isWorkerUnit } from "../config/units.config";
import type {
  DirectorLanePattern,
  DirectorPhaseKind,
  DirectorVariantConfig,
  LevelConfig,
} from "../types/LevelTypes";
import type { UnitId } from "../types/UnitTypes";

export type DirectorWaveState = "pending" | "warning" | "active" | "complete";
export type DirectorTriggerReason = "castle_threshold" | "pacing_window";

export interface DirectorWave {
  id: string;
  index: number;
  kind: DirectorPhaseKind;
  state: DirectorWaveState;
  budget: number;
  spent: number;
  units: UnitId[];
  laneIndices: number[];
  scheduledAtMs: number;
  castleThresholdRatio: number;
  warningMs: number;
  warningAtMs?: number;
  spawnAtMs?: number;
  completedAtMs?: number;
  triggerReason?: DirectorTriggerReason;
  delayReason?: string;
}

export type DirectorCommand =
  | { type: "phase"; wave: DirectorWave }
  | { type: "warning"; wave: DirectorWave }
  | { type: "spawn"; wave: DirectorWave }
  | { type: "complete"; wave: DirectorWave }
  | { type: "final_siege" };

export interface DirectorUpdateInput {
  elapsedMs: number;
  enemyCastleHpRatio: number;
  playerDominance: number;
  activeReserveUnitCount: number;
  enemyCombatUnitCount: number;
  combatUnitCap: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function createSeededRandom(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffledWeightedUnits(level: LevelConfig, random: () => number) {
  const combatUnits = level.enemy.allowedUnits.filter((unitId) => !isWorkerUnit(unitId));
  return [...combatUnits].sort((left, right) => {
    const leftWeight = level.enemy.unitWeights[left] ?? 0;
    const rightWeight = level.enemy.unitWeights[right] ?? 0;
    const weightedJitter = (random() - 0.5) * 22;
    return rightWeight - leftWeight + weightedJitter;
  });
}

/** Finds a deterministic composition that spends the complete visible budget. */
function exactBudgetComposition(level: LevelConfig, random: () => number) {
  const budget = level.director.reserveBudget;
  const candidates = shuffledWeightedUnits(level, random);
  const best: Array<UnitId[] | undefined> = Array.from({ length: budget + 1 });
  best[0] = [];

  for (let amount = 1; amount <= budget; amount += 1) {
    for (const unitId of candidates) {
      const cost = UNIT_CONFIGS[unitId].cost;
      const previous = best[amount - cost];
      if (!previous) continue;
      best[amount] = [...previous, unitId];
      break;
    }
  }

  const exact = best[budget];
  if (!exact) {
    throw new Error(`${level.id} reserve budget ${budget} cannot be spent exactly`);
  }
  return exact;
}

function laneSequence(pattern: DirectorLanePattern, count: number, waveIndex: number) {
  if (pattern === "center") return Array.from({ length: count }, () => 1);
  if (pattern === "alternating") {
    return Array.from({ length: count }, (_, index) => (index + waveIndex) % 2 === 0 ? 0 : 2);
  }
  return Array.from({ length: count }, (_, index) => index % 3 === 0 ? 0 : index % 3 === 1 ? 2 : 1);
}

function splitComposition(level: LevelConfig, composition: UnitId[]) {
  const waves = level.director.phases.map(() => [] as UnitId[]);
  const targets = level.director.phases.map(
    (phase) => level.director.reserveBudget * phase.budgetShare,
  );
  const spent = level.director.phases.map(() => 0);

  composition
    .slice()
    .sort((left, right) => UNIT_CONFIGS[right].cost - UNIT_CONFIGS[left].cost)
    .forEach((unitId) => {
      const cost = UNIT_CONFIGS[unitId].cost;
      let bestIndex = 0;
      let bestNeed = Number.NEGATIVE_INFINITY;
      targets.forEach((target, index) => {
        const need = target - spent[index];
        if (need > bestNeed) {
          bestNeed = need;
          bestIndex = index;
        }
      });
      waves[bestIndex].push(unitId);
      spent[bestIndex] += cost;
    });

  return waves;
}

export class BattleDirector {
  readonly seed: number;
  readonly variant: DirectorVariantConfig;
  readonly waves: DirectorWave[];
  readonly targetMs: number;
  readonly finalSiegeAtMs: number;
  readonly timeoutAtMs: number;
  private finalSiegeStarted = false;
  private lastElapsedMs = 0;

  constructor(
    readonly level: LevelConfig,
    seed: number,
    readonly adaptiveWaveTimingOffsetRatio = 0,
  ) {
    this.seed = seed >>> 0 || 1;
    const random = createSeededRandom(this.seed);
    this.variant = level.director.variants[Math.floor(random() * level.director.variants.length)]
      ?? level.director.variants[0];
    this.targetMs = level.duration.targetSeconds * 1000;
    this.finalSiegeAtMs = this.targetMs * level.duration.overtimeRatio;
    this.timeoutAtMs = this.targetMs * level.duration.hardStopRatio;
    const composition = exactBudgetComposition(level, random);
    const phaseUnits = splitComposition(level, composition);

    this.waves = level.director.phases.map((phase, index) => {
      const units = phaseUnits[index];
      const scheduledRatio = clamp(
        phase.scheduledRatio + this.variant.timingOffsetRatio + adaptiveWaveTimingOffsetRatio,
        0.05,
        0.95,
      );
      const budget = units.reduce((total, unitId) => total + UNIT_CONFIGS[unitId].cost, 0);
      return {
        id: phase.id,
        index,
        kind: phase.kind,
        state: "pending",
        budget,
        spent: 0,
        units,
        laneIndices: laneSequence(this.variant.lanePattern, units.length, index),
        scheduledAtMs: Math.round(this.targetMs * scheduledRatio),
        castleThresholdRatio: phase.castleThresholdRatio,
        warningMs: level.director.warningMs,
      };
    });
  }

  get reserveSpent() {
    return this.waves.reduce((total, wave) => total + wave.spent, 0);
  }

  get reserveRemaining() {
    return this.level.director.reserveBudget - this.reserveSpent;
  }

  get activeWave() {
    return this.waves.find((wave) => wave.state === "warning" || wave.state === "active");
  }

  get phaseLabel() {
    const active = this.activeWave;
    if (active) return `${active.index + 1}/${this.waves.length} ${active.kind}`;
    const next = this.waves.find((wave) => wave.state === "pending");
    return next ? `${next.index + 1}/${this.waves.length} ${next.kind}` : "reserve clear";
  }

  get isFinalSiege() {
    return this.finalSiegeStarted;
  }

  isCastleSealHolding(currentHp: number, maxHp: number) {
    if (this.level.encounterType === "normal" || this.finalSiegeStarted) return false;
    const activeWarning = this.waves.find((wave) => wave.state === "warning");
    if (!activeWarning) return false;
    if (this.lastElapsedMs >= (activeWarning.spawnAtMs ?? 0)) return false;
    const sealHp = Math.ceil(maxHp * activeWarning.castleThresholdRatio);
    return currentHp <= sealHp + 1;
  }

  update(input: DirectorUpdateInput): DirectorCommand[] {
    this.lastElapsedMs = input.elapsedMs;
    const commands: DirectorCommand[] = [];
    const warning = this.waves.find((wave) => wave.state === "warning");

    if (warning && input.elapsedMs >= (warning.spawnAtMs ?? Number.POSITIVE_INFINITY)) {
      if (input.enemyCombatUnitCount + warning.units.length > input.combatUnitCap) {
        warning.delayReason = "combat_unit_cap";
      } else {
        warning.state = "active";
        warning.spent = warning.budget;
        warning.delayReason = undefined;
        commands.push({ type: "spawn", wave: warning });
      }
    }

    // Timed phases are independent campaign beats. A surviving unit from an
    // earlier reserve may overlap the next phase; it must never postpone all
    // later reserves and recreate the old artificial stall.
    if (input.activeReserveUnitCount === 0) {
      for (const active of this.waves.filter((wave) => wave.state === "active")) {
        if (input.elapsedMs < (active.spawnAtMs ?? 0) + 800) continue;
        active.state = "complete";
        active.completedAtMs = input.elapsedMs;
        commands.push({ type: "complete", wave: active });
      }
    }

    if (!this.waves.some((wave) => wave.state === "warning")) {
      const next = this.waves.find((wave) => wave.state === "pending");
      if (next) {
        // Performance may move an event inside a narrow pacing window, but it
        // never changes the wave budget, count or stats.
        const dominanceTimingShift = clamp(input.playerDominance, -1, 1) * -0.02 * this.targetMs;
        const pacingAtMs = next.scheduledAtMs + dominanceTimingShift;
        const thresholdWindowOpen = input.elapsedMs >= next.scheduledAtMs - this.targetMs * 0.12;
        const thresholdReached = thresholdWindowOpen && input.enemyCastleHpRatio <= next.castleThresholdRatio;
        if (thresholdReached || input.elapsedMs >= pacingAtMs) {
          next.state = "warning";
          next.warningAtMs = input.elapsedMs;
          next.spawnAtMs = input.elapsedMs + next.warningMs;
          next.triggerReason = thresholdReached ? "castle_threshold" : "pacing_window";
          commands.push({ type: "phase", wave: next }, { type: "warning", wave: next });
        }
      }
    }

    if (!this.finalSiegeStarted && input.elapsedMs >= this.finalSiegeAtMs) {
      this.finalSiegeStarted = true;
      commands.push({ type: "final_siege" });
    }

    return commands;
  }

  clampEnemyCastleHp(currentHp: number, maxHp: number) {
    // Only authored elite/boss encounters hold a short, visible seal, and only
    // while the reserve is being telegraphed. The seal drops as soon as the
    // wave spawns, so a won battle can never wait for a future schedule beat.
    if (this.level.encounterType === "normal" || this.finalSiegeStarted) return currentHp;
    const activeWarning = this.waves.find((wave) => wave.state === "warning");
    if (!activeWarning) return currentHp;
    if (this.lastElapsedMs >= (activeWarning.spawnAtMs ?? 0)) return currentHp;
    const sealHp = Math.ceil(maxHp * activeWarning.castleThresholdRatio);
    return Math.max(currentHp, sealHp);
  }
}
