import type {
  DirectorPhaseConfig,
  DirectorPhaseKind,
  EncounterType,
  EnemyPowerConfig,
  LevelConfig,
  MasteryGoalConfig,
  UnitWeightTable,
} from "../types/LevelTypes";
import type { BiomeId } from "../types/MapTypes";
import type { UnitId } from "../types/UnitTypes";

type LevelBlueprint = {
  order: number;
  title: string;
  mapId: string;
  regionId: BiomeId;
  enemyUnits: UnitId[];
  weights: UnitWeightTable;
  ai: LevelConfig["enemy"]["aiProfile"];
  encounterType: EncounterType;
};

type TacticalIdentity = LevelConfig["tactics"];

const TACTICAL_IDENTITIES: readonly TacticalIdentity[] = [
  { lesson: "Temel gelir ve kilicli uretimi", peakEvent: "Kucuk kilicli rezervi", strategies: ["Iki oduncuyla duzenli kilicli hatti kur.", "Uc oduncuyla gec ama guclu karma dalga cikar."] },
  { lesson: "On hat arkasinda okcu kullanimi", peakEvent: "Iki koridorlu okcu ekrani", strategies: ["Kilicliyi on hatta, okcuyu geride tut.", "Atliyi yan koridordan dusman okcusuna gonder."] },
  { lesson: "Oduncuyu suvari baskinindan koruma", peakEvent: "Ilk oduncu avi", strategies: ["Bir kilicliyi oduncu korumasi icin ayir.", "Rakip atlisini kendi atlinla uzakta karsila."] },
  { lesson: "Karisik uclu deste", peakEvent: "Ilk iki asamali karsi saldiri", strategies: ["Uc karti farkli koridorlara dagit.", "Ilk dalgayi ucuz birlikle tutup ikinciye altin sakla."] },
  { lesson: "Mizrakliya karsi kilicli ve okcu", peakEvent: "Mizrak duvari", strategies: ["Kilicliyla mizrakliyi bagla, okcuyla erit.", "Atliyi yalnizca arka hat avinda kullan."] },
  { lesson: "Uc oduncunun yuksek gelir ve risk dengesi", peakEvent: "Orta agaca suvari baskini", strategies: ["Ucuncu oduncudan once savunma birimi cikar.", "Iki oduncuyla erken baski kurup orta agaci kapat."] },
  { lesson: "Okcu ekranini suvariyle bozma", peakEvent: "Okcu ve mizrak karsi dalgasi", strategies: ["Atliyi mizrak koridorundan kacir.", "Okculari kilicli on hatla guvende tut."] },
  { lesson: "Savunmaci rakibe karsi ekonomi bozma", peakEvent: "Biriktirilmis agir saldiri", strategies: ["Rakip oduncularini avlayip agir dalgayi geciktir.", "Altin biriktirip tek guclu karma savunma kur."] },
  { lesson: "Muhafizin canini menzille eritme", peakEvent: "Ilk muhafiz duvari", strategies: ["Muhafizi okcu atesi altinda oyalayip koridor degistir.", "Ekonomi ustunluguyle iki dalgali menzil baskisi yap."] },
  { lesson: "Muhafiz on hatti ve okcu arkasini ayirma", peakEvent: "Korumali okcu saldirisi", strategies: ["Atliyi okcu koridoruna, mizrakliyi atli koridoruna koy.", "Muhafizi ucuz kilicliyla oyalayip arka hatti dusur."] },
  { lesson: "Agir birliklere karsi koridor degistirme", peakEvent: "Muhafiz ve mizrak kamasi", strategies: ["Atliyi mizraktan uzak koridorda kullan.", "Okcu hattiyla yavas agir birlikleri parcalara ayir."] },
  { lesson: "Once oduncu savunmasi sonra saldiri", peakEvent: "Uzun tedarik kusatmasi", strategies: ["Ilk fazda odunculari koruyup ikinci fazda harca.", "Rakip teslimatlarini keserek kusatmanin butcesini dusur."] },
  { lesson: "Bicakciyi suvariyle yakalama", peakEvent: "Ilk suikastci baskini", strategies: ["Atliyi bicakci koridoruna sakla.", "Odunculari farkli koridorlara dagitip kilicli perde kur."] },
  { lesson: "Sahte koridor saldirisini okuma", peakEvent: "Bicakci ve suvari kiskaci", strategies: ["Mizrakliyi suvari gorunene kadar elde tut.", "Bicakci tarafina hizli atli karsi saldirisi yap."] },
  { lesson: "Menzilli suikastci arkasina ulasma", peakEvent: "Muhafiz korumali capraz ates", strategies: ["Iki koridordan es zamanli baski kur.", "Muhafizi oyalayip atliyi bicakciya yonelt."] },
  { lesson: "Suvari ve muhafizi farkli karsilarla durdurma", peakEvent: "Uc asamali zirhli ilerleme", strategies: ["Mizrakliyi suvariye, menzili muhafiza ayir.", "Rakip oduncusunu kesip pahali kombinasyonu boz."] },
  { lesson: "Buyucuyu suvariyle tehdit edip mizraktan kacma", peakEvent: "Ilk buyu alani saldirisi", strategies: ["Atliyi buyucu koridoruna gec yerleştir.", "Birlikleri iki koridora bolerek alan hasarini azalt."] },
  { lesson: "Alan hasarina karsi daginik duzen", peakEvent: "Kis yipratma kusatmasi", strategies: ["Uc savas kartini farkli koridorlarda kullan.", "Buyucu ve bicakciyi hizli atliyla sira sira avla."] },
  { lesson: "Yaniltma saldirisini gercek rezervden ayirma", peakEvent: "Koridor degistiren infernal dalgalar", strategies: ["Rezerv uyarisi gelene kadar pahali karsiyi sakla.", "Sahte koridoru ucuz birlikle tutup digerine yuklen."] },
  { lesson: "Ekonomi, karsi birlik ve koridor bilgisinin tamami", peakEvent: "Alti fazli final kusatmasi", strategies: ["Her faz icin farkli kart cevabini sakla.", "Rezerv muhru arasinda oduncu gelirini yeniden kur."] },
];

