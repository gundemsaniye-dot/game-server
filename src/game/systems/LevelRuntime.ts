import { MAIN_CAMPAIGN } from "../config/campaign.config";
import { LEVELS, LEVELS_BY_ID, getLevelConfig, normalizeLevelId } from "../config/levels.config";
import { BATTLE_MAPS, getBattleMapConfig } from "../config/maps.config";
import { UNIT_CONFIGS, UNIT_ORDER } from "../config/units.config";
import {
  getUnlockedUnitIds,
  loadCampaignProgress,
  normalizeCombatLoadout,
  type CampaignProgress,
} from "./ProgressionStore";
import type { LevelConfig } from "../types/LevelTypes";
import { BATTLE_MAP_SCHEMA_VERSION, type BattleMapConfig, type BiomeId } from "../types/MapTypes";
import type { UnitId } from "../types/UnitTypes";
import {
  getTiledBattleMapDefinition,
  validateCampaignMapPackageAssignments,
} from "../tiled/TiledMapRegistry";

export interface BattleStartData {
  levelId: string;
  mapId: string;
  biome: BiomeId;
  campaignId: string;
  mapOverride?: BattleMapConfig;
  editorPreview?: boolean;
  returnScene?: "MapEditor";
  playerLoadout: UnitId[];
  attemptSeed: number;
}

export interface LevelRuntime {
  level: LevelConfig;
  map: BattleMapConfig;
  campaignId: string;
  unlockedUnitIds: UnitId[];
  playerUnitIds: UnitId[];
  enemyUnitIds: UnitId[];
  battleStartData: BattleStartData;
}

export interface CampaignValidationResult {
  levelCount: number;
  mapCount: number;
  unitCount: number;
  campaignNodeCount: number;
  errors: string[];
}

export function getLevelRuntime(
  levelId?: string | number,
  mapOverride?: BattleMapConfig,
  campaignProgress: CampaignProgress = loadCampaignProgress(),
): LevelRuntime {
  const level = getLevelConfig(normalizeLevelId(levelId));
  const configuredMap = mapOverride?.id === level.mapId && mapOverride.schemaVersion === BATTLE_MAP_SCHEMA_VERSION
    ? mapOverride
    : getBattleMapConfig(level.mapId);
  const packageDefinition = mapOverride ? undefined : getTiledBattleMapDefinition(configuredMap.id);
  const packageMap = packageDefinition?.sourceMapId
    ? getBattleMapConfig(packageDefinition.sourceMapId)
    : configuredMap;
  // Reference art, TMJ navigation and resource nodes were authored as one
  // package. Keep the campaign identity/modifiers from the selected level,
  // but take resource positions and visuals from the same source package so a
  // remapped grass map can never inherit snow trees (or the reverse).
  const map: BattleMapConfig = packageMap === configuredMap
    ? configuredMap
    : {
      ...configuredMap,
      resources: packageMap.resources,
    };

  const unlockedUnitIds = getUnlockedUnitIds(campaignProgress);
  const playerUnitIds = [
    "peasant" as UnitId,
    ...normalizeCombatLoadout(campaignProgress.selectedCombatUnitIds, campaignProgress),
  ];

  return {
    level,
    map,
    campaignId: MAIN_CAMPAIGN.id,
    unlockedUnitIds,
    playerUnitIds,
    enemyUnitIds: level.enemy.allowedUnits,
    battleStartData: {
      levelId: level.id,
      mapId: map.id,
      biome: map.biome,
      campaignId: MAIN_CAMPAIGN.id,
      playerLoadout: playerUnitIds,
      attemptSeed: campaignProgress.attemptSeeds[level.id] ?? map.seed,
    },
  };
}

