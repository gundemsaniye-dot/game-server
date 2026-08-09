import { LEVELS_BY_ID, getLevelConfig, normalizeLevelId } from "../config/levels.config";
import {
  BASE_PLAYER_UNIT_IDS,
  DEFAULT_COMBAT_LOADOUT,
  UNIT_ORDER,
  isWorkerUnit,
} from "../config/units.config";
import type { CampaignNodeState } from "../types/CampaignTypes";
import type { UnitId } from "../types/UnitTypes";

const STORAGE_KEY = "castle_raid_2_campaign_progress_v1";

export interface BattleAttemptSummary {
  levelId: string;
  result: "victory" | "defeat";
  durationSeconds: number;
  targetSeconds: number;
  playerCastleHpRatio: number;
  workerDeaths: number;
  completedAt: number;
}

export interface CampaignProgress {
  completedLevelIds: string[];
  unlockedLevelIds: string[];
  starsByLevel: Record<string, number>;
  selectedCombatUnitIds: UnitId[];
  attemptSeeds: Record<string, number>;
  completionCounts: Record<string, number>;
  lossCounts: Record<string, number>;
  recentBattleAttempts: BattleAttemptSummary[];
  debugUnlockAllUnits?: boolean;
  lastPlayedLevelId?: string;
  updatedAt: number;
}

function defaultProgress(): CampaignProgress {
  return {
    completedLevelIds: [],
    unlockedLevelIds: ["level_001"],
    starsByLevel: {},
    selectedCombatUnitIds: [...DEFAULT_COMBAT_LOADOUT],
    attemptSeeds: {},
    completionCounts: {},
    lossCounts: {},
    recentBattleAttempts: [],
    updatedAt: Date.now(),
  };
}

function getStorage() {
  try {
    return typeof window !== "undefined" ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}

function uniqLevelIds(levelIds: string[]) {
  return Array.from(new Set(levelIds.map((levelId) => normalizeLevelId(levelId))));
}

export function loadCampaignProgress(): CampaignProgress {
  const storage = getStorage();

  if (!storage) {
    return defaultProgress();
  }

  try {
    const raw = storage.getItem(STORAGE_KEY);

    if (!raw) {
      return defaultProgress();
    }

    return migrateCampaignProgress(JSON.parse(raw) as Partial<CampaignProgress>);
  } catch {
    return defaultProgress();
  }
}

export function migrateCampaignProgress(parsed: Partial<CampaignProgress>): CampaignProgress {
  const completedLevelIds = uniqLevelIds(parsed.completedLevelIds ?? []);
  const inferredUnlockedLevelIds = completedLevelIds.flatMap((levelId) => {
    const nextLevelId = getLevelConfig(levelId).rewards.unlockNextLevel;
    return nextLevelId ? [levelId, nextLevelId] : [levelId];
  });
  const progress: CampaignProgress = {
    completedLevelIds,
    unlockedLevelIds: uniqLevelIds([
      "level_001",
      ...inferredUnlockedLevelIds,
      ...(parsed.unlockedLevelIds ?? []),
    ]),
    starsByLevel: parsed.starsByLevel ?? {},
    selectedCombatUnitIds: [],
    attemptSeeds: parsed.attemptSeeds ?? {},
    completionCounts: parsed.completionCounts ?? {},
    lossCounts: parsed.lossCounts ?? {},
    recentBattleAttempts: (parsed.recentBattleAttempts ?? [])
      .filter((attempt): attempt is BattleAttemptSummary =>
        Boolean(attempt) &&
        typeof attempt.levelId === "string" &&
        (attempt.result === "victory" || attempt.result === "defeat") &&
        Number.isFinite(attempt.durationSeconds) &&
        Number.isFinite(attempt.targetSeconds) &&
        Number.isFinite(attempt.playerCastleHpRatio) &&
        Number.isFinite(attempt.workerDeaths),
      )
      .slice(-3)
      .map((attempt) => ({
        ...attempt,
        levelId: normalizeLevelId(attempt.levelId),
        completedAt: Number.isFinite(attempt.completedAt) ? attempt.completedAt : Date.now(),
      })),
    lastPlayedLevelId: parsed.lastPlayedLevelId
      ? normalizeLevelId(parsed.lastPlayedLevelId)
      : undefined,
    updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
  };
  progress.selectedCombatUnitIds = normalizeCombatLoadout(parsed.selectedCombatUnitIds, progress);
  return progress;
}

export function saveCampaignProgress(progress: CampaignProgress) {
  const storage = getStorage();

  if (!storage) {
    return;
  }

  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ...progress,
      completedLevelIds: uniqLevelIds(progress.completedLevelIds),
      unlockedLevelIds: uniqLevelIds(progress.unlockedLevelIds),
      selectedCombatUnitIds: normalizeCombatLoadout(progress.selectedCombatUnitIds, progress),
      debugUnlockAllUnits: undefined,
      updatedAt: Date.now(),
    }),
  );
}

export function getUnlockedUnitIds(progress = loadCampaignProgress()) {
  if (progress.debugUnlockAllUnits) {
    return [...UNIT_ORDER];
  }

  const unlocked = new Set<UnitId>(BASE_PLAYER_UNIT_IDS);
  for (const levelId of progress.completedLevelIds) {
    const unitId = getLevelConfig(levelId).rewards.unlockUnit;
    if (unitId) unlocked.add(unitId);
  }
  return UNIT_ORDER.filter((unitId) => unlocked.has(unitId));
}