const PHASE_KINDS_BY_COUNT: Record<number, DirectorPhaseKind[]> = {
  1: ["opening"],
  2: ["opening", "counterattack"],
  3: ["opening", "peak", "counterattack"],
  4: ["opening", "pressure", "peak", "counterattack"],
  5: ["opening", "pressure", "peak", "relief", "counterattack"],
  6: ["opening", "pressure", "peak", "relief", "counterattack", "siege"],
};

const TARGET_SECONDS = [65, 80, 90, 100, 125, 105, 115, 140, 115, 125, 155, 120, 135, 160, 135, 165, 150, 185, 190, 210] as const;
const PHASE_COUNTS = [1, 2, 2, 2, 3, 2, 2, 3, 3, 3, 4, 3, 3, 4, 3, 4, 3, 5, 5, 6] as const;
const RESERVE_BUDGETS = [8, 12, 14, 16, 22, 18, 20, 26, 22, 24, 34, 26, 28, 36, 30, 40, 34, 48, 52, 64] as const;
const ENEMY_CASTLE_HP = [650, 720, 780, 840, 960, 880, 940, 1080, 980, 1040, 1200, 1060, 1140, 1300, 1180, 1360, 1240, 1480, 1580, 1800] as const;
const ENEMY_DECISION_MS = [4200, 3900, 3700, 3500, 3200, 3500, 3300, 3000, 3200, 3000, 2700, 3000, 2800, 2500, 2700, 2400, 2600, 2250, 2100, 1950] as const;
const ENEMY_HP_MULTIPLIER = [0.9, 0.93, 0.96, 0.98, 1.04, 0.98, 1.01, 1.07, 1.03, 1.06, 1.12, 1.05, 1.08, 1.14, 1.1, 1.16, 1.13, 1.2, 1.23, 1.28] as const;
const ENEMY_DAMAGE_MULTIPLIER = [0.88, 0.91, 0.94, 0.96, 1, 0.96, 0.99, 1.03, 1.01, 1.04, 1.08, 1.02, 1.05, 1.1, 1.07, 1.12, 1.1, 1.16, 1.18, 1.22] as const;