export function getOnlineLevelRuntime(
  mapId = "grasslands_01",
  playerLoadout: UnitId[] = ["peasant", "swordsman", "archer", "horseman"],
): LevelRuntime {
  const map = getBattleMapConfig(mapId);
  // Online battles are server-authoritative, but the shared Game scene still
  // reads the complete LevelConfig while it builds its HUD and resets local
  // presentation state. Reuse the campaign level for this map as a complete
  // client-side template instead of returning a legacy partial level shape.
  // Missing fields here used to crash before sendReady(), leaving the peer
  // permanently waiting at 1/2 readiness.
  const templateLevel = LEVELS.find((level) => level.mapId === map.id) ?? getLevelConfig("level_001");
  const level: LevelConfig = {
    ...templateLevel,
    id: `online_${map.id}`,
    title: map.displayName,
    order: 1,
    mapId: map.id,
    regionId: map.biome,
    encounterType: "normal",
    player: {
      ...templateLevel.player,
      startGold: 8,
      castleHp: 2500,
    },
    enemy: {
      ...templateLevel.enemy,
      castleHp: 2500,
      startGold: 8,
      aiProfile: "balanced",
      allowedUnits: [...playerLoadout],
      unitWeights: {},
    },
    rewards: {
      gold: 0,
      starsAvailable: 3,
    },
  };

  return {
    level,
    map,
    campaignId: "online_multiplayer",
    unlockedUnitIds: [...playerLoadout],
    playerUnitIds: [...playerLoadout],
    enemyUnitIds: [...playerLoadout],
    battleStartData: {
      levelId: `online_${map.id}`,
      mapId: map.id,
      biome: map.biome,
      campaignId: "online_multiplayer",
      playerLoadout,
      attemptSeed: map.seed,
    },
  };
}

