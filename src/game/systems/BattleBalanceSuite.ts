import type { BattleBalanceReport } from "./BattleBalance";

export const BALANCE_QA_STYLES = [
  "economyRush",
  "balancedCounter",
  "aggressiveRush",
] as const;
export type BalanceQaStyle = typeof BALANCE_QA_STYLES[number] | "defensiveSaver";

const PRIMARY_SEEDS = [820_001, 820_002, 820_003, 820_004, 820_005] as const;
const DEFENSIVE_SENTINELS = [1, 5, 11, 18, 20] as const;

export interface BalanceSuiteCase {
  id: string;
  kind: "primary" | "stall_regression";
  levelId: string;
  order: number;
  seed: number;
  style: BalanceQaStyle;
}

export interface BalanceSuiteLevelSummary {
  order: number;
  targetSeconds: number;
  samples: number;
  medianSeconds: number;
  p90Seconds: number;
  victoryRate: number;
  durationPassed: boolean;
}

export interface BattleBalanceSuiteSummary {
  schema: 1;
  expectedPrimaryMatches: 300;
  expectedSupplementalMatches: 5;
  completedMatches: number;
  primaryMatches: number;
  supplementalMatches: number;
  passed: boolean;
  failures: string[];
  levels: BalanceSuiteLevelSummary[];
  power: {
    reportsWithOpportunities: number;
    reportsWithTwoOrThreeCasts: number;
    maxCastsObserved: number;
    maxDecisionDelayMs: number;
    targetingViolations: number;
    workerPrimaryTargets: number;
  };
  worker: {
    longestEnemyZeroWorkerMs: number;
    longestNoDefenderMs: number;
  };
  generatedAt: string;
}

const levelId = (order: number) => `level_${String(order).padStart(3, "0")}`;

export function createBattleBalanceSuiteCases(): BalanceSuiteCase[] {
  const primary = Array.from({ length: 20 }, (_, index) => index + 1).flatMap((order) =>
    PRIMARY_SEEDS.flatMap((seed) =>
      BALANCE_QA_STYLES.map((style) => ({
        id: `L${order}-S${seed}-${style}`,
        kind: "primary" as const,
        levelId: levelId(order),
        order,
        seed: seed + order * 100,
        style,
      })),
    ),
  );
  const supplemental = DEFENSIVE_SENTINELS.map((order) => ({
    id: `L${order}-stall-defensiveSaver`,
    kind: "stall_regression" as const,
    levelId: levelId(order),
    order,
    seed: 829_000 + order,
    style: "defensiveSaver" as const,
  }));
  return [...primary, ...supplemental];
}

const percentile = (values: number[], ratio: number) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)];
};