const PHASE_SCHEDULES: Record<number, readonly number[]> = {
  1: [0.35],
  2: [0.28, 0.65],
  3: [0.22, 0.5, 0.78],
  4: [0.18, 0.38, 0.6, 0.82],
  5: [0.15, 0.32, 0.5, 0.68, 0.84],
  6: [0.12, 0.26, 0.4, 0.56, 0.72, 0.86],
};

const PHASE_BUDGET_SHARES: Record<number, readonly number[]> = {
  1: [1],
  2: [0.45, 0.55],
  3: [0.3, 0.3, 0.4],
  4: [0.2, 0.25, 0.25, 0.3],
  5: [0.16, 0.18, 0.2, 0.2, 0.26],
  6: [0.12, 0.16, 0.16, 0.18, 0.18, 0.2],
};

// Symmetric castle-damage pacing calibrated from the 300-match campaign
// matrix. Unit-vs-unit combat remains untouched; this only prevents later
// encounters from collapsing far ahead of their authored duration target.
const CASTLE_DAMAGE_PACING = [
  1.05, 1, 1.08, 0.77, 0.66, 0.67, 1, 0.37, 0.61, 0.63,
  0.49, 0.51, 0.44, 0.4, 0.71, 0.42, 0.49, 0.46, 0.51, 0.36,
] as const;

function enemyPowers(order: number): EnemyPowerConfig {
  const base = {
    targetingPolicy: "castle_defense" as const,
    defenseRadius: 260,
    telegraphMs: 1200,
    globalLockoutMs: 6000,
    maxCastsPerMatch: 3,
    maxCastsPerPower: 2,
  };
  if (order === 1) return {
    ...base,
    missile: { cooldownMs: 50_000, initialReadyMs: 18_000, minCluster: 3, minArmyGold: 10 },
    ice: { cooldownMs: 60_000, initialReadyMs: 28_000, minCluster: 3, minArmyGold: 10 },
  };
  if (order === 2) return {
    ...base,
    missile: { cooldownMs: 48_000, initialReadyMs: 18_000, minCluster: 3, minArmyGold: 11 },
    ice: { cooldownMs: 58_000, initialReadyMs: 30_000, minCluster: 3, minArmyGold: 11 },
  };
  if (order === 3) return {
    ...base,
    missile: { cooldownMs: 45_000, initialReadyMs: 16_000, minCluster: 3, minArmyGold: 11 },
    ice: { cooldownMs: 56_000, initialReadyMs: 28_000, minCluster: 3, minArmyGold: 11 },
  };
  if (order === 4) return {
    ...base,
    missile: { cooldownMs: 44_000, initialReadyMs: 15_000, minCluster: 3, minArmyGold: 12 },
    ice: { cooldownMs: 54_000, initialReadyMs: 26_000, minCluster: 3, minArmyGold: 12 },
  };
  const band = order <= 8
    ? { missile: [42_000, 15_000], ice: [55_000, 28_000] }
    : order <= 12
      ? { missile: [38_000, 12_000], ice: [50_000, 24_000] }
      : order <= 16
        ? { missile: [35_000, 10_000], ice: [47_000, 20_000] }
        : { missile: [35_000, 10_000], ice: [45_000, 20_000] };
  return {
    ...base,
    missile: { cooldownMs: band.missile[0], initialReadyMs: band.missile[1], minCluster: 3, minArmyGold: 12 },
    ice: { cooldownMs: band.ice[0], initialReadyMs: band.ice[1], minCluster: 3, minArmyGold: 12 },
  };
}