export function validateCampaignConfig(): CampaignValidationResult {
  const errors: string[] = validateCampaignMapPackageAssignments();
  const unitIds = new Set<UnitId>(UNIT_ORDER);

  for (const level of LEVELS) {
    if (!BATTLE_MAPS[level.mapId]) {
      errors.push(`${level.id} missing map ${level.mapId}`);
    } else if (BATTLE_MAPS[level.mapId].biome !== level.regionId) {
      errors.push(`${level.id} biome mismatch map=${BATTLE_MAPS[level.mapId].biome} level=${level.regionId}`);
    }

    for (const unitId of level.enemy.allowedUnits) {
      if (!unitIds.has(unitId)) {
        errors.push(`${level.id} references missing unit ${unitId}`);
      }
    }

    for (const weightedUnitId of Object.keys(level.enemy.unitWeights) as UnitId[]) {
      if (!unitIds.has(weightedUnitId)) {
        errors.push(`${level.id} has missing weight unit ${weightedUnitId}`);
      }
      if (!level.enemy.allowedUnits.includes(weightedUnitId)) {
        errors.push(`${level.id} weights ${weightedUnitId} but enemy cannot spawn it`);
      }
    }


    if (level.enemy.allowedUnits.length !== 4 || level.enemy.allowedUnits[0] !== "peasant") {
      errors.push(`${level.id} enemy loadout must be peasant plus three combat units`);
    }
    if (new Set(level.enemy.allowedUnits).size !== 4) {
      errors.push(`${level.id} enemy loadout contains duplicate units`);
    }
    const combatWeightTotal = Object.values(level.enemy.unitWeights).reduce(
      (total, weight) => total + (weight ?? 0),
      0,
    );
    if (combatWeightTotal !== 100) {
      errors.push(`${level.id} enemy combat weights total ${combatWeightTotal}, expected 100`);
    }
    if (level.player.startGold !== 8 || level.enemy.startGold !== 8) {
      errors.push(`${level.id} both sides must start with 8 gold`);
    }
    if (level.player.castleHp !== 1000 || level.enemy.castleHp < 600) {
      errors.push(`${level.id} castle HP configuration invalid`);
    }
    if (level.enemy.spawnIntervalMs < 1800 || level.enemy.spawnIntervalMs > 4500) {
      errors.push(`${level.id} AI decision interval outside safe bounds`);
    }
    const expectedWorkerTarget = level.order === 1 ? 1 : level.order <= 4 ? 2 : 3;
    if (level.enemy.workerTarget !== expectedWorkerTarget) {
      errors.push(`${level.id} worker target mismatch`);
    }
    if (
      level.economy.passiveGoldIntervalMs !== 4000 ||
      level.economy.passiveGoldAmount !== 1 ||
      level.economy.maxWorkers !== 3 ||
      level.economy.resourceRespawnMs !== 12000
    ) {
      errors.push(`${level.id} economy constants mismatch`);
    }
    if (level.difficulty.enemyHpMultiplier <= 0 || level.difficulty.enemyDamageMultiplier <= 0) {
      errors.push(`${level.id} enemy stat multiplier invalid`);
    }
    if (
      level.duration.targetSeconds < 60 ||
      level.duration.targetSeconds > 240 ||
      level.duration.normalTolerance !== 0.15 ||
      level.duration.skilledFloorRatio !== 0.7 ||
      level.duration.overtimeRatio !== 1.15 ||
      level.duration.hardStopRatio !== 1.5 ||
      level.duration.tempoRampStartRatio !== 0.72 ||
      level.duration.tempoAtTarget !== 1.12 ||
      level.duration.tempoAtOvertime !== 1.18 ||
      level.duration.castleDamagePacing < 0.3 ||
      level.duration.castleDamagePacing > 1.1
    ) {
      errors.push(`${level.id} duration configuration mismatch`);
    }
    if (
      level.director.reserveBudget <= 0 ||
      level.director.warningMs < 6_000 ||
      level.director.warningMs > 8_000 ||
      level.director.phases.length < 1 ||
      level.director.phases.length > 6 ||
      level.director.variants.length !== 3
    ) {
      errors.push(`${level.id} battle director configuration mismatch`);
    }
    if (!level.enemy.powers.missile || !level.enemy.powers.ice) {
      errors.push(`${level.id} enemy must support missile and ice`);
    }
    if (
      level.enemy.powers.targetingPolicy !== "castle_defense" ||
      level.enemy.powers.defenseRadius !== 260 ||
      level.enemy.powers.telegraphMs !== 1_200 ||
      level.enemy.powers.globalLockoutMs !== 6_000 ||
      level.enemy.powers.maxCastsPerMatch !== 3 ||
      level.enemy.powers.maxCastsPerPower !== 2
    ) {
      errors.push(`${level.id} enemy power policy mismatch`);
    }
    if (
      level.player.powers.iceUnlockLevel !== 1 ||
      level.player.powers.missileUnlockLevel !== 6
    ) {
      errors.push(`${level.id} player power progression mismatch`);
    }
    const phaseBudgetTotal = level.director.phases.reduce(
      (total, phase) => total + phase.budgetShare,
      0,
    );
    if (Math.abs(phaseBudgetTotal - 1) > 0.0001) {
      errors.push(`${level.id} director phase budget shares total ${phaseBudgetTotal}`);
    }
    const map = BATTLE_MAPS[level.mapId];
    const expectedTrees = level.order <= 4 ? 5 : level.order <= 12 ? 4 : 3;
    if (map && (map.resources.length !== expectedTrees || map.resources.some((resource) => resource.type !== "tree" || resource.amount !== 12))) {
      errors.push(`${level.id} must have ${expectedTrees} reachable 12-wood tree resources`);
    }
  }


  const expectedUnlocks: Partial<Record<number, UnitId>> = {
    5: "long_spearman",
    9: "mace_guard",
    13: "knife_thrower",
    17: "mage",
  };
  for (const level of LEVELS) {
    if (level.rewards.unlockUnit !== expectedUnlocks[level.order]) {
      errors.push(`${level.id} unlock mismatch`);
    }
  }

  for (const node of MAIN_CAMPAIGN.nodes) {
    if (!LEVELS_BY_ID[node.levelId]) {
      errors.push(`campaign node missing level ${node.levelId}`);
    }
  }

  for (const unitId of UNIT_ORDER) {
    if (!UNIT_CONFIGS[unitId]) {
      errors.push(`unit order missing config ${unitId}`);
    }
  }

  if (MAIN_CAMPAIGN.nodes.length !== LEVELS.length) {
    errors.push(`campaign nodes=${MAIN_CAMPAIGN.nodes.length} levels=${LEVELS.length}`);
  }
  if (LEVELS.length !== 20) {
    errors.push(`campaign must contain exactly 20 levels, found ${LEVELS.length}`);
  }

  return {
    levelCount: LEVELS.length,
    mapCount: Object.keys(BATTLE_MAPS).length,
    unitCount: UNIT_ORDER.length,
    campaignNodeCount: MAIN_CAMPAIGN.nodes.length,
    errors,
  };
}

export function formatCampaignValidation(result: CampaignValidationResult) {
  return `levels=${result.levelCount} maps=${result.mapCount} units=${result.unitCount} campaignNodes=${result.campaignNodeCount} errors=${result.errors.length}`;
}