export function normalizeCombatLoadout(
  candidates: readonly UnitId[] | undefined,
  progress = loadCampaignProgress(),
) {
  const unlocked = new Set(getUnlockedUnitIds(progress));
  const normalized: UnitId[] = [];
  const add = (unitId: UnitId) => {
    if (
      UNIT_ORDER.includes(unitId) &&
      !isWorkerUnit(unitId) &&
      unlocked.has(unitId) &&
      !normalized.includes(unitId) &&
      normalized.length < 3
    ) {
      normalized.push(unitId);
    }
  };

  (candidates ?? []).forEach(add);
  DEFAULT_COMBAT_LOADOUT.forEach(add);
  UNIT_ORDER.forEach(add);
  return normalized.slice(0, 3);
}

export function saveCombatLoadout(unitIds: readonly UnitId[]) {
  const progress = loadCampaignProgress();
  progress.selectedCombatUnitIds = normalizeCombatLoadout(unitIds, progress);
  saveCampaignProgress(progress);
  return progress.selectedCombatUnitIds;
}

function createAttemptSeed(levelId: string, completionCount: number) {
  const random = new Uint32Array(1);
  try {
    globalThis.crypto?.getRandomValues(random);
  } catch {
    random[0] = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  }
  if (random[0] === 0) {
    random[0] = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  }
  let hash = 2166136261 >>> 0;
  for (const char of `${levelId}:${completionCount}:${random[0]}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash || 1;
}

export function ensureLevelAttemptSeed(levelId: string) {
  const normalizedLevelId = normalizeLevelId(levelId);
  const progress = loadCampaignProgress();
  const existing = progress.attemptSeeds[normalizedLevelId];
  if (Number.isFinite(existing) && existing > 0) return existing >>> 0;

  const seed = createAttemptSeed(
    normalizedLevelId,
    progress.completionCounts[normalizedLevelId] ?? 0,
  );
  progress.attemptSeeds[normalizedLevelId] = seed;
  saveCampaignProgress(progress);
  return seed;
}

export function recordBattleAttemptResult(
  levelId: string,
  result: "victory" | "defeat",
  summary?: Omit<BattleAttemptSummary, "levelId" | "result" | "completedAt">,
) {
  const normalizedLevelId = normalizeLevelId(levelId);
  const progress = loadCampaignProgress();
  if (result === "victory") {
    progress.completionCounts[normalizedLevelId] =
      (progress.completionCounts[normalizedLevelId] ?? 0) + 1;
    delete progress.attemptSeeds[normalizedLevelId];
  } else {
    progress.lossCounts[normalizedLevelId] =
      (progress.lossCounts[normalizedLevelId] ?? 0) + 1;
  }
  if (summary) {
    progress.recentBattleAttempts = [
      ...progress.recentBattleAttempts,
      {
        levelId: normalizedLevelId,
        result,
        ...summary,
        completedAt: Date.now(),
      },
    ].slice(-3);
  }
  saveCampaignProgress(progress);
  return progress;
}

export function getLevelLossCount(levelId: string) {
  return loadCampaignProgress().lossCounts[normalizeLevelId(levelId)] ?? 0;
}

export function isLevelCompleted(levelId: string, progress = loadCampaignProgress()) {
  return progress.completedLevelIds.includes(normalizeLevelId(levelId));
}

export function isLevelUnlocked(
  levelId: string,
  progress = loadCampaignProgress(),
  unlockAll = false,
) {
  return unlockAll || progress.unlockedLevelIds.includes(normalizeLevelId(levelId));
}

export function getCurrentLevelId(progress = loadCampaignProgress()) {
  return (
    progress.unlockedLevelIds.find((levelId) => !progress.completedLevelIds.includes(levelId)) ??
    progress.unlockedLevelIds[progress.unlockedLevelIds.length - 1] ??
    "level_001"
  );
}

export function getNodeState(
  levelId: string,
  progress = loadCampaignProgress(),
  unlockAll = false,
): CampaignNodeState {
  const normalizedLevelId = normalizeLevelId(levelId);

  if (progress.completedLevelIds.includes(normalizedLevelId)) {
    return "completed";
  }

  if (!isLevelUnlocked(normalizedLevelId, progress, unlockAll)) {
    return "locked";
  }

  return normalizedLevelId === getCurrentLevelId(progress) ? "current" : "open";
}

export function markLevelCompleted(levelId: string, stars = 1) {
  const normalizedLevelId = normalizeLevelId(levelId);
  const progress = loadCampaignProgress();
  const level = getLevelConfig(normalizedLevelId);

  progress.completedLevelIds = uniqLevelIds([...progress.completedLevelIds, normalizedLevelId]);
  progress.unlockedLevelIds = uniqLevelIds([
    ...progress.unlockedLevelIds,
    normalizedLevelId,
    ...(level.rewards.unlockNextLevel ? [level.rewards.unlockNextLevel] : []),
  ]);
  progress.starsByLevel[normalizedLevelId] = Math.max(
    progress.starsByLevel[normalizedLevelId] ?? 0,
    Math.max(1, Math.min(level.rewards.starsAvailable, stars)),
  );
  progress.lastPlayedLevelId = normalizedLevelId;
  progress.updatedAt = Date.now();
  saveCampaignProgress(progress);
  return progress;
}

export function createDebugUnlockedProgress(progress = loadCampaignProgress()) {
  return {
    ...progress,
    unlockedLevelIds: Object.keys(LEVELS_BY_ID).sort(),
    selectedCombatUnitIds: normalizeCombatLoadout(progress.selectedCombatUnitIds, {
      ...progress,
      debugUnlockAllUnits: true,
    }),
    debugUnlockAllUnits: true,
  };
}

export function resetCampaignProgress() {
  const progress = defaultProgress();
  saveCampaignProgress(progress);
  return progress;
}