function createDirectorPhases(blueprint: LevelBlueprint): DirectorPhaseConfig[] {
  const phaseCount = PHASE_COUNTS[blueprint.order - 1];
  const kinds = PHASE_KINDS_BY_COUNT[phaseCount];
  const rawShares = PHASE_BUDGET_SHARES[phaseCount];
  const schedule = PHASE_SCHEDULES[phaseCount];

  return kinds.map((kind, index) => ({
    id: `${levelId(blueprint.order)}_${kind}_${index + 1}`,
    kind,
    scheduledRatio: schedule[index],
    castleThresholdRatio: 1 - (index + 1) / (phaseCount + 1),
    intensity: [0.3, 0.58, 0.88, 0.36, 0.96, 0.82][Math.min(index, 5)],
    budgetShare: rawShares[index],
    unitWeights: { ...blueprint.weights },
  }));
}

function masteryGoal(order: number): MasteryGoalConfig {
  const chapter = Math.floor((order - 1) / 4);
  const cycle = (order - 1) % 5;
  if (cycle === 0) return { type: "economy", target: 18 + chapter * 6, label: `${18 + chapter * 6} oduncu altini teslim et` };
  if (cycle === 1) return { type: "counter_kills", target: 4 + chapter, label: `${4 + chapter} birimi avantajli karsi birlikle yen` };
  if (cycle === 2) return { type: "worker_safety", target: 1, label: "En fazla 1 oduncu kaybet" };
  if (cycle === 3) return { type: "castle_health", target: 55, label: "Kaleyi en az %55 canla koru" };
  return { type: "combined_arms", target: 3, label: "Uc farkli savas kartini kullan" };
}

