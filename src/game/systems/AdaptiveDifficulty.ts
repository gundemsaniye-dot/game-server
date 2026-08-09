import type { BattleAttemptSummary, CampaignProgress } from "./ProgressionStore";

export type AdaptiveDifficultyBand = "assist" | "standard" | "challenge";

export interface AdaptiveDifficultyState {
  band: AdaptiveDifficultyBand;
  score: number;
  sampleCount: number;
  decisionIntervalMultiplier: number;
  powerCooldownMultiplier: number;
  counterChanceOffset: number;
  powerClusterOffset: number;
  waveTimingOffsetRatio: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function battleAttemptPerformance(attempt: BattleAttemptSummary) {
  const outcome = attempt.result === "victory" ? 0.45 : -0.45;
  const pace = clamp(
    (attempt.targetSeconds - attempt.durationSeconds) / Math.max(1, attempt.targetSeconds),
    -0.25,
    0.25,
  ) * 0.8;
  const castleHealth = clamp((attempt.playerCastleHpRatio - 0.5) * 0.4, -0.2, 0.2);
  const workerSafety = attempt.workerDeaths === 0 ? 0.05 : attempt.workerDeaths >= 2 ? -0.1 : 0;
  return clamp(outcome + pace + castleHealth + workerSafety, -1, 1);
}

export function adaptiveDifficultyForProgress(
  progress: Pick<CampaignProgress, "recentBattleAttempts">,
): AdaptiveDifficultyState {
  const attempts = progress.recentBattleAttempts.slice(-3);
  const score = attempts.length > 0
    ? attempts.reduce((total, attempt) => total + battleAttemptPerformance(attempt), 0) / attempts.length
    : 0;
  const consecutiveLosses = attempts.slice(-2).length === 2 && attempts.slice(-2).every(
    (attempt) => attempt.result === "defeat",
  );
  const band: AdaptiveDifficultyBand =
    consecutiveLosses || (attempts.length === 3 && score <= -0.5)
      ? "assist"
      : attempts.length >= 2 && score >= 0.35
        ? "challenge"
        : "standard";
  const direction = band === "challenge" ? -1 : band === "assist" ? 1 : 0;

  return {
    band,
    score: Math.round(score * 1000) / 1000,
    sampleCount: attempts.length,
    decisionIntervalMultiplier: 1 + direction * 0.1,
    powerCooldownMultiplier: 1 + direction * 0.1,
    counterChanceOffset: direction * -0.1,
    powerClusterOffset: direction,
    waveTimingOffsetRatio: direction * 0.05,
  };
}