const rounded = (value: number, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export function summarizeBattleBalanceSuite(
  reports: BattleBalanceReport[],
): BattleBalanceSuiteSummary {
  const primaryReports = reports.filter((report) => report.qaStyle !== "defensiveSaver");
  const supplementalReports = reports.filter((report) => report.qaStyle === "defensiveSaver");
  const failures: string[] = [];
  const levels: BalanceSuiteLevelSummary[] = [];

  for (let order = 1; order <= 20; order += 1) {
    const levelReports = primaryReports.filter((report) => report.order === order);
    const durations = levelReports.map((report) => report.durationSeconds);
    const targetSeconds = levelReports[0]?.targetDuration.targetSeconds ?? 0;
    const medianSeconds = percentile(durations, 0.5);
    const p90Seconds = percentile(durations, 0.9);
    const durationPassed =
      levelReports.length === 15 &&
      medianSeconds >= targetSeconds * 0.85 &&
      medianSeconds <= targetSeconds * 1.15 &&
      p90Seconds <= targetSeconds * 1.35 &&
      (order !== 1 || medianSeconds >= 60 && medianSeconds <= 75 && p90Seconds <= 90);
    if (!durationPassed) {
      failures.push(
        `L${order} duration samples=${levelReports.length}/15 median=${rounded(medianSeconds)} target=${targetSeconds} p90=${rounded(p90Seconds)}`,
      );
    }
    levels.push({
      order,
      targetSeconds,
      samples: levelReports.length,
      medianSeconds: rounded(medianSeconds),
      p90Seconds: rounded(p90Seconds),
      victoryRate: rounded(
        levelReports.filter((report) => report.result === "victory").length /
          Math.max(1, levelReports.length),
        3,
      ),
      durationPassed,
    });
  }

  const powerSummaries = reports.map((report) => report.powerSummary.enemy);
  const reportsWithOpportunities = powerSummaries.filter((summary) => summary.opportunities >= 2);
  const reportsWithTwoOrThreeCasts = reportsWithOpportunities.filter(
    (summary) => summary.casts >= 2 && summary.casts <= 3,
  ).length;
  const powerExposureRate = reportsWithTwoOrThreeCasts /
    Math.max(1, reportsWithOpportunities.length);
  const maxCastsObserved = Math.max(0, ...powerSummaries.map((summary) => summary.casts));
  const maxDecisionDelayMs = Math.max(
    0,
    ...powerSummaries.map((summary) => summary.maxDecisionDelayMs),
  );
  const targetingViolations = powerSummaries.reduce(
    (total, summary) => total + summary.targetingViolations,
    0,
  );
  const workerPrimaryTargets = powerSummaries.reduce(
    (total, summary) => total + summary.workerPrimaryTargets,
    0,
  );
  const longestEnemyZeroWorkerMs = Math.max(
    0,
    ...reports.map((report) => report.enemy.longestZeroWorkerMs),
  );
  const longestNoDefenderMs = Math.max(
    0,
    ...reports.flatMap((report) =>
      report.stallEvents
        .filter((event) => event.type === "no_defenders")
        .map((event) => event.durationMs ?? 0),
    ),
  );

  if (primaryReports.length !== 300) failures.push(`primary matches=${primaryReports.length}/300`);
  if (supplementalReports.length !== 5) failures.push(`supplemental matches=${supplementalReports.length}/5`);
  if (maxCastsObserved > 3) failures.push(`enemy power max casts=${maxCastsObserved}/3`);
  if (maxDecisionDelayMs > 1_000) failures.push(`enemy power decision delay=${maxDecisionDelayMs}ms`);
  if (targetingViolations > 0) failures.push(`enemy power targeting violations=${targetingViolations}`);
  if (workerPrimaryTargets > 0) failures.push(`enemy power worker primary targets=${workerPrimaryTargets}`);
  if (powerExposureRate < 0.9) {
    failures.push(
      `enemy power exposure=${reportsWithTwoOrThreeCasts}/${reportsWithOpportunities.length} (${rounded(powerExposureRate * 100)}%) eligible matches reached 2-3 casts`,
    );
  }
  if (longestEnemyZeroWorkerMs > 10_000) {
    failures.push(`enemy longest zero-worker=${Math.round(longestEnemyZeroWorkerMs)}ms/10000ms`);
  }
  if (longestNoDefenderMs > 8_000) {
    failures.push(`enemy longest no-defender=${Math.round(longestNoDefenderMs)}ms/8000ms`);
  }

  return {
    schema: 1,
    expectedPrimaryMatches: 300,
    expectedSupplementalMatches: 5,
    completedMatches: reports.length,
    primaryMatches: primaryReports.length,
    supplementalMatches: supplementalReports.length,
    passed: failures.length === 0,
    failures,
    levels,
    power: {
      reportsWithOpportunities: reportsWithOpportunities.length,
      reportsWithTwoOrThreeCasts,
      maxCastsObserved,
      maxDecisionDelayMs,
      targetingViolations,
      workerPrimaryTargets,
    },
    worker: {
      longestEnemyZeroWorkerMs: Math.round(longestEnemyZeroWorkerMs),
      longestNoDefenderMs: Math.round(longestNoDefenderMs),
    },
    generatedAt: new Date().toISOString(),
  };
}