const LEVEL_BLUEPRINTS: readonly LevelBlueprint[] = [
  { order: 1, title: "The Faded Field", mapId: "grasslands_01", regionId: "grasslands", enemyUnits: ["swordsman", "archer", "horseman"], weights: { swordsman: 60, archer: 30, horseman: 10 }, ai: "tutorial", encounterType: "normal" },
  { order: 2, title: "First Arrows", mapId: "grasslands_02", regionId: "grasslands", enemyUnits: ["swordsman", "archer", "horseman"], weights: { swordsman: 45, archer: 45, horseman: 10 }, ai: "balanced", encounterType: "normal" },
  { order: 3, title: "Silent Woodline", mapId: "silent_forest_01", regionId: "silent_forest", enemyUnits: ["swordsman", "archer", "horseman"], weights: { swordsman: 40, archer: 25, horseman: 35 }, ai: "balanced", encounterType: "normal" },
  { order: 4, title: "Hoofbreak Trail", mapId: "silent_forest_02", regionId: "silent_forest", enemyUnits: ["swordsman", "archer", "horseman"], weights: { swordsman: 35, archer: 30, horseman: 35 }, ai: "rush", encounterType: "normal" },
  { order: 5, title: "Deep Forest Clash", mapId: "silent_forest_03", regionId: "silent_forest", enemyUnits: ["long_spearman", "swordsman", "archer"], weights: { long_spearman: 45, swordsman: 35, archer: 20 }, ai: "balanced", encounterType: "elite" },
  { order: 6, title: "Mire Spear", mapId: "muddy_fields_01", regionId: "muddy_fields", enemyUnits: ["long_spearman", "horseman", "swordsman"], weights: { long_spearman: 40, horseman: 30, swordsman: 30 }, ai: "balanced", encounterType: "normal" },
  { order: 7, title: "Worker's Bog", mapId: "muddy_fields_02", regionId: "muddy_fields", enemyUnits: ["long_spearman", "archer", "horseman"], weights: { long_spearman: 35, archer: 40, horseman: 25 }, ai: "ranged", encounterType: "normal" },
  { order: 8, title: "Shield in the Mire", mapId: "muddy_fields_03", regionId: "muddy_fields", enemyUnits: ["long_spearman", "swordsman", "horseman"], weights: { long_spearman: 35, swordsman: 30, horseman: 35 }, ai: "defensive", encounterType: "elite" },
  { order: 9, title: "Thunder Approach", mapId: "storm_valley_01", regionId: "storm_valley", enemyUnits: ["mace_guard", "swordsman", "archer"], weights: { mace_guard: 40, swordsman: 30, archer: 30 }, ai: "defensive", encounterType: "normal" },
  { order: 10, title: "Ranged Pressure", mapId: "storm_valley_02", regionId: "storm_valley", enemyUnits: ["mace_guard", "archer", "horseman"], weights: { mace_guard: 35, archer: 40, horseman: 25 }, ai: "ranged", encounterType: "normal" },
  { order: 11, title: "First Flame of Magic", mapId: "storm_valley_03", regionId: "storm_valley", enemyUnits: ["mace_guard", "long_spearman", "horseman"], weights: { mace_guard: 35, long_spearman: 35, horseman: 30 }, ai: "heavy", encounterType: "boss" },
  { order: 12, title: "Cracked Provision", mapId: "dry_steppe_01", regionId: "dry_steppe", enemyUnits: ["mace_guard", "long_spearman", "archer"], weights: { mace_guard: 40, long_spearman: 30, archer: 30 }, ai: "defensive", encounterType: "normal" },
  { order: 13, title: "Fast Dust", mapId: "dry_steppe_02", regionId: "dry_steppe", enemyUnits: ["knife_thrower", "archer", "swordsman"], weights: { knife_thrower: 35, archer: 35, swordsman: 30 }, ai: "rush", encounterType: "normal" },
  { order: 14, title: "Banner of the Last Road", mapId: "dry_steppe_03", regionId: "dry_steppe", enemyUnits: ["knife_thrower", "horseman", "long_spearman"], weights: { knife_thrower: 35, horseman: 30, long_spearman: 35 }, ai: "rush", encounterType: "elite" },
  { order: 15, title: "Widening Desert", mapId: "desert_01", regionId: "desert", enemyUnits: ["knife_thrower", "mace_guard", "archer"], weights: { knife_thrower: 35, mace_guard: 35, archer: 30 }, ai: "ranged", encounterType: "normal" },
  { order: 16, title: "Needles in Sand", mapId: "desert_02", regionId: "desert", enemyUnits: ["knife_thrower", "mace_guard", "horseman"], weights: { knife_thrower: 35, mace_guard: 40, horseman: 25 }, ai: "heavy", encounterType: "elite" },
  { order: 17, title: "Frozen Seal", mapId: "frozen_pass_01", regionId: "frozen_pass", enemyUnits: ["mage", "mace_guard", "long_spearman"], weights: { mage: 35, mace_guard: 35, long_spearman: 30 }, ai: "heavy", encounterType: "normal" },
  { order: 18, title: "Long Winter Siege", mapId: "frozen_pass_02", regionId: "frozen_pass", enemyUnits: ["mage", "knife_thrower", "long_spearman"], weights: { mage: 35, knife_thrower: 30, long_spearman: 35 }, ai: "defensive", encounterType: "boss" },
  { order: 19, title: "Infernal Gate", mapId: "infernal_dungeon_01", regionId: "infernal_dungeon", enemyUnits: ["mage", "knife_thrower", "long_spearman"], weights: { mage: 35, knife_thrower: 30, long_spearman: 35 }, ai: "infernal", encounterType: "boss" },
  { order: 20, title: "Ash Citadel Final", mapId: "ash_citadel_final", regionId: "infernal_dungeon", enemyUnits: ["mage", "mace_guard", "long_spearman"], weights: { mage: 30, mace_guard: 30, long_spearman: 40 }, ai: "infernal", encounterType: "final" },
];

function levelId(order: number) {
  return `level_${String(order).padStart(3, "0")}`;
}

function createLevel(blueprint: LevelBlueprint): LevelConfig {
  const tuningIndex = blueprint.order - 1;
  const nextLevel = blueprint.order < LEVEL_BLUEPRINTS.length
    ? levelId(blueprint.order + 1)
    : undefined;
  const unlockUnit = ({ 5: "long_spearman", 9: "mace_guard", 13: "knife_thrower", 17: "mage" } as Partial<Record<number, UnitId>>)[blueprint.order];
  const durationTarget = TARGET_SECONDS[tuningIndex];

  return {
    id: levelId(blueprint.order),
    order: blueprint.order,
    title: blueprint.title,
    mapId: blueprint.mapId,
    regionId: blueprint.regionId,
    encounterType: blueprint.encounterType,
    story: {
      intro: `${blueprint.title}: sancak yolu ${blueprint.regionId.replace(/_/g, " ")} bolgesinden geciyor.`,
      victory: `${blueprint.title} temizlendi. Bir sonraki sancak yolu acildi.`,
      defeatHint: "Unit acilimlarini ve worker ekonomisini dengele; dusman agirligini config belirliyor.",
    },
    tactics: TACTICAL_IDENTITIES[blueprint.order - 1],
    duration: {
      targetSeconds: durationTarget,
      normalTolerance: 0.15,
      skilledFloorRatio: 0.7,
      overtimeRatio: 1.15,
      hardStopRatio: 1.5,
      tempoRampStartRatio: 0.72,
      tempoAtTarget: 1.12,
      tempoAtOvertime: 1.18,
      castleDamagePacing: CASTLE_DAMAGE_PACING[tuningIndex],
    },
    director: {
      reserveBudget: RESERVE_BUDGETS[tuningIndex],
      warningMs: blueprint.order <= 4 ? 6_000 : blueprint.order <= 12 ? 7_000 : 8_000,
      phases: createDirectorPhases(blueprint),
      variants: [
        { id: "steady_center", timingOffsetRatio: 0, lanePattern: "center" },
        { id: "early_alternating", timingOffsetRatio: -0.03, lanePattern: "alternating" },
        { id: "late_pincer", timingOffsetRatio: 0.03, lanePattern: "pincer" },
      ],
    },
    masteryGoal: masteryGoal(blueprint.order),
    player: {
      startGold: 8,
      castleHp: 1000,
      powers: {
        iceUnlockLevel: 1,
        missileUnlockLevel: 6,
      },
    },
    enemy: {
      castleHp: ENEMY_CASTLE_HP[tuningIndex],
      startGold: 8,
      aiProfile: blueprint.ai,
      spawnIntervalMs: ENEMY_DECISION_MS[tuningIndex],
      workerTarget: blueprint.order === 1 ? 1 : blueprint.order <= 4 ? 2 : 3,
      powers: enemyPowers(blueprint.order),
      allowedUnits: ["peasant", ...blueprint.enemyUnits],
      unitWeights: blueprint.weights,
    },
    economy: {
      passiveGoldIntervalMs: 4000,
      passiveGoldAmount: 1,
      maxWorkers: 3,
      resourceRespawnMs: 12_000,
    },
    difficulty: {
      enemyHpMultiplier: ENEMY_HP_MULTIPLIER[tuningIndex],
      enemyDamageMultiplier: ENEMY_DAMAGE_MULTIPLIER[tuningIndex],
    },
    rewards: {
      gold: 40 + tuningIndex * 9,
      starsAvailable: 3,
      unlockNextLevel: nextLevel,
      unlockUnit,
    },
  };
}

export const LEVELS: readonly LevelConfig[] = LEVEL_BLUEPRINTS.map(createLevel);

export const LEVELS_BY_ID: Record<string, LevelConfig> = Object.fromEntries(
  LEVELS.map((level) => [level.id, level]),
) as Record<string, LevelConfig>;

export function getLevelConfig(levelId: string): LevelConfig {
  const config = LEVELS_BY_ID[levelId];

  if (!config) {
    throw new Error(`Unknown level: ${levelId}`);
  }

  return config;
}

export function normalizeLevelId(levelId?: string | number) {
  if (typeof levelId === "number") {
    return levelId >= 1 ? `level_${String(levelId).padStart(3, "0")}` : "level_001";
  }

  return levelId && LEVELS_BY_ID[levelId] ? levelId : "level_001";
}
