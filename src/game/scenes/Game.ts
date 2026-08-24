import { generateRectTexture } from "../assets/RuntimeAssets";
import { Scene } from "phaser";
import { NetworkClient } from "../network/NetworkClient";
import { OnlineMatchRuntime } from "../network/OnlineMatchRuntime";
import type {
  OnlineCommandError,
  OnlineEmoteEvent,
  OnlineEmoteId,
  OnlineGameEnd,
  OnlineMatchSnapshot,
  OnlinePowerCast,
  OnlineReadyState,
  OnlineUnitState,
} from "../network/NetworkProtocol";
import {
  deploymentGuideBounds,
  formationWorldOffset,
  resolveDeploymentClick,
  type SideGeometry,
} from "../../../shared/online/SideGeometry";
import { castleContactX } from "../../../shared/online/CastleContact";
import { t } from "../i18n/Localization";
import {
  ALL_UNIT_IDS,
  queueBattleAudio,
  queuePowerBattleAudio,
  queueBattleStructures,
  queueUnitAtlases,
  releaseCampaignTexture,
  releaseMainMenuTextures,
} from "../assets/RuntimeAssets";
import { getAndroidPerfRequest, type AndroidPerfRequest } from "../performance/AndroidPerf";
import { AndroidPerformanceMonitor } from "../performance/AndroidPerformanceMonitor";
import { isNativeAndroidRuntime, playAndroidHaptic } from "../platform/AndroidHaptics";
import { MAP_ASSETS_BY_KEY, MAP_PROP_ATLASES } from "../config/mapAssets";
import { playSceneMusic, stopSceneMusic } from "../audio/GameAudio";
import {
  UNIT_ANIMATION_DEFINITIONS,
  UNIT_ATLAS_FRAME_ZERO_PAD,
  type UnitAnimationName,
} from "../config/unitAnimations";
import {
  UNIT_CONFIGS,
  UNIT_ORDER,
  isCavalryUnit,
  isRangedUnit,
  isWorkerUnit,
  visualUnitId,
} from "../config/units.config";

type OnlineEmoteQaState = {
  side: "left" | "right";
  sent: OnlineEmoteId[];
  received: Array<{ side: "left" | "right"; emote: OnlineEmoteId }>;
};
import {
  applyUnitRuntimeStats,
  difficultySummary,
  effectiveEnemySpawnInterval,
  weightedPickUnit,
} from "../systems/DifficultyMath";
import {
  BattleTelemetry,
  referenceLoadoutForLevel,
  targetMatchDuration,
  type BattleBalanceReport,
} from "../systems/BattleBalance";
import {
  createBattleBalanceSuiteCases,
  summarizeBattleBalanceSuite,
  type BalanceSuiteCase,
  type BattleBalanceSuiteSummary,
} from "../systems/BattleBalanceSuite";
import { BattleDirector, type DirectorWave } from "../systems/BattleDirector";
import {
  adaptiveDifficultyForProgress,
  type AdaptiveDifficultyState,
} from "../systems/AdaptiveDifficulty";
import {
  createMapPropVisual,
  flowPositionAtPoint,
  flowYAtX,
  laneYAtX,
  renderBattleMap,
} from "../systems/MapRenderer";
import { getLevelRuntime, getOnlineLevelRuntime, type BattleStartData, type LevelRuntime } from "../systems/LevelRuntime";
import {
  ensureLevelAttemptSeed,
  isLevelCompleted,
  loadCampaignProgress,
  markLevelCompleted,
  recordBattleAttemptResult,
} from "../systems/ProgressionStore";
import { preloadTiledBattleMap } from "../tiled/TiledAssetLoader";
import { TiledCollisionGrid } from "../tiled/TiledCollisionGrid";
import { applyTiledGameplayObjects, onlineSideGeometry } from "../tiled/TiledGameplayMap";
import { getTiledBattleMapDefinition } from "../tiled/TiledMapRegistry";
import { renderTiledBattleMap } from "../tiled/TiledMapRenderer";
import type { NavigationProfile, TiledMapRenderResult } from "../tiled/TiledTypes";
import { TiledNavigation, type TiledPathPoint } from "../tiled/TiledNavigation";
import type { MapVisualConfig, ResourceNodeConfig } from "../types/MapTypes";
import type { UnitId } from "../types/UnitTypes";
import type { EnemyPowerRule } from "../types/LevelTypes";
import type { CampaignStoryData } from "../types/StoryTypes";

type Team = "player" | "enemy";
type UnitType = UnitId;
type UnitState =
  | "move"
  | "chase"
  | "attackUnit"
  | "attackCastle"
  | "seekResource"
  | "gather"
  | "returnResource"
  | "shelter"
  | "deposit";
type UnitVisualAction = UnitAnimationName;
type Side = "left" | "right";
type CastleVariant = "tower" | "main";
type ResourceTreePart =
  | Phaser.GameObjects.Container
  | Phaser.GameObjects.Image
  | Phaser.GameObjects.Graphics
  | Phaser.GameObjects.Rectangle
  | Phaser.GameObjects.Ellipse;
interface CastleState {
  team: Team;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  frontX: number;
  hpFill: Phaser.GameObjects.Rectangle;
}

interface BattleUnit {
  id: number;
  team: Team;
  type: UnitType;
  state: UnitState;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  damage: number;
  range: number;
  releaseRange: number;
  visionRange: number;
  visionReleaseRange: number;
  fovCos: number;
  cooldown: number;
  speed: number;
  baseSpeed: number;
  iceSlowUntil: number;
  castleDamage: number;
  level: number;
  lastAttackAt: number;
  nextTargetScanAt: number;
  lastTargetChangeAt: number;
  targetId?: number;
  targetResourceId?: number;
  bypassAreaId?: string;
  bypassSide?: -1 | 1;
  routePosition: number;
  routeWaveAmplitude: number;
  routePhase: number;
  gatherUntil?: number;
  carryWood: number;
  homeX: number;
  depositUntil?: number;
  completedDelivery?: boolean;
  deathStartedAt?: number;
  isInsideCastle: boolean;
  nextHorseRunSfxAt?: number;
  navPath?: TiledPathPoint[];
  navGoalCell?: string;
  navGoalX?: number;
  navGoalY?: number;
  navNextPlanAt?: number;
  navProgressX?: number;
  navProgressY?: number;
  navProgressAt?: number;
  navRecoveryCount?: number;
  facingDirection: 1 | -1;
  navQa?: boolean;
  navQaLastX?: number;
  navQaLastY?: number;
  navQaLastProgressAt?: number;
  navQaLastLogAt?: number;
  navQaStuckLogged?: boolean;
  navQaCrossedBridge?: boolean;
  navQaReachedEnemy?: boolean;
  navQaBlockedLogged?: boolean;
  onlineFromX?: number;
  onlineFromY?: number;
  onlineTargetX?: number;
  onlineTargetY?: number;
  onlineInterpolationAt?: number;
  onlineSeenSequence?: number;
  reserveWaveId?: string;
  visualDepthBucket?: number;
  visualHpWidth?: number;
  visualAlpha?: number;
  visualFlipX?: boolean;
  visualTint?: number | null;
  visualAction?: UnitVisualAction;
  visualDense?: boolean;
  castleContactLogged?: boolean;
  nextVisualPolishAt?: number;
  nextHitFlashAt?: number;
  container: Phaser.GameObjects.Container;
  shadow: Phaser.GameObjects.Ellipse;
  sprite: Phaser.GameObjects.Sprite;
  hpBack: Phaser.GameObjects.Image;
  hpFill: Phaser.GameObjects.Image;
}

interface EnemyPowerCastContext {
  targetX: number;
  targetY: number;
  castleDistance: number;
  decisionDelayMs: number;
  castIndex: number;
  powerCastIndex: number;
  primaryTargetType: UnitType;
  targetPolicyViolation: boolean;
}

interface BalanceSuiteRuntimeState {
  cases: BalanceSuiteCase[];
  index: number;
  startedAt: string;
}

interface ResourceNode {
  id: number;
  x: number;
  y: number;
  amount: number;
  maxAmount: number;
  type: ResourceNodeConfig["type"];
  visual: MapVisualConfig;
  depthOffset: number;
  reservedBy: number[];
  respawnAt?: number;
  container: Phaser.GameObjects.Container;
  stump: Phaser.GameObjects.Rectangle;
  barFill: Phaser.GameObjects.Image;
  treeParts: ResourceTreePart[];
  barBack: Phaser.GameObjects.Image;
  onlineResourceId?: number;
  onlineRevision?: number;
  onlineSide?: Side;
}

interface UnitButton {
  type: UnitType;
  side: Side;
  card: Phaser.GameObjects.Rectangle;
  border: Phaser.GameObjects.Rectangle;
  selectionSeal: Phaser.GameObjects.Arc;
  icon: Phaser.GameObjects.Sprite;
  iconBaseScale: number;
  label: Phaser.GameObjects.Text;
  text: Phaser.GameObjects.Text;
  batchBack: Phaser.GameObjects.Rectangle;
  batchText: Phaser.GameObjects.Text;
  cooldownFill: Phaser.GameObjects.Rectangle;
  cooldownText: Phaser.GameObjects.Text;
  readyAt: number;
  pulseUntil: number;
  visualStateKey?: string;
}

interface WaterArea {
  id: string;
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  rotation: number;
  collision: "water" | "lava";
}

const WORLD_LEFT = 120;
const WORLD_RIGHT = 1160;
const PLAYER_DEPLOY_X = 310;
// Tree sprites are larger than their placement anchor. Keep their whole
// footprint out of red NAV_BLOCKED cells authored in the active .tmj map.
const TREE_NAV_CLEARANCE = 32;
const TREE_NAV_SEARCH_STEP = 20;
const TREE_NAV_SEARCH_RADIUS = 480;
const UNIT_DEPTH_OFFSET = 10;
const SPAWN_MIN_Y = 90;
const SPAWN_MAX_Y = 630;
const LEVEL_UP_EVERY = 3;
const ECONOMY_TICK_MS = 500;
const PASSIVE_INCOME_MS = 4000;
const ENEMY_AI_TICK_MS = 1000;
const ENEMY_AI_POLL_MS = 250;
const PROJECTILE_FLIGHT_MS = 285;
// Keep battle alerts implemented so they can be restored later, but leave
// their presentation disabled for the current UI pass.
const SHOW_BATTLE_ALERTS = false;
// Castle contact uses the authored TMJ deploy/spawn zone edge. Anchors stay as
// visual/HP bar points only; they must not create an invisible hit wall.
// Keep archers visibly committed to a siege instead of letting them fire from
// a detached position in the open field. Unit combat keeps its authored range;
// this tighter value only controls the final stand-off from a fortress facade.
const UNIT_DEPLOY_COOLDOWN_MS: Record<UnitType, number> = {
  // V9: combat units must be truly spammable by repeated taps.
  // Only worker keeps a tiny lock so one physical touch cannot double-submit.
  peasant: 85,
  swordsman: 0,
  archer: 0,
  horseman: 0,
  long_spearman: 0,
  mace_guard: 0,
  mage: 0,
  knife_thrower: 0,
};
const GENERATED_SOLDIER_MENU_ORDER: UnitType[] = [
  "mage",
  "knife_thrower",
  "mace_guard",
  "long_spearman",
];
const AUTHORED_RUN_CYCLE_UNITS: UnitType[] = [
  "horseman",
  "archer",
  "swordsman",
  "peasant",
  ...GENERATED_SOLDIER_MENU_ORDER,
];
const AUTHORED_RUN_FRAME_COUNTS: Partial<Record<UnitType, number>> = {
  horseman: 16,
  archer: 16,
  swordsman: 16,
  peasant: 16,
  mage: 16,
  knife_thrower: 16,
  mace_guard: 16,
  long_spearman: 16,
};
const UNIT_ATTACK_REFERENCE_CYCLE_MS = 16_000 / UNIT_ANIMATION_DEFINITIONS.attack.frameRate;
const MIN_MELEE_UNIT_ATTACK_COOLDOWN_MS = 1_200;
const UNIT_VS_UNIT_ATTACK_SLOWDOWN = 1.3;
// Sword's authored run and attack poses still read too quickly at the shared
// unit timing. Slow only its visual playback by exactly 30%; movement, damage,
// and attack cadence remain authoritative and unchanged.
const SWORDSMAN_RUN_ATTACK_ANIMATION_TIME_SCALE = 0.7;
// Authored run cycles use different non-clipping source heights. Normalize
// each action at render time so switching idle/run/attack keeps actor size.
const UNIT_IDLE_TO_RUN_VISUAL_SCALE: Record<UnitType, number> = {
  horseman: 104 / 86,
  archer: 102 / 111,
  swordsman: 101 / 106,
  peasant: 1,
  mage: 113 / 93,
  knife_thrower: 113 / 108,
  mace_guard: 113 / 96,
  long_spearman: 113 / 61,
};
const UNIT_IDLE_TO_ATTACK_VISUAL_SCALE: Record<UnitType, number> = {
  horseman: 104 / 78,
  archer: 1,
  swordsman: 101 / 74,
  peasant: 100 / 82,
  mage: 113 / 87,
  knife_thrower: 113 / 97,
  mace_guard: 113 / 70,
  long_spearman: 113 / 54,
};
const UNIT_IDLE_ATLAS_BOTTOM: Record<UnitType, number> = {
  horseman: 115,
  archer: 113,
  swordsman: 113,
  peasant: 112,
  mage: 112,
  knife_thrower: 112,
  mace_guard: 112,
  long_spearman: 112,
};
const UNIT_RUN_ATLAS_BOTTOM: Record<UnitType, number> = {
  horseman: 112,
  archer: 112,
  swordsman: 112,
  peasant: 112,
  mage: 112,
  knife_thrower: 112,
  mace_guard: 112,
  long_spearman: 112,
};
const UNIT_ATLAS_SIZE = 128;
const DEPLOY_COOLDOWN_UI_THRESHOLD_MS = 350;
const BATCH_FORMATION_SLOTS_PER_COLUMN = 5;
const BATCH_FORMATION_X_STEP = 17;
const BATCH_FORMATION_Y_STEP = 14;
const BATTLE_MUSIC_VOLUME = 0.3;
const SWORD_HIT_KEYS = ["sword-hit-1", "sword-hit-2", "sword-hit-3"] as const;
const ARROW_SHOT_KEYS = ["arrow-shot-1", "arrow-shot-2"] as const;
const AXE_HIT_KEYS = ["axe-hit-1", "axe-hit-2", "axe-hit-3"] as const;
const HORSE_RUN_SFX_INTERVAL_MS = 920;
const COMBAT_UNIT_CAP = 30;
const IS_ANDROID_RUNTIME = /Android/i.test(navigator.userAgent);
const FX_DENSE_UNIT_THRESHOLD = IS_ANDROID_RUNTIME ? 6 : 18;
const COMBAT_SFX_INTERVAL_MS = IS_ANDROID_RUNTIME ? 110 : 95;
const VERBOSE_COMBAT_LOG_SCOPES = new Set(["TARGET", "PROJECTILE"]);
const PRODUCTION_CONSOLE_LOG_SCOPES = new Set([
  "ERROR",
]);
const MISSILE_COOLDOWN_MS = 35_000;
const ICE_BLAST_COOLDOWN_MS = 45_000;
const MISSILE_RADIUS = 67;
const MISSILE_DAMAGE = 9_999;
// The missile may be aimed from the player's own castle edge so defenders can
// be cleared when they reach the walls. Keep a small safety gap so the marker
// remains just outside the castle artwork.
const PLAYER_MISSILE_CASTLE_CLEARANCE = 24;
const PLAYER_MISSILE_CHARGE_MS = 1_550;
const ICE_BLAST_RADIUS = 72;
const ICE_BLAST_DURATION_MS = 6_000;
const ICE_BLAST_SLOW_FACTOR = 0;
const POWER_FX_MAX_ACTIVE_BURSTS = IS_ANDROID_RUNTIME ? 2 : 3;
const POWER_FX_MISSILE_FRAGMENTS = IS_ANDROID_RUNTIME ? 7 : 14;
const POWER_FX_ICE_SHARDS = IS_ANDROID_RUNTIME ? 6 : 12;
const MISSILE_GROUND_MARK_MS = 10_000;
const POWER_SFX_MAX_ACTIVE = 2;
const MISSILE_GROUND_TEXTURE = "power-ground-missile-v1";
const ICE_GROUND_TEXTURE = "power-ground-ice-v1";
const POWER_GROUND_TEXTURE_WIDTH = 192;
const POWER_GROUND_TEXTURE_HEIGHT = 128;

type PowerType = "missile" | "ice";

interface TargetingConfig {
  castleInterruptRadius: number;
  interceptRadius: number;
  laneTolerance: number;
  nearThreatRadius: number;
  retargetMs: number;
}

const TARGETING_CONFIGS: Record<UnitType, TargetingConfig> = {
  horseman: {
    castleInterruptRadius: 168,
    interceptRadius: 150,
    laneTolerance: 50,
    nearThreatRadius: 92,
    retargetMs: 320,
  },
  archer: {
    castleInterruptRadius: 188,
    interceptRadius: 150,
    laneTolerance: 58,
    nearThreatRadius: 104,
    retargetMs: 380,
  },
  swordsman: {
    castleInterruptRadius: 158,
    interceptRadius: 142,
    laneTolerance: 44,
    nearThreatRadius: 88,
    retargetMs: 340,
  },
  peasant: {
    castleInterruptRadius: 0,
    interceptRadius: 0,
    laneTolerance: 38,
    nearThreatRadius: 0,
    retargetMs: 440,
  },
  long_spearman: {
    castleInterruptRadius: 160,
    interceptRadius: 148,
    laneTolerance: 46,
    nearThreatRadius: 92,
    retargetMs: 330,
  },
  mace_guard: {
    castleInterruptRadius: 152,
    interceptRadius: 142,
    laneTolerance: 48,
    nearThreatRadius: 90,
    retargetMs: 390,
  },
  mage: {
    castleInterruptRadius: 180,
    interceptRadius: 150,
    laneTolerance: 56,
    nearThreatRadius: 104,
    retargetMs: 420,
  },
  knife_thrower: {
    castleInterruptRadius: 150,
    interceptRadius: 146,
    laneTolerance: 52,
    nearThreatRadius: 98,
    retargetMs: 480,
  },
};

const CASTLE_UNIT_INTERRUPT_BONUS = -112;
const CURRENT_TARGET_STICKINESS = -74;
const SELF_DEFENSE_TARGET_BONUS = -72;
const SAME_LANE_TARGET_BONUS = -62;
const NEAR_THREAT_TARGET_BONUS = -86;
const FORWARD_TARGET_BONUS = -32;
const REAR_TARGET_PENALTY = 58;
// Combat units screen immediate combat threats before chasing workers. Workers
// remain valid targets when no more relevant soldier is inside perception.
const RANGED_WORKER_TARGET_PENALTY = 42;
const MELEE_WORKER_TARGET_PENALTY = 96;
const RESOURCE_MAX_RESERVATIONS = 2;
const WORKER_RESOURCE_RESCAN_MS = 320;
const WORKER_RESOURCE_SWITCH_HYSTERESIS = 34;
const WORKER_RESERVED_SLOT_PENALTY = 10;
const UNIT_DEATH_ANIMATION_MS = 460;
// Allow the local slide/replan recovery to run before declaring a QA stall.
// A brief queue at a narrow bridge mouth is congestion, not a stuck unit.
const NAV_QA_STUCK_CONFIRM_MS = 5_000;
const HARVEST_TICK_MS = 680;
const WORKER_CARRY_CAPACITY = 3;
const WORKER_DEPOSIT_MS = 560;
const WORKER_RESOURCE_REACH = 24;
const WORKER_HOME_REACH = 28;
const CASTLE_APPROACH_FINAL_X_WINDOW = 18;
// Resource trees use the same authored art as map foliage, but their previous
// raw map scale made them look like giant trees. Keep them identifiable via
// the resource bar, not by making the sprite larger than nearby decoration.
const RESOURCE_TREE_MAP_SCALE = 0.48;
// Respawn scale is relative to the tree's authored/map visual scale. Keeping
// it on the outer container avoids replacing the already-correct asset scale.
const RESOURCE_TREE_RESPAWN_SCALE = 0.8;
const RESOURCE_TREE_RESPAWN_NEAR_MIN = 82;
const RESOURCE_TREE_RESPAWN_NEAR_MAX = 150;
const RESOURCE_TREE_RESPAWN_SEPARATION = 64;
const MAIN_CASTLE_VISUAL_SCALE = 0.84;
const PLAYER_MAIN_STRUCTURE_HEIGHT = 132;
const PLAYER_TOWER_STRUCTURE_HEIGHT = 110;
const ENEMY_MAIN_STRUCTURE_HEIGHT = 126;
const ENEMY_TOWER_STRUCTURE_HEIGHT = 106;
const WALL_STRUCTURE_TARGET_WIDTH = 82;
const FORTRESS_SIDE_DISPLAY_HEIGHT = 700;
const PLAYER_FORTRESS_SIDE_X = 230;
const ENEMY_FORTRESS_SIDE_X = 1048;
const FORTRESS_SIDE_Y = 350;
const FORTRESS_SIDE_DEPTH = 640;

const TOWER_VISUAL_SCALE = 0.8;
const WALL_VISUAL_SCALE = 0.84;
const UNIT_HP_BAR_WIDTH = 32;
const CASTLE_HP_BAR_WIDTH = 68;
const DEPLOY_TEXTURE_KEY = "cached-deploy-lane-v2";
const RIGHT_SIDE_DEPLOY_EDGE_INSET_X = 24;
const CASTLE_SIDE_DEPLOY_CLICK_EXTENSION_X = 72;
const DEPLOY_POSITIVE_X_REDUCTION = 35;

const randomInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;
const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);
const halfAngleCos = (degrees: number) =>
  Math.cos((degrees * Math.PI) / 180 / 2);
const createSpawnCounter = (): Record<UnitType, number> =>
  Object.fromEntries(UNIT_ORDER.map((unitId) => [unitId, 0])) as Record<UnitType, number>;

export class Game extends Scene {
  private androidPerf: AndroidPerfRequest = getAndroidPerfRequest();
  private androidPerfMonitor?: AndroidPerformanceMonitor;
  private androidPerfProfiling = false;
  private androidPerfFinished = false;
  private androidPerfLastUpdateAt = 0;
  private nextAndroidPerfPopulationAt = 0;
  private androidPerfSimulationMs = 0;
  private androidPerfUnitUpdateMs = 0;
  private androidPerfSimulationSteps = 0;
  private astarCalls = 0;
  private astarMs = 0;
  private astarCacheHits = 0;
  private targetScans = 0;
  private targetScanMs = 0;
  private pathPlansThisFrame = 0;
  private readonly pathCache = new Map<string, TiledPathPoint[]>();
  private readonly unitById = new Map<number, BattleUnit>();
  private readonly spatialBuckets = new Map<number, BattleUnit[]>();
  private readonly activeSpatialBucketKeys: number[] = [];
  private readonly arrowPool: Phaser.GameObjects.Image[] = [];
  private readonly hitEffectPool: Phaser.GameObjects.Image[] = [];
  private readonly powerFxShardPool: Phaser.GameObjects.Image[] = [];
  private readonly powerFxDebrisPool: Phaser.GameObjects.Rectangle[] = [];
  private readonly activePowerSfx = new Set<Phaser.Sound.BaseSound>();
  private activePowerFxBursts = 0;
  private levelRuntime: LevelRuntime = getLevelRuntime("level_001");
  private battleStartData: BattleStartData = this.levelRuntime.battleStartData;
  private units: BattleUnit[] = [];
  private resourceNodes: ResourceNode[] = [];
  private readonly onlineResourceById = new Map<number, ResourceNode>();
  private waterAreas: WaterArea[] = [];
  private playerCastle: CastleState;
  private enemyCastle: CastleState;
  private gold = 0;
  private enemyGold = 0;
  private unitId = 0;
  private resourceNodeId = 0;
  private elapsedMs = 0;
  private battleEnded = false;
  private selectedUnit: UnitType | undefined;
  private pendingDeployCounts: Partial<Record<UnitType, number>> = {};
  private unitButtons: UnitButton[] = [];
  private spawnCounts: Record<Team, Record<UnitType, number>> = {
    player: createSpawnCounter(),
    enemy: createSpawnCounter(),
  };
  private goldText: Phaser.GameObjects.Text;
  private enemyGoldText: Phaser.GameObjects.Text;
  private statusText: Phaser.GameObjects.Text;
  private debugText: Phaser.GameObjects.Text;
  private aiText: Phaser.GameObjects.Text;
  private spawnStripe: Phaser.GameObjects.Image;
  private spawnMarker: Phaser.GameObjects.Rectangle;
  private missileAimPad: Phaser.GameObjects.Container;
  private missileAimGuide: Phaser.GameObjects.Rectangle;
  private missileAimFill: Phaser.GameObjects.Rectangle;
  private missileAimReticle: Phaser.GameObjects.Image;
  private missileAimPercentText: Phaser.GameObjects.Text;
  private pendingBatchBack: Phaser.GameObjects.Rectangle;
  private pendingBatchText: Phaser.GameObjects.Text;
  private warningText: Phaser.GameObjects.Text;
  private activePower: PowerType | undefined;
  private missileAimPointerId: number | undefined;
  private missileAimStartedAt = 0;
  private missileAimY = 360;
  private missileReadyAt = 0;
  private iceReadyAt = 0;
  private enemyMissileReadyAt = Number.POSITIVE_INFINITY;
  private enemyIceReadyAt = Number.POSITIVE_INFINITY;
  private enemyPowerLockUntil = 0;
  private enemyPowerPending = false;
  private enemyPowerCastCount = 0;
  private enemyPowerCastCounts: Record<PowerType, number> = { missile: 0, ice: 0 };
  private nextEnemyPowerDecisionAt = 0;
  private nextEnemyPowerHoldLogAt = 0;
  private nextEnemyCombatDecisionAt = 0;
  private enemyZeroWorkerStartedAt: number | undefined;
  private lastEnemyWorkerReserve = -1;
  private enemyNoDefenderStartedAt: number | undefined;
  private sealWaitStartedAt: number | undefined;
  private nextPassiveIncomeAt = 0;
  private adaptiveDifficulty: AdaptiveDifficultyState = adaptiveDifficultyForProgress(
    loadCampaignProgress(),
  );
  private battleDirector = new BattleDirector(
    this.levelRuntime.level,
    this.levelRuntime.battleStartData.attemptSeed,
  );
  private directorText: Phaser.GameObjects.Text;
  private battleLog: Array<Record<string, unknown>> = [];
  private playerIncomeEvents: Array<{ atMs: number; amount: number }> = [];
  private enemyIncomeEvents: Array<{ atMs: number; amount: number }> = [];
  private masteryCounterKills = 0;
  private playerCombatTypesUsed = new Set<UnitType>();
  private backgroundPauseHandler?: () => void;
  private pausedByBackground = false;
  private reserveWarningContainer?: Phaser.GameObjects.Container;
  private nextDirectorStallLogAt = 0;
  private nextBattleDirectorUpdateAt = 0;
  private missileCooldownFill: Phaser.GameObjects.Arc;
  private missileCooldownText: Phaser.GameObjects.Text;
  private iceCooldownFill: Phaser.GameObjects.Arc;
  private iceCooldownText: Phaser.GameObjects.Text;
  private pauseButton: Phaser.GameObjects.Rectangle;
  private pauseLabel: Phaser.GameObjects.Text;
  private removeSelectionButton?: Phaser.GameObjects.Container;
  private removeSelectionLabel?: Phaser.GameObjects.Text;
  private removeSelectionVisible = false;
  private pauseOverlay?: Phaser.GameObjects.Container;
  private isPaused = false;
  private deployPointerHeld = false;
  private deployPointerId: number | undefined;
  private heldDeployX = PLAYER_DEPLOY_X;
  private heldDeployY = 360;
  private nextHeldDeployAt = 0;
  private autoDeployLaneIndex = 0;
  private mapSeed = 1;
  private mapRandomState = 1;
  private balanceQaMode = false;
  private balanceQaSpeed = 1;
  private balanceQaPlayerDecisionMs = 1400;
  private nextBalanceSnapshotAt = 10_000;
  private lastTelemetryAt = 0;
  private nextTelemetrySampleAt = 0;
  private nextUiUpdateAt = 0;
  private nextDamageFxAt = 0;
  private nextHitFxAt = 0;
  private nextCombatSfxAt = 0;
  private perfSimulationMs = 0;
  private perfUnitUpdateMs = 0;
  private perfSimulationSteps = 0;
  private balanceQaStyle = "balancedCounter";
  private balanceQaLoadout: UnitType[] = referenceLoadoutForLevel(this.levelRuntime.level);
  private balanceTelemetry = new BattleTelemetry(
    this.levelRuntime.level,
    1,
    1,
    this.balanceQaLoadout,
    this.levelRuntime.map.resources.length,
  );
  private telemetryLossUnitIds = new Set<number>();
  private balanceReportPublished = false;
  private economyQaMode = false;
  private economyQaDeathDenialPassed = false;
  private economyQaPassivePassed = false;
  private economyQaCanTrainPassed = false;
  private economyQaDeliveryPassed = false;
  private economyQaWorkerCapPassed = false;
  private economyQaFinished = false;
  private durationBalanceWarned = false;
  private tempoStage = 0;
  private navigationQaMode = false;
  private castleCombatQaMode = false;
  private swordDuelQaMode = false;
  private targetingQaMode = false;
  private navigationQaSpeed = 1;
  private navigationQaExpectedCount = 0;
  private navigationQaStuckEvents = 0;
  private navigationQaBlockedEvents = 0;
  private navigationQaResultPublished = false;
  private editorPreview = false;
  private editorReturnScene: "MapEditor" | undefined;
  private tiledMapRender?: TiledMapRenderResult;
  private tiledNavigation?: TiledCollisionGrid;
  private tiledPathfinder?: TiledNavigation;

  public isOnline: boolean = false;
  public roomId?: string;
  public localPlayerSide: "left" | "right" = "left";
  private onlineUiQa = false;
  private onlineRuntime?: OnlineMatchRuntime;
  private onlineLastSnapshotSequence = -1;
  private onlineMatchDurationMs = 0;
  private onlineGeometry?: SideGeometry;
  private onlineOpponentGeometry?: SideGeometry;
  private onlineClientReadySent = false;
  private onlineMatchStarted = false;
  private onlineLeaveDialogOpen = false;
  private onlineReadyOverlay?: Phaser.GameObjects.Container;
  private onlineReadyOwnText?: Phaser.GameObjects.Text;
  private onlineReadyOpponentText?: Phaser.GameObjects.Text;
  private onlinePerformanceText?: Phaser.GameObjects.Text;
  private onlinePerfNextUiAt = 0;
  private onlinePerfNextLogAt = 0;
  private onlinePerfLastFrameAt = 0;
  private onlinePerfSampleIndex = 0;
  private onlinePerfSampleCount = 0;
  private readonly onlinePerfFrameSamples = new Float32Array(600);
  private onlineNextHudAt = 0;
  private onlineQaSpawnIndex = 0;
  private onlineEmoteTray?: Phaser.GameObjects.Container;
  private readonly onlineEmoteBubbles = new Map<"left" | "right", Phaser.GameObjects.Container>();
  private onlineEmoteCooldownUntil = 0;
  private onlineEmoteQaState: OnlineEmoteQaState = { side: "left", sent: [], received: [] };
  private playerDeployZone!: { x: number; minY: number; maxY: number; width: number };

  constructor() {
    super("Game");
  }

  init(data?: Partial<BattleStartData> & { levelId?: string | number, side?: "left" | "right", isOnline?: boolean, roomId?: string, onlineUiQa?: boolean }) {
    this.isOnline = data?.isOnline === true;
    this.roomId = data?.roomId;
    this.localPlayerSide = data?.side === "right" ? "right" : "left";

    this.androidPerf = getAndroidPerfRequest();
    this.onlineUiQa = data?.onlineUiQa === true && (import.meta.env.DEV || this.androidPerf.enabled);
    this.androidPerfProfiling =
      this.androidPerf.enabled || import.meta.env.VITE_ANDROID_DIAGNOSTICS === "1";
    const suiteCase = this.currentBalanceSuiteCase();
    this.levelRuntime = this.isOnline
      ? getOnlineLevelRuntime(data?.mapId)
      : getLevelRuntime(suiteCase?.levelId ?? data?.levelId, data?.mapOverride);

    this.playerDeployZone = (this.isOnline && this.localPlayerSide === "right")
      ? this.levelRuntime.map.enemySpawnZone
      : this.levelRuntime.map.deployZone;
    this.editorPreview = data?.editorPreview === true;
    this.editorReturnScene = data?.returnScene;
    this.balanceQaMode = !this.isOnline && this.isBalanceQaPath();
    this.balanceQaLoadout = referenceLoadoutForLevel(this.levelRuntime.level);
    const requestedLoadout = this.isOnline
      ? (["peasant", "swordsman", "archer", "horseman"] as UnitType[])
      : this.balanceQaMode
      ? (["peasant", ...this.balanceQaLoadout] as UnitType[])
      : data?.playerLoadout;
    const playerLoadout =
      requestedLoadout?.length === 4 &&
      requestedLoadout[0] === "peasant" &&
      new Set(requestedLoadout).size === 4 &&
      requestedLoadout.every((unitId) => Boolean(UNIT_CONFIGS[unitId]))
        ? requestedLoadout
        : this.levelRuntime.playerUnitIds;
    this.battleStartData = {
      ...this.levelRuntime.battleStartData,
      attemptSeed:
        suiteCase?.seed ??
        data?.attemptSeed ??
        ensureLevelAttemptSeed(this.levelRuntime.level.id),
      playerLoadout,
      editorPreview: this.editorPreview,
      returnScene: this.editorReturnScene,
    };
  }

  preload() {
    // Mask the previous scene during synchronous/asynchronous texture loading
    this.cameras.main.setBackgroundColor(0x071525);
    const bg = this.add.rectangle(640, 360, 1280, 720, 0x071525, 1).setDepth(99999);
    const text = this.add.text(640, 360, t("game_preparing_battle"), {
      fontFamily: "Arial Black, Arial, sans-serif",
      fontSize: "24px",
      color: "#ffffff"
    }).setOrigin(0.5).setDepth(100000);

    this.load.on("complete", () => {
      bg.destroy();
      text.destroy();
    });

    this.load.setPath("assets");
    const tiledDefinition = getTiledBattleMapDefinition(this.levelRuntime.map.id);
    const usesReferenceVisuals = tiledDefinition?.usesReferenceVisuals === true;
    const loadAllUnits =
      this.isTargetingQaPath() ||
      this.isNavigationQaPath() ||
      this.isSoldierMenuTestPath();
    const playerUnitIds = this.isOnline
      ? this.battleStartData.playerLoadout
      : loadAllUnits
      ? ALL_UNIT_IDS
      : [...this.battleStartData.playerLoadout, ...(this.levelRuntime.level.rewards.unlockUnit ? [this.levelRuntime.level.rewards.unlockUnit] : [])];
    const enemyUnitIds = this.isOnline
      ? playerUnitIds
      : loadAllUnits ? ALL_UNIT_IDS : this.levelRuntime.enemyUnitIds;
    queueUnitAtlases(this, playerUnitIds, enemyUnitIds);
    if (!usesReferenceVisuals) queueBattleStructures(this);
    queueBattleAudio(this);
    queuePowerBattleAudio(this);
    if (this.isOnline) {
      for (const side of ["blue", "red"] as const) {
        for (const emote of ["laugh", "grin", "cry", "worry"] as const) {
          const key = `online-emote-${side}-${emote}`;
          if (!this.textures.exists(key)) this.load.image(key, `ui/emotes/${side}-${emote}.png`);
        }
      }
    }
    preloadTiledBattleMap(this, this.levelRuntime.map.id);
    const visualItems = usesReferenceVisuals
      ? this.levelRuntime.map.resources
      : [...this.levelRuntime.map.objects, ...this.levelRuntime.map.resources];
    const assetKeys = visualItems
      .flatMap((item) => item.visual.source === "asset" ? [item.visual.assetKey] : []);
    if (usesReferenceVisuals) {
      for (const assetKey of new Set(assetKeys)) {
        const asset = MAP_ASSETS_BY_KEY[assetKey];
        if (asset && !this.textures.exists(asset.key)) {
          this.load.image(asset.key, `maps/runtime-resources/${asset.key}.png`);
        }
      }
    }
    const atlasKeys = new Set(assetKeys.map((assetKey) => MAP_ASSETS_BY_KEY[assetKey]?.atlasKey).filter(Boolean));
    MAP_PROP_ATLASES.forEach((atlas) => {
      if (!usesReferenceVisuals && atlasKeys.has(atlas.key) && !this.textures.exists(atlas.key)) {
        this.load.atlas(atlas.key, atlas.imagePath, atlas.dataPath);
      }
    });
  }

  create() {
    releaseMainMenuTextures(this);
    releaseCampaignTexture(this);
    this.resetState();
    this.ensurePowerGroundTextures();
    this.events.once("shutdown", () => this.releaseActivePowerSfx());
    this.targetingQaMode = this.isTargetingQaPath();
    this.castleCombatQaMode = this.isCastleCombatQaPath();
    this.swordDuelQaMode = this.isSwordDuelQaPath();
    this.navigationQaMode = this.isNavigationQaPath() || this.targetingQaMode || this.castleCombatQaMode || this.swordDuelQaMode;
    if (this.androidPerf.enabled) {
      this.time.timeScale = 1;
      this.tweens.timeScale = 1;
    } else if (this.balanceQaMode) {
      this.time.timeScale = this.balanceQaSpeed;
      this.tweens.timeScale = this.balanceQaSpeed;
      this.sound.mute = true;
    }
    if (this.navigationQaMode) this.sound.mute = true;
    this.cameras.main.setBackgroundColor(0xf4f4ef);
    this.cameras.main.fadeIn(180, 0, 0, 0);
    this.log("SCENE", this.formatBattleStartLog());
    if (!this.balanceQaMode) this.startBattleMusic();

    this.createUnitAnimations();
    this.createSnowMap();
    this.createStrongholds();
    this.applyLevelCastleHp();
    this.startNavigationQa();
    // Online multiplayer: each player controls their own side panel.
    // Player 1 (left):  left panel interactive,  right panel = read-only enemy view
    // Player 2 (right): right panel interactive, left panel  = read-only enemy view
    // Offline: always left interactive, right non-interactive (AI)
    const leftInteractive  = !this.isOnline || this.localPlayerSide === "left";
    const rightInteractive = this.isOnline  && this.localPlayerSide === "right";
    this.createSidePanel("left",  leftInteractive);
    this.createSidePanel("right", rightInteractive);
    this.createTopHud();
    if (this.isOnline) this.createOnlineSideIdentity();
    if (this.isOnline) this.createOnlineEmoteUi();
    if (this.isOnline && !this.onlineUiQa) this.createOnlineReadyOverlay();
    if (this.isEnemyPowerQaPath()) this.startEnemyPowerQa();
    this.startPowerFxQa();
    this.setupBackgroundPause();
    this.createEditorPreviewExit();
    if (!this.androidPerf.enabled || this.androidPerf.realSystems) {
      this.time.delayedCall(260, () => this.flashWarning("TRAIN PEASANTS"));
    }
    this.createSpawnGuide();
    this.enableDeploymentInput();
    this.publishMapPackageQa();
    if (this.onlineUiQa) this.setupOnlineUiQa();
    this.time.delayedCall(34, () => this.publishStoryCleanupQa());
    if (!this.isOnline && (!this.androidPerf.enabled || this.androidPerf.realSystems)) {
      this.time.addEvent({
        delay: ECONOMY_TICK_MS,
        loop: true,
        callback: () => this.tickEconomy(),
      });
    }

    if (!this.isOnline && !this.navigationQaMode && (!this.androidPerf.enabled || this.androidPerf.realSystems)) {
      this.time.addEvent({
        delay: ENEMY_AI_POLL_MS,
        loop: true,
        callback: () => this.tickEnemyAi(),
      });
    }

    if (this.balanceQaMode) {
      this.time.addEvent({
        delay: this.balanceQaPlayerDecisionMs,
        loop: true,
        callback: () => this.tickBalanceQaPlayer(),
      });
      this.log(
        "BALANCE_QA",
        `autoplay enabled speed=${this.balanceQaSpeed}x playerDecision=${this.balanceQaPlayerDecisionMs}ms loadout=${this.balanceQaLoadout.join(",")} target=${JSON.stringify(targetMatchDuration(this.levelRuntime.level))}`,
      );
    }

    this.setupEconomyQaMode();
    if (this.androidPerfProfiling) this.startAndroidPerfMonitor();

    if (this.isOnline && !this.onlineUiQa) {
      this.setupNetworkListeners();
    }
  }

  private setupNetworkListeners() {
    const net = NetworkClient.getInstance();
    this.onlineRuntime?.dispose();
    this.onlineRuntime = new OnlineMatchRuntime(net, {
      onSnapshot: (snapshot) => this.applyOnlineSnapshot(snapshot),
      onGameEnd: (result) => this.finishOnlineMatch(result),
      onCommandError: (error) => this.handleOnlineCommandError(error),
      onPowerCast: (event) => this.renderOnlinePowerCast(event),
      onEmote: (event) => this.receiveOnlineEmote(event),
      onGameStart: () => this.handleOnlineGameStart(),
      onReadyState: (state) => this.handleOnlineReadyState(state),
    });
    this.sendOnlineClientReady();
    this.events.once("shutdown", () => {
      this.onlineRuntime?.dispose();
      this.onlineRuntime = undefined;
    });
  }

  private sendOnlineClientReady() {
    if (!this.isOnline || this.onlineUiQa || this.onlineClientReadySent) return;
    this.onlineClientReadySent = true;
    NetworkClient.getInstance().sendReady();
    this.statusText.setText(t("game_online_arena_ready"));
    this.updateOnlineReadyOverlay(true, false);
    this.log("ONLINE", `client ready room=${this.roomId ?? "unknown"} side=${this.localPlayerSide}`);
  }

  private handleOnlineReadyState(state: OnlineReadyState) {
    if (!this.isOnline || state.roomId !== this.roomId || this.onlineMatchStarted) return;
    const ownReady = this.localPlayerSide === "left" ? state.leftReady : state.rightReady;
    const opponentReady = this.localPlayerSide === "left" ? state.rightReady : state.leftReady;
    this.updateOnlineReadyOverlay(ownReady, opponentReady);
    if (ownReady && opponentReady) {
      this.statusText.setText(t("game_online_both_ready"));
    } else if (ownReady) {
      this.statusText.setText(t("game_online_arena_ready"));
    } else {
      this.statusText.setText(t("game_online_arena_loading"));
    }
  }

  private handleOnlineGameStart() {
    if (!this.isOnline || this.onlineMatchStarted) return;
    this.onlineMatchStarted = true;
    this.onlineReadyOverlay?.destroy();
    this.onlineReadyOverlay = undefined;
    this.onlineReadyOwnText = undefined;
    this.onlineReadyOpponentText = undefined;
    this.statusText.setText(t("game_online_battle_started"));
    NetworkClient.getInstance().requestResync();
    this.flashWarning(this.localPlayerSide === "left" ? "YOU ARE LEFT" : "YOU ARE RIGHT");
    this.log("ONLINE", `game start room=${this.roomId ?? "unknown"} side=${this.localPlayerSide}`);
    if (
      import.meta.env.VITE_ONLINE_QA === "1" &&
      new URLSearchParams(window.location.search).has("onlineQaAutoplay")
    ) {
      this.time.addEvent({
        delay: 650,
        loop: true,
        callback: () => this.tickOnlineQaAutoplay(),
      });
    }
  }

  private tickOnlineQaAutoplay() {
    if (!this.isOnline || !this.onlineMatchStarted || this.battleEnded || !this.onlineRuntime) return;
    const team = this.localTeam();
    const zone = this.homeDeployZoneForTeam(team);
    const workerCount = this.activeWorkerCount(team);
    const type: UnitType | undefined = this.localPlayerSide === "right"
      ? workerCount < 2 && this.localGold() >= UNIT_CONFIGS.peasant.cost ? "peasant" : undefined
      : this.localGold() >= UNIT_CONFIGS.swordsman.cost ? "swordsman" : undefined;
    if (!type) return;

    const lane = this.onlineQaSpawnIndex++ % 5;
    const y = zone.minY + ((lane + 1) * (zone.maxY - zone.minY)) / 6;
    this.onlineRuntime.spawn(type, 1, zone.x, y);
  }

  private isOnlineWaitingForStart() {
    return this.isOnline && !this.onlineUiQa && !this.onlineMatchStarted;
  }

  private createOnlineReadyOverlay() {
    this.onlineReadyOverlay?.destroy();
    const teamColor = this.localPlayerSide === "left" ? 0x36baf2 : 0xe85a4f;
    const shade = this.add.rectangle(640, 360, 700, 192, 0x07101a, 0.74)
      .setStrokeStyle(4, teamColor, 0.94);
    const title = this.add.text(640, 302, t("game_online_ready_title"), {
      fontFamily: "Arial Black",
      fontSize: 28,
      color: "#fff2c0",
      stroke: "#101010",
      strokeThickness: 6,
    }).setOrigin(0.5);
    const subtitle = this.add.text(640, 340, t("game_online_ready_subtitle"), {
      fontFamily: "Arial Black",
      fontSize: 15,
      color: "#ffffff",
      stroke: "#101010",
      strokeThickness: 4,
    }).setOrigin(0.5);
    this.onlineReadyOwnText = this.add.text(640, 390, `${t("game_online_you")}: ${t("game_online_preparing")}`, {
      fontFamily: "Arial Black",
      fontSize: 18,
      color: "#ffe38a",
      stroke: "#101010",
      strokeThickness: 4,
    }).setOrigin(0.5);
    this.onlineReadyOpponentText = this.add.text(640, 425, `${t("game_online_opponent")}: ${t("game_online_preparing")}`, {
      fontFamily: "Arial Black",
      fontSize: 18,
      color: "#ffe38a",
      stroke: "#101010",
      strokeThickness: 4,
    }).setOrigin(0.5);
    this.onlineReadyOverlay = this.add.container(0, 0, [
      shade,
      title,
      subtitle,
      this.onlineReadyOwnText,
      this.onlineReadyOpponentText,
    ]).setDepth(1800);
  }

  private updateOnlineReadyOverlay(ownReady: boolean, opponentReady: boolean) {
    if (!this.onlineReadyOverlay) return;
    this.onlineReadyOwnText?.setText(`${t("game_online_you")}: ${ownReady ? t("game_online_ready") : t("game_online_preparing")}`)
      .setColor(ownReady ? "#6dff9b" : "#ffe38a");
    this.onlineReadyOpponentText?.setText(`${t("game_online_opponent")}: ${opponentReady ? t("game_online_ready") : t("game_online_preparing")}`)
      .setColor(opponentReady ? "#6dff9b" : "#ffe38a");
  }

  private setupOnlineUiQa() {
    const requestedPower = new URLSearchParams(window.location.search).get("powerQaState");
    if (this.androidPerf.syntheticPopulation) {
      const types: UnitType[] = ["swordsman", "archer", "horseman"];
      for (const team of ["player", "enemy"] as const) {
        const zone = this.homeDeployZoneForTeam(team);
        for (let index = 0; index < 30; index += 1) {
          const y = zone.minY + 24 + (index % 10) * Math.max(1, (zone.maxY - zone.minY - 48) / 9);
          const x = zone.x + (team === "player" ? 1 : -1) * Math.floor(index / 10) * 16;
          this.spawnUnit(team, types[index % types.length], y, x, {
            forceBaseLevel: true,
            goldAlreadySpent: true,
          });
        }
      }
    }
    if (requestedPower === "missile" || requestedPower === "ice") {
      this.time.delayedCall(260, () => this.selectPower(requestedPower));
    }
    (window as typeof window & { __CASTLE_ONLINE_UI_QA__?: Record<string, unknown> })
      .__CASTLE_ONLINE_UI_QA__ = {
        side: this.localPlayerSide,
        power: requestedPower,
        syntheticUnits: this.units.length,
      };
    this.log("ONLINE_UI_QA", `side=${this.localPlayerSide} power=${requestedPower ?? "none"} units=${this.units.length}`);
  }

  private applyOnlineSnapshot(snapshot: OnlineMatchSnapshot) {
    if (snapshot.roomId !== this.roomId || snapshot.seq <= this.onlineLastSnapshotSequence) return;
    const receivedAt = performance.now();
    this.onlineLastSnapshotSequence = snapshot.seq;
    this.elapsedMs = snapshot.elapsedMs;
    this.onlineMatchDurationMs = snapshot.durationMs;
    this.gold = snapshot.left.gold;
    this.enemyGold = snapshot.right.gold;
    this.playerCastle.maxHp = snapshot.left.castleMaxHp;
    this.playerCastle.hp = snapshot.left.castleHp;
    this.enemyCastle.maxHp = snapshot.right.castleMaxHp;
    this.enemyCastle.hp = snapshot.right.castleHp;
    this.syncOnlineResources(snapshot.resources ?? []);
    const localSnapshot = this.localPlayerSide === "left" ? snapshot.left : snapshot.right;
    this.missileReadyAt = localSnapshot.powerReadyAt.missile;
    this.iceReadyAt = localSnapshot.powerReadyAt.ice;

    for (const authoritative of snapshot.units) {
      const type = authoritative.type as UnitType;
      if (!UNIT_CONFIGS[type]) continue;
      const team: Team = authoritative.side === "left" ? "player" : "enemy";
      let unit = this.unitById.get(authoritative.id);
      if (!unit) {
        this.spawnUnit(team, type, authoritative.y, authoritative.x, {
          goldAlreadySpent: true,
          authoritativeId: authoritative.id,
          authoritativeLevel: authoritative.level,
        });
        unit = this.unitById.get(authoritative.id);
      }
      if (!unit) continue;
      unit.onlineSeenSequence = snapshot.seq;
      const previousState = unit.state;
      unit.onlineFromX = unit.x;
      unit.onlineFromY = unit.y;
      unit.onlineTargetX = authoritative.x;
      unit.onlineTargetY = authoritative.y;
      unit.onlineInterpolationAt = receivedAt;
      unit.hp = authoritative.hp;
      unit.maxHp = authoritative.maxHp;
      unit.facingDirection = authoritative.facing;
      unit.iceSlowUntil = authoritative.iceUntilMs;
      unit.state = this.onlineVisualState(authoritative.state);
      const isAttacking = unit.state === "attackUnit" || unit.state === "attackCastle";
      const enteredAttack = unit.state !== previousState && isAttacking;
      const attackSoundDue = isAttacking && (
        enteredAttack || this.elapsedMs - unit.lastAttackAt >= this.effectiveAttackCooldown(unit)
      );
      if (attackSoundDue) {
        unit.lastAttackAt = this.elapsedMs;
        this.restartUnitAttack(unit);
        if (unit.state === "attackCastle") {
          // The server owns damage cadence. Sound uses the existing global
          // combat-SFX limiter, while haptics collapse simultaneous attackers
          // into one native pulse per combat beat so neither can tax rendering.
          // Only an incoming hit on this device's castle is tactile. The
          // local player's attacks on the opponent castle must stay silent.
          if (authoritative.side !== this.localPlayerSide) {
            playAndroidHaptic("castle_hit");
          }
          if (isRangedUnit(unit.type)) this.playArrowShotSfx(unit);
          else this.playMeleeAttackSfx(unit);
          this.playCastleImpactSfx(unit);
        }
        else if (isRangedUnit(unit.type)) this.playArrowShotSfx(unit);
        else this.playMeleeAttackSfx(unit);
      }
      const isGathering = unit.state === "gather";
      if (isGathering && (
        previousState !== "gather" || this.elapsedMs - unit.lastAttackAt >= HARVEST_TICK_MS
      )) {
        unit.lastAttackAt = this.elapsedMs;
        this.restartUnitAttack(unit);
        this.playAxeHarvestSfx(unit);
      }
      this.syncUnitVisual(unit);
    }
    // Reuse the unit array instead of allocating map/set/filter structures for
    // every 20 Hz snapshot. This keeps Android's JS garbage collector out of
    // the render cadence as armies grow.
    let liveUnitCount = 0;
    for (const unit of this.units) {
      if (unit.onlineSeenSequence === snapshot.seq) {
        this.units[liveUnitCount++] = unit;
        continue;
      }
      unit.container.destroy();
      this.unitById.delete(unit.id);
    }
    this.units.length = liveUnitCount;
    // The authoritative server simulates at 20 Hz and presents at 10 Hz, but
    // HUD geometry still does not need to be rebuilt at snapshot frequency.
    // Android WebView can otherwise
    // upload freshly dirtied rectangles/strokes after every snapshot and miss
    // the following compositor frame. Five HUD updates per second remains
    // visually immediate while local taps still call updateUi synchronously.
    if (this.elapsedMs >= this.onlineNextHudAt) {
      this.onlineNextHudAt = this.elapsedMs + 200;
      this.updateUi();
    }
  }

  private onlineVisualState(state: OnlineUnitState): UnitState {
    if (state === "attackingUnit") return "attackUnit";
    if (state === "attackingCastle") return "attackCastle";
    if (state === "gathering") return "gather";
    if (state === "returning") return "returnResource";
    if (state === "dead") return "move";
    return "move";
  }

  private interpolateOnlineUnits(now: number) {
    for (const unit of this.units) {
      if (unit.onlineTargetX === undefined || unit.onlineTargetY === undefined) continue;
      const progress = clamp((now - (unit.onlineInterpolationAt ?? now)) / 110, 0, 1);
      const fromX = unit.onlineFromX ?? unit.x;
      const fromY = unit.onlineFromY ?? unit.y;
      unit.x = fromX + (unit.onlineTargetX - fromX) * progress;
      unit.y = fromY + (unit.onlineTargetY - fromY) * progress;
    }
  }

  private finishOnlineMatch(result: OnlineGameEnd) {
    if (this.battleEnded || result.roomId !== this.roomId) return;
    this.applyOnlineSnapshot(result.finalState);
    this.finishBattle(result.winnerSide === this.localPlayerSide ? "victory" : "defeat");
  }

  private handleOnlineCommandError(error: OnlineCommandError) {
    this.statusText.setText(error.message);
    this.flashWarning(error.code === "NOT_ENOUGH_GOLD" ? "NO GOLD" : "ONLINE REJECTED");
    this.log("ONLINE", `command rejected code=${error.code} command=${error.commandId ?? "unknown"}`);
  }

  private renderOnlinePowerCast(event: OnlinePowerCast) {
    if (!this.isOnline) return;
    if (event.power === "ice") {
      this.playPowerSfx("online-ice-blast-sfx", 0.46);
      this.showPowerTelegraph("ice", event.x, event.y, ICE_BLAST_RADIUS, 360);
      this.showIceImpact(event.x, event.y, ICE_BLAST_RADIUS);
      this.flashWarning("ICE BLAST");
      return;
    }

    const duration = Math.max(1, event.impactAtMs - event.castAtMs);
    this.showPowerTelegraph("missile", event.x, event.y, MISSILE_RADIUS, duration);
    const startY = -40;
    const missile = this.add.rectangle(event.x - 72, startY, 56, 12, 0xbb2c24)
      .setStrokeStyle(3, 0xffffff)
      .setRotation(0.75)
      .setDepth(1300);
    const smoke = this.add.image(event.x - 104, startY - 28, "effect_smoke_puff")
      .setDepth(1299)
      .setScale(1.125);
    this.tweens.add({
      targets: [missile, smoke],
      x: event.x,
      y: event.y,
      duration,
      ease: "Quad.In",
      onComplete: () => {
        missile.destroy();
        smoke.destroy();
        this.playPowerSfx("online-missile-impact-sfx", 0.56);
        this.showMissileImpact(event.x, event.y);
      },
    });
  }

  update(_time: number, delta: number) {
    if (this.battleEnded || this.isPaused) {
      return;
    }

    if (this.isOnlineWaitingForStart()) {
      this.updateOnlinePerformanceOverlay(performance.now(), delta);
      this.updateMissileAim();
      if (this.androidPerfProfiling) this.androidPerfMonitor?.recordFrame(delta, this.elapsedMs);
      return;
    }

    if (this.isOnline) {
      this.onlineRuntime?.applyLatestSnapshot();
      const onlineNow = performance.now();
      this.updateOnlinePerformanceOverlay(onlineNow, delta);
      if (this.onlineUiQa) this.elapsedMs += Math.min(delta, 50);
      this.interpolateOnlineUnits(onlineNow);
      // Network snapshots already update animation, tint and health state.
      // Render frames only interpolate position/depth between those snapshots.
      for (const unit of this.units) this.syncOnlineUnitTransform(unit);
      this.updateMissileAim();
      if (this.androidPerfProfiling) this.androidPerfMonitor?.recordFrame(delta, this.elapsedMs);
      return;
    }

    // Accelerated QA must not turn a 16 ms frame into a 300–500 ms movement
    // jump. Process the same simulated time in fixed, bounded steps so range,
    // pathing, worker gathering and combat cooldowns remain reproducible.
    this.pathPlansThisFrame = 0;
    const updateNow = performance.now();
    this.updateOnlinePerformanceOverlay(updateNow, delta);
    const wallDelta = this.androidPerfLastUpdateAt > 0 ? updateNow - this.androidPerfLastUpdateAt : delta;
    this.androidPerfLastUpdateAt = updateNow;
    // Phaser's smoothed delta stays close to one 60 Hz tick even when Android
    // WebView only presents 20-40 frames per second. Tying simulation to that
    // value makes movement, economy and the battle clock slow down with FPS,
    // then speed up again when frames recover. The perf package already avoids
    // this by using wall time. Use the same clock in shipping, but cap a single
    // frame to 50 ms so returning from a stall/background never causes a large
    // catch-up jump.
    let simulationRemaining = Math.min(wallDelta, 50) * (
      this.balanceQaMode ? this.balanceQaSpeed : this.navigationQaMode ? this.navigationQaSpeed : 1
    );
    while (simulationRemaining > 0 && !this.battleEnded && !this.isPaused) {
      const simulationStep = Math.min(80, simulationRemaining);
      this.advanceBattleSimulation(simulationStep);
      simulationRemaining -= simulationStep;
    }
    if (!this.battleEnded && this.elapsedMs >= this.nextUiUpdateAt) {
      this.nextUiUpdateAt = this.elapsedMs + 100;
      this.updateUi();
    }
    if (this.androidPerfProfiling) {
      this.androidPerfMonitor?.recordFrame(delta, this.elapsedMs);
      if (!this.androidPerfFinished && this.elapsedMs >= 600_000) {
        this.androidPerfFinished = true;
        this.androidPerfMonitor?.publish(this.elapsedMs, true);
      }
    }
  }

  private advanceBattleSimulation(simulationDelta: number) {
    const simulationStartedAt = performance.now();
    this.elapsedMs += simulationDelta;
    if (this.androidPerf.syntheticPopulation) this.maintainAndroidPerfPopulation();
    this.updateBattleTempoStage();
    if (
      (!this.androidPerf.enabled || this.androidPerf.realSystems) &&
      !this.navigationQaMode &&
      !this.durationBalanceWarned &&
      this.elapsedMs > this.battleDirector.timeoutAtMs
    ) {
      this.durationBalanceWarned = true;
      this.log(
        "BALANCE_QA",
        `HARD_STOP level=${this.levelRuntime.level.id} elapsed=${Math.round(this.elapsedMs)}ms timeout=${Math.round(this.battleDirector.timeoutAtMs)}ms`,
      );
      this.flashWarning("SURE DOLDU");
      this.balanceTelemetry.recordStallEvent({
        second: Math.round(this.elapsedMs / 1000),
        type: "hard_stop",
        detail: "castle_ratio_then_army_then_bank",
      });
      const playerRatio = this.playerCastle.hp / Math.max(1, this.playerCastle.maxHp);
      const enemyRatio = this.enemyCastle.hp / Math.max(1, this.enemyCastle.maxHp);
      let result: "victory" | "defeat" = playerRatio > enemyRatio + 0.001 ? "victory" : "defeat";
      if (Math.abs(playerRatio - enemyRatio) <= 0.001) {
        const playerArmy = this.armyGoldValue("player");
        const enemyArmy = this.armyGoldValue("enemy");
        result = playerArmy > enemyArmy + 0.01
          ? "victory"
          : Math.abs(playerArmy - enemyArmy) <= 0.01 && this.gold > this.enemyGold
            ? "victory"
            : "defeat";
      }
      this.finishBattle(result);
      return;
    }
    this.updateHeldDeployment();
    this.updateResourceNodes();
    this.updateMissileAim();
    const unitsStartedAt = performance.now();
    this.updateUnits(simulationDelta);
    this.perfUnitUpdateMs += performance.now() - unitsStartedAt;
    this.androidPerfUnitUpdateMs += performance.now() - unitsStartedAt;
    this.cleanupUnits();
    if (
      !this.isOnline &&
      !this.navigationQaMode &&
      (!this.androidPerf.enabled || this.androidPerf.realSystems) &&
      this.elapsedMs >= this.nextBattleDirectorUpdateAt
    ) {
      this.nextBattleDirectorUpdateAt = this.elapsedMs + 250;
      this.tickBattleDirector();
      this.enemyCastle.hp = this.battleDirector.clampEnemyCastleHp(
        this.enemyCastle.hp,
        this.enemyCastle.maxHp,
      );
    }
    this.updateBalanceTelemetry();
    if (!this.navigationQaMode && (!this.androidPerf.enabled || this.androidPerf.realSystems)) {
      this.checkBattleResult();
    }
    if (this.androidPerf.enabled && !this.androidPerf.realSystems) {
      this.playerCastle.hp = this.playerCastle.maxHp;
      this.enemyCastle.hp = this.enemyCastle.maxHp;
    }
    if (
      this.isNavigationStressQaPath() &&
      !this.navigationQaResultPublished &&
      this.elapsedMs >= 45_000
    ) {
      this.publishNavigationQaResult("timeout", true);
    }
    this.perfSimulationMs += performance.now() - simulationStartedAt;
    this.perfSimulationSteps += 1;
    this.androidPerfSimulationMs += performance.now() - simulationStartedAt;
    this.androidPerfSimulationSteps += 1;
  }

  private startAndroidPerfMonitor() {
    this.androidPerfMonitor?.dispose();
    const monitor = new AndroidPerformanceMonitor(() => ({
      unitCount: this.units.reduce((count, unit) => count + (unit.hp > 0 ? 1 : 0), 0),
      textureCount: this.textures.getTextureKeys().length,
      simulationMs: Math.round(this.androidPerfSimulationMs * 100) / 100,
      unitUpdateMs: Math.round(this.androidPerfUnitUpdateMs * 100) / 100,
      simulationSteps: this.androidPerfSimulationSteps,
      astarCalls: this.astarCalls,
      astarMs: Math.round(this.astarMs * 100) / 100,
      astarCacheHits: this.astarCacheHits,
      targetScans: this.targetScans,
      targetScanMs: Math.round(this.targetScanMs * 100) / 100,
    }));
    this.androidPerfMonitor = monitor;
    const renderer = this.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    monitor.installDrawCallCounter(renderer.gl);
    this.events.once("shutdown", () => {
      monitor.dispose();
      if (this.androidPerfMonitor === monitor) this.androidPerfMonitor = undefined;
    });
    const startLine = `[CastlePerf][START] ${JSON.stringify({
      level: this.androidPerf.level,
      seed: this.androidPerf.seed,
      profile: this.androidPerf.profile,
      powerFxQa: this.androidPerf.powerFxQa,
      runtime: {
        scenes: this.scene.manager.scenes.map((scene) => ({
          key: scene.scene.key,
          active: scene.scene.isActive(),
          visible: scene.scene.isVisible(),
          objects: scene.children.list.length,
          cameras: scene.cameras.cameras.length,
          timers: (scene.time as unknown as { getAllEvents?: () => unknown[] }).getAllEvents?.().length ?? -1,
          tweens: scene.tweens.getTweens().length,
        })),
        sounds: ((this.sound as Phaser.Sound.BaseSoundManager & { sounds?: Phaser.Sound.BaseSound[] }).sounds ?? [])
          .map((sound) => ({ key: sound.key, playing: sound.isPlaying, paused: sound.isPaused })),
      },
      stages: [{ at: 0, perTeam: 0 }, { at: 30, perTeam: 12 }, { at: 120, perTeam: 24 }, { at: 240, perTeam: 30 }],
    })}`;
    console.log(startLine);
    window.CastlePerfNative?.log(startLine);
  }

  private maintainAndroidPerfPopulation() {
    if (this.elapsedMs < this.nextAndroidPerfPopulationAt) return;
    this.nextAndroidPerfPopulationAt = this.elapsedMs + 1_000;
    const target = this.elapsedMs < 30_000 ? 0 : this.elapsedMs < 120_000 ? 12 : this.elapsedMs < 240_000 ? 24 : 30;
    for (const team of ["player", "enemy"] as const) {
      const types = (team === "player" ? this.battleStartData.playerLoadout : this.levelRuntime.enemyUnitIds)
        .filter((type): type is UnitType => !isWorkerUnit(type));
      let active = 0;
      for (const unit of this.units) {
        if (unit.team === team && unit.hp > 0 && !isWorkerUnit(unit.type)) active += 1;
      }
      while (active < target) {
        const index = active % types.length;
        const lane = active % 5;
        const zone = team === "player" ? this.levelRuntime.map.deployZone : this.levelRuntime.map.enemySpawnZone;
        const y = clamp(zone.minY + ((lane + 0.5) / 5) * (zone.maxY - zone.minY), zone.minY, zone.maxY);
        this.spawnUnit(team, types[index], y, zone.x, { forceBaseLevel: true, goldAlreadySpent: true });
        active += 1;
      }
    }
    this.playerCastle.hp = this.playerCastle.maxHp;
    this.enemyCastle.hp = this.enemyCastle.maxHp;
  }

  private formatBattleStartLog() {
    const { levelId, mapId, biome } = this.battleStartData;
    const unlocked = this.levelRuntime.unlockedUnitIds.join(",");
    const enemies = this.levelRuntime.enemyUnitIds.join(",");
    const playerPowers = (["ice", "missile"] as const)
      .filter((power) => this.playerPowerUnlocked(power))
      .join(",");
    const enemyPowers = (["ice", "missile"] as const)
      .filter((power) => Boolean(this.levelRuntime.level.enemy.powers[power]))
      .join(",");

    return `Battle scene started level=${levelId} mapId=${mapId} biome=${biome} unlocked=${unlocked} enemyUnits=${enemies} playerPowers=${playerPowers} enemyPowers=${enemyPowers} adaptation=${this.adaptiveDifficulty.band} score=${this.adaptiveDifficulty.score} ${difficultySummary(this.levelRuntime.level, this.levelRuntime.map)}`;
  }

  private resetState() {
    this.tiledNavigation = undefined;
    this.tiledPathfinder = undefined;
    this.tiledMapRender = undefined;
    this.onlineGeometry = undefined;
    this.onlineOpponentGeometry = undefined;
    this.units = [];
    this.unitById.clear();
    this.pathCache.clear();
    this.spatialBuckets.clear();
    this.activeSpatialBucketKeys.length = 0;
    this.arrowPool.length = 0;
    this.hitEffectPool.length = 0;
    this.resourceNodes = [];
    this.onlineResourceById.clear();
    const terrainAreas: WaterArea[] = this.levelRuntime.map.terrain.patches.flatMap((patch) => patch.collision === "none" ? [] : [{
      id: patch.id,
      x: patch.x,
      y: patch.y,
      radiusX: patch.width * 0.54,
      radiusY: patch.height * 0.56,
      rotation: patch.rotation,
      collision: patch.collision,
    }]);
    const assetAreas: WaterArea[] = this.levelRuntime.map.objects.flatMap((object) => {
      if (object.visual.source !== "asset") return [];
      const asset = MAP_ASSETS_BY_KEY[object.visual.assetKey];
      if (asset?.collision !== "water") return [];
      return [{
        id: object.id,
        x: object.x,
        y: object.y,
        radiusX: asset.footprintRadius * object.scale * 3.8,
        radiusY: asset.footprintRadius * object.scale * 2.3,
        rotation: object.rotation,
        collision: "water" as const,
      }];
    });
    this.waterAreas = [...terrainAreas, ...assetAreas];
    this.gold = this.levelRuntime.level.player.startGold;
    this.enemyGold = this.levelRuntime.level.enemy.startGold;
    if (this.onlineUiQa) {
      this.gold = 250;
      this.enemyGold = 250;
    }
    if (this.isSoldierMenuTestPath()) {
      this.gold = 200;
      this.enemyGold = 0;
    }
    this.activePower = undefined;
    this.missileAimPointerId = undefined;
    this.missileAimStartedAt = 0;
    this.missileAimY =
      (this.levelRuntime.map.deployZone.minY +
        this.levelRuntime.map.deployZone.maxY) /
      2;
    this.missileReadyAt = 0;
    this.iceReadyAt = 0;
    this.adaptiveDifficulty = adaptiveDifficultyForProgress(loadCampaignProgress());
    const enemyPowers = this.levelRuntime.level.enemy.powers;
    this.enemyMissileReadyAt = enemyPowers.missile?.initialReadyMs ?? Number.POSITIVE_INFINITY;
    this.enemyIceReadyAt = enemyPowers.ice?.initialReadyMs ?? Number.POSITIVE_INFINITY;
    this.enemyPowerLockUntil = 0;
    this.enemyPowerPending = false;
    this.enemyPowerCastCount = 0;
    this.enemyPowerCastCounts = { missile: 0, ice: 0 };
    this.nextEnemyPowerDecisionAt = 0;
    this.nextEnemyPowerHoldLogAt = 0;
    this.nextEnemyCombatDecisionAt = 0;
    this.enemyZeroWorkerStartedAt = undefined;
    this.lastEnemyWorkerReserve = -1;
    this.enemyNoDefenderStartedAt = undefined;
    this.sealWaitStartedAt = undefined;
    this.nextPassiveIncomeAt = this.levelRuntime.level.economy.passiveGoldIntervalMs;
    this.unitId = 0;
    this.resourceNodeId = 0;
    this.elapsedMs = 0;
    this.onlineLastSnapshotSequence = -1;
    this.onlineMatchDurationMs = NetworkClient.getInstance().matchDurationMs ?? 0;
    this.onlineClientReadySent = false;
    this.onlineMatchStarted = this.onlineUiQa;
    this.onlineLeaveDialogOpen = false;
    this.onlinePerformanceText = undefined;
    this.onlinePerfNextUiAt = 0;
    this.onlinePerfNextLogAt = 0;
    this.onlinePerfLastFrameAt = 0;
    this.onlinePerfSampleIndex = 0;
    this.onlinePerfSampleCount = 0;
    this.onlineNextHudAt = 0;
    this.onlineQaSpawnIndex = 0;
    this.onlineEmoteTray = undefined;
    this.onlineEmoteBubbles.clear();
    this.onlineEmoteCooldownUntil = 0;
    this.onlineEmoteQaState = { side: this.localPlayerSide, sent: [], received: [] };
    (window as typeof window & { __CASTLE_ONLINE_EMOTE_QA__?: OnlineEmoteQaState })
      .__CASTLE_ONLINE_EMOTE_QA__ = this.onlineEmoteQaState;
    this.battleEnded = false;
    this.isPaused = false;
    this.pausedByBackground = false;
    this.selectedUnit = undefined;
    this.pendingDeployCounts = {};
    this.deployPointerHeld = false;
    this.deployPointerId = undefined;
    this.missileAimPointerId = undefined;
    this.missileAimStartedAt = 0;
    this.heldDeployX = this.levelRuntime.map.deployZone.x;
    this.heldDeployY =
      (this.levelRuntime.map.deployZone.minY +
        this.levelRuntime.map.deployZone.maxY) /
      2;
    this.nextHeldDeployAt = 0;
    this.autoDeployLaneIndex = 0;
    this.balanceQaMode = !this.isOnline && this.isBalanceQaPath();
    this.balanceQaSpeed = this.balanceQaSpeedFromPath();
    this.balanceQaPlayerDecisionMs = this.balanceQaPlayerDecisionFromPath();
    this.balanceQaLoadout = referenceLoadoutForLevel(this.levelRuntime.level);
    this.nextBalanceSnapshotAt = 10_000;
    this.lastTelemetryAt = 0;
    this.nextTelemetrySampleAt = 0;
    this.nextUiUpdateAt = 0;
    this.nextBattleDirectorUpdateAt = 0;
    this.nextDamageFxAt = 0;
    this.nextHitFxAt = 0;
    this.nextCombatSfxAt = 0;
    this.perfSimulationMs = 0;
    this.perfUnitUpdateMs = 0;
    this.perfSimulationSteps = 0;
    this.androidPerfFinished = false;
    this.androidPerfLastUpdateAt = 0;
    this.nextAndroidPerfPopulationAt = 0;
    this.androidPerfSimulationMs = 0;
    this.androidPerfUnitUpdateMs = 0;
    this.androidPerfSimulationSteps = 0;
    this.astarCalls = 0;
    this.astarMs = 0;
    this.astarCacheHits = 0;
    this.targetScans = 0;
    this.targetScanMs = 0;
    this.balanceQaStyle = this.balanceQaStyleFromPath();
    if (this.balanceQaMode) {
      this.adaptiveDifficulty = adaptiveDifficultyForProgress({ recentBattleAttempts: [] });
    }
    this.telemetryLossUnitIds = new Set<number>();
    this.balanceReportPublished = false;
    this.economyQaMode = this.isEconomyQaPath();
    this.economyQaDeathDenialPassed = false;
    this.economyQaPassivePassed = false;
    this.economyQaCanTrainPassed = false;
    this.economyQaDeliveryPassed = false;
    this.economyQaWorkerCapPassed = false;
    this.economyQaFinished = false;
    this.durationBalanceWarned = false;
    this.tempoStage = 0;
    this.navigationQaSpeed = this.navigationQaSpeedFromPath();
    this.navigationQaExpectedCount = 0;
    this.navigationQaStuckEvents = 0;
    this.navigationQaBlockedEvents = 0;
    this.navigationQaResultPublished = false;
    this.masteryCounterKills = 0;
    this.playerCombatTypesUsed = new Set<UnitType>();
    this.playerIncomeEvents = [];
    this.enemyIncomeEvents = [];
    this.battleLog = [];
    this.nextDirectorStallLogAt = 0;
    this.reserveWarningContainer = undefined;
    this.unitButtons = [];
    this.reseedMap();
    this.balanceTelemetry = new BattleTelemetry(
      this.levelRuntime.level,
      this.mapSeed,
      this.balanceQaSpeed,
      this.balanceQaLoadout,
      this.levelRuntime.map.resources.length,
      this.adaptiveDifficulty.band,
      this.balanceQaStyle,
    );
    this.battleDirector = new BattleDirector(
      this.levelRuntime.level,
      this.mapSeed,
      this.adaptiveDifficulty.waveTimingOffsetRatio,
    );
    this.balanceTelemetry.directorVariant = this.battleDirector.variant.id;
    this.balanceTelemetry.reserveBudget = this.levelRuntime.level.director.reserveBudget;
    this.balanceTelemetry.recordEconomyEvent({ second: 0, team: "player", type: "start", amount: this.gold, bank: this.gold });
    this.balanceTelemetry.recordEconomyEvent({ second: 0, team: "enemy", type: "start", amount: this.enemyGold, bank: this.enemyGold });
    (window as typeof window & {
      __CASTLE_BALANCE_RESULT__?: BattleBalanceReport;
      __CASTLE_BALANCE_LOG__?: Array<Record<string, unknown>>;
    })
      .__CASTLE_BALANCE_RESULT__ = undefined;
    (window as typeof window & { __CASTLE_BALANCE_LOG__?: Array<Record<string, unknown>> })
      .__CASTLE_BALANCE_LOG__ = this.battleLog;
    this.syncBalanceDomBridge("castle-balance-log", this.battleLog);
    const balanceWindow = window as typeof window & {
      __CASTLE_BALANCE_SUITE__?: BattleBalanceReport[];
    };
    balanceWindow.__CASTLE_BALANCE_SUITE__ ??= [];
    (window as typeof window & { __CASTLE_TARGETING_QA_RESULT__?: unknown })
      .__CASTLE_TARGETING_QA_RESULT__ = undefined;
    (window as typeof window & { __CASTLE_NAVIGATION_QA_RESULT__?: unknown })
      .__CASTLE_NAVIGATION_QA_RESULT__ = undefined;
    this.time.paused = false;
    this.tweens.resumeAll();
    this.spawnCounts = {
      player: createSpawnCounter(),
      enemy: createSpawnCounter(),
    };
  }

  private enemyAiTickMs() {
    return Math.max(
      ENEMY_AI_TICK_MS,
      Math.round(
        effectiveEnemySpawnInterval(this.levelRuntime.level) *
          this.adaptiveDifficulty.decisionIntervalMultiplier,
      ),
    );
  }

  /** A bounded combat-only pace curve. It deliberately does not change
   * Phaser's global clock, input timing, projectiles or power telegraphs. */
  private battleTempoMultiplier() {
    const duration = this.levelRuntime.level.duration;
    const elapsedRatio = this.elapsedMs / Math.max(1, duration.targetSeconds * 1000);
    if (elapsedRatio <= duration.tempoRampStartRatio) return 1;
    if (elapsedRatio <= 1) {
      const progress = clamp(
        (elapsedRatio - duration.tempoRampStartRatio) /
          (1 - duration.tempoRampStartRatio),
        0,
        1,
      );
      return 1 + (duration.tempoAtTarget - 1) * progress;
    }
    if (elapsedRatio <= duration.overtimeRatio) {
      const progress = clamp(
        (elapsedRatio - 1) / (duration.overtimeRatio - 1),
        0,
        1,
      );
      return duration.tempoAtTarget +
        (duration.tempoAtOvertime - duration.tempoAtTarget) * progress;
    }
    return duration.tempoAtOvertime;
  }

  private updateBattleTempoStage() {
    const duration = this.levelRuntime.level.duration;
    const ratio = this.elapsedMs / Math.max(1, duration.targetSeconds * 1000);
    const nextStage = ratio >= duration.overtimeRatio
      ? 3
      : ratio >= 1
        ? 2
        : ratio >= duration.tempoRampStartRatio
          ? 1
          : 0;
    if (nextStage <= this.tempoStage) return;
    this.tempoStage = nextStage;
    const labels = ["base", "ramp", "target", "overtime"];
    this.log(
      "TEMPO",
      `stage=${labels[nextStage]} multiplier=${this.battleTempoMultiplier().toFixed(3)} elapsedRatio=${ratio.toFixed(3)}`,
    );
  }

  private effectiveAttackCooldown(unit: BattleUnit) {
    return unit.cooldown / this.battleTempoMultiplier();
  }

  private effectiveUnitAttackCooldown(unit: BattleUnit) {
    const cooldown = this.effectiveAttackCooldown(unit);
    const readableCombatCooldown = isRangedUnit(unit.type)
      ? cooldown
      : Math.max(cooldown, MIN_MELEE_UNIT_ATTACK_COOLDOWN_MS);
    return readableCombatCooldown * UNIT_VS_UNIT_ATTACK_SLOWDOWN;
  }

  private reseedMap() {
    const querySeed = Number.parseInt(
      new URLSearchParams(window.location.search).get("seed") ?? "",
      10,
    );
    this.mapSeed = Number.isFinite(querySeed)
      ? querySeed >>> 0
      : this.battleStartData.attemptSeed >>> 0;
    this.mapRandomState = this.mapSeed || 1;
  }

  private isEconomyQaPath() {
    const params = new URLSearchParams(window.location.search);
    return (
      window.location.pathname.includes("/economy-qa") ||
      params.has("economyQa")
    );
  }

  private isBalanceQaPath() {
    const params = new URLSearchParams(window.location.search);
    return import.meta.env.DEV && (
      window.location.pathname.includes("/balance-qa") ||
      params.has("balanceQa") ||
      params.has("balanceSuite")
    );
  }

  private isBalanceSuitePath() {
    return import.meta.env.DEV && new URLSearchParams(window.location.search).has("balanceSuite");
  }

  private balanceSuiteWindow() {
    return window as typeof window & {
      __CASTLE_BALANCE_SUITE__?: BattleBalanceReport[];
      __CASTLE_BALANCE_SUITE_STATE__?: BalanceSuiteRuntimeState;
      __CASTLE_BALANCE_SUITE_STATUS__?: {
        running: boolean;
        completed: number;
        total: number;
        currentCaseId?: string;
      };
      __CASTLE_BALANCE_SUITE_RESULT__?: BattleBalanceSuiteSummary;
    };
  }

  private currentBalanceSuiteCase() {
    if (!this.isBalanceSuitePath()) return undefined;
    const suiteWindow = this.balanceSuiteWindow();
    if (!suiteWindow.__CASTLE_BALANCE_SUITE_STATE__) {
      const cases = createBattleBalanceSuiteCases();
      suiteWindow.__CASTLE_BALANCE_SUITE__ = [];
      suiteWindow.__CASTLE_BALANCE_SUITE_RESULT__ = undefined;
      suiteWindow.__CASTLE_BALANCE_SUITE_STATE__ = {
        cases,
        index: 0,
        startedAt: new Date().toISOString(),
      };
      suiteWindow.__CASTLE_BALANCE_SUITE_STATUS__ = {
        running: true,
        completed: 0,
        total: cases.length,
        currentCaseId: cases[0]?.id,
      };
      this.syncBalanceDomBridge(
        "castle-balance-suite-status",
        suiteWindow.__CASTLE_BALANCE_SUITE_STATUS__,
      );
    }
    const state = suiteWindow.__CASTLE_BALANCE_SUITE_STATE__;
    return state.cases[state.index];
  }

  private balanceQaSpeedFromPath() {
    if (!this.balanceQaMode) return 1;
    const defaultSpeed = this.isBalanceSuitePath() ? 16 : 8;
    const requested = Number(new URLSearchParams(window.location.search).get("qaSpeed") ?? defaultSpeed);
    return Number.isFinite(requested) ? clamp(requested, 1, 16) : 8;
  }

  private balanceQaPlayerDecisionFromPath() {
    const requested = Number(
      new URLSearchParams(window.location.search).get("qaPlayerDecisionMs") ?? 1400,
    );
    return Number.isFinite(requested) ? clamp(requested, 700, 3200) : 1400;
  }

  private balanceQaStyleFromPath() {
    const suiteCase = this.currentBalanceSuiteCase();
    if (suiteCase) return suiteCase.style;
    const requested = new URLSearchParams(window.location.search).get("qaStyle") ?? "balancedCounter";
    return ["economyRush", "balancedCounter", "aggressiveRush", "defensiveSaver"].includes(requested)
      ? requested
      : "balancedCounter";
  }

  private isNavigationQaPath() {
    const params = new URLSearchParams(window.location.search);
    return import.meta.env.DEV && (
      params.has("navQa") || params.has("navCombatQa") || params.has("navStressQa")
    );
  }

  private isNavigationStressQaPath() {
    return import.meta.env.DEV && new URLSearchParams(window.location.search).has("navStressQa");
  }

  private navigationQaSpeedFromPath() {
    if (!import.meta.env.DEV) return 1;
    const requested = Number(new URLSearchParams(window.location.search).get("navQaSpeed") ?? 1);
    return Number.isFinite(requested) ? clamp(requested, 1, 8) : 1;
  }

  private isTargetingQaPath() {
    return import.meta.env.DEV && new URLSearchParams(window.location.search).has("targetingQa");
  }

  private isCastleCombatQaPath() {
    return (import.meta.env.DEV || import.meta.env.VITE_ANDROID_QA === "1") &&
      (
        new URLSearchParams(window.location.search).has("castleCombatQa") ||
        window.location.pathname.includes("/android-qa/castle-combat")
      );
  }

  private isSwordDuelQaPath() {
    return import.meta.env.DEV && new URLSearchParams(window.location.search).has("swordDuelQa");
  }

  private isEnemyPowerQaPath() {
    return import.meta.env.DEV && new URLSearchParams(window.location.search).has("powerQa");
  }

  private powerFxQaMode() {
    if (this.androidPerf.powerFxQa) return this.androidPerf.powerFxQa;
    if (!import.meta.env.DEV) return undefined;
    const mode = new URLSearchParams(window.location.search).get("powerFxQa");
    return mode === "missile" || mode === "ice" || mode === "both" ? mode : undefined;
  }

  private startPowerFxQa() {
    const mode = this.powerFxQaMode();
    if (!mode) return;
    const centerX = (WORLD_LEFT + WORLD_RIGHT) / 2;
    const centerY = 360;
    this.sound.mute = true;
    this.log("POWER_FX_QA", `started mode=${mode}`);
    const runCycle = () => {
      if (mode === "missile" || mode === "both") {
        this.showPowerTelegraph("missile", centerX - 72, centerY - 46, MISSILE_RADIUS, 1_050);
        this.time.delayedCall(1_050, () => this.showMissileImpact(centerX - 72, centerY - 46));
      }
      if (mode === "ice" || mode === "both") {
        const delay = mode === "both" ? 1_850 : 240;
        this.time.delayedCall(delay, () => {
          this.showPowerTelegraph("ice", centerX + 86, centerY + 54, ICE_BLAST_RADIUS, 420);
          this.showIceImpact(centerX + 86, centerY + 54, ICE_BLAST_RADIUS);
        });
      }
    };
    runCycle();
    this.time.addEvent({ delay: 4_200, loop: true, callback: runCycle });
  }

  /** Deterministic local harness for the full enemy power lifecycle. Four
   * stationary combat units form an eligible castle-side cluster; Missile and
   * Ice must each telegraph, obey the shared lock and then cast. */
  private startEnemyPowerQa() {
    const clusterX = this.enemyCastle.x - 180;
    const spawnEligibleCluster = () => {
      for (const y of [294, 310, 326, 342]) {
        const unit = this.spawnUnit("player", "swordsman", y, clusterX);
        unit.speed = 0;
        unit.baseSpeed = 0;
        unit.damage = 0;
        unit.castleDamage = 0;
        unit.hp = 35;
        unit.maxHp = 35;
      }
    };
    spawnEligibleCluster();
    this.enemyMissileReadyAt = 0;
    this.enemyIceReadyAt = 0;
    this.log(
      "POWER_QA",
      `started level=${this.levelRuntime.level.id} cluster=4 enemyPowers=ice,missile`,
    );
    this.time.delayedCall(2_500, () => this.tickEnemyPowerAi());
    // Local avoidance naturally disperses the first target group after the
    // missile. Re-form an eligible group only after the six-second shared
    // lock expires so the harness can also exercise Ice deterministically.
    this.time.delayedCall(9_900, () => {
      if (this.battleEnded) return;
      spawnEligibleCluster();
      this.tickEnemyPowerAi();
    });
  }

  /** Deterministic smoke test: one sword must leave the player deployment
   * zone, use a legal bridge if necessary, and reach the enemy castle front. */
  private startNavigationQa() {
    if (!this.navigationQaMode || !this.tiledPathfinder || !this.tiledMapRender) return;
    if (this.swordDuelQaMode) {
      this.startSwordDuelQa();
      return;
    }
    if (this.castleCombatQaMode) {
      this.startCastleCombatQa();
      return;
    }
    if (this.targetingQaMode) {
      this.runTargetingQa();
      return;
    }
    const spawnY = (this.levelRuntime.map.deployZone.minY + this.levelRuntime.map.deployZone.maxY) / 2;
    const targetX = this.levelRuntime.map.enemySpawnZone.x;
    const safeSpawn = this.tiledNavigation?.nearestWalkableWorld(
      this.levelRuntime.map.deployZone.x,
      spawnY,
      "NORMAL",
    ) ?? { x: this.levelRuntime.map.deployZone.x, y: spawnY };
    const route = this.tiledPathfinder.findPath(safeSpawn.x, safeSpawn.y, targetX, spawnY, "NORMAL");
    const bridgeLayer = this.tiledMapRender.tilemap.getLayer("05_BRIDGES");
    const bridgeCells = new Set<string>();
    for (let index = 1; index < (route?.length ?? 0); index += 1) {
      const from = route![index - 1];
      const to = route![index];
      const steps = Math.max(1, Math.ceil(Math.sqrt((to.x - from.x) * (to.x - from.x) + (to.y - from.y) * (to.y - from.y)) / 10));
      for (let step = 0; step <= steps; step += 1) {
        const x = from.x + ((to.x - from.x) * step) / steps;
        const y = from.y + ((to.y - from.y) * step) / steps;
        const tile = bridgeLayer?.data[Math.floor(y / 40)]?.[Math.floor(x / 40)];
        if (tile && tile.index >= 0) bridgeCells.add(`${Math.floor(x / 20)},${Math.floor(y / 20)}`);
      }
    }
    this.log(
      "NAV_QA",
      `route ${route ? "FOUND" : "MISSING"} start=(${safeSpawn.x},${safeSpawn.y}) target=(${targetX},${spawnY}) cells=${route?.length ?? 0} bridgeCells=${[...bridgeCells].join("|") || "none"}`,
    );
    const params = new URLSearchParams(window.location.search);
    const combatStress = params.has("navCombatQa");
    const corridorStress = params.has("navStressQa");
    const cases: Array<{ team: Team; type: UnitType; y: number }> = corridorStress
      ? [
        { team: "player", type: "swordsman", y: 110 },
        { team: "player", type: "archer", y: 180 },
        { team: "player", type: "horseman", y: 250 },
        { team: "player", type: "long_spearman", y: 320 },
        { team: "player", type: "mace_guard", y: 390 },
        { team: "player", type: "knife_thrower", y: 460 },
        { team: "player", type: "mage", y: 530 },
        { team: "player", type: "swordsman", y: 610 },
      ]
      : combatStress
      ? [
        { team: "player", type: "swordsman", y: 250 },
        { team: "player", type: "horseman", y: 315 },
        { team: "player", type: "long_spearman", y: 370 },
        { team: "player", type: "archer", y: 500 },
        { team: "enemy", type: "swordsman", y: 260 },
        { team: "enemy", type: "horseman", y: 320 },
        { team: "enemy", type: "mace_guard", y: 380 },
        { team: "enemy", type: "archer", y: 490 },
      ]
      : [{ team: "player", type: "swordsman", y: safeSpawn.y }];
    this.navigationQaExpectedCount = cases.length;
    for (const testCase of cases) {
      const zone = testCase.team === "player"
        ? this.levelRuntime.map.deployZone
        : this.levelRuntime.map.enemySpawnZone;
      const unit = this.spawnUnit(testCase.team, testCase.type, testCase.y, zone.x);
      unit.navQa = true;
      unit.navQaLastX = unit.x;
      unit.navQaLastY = unit.y;
      unit.navQaLastProgressAt = this.elapsedMs;
      unit.navQaLastLogAt = this.elapsedMs;
      this.log(
        "NAV_QA",
        `${testCase.type}#${unit.id} stress-spawn team=${unit.team} cell=${Math.floor(unit.x / 20)},${Math.floor(unit.y / 20)}`,
      );
    }
    if (corridorStress) {
      this.log(
        "NAV_QA",
        `corridor-stress started units=${cases.length} speed=${this.navigationQaSpeed}x`,
      );
    }
  }

  private startSwordDuelQa() {
    const duelY = 580;
    const centerX = (this.levelRuntime.map.deployZone.x + this.levelRuntime.map.enemySpawnZone.x) / 2;
    const player = this.spawnUnit("player", "swordsman", duelY, centerX - 20, {
      forceBaseLevel: true,
      goldAlreadySpent: true,
    });
    const enemy = this.spawnUnit("enemy", "swordsman", duelY, centerX + 20, {
      forceBaseLevel: true,
      goldAlreadySpent: true,
    });
    for (const unit of [player, enemy]) {
      unit.navQa = true;
      unit.speed = 0;
      unit.baseSpeed = 0;
      unit.hp = 999;
      unit.maxHp = 999;
      unit.lastAttackAt = -this.effectiveUnitAttackCooldown(unit);
    }
    player.targetId = enemy.id;
    enemy.targetId = player.id;
    player.state = "attackUnit";
    enemy.state = "attackUnit";
    player.facingDirection = 1;
    enemy.facingDirection = -1;
    this.navigationQaExpectedCount = 2;
    const cooldownMs = this.effectiveUnitAttackCooldown(player);
    this.time.delayedCall(7_000, () => {
      const report = {
        passed:
          player.state === "attackUnit" &&
          enemy.state === "attackUnit" &&
          player.hp < player.maxHp &&
          enemy.hp < enemy.maxHp,
        playerHp: player.hp,
        enemyHp: enemy.hp,
        playerAnim: player.sprite.anims.currentAnim?.key,
        enemyAnim: enemy.sprite.anims.currentAnim?.key,
        playerTimeScale: player.sprite.anims.timeScale,
        enemyTimeScale: enemy.sprite.anims.timeScale,
        cooldownMs,
      };
      (window as typeof window & { __CASTLE_SWORD_DUEL_QA_RESULT__?: typeof report })
        .__CASTLE_SWORD_DUEL_QA_RESULT__ = report;
      this.log("SWORD_DUEL_QA", `${report.passed ? "PASS" : "FAIL"} ${JSON.stringify(report)}`);
    });
    this.log(
      "SWORD_DUEL_QA",
      `started player=${player.id} enemy=${enemy.id} x=${Math.round(centerX)} y=${duelY} cooldown=${Math.round(cooldownMs)}ms`,
    );
  }

  /** Deterministic regression test for offline castle contact. Tiled pathing
   * can stop at a safe point just short of the exact facade coordinate; both
   * teams must still enter their attack state and damage the opposing castle. */
  private startCastleCombatQa() {
    const playerHpBefore = this.playerCastle.hp;
    const enemyHpBefore = this.enemyCastle.hp;
    // Use a melee enemy authored for this level. Later TMJs replace the basic
    // swordsman with special units, whose loaded atlas must drive the QA run.
    const enemyMeleeType = this.levelRuntime.enemyUnitIds.find(
      (type) => !isWorkerUnit(type) && !isRangedUnit(type),
    ) ?? "swordsman";
    const player = this.spawnUnit("player", "swordsman", 300, this.enemyCastle.frontX - 12, {
      forceBaseLevel: true,
    });
    const enemy = this.spawnUnit("enemy", enemyMeleeType, 420, this.playerCastle.frontX + 12, {
      forceBaseLevel: true,
    });
    player.lastAttackAt = -player.cooldown;
    enemy.lastAttackAt = -enemy.cooldown;

    // Some TMJ facades begin partway through a navigation cell. The spawn
    // safety pass may therefore place the QA soldier in the adjacent outside
    // cell; allow its normal final-approach movement to reach the exact facade.
    this.time.delayedCall(1_500, () => {
      const playerCrossedEnemyFacade = player.x >= this.enemyCastle.frontX;
      const enemyCrossedPlayerFacade = enemy.x <= this.playerCastle.frontX;
      const report = {
        passed:
          player.state === "attackCastle" &&
          enemy.state === "attackCastle" &&
          this.enemyCastle.hp < enemyHpBefore &&
          this.playerCastle.hp < playerHpBefore &&
          !playerCrossedEnemyFacade &&
          !enemyCrossedPlayerFacade,
        playerAttacking: player.state === "attackCastle",
        enemyAttacking: enemy.state === "attackCastle",
        playerCastleDamage: playerHpBefore - this.playerCastle.hp,
        enemyCastleDamage: enemyHpBefore - this.enemyCastle.hp,
        playerCastleFacadeX: this.playerCastle.frontX,
        enemyCastleFacadeX: this.enemyCastle.frontX,
        playerDistance: Math.abs(this.enemyCastle.frontX - player.x),
        enemyDistance: Math.abs(this.playerCastle.frontX - enemy.x),
        playerCrossedEnemyFacade,
        enemyCrossedPlayerFacade,
      };
      (window as typeof window & { __CASTLE_COMBAT_QA_RESULT__?: typeof report })
        .__CASTLE_COMBAT_QA_RESULT__ = report;
      // Browser automation executes in an isolated world, so mirror the
      // dev-only result onto the shared DOM. This never runs in normal play.
      document.documentElement.dataset.castleCombatQaResult = JSON.stringify(report);
      this.log("CASTLE_COMBAT_QA", `${report.passed ? "PASS" : "FAIL"} ${JSON.stringify(report)}`);
    });
  }

  /** Deterministic combat-perception matrix. It runs only on the local dev QA
   * route and publishes a compact result for browser automation. */
  private runTargetingQa() {
    const combatTypes = UNIT_ORDER.filter((type) => !isWorkerUnit(type));
    const results: Array<Record<string, unknown>> = [];
    const routePosition = 0.5;
    const originX = this.levelRuntime.map.deployZone.x;

    const clearScenario = () => {
      for (const unit of this.units) unit.container.destroy();
      this.units = [];
    };

    for (const type of combatTypes) {
      const config = TARGETING_CONFIGS[type];
      const originY = flowYAtX(this.levelRuntime.map, originX, routePosition);
      const attacker = this.spawnUnit("player", type, originY, originX, { forceBaseLevel: true });
      attacker.x = originX;
      attacker.y = originY;
      attacker.routePosition = routePosition;
      attacker.targetId = undefined;
      attacker.nextTargetScanAt = 0;

      const forwardX = originX + Math.min(64, attacker.visionRange * 0.35);
      const forwardY = flowYAtX(this.levelRuntime.map, forwardX, routePosition);
      const forward = this.spawnUnit("enemy", "swordsman", forwardY, forwardX, { forceBaseLevel: true });
      forward.x = forwardX;
      forward.y = forwardY;
      const acquiresForward = this.findTargetUnit(attacker)?.id === forward.id;

      forward.y = forwardY + config.laneTolerance * 2.1;
      attacker.nextTargetScanAt = 0;
      const releasesOutsideLane = this.findTargetUnit(attacker) === undefined;

      clearScenario();
      const sideAttacker = this.spawnUnit("player", type, originY, originX, { forceBaseLevel: true });
      sideAttacker.x = originX;
      sideAttacker.y = originY;
      sideAttacker.routePosition = routePosition;
      sideAttacker.nextTargetScanAt = 0;
      const sideX = originX + 72;
      const sideY = flowYAtX(this.levelRuntime.map, sideX, routePosition) + config.laneTolerance * 1.9;
      const side = this.spawnUnit("enemy", "swordsman", sideY, sideX, { forceBaseLevel: true });
      side.x = sideX;
      side.y = sideY;
      const ignoresSideLane = this.findTargetUnit(sideAttacker) === undefined;

      clearScenario();
      const mergeAttacker = this.spawnUnit("player", type, originY, originX, {
        forceBaseLevel: true,
      });
      mergeAttacker.x = originX;
      mergeAttacker.y = originY;
      mergeAttacker.routePosition = routePosition;
      mergeAttacker.nextTargetScanAt = 0;
      const mergeX = originX + 110;
      const mergeY = flowYAtX(this.levelRuntime.map, mergeX, routePosition) +
        config.laneTolerance * 1.5;
      const mergeOpponent = this.spawnUnit(
        "enemy",
        type === "swordsman" ? "archer" : "swordsman",
        mergeY,
        mergeX,
        { forceBaseLevel: true },
      );
      mergeOpponent.x = mergeX;
      mergeOpponent.y = mergeY;
      const acquiresMergingOpponent =
        this.findTargetUnit(mergeAttacker)?.id === mergeOpponent.id;

      clearScenario();
      const rearAttacker = this.spawnUnit("player", type, originY, originX, { forceBaseLevel: true });
      rearAttacker.x = originX;
      rearAttacker.y = originY;
      rearAttacker.routePosition = routePosition;
      rearAttacker.nextTargetScanAt = 0;
      const rearX = originX - Math.min(150, attacker.visionRange * 0.7);
      const rearY = flowYAtX(this.levelRuntime.map, rearX, routePosition);
      const rear = this.spawnUnit("enemy", "swordsman", rearY, rearX, { forceBaseLevel: true });
      rear.x = rearX;
      rear.y = rearY;
      const ignoresRear = this.findTargetUnit(rearAttacker) === undefined;

      clearScenario();
      const crossingAttacker = this.spawnUnit("player", type, originY, originX, {
        forceBaseLevel: true,
      });
      crossingAttacker.x = originX;
      crossingAttacker.y = originY;
      crossingAttacker.routePosition = routePosition;
      crossingAttacker.nextTargetScanAt = 0;
      const crossingX = originX - 34;
      const crossingRouteY = flowYAtX(this.levelRuntime.map, crossingX, routePosition);
      const crossingY = crossingRouteY + config.laneTolerance * 0.8;
      const crossing = this.spawnUnit("enemy", "swordsman", crossingY, crossingX, {
        forceBaseLevel: true,
      });
      crossing.x = crossingX;
      crossing.y = crossingY;
      const acquiresCloseCrossing = this.findTargetUnit(crossingAttacker)?.id === crossing.id;

      const destination = this.levelRuntime.map.enemySpawnZone;
      const castleDestinationX = this.castleApproachX(crossingAttacker, this.enemyCastle);
      const expectedLaneDestinationY = clamp(
        flowYAtX(this.levelRuntime.map, castleDestinationX, routePosition),
        destination.minY,
        destination.maxY,
      );
      this.moveUnit(crossingAttacker, 16);
      const keepsLaneDestination =
        crossingAttacker.navGoalX !== undefined &&
        crossingAttacker.navGoalY !== undefined &&
        Math.abs(crossingAttacker.navGoalX - castleDestinationX) < 0.01 &&
        Math.abs(crossingAttacker.navGoalY - expectedLaneDestinationY) < 0.01;

      clearScenario();
      const retaliationAttacker = this.spawnUnit("player", type, originY, originX, {
        forceBaseLevel: true,
      });
      retaliationAttacker.x = originX;
      retaliationAttacker.y = originY;
      retaliationAttacker.routePosition = routePosition;
      retaliationAttacker.nextTargetScanAt = 0;
      const threatX = originX + 120;
      const threatY = flowYAtX(this.levelRuntime.map, threatX, routePosition) + config.laneTolerance * 1.8;
      const rangedThreat = this.spawnUnit("enemy", "archer", threatY, threatX, {
        forceBaseLevel: true,
      });
      rangedThreat.x = threatX;
      rangedThreat.y = threatY;
      rangedThreat.targetId = retaliationAttacker.id;
      const retaliatesAgainstRangedAttacker =
        this.findTargetUnit(retaliationAttacker)?.id === rangedThreat.id;
      const routesToEngagedThreat = Boolean(this.tiledPathfinder?.findPath(
        retaliationAttacker.x,
        retaliationAttacker.y,
        rangedThreat.x,
        rangedThreat.y,
        this.navigationProfile(retaliationAttacker),
      ));

      clearScenario();
      const priorityAttacker = this.spawnUnit("player", type, originY, originX, {
        forceBaseLevel: true,
      });
      priorityAttacker.x = originX;
      priorityAttacker.y = originY;
      priorityAttacker.routePosition = routePosition;
      priorityAttacker.nextTargetScanAt = 0;
      const guardX = originX + 44;
      const guardY = flowYAtX(this.levelRuntime.map, guardX, routePosition);
      const guard = this.spawnUnit("enemy", "swordsman", guardY, guardX, {
        forceBaseLevel: true,
      });
      guard.x = guardX;
      guard.y = guardY;
      const workerX = originX + 78;
      const workerY = flowYAtX(this.levelRuntime.map, workerX, routePosition);
      const worker = this.spawnUnit("enemy", "peasant", workerY, workerX, {
        forceBaseLevel: true,
      });
      worker.x = workerX;
      worker.y = workerY;
      const priorityTarget = this.findTargetUnit(priorityAttacker);
      const followsRoleTargetPriority = priorityTarget?.id === guard.id;

      clearScenario();
      results.push({
        type,
        acquiresForward,
        releasesOutsideLane,
        ignoresSideLane,
        acquiresMergingOpponent,
        ignoresRear,
        acquiresCloseCrossing,
        keepsLaneDestination,
        retaliatesAgainstRangedAttacker,
        routesToEngagedThreat,
        followsRoleTargetPriority,
      });
    }

    clearScenario();
    const engagementY = flowYAtX(this.levelRuntime.map, originX, routePosition);
    const engagementSword = this.spawnUnit(
      "player",
      "swordsman",
      engagementY,
      originX,
      { forceBaseLevel: true },
    );
    const engagementArcher = this.spawnUnit(
      "enemy",
      "archer",
      engagementY,
      originX + 38,
      { forceBaseLevel: true },
    );
    engagementSword.x = originX;
    engagementSword.y = engagementY;
    engagementSword.routePosition = routePosition;
    engagementSword.nextTargetScanAt = 0;
    engagementSword.lastAttackAt = -engagementSword.cooldown;
    engagementArcher.x = originX + 38;
    engagementArcher.y = engagementY;
    engagementArcher.routePosition = routePosition;
    engagementArcher.nextTargetScanAt = 0;
    engagementArcher.lastAttackAt = -engagementArcher.cooldown;
    const archerHpBefore = engagementArcher.hp;
    this.updateUnits(16);
    const engagement = {
      swordLocksArcher: engagementSword.targetId === engagementArcher.id,
      archerLocksSword: engagementArcher.targetId === engagementSword.id,
      swordDamagesArcher: engagementArcher.hp < archerHpBefore,
    };
    clearScenario();

    const passed = results.every((result) =>
      result.acquiresForward === true &&
      result.releasesOutsideLane === true &&
      result.ignoresSideLane === true &&
      result.acquiresMergingOpponent === true &&
      result.ignoresRear === true &&
      result.acquiresCloseCrossing === true &&
      result.keepsLaneDestination === true &&
      result.retaliatesAgainstRangedAttacker === true &&
      result.routesToEngagedThreat === true &&
      result.followsRoleTargetPriority === true
    ) &&
      engagement.swordLocksArcher &&
      engagement.archerLocksSword &&
      engagement.swordDamagesArcher;
    const report = { passed, testedAt: new Date().toISOString(), engagement, results };
    (window as typeof window & { __CASTLE_TARGETING_QA_RESULT__?: typeof report })
      .__CASTLE_TARGETING_QA_RESULT__ = report;
    this.log("TARGET_QA", `${passed ? "PASS" : "FAIL"} ${JSON.stringify(results)}`);
  }

  private isSoldierMenuTestPath() {
    const params = new URLSearchParams(window.location.search);
    return (
      window.location.pathname.endsWith("/soldier-menu-test") ||
      params.has("soldierMenuTest") ||
      params.get("scene") === "soldier-menu-test"
    );
  }

  private mapRandom() {
    this.mapRandomState =
      (Math.imul(this.mapRandomState, 1664525) + 1013904223) >>> 0;
    return this.mapRandomState / 0x100000000;
  }

  private mapRandomInt(min: number, max: number) {
    return Math.floor(this.mapRandom() * (max - min + 1)) + min;
  }

  private createSnowMap() {
    const tiledDefinition = getTiledBattleMapDefinition(this.levelRuntime.map.id);
    if (tiledDefinition) {
      this.tiledMapRender = renderTiledBattleMap(this, tiledDefinition);
      this.levelRuntime = {
        ...this.levelRuntime,
        map: applyTiledGameplayObjects(this.levelRuntime.map, this.tiledMapRender.tilemap),
      };
      this.playerDeployZone = this.isOnline && this.localPlayerSide === "right"
        ? this.levelRuntime.map.enemySpawnZone
        : this.levelRuntime.map.deployZone;
      this.onlineGeometry = this.isOnline
        ? onlineSideGeometry(this.tiledMapRender.tilemap, this.localPlayerSide)
        : undefined;
      this.onlineOpponentGeometry = this.isOnline
        ? onlineSideGeometry(this.tiledMapRender.tilemap, this.localPlayerSide === "left" ? "right" : "left")
        : undefined;
      if (tiledDefinition.useTiledNavigation) {
        this.tiledNavigation = new TiledCollisionGrid(this.tiledMapRender.tilemap);
        this.tiledPathfinder = new TiledNavigation(this.tiledNavigation);
        this.renderNavigationDebugOverlay();
      }
    }
    renderBattleMap(this, this.levelRuntime.map, {
      showBackground: !tiledDefinition,
      showLegacyTerrain: tiledDefinition?.renderLegacyTerrain ?? true,
      showObjects: tiledDefinition?.renderLegacyObjects ?? true,
      showResources: false,
      showWeather: true,
      animateWeather: true,
    });
    this.createResourceNodes();
  }

  /** Open with ?navDebug=1 to inspect the authored movement grid.
   * Red: forbidden water/lava/cliff. Green: an intentional crossing cell. */
  private renderNavigationDebugOverlay() {
    if (!new URLSearchParams(window.location.search).has("navDebug") || !this.tiledMapRender) return;
    const tilemap = this.tiledMapRender.tilemap;
    const blocked = tilemap.getLayer("NAV_BLOCKED");
    const bridges = tilemap.getLayer("05_BRIDGES");
    const graphics = this.add.graphics().setDepth(680);
    for (let row = 0; row < 18; row += 1) {
      for (let column = 0; column < 32; column += 1) {
        const blockedTile = blocked?.data[row]?.[column];
        const bridgeTile = bridges?.data[row]?.[column];
        if (bridgeTile && bridgeTile.index >= 0 && bridgeTile.properties.navigationRole === "bridge") {
          graphics.fillStyle(0x2ee56b, 0.62);
          graphics.fillRect(column * 40 + 2, row * 40 + 2, 36, 36);
        } else if (blockedTile && blockedTile.index >= 0 && blockedTile.properties.navigationRole === "blocked") {
          graphics.fillStyle(0xef3340, 0.46);
          graphics.fillRect(column * 40 + 2, row * 40 + 2, 36, 36);
        }
      }
    }
  }

  private createUnitAnimations() {
    const loadAllUnits =
      this.targetingQaMode ||
      (this.navigationQaMode && !this.swordDuelQaMode) ||
      this.isSoldierMenuTestPath();
    const teamUnitIds: Record<Team, readonly UnitId[]> = {
      player: loadAllUnits ? ALL_UNIT_IDS : this.battleStartData.playerLoadout,
      enemy: loadAllUnits || this.isOnline ? (loadAllUnits ? ALL_UNIT_IDS : this.battleStartData.playerLoadout) : this.levelRuntime.enemyUnitIds,
    };
    for (const team of ["player", "enemy"] as Team[]) {
      for (const type of teamUnitIds[team]) {
        for (const [action, config] of Object.entries(
          UNIT_ANIMATION_DEFINITIONS,
        ) as Array<
          [
            UnitVisualAction,
            (typeof UNIT_ANIMATION_DEFINITIONS)[UnitVisualAction],
          ]
        >) {
          const key = this.unitAnimationKey(team, type, action);
          const authoredRunCycle =
            action === "run" && AUTHORED_RUN_CYCLE_UNITS.includes(type);
          const runFrameCount = AUTHORED_RUN_FRAME_COUNTS[type] ?? config.end + 1;

          if (this.anims.exists(key)) {
            continue;
          }

          this.anims.create({
            key,
            frames: this.anims.generateFrameNames(
              this.unitAssetKey(team, type),
              {
                prefix: config.prefix,
                start: config.start,
                end: authoredRunCycle ? runFrameCount - 1 : config.end,
                zeroPad: UNIT_ATLAS_FRAME_ZERO_PAD,
              },
            ),
            frameRate: config.frameRate,
            repeat: config.repeat,
          });
        }
      }
    }
  }

  private createResourceNodes() {
    if (this.isOnline) return;
    this.levelRuntime.map.resources.forEach((config) => this.createResourceNode(this.resolveTreeResourcePlacement(config)));
  }

  private syncOnlineResources(resources: OnlineMatchSnapshot["resources"]) {
    const template = this.levelRuntime.map.resources.find((resource) => resource.type === "tree");
    if (!template) return;
    for (const resource of resources) {
      let node = this.onlineResourceById.get(resource.id);
      if (!node) {
        node = this.createResourceNode({
          ...template,
          id: `online_${resource.side}_${resource.id}`,
          x: resource.x,
          y: resource.y,
          amount: resource.maxAmount,
        }, resource);
        this.onlineResourceById.set(resource.id, node);
        continue;
      }
      const moved = node.onlineRevision !== resource.revision || node.x !== resource.x || node.y !== resource.y;
      const visualChanged = node.amount !== resource.amount ||
        node.maxAmount !== resource.maxAmount ||
        node.onlineSide !== resource.side;
      node.amount = resource.amount;
      node.maxAmount = resource.maxAmount;
      node.onlineSide = resource.side;
      if (visualChanged) this.updateResourceVisual(node);
      if (!moved) continue;
      node.x = resource.x;
      node.y = resource.y;
      node.onlineRevision = resource.revision;
      this.tweens.killTweensOf(node.container);
      node.container
        .setPosition(resource.x, resource.y)
        .setDepth(node.depthOffset + resource.y)
        .setScale(0.35)
        .setAlpha(0.35);
      this.tweens.add({
        targets: node.container,
        scale: 1,
        alpha: 1,
        duration: 360,
        ease: "Quad.Out",
      });
    }
  }

  /**
   * Resource definitions predate the Tiled migration. The loaded Tiled
   * navigation grid is therefore the final authority for their placement.
   * This is deliberately a runtime safety net as well as the source-map QA:
   * a hand-edited bridge/NAV_BLOCKED cell can never make a tree appear on a
   * crossing, water, lava or another impassable surface.
   */
  private canPlaceTreeAt(x: number, y: number) {
    if (!this.tiledNavigation) return true;
    const first = this.tiledNavigation.worldToCell(x - TREE_NAV_CLEARANCE, y - TREE_NAV_CLEARANCE);
    const last = this.tiledNavigation.worldToCell(x + TREE_NAV_CLEARANCE, y + TREE_NAV_CLEARANCE);
    for (let row = first.row; row <= last.row; row += 1) {
      for (let column = first.column; column <= last.column; column += 1) {
        if (this.tiledNavigation.cellAt(column, row)?.blocksDeploy) return false;
      }
    }
    return true;
  }

  private resolveTreeResourcePlacement(config: ResourceNodeConfig): ResourceNodeConfig {
    if (config.type !== "tree") return config;

    // Never mutate the shared level definition. Scene restarts used to apply
    // this multiplier repeatedly to the same resource config.
    const scaledConfig = {
      ...config,
      scale: (config.scale || 1) * 0.84,
    };
    if (!this.tiledNavigation) return scaledConfig;

    if (this.canPlaceTreeAt(scaledConfig.x, scaledConfig.y)) return scaledConfig;

    let replacement: { x: number; y: number; distanceSquared: number } | undefined;
    const seen = new Set<string>();
    for (let radius = 0; radius <= TREE_NAV_SEARCH_RADIUS; radius += TREE_NAV_SEARCH_STEP) {
      for (let offsetY = -radius; offsetY <= radius; offsetY += TREE_NAV_SEARCH_STEP) {
        for (let offsetX = -radius; offsetX <= radius; offsetX += TREE_NAV_SEARCH_STEP) {
          if (Math.max(Math.abs(offsetX), Math.abs(offsetY)) !== radius) continue;
          const x = clamp(scaledConfig.x + offsetX, TREE_NAV_CLEARANCE, 1280 - TREE_NAV_CLEARANCE);
          const y = clamp(scaledConfig.y + offsetY, TREE_NAV_CLEARANCE, 720 - TREE_NAV_CLEARANCE);
          const key = `${x}:${y}`;
          if (seen.has(key) || !this.canPlaceTreeAt(x, y)) continue;
          seen.add(key);
          const distanceSquared = offsetX ** 2 + offsetY ** 2;
          if (!replacement || distanceSquared < replacement.distanceSquared) replacement = { x, y, distanceSquared };
        }
      }
      if (replacement) break;
    }

    if (!replacement) {
      this.log("MAP_QA", `tree resource ${config.id} has no safe Tiled position; keeping authored point.`);
      return scaledConfig;
    }

    this.log("MAP_QA", `tree resource ${config.id} moved off bridge/NAV_BLOCKED to x=${replacement.x} y=${replacement.y}.`);
    return { ...scaledConfig, x: replacement.x, y: replacement.y };
  }

  private createResourceNode(
    config: ResourceNodeConfig,
    onlineResource?: OnlineMatchSnapshot["resources"][number],
  ) {
    const visual = createMapPropVisual(this, {
      ...config,
      x: 0,
      y: 0,
      depth: 0,
      scale: config.type === "tree"
        ? config.scale * RESOURCE_TREE_MAP_SCALE
        : config.scale,
    });
    const stumpColor = config.type === "crystal"
      ? 0x75bddd
      : config.type === "ore"
        ? 0x7b7468
        : config.type === "lava_rock"
          ? 0x8f2f1f
          : 0x8a5a2d;
    const stump = this.add
      .rectangle(0, -5, 19, 10, stumpColor)
      .setStrokeStyle(3, 0x4d2f18)
      .setVisible(false);
    const barBack = this.add.image(0, 12, "medallion_bg");
    const barFill = this.add.image(-17, 12, "medallion_fill").setOrigin(0, 0.5);
    const treeParts: ResourceTreePart[] = [visual];
    const container = this.add
      .container(config.x, config.y, [...treeParts, stump, barBack, barFill])
      .setDepth(config.depth + config.y);

    const node: ResourceNode = {
      id: this.resourceNodeId,
      x: config.x,
      y: config.y,
      amount: onlineResource?.amount ?? config.amount,
      maxAmount: onlineResource?.maxAmount ?? config.amount,
      type: config.type,
      visual: config.visual,
      depthOffset: config.depth,
      reservedBy: [],
      container,
      stump,
      barFill,
      treeParts,
      barBack,
      onlineResourceId: onlineResource?.id,
      onlineRevision: onlineResource?.revision,
      onlineSide: onlineResource?.side,
    };

    this.resourceNodeId += 1;
    this.resourceNodes.push(node);
    this.updateResourceVisual(node);
    return node;
  }

  private createStrongholds() {
    if (getTiledBattleMapDefinition(this.levelRuntime.map.id)?.usesReferenceVisuals) {
      this.createReferenceMapStrongholds();
      return;
    }

    const compositeCastles = this.createCompositeFortressSides();
    if (compositeCastles) {
      this.playerCastle = compositeCastles.playerCastle;
      this.enemyCastle = compositeCastles.enemyCastle;
      return;
    }

    const playerMain = this.levelRuntime.map.anchors.playerCastle;
    const enemyMain = this.levelRuntime.map.anchors.enemyCastle;
    this.createTowerWall("player", 224, 96, "tower", 224, 270, "tower");
    this.createTowerWall("player", 224, 270, "tower", playerMain.x, playerMain.y, "main");
    this.createTowerWall("enemy", enemyMain.x, enemyMain.y, "main", 1056, 270, "tower");
    this.createTowerWall("enemy", 1056, 270, "tower", 1056, 562, "tower");

    this.createCastleVisual("player", 224, 96, "red", "tower");
    this.createCastleVisual("player", 224, 270, "red", "tower");
    const playerCastle = this.createCastleVisual(
      "player",
      playerMain.x,
      playerMain.y,
      "red",
      "main",
      true,
    );

    const enemyCastle = this.createCastleVisual(
      "enemy",
      enemyMain.x,
      enemyMain.y,
      "blue",
      "main",
      true,
    );
    this.createCastleVisual("enemy", 1056, 270, "blue", "tower");
    this.createCastleVisual("enemy", 1056, 562, "blue", "tower");

    if (!playerCastle || !enemyCastle) {
      throw new Error("Castle setup failed.");
    }

    this.playerCastle = playerCastle;
    this.enemyCastle = enemyCastle;
  }

  /** Reference maps already include their approved red/blue fortress artwork.
   * Keep only the authoritative hit points here so no legacy structure is
   * painted a second time over the Phaser Tilemap. */
  private createReferenceMapStrongholds() {
    this.playerCastle = this.createCastleStateWithHpBar(
      "player",
      this.levelRuntime.map.anchors.playerCastle.x,
      this.levelRuntime.map.anchors.playerCastle.y,
      PLAYER_MAIN_STRUCTURE_HEIGHT,
      this.referenceCastleFrontX("player"),
    );
    this.enemyCastle = this.createCastleStateWithHpBar(
      "enemy",
      this.levelRuntime.map.anchors.enemyCastle.x,
      this.levelRuntime.map.anchors.enemyCastle.y,
      ENEMY_MAIN_STRUCTURE_HEIGHT,
      this.referenceCastleFrontX("enemy"),
    );
  }

  private referenceCastleFrontX(team: Team) {
    // PERMANENT INVARIANT: this value must come from the current TMJ castle
    // rectangle's battlefield-facing edge. Never use anchorX, rounding or a
    // cross-map constant here. Online uses the same castleContactX helper.
    if (this.tiledNavigation) {
      const contactX = team === "player"
        ? this.tiledNavigation.playerCastleFrontX
        : this.tiledNavigation.enemyCastleFrontX;
      if (contactX !== undefined) return contactX;
    }
    type CastleAnchorObject = {
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      type?: string;
      class?: string;
      properties?: Array<{ name: string; value: unknown }>;
    };
    const objects = this.tiledMapRender?.tilemap
      .getObjectLayer("GAMEPLAY_ZONES")
      ?.objects as CastleAnchorObject[] | undefined;
    const anchor = (objects ?? []).find((object) => {
      const properties = new Map(
        object.properties?.map((property) => [property.name, property.value]) ?? [],
      );
      return (
        (object.type === "CastleAnchor" || object.class === "CastleAnchor") &&
        properties.get("team") === team
      );
    });
    if (
      typeof anchor?.x !== "number" ||
      typeof anchor.y !== "number" ||
      typeof anchor.width !== "number" ||
      typeof anchor.height !== "number" ||
      !Number.isFinite(anchor.x) ||
      !Number.isFinite(anchor.y) ||
      !Number.isFinite(anchor.width) ||
      !Number.isFinite(anchor.height)
    ) {
      return undefined;
    }

    return castleContactX({
      minX: anchor.x,
      maxX: anchor.x + anchor.width,
      minY: anchor.y,
      maxY: anchor.y + anchor.height,
    }, team === "player" ? "left" : "right");
  }

  private applyLevelCastleHp() {
    if (this.isOnline) {
      this.playerCastle.maxHp = 2_500;
      this.playerCastle.hp = 2_500;
      this.enemyCastle.maxHp = 2_500;
      this.enemyCastle.hp = 2_500;
      this.log("MATH", "online castleHp left=2500 right=2500 authority=server");
      return;
    }
    this.playerCastle.maxHp = this.levelRuntime.level.player.castleHp;
    this.playerCastle.hp = this.playerCastle.maxHp;
    this.enemyCastle.maxHp = this.levelRuntime.level.enemy.castleHp;
    this.enemyCastle.hp = this.enemyCastle.maxHp;
    this.log(
      "MATH",
      `castleHp player=${this.playerCastle.maxHp} enemy=${this.enemyCastle.maxHp}`,
    );
  }

  private createCompositeFortressSides():
    | { playerCastle: CastleState; enemyCastle: CastleState }
    | undefined {
    const playerKey = "structure-player-fortress-side";
    const enemyKey = "structure-enemy-fortress-side";

    if (!this.textures.exists(playerKey) || !this.textures.exists(enemyKey)) {
      return undefined;
    }

    this.addFortressSideImage(playerKey, PLAYER_FORTRESS_SIDE_X, FORTRESS_SIDE_Y);
    this.addFortressSideImage(enemyKey, ENEMY_FORTRESS_SIDE_X, FORTRESS_SIDE_Y);

    return {
      playerCastle: this.createCastleStateWithHpBar(
        "player",
        this.levelRuntime.map.anchors.playerCastle.x,
        this.levelRuntime.map.anchors.playerCastle.y,
        PLAYER_MAIN_STRUCTURE_HEIGHT,
      ),
      enemyCastle: this.createCastleStateWithHpBar(
        "enemy",
        this.levelRuntime.map.anchors.enemyCastle.x,
        this.levelRuntime.map.anchors.enemyCastle.y,
        ENEMY_MAIN_STRUCTURE_HEIGHT,
      ),
    };
  }

  private addFortressSideImage(key: string, x: number, y: number) {
    const image = this.add.image(x, y, key).setOrigin(0.5, 0.5);
    const aspect = image.width / Math.max(1, image.height);
    image.setDisplaySize(FORTRESS_SIDE_DISPLAY_HEIGHT * aspect, FORTRESS_SIDE_DISPLAY_HEIGHT);
    image.setDepth(FORTRESS_SIDE_DEPTH);
  }

  private createCastleStateWithHpBar(
    team: Team,
    x: number,
    y: number,
    displayHeight: number,
    frontX = x,
  ): CastleState {
    const hpY = clamp(y - displayHeight - 10, 20, 700);
    this.add
      .rectangle(x, hpY, CASTLE_HP_BAR_WIDTH, 8, 0x202020)
      .setDepth(FORTRESS_SIDE_DEPTH + 10);
    const hpFill = this.add
      .rectangle(x - CASTLE_HP_BAR_WIDTH / 2, hpY, CASTLE_HP_BAR_WIDTH, 8, 0x4ed35e)
      .setOrigin(0, 0.5)
      .setDepth(FORTRESS_SIDE_DEPTH + 11);

    return { team, hp: 1000, maxHp: 1000, x, y, frontX, hpFill };
  }

  private createTowerWall(
    team: Team,
    upperX: number,
    upperY: number,
    upperVariant: CastleVariant,
    lowerX: number,
    lowerY: number,
    lowerVariant: CastleVariant,
  ) {
    const wallKey = team === "player" ? "structure-player-wall-v" : "structure-enemy-wall-v";

    if (this.textures.exists(wallKey)) {
      const direction = team === "player" ? 1 : -1;
      const upperScale = upperVariant === "main" ? MAIN_CASTLE_VISUAL_SCALE : TOWER_VISUAL_SCALE;
      const lowerScale = lowerVariant === "main" ? MAIN_CASTLE_VISUAL_SCALE : TOWER_VISUAL_SCALE;
      const upperHalfWidth = (upperVariant === "main" ? 53 : 37) * upperScale;
      const lowerHalfWidth = (lowerVariant === "main" ? 53 : 37) * lowerScale;
      const upperInnerX = upperX + direction * upperHalfWidth * 0.72;
      const lowerInnerX = lowerX + direction * lowerHalfWidth * 0.72;
      const wallX = Math.round((upperInnerX + lowerInnerX) / 2);
      const centerY = Math.round((upperY + lowerY) / 2);
      const targetHeight = Math.max(140, Math.abs(lowerY - upperY) + 52);
      const image = this.add.image(wallX, centerY, wallKey).setOrigin(0.5, 0.5);
      image.setDisplaySize(WALL_STRUCTURE_TARGET_WIDTH, targetHeight);
      image.setDepth(centerY - 3);
      return;
    }

    const direction = team === "player" ? 1 : -1;
    const upperScale = upperVariant === "main" ? MAIN_CASTLE_VISUAL_SCALE : TOWER_VISUAL_SCALE;
    const lowerScale = lowerVariant === "main" ? MAIN_CASTLE_VISUAL_SCALE : TOWER_VISUAL_SCALE;
    const upperHalfWidth = (upperVariant === "main" ? 53 : 37) * upperScale;
    const lowerHalfWidth = (lowerVariant === "main" ? 53 : 37) * lowerScale;
    const upperInnerX = upperX + direction * upperHalfWidth * 0.72;
    const lowerInnerX = lowerX + direction * lowerHalfWidth * 0.72;
    const upperBottom = upperY + (upperVariant === "main" ? 92 : 64);
    const lowerTop = lowerY - (lowerVariant === "main" ? 62 : 54) * lowerScale;
    const top = upperBottom + 2;
    const bottom = lowerTop - 2;
    const height = bottom - top;

    if (height < 12) {
      return;
    }

    const wallX = upperVariant === "tower" ? upperInnerX : lowerInnerX;
    const centerY = top + height / 2;
    const width = Math.round(34 * WALL_VISUAL_SCALE);
    const children: Phaser.GameObjects.GameObject[] = [
      this.add.rectangle(3, 4, width + 4, height, 0x000000, 0.08),
      this.add
        .rectangle(0, 0, width, height, 0xcacac3)
        .setStrokeStyle(2, 0x5a5a54),
      this.add.rectangle(
        -width * 0.18,
        0,
        width * 0.38,
        height - 6,
        0xe2e2db,
        0.35,
      ),
    ];

    const rowHeight = 24;
    const rowCount = Math.max(1, Math.floor(height / rowHeight));
    for (let row = 1; row < rowCount; row += 1) {
      const y = -height / 2 + row * (height / rowCount);
      children.push(this.add.rectangle(0, y, width - 6, 2, 0x85857d, 0.62));
    }

    for (let row = 0; row < rowCount; row += 1) {
      const y = -height / 2 + row * (height / rowCount) + height / rowCount / 2;
      const crackX = row % 2 === 0 ? -width * 0.12 : width * 0.15;
      children.push(
        this.add.rectangle(
          crackX,
          y,
          2,
          Math.min(16, height / rowCount - 5),
          0x8f8f87,
          0.45,
        ),
      );
    }

    if (height >= 34) {
      const capY = height / 2 - 7;
      for (let i = 0; i < 3; i += 1) {
        const x = -width / 2 + 8 + i * 13;
        children.push(
          this.add
            .rectangle(x, -height / 2 + 7, 9, 11, 0xb9b9b2)
            .setStrokeStyle(1, 0x55554f),
        );
        children.push(
          this.add
            .rectangle(x, capY, 9, 11, 0xb9b9b2)
            .setStrokeStyle(1, 0x55554f),
        );
      }
    }

    this.add.container(wallX, centerY, children).setDepth(centerY);
  }

  private createCastleVisual(
    team: Team,
    x: number,
    y: number,
    roof: "red" | "blue",
    variant: CastleVariant,
    hasHpBar = false,
  ): CastleState | undefined {
    const structureKey =
      team === "player" ? "structure-player-stronghold" : "structure-enemy-stronghold";

    if (this.textures.exists(structureKey)) {
      const displayHeight =
        team === "player"
          ? variant === "main"
            ? PLAYER_MAIN_STRUCTURE_HEIGHT
            : PLAYER_TOWER_STRUCTURE_HEIGHT
          : variant === "main"
            ? ENEMY_MAIN_STRUCTURE_HEIGHT
            : ENEMY_TOWER_STRUCTURE_HEIGHT;

      const image = this.add.image(x, y + 2, structureKey).setOrigin(0.5, 1);
      const aspect = image.width / Math.max(1, image.height);
      image.setDisplaySize(displayHeight * aspect, displayHeight);
      image.setDepth(y + 65);

      if (hasHpBar) {
        const hpY = clamp(y - displayHeight - 10, 20, 700);
        this.add
          .rectangle(x, hpY, CASTLE_HP_BAR_WIDTH, 8, 0x202020)
          .setDepth(y + 90);
        const hpFill = this.add
          .rectangle(x - CASTLE_HP_BAR_WIDTH / 2, hpY, CASTLE_HP_BAR_WIDTH, 8, 0x4ed35e)
          .setOrigin(0, 0.5)
          .setDepth(y + 91);
        return { team, hp: 1000, maxHp: 1000, x, y, frontX: x, hpFill };
      }

      return undefined;
    }

    const roofColor = roof === "red" ? 0xc9272e : 0x2496d2;
    const trimColor = roof === "red" ? 0x8f151d : 0x14669c;
    const isMain = variant === "main";
    const visualScale = isMain ? MAIN_CASTLE_VISUAL_SCALE : TOWER_VISUAL_SCALE;
    const bodyWidth = isMain ? 106 : 74;
    const bodyHeight = isMain ? 112 : 82;
    const roofWidth = isMain ? 106 : 78;
    const roofHeight = isMain ? 38 : 30;
    const bodyTop = isMain ? -22 : -18;
    const bodyBottom = bodyTop + bodyHeight;
    const roofBaseY = bodyTop - 8;
    const roofTopY = roofBaseY - roofHeight;
    const doorHeight = isMain ? 50 : 42;
    const merlonCount = isMain ? 6 : 4;
    const children: Phaser.GameObjects.GameObject[] = [];

    children.push(
      this.add.ellipse(0, bodyBottom - 4, bodyWidth + 28, 30, 0x000000, 0.14),
    );
    children.push(
      this.add.rectangle(
        0,
        bodyTop + bodyHeight / 2,
        bodyWidth + 8,
        bodyHeight + 8,
        0x464640,
      ),
    );
    children.push(
      this.add.rectangle(
        0,
        bodyTop + bodyHeight / 2,
        bodyWidth,
        bodyHeight,
        0xcfcfc8,
      ),
    );
    children.push(
      this.add.rectangle(
        -bodyWidth * 0.18,
        bodyTop + bodyHeight / 2,
        bodyWidth * 0.55,
        bodyHeight,
        0xdfdfd8,
        0.68,
      ),
    );

    for (let row = 0; row < 3; row += 1) {
      children.push(
        this.add.rectangle(
          -bodyWidth * 0.16 + (row % 2) * 10,
          bodyTop + 32 + row * 26,
          bodyWidth * 0.52,
          3,
          0x8f8f89,
          0.45,
        ),
      );
      children.push(
        this.add.rectangle(
          bodyWidth * 0.28 - (row % 2) * 8,
          bodyTop + 23 + row * 26,
          2,
          18,
          0x9d9d96,
          0.35,
        ),
      );
    }

    children.push(
      this.add
        .rectangle(
          0,
          bodyBottom - doorHeight / 2,
          isMain ? 28 : 23,
          doorHeight,
          0x805231,
        )
        .setStrokeStyle(3, 0x2c1c12),
    );
    children.push(
      this.add.circle(
        isMain ? 9 : 7,
        bodyBottom - doorHeight / 2 + 2,
        2.5,
        0xe0b56d,
      ),
    );
    children.push(
      this.add
        .rectangle(0, bodyTop - 1, bodyWidth + 8, 10, 0xb7b7b1)
        .setStrokeStyle(2, 0x383838),
    );

    for (let i = 0; i < merlonCount; i += 1) {
      const gap = (bodyWidth - 20) / Math.max(1, merlonCount - 1);
      children.push(
        this.add
          .rectangle(
            -bodyWidth / 2 + 10 + i * gap,
            bodyTop - 12,
            12,
            17,
            0xb8b8b2,
          )
          .setStrokeStyle(2, 0x3c3c3c),
      );
    }

    children.push(
      this.add.ellipse(
        0,
        roofBaseY - roofHeight * 0.28 + 4,
        roofWidth + 10,
        roofHeight + 14,
        0x2a2a2a,
        0.18,
      ),
    );
    children.push(
      this.add
        .rectangle(
          0,
          roofBaseY - roofHeight * 0.24,
          roofWidth * 0.84,
          roofHeight * 0.58,
          roofColor,
        )
        .setStrokeStyle(3, 0x2c2c2c),
    );
    children.push(
      this.add
        .ellipse(
          0,
          roofBaseY - roofHeight * 0.55,
          roofWidth,
          roofHeight * 0.88,
          roofColor,
        )
        .setStrokeStyle(4, 0x2c2c2c),
    );
    children.push(
      this.add
        .rectangle(0, roofBaseY + 2, roofWidth * 0.92, 8, trimColor)
        .setStrokeStyle(2, 0x2c2c2c),
    );
    children.push(
      this.add
        .rectangle(
          -roofWidth * 0.18,
          roofTopY + 12,
          roofWidth * 0.42,
          5,
          0xffffff,
          0.14,
        )
        .setRotation(-0.1),
    );

    const windowY = bodyTop + 15;
    children.push(
      this.add
        .rectangle(-bodyWidth * 0.24, windowY, 10, 12, 0x9aa8ad)
        .setStrokeStyle(2, 0x3c3c3c),
    );
    children.push(
      this.add
        .rectangle(0, windowY, 10, 12, 0x9aa8ad)
        .setStrokeStyle(2, 0x3c3c3c),
    );
    children.push(
      this.add
        .rectangle(bodyWidth * 0.24, windowY, 10, 12, 0x9aa8ad)
        .setStrokeStyle(2, 0x3c3c3c),
    );

    const visualY = y + bodyBottom * (1 - visualScale);
    this.add.container(x, visualY, children).setScale(visualScale).setDepth(y + 65);

    if (hasHpBar) {
      const hpY = clamp(visualY + roofTopY * visualScale - 12, 20, 700);
      this.add
        .rectangle(x, hpY, CASTLE_HP_BAR_WIDTH, 8, 0x202020)
        .setDepth(y + 90);
      const hpFill = this.add
        .rectangle(x - CASTLE_HP_BAR_WIDTH / 2, hpY, CASTLE_HP_BAR_WIDTH, 8, 0x4ed35e)
        .setOrigin(0, 0.5)
        .setDepth(y + 91);
      return { team, hp: 1000, maxHp: 1000, x, y, frontX: x, hpFill };
    }

    return undefined;
  }

  private createSidePanel(side: Side, interactive: boolean) {
    const x = side === "left" ? 58 : 1222;
    const panel = this.add
      .rectangle(x, 360, 114, 720, 0x4b2d1c)
      .setStrokeStyle(4, 0x21140d);
    panel.setDepth(1000);
    if (interactive) {
      panel.setInteractive({ useHandCursor: true });
      panel.on(
        "pointerdown",
        (
          _pointer: Phaser.Input.Pointer,
          _localX: number,
          _localY: number,
          event?: { stopPropagation: () => void },
        ) => {
          event?.stopPropagation();
          this.cancelUnitSelection("menu-blank");
        },
      );
    }

    // The menu remains exactly 114 px wide. Layered, deterministic marks give
    // the flat panel an aged-oak finish without placing any art over the map.
    this.add
      .rectangle(x, 360, 104, 710, 0x5b3822, 0.72)
      .setStrokeStyle(2, 0x7a5637, 0.72)
      .setDepth(1001);
    const grainOffsets = [-44, -31, -17, -3, 12, 27, 42];
    grainOffsets.forEach((offset, index) => {
      this.add
        .rectangle(
          x + offset,
          360,
          index % 3 === 0 ? 3 : 2,
          706,
          index % 2 === 0 ? 0x2f1b11 : 0x8a5b36,
          index % 2 === 0 ? 0.34 : 0.18,
        )
        .setDepth(1001)
        .setRotation((index % 2 === 0 ? -1 : 1) * 0.003);
    });
    [68, 174, 280, 386, 492, 704].forEach((seamY, index) => {
      this.add
        .rectangle(x, seamY, 104, index === 5 ? 3 : 2, 0x24150d, 0.52)
        .setDepth(1001);
      this.add
        .rectangle(x, seamY + 2, 102, 1, 0xa4774a, 0.18)
        .setDepth(1001);
    });
    [76, 354, 696].forEach((nailY) => {
      [-48, 48].forEach((offset) => {
        this.add
          .circle(x + offset, nailY, 3, 0x30251e)
          .setStrokeStyle(1, 0x8c7963)
          .setDepth(1002);
      });
    });

    this.add
      .rectangle(x, 28, 106, 47, 0x3d2417)
      .setStrokeStyle(3, 0x8e6b47)
      .setDepth(1002);
    const coin = this.add
      .circle(x - 32, 28, 14, 0xd9aa35)
      .setStrokeStyle(3, 0x765018)
      .setDepth(1003);
    this.add.circle(coin.x - 3, coin.y - 3, 4, 0xf0d47b, 0.72).setDepth(1004);

    const goldText = this.add
      .text(
        x + 10,
        28,
        side === "left" ? `${this.gold}` : `${this.enemyGold}`,
        {
          fontFamily: "Arial Black",
          fontSize: 28,
          color: "#ffffff",
          stroke: "#24150e",
          strokeThickness: 5,
        },
      )
      .setOrigin(0.5)
      .setDepth(1004);

    if (side === "left") {
      this.goldText = goldText;
    } else {
      this.enemyGoldText = goldText;
      // Show 'ENEMY' label only when this panel belongs to the opponent
      // (i.e. offline always, or online when local player is on the other side)
      const isOpponentPanel = !this.isOnline || this.localPlayerSide === "left";
      if (isOpponentPanel) {
        this.add
          .text(x, 72, t("game_enemy"), {
            fontFamily: "Arial Black",
            fontSize: 12,
            color: "#ffffff",
            stroke: "#2b1609",
            strokeThickness: 4,
          })
          .setOrigin(0.5)
          .setDepth(1004);
      }
    }

    // Determine whose unit list this panel shows:
    // - The interactive panel always shows the local player's loadout
    // - The non-interactive (enemy view) panel shows the opponent's units
    const isMyPanel =
      (side === "left" && (this.localPlayerSide === "left" || !this.isOnline)) ||
      (side === "right" && this.isOnline && this.localPlayerSide === "right");
    const types = this.isOnline
      ? this.playerUnitOrder()
      : isMyPanel ? this.playerUnitOrder() : this.enemyUnitOrder();
    const startY = types.length >= 7 ? 96 : 118;
    const stepY = types.length >= 7 ? 58 : types.length >= 5 ? 72 : 102;

    types.forEach((type, index) => {
      this.createUnitCard(side, x, startY + index * stepY, type, interactive, types.length >= 7);
    });

    this.createPowerButtons(x, side);
  }

  private playerUnitOrder() {
    if (this.isSoldierMenuTestPath()) {
      return GENERATED_SOLDIER_MENU_ORDER;
    }

    return this.battleStartData.playerLoadout;
  }

  private enemyUnitOrder() {
    return UNIT_ORDER.filter((unitId) =>
      this.levelRuntime.level.enemy.allowedUnits.includes(unitId),
    );
  }

  private createUnitCard(
    side: Side,
    x: number,
    y: number,
    type: UnitType,
    interactive: boolean,
    compact = false,
  ) {
    const config = UNIT_CONFIGS[type];
    const borderSize = compact ? 52 : 82;
    const cardSize = compact ? 42 : 66;
    const spriteSize = this.unitBaseSpriteSize(type) + (compact ? -4 : 10);
    const labelY = compact ? y + 12 : y + 20;
    const costY = compact ? y + 25 : y + 37;
    const border = this.add
      .rectangle(x, y, borderSize, borderSize, 0x392317)
      .setStrokeStyle(
        compact ? 4 : 5,
        side === "left" ? 0x3b2b21 : 0x603b39,
      )
      .setDepth(1003);
    const card = this.add
      .rectangle(x, y, cardSize, cardSize, 0xc2aa79)
      .setStrokeStyle(compact ? 2 : 3, 0x705334)
      .setDepth(1004);
    this.add
      .rectangle(
        x,
        y,
        cardSize - (compact ? 7 : 9),
        cardSize - (compact ? 7 : 9),
        0xcab586,
        0.16,
      )
      .setStrokeStyle(1, side === "left" ? 0x557f78 : 0x795052, 0.52)
      .setDepth(1004);
    const nailInset = compact ? 4 : 6;
    [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ].forEach(([horizontal, vertical]) => {
      this.add
        .circle(
          x + horizontal * (cardSize / 2 - nailInset),
          y + vertical * (cardSize / 2 - nailInset),
          compact ? 1.5 : 2,
          0x4f4234,
        )
        .setStrokeStyle(1, 0x9a8568, 0.72)
        .setDepth(1005);
    });
    const selectionSeal = this.add
      .circle(
        x + borderSize / 2 - (compact ? 5 : 7),
        y - borderSize / 2 + (compact ? 5 : 7),
        compact ? 3 : 5,
        0x2d8994,
      )
      .setStrokeStyle(compact ? 1 : 2, 0x174f56)
      .setDepth(1009)
      .setVisible(false);
    const icon = this.add
      .sprite(
        x,
        y - 7,
        // interactive panels show "player" atlas for the local player's units;
        // non-interactive enemy views show the "enemy" atlas
        this.unitAssetKey(interactive ? "player" : "enemy", type),
        "idle_000",
      )
      .setDisplaySize(spriteSize, spriteSize)
      .setDepth(1005);
    const label = this.add
      .text(x, labelY, config.shortLabel, {
        fontFamily: "Arial Black",
        fontSize: compact ? 8 : 9,
        color: "#302116",
        stroke: "#cdbb92",
        strokeThickness: 1,
      })
      .setOrigin(0.5)
      .setDepth(1008);
    this.add
      .rectangle(x + (compact ? 18 : 23), costY, compact ? 34 : 42, compact ? 18 : 22, 0x3c2316)
      .setStrokeStyle(2, 0x1d110b)
      .setDepth(1006);
    this.add
      .circle(x + (compact ? 6 : 9), costY, compact ? 5 : 7, 0xd9aa35)
      .setStrokeStyle(2, 0x765018)
      .setDepth(1007);

    const text = this.add
      .text(x + (compact ? 21 : 28), costY, `${config.cost}`, {
        fontFamily: "Arial Black",
        fontSize: compact ? 11 : 14,
        color: "#f3e6c8",
        stroke: "#160c08",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(1008);
    const batchBack = this.add
      .rectangle(x, y - 8, compact ? 46 : 58, compact ? 28 : 34, 0x111827, 0.82)
      .setStrokeStyle(3, 0xfff1a6)
      .setDepth(1011)
      .setVisible(false);
    const batchText = this.add
      .text(x, y - 9, "", {
        fontFamily: "Arial Black",
        fontSize: compact ? 18 : 23,
        color: "#fff1a6",
        stroke: "#000000",
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(1012)
      .setVisible(false);
    const cooldownFill = this.add
      .rectangle(x, y + cardSize / 2, cardSize, cardSize, 0x101722, 0.64)
      .setOrigin(0.5, 1)
      .setDepth(1009)
      .setVisible(false);
    const cooldownText = this.add
      .text(x, y, "", {
        fontFamily: "Arial Black",
        fontSize: compact ? 18 : 24,
        color: "#ffffff",
        stroke: "#111111",
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(1010)
      .setVisible(false);

    if (interactive) {
      card.setInteractive({ useHandCursor: true });
      border.setInteractive({ useHandCursor: true });
      icon.setInteractive({ useHandCursor: true });
      const handleButtonDown = (
        pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event?: { stopPropagation: () => void },
      ) => {
        event?.stopPropagation();
        this.handleUnitButtonPointer(type, pointer);
      };

      card.on("pointerdown", handleButtonDown);
      border.on("pointerdown", handleButtonDown);
      icon.on("pointerdown", handleButtonDown);
      card.on("pointerover", () => card.setFillStyle(0xd0bc8d));
      card.on("pointerout", () => {
        if (this.selectedUnit !== type) {
          card.setFillStyle(0xc2aa79);
        }
      });
    }

    this.unitButtons.push({
      type,
      side,
      card,
      border,
      selectionSeal,
      icon,
      iconBaseScale: icon.scaleX,
      label,
      text,
      batchBack,
      batchText,
      cooldownFill,
      cooldownText,
      readyAt: 0,
      pulseUntil: 0,
    });
  }

  private createPowerButtons(x: number, side: Side) {
    // Power buttons go on the player's OWN panel:
    // - Offline: always left panel
    // - Online Player 1 (left): left panel
    // - Online Player 2 (right): right panel
    const isMyPanel =
      (side === "left" && (!this.isOnline || this.localPlayerSide === "left")) ||
      (side === "right" && this.isOnline && this.localPlayerSide === "right");

    if (!isMyPanel) {
      this.createEnemyPowerBadge(x, 632);
      return;
    }

    this.createRemoveSelectionButton(x, 520);
    const missile = this.createPowerButton(x, 596, "missile", "MISSILE", 0xd33b2f);
    const ice = this.createPowerButton(x, 672, "ice", "ICE", 0x36a8e8);
    this.missileCooldownFill = missile.cooldownFill;
    this.missileCooldownText = missile.cooldownText;
    this.iceCooldownFill = ice.cooldownFill;
    this.iceCooldownText = ice.cooldownText;
  }

  private createRemoveSelectionButton(x: number, y: number) {
    const outer = this.add.circle(0, 0, 35, 0x8e7656)
      .setStrokeStyle(5, 0x3a281b);
    const inner = this.add.circle(0, 0, 26, 0x9e2c26)
      .setStrokeStyle(3, 0x6f563b);
    const icon = this.add.text(0, -2, "X", {
      fontFamily: "Arial Black",
      fontSize: 27,
      color: "#ffffff",
      stroke: "#1b1109",
      strokeThickness: 4,
    }).setOrigin(0.5);
    const label = this.add.text(0, 31, t("game_remove"), {
      fontFamily: "Arial Black",
      fontSize: 9,
      color: "#ffffff",
      stroke: "#1b1109",
      strokeThickness: 3,
    }).setOrigin(0.5);

    const button = this.add.container(x, y, [outer, inner, icon, label])
      .setDepth(1004)
      .setSize(76, 76)
      .setAlpha(0)
      .setScale(0.72)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    button.on("pointerover", () => button.setScale(1.045));
    button.on("pointerout", () => button.setScale(1));
    button.on(
      "pointerdown",
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event?: { stopPropagation: () => void },
      ) => {
        event?.stopPropagation();
        if (this.battleEnded || this.isPaused) return;
        this.cancelUnitSelection("remove-button");
      },
    );
    button.disableInteractive();
    this.removeSelectionButton = button;
    this.removeSelectionLabel = label;
    this.removeSelectionVisible = false;
  }

  private createEnemyPowerBadge(x: number, y: number) {
    this.add
      .circle(x, y, 40, 0x8e7656)
      .setStrokeStyle(5, 0x3a281b)
      .setDepth(1004);
    this.add
      .circle(x, y, 31, 0x432719)
      .setStrokeStyle(3, 0x6f563b)
      .setDepth(1005);
    this.add
      .text(x, y, "POW", {
        fontFamily: "Arial Black",
        fontSize: 15,
        color: "#ffffff",
        stroke: "#1b1109",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(1007);
  }

  private createPowerButton(
    x: number,
    y: number,
    power: PowerType,
    label: string,
    color: number,
  ) {
    const outer = this.add
      .circle(x, y, 35, 0x8e7656)
      .setStrokeStyle(5, 0x3a281b)
      .setDepth(1004)
      .setInteractive({ useHandCursor: true });
    const inner = this.add
      .circle(x, y, 26, color)
      .setStrokeStyle(3, 0x6f563b)
      .setDepth(1005)
      .setInteractive({ useHandCursor: true });
    const icon = this.add
      .text(x, y - 2, power === "missile" ? "➤" : "❄", {
        fontFamily: "Arial Black",
        fontSize: power === "missile" ? 28 : 24,
        color: "#ffffff",
        stroke: "#1b1109",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(1006)
      .setInteractive({ useHandCursor: true });
    const name = this.add
      .text(x, y + 31, label, {
        fontFamily: "Arial Black",
        fontSize: 9,
        color: "#ffffff",
        stroke: "#1b1109",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(1007);
    const cooldownFill = this.add
      .circle(x, y, 26, 0x101722, 0.68)
      .setDepth(1008)
      .setVisible(false);
    const cooldownText = this.add
      .text(x, y, "", {
        fontFamily: "Arial Black",
        fontSize: 18,
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(1009)
      .setVisible(false);

    const activate = (
      _pointer: Phaser.Input.Pointer,
      _localX: number,
      _localY: number,
      event?: { stopPropagation: () => void },
    ) => {
      event?.stopPropagation();
      this.selectPower(power);
    };
    outer.on("pointerdown", activate);
    inner.on("pointerdown", activate);
    icon.on("pointerdown", activate);
    name.on("pointerdown", activate);

    return { cooldownFill, cooldownText };
  }

  private createTopHud() {
    this.pauseButton = this.add
      .rectangle(640, 30, 76, 58, 0x6a3d1f)
      .setStrokeStyle(5, 0x666666)
      .setDepth(1000)
      .setInteractive({ useHandCursor: true });
    this.pauseLabel = this.add
      .text(640, 29, "II", {
        fontFamily: "Arial Black",
        fontSize: 32,
        color: "#ffffff",
        stroke: "#321b0e",
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(1001)
      .setInteractive({ useHandCursor: true });
    this.pauseButton.on("pointerdown", () => this.togglePause());
    this.pauseLabel.on("pointerdown", () => this.togglePause());

    this.statusText = this.add
      .text(640, 690, t("game_unit_select_hint"), {
        fontFamily: "Arial Black",
        fontSize: 17,
        color: "#ffffff",
        stroke: "#111111",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(1200);

    this.aiText = this.add
      .text(640, 58, "", {
        fontFamily: "Arial Black",
        fontSize: 14,
        color: "#ffefbf",
        stroke: "#1b1109",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(1200);

    this.directorText = this.add
      .text(754, 19, "", {
        fontFamily: "Arial Black",
        fontSize: 13,
        color: "#ffe68a",
        stroke: "#1b1109",
        strokeThickness: 4,
      })
      .setOrigin(0, 0)
      .setDepth(1200);

    this.warningText = this.add
      .text(640, 96, "", {
        fontFamily: "Arial Black",
        fontSize: 22,
        color: "#ffefbf",
        stroke: "#1b1109",
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(1250);

    this.pendingBatchBack = this.add
      .rectangle(640, 121, 310, 52, 0x101827, 0.86)
      .setStrokeStyle(4, 0xfff1a6)
      .setDepth(1260)
      .setVisible(false);
    this.pendingBatchText = this.add
      .text(640, 120, "", {
        fontFamily: "Arial Black",
        fontSize: 24,
        color: "#fff1a6",
        stroke: "#000000",
        strokeThickness: 6,
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(1261)
      .setVisible(false);

    this.debugText = this.add
      .text(132, 10, "", {
        fontFamily: "Arial",
        fontSize: 13,
        color: "#1b1b1b",
        backgroundColor: "#ffffffaa",
        padding: { x: 6, y: 4 },
      })
      .setDepth(1200);

    const debugEnabled = new URLSearchParams(window.location.search).has(
      "debug",
    );
    this.debugText.setVisible(debugEnabled);
    this.input.keyboard?.on("keydown-D", () => {
      this.debugText.setVisible(!this.debugText.visible);
    });

    this.onlinePerformanceText = this.add.text(
      this.isOnline ? 690 : 505,
      8,
      this.isOnline ? "FPS --  ·  SERVER -- MS" : "FPS --",
      {
        fontFamily: "Arial Black",
        fontSize: 13,
        color: "#dff7ff",
        backgroundColor: "#07101acc",
        stroke: "#07101a",
        strokeThickness: 3,
        padding: { x: 7, y: 4 },
      },
    ).setDepth(1220);
  }

  private updateOnlinePerformanceOverlay(now: number, delta: number) {
    if (!this.onlinePerformanceText) return;

    if (this.isOnline && import.meta.env.VITE_ONLINE_PERF_TELEMETRY === "1") {
      const frameMs = this.onlinePerfLastFrameAt > 0
        ? Math.max(0, now - this.onlinePerfLastFrameAt)
        : Math.max(0, delta);
      this.onlinePerfLastFrameAt = now;
      this.onlinePerfFrameSamples[this.onlinePerfSampleIndex] = frameMs;
      this.onlinePerfSampleIndex = (this.onlinePerfSampleIndex + 1) % this.onlinePerfFrameSamples.length;
      this.onlinePerfSampleCount = Math.min(this.onlinePerfSampleCount + 1, this.onlinePerfFrameSamples.length);
    }

    if (now < this.onlinePerfNextUiAt) return;
    this.onlinePerfNextUiAt = now + 500;
    const fps = Math.max(0, Math.round(this.game.loop.actualFps));
    if (!this.isOnline) {
      this.setTextIfChanged(this.onlinePerformanceText, `FPS ${fps}`);
      return;
    }
    const latency = NetworkClient.getInstance().latencyMs;
    const serverMs = latency === null ? "--" : String(Math.max(0, Math.round(latency)));
    this.setTextIfChanged(this.onlinePerformanceText, `FPS ${fps}  ·  SERVER ${serverMs} MS`);

    if (import.meta.env.VITE_ONLINE_PERF_TELEMETRY !== "1" || now < this.onlinePerfNextLogAt) return;
    this.onlinePerfNextLogAt = now + 10_000;
    const samples = Array.from(this.onlinePerfFrameSamples.subarray(0, this.onlinePerfSampleCount))
      .sort((left, right) => left - right);
    const percentile = (ratio: number) => samples[Math.min(samples.length - 1, Math.floor(samples.length * ratio))] ?? 0;
    const report = {
      roomId: this.roomId,
      side: this.localPlayerSide,
      elapsedMs: Math.round(this.elapsedMs),
      fps,
      p50Ms: Math.round(percentile(0.5) * 100) / 100,
      p95Ms: Math.round(percentile(0.95) * 100) / 100,
      p99Ms: Math.round(percentile(0.99) * 100) / 100,
      serverMs: latency === null ? null : Math.round(latency * 10) / 10,
      units: this.units.length,
      castleHp: {
        left: Math.round(this.playerCastle.hp * 10) / 10,
        right: Math.round(this.enemyCastle.hp * 10) / 10,
      },
      castleAttackers: this.units.reduce(
        (count, unit) => count + (unit.state === "attackCastle" ? 1 : 0),
        0,
      ),
      snapshotSeq: this.onlineLastSnapshotSequence,
    };
    (window as typeof window & { __CASTLE_ONLINE_PERF__?: typeof report }).__CASTLE_ONLINE_PERF__ = report;
    const line = `[CastleOnlinePerf] ${JSON.stringify(report)}`;
    console.log(line);
    (window as typeof window & { CastlePerfNative?: { log(value: string): void } }).CastlePerfNative?.log(
      `[CastlePerf][ONLINE] ${JSON.stringify(report)}`,
    );
  }

  private createOnlineSideIdentity() {
    const isLeft = this.localPlayerSide === "left";
    const panelX = isLeft ? 59 : 1221;
    const teamColor = isLeft ? 0x1978bd : 0xb42d35;
    // The arrow points toward the opponent's castle. Keep this online-only:
    // offline mode has no local-side identity banner.
    const direction = isLeft ? "→" : "←";

    const badgeBack = this.add
      .rectangle(panelX, 72, 78, 25, teamColor, 0.98)
      .setStrokeStyle(3, 0xffd86a, 0.96)
      .setDepth(1100);
    const badgeText = this.add
      .text(panelX, 72, "YOU", {
        fontFamily: "Arial Black",
        fontSize: 13,
        color: "#ffffff",
        stroke: "#1b1109",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(1101);
    badgeBack.setData("online-side", this.localPlayerSide);
    badgeText.setData("online-side", this.localPlayerSide);

    const panelFlash = this.add
      .rectangle(panelX, 360, 108, 710, teamColor, 0.05)
      .setStrokeStyle(5, 0xffdf7a, 0.95)
      .setDepth(1090);
    this.tweens.add({
      targets: panelFlash,
      alpha: 0,
      duration: 1_050,
      ease: "Sine.Out",
      onComplete: () => panelFlash.destroy(),
    });

    const bannerBack = this.add
      .rectangle(640, 154, 430, 82, 0x24170f, 0.96)
      .setStrokeStyle(5, 0xffd86a, 0.96);
    const bannerColor = this.add.rectangle(isLeft ? 468 : 812, 154, 78, 72, teamColor, 0.96);
    const bannerText = this.add.text(640, 154, isLeft
      ? `YOU ARE LEFT   YOU ${direction} OPPONENT`
      : `OPPONENT ${direction} YOU   YOU ARE RIGHT`, {
      fontFamily: "Arial Black",
      fontSize: 27,
      color: "#ffffff",
      stroke: "#160c08",
      strokeThickness: 6,
    }).setOrigin(0.5);
    const banner = this.add
      .container(0, -24, [bannerBack, bannerColor, bannerText])
      .setDepth(1500)
      .setAlpha(0);
    this.tweens.add({
      targets: banner,
      y: 0,
      alpha: 1,
      duration: 180,
      ease: "Back.Out",
      onComplete: () => {
        this.time.delayedCall(900, () => {
          if (!banner.active) return;
          this.tweens.add({
            targets: banner,
            y: -18,
            alpha: 0,
            duration: 320,
            ease: "Sine.In",
            onComplete: () => banner.destroy(),
          });
        });
      },
    });
  }

  private createOnlineEmoteUi() {
    (window as typeof window & { __CASTLE_ONLINE_EMOTE_QA__?: OnlineEmoteQaState })
      .__CASTLE_ONLINE_EMOTE_QA__ = this.onlineEmoteQaState;
    const isLeft = this.localPlayerSide === "left";
    const teamAsset = isLeft ? "blue" : "red";
    const toggleX = isLeft ? 151 : 1129;
    const toggleY = 654;
    const teamColor = isLeft ? 0x1978bd : 0xb42d35;
    const toggleBack = this.add
      .circle(toggleX, toggleY, 34, 0x24170f, 0.98)
      .setStrokeStyle(4, teamColor)
      .setInteractive({ useHandCursor: true });
    const toggleIcon = this.add
      .image(toggleX, toggleY - 3, `online-emote-${teamAsset}-laugh`)
      .setDisplaySize(57, 57)
      .setInteractive({ useHandCursor: true });
    const toggleLabel = this.add.text(toggleX, toggleY + 28, "EMOTE", {
      fontFamily: "Arial Black",
      fontSize: 8,
      color: "#fff1b8",
      stroke: "#1b1109",
      strokeThickness: 3,
    }).setOrigin(0.5);
    const toggle = this.add.container(0, 0, [toggleBack, toggleIcon, toggleLabel]).setDepth(1320);
    toggle.setData("online-emote-toggle", true);

    const emoteObjects: Phaser.GameObjects.GameObject[] = [];
    const emotes = ["laugh", "grin", "cry", "worry"] as const;
    emotes.forEach((emote, index) => {
      const x = isLeft ? 219 + index * 72 : 1061 - index * 72;
      const y = 602;
      const back = this.add
        .circle(x, y, 32, 0x24170f, 0.98)
        .setStrokeStyle(4, teamColor)
        .setInteractive({ useHandCursor: true });
      const icon = this.add
        .image(x, y, `online-emote-${teamAsset}-${emote}`)
        .setDisplaySize(58, 58)
        .setInteractive({ useHandCursor: true });
      back.setData("online-emote-id", emote);
      icon.setData("online-emote-id", emote);
      const send = (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event?: { stopPropagation: () => void },
      ) => {
        event?.stopPropagation();
        this.sendOnlineEmote(emote);
      };
      back.on("pointerdown", send);
      icon.on("pointerdown", send);
      emoteObjects.push(back, icon);
    });
    this.onlineEmoteTray = this.add.container(0, 0, emoteObjects).setDepth(1321).setVisible(false);

    const toggleTray = (
      _pointer: Phaser.Input.Pointer,
      _localX: number,
      _localY: number,
      event?: { stopPropagation: () => void },
    ) => {
      event?.stopPropagation();
      this.onlineEmoteTray?.setVisible(!this.onlineEmoteTray.visible);
    };
    toggleBack.on("pointerdown", toggleTray);
    toggleIcon.on("pointerdown", toggleTray);
  }

  private sendOnlineEmote(emote: OnlineEmoteId) {
    if (!this.onlineMatchStarted || !this.onlineRuntime) {
      this.statusText.setText(t("game_online_arena_waiting"));
      return;
    }
    if (this.time.now < this.onlineEmoteCooldownUntil) return;
    this.onlineEmoteCooldownUntil = this.time.now + 1_200;
    this.onlineEmoteTray?.setVisible(false);
    this.onlineEmoteQaState.sent.push(emote);
    this.onlineRuntime.sendEmote(emote);
    this.log("ONLINE_EMOTE", `sent side=${this.localPlayerSide} emote=${emote}`);
  }

  private receiveOnlineEmote(event: OnlineEmoteEvent) {
    if (!this.isOnline || event.roomId !== this.roomId) return;
    this.onlineEmoteQaState.received.push({ side: event.side, emote: event.emote });
    this.log("ONLINE_EMOTE", `received side=${event.side} emote=${event.emote} sequence=${event.sequence}`);
    this.renderOnlineEmote(event);
  }

  private renderOnlineEmote(event: OnlineEmoteEvent) {
    this.onlineEmoteBubbles.get(event.side)?.destroy();
    const isLeft = event.side === "left";
    const x = isLeft ? 202 : 1078;
    const y = 150;
    const teamColor = isLeft ? 0x1978bd : 0xb42d35;
    const teamAsset = isLeft ? "blue" : "red";
    const shadow = this.add.circle(x + 4, y + 5, 65, 0x000000, 0.35);
    const back = this.add.circle(x, y, 63, 0xfff3d1, 0.98).setStrokeStyle(5, teamColor);
    const tail = this.add.triangle(
      x + (isLeft ? -45 : 45),
      y + 53,
      0, 0,
      isLeft ? -24 : 24, 32,
      isLeft ? 12 : -12, 18,
      0xfff3d1,
      0.98,
    ).setStrokeStyle(4, teamColor);
    const icon = this.add
      .image(x, y - 2, `online-emote-${teamAsset}-${event.emote}`)
      .setDisplaySize(112, 112);
    const bubble = this.add
      .container(0, 0, [shadow, tail, back, icon])
      .setDepth(1510)
      .setScale(0.2)
      .setAlpha(0);
    this.onlineEmoteBubbles.set(event.side, bubble);
    this.tweens.add({ targets: bubble, scale: 1, alpha: 1, duration: 220, ease: "Back.Out" });
    this.time.delayedCall(2_350, () => {
      if (!bubble.active) return;
      this.tweens.add({
        targets: bubble,
        scale: 0.8,
        alpha: 0,
        duration: 260,
        ease: "Sine.In",
        onComplete: () => {
          if (this.onlineEmoteBubbles.get(event.side) === bubble) this.onlineEmoteBubbles.delete(event.side);
          bubble.destroy();
        },
      });
    });
  }

  private createEditorPreviewExit() {
    if (!this.editorPreview || this.editorReturnScene !== "MapEditor") {
      return;
    }

    const back = this.add
      .rectangle(640, 660, 214, 42, 0x203447, 0.96)
      .setStrokeStyle(3, 0x7fe7ff)
      .setDepth(1400)
      .setInteractive({ useHandCursor: true });
    const label = this.add
      .text(640, 660, t("game_return_to_editor"), {
        fontFamily: "Arial Black",
        fontSize: 17,
        color: "#e9fbff",
      })
      .setOrigin(0.5)
      .setDepth(1401)
      .setInteractive({ useHandCursor: true });
    const returnToEditor = () => {
      stopSceneMusic(this, "battle-music");
      this.scene.start("MapEditor", { mapId: this.levelRuntime.map.id });
    };
    back.on("pointerdown", returnToEditor);
    label.on("pointerdown", returnToEditor);
  }

  private setupEconomyQaMode() {
    if (!this.economyQaMode) {
      return;
    }

    this.gold = 0;
    this.enemyGold = 0;
    this.selectedUnit = undefined;
    this.pendingDeployCounts = {};
    this.spawnStripe.setVisible(false);
    this.spawnMarker.setVisible(false);
    this.nextPassiveIncomeAt = this.elapsedMs + PASSIVE_INCOME_MS;
    this.qaLog(
      `START route=${window.location.pathname} seed=${this.mapSeed} passive=${PASSIVE_INCOME_MS}ms workerCost=${UNIT_CONFIGS.peasant.cost}`,
    );
    this.qaLog(`AI disabled, player/enemy gold reset to ${this.gold}/0`);
    const deliveryPayments = [1, 2, 3].map((wood) => this.workerDeliveryGold(wood));
    this.economyQaDeliveryPassed = deliveryPayments.join(",") === "2,4,6";
    this.economyQaWorkerCapPassed =
      this.currentWorkerCap() === 3 &&
      this.levelRuntime.level.economy.resourceRespawnMs === 12_000;
    this.qaLog(
      `${this.economyQaDeliveryPassed ? "PASS" : "FAIL"} partial deliveries=${deliveryPayments.join("/")} expected=2/4/6`,
    );
    this.qaLog(
      `${this.economyQaWorkerCapPassed ? "PASS" : "FAIL"} workerCap=${this.currentWorkerCap()} respawn=${this.levelRuntime.level.economy.resourceRespawnMs}ms`,
    );

    this.time.delayedCall(350, () => this.runEconomyQaWorkerDeathCase());
    this.time.delayedCall(PASSIVE_INCOME_MS * 2 + ECONOMY_TICK_MS + 650, () =>
      this.assertEconomyQaPassiveRecovery(),
    );
    this.updateUi();
  }

  private runEconomyQaWorkerDeathCase() {
    if (!this.economyQaMode || this.battleEnded) {
      return;
    }

    const goldBefore = this.gold;
    const workerId = this.unitId;
    this.spawnUnit(
      "player",
      "peasant",
      (this.levelRuntime.map.deployZone.minY +
        this.levelRuntime.map.deployZone.maxY) /
        2,
      this.levelRuntime.map.deployZone.x,
    );
    const worker = this.units.find((unit) => unit.id === workerId);

    if (!worker) {
      this.economyQaDeathDenialPassed = false;
      this.qaLog("FAIL worker spawn missing");
      this.finishEconomyQaIfReady();
      return;
    }

    worker.state = "returnResource";
    worker.targetResourceId = undefined;
    worker.carryWood = 2;
    worker.hp = 0;
    this.qaLog(
      `CASE kill worker id=${worker.id} carrying=${worker.carryWood} goldBefore=${goldBefore}`,
    );
    this.time.delayedCall(250, () =>
      this.assertEconomyQaWorkerDeathDenial(goldBefore),
    );
  }

  private assertEconomyQaWorkerDeathDenial(goldBefore: number) {
    const expectedGold = goldBefore;
    this.economyQaDeathDenialPassed = this.gold === expectedGold;
    this.qaLog(
      `${this.economyQaDeathDenialPassed ? "PASS" : "FAIL"} worker death loses cargo gold=${this.gold} expected=${expectedGold}`,
    );
  }

  private assertEconomyQaPassiveRecovery() {
    if (this.economyQaFinished) {
      return;
    }

    const expectedGold = 2;
    this.economyQaPassivePassed = this.gold === expectedGold && this.enemyGold === expectedGold;
    this.economyQaCanTrainPassed = this.gold >= UNIT_CONFIGS.peasant.cost;
    const canRetry =
      (!this.economyQaPassivePassed || !this.economyQaCanTrainPassed) &&
      this.elapsedMs < PASSIVE_INCOME_MS * 2 + ECONOMY_TICK_MS + 1800;
    this.qaLog(
      `${this.economyQaPassivePassed ? "PASS" : canRetry ? "WAIT" : "FAIL"} symmetric passive banks=${this.gold}/${this.enemyGold} expected>=${expectedGold}`,
    );
    this.qaLog(
      `${this.economyQaCanTrainPassed ? "PASS" : canRetry ? "WAIT" : "FAIL"} worker can be bought again gold=${this.gold} cost=${UNIT_CONFIGS.peasant.cost}`,
    );

    if (canRetry) {
      this.time.delayedCall(500, () => this.assertEconomyQaPassiveRecovery());
      return;
    }

    this.finishEconomyQaIfReady();
  }

  private finishEconomyQaIfReady() {
    if (this.economyQaFinished) {
      return;
    }

    const passed =
      this.economyQaDeathDenialPassed &&
      this.economyQaPassivePassed &&
      this.economyQaCanTrainPassed &&
      this.economyQaDeliveryPassed &&
      this.economyQaWorkerCapPassed;

    if (
      !passed &&
      !this.economyQaPassivePassed &&
      this.elapsedMs < PASSIVE_INCOME_MS * 2 + ECONOMY_TICK_MS + 1800
    ) {
      this.time.delayedCall(500, () => this.assertEconomyQaPassiveRecovery());
      return;
    }

    this.economyQaFinished = true;
    this.qaLog(
      `${passed ? "PASS" : "FAIL"} complete gold=${this.gold} activeWorkers=${this.activeWorkerCount("player")}/${this.currentWorkerCap()}`,
    );
  }

  private qaLog(message: string) {
    const stamp = `${(this.elapsedMs / 1000).toFixed(1)}s`;
    this.log("ECON_QA", `${stamp} ${message}`);
  }

  private togglePause() {
    if (this.battleEnded) return;
    if (this.isOnline) {
      this.openOnlineLeaveDialog();
      return;
    }
    if (this.isPaused) {
      this.destroyPauseOverlay();
      this.setGamePaused(false);
      return;
    }
    this.openPauseMenu();
  }

  private setGamePaused(paused: boolean) {
    if (this.battleEnded || this.isPaused === paused) {
      return;
    }

    this.isPaused = paused;
    this.time.paused = paused;
    this.pauseButton.setFillStyle(paused ? 0x4d2d17 : 0x6a3d1f);
    this.pauseLabel.setText(paused ? ">" : "II");

    if (paused) {
      this.tweens.pauseAll();
      this.statusText.setText(t("game_paused"));
      return;
    }

    this.tweens.resumeAll();
    this.statusText.setText(t("game_resumed"));
  }

  private getDeployClickBounds() {
    const zone = this.playerDeployZone || this.levelRuntime.map.deployZone;
    if (this.isOnline && this.onlineGeometry) {
      const guide = deploymentGuideBounds(this.onlineGeometry);
      return {
        zone,
        leftX: guide.minX,
        rightX: guide.maxX,
        width: Math.max(1, guide.maxX - guide.minX),
        centerX: (guide.minX + guide.maxX) / 2,
        centerY: (guide.minY + guide.maxY) / 2,
        height: Math.max(1, guide.maxY - guide.minY),
        minY: guide.minY,
        maxY: guide.maxY,
      };
    }
    const isRightPlayer = this.isOnline && this.localPlayerSide === "right";
    const limits = this.localDeployXLimits(zone);

    // Keep the castle-side click area useful without letting the +X side span
    // across the whole right edge of the world.
    const leftX = isRightPlayer ? zone.x - 12 : 0;
    const untrimmedRightX = isRightPlayer
      ? Math.min(WORLD_RIGHT, limits.maxX + CASTLE_SIDE_DEPLOY_CLICK_EXTENSION_X)
      : zone.x + 12;
    const rightX = Math.max(leftX + 1, untrimmedRightX - DEPLOY_POSITIVE_X_REDUCTION);
    const width = Math.max(1, rightX - leftX);
    const centerX = (leftX + rightX) / 2;
    const centerY = (zone.minY + zone.maxY) / 2;
    const height = Math.max(1, zone.maxY - zone.minY);

    return {
      zone,
      leftX,
      rightX,
      width,
      centerX,
      centerY,
      height,
      minY: zone.minY,
      maxY: zone.maxY,
    };
  }

  private localDeployXLimits(zone = this.playerDeployZone || this.levelRuntime.map.deployZone) {
    if (this.isOnline && this.onlineGeometry) {
      return { minX: this.onlineGeometry.deploy.minX, maxX: this.onlineGeometry.deploy.maxX };
    }
    const minX = zone.x - zone.width / 2;
    const maxX = zone.x + zone.width / 2;
    const positiveEdgeInset = this.isOnline && this.localPlayerSide === "right"
      ? RIGHT_SIDE_DEPLOY_EDGE_INSET_X
      : 0;

    return {
      minX,
      maxX: Math.max(minX, maxX - positiveEdgeInset),
    };
  }

  private homeCastleForTeam(team: Team) {
    return team === "player" ? this.playerCastle : this.enemyCastle;
  }

  private opponentCastleForTeam(team: Team) {
    return team === "player" ? this.enemyCastle : this.playerCastle;
  }

  private homeDeployZoneForTeam(team: Team) {
    return team === "player"
      ? this.levelRuntime.map.deployZone
      : this.levelRuntime.map.enemySpawnZone;
  }

  private opponentDeployZoneForTeam(team: Team) {
    return team === "player"
      ? this.levelRuntime.map.enemySpawnZone
      : this.levelRuntime.map.deployZone;
  }

  private createSpawnGuide() {
    this.ensureDeploymentTexture();
    const bounds = this.getDeployClickBounds();
    const { zone, centerY } = bounds;
    this.spawnStripe = this.add
      .image(bounds.centerX, centerY, DEPLOY_TEXTURE_KEY)
      .setDisplaySize(bounds.width, bounds.height)
      .setDepth(12)
      .setAlpha(0.72)
      .setVisible(false);
    this.spawnStripe.setInteractive({ useHandCursor: true });
    this.spawnStripe.on(
      "pointerdown",
      (
        pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event?: { stopPropagation: () => void },
      ) => {
        event?.stopPropagation();
        this.handleDeployPointer(pointer, "stripe-down");
      },
    );

    this.spawnMarker = this.add
      .rectangle(zone.x, centerY, 1, 1, 0x27d6f0, 0)
      .setDepth(27)
      .setVisible(false);

    this.missileAimGuide = this.add
      .rectangle(zone.x, centerY, 1, 6, 0x35120d, 0.74)
      .setOrigin(0, 0.5)
      .setDepth(1220)
      .setVisible(false);
    this.missileAimFill = this.add
      .rectangle(zone.x, centerY, 1, 6, 0xffc247, 0.92)
      .setOrigin(0, 0.5)
      .setDepth(1221)
      .setVisible(false);
    this.missileAimReticle = this.add
      .image(this.missileHomeTargetX(this.isOnline && this.localPlayerSide === "right" ? -1 : 1, zone), centerY, "effect_runic_circle")
      .setTint(0xff6a2f)
      .setScale(0.48)
      .setAlpha(0.82)
      .setDepth(1224)
      .setVisible(false);
    this.missileAimPercentText = this.add
      .text(this.missileHomeTargetX(this.isOnline && this.localPlayerSide === "right" ? -1 : 1, zone), centerY - 42, "0%", {
        fontFamily: "Arial Black",
        fontSize: 15,
        color: "#fff4c2",
        stroke: "#24110b",
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(1225)
      .setVisible(false);

    const padBack = this.add.circle(0, 0, 28, 0x8e7656)
      .setStrokeStyle(4, 0x3a281b);
    const padInner = this.add.circle(0, 0, 20, 0xd33b2f)
      .setStrokeStyle(3, 0x6f563b);
    const padIcon = this.add.text(0, -1, "➤", {
      fontFamily: "Arial Black",
      fontSize: 23,
      color: "#ffffff",
      stroke: "#1b1109",
      strokeThickness: 4,
    }).setOrigin(0.5);
    this.missileAimPad = this.add.container(zone.x, centerY, [padBack, padInner, padIcon])
      .setDepth(1223)
      .setSize(60, 60)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.missileAimPad.on(
      "pointerdown",
      (
        pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event?: { stopPropagation: () => void },
      ) => {
        event?.stopPropagation();
        this.handleDeployPointer(pointer, "missile-pad-down");
      },
    );
  }

  private ensureDeploymentTexture() {
    if (this.textures.exists(DEPLOY_TEXTURE_KEY)) {
      return;
    }

    const { width, height } = this.getDeployClickBounds();
    const textureWidth = Math.max(1, Math.round(width));
    const textureHeight = Math.max(1, Math.round(height));
    const texture = this.textures.createCanvas(DEPLOY_TEXTURE_KEY, textureWidth, textureHeight);

    if (!texture) {
      const graphics = this.add.graphics();
      graphics.fillStyle(0x5ee5f4, 0.24);
      graphics.fillRect(0, 0, textureWidth, textureHeight);
      graphics.generateTexture(DEPLOY_TEXTURE_KEY, textureWidth, textureHeight);
      graphics.destroy();
      return;
    }

    const ctx = texture.getContext();

    ctx.clearRect(0, 0, textureWidth, textureHeight);
    ctx.fillStyle = "rgba(94, 229, 244, 0.24)";
    ctx.fillRect(0, 0, textureWidth, textureHeight);
    ctx.save();
    ctx.translate(-textureHeight * 0.38, textureHeight * 0.12);
    ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = "rgba(255, 255, 255, 0.58)";

    for (
      let x = -textureHeight;
      x < textureHeight + textureWidth;
      x += 52
    ) {
      ctx.fillRect(x, -textureWidth, 24, textureHeight * 2);
    }

    ctx.restore();
    texture.refresh();
  }

  private enableDeploymentInput() {
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.missileAimPointerId === pointer.id) {
        const world = this.pointerWorld(pointer);
        this.missileAimY = clamp(world.y, 72, 648);
        this.updateMissileAim();
        return;
      }

      if (!this.selectedUnit && !this.activePower) {
        return;
      }

      const world = this.pointerWorld(pointer);
      const zone = this.playerDeployZone || this.levelRuntime.map.deployZone;
      this.heldDeployX = world.x;
      this.heldDeployY = clamp(
        world.y,
        zone.minY,
        zone.maxY,
      );

      if (this.selectedUnit) {
        const resolved = this.onlineGeometry
          ? resolveDeploymentClick(this.onlineGeometry, world.x, world.y)
          : undefined;
        this.spawnMarker.x = resolved?.x ?? world.x;
        this.spawnMarker.y = this.heldDeployY;
        if (this.isPointInDeployZone(world.x, world.y)) {
          this.spawnMarker.setVisible(true);
        }
      }
    });

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.handleDeployPointer(pointer, "world-down");
    });

    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (this.missileAimPointerId === pointer.id) {
        this.finishMissileAim();
        return;
      }

      if (this.deployPointerId === pointer.id) {
        this.stopHeldDeployment();
      }
    });

    this.input.on("pointerupoutside", (pointer: Phaser.Input.Pointer) => {
      if (this.missileAimPointerId === pointer.id) {
        this.finishMissileAim();
        return;
      }

      if (this.deployPointerId === pointer.id) {
        this.stopHeldDeployment();
      }
    });
  }

  private handleDeployPointer(pointer: Phaser.Input.Pointer, source: string) {
    if (this.battleEnded || this.isPaused) {
      return;
    }
    if (this.isOnlineWaitingForStart()) {
      this.statusText.setText(t("game_online_arena_waiting"));
      return;
    }

    const world = this.pointerWorld(pointer);
    const zone = this.playerDeployZone || this.levelRuntime.map.deployZone;
    this.heldDeployX = world.x;
    this.heldDeployY = clamp(
      world.y,
      zone.minY,
      zone.maxY,
    );

    if (this.activePower) {
      if (this.activePower === "missile") {
        if (!this.isPointInWorld(world.x, world.y) && source !== "missile-pad-down") {
          return;
        }
        this.beginMissileAim(pointer, world.y);
      } else {
        this.tryCastPower(this.activePower, world.x, world.y);
      }
      return;
    }

    if (!this.selectedUnit) {
      return;
    }

    if (!this.isPointInWorld(world.x, world.y)) {
      this.stopHeldDeployment();
      return;
    }

    if (!this.isPointInDeployZone(world.x, world.y)) {
      this.stopHeldDeployment();
      this.statusText.setText(t("game_place_unit_hint"));
      this.log(
        "DEPLOY",
        `outside lane ${source} x=${Math.round(world.x)} y=${Math.round(world.y)}`,
      );
      return;
    }

    this.spawnMarker.y = this.heldDeployY;
    if (this.onlineGeometry) {
      const resolved = resolveDeploymentClick(this.onlineGeometry, world.x, world.y);
      if (resolved) this.spawnMarker.setPosition(resolved.x, resolved.y);
    }
    this.spawnMarker.setVisible(true);
    this.log(
      "DEPLOY",
      `${source} ${this.selectedUnit} x=${Math.round(world.x)} y=${Math.round(this.heldDeployY)}`,
    );

    const spawned = this.deployPendingBatch(world.x, this.heldDeployY);

    if (spawned > 0) {
      this.stopHeldDeployment();
      this.updateUi();
    }
  }

  private isPointInWorld(x: number, y: number) {
    return x > WORLD_LEFT && x < WORLD_RIGHT && y > 52 && y < 668;
  }

  private isPointInDeployZone(x: number, y: number) {
    if (this.isOnline && this.onlineGeometry) {
      const resolved = resolveDeploymentClick(this.onlineGeometry, x, y);
      return Boolean(resolved);
    }
    const { zone, leftX, rightX, minY, maxY } = this.getDeployClickBounds();
    const inside = (
      x >= leftX &&
      x <= rightX &&
      y >= minY &&
      y <= maxY
    );
    return inside && !this.tiledNavigation?.cellAtWorld(zone.x, y).blocksDeploy;
  }

  private stopHeldDeployment() {
    this.deployPointerHeld = false;
    this.deployPointerId = undefined;
    this.nextHeldDeployAt = 0;
  }

  private handleUnitButtonPointer(type: UnitType, pointer: Phaser.Input.Pointer) {
    void pointer;

    if (this.battleEnded || this.isPaused) {
      return;
    }
    if (this.isOnlineWaitingForStart()) {
      this.statusText.setText(t("game_online_arena_waiting"));
      return;
    }

    // Castle Raid style queue-deploy: every left-menu tap adds exactly one
    // unit to the pending group if gold and cap allow it. No unit, including
    // workers, is spawned from the menu. The whole queued group is placed only
    // when the player taps inside the turquoise deployment zone.
    const queued = this.queueDeployUnit(type);
    if (!queued) {
      this.updateUi();
      return;
    }

    this.statusText.setText(
      `${this.pendingDeploySummary()} queued. Place it anywhere in the turquoise area.`,
    );
  }

  private nextAutoDeployY(_type: UnitType) {
    const zone = this.playerDeployZone || this.levelRuntime.map.deployZone;
    const lane = this.levelRuntime.map.lanes[
      this.autoDeployLaneIndex % this.levelRuntime.map.lanes.length
    ];
    const y = laneYAtX(lane, zone.x);
    this.autoDeployLaneIndex += 1;
    return clamp(y + this.mapRandomInt(-8, 8), zone.minY, zone.maxY);
  }

  private updateHeldDeployment() {
    if (
      !this.deployPointerHeld ||
      !this.selectedUnit ||
      this.elapsedMs < this.nextHeldDeployAt
    ) {
      return;
    }

    if (
      !this.isPointInWorld(this.heldDeployX, this.heldDeployY) ||
      !this.isPointInDeployZone(this.heldDeployX, this.heldDeployY)
    ) {
      this.stopHeldDeployment();
      return;
    }

    // Holding inside the deployment zone must not create extra units. The queued
    // group is deployed by the initial pointerdown only, so the player has full
    // control over the exact drop point.
    this.stopHeldDeployment();
  }

  private pointerWorld(pointer: Phaser.Input.Pointer) {
    const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    return { x: point.x, y: point.y };
  }

  private beginMissileAim(pointer: Phaser.Input.Pointer, y: number) {
    if (!this.activePower || this.activePower !== "missile") return;
    if (this.missileAimPointerId !== undefined) return;

    this.missileAimPointerId = pointer.id;
    this.missileAimStartedAt = this.missileAimClockMs();
    this.missileAimY = clamp(y, 72, 648);
    this.statusText.setText(t("game_online_hold_bomb"));
    this.updateMissileAim();
  }

  private finishMissileAim() {
    if (this.activePower !== "missile" || this.missileAimPointerId === undefined) {
      this.cancelMissileAim();
      return;
    }

    const target = this.currentMissileAimTarget();
    this.tryCastPower("missile", target.x, target.y);
    this.cancelMissileAim();
  }

  private cancelMissileAim() {
    this.missileAimPointerId = undefined;
    this.missileAimStartedAt = 0;
    this.missileAimPad?.setVisible(false);
    this.missileAimGuide?.setVisible(false);
    this.missileAimFill?.setVisible(false);
    this.missileAimReticle?.setVisible(false);
    this.missileAimPercentText?.setVisible(false);
  }

  private missileAimClockMs() {
    return this.isOnline ? performance.now() : this.elapsedMs;
  }

  private currentMissileAimTarget() {
    const direction = this.isOnline && this.localPlayerSide === "right" ? -1 : 1;
    const startX = this.missileHomeTargetX(direction);
    const endX = this.onlineOpponentGeometry
      ? (this.onlineOpponentGeometry.castleLineX ?? (this.localPlayerSide === "left" ? this.onlineOpponentGeometry.castle.minX : this.onlineOpponentGeometry.castle.maxX))
      : this.enemyCastle.x;
    const charge = this.missileAimPointerId === undefined
      ? 0
      : clamp((this.missileAimClockMs() - this.missileAimStartedAt) / PLAYER_MISSILE_CHARGE_MS, 0, 1);
    return {
      x: startX + (endX - startX) * charge,
      y: this.missileAimY,
      charge,
    };
  }

  private missileHomeTargetX(direction: 1 | -1) {
    if (this.onlineGeometry) {
      return this.onlineGeometry.castleLineX ?? (
        (this.localPlayerSide === "left" ? this.onlineGeometry.castle.maxX : this.onlineGeometry.castle.minX) +
        direction * PLAYER_MISSILE_CASTLE_CLEARANCE
      );
    }
    return this.playerCastle.x;
  }

  private updateMissileAim() {
    if (!this.missileAimPad || !this.missileAimGuide || !this.missileAimFill || !this.missileAimReticle || !this.missileAimPercentText) return;

    const visible = this.activePower === "missile";
    if (
      !visible &&
      !this.missileAimPad.visible &&
      !this.missileAimGuide.visible &&
      !this.missileAimFill.visible &&
      !this.missileAimReticle.visible &&
      !this.missileAimPercentText.visible
    ) {
      return;
    }
    if (!visible) {
      this.cancelMissileAim();
      return;
    }

    const centerY = this.missileAimPointerId === undefined
      ? ((this.playerDeployZone || this.levelRuntime.map.deployZone).minY + (this.playerDeployZone || this.levelRuntime.map.deployZone).maxY) / 2
      : this.missileAimY;
    const direction = this.isOnline && this.localPlayerSide === "right" ? -1 : 1;
    const startX = this.missileHomeTargetX(direction);
    const endX = this.onlineOpponentGeometry
      ? (this.onlineOpponentGeometry.castleLineX ?? (this.localPlayerSide === "left" ? this.onlineOpponentGeometry.castle.minX : this.onlineOpponentGeometry.castle.maxX))
      : this.enemyCastle.x;
    const target = this.currentMissileAimTarget();

    this.missileAimPad
      .setVisible(visible && this.missileAimPointerId === undefined)
      .setPosition(startX, centerY);
    this.missileAimGuide
      .setVisible(visible)
      .setPosition(startX, centerY)
      .setOrigin(direction === 1 ? 0 : 1, 0.5)
      .setDisplaySize(Math.abs(endX - startX), 6);
    this.missileAimFill
      .setVisible(visible)
      .setPosition(startX, centerY)
      .setOrigin(direction === 1 ? 0 : 1, 0.5)
      .setDisplaySize(Math.max(1, Math.abs(endX - startX) * target.charge), 6);
    this.missileAimReticle
      .setVisible(visible)
      .setPosition(target.x, target.y)
      .setAlpha(this.missileAimPointerId === undefined ? 0.58 : 0.92);
    this.missileAimPercentText
      .setVisible(visible)
      .setPosition(target.x, target.y - 42)
      .setText(this.missileAimPointerId === undefined ? "HOLD" : `${Math.round(target.charge * 100)}%`);
  }

  private selectUnit(type: UnitType) {
    if (this.isOnlineWaitingForStart()) {
      this.statusText.setText(t("game_online_arena_waiting"));
      return;
    }
    this.cancelMissileAim();
    this.activePower = undefined;
    this.selectedUnit = type;
    playAndroidHaptic("selection");
    this.spawnStripe.setVisible(true);
    this.spawnMarker.setVisible(true);
    this.spawnMarker.y = this.heldDeployY;
    this.statusText.setText(
      this.queuedUnitCount(type) > 0
        ? `${UNIT_CONFIGS[type].label} x${this.queuedUnitCount(type)} queued. Tap the turquoise area.`
        : `${UNIT_CONFIGS[type].label} selected. Tap again in the left menu to add more.`,
    );
    this.playSfx("select-sfx", 0.35);
    this.log("UI", `Selected ${type}`);
    this.updateUi();
  }

  private cancelUnitSelection(source: string) {
    const cancelledType = this.selectedUnit;
    const cancelledPower = this.activePower;
    const cancelledCount = this.pendingUnitCount();
    const hadSelection = cancelledCount > 0 || !!cancelledType || !!this.activePower;

    if (!hadSelection) {
      return;
    }

    this.refundPendingDeployQueue();
    this.selectedUnit = undefined;
    this.activePower = undefined;
    this.cancelMissileAim();
    this.spawnStripe.setVisible(false);
    this.spawnMarker.setVisible(false);
    this.stopHeldDeployment();
    this.statusText.setText(
      cancelledCount > 0
        ? `Unit selection cancelled. Gold refunded for ${cancelledCount} unit(s).`
        : cancelledPower
          ? `${cancelledPower === "missile" ? "MISSILE" : "ICE"} selection cancelled.`
          : "Unit selection cancelled.",
    );
    this.log(
      "UI",
      `Selection cancelled source=${source} type=${cancelledType ?? "power"} count=${cancelledCount}`,
    );
    this.updateUi();
  }

  private setupBackgroundPause() {
    if (this.balanceQaMode || this.isOnline) return;
    this.backgroundPauseHandler?.();
    const syncBackgroundPause = () => {
      // Android game overlays (notably Realme/OPlus GameSpace) can take window
      // focus while the WebView stays fully visible and interactive. Treating
      // blur/hasFocus as background state pauses a visible battle, blocks its
      // input and can create repeated pause/resume speed changes. Visibility is
      // the lifecycle signal that actually means the page left the foreground.
      if (document.hidden && !this.battleEnded && !this.isPaused) {
        this.pausedByBackground = true;
        this.setGamePaused(true);
        this.log("PAUSE", "automatic background pause");
      } else if (!document.hidden && this.pausedByBackground) {
        this.pausedByBackground = false;
        this.setGamePaused(false);
        this.log("PAUSE", "automatic foreground resume");
      }
    };
    document.addEventListener("visibilitychange", syncBackgroundPause);
    this.backgroundPauseHandler = () => {
      document.removeEventListener("visibilitychange", syncBackgroundPause);
      this.backgroundPauseHandler = undefined;
    };
    this.events.once("shutdown", () => this.backgroundPauseHandler?.());
  }

  private openPauseMenu() {
    if (this.pauseOverlay || this.battleEnded || this.isOnline) return;
    this.setGamePaused(true);
    const storyData = this.cache.json.get("campaign-story") as CampaignStoryData | undefined;
    const entry = storyData?.levels[this.levelRuntime.level.id];
    const shade = this.add.rectangle(640, 360, 1280, 720, 0x120805, 0.78)
      .setDepth(2000).setInteractive();
    const wood = this.add.rectangle(640, 360, 900, 560, 0x4a2715, 0.99)
      .setStrokeStyle(9, 0x2a130a).setDepth(2001);
    const parchment = this.add.rectangle(640, 344, 830, 440, 0xd8bd82, 0.98)
      .setStrokeStyle(5, 0xe9c968).setDepth(2002);
    const ribbon = this.add.rectangle(640, 142, 590, 68, 0x8f261f, 1)
      .setStrokeStyle(4, 0xe6bd55).setDepth(2003);
    const title = this.add.text(640, 141, "BATTLE PAUSED", {
      fontFamily: "Arial Black", fontSize: 30, color: "#fff0b3",
      stroke: "#2a0d08", strokeThickness: 6,
    }).setOrigin(0.5).setDepth(2004);
    const missionTitle = this.add.text(640, 205,
      `MISSION ${this.levelRuntime.level.order}: ${(entry?.title ?? this.levelRuntime.level.title).toUpperCase()}`, {
        fontFamily: "Arial Black", fontSize: 24, color: "#5a2418",
      }).setOrigin(0.5).setDepth(2004);
    const story = this.add.text(265, 252, entry?.body ?? this.levelRuntime.level.story.intro, {
      fontFamily: "Georgia", fontStyle: "italic", fontSize: 21, color: "#2d1b12",
      lineSpacing: 8, wordWrap: { width: 750, useAdvancedWrap: true },
    }).setDepth(2004);
    const objective = this.add.text(265, 390, `OBJECTIVE\n${entry?.objective ?? "Defeat the enemy stronghold."}`, {
      fontFamily: "Arial Black", fontSize: 20, color: "#7c241b", lineSpacing: 7,
      wordWrap: { width: 750, useAdvancedWrap: true },
    }).setDepth(2004);

    generateRectTexture(this, "pause_menu_btn", 300, 66, 0x5a351d, 1, 5, 0xffd45f);
    const menuBack = this.add.image(485, 575, "pause_menu_btn").setDepth(2004).setInteractive({ useHandCursor: true });
    const menuText = this.add.text(485, 574, t("game_main_menu"), {
      fontFamily: "Arial Black",
      fontSize: 23,
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 5,
    }).setOrigin(0.5).setDepth(2005).setInteractive({ useHandCursor: true });
    generateRectTexture(this, "pause_close_btn", 260, 66, 0xa42820, 1, 5, 0xffd45f);
    const closeBack = this.add.image(795, 575, "pause_close_btn")
      .setDepth(2004)
      .setInteractive({ useHandCursor: true });
    const closeText = this.add.text(795, 574, t("game_close"), {
      fontFamily: "Arial Black",
      fontSize: 23,
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 5,
    }).setOrigin(0.5).setDepth(2005).setInteractive({ useHandCursor: true });
    // Keep the complete pause surface under one owner. Android WebView can
    // dispatch a final pointer event while a scene hand-off is retiring its
    // display list; a single guarded container prevents stale/double-destroyed
    // child references during close, reopen, or shutdown.
    this.pauseOverlay = this.add.container(0, 0, [
      shade,
      wood,
      parchment,
      ribbon,
      title,
      missionTitle,
      story,
      objective,
      menuBack,
      menuText,
      closeBack,
      closeText,
    ]).setDepth(2000);
    this.events.once("shutdown", () => this.destroyPauseOverlay());

    const returnToMenu = () => {
      this.destroyPauseOverlay();
      this.setGamePaused(false);
      stopSceneMusic(this, "battle-music");
      this.scene.start("SceneTransition", {
        target: "MainMenu",
        targetData: { skipSplash: true },
        release: "battle",
      });
    };
    const close = () => {
      this.destroyPauseOverlay();
      this.setGamePaused(false);
      this.log("PAUSE", "closed");
    };
    menuBack.on("pointerdown", returnToMenu);
    menuText.on("pointerdown", returnToMenu);
    closeBack.on("pointerdown", close);
    closeText.on("pointerdown", close);
    this.log("PAUSE", "parchment menu opened");
  }

  private openOnlineLeaveDialog() {
    if (this.onlineLeaveDialogOpen || this.battleEnded) return;
    this.onlineLeaveDialogOpen = true;
    this.cancelUnitSelection("online-pause");
    this.statusText.setText(t("game_online_match_continues"));

    const shade = this.add.rectangle(640, 360, 1280, 720, 0x07101a, 0.56)
      .setDepth(2300)
      .setInteractive();
    const panel = this.add.rectangle(640, 360, 600, 300, 0x24170f, 0.96)
      .setStrokeStyle(5, this.localPlayerSide === "left" ? 0x3bc8ff : 0xff6252)
      .setDepth(2301);
    const title = this.add.text(640, 276, "LEAVE ONLINE MATCH?", {
      fontFamily: "Arial Black",
      fontSize: 28,
      color: "#fff2c0",
      stroke: "#000000",
      strokeThickness: 6,
    }).setOrigin(0.5).setDepth(2302);
    const body = this.add.text(640, 335, t("game_online_leave_body"), {
      fontFamily: "Arial Black",
      fontSize: 18,
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(2302);

    generateRectTexture(this, "online_leave_stay_btn", 220, 66, 0x345f2d, 1, 5, 0xffd45f);
    generateRectTexture(this, "online_leave_quit_btn", 250, 66, 0xa42820, 1, 5, 0xffd45f);
    const stayBack = this.add.image(510, 438, "online_leave_stay_btn").setDepth(2302).setInteractive({ useHandCursor: true });
    const stayText = this.add.text(510, 437, "STAY", {
      fontFamily: "Arial Black",
      fontSize: 23,
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 5,
    }).setOrigin(0.5).setDepth(2303).setInteractive({ useHandCursor: true });
    const leaveBack = this.add.image(770, 438, "online_leave_quit_btn").setDepth(2302).setInteractive({ useHandCursor: true });
    const leaveText = this.add.text(770, 437, "LEAVE MATCH", {
      fontFamily: "Arial Black",
      fontSize: 22,
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 5,
    }).setOrigin(0.5).setDepth(2303).setInteractive({ useHandCursor: true });

    const objects: Phaser.GameObjects.GameObject[] = [shade, panel, title, body, stayBack, stayText, leaveBack, leaveText];
    const close = () => {
      for (const object of objects) object.destroy();
      this.onlineLeaveDialogOpen = false;
      this.statusText.setText(this.onlineMatchStarted ? "GAME RESUMED." : t("game_online_arena_waiting"));
      this.log("PAUSE", "online leave dialog closed");
    };
    const leave = () => {
      for (const object of objects) {
        if ("disableInteractive" in object && typeof object.disableInteractive === "function") {
          object.disableInteractive();
        }
      }
      this.onlineLeaveDialogOpen = false;
      this.battleEnded = true;
      stopSceneMusic(this, "battle-music");
      NetworkClient.getInstance().disconnect();
      this.scene.start("SceneTransition", {
        target: "MainMenu",
        targetData: { skipSplash: true },
        release: "battle",
      });
      this.log("PAUSE", "online match left by player");
    };

    stayBack.on("pointerdown", close);
    stayText.on("pointerdown", close);
    leaveBack.on("pointerdown", leave);
    leaveText.on("pointerdown", leave);
    this.log("PAUSE", "online leave dialog opened");
  }

  private destroyPauseOverlay() {
    if (!this.pauseOverlay) return;
    const overlay = this.pauseOverlay;
    this.pauseOverlay = undefined;
    overlay.destroy(true);
  }

  private publishStoryCleanupQa() {
    if (new URLSearchParams(window.location.search).get("storyQa") !== "1") return;
    const storyTextures = this.textures.getTextureKeys().filter((key) => key.startsWith("story-story-"));
    const storyScene = this.scene.manager.getScene("Story") as Phaser.Scene & {
      runtimeObjectReferenceCount?: () => number;
    };
    const storyObjectReferenceCount = storyScene?.runtimeObjectReferenceCount?.() ?? 0;
    const result = {
      gameActive: this.scene.isActive("Game"),
      storyActive: this.scene.isActive("Story"),
      storySleeping: storyScene?.sys.isSleeping() ?? false,
      storyTextureCount: storyTextures.length,
      storyObjectReferenceCount,
      passed: this.scene.isActive("Game") && storyTextures.length === 0 &&
        storyObjectReferenceCount === 0 && !this.scene.isActive("Story"),
    };
    (window as typeof window & { __CASTLE_STORY_CLEANUP_QA__?: typeof result }).__CASTLE_STORY_CLEANUP_QA__ = result;
    document.documentElement.dataset.storyCleanupQa = JSON.stringify(result);
    this.log("STORY_QA", JSON.stringify(result));
  }

  private publishMapPackageQa() {
    if (new URLSearchParams(window.location.search).get("mapQa") !== "1") return;
    // Keep the authored map still for fast human inspection. This path is
    // explicit QA-only and never participates in campaign or online flow.
    this.setGamePaused(true);
    const definition = getTiledBattleMapDefinition(this.levelRuntime.map.id);
    const result = {
      levelId: this.levelRuntime.level.id,
      mapId: this.levelRuntime.map.id,
      sourceMapId: definition?.sourceMapId,
      sourcePackageLevel: definition?.sourcePackageLevel,
      visualBiome: definition?.visualBiome,
      mapUrl: definition?.mapUrl,
      tiledActive: Boolean(this.tiledMapRender),
      navigationActive: Boolean(this.tiledNavigation),
      resourceVisuals: [...new Set(this.levelRuntime.map.resources.map((resource) =>
        resource.visual.source === "asset" ? resource.visual.assetKey : resource.visual.id
      ))],
      playerCastle: this.levelRuntime.map.anchors.playerCastle,
      enemyCastle: this.levelRuntime.map.anchors.enemyCastle,
    };
    (window as typeof window & { __CASTLE_MAP_QA__?: typeof result }).__CASTLE_MAP_QA__ = result;
    document.documentElement.dataset.mapQa = JSON.stringify(result);
    this.log("MAP_QA", JSON.stringify(result));
  }

  private recordIncomeEvent(team: Team, amount: number) {
    const events = team === "player" ? this.playerIncomeEvents : this.enemyIncomeEvents;
    events.push({ atMs: this.elapsedMs, amount });
    const cutoff = this.elapsedMs - 60_000;
    while (events[0]?.atMs < cutoff) events.shift();
  }

  private incomeLast60(team: Team) {
    const cutoff = this.elapsedMs - 60_000;
    return (team === "player" ? this.playerIncomeEvents : this.enemyIncomeEvents)
      .filter((event) => event.atMs >= cutoff)
      .reduce((total, event) => total + event.amount, 0);
  }

  private armyGoldValue(team: Team) {
    return this.units
      .filter((unit) => unit.team === team && !isWorkerUnit(unit.type) && unit.hp > 0)
      .reduce((total, unit) => total + UNIT_CONFIGS[unit.type].cost * clamp(unit.hp / unit.maxHp, 0, 1), 0);
  }

  private frontlineControl() {
    const playerFront = this.balanceFrontX("player") ?? 640;
    const enemyFront = this.balanceFrontX("enemy") ?? 640;
    return clamp((playerFront + enemyFront - 1280) / 520, -1, 1);
  }

  private directorDominance() {
    const playerPower = this.armyGoldValue("player");
    const enemyPower = this.armyGoldValue("enemy");
    return clamp((playerPower - enemyPower) / Math.max(8, playerPower + enemyPower) + this.frontlineControl() * 0.35, -1, 1);
  }

  private tickBattleDirector() {
    const activeWaveId = this.battleDirector.activeWave?.id;
    const activeReserveUnitCount = activeWaveId
      ? this.units.filter((unit) => unit.reserveWaveId === activeWaveId && unit.hp > 0).length
      : 0;
    const commands = this.battleDirector.update({
      elapsedMs: this.elapsedMs,
      enemyCastleHpRatio: this.enemyCastle.hp / Math.max(1, this.enemyCastle.maxHp),
      playerDominance: this.directorDominance(),
      activeReserveUnitCount,
      enemyCombatUnitCount: this.activeCombatUnitCount("enemy"),
      combatUnitCap: COMBAT_UNIT_CAP,
    });

    for (const command of commands) {
      if (command.type === "phase") {
        this.recordDirectorLog("DIRECTOR_PHASE", command.wave, "start");
      } else if (command.type === "warning") {
        this.showReserveWarning(command.wave);
        this.recordDirectorLog("DIRECTOR_EVENT", command.wave, "warning");
      } else if (command.type === "spawn") {
        this.spawnReserveWave(command.wave);
        this.recordDirectorLog("RESERVE_SPEND", command.wave, "spawn");
      } else if (command.type === "complete") {
        this.reserveWarningContainer?.destroy();
        this.reserveWarningContainer = undefined;
        this.flashWarning("DEFENSE SEAL BROKEN");
        this.recordDirectorLog("DIRECTOR_PHASE", command.wave, "complete");
      } else {
        this.flashWarning("FINAL SIEGE: INCOME x2 · CASTLE DAMAGE +35%");
        this.log("DIRECTOR_EVENT", "final_siege passiveIncome=2x castleDamage=1.35x");
        this.balanceTelemetry.recordDirectorEvent({ second: Math.round(this.elapsedMs / 1000), type: "final_siege" });
        this.balanceTelemetry.recordStallEvent({
          second: Math.round(this.elapsedMs / 1000),
          type: "overtime",
          detail: "passiveIncome=2x castleDamage=1.35x seals=off",
        });
      }
    }

    const stalled = this.battleDirector.activeWave;
    if (stalled?.state === "warning" && stalled.delayReason && this.elapsedMs >= this.nextDirectorStallLogAt) {
      this.nextDirectorStallLogAt = this.elapsedMs + 5_000;
      this.log("STALL", `wave=${stalled.id} reason=${stalled.delayReason} activeEnemy=${this.activeCombatUnitCount("enemy")}/${COMBAT_UNIT_CAP}`);
    }
  }

  private recordDirectorLog(scope: string, wave: DirectorWave, event: "start" | "warning" | "spawn" | "complete") {
    this.log(scope, `event=${event} phase=${wave.id} trigger=${wave.triggerReason ?? "-"} budget=${wave.budget} units=${wave.units.join(",")} lanes=${wave.laneIndices.join(",")} delay=${wave.delayReason ?? "-"}`);
    this.balanceTelemetry.reserveSpent = this.battleDirector.reserveSpent;
    this.balanceTelemetry.recordDirectorEvent({
      second: Math.round(this.elapsedMs / 1000),
      type: event === "start" ? "phase" : event,
      phaseId: wave.id,
      triggerReason: wave.triggerReason,
      delayReason: wave.delayReason,
      budget: wave.budget,
      units: [...wave.units],
    });
  }

  private showReserveWarning(wave: DirectorWave) {
    this.reserveWarningContainer?.destroy();
    this.reserveWarningContainer = undefined;
    if (!SHOW_BATTLE_ALERTS) return;

    const laneNames = wave.laneIndices.map((lane) => ["UST", "ORTA", "ALT"][lane]).join("/");
    const back = this.add.rectangle(640, 156, 620, 92, 0x4b1212, 0.94).setStrokeStyle(4, 0xffd45f);
    const warningSeconds = Math.ceil(wave.warningMs / 1000);
    const title = this.add.text(640, 132, t("game_wave_warning", { seconds: warningSeconds, lanes: laneNames }), { fontFamily: "Arial Black", fontSize: 20, color: "#ffe17a" }).setOrigin(0.5);
    const silhouettes = this.add.text(640, 170, wave.units.map((unitId) => UNIT_CONFIGS[unitId].shortLabel).join("  ·  "), { fontFamily: "Arial Black", fontSize: 17, color: "#ffffff" }).setOrigin(0.5);
    this.reserveWarningContainer = this.add.container(0, 0, [back, title, silhouettes]).setDepth(1900);
        this.flashWarning("ENEMY RESERVES INCOMING");
  }

  private spawnReserveWave(wave: DirectorWave) {
    const zone = this.levelRuntime.map.enemySpawnZone;
    const laneYs = [zone.minY + (zone.maxY - zone.minY) / 6, (zone.minY + zone.maxY) / 2, zone.maxY - (zone.maxY - zone.minY) / 6];
    let empoweredUsed = false;
    wave.units.forEach((unitId, index) => {
      const wouldEmpower = (this.spawnCounts.enemy[unitId] + 1) % LEVEL_UP_EVERY === 0;
      const forceBaseLevel = wouldEmpower && empoweredUsed;
      if (wouldEmpower && !forceBaseLevel) empoweredUsed = true;
      this.spawnUnit("enemy", unitId, laneYs[wave.laneIndices[index] ?? 1], zone.x, {
        reserveWaveId: wave.id,
        forceBaseLevel,
      });
    });
    this.reserveWarningContainer?.destroy();
    this.reserveWarningContainer = undefined;
  }

  private tickEconomy() {
    if (this.battleEnded || this.isPaused) {
      return;
    }

    // Corridor QA isolates navigation. Economy AI and enemy powers would add
    // combat side effects to what must be a deterministic movement test.
    if (this.navigationQaMode) return;

    if (this.elapsedMs >= this.nextPassiveIncomeAt) {
      const amount = this.levelRuntime.level.economy.passiveGoldAmount *
        (this.battleDirector.isFinalSiege ? 2 : 1);
      this.gold += amount;
      this.enemyGold += amount;
      this.playerIncomeEvents.push({ atMs: this.elapsedMs, amount });
      this.enemyIncomeEvents.push({ atMs: this.elapsedMs, amount });
      this.balanceTelemetry.player.passiveGold += amount;
      this.balanceTelemetry.enemy.passiveGold += amount;
      this.balanceTelemetry.recordEconomyEvent({ second: Math.round(this.elapsedMs / 1000), team: "player", type: "passive", amount, bank: this.gold });
      this.balanceTelemetry.recordEconomyEvent({ second: Math.round(this.elapsedMs / 1000), team: "enemy", type: "passive", amount, bank: this.enemyGold });
      this.nextPassiveIncomeAt =
        this.elapsedMs + this.levelRuntime.level.economy.passiveGoldIntervalMs;
      this.log(
        "ECONOMY",
        `passive +${amount} player=${this.gold} enemy=${this.enemyGold} next=${Math.round(this.nextPassiveIncomeAt)}`,
      );
    }
    this.tickEnemyEconomyAi();
    this.tickEnemyPowerAi();
  }

  private enemyWorkerGoldReserve() {
    const missingWorkers = Math.max(
      0,
      this.enemyWorkerTarget() - this.activeWorkerCount("enemy"),
    );
    return missingWorkers * UNIT_CONFIGS.peasant.cost;
  }

  private tickEnemyEconomyAi() {
    if (this.isOnline || this.battleEnded || this.isPaused || this.economyQaMode || this.navigationQaMode) return;
    const workerCount = this.activeWorkerCount("enemy");
    const target = this.enemyWorkerTarget();
    const workerReserve = this.enemyWorkerGoldReserve();
    if (workerReserve !== this.lastEnemyWorkerReserve) {
      this.lastEnemyWorkerReserve = workerReserve;
      this.balanceTelemetry.recordEconomyEvent({
        second: Math.round(this.elapsedMs / 1000),
        team: "enemy",
        type: "worker_reserve",
        amount: 0,
        bank: this.enemyGold,
        detail: `reserved=${workerReserve}`,
      });
    }

    if (workerCount === 0 && this.enemyZeroWorkerStartedAt === undefined) {
      this.enemyZeroWorkerStartedAt = this.elapsedMs;
      this.log("STALL", `enemy zero_workers bank=${this.enemyGold} target=${target}`);
      this.balanceTelemetry.recordStallEvent({
        second: Math.round(this.elapsedMs / 1000),
        type: "zero_workers",
        detail: `bank=${this.enemyGold} target=${target}`,
      });
    }
    if (workerCount >= target) return;

    const worker = UNIT_CONFIGS.peasant;
    if (this.enemyGold < worker.cost) return;
    this.enemyGold -= worker.cost;
    this.flashUnitButton("right", "peasant");
    this.announceEnemySpawn("peasant");
    const spawnedWorker = this.spawnUnit("enemy", "peasant", this.safestEnemyWorkerLane());
    if (this.enemyFortressThreat()) {
      spawnedWorker.state = "shelter";
      spawnedWorker.isInsideCastle = true;
      spawnedWorker.x = spawnedWorker.homeX;
      this.log(
        "WORKER_RECOVERY",
        `enemy worker#${spawnedWorker.id} sheltered until a defense lane opens`,
      );
    }
    const recoveryMs = this.enemyZeroWorkerStartedAt === undefined
      ? 0
      : this.elapsedMs - this.enemyZeroWorkerStartedAt;
    if (this.enemyZeroWorkerStartedAt !== undefined) {
      this.balanceTelemetry.recordWorkerReplacement("enemy", recoveryMs);
      this.log("WORKER_RECOVERY", `enemy replacement_ms=${Math.round(recoveryMs)} bank=${this.enemyGold}`);
      this.enemyZeroWorkerStartedAt = undefined;
    }
    this.log(
      "AI_DECISION",
      `enemy action=spawn type=peasant reason=worker_priority workers=${workerCount + 1}/${target} bank=${this.enemyGold}`,
    );
  }

  private safestEnemyWorkerLane() {
    const zone = this.levelRuntime.map.enemySpawnZone;
    const homeNodes = this.resourceNodes.filter((node) =>
      node.amount > 0 &&
      node.type === "tree" &&
      node.reservedBy.length < RESOURCE_MAX_RESERVATIONS &&
      this.isHomeResourceNode("enemy", node)
    );
    const lanes = [
      zone.minY + (zone.maxY - zone.minY) / 6,
      (zone.minY + zone.maxY) / 2,
      zone.maxY - (zone.maxY - zone.minY) / 6,
    ];
    const threats = this.units.filter(
      (unit) => unit.team === "player" && !isWorkerUnit(unit.type) && unit.hp > 0 && !unit.isInsideCastle,
    );
    const danger = (laneY: number) => threats.reduce((total, threat) => {
      const distance = Math.sqrt((zone.x - threat.x) * (zone.x - threat.x) + (laneY - threat.y) * (laneY - threat.y));
      return total + Math.max(0, 320 - distance);
    }, 0);

    if (homeNodes.length > 0) {
      const target = [...homeNodes].sort((left, right) => {
        const score = (node: ResourceNode) => {
          const laneY = clamp(node.y, zone.minY + 18, zone.maxY - 18);
          const spawnDistance = Math.sqrt((zone.x - node.x) * (zone.x - node.x) + (laneY - node.y) * (laneY - node.y));
          return spawnDistance + node.reservedBy.length * 36 + danger(laneY) * 2.2;
        };
        return score(left) - score(right);
      })[0];
      return clamp(target.y, zone.minY + 18, zone.maxY - 18);
    }

    if (threats.length === 0) return lanes[this.mapRandomInt(0, lanes.length - 1)];
    return [...lanes].sort((left, right) => danger(left) - danger(right))[0];
  }

  private tickEnemyPowerAi() {
    if (
      this.isOnline ||
      this.battleEnded ||
      this.isPaused ||
      this.enemyPowerPending ||
      this.elapsedMs < this.nextEnemyPowerDecisionAt ||
      this.elapsedMs < this.enemyPowerLockUntil
    ) return;
    this.nextEnemyPowerDecisionAt = this.elapsedMs + 500;
    const powers = this.levelRuntime.level.enemy.powers;
    if (this.enemyPowerCastCount >= powers.maxCastsPerMatch) {
      this.logEnemyPowerHold(
        `enemy action=hold reason=match_limit uses=${this.enemyPowerCastCount}/${powers.maxCastsPerMatch}`,
      );
      return;
    }

    const threats = this.units.filter(
      (unit) =>
        unit.team === "player" &&
        !isWorkerUnit(unit.type) &&
        unit.hp > 0 &&
        !unit.isInsideCastle &&
        ((unit.x - this.enemyCastle.x) * (unit.x - this.enemyCastle.x) + (unit.y - this.enemyCastle.y) * (unit.y - this.enemyCastle.y)) <= (powers.defenseRadius) * (powers.defenseRadius),
    );
    if (threats.length === 0) {
      const anyPowerReady =
        (powers.missile && this.elapsedMs >= this.enemyMissileReadyAt) ||
        (powers.ice && this.elapsedMs >= this.enemyIceReadyAt);
      if (anyPowerReady) {
        this.logEnemyPowerHold(
          `enemy action=hold reason=no_combat_targets policy=${powers.targetingPolicy} radius=${powers.defenseRadius}`,
        );
      }
      return;
    }

    const siegePressure = this.enemySiegePressure();
    const siegeEmergency = siegePressure.urgent;
    const castleCritical = this.enemyCastle.hp / Math.max(1, this.enemyCastle.maxHp) <= 0.6 || siegeEmergency;
    const readyRules: Array<{
      power: PowerType;
      rule: EnemyPowerRule;
      readyAt: number;
      effectRadius: number;
    }> = [];
    if (
      powers.missile &&
      this.elapsedMs >= this.enemyMissileReadyAt &&
      this.enemyPowerCastCounts.missile < powers.maxCastsPerPower
    ) {
      readyRules.push({
        power: "missile",
        rule: powers.missile,
        readyAt: this.enemyMissileReadyAt,
        effectRadius: MISSILE_RADIUS,
      });
    }
    if (
      powers.ice &&
      this.elapsedMs >= this.enemyIceReadyAt &&
      this.enemyPowerCastCounts.ice < powers.maxCastsPerPower
    ) {
      readyRules.push({
        power: "ice",
        rule: powers.ice,
        readyAt: this.enemyIceReadyAt,
        effectRadius: ICE_BLAST_RADIUS,
      });
    }

    const candidates = readyRules.map(({ power, rule, readyAt, effectRadius }) => {
      const target = this.bestEnemyPowerTarget(threats, effectRadius);
      const threshold = this.enemyPowerClusterThreshold(
        rule,
        readyAt,
        power === "ice" && castleCritical,
      );
      const effectiveThreshold = siegeEmergency ? Math.min(threshold, 2) : threshold;
      const requiredGold = siegeEmergency
        ? Math.min(this.enemyPowerRequiredGold(rule, threshold), 8)
        : this.enemyPowerRequiredGold(rule, threshold);
      const eligible =
        target.count >= effectiveThreshold &&
        (siegeEmergency || power === "ice" && castleCritical || target.armyGold >= requiredGold);
      const castleDistance = Math.sqrt(
        (target.unit.x - this.enemyCastle.x) * (target.unit.x - this.enemyCastle.x) + 
        (target.unit.y - this.enemyCastle.y) * (target.unit.y - this.enemyCastle.y)
      );
      const urgency = 1 - clamp(castleDistance / Math.max(1, powers.defenseRadius), 0, 1);
      const threatScore =
        target.count * 100 +
        target.armyGold * 6 +
        urgency * 60 +
        (power === "ice" && castleCritical ? 30 : 0) +
        (siegeEmergency ? 120 : 0);
      this.balanceTelemetry.recordPowerEvent({
        second: Math.round(this.elapsedMs / 1000),
        team: "enemy",
        power,
        type: "decision",
        targetCount: target.count,
        targetX: Math.round(target.unit.x),
        targetY: Math.round(target.unit.y),
        castleDistance: Math.round(castleDistance),
        primaryTargetType: target.unit.type,
        targetPolicyViolation: castleDistance > powers.defenseRadius + 0.01,
        reason: `eligible=${eligible} policy=${powers.targetingPolicy} threshold=${effectiveThreshold}/${threshold} critical=${castleCritical} siege=${siegeEmergency} armyGold=${Math.round(target.armyGold * 10) / 10} requiredGold=${requiredGold}`,
      });
      return {
        power,
        rule,
        readyAt,
        target,
        threshold,
        effectiveThreshold,
        requiredGold,
        eligible,
        castleDistance,
        threatScore,
      };
    });

    let eligibleCandidates = candidates.filter((candidate) => candidate.eligible);
    if (eligibleCandidates.length === 0) {
      const closest = [...candidates].sort(
        (left, right) =>
          right.target.count - left.target.count ||
          right.target.armyGold - left.target.armyGold,
      )[0];
      if (!closest) {
        this.logEnemyPowerHold(
          `enemy action=hold reason=no_ready_power uses=${this.enemyPowerCastCount}/${powers.maxCastsPerMatch}`,
        );
        return;
      }
      this.logEnemyPowerHold(
        `enemy power=${closest.power} action=hold policy=${powers.targetingPolicy} cluster=${closest.target.count}/${closest.effectiveThreshold} armyGold=${Math.round(closest.target.armyGold * 10) / 10}/${closest.requiredGold} critical=${castleCritical} siege=${siegeEmergency} readyWait=${Math.round((this.elapsedMs - closest.readyAt) / 1000)}s uses=${this.enemyPowerCastCount}/${powers.maxCastsPerMatch}`,
      );
      return;
    }

    if (this.enemyPowerCastCount > 0) {
      const unusedEligible = eligibleCandidates.filter(
        (candidate) => this.enemyPowerCastCounts[candidate.power] === 0,
      );
      if (unusedEligible.length > 0) eligibleCandidates = unusedEligible;
    }
    const selected = [...eligibleCandidates].sort(
      (left, right) =>
        right.threatScore - left.threatScore ||
        this.enemyPowerCastCounts[left.power] - this.enemyPowerCastCounts[right.power] ||
        left.readyAt - right.readyAt,
    )[0];
    const nextCastIndex = this.enemyPowerCastCount + 1;
    const nextPowerCastIndex = this.enemyPowerCastCounts[selected.power] + 1;
    const policyViolation = selected.castleDistance > powers.defenseRadius + 0.01 ||
      isWorkerUnit(selected.target.unit.type);
    this.balanceTelemetry.recordPowerEvent({
      second: Math.round(this.elapsedMs / 1000),
      team: "enemy",
      power: selected.power,
      type: "opportunity",
      targetCount: selected.target.count,
      targetX: Math.round(selected.target.unit.x),
      targetY: Math.round(selected.target.unit.y),
      castleDistance: Math.round(selected.castleDistance),
      decisionDelayMs: 0,
      castIndex: nextCastIndex,
      powerCastIndex: nextPowerCastIndex,
      primaryTargetType: selected.target.unit.type,
      targetPolicyViolation: policyViolation,
      reason: `ready_and_eligible score=${Math.round(selected.threatScore)}`,
    });
    this.telegraphEnemyPower(
      selected.power,
      selected.target.unit.x,
      selected.target.unit.y,
      selected.target.count,
      selected.rule,
      {
        targetX: selected.target.unit.x,
        targetY: selected.target.unit.y,
        castleDistance: selected.castleDistance,
        decisionDelayMs: 0,
        castIndex: nextCastIndex,
        powerCastIndex: nextPowerCastIndex,
        primaryTargetType: selected.target.unit.type,
        targetPolicyViolation: policyViolation,
      },
    );
  }

  private enemyPowerClusterThreshold(
    rule: EnemyPowerRule,
    readyAt: number,
    castleCritical = false,
  ) {
    const waitedLongEnough = this.elapsedMs - readyAt >= 10_000;
    const patienceOffset = waitedLongEnough ? -1 : 0;
    const criticalOffset = castleCritical ? -1 : 0;
    return Math.round(clamp(
      rule.minCluster +
        this.adaptiveDifficulty.powerClusterOffset +
        -1 +
        patienceOffset +
        criticalOffset,
      2,
      6,
    ));
  }

  private enemyPowerRequiredGold(
    rule: EnemyPowerRule,
    threshold: number,
  ) {
    return Math.round(
      rule.minArmyGold * (threshold / Math.max(1, rule.minCluster)),
    );
  }

  private logEnemyPowerHold(message: string) {
    if (this.elapsedMs < this.nextEnemyPowerHoldLogAt) return;
    this.nextEnemyPowerHoldLogAt = this.elapsedMs + 2_500;
    this.log("POWER_DECISION", message);
  }

  private bestEnemyPowerTarget(threats: BattleUnit[], radius: number) {
    return threats.map((unit) => {
      const clustered = threats.filter(
        (other) => Math.sqrt((unit.x - other.x) * (unit.x - other.x) + (unit.y - other.y) * (unit.y - other.y)) <= radius,
      );
      return {
        unit,
        count: clustered.length,
        armyGold: clustered.reduce(
          // A wounded unit still consumes targeting space and can land its
          // full next attack. Power value therefore uses deployed card cost,
          // not remaining-HP liquidation value.
          (total, member) => total + UNIT_CONFIGS[member.type].cost,
          0,
        ),
      };
    }).sort((left, right) => right.count - left.count || right.armyGold - left.armyGold)[0];
  }

  private telegraphEnemyPower(
    power: PowerType,
    x: number,
    y: number,
    targetCount: number,
    rule: EnemyPowerRule,
    context: EnemyPowerCastContext,
  ) {
    const powers = this.levelRuntime.level.enemy.powers;
    this.enemyPowerPending = true;
    this.enemyPowerCastCount = context.castIndex;
    this.enemyPowerCastCounts[power] = context.powerCastIndex;
    const radius = power === "missile" ? MISSILE_RADIUS : ICE_BLAST_RADIUS;
    const marker = this.showPowerTelegraph(power, x, y, radius, powers.telegraphMs);
    this.playSfx("select-sfx", 0.62);
    this.flashWarning(power === "missile" ? "ENEMY MISSILE!" : "ENEMY ICE!");
    this.log(
      "POWER_DECISION",
      `enemy power=${power} action=telegraph policy=${powers.targetingPolicy} cluster=${targetCount} x=${Math.round(x)} y=${Math.round(y)} castleDistance=${Math.round(context.castleDistance)}/${powers.defenseRadius} use=${context.castIndex}/${powers.maxCastsPerMatch} powerUse=${context.powerCastIndex}/${powers.maxCastsPerPower}`,
    );
    this.balanceTelemetry.recordPowerEvent({
      second: Math.round(this.elapsedMs / 1000),
      team: "enemy",
      power,
      type: "telegraph",
      targetCount,
      targetX: Math.round(x),
      targetY: Math.round(y),
      castleDistance: Math.round(context.castleDistance),
      decisionDelayMs: context.decisionDelayMs,
      castIndex: context.castIndex,
      powerCastIndex: context.powerCastIndex,
      primaryTargetType: context.primaryTargetType,
      targetPolicyViolation: context.targetPolicyViolation,
    });
    this.time.delayedCall(powers.telegraphMs, () => {
      if (marker?.active) marker.destroy();
      this.enemyPowerPending = false;
      if (this.battleEnded) return;
      if (power === "missile") {
        this.castMissile("enemy", x, y, targetCount, context);
        this.enemyMissileReadyAt = this.elapsedMs + Math.round(
          rule.cooldownMs * this.adaptiveDifficulty.powerCooldownMultiplier,
        );
      } else {
        this.castIceBlast("enemy", x, y, targetCount, context);
        this.enemyIceReadyAt = this.elapsedMs + Math.round(
          rule.cooldownMs * this.adaptiveDifficulty.powerCooldownMultiplier,
        );
      }
      this.enemyPowerLockUntil = this.elapsedMs + powers.globalLockoutMs;
    });
  }

  private tickEnemyAi() {
    if (this.battleEnded || this.isPaused || this.economyQaMode) {
      return;
    }

    const siegePressure = this.enemySiegePressure();
    if (this.elapsedMs < this.nextEnemyCombatDecisionAt && !siegePressure.urgent) return;
    const beforeTargetDuration =
      this.elapsedMs < this.levelRuntime.level.duration.targetSeconds * 1_000;
    const emergencyDefense =
      siegePressure.urgent ||
      this.activeCombatUnitCount("enemy") === 0 &&
      this.activeCombatUnitCount("player") >= 4 &&
      this.enemyCastle.hp > 0 &&
      beforeTargetDuration;
    const normalDecisionInterval = Math.max(
      ENEMY_AI_TICK_MS,
      Math.round(this.enemyAiTickMs() / this.battleTempoMultiplier()),
    );
    const decisionInterval = emergencyDefense
      ? Math.min(1_000, normalDecisionInterval)
      : normalDecisionInterval;
    this.nextEnemyCombatDecisionAt = this.elapsedMs + decisionInterval;

    const waveSize = emergencyDefense ? Math.min(2, this.enemyWaveSize()) : this.enemyWaveSize();
    const profile = this.levelRuntime.level.enemy.aiProfile;
    const combatCosts = this.levelRuntime.level.enemy.allowedUnits
      .filter((unitId) => !isWorkerUnit(unitId))
      .map((unitId) => UNIT_CONFIGS[unitId].cost)
      .sort((left, right) => left - right);
    const saveTarget = emergencyDefense
      ? 0
      : profile === "defensive"
      ? (combatCosts[0] ?? 0) + (combatCosts[1] ?? combatCosts[0] ?? 0)
      : profile === "heavy"
        ? (combatCosts[combatCosts.length - 1] ?? 0) +
          (combatCosts[combatCosts.length - 2] ?? combatCosts[combatCosts.length - 1] ?? 0)
        : 0;
    const normalWorkerReserve = this.enemyWorkerGoldReserve();
    const workerReserve = emergencyDefense
      ? Math.min(UNIT_CONFIGS.peasant.cost, normalWorkerReserve)
      : normalWorkerReserve;
    const cheapestCombatCost = combatCosts[0] ?? 0;
    const threatenedCastle =
      beforeTargetDuration && (siegePressure.urgent || this.activeCombatUnitCount("player") >= 4);
    const combatReserve =
      threatenedCastle && this.activeCombatUnitCount("enemy") > 0
        ? cheapestCombatCost
        : 0;
    const spendableGold = Math.max(
      0,
      this.enemyGold - workerReserve - combatReserve,
    );
    if (spendableGold < saveTarget) {
      this.log("AI_DECISION", `enemy action=save profile=${profile} target=${saveTarget} bank=${this.enemyGold} workerReserve=${workerReserve} combatReserve=${combatReserve}`);
      return;
    }
    let spawned = 0;
    for (let waveIndex = 0; waveIndex < waveSize; waveIndex += 1) {
      if (this.activeCombatUnitCount("enemy") >= COMBAT_UNIT_CAP) break;
      const type = this.pickEnemyUnit(spendableGold);
      const config = UNIT_CONFIGS[type];
      if (this.enemyGold - workerReserve - combatReserve < config.cost) {
        if (this.balanceQaMode && waveIndex === 0) {
          this.log(
            "AI_DECISION",
            `enemy action=wait wanted=${type} cost=${config.cost} bank=${this.enemyGold} workerReserve=${workerReserve} combatReserve=${combatReserve}`,
          );
        }
        break;
      }
      this.enemyGold -= config.cost;
      this.flashUnitButton("right", type);
      this.announceEnemySpawn(type);
      this.spawnUnit("enemy", type, this.pickEnemyLane(type));
      spawned += 1;
    }
    if (emergencyDefense) {
      this.log(
        "AI_DECISION",
        `enemy action=emergency_defender spawned=${spawned} bank=${this.enemyGold} workerReserve=${workerReserve}`,
      );
    }
    if (this.balanceQaMode && spawned > 0) {
      this.log(
        "AI_DECISION",
        `enemy action=wave count=${spawned}/${waveSize} profile=${this.levelRuntime.level.enemy.aiProfile} bank=${this.enemyGold}`,
      );
    }
  }

  private tickBalanceQaPlayer() {
    if (!this.balanceQaMode || this.battleEnded || this.isPaused) return;

    const zone = this.levelRuntime.map.deployZone;
    const centerY = (zone.minY + zone.maxY) / 2;

    const closestEnemyX = this.units
      .filter(
        (unit) =>
          unit.team === "enemy" &&
          !isWorkerUnit(unit.type) &&
          unit.hp > 0 &&
          !unit.isInsideCastle,
      )
      .reduce((closest, unit) => Math.min(closest, unit.x), WORLD_RIGHT);
    const baseUnderPressure = closestEnemyX < 560;
    const combatThreats = this.units
      .filter(
        (unit) =>
          unit.team === "enemy" &&
          !isWorkerUnit(unit.type) &&
          unit.hp > 0 &&
          !unit.isInsideCastle,
      )
      .sort((left, right) => left.x - right.x);
    if (this.tryUseBalanceQaPower(combatThreats, baseUnderPressure)) return;
    const qaPlayerWorkerCount = this.activeWorkerCount("player");
    if (
      qaPlayerWorkerCount < this.balanceQaPlayerWorkerTarget() &&
      (!baseUnderPressure || qaPlayerWorkerCount === 0)
    ) {
      const spawned = this.trySpawnPlayerUnit("peasant", centerY);
      this.log(
        "QA_PLAYER",
        `action=${spawned ? "spawn" : "wait"} type=peasant reason=worker_target bank=${this.gold}`,
      );
      return;
    }

    const workerRaidTarget = this.units
      .filter(
        (unit) =>
          unit.team === "enemy" &&
          isWorkerUnit(unit.type) &&
          unit.hp > 0 &&
          !unit.isInsideCastle,
      )
      .sort((left, right) => left.x - right.x)[0];
    const closestThreat = combatThreats[0];
    const strategicTarget = closestThreat?.x < 720 ? closestThreat : workerRaidTarget ?? closestThreat;
    const type = this.pickBalanceQaPlayerUnit(strategicTarget?.type, (closestThreat?.x ?? WORLD_RIGHT) < 500);
    if (!type) {
      this.log(
        "QA_PLAYER",
        `action=wait reason=saving_for_counter target=${strategicTarget?.type ?? "deck"} bank=${this.gold}`,
      );
      return;
    }

    const laneY = strategicTarget?.y ?? this.nextAutoDeployY(type);
    const spawned = this.trySpawnPlayerUnit(type, laneY);
    this.log(
      "QA_PLAYER",
      `action=${spawned ? "spawn" : "wait"} type=${type} counter=${strategicTarget?.type ?? "weighted_enemy_deck"} bank=${this.gold}`,
    );
  }

  private tryUseBalanceQaPower(threats: BattleUnit[], baseUnderPressure: boolean) {
    if (threats.length < 2) return false;
    const target = [...threats].sort((left, right) => {
      const cluster = (candidate: BattleUnit) => threats.filter(
        (other) => ((candidate.x - other.x) * (candidate.x - other.x) + (candidate.y - other.y) * (candidate.y - other.y)) <= (ICE_BLAST_RADIUS) * (ICE_BLAST_RADIUS),
      ).length;
      return cluster(right) - cluster(left);
    })[0];
    const clusterSize = threats.filter(
      (other) => ((target.x - other.x) * (target.x - other.x) + (target.y - other.y) * (target.y - other.y)) <= (ICE_BLAST_RADIUS) * (ICE_BLAST_RADIUS),
    ).length;
    const minimumCluster = this.balanceQaStyle === "aggressiveRush"
      ? 3
      : this.balanceQaStyle === "defensiveSaver"
        ? 4
        : 5;
    const economyAllowsPower = this.balanceQaStyle !== "economyRush" || baseUnderPressure || clusterSize >= 5;
    if (!economyAllowsPower) return false;

    if (this.elapsedMs >= this.missileReadyAt && clusterSize >= minimumCluster) {
      this.tryCastPower("missile", target.x, target.y);
      this.log("QA_PLAYER", `action=missile cluster=${clusterSize} x=${Math.round(target.x)} y=${Math.round(target.y)}`);
      return true;
    }
    if (this.elapsedMs >= this.iceReadyAt && (baseUnderPressure || clusterSize >= minimumCluster + 1)) {
      this.tryCastPower("ice", target.x, target.y);
      this.log("QA_PLAYER", `action=ice cluster=${clusterSize} x=${Math.round(target.x)} y=${Math.round(target.y)}`);
      return true;
    }
    return false;
  }

  private pickBalanceQaPlayerUnit(
    targetType?: UnitType,
    emergency = false,
  ): UnitType | undefined {
    if (this.activeCombatUnitCount("player") >= COMBAT_UNIT_CAP) return undefined;

    const score = (unitId: UnitType) => {
      const config = UNIT_CONFIGS[unitId];
      const activeSameType = this.units.filter(
        (unit) =>
          unit.team === "player" &&
          unit.type === unitId &&
          unit.hp > 0 &&
          !unit.isInsideCastle,
      ).length;
      const targetMultiplier = targetType
        ? config.damageMultipliers?.[targetType] ?? 1
        : 1;
      const deckScore = this.levelRuntime.level.enemy.allowedUnits.reduce(
        (total, enemyId) =>
          total +
          (config.damageMultipliers?.[enemyId] ?? 1) *
            (this.levelRuntime.level.enemy.unitWeights[enemyId] ?? 0) / 100,
        0,
      );
      const workerRaidScore = targetType === "peasant"
        ? config.speed / 60 + (config.damageMultipliers?.peasant ?? 1) * 0.6
        : 0;
      const valueDurability = config.hp / Math.max(1, config.cost) * 0.018;
      const combinedArmsPenalty =
        this.balanceQaStyle === "balancedCounter" &&
        this.levelRuntime.level.masteryGoal.type === "combined_arms"
        ? activeSameType * 0.34
        : 0;
      return targetMultiplier * 2.4 + deckScore + workerRaidScore +
        config.damage / Math.max(1, config.cost) * 0.05 +
        valueDurability - combinedArmsPenalty;
    };
    let ranked = [...this.balanceQaLoadout].sort(
      (left, right) => score(right) - score(left),
    );
    if (this.levelRuntime.level.order === 1) {
      // The tutorial acceptance bot should exercise the authored lesson
      // (worker + swordsman), not discover an archer-heavy expert line that
      // stalls in the centre of the first map.
      ranked = ["swordsman", ...ranked.filter((unitId) => unitId !== "swordsman")];
    } else if (this.balanceQaStyle === "aggressiveRush") {
      ranked = ranked.sort((left, right) => UNIT_CONFIGS[left].cost - UNIT_CONFIGS[right].cost);
    } else if (this.balanceQaStyle === "defensiveSaver") {
      ranked = ranked.sort((left, right) => UNIT_CONFIGS[right].cost - UNIT_CONFIGS[left].cost);
      const desiredCost = UNIT_CONFIGS[ranked[0]].cost;
      if (!emergency && this.gold < desiredCost + 4) return undefined;
    }
    const desired = ranked[0];
    if (desired && this.gold >= UNIT_CONFIGS[desired].cost) return desired;

    if (emergency) {
      return ranked.find((unitId) => this.gold >= UNIT_CONFIGS[unitId].cost);
    }

    return undefined;
  }

  private balanceQaPlayerWorkerTarget() {
    if (this.balanceQaStyle === "economyRush") return this.currentWorkerCap();
    if (this.balanceQaStyle === "aggressiveRush") return 1;
    if (this.balanceQaStyle === "defensiveSaver") return Math.min(2, this.currentWorkerCap());
    const order = this.levelRuntime.level.order;
    return Math.min(order <= 2 ? 1 : order <= 4 ? 2 : 3, this.currentWorkerCap());
  }

  private enemyWorkerTarget() {
    return Math.min(this.levelRuntime.level.enemy.workerTarget, this.currentWorkerCap());
  }

  private pickEnemyUnit(availableGold = this.enemyGold): UnitType {
    const combatUnits = this.levelRuntime.level.enemy.allowedUnits.filter(
      (unitId) => !isWorkerUnit(unitId),
    );
    const affordable = combatUnits.filter((unitId) => {
      if (UNIT_CONFIGS[unitId].cost > availableGold) {
        return false;
      }

      return this.activeCombatUnitCount("enemy") < COMBAT_UNIT_CAP;
    });

    const candidates = affordable.length > 0 ? affordable : combatUnits;
    const profile = this.levelRuntime.level.enemy.aiProfile;
    const completedDirectorPhases = this.battleDirector.waves.filter((wave) => wave.state === "complete").length;
    const baseAdaptiveChance = profile === "tutorial" && completedDirectorPhases === 0
      ? 0
      : ({ balanced: 0.34, rush: 0.22, defensive: 0.58, ranged: 0.46, heavy: 0.52, infernal: 0.62, tutorial: 0.14 }[profile]);
    const adaptiveChance = clamp(
      baseAdaptiveChance + this.adaptiveDifficulty.counterChanceOffset,
      0,
      0.85,
    );
    const playerThreats = this.units.filter(
      (unit) =>
        unit.team === "player" &&
        !isWorkerUnit(unit.type) &&
        unit.hp > 0 &&
        !unit.isInsideCastle,
    );
    if (playerThreats.length > 0 && this.mapRandom() < adaptiveChance) {
      // Counter-selection must stay inside the affordable candidate pool.
      // Choosing a perfect but unaffordable counter made the old AI wait with
      // gold in the bank while a cheaper defender was available.
      return [...candidates].sort((left, right) => {
        const counterScore = (unitId: UnitType) => {
          const config = UNIT_CONFIGS[unitId];
          const threatScore = playerThreats.reduce((total, threat) => {
            const castlePressure = 1 + (threat.x - WORLD_LEFT) / (WORLD_RIGHT - WORLD_LEFT);
            return total +
              (config.damageMultipliers?.[threat.type] ?? 1) * castlePressure;
          }, 0);
          return threatScore + config.hp / Math.max(1, config.cost) * 0.035;
        };
        return counterScore(right) - counterScore(left);
      })[0];
    }

    const weighted = weightedPickUnit(
      this.levelRuntime.level.enemy.unitWeights,
      candidates,
      this.mapRandom(),
    );
    if (profile === "ranged" && isRangedUnit(weighted)) {
      const hasFrontline = this.units.some(
        (unit) => unit.team === "enemy" && !isWorkerUnit(unit.type) && !isRangedUnit(unit.type) && unit.hp > 0,
      );
      if (!hasFrontline) return candidates.find((unitId) => !isRangedUnit(unitId)) ?? weighted;
    }
    if (profile === "heavy") {
      return [...candidates].sort((left, right) => UNIT_CONFIGS[right].cost - UNIT_CONFIGS[left].cost)[0] ?? weighted;
    }
    return weighted;
  }

  private enemyWaveSize() {
    const profile = this.levelRuntime.level.enemy.aiProfile;
    if (profile === "tutorial" || profile === "rush") return 1;
    if (profile === "heavy") return this.levelRuntime.level.order >= 16 ? 3 : 2;
    if (profile === "infernal") return 3;
    if (profile === "defensive" || profile === "ranged") return 2;
    return this.levelRuntime.level.order >= 10 ? 2 : 1;
  }

  private pickEnemyLane(type: UnitType) {
    const zone = this.levelRuntime.map.enemySpawnZone;
    const fortressThreat = !isWorkerUnit(type) ? this.enemyFortressThreat() : undefined;
    if (fortressThreat && this.levelRuntime.level.order > 1) {
      return clamp(fortressThreat.y, zone.minY + 18, zone.maxY - 18);
    }
    if (this.levelRuntime.level.enemy.aiProfile === "infernal" && !isWorkerUnit(type)) {
      const combatSpawnCount = Object.entries(this.spawnCounts.enemy)
        .filter(([unitId]) => !isWorkerUnit(unitId as UnitType))
        .reduce((total, [, count]) => total + count, 0);
      return combatSpawnCount % 3 === 0
        ? zone.minY + 40
        : combatSpawnCount % 3 === 1
          ? zone.maxY - 40
          : (zone.minY + zone.maxY) / 2;
    }
    const workerHuntChance = clamp(
      0.08 + (this.levelRuntime.level.order - 1) * 0.027,
      0.08,
      0.6,
    );
    const canRaidWorker =
      type === "horseman" ||
      type === "knife_thrower" ||
      type === "archer";
    if (canRaidWorker && this.mapRandom() < workerHuntChance) {
      const worker = this.units
        .filter(
          (unit) =>
            unit.team === "player" &&
            isWorkerUnit(unit.type) &&
            unit.hp > 0 &&
            !unit.isInsideCastle,
        )
        .sort((left, right) => right.x - left.x)[0];
      if (worker) return clamp(worker.y, zone.minY + 18, zone.maxY - 18);
    }
    const workerThreat = this.enemyWorkerThreat();
    if (!isWorkerUnit(type) && workerThreat) {
      return clamp(workerThreat.worker.y, zone.minY + 18, zone.maxY - 18);
    }
    const defenseChance = clamp(0.18 + this.levelRuntime.level.order * 0.02, 0.2, 0.58);
    if (!isWorkerUnit(type) && this.mapRandom() < defenseChance) {
      const threat = this.units
        .filter(
          (unit) =>
            unit.team === "player" &&
            !isWorkerUnit(unit.type) &&
            unit.hp > 0 &&
            !unit.isInsideCastle,
        )
        .sort((left, right) => right.x - left.x)[0];
      if (threat) return clamp(threat.y, zone.minY + 18, zone.maxY - 18);
    }
    return this.mapRandomInt(zone.minY + 18, zone.maxY - 18);
  }

  private enemyFortressThreat() {
    return this.units
      .filter(
        (unit) =>
          unit.team === "player" &&
          !isWorkerUnit(unit.type) &&
          unit.hp > 0 &&
          !unit.isInsideCastle &&
          unit.x >= this.enemyCastle.x - 320,
      )
      .sort((left, right) => right.x - left.x)[0];
  }

  private enemySiegePressure() {
    const threats = this.units.filter(
      (unit) =>
        unit.team === "player" &&
        !isWorkerUnit(unit.type) &&
        unit.hp > 0 &&
        !unit.isInsideCastle &&
        unit.x >= this.enemyCastle.x - 320,
    );
    const armyGold = threats.reduce(
      (total, unit) => total + UNIT_CONFIGS[unit.type].cost,
      0,
    );
    const closestDistance = threats.reduce(
      (closest, unit) => Math.min(
        closest,
        Math.sqrt((unit.x - this.enemyCastle.x) * (unit.x - this.enemyCastle.x) + (unit.y - this.enemyCastle.y) * (unit.y - this.enemyCastle.y)),
      ),
      Number.POSITIVE_INFINITY,
    );
    const urgent =
      threats.length >= 3 ||
      armyGold >= 14 ||
      (threats.length >= 2 && closestDistance <= 170);
    return { count: threats.length, armyGold, closestDistance, urgent };
  }

  private enemyWorkerThreat() {
    const workers = this.units.filter(
      (unit) =>
        unit.team === "enemy" &&
        isWorkerUnit(unit.type) &&
        unit.hp > 0 &&
        !unit.isInsideCastle,
    );
    const threats = this.units.filter(
      (unit) =>
        unit.team === "player" &&
        !isWorkerUnit(unit.type) &&
        unit.hp > 0 &&
        !unit.isInsideCastle,
    );
    let selected: { worker: BattleUnit; threat: BattleUnit; distance: number } | undefined;
    for (const worker of workers) {
      for (const threat of threats) {
        const distance = Math.sqrt((worker.x - threat.x) * (worker.x - threat.x) + (worker.y - threat.y) * (worker.y - threat.y));
        if (distance > 260 || (selected && selected.distance <= distance)) continue;
        selected = { worker, threat, distance };
      }
    }
    return selected;
  }

  private queuedUnitCount(type: UnitType) {
    return this.pendingDeployCounts[type] ?? 0;
  }

  private pendingDeployEntries(): Array<[UnitType, number]> {
    return UNIT_ORDER.flatMap((type) => {
      const count = this.queuedUnitCount(type);
      return count > 0 ? [[type, count] as [UnitType, number]] : [];
    });
  }

  private pendingUnitCount() {
    return this.pendingDeployEntries().reduce((total, [, count]) => total + count, 0);
  }

  private pendingWorkerCount() {
    return this.pendingDeployEntries().reduce(
      (total, [type, count]) => total + (isWorkerUnit(type) ? count : 0),
      0,
    );
  }

  private pendingCombatCount() {
    return this.pendingDeployEntries().reduce(
      (total, [type, count]) => total + (isWorkerUnit(type) ? 0 : count),
      0,
    );
  }

  private pendingDeploySummary() {
    return this.pendingDeployEntries()
      .map(([type, count]) => `${UNIT_CONFIGS[type].shortLabel} x${count}`)
      .join(" · ");
  }

  /**
   * Returns the Team this client controls in the current match.
   * - Offline / Online Player 1 (left): "player"
   * - Online Player 2 (right):          "enemy"
   * All worker/combat AI logic is already side-aware via team, so this is the
   * only place we need to branch on localPlayerSide for UI/economy operations.
   */
  private localTeam(): Team {
    return this.isOnline && this.localPlayerSide === "right" ? "enemy" : "player";
  }

  /**
   * Returns the Side of the panel this client controls.
   * - Offline / Online Player 1: "left"
   * - Online Player 2:           "right"
   */
  private localPanelSide(): Side {
    return this.isOnline && this.localPlayerSide === "right" ? "right" : "left";
  }

  /** Returns the gold pool for the local player. */
  private localGold(): number {
    return this.localTeam() === "player" ? this.gold : this.enemyGold;
  }

  private pendingGoldCost() {
    return this.pendingDeployEntries().reduce(
      (total, [type, count]) => total + UNIT_CONFIGS[type].cost * count,
      0,
    );
  }

  private availableLocalGold() {
    return this.localGold() - (this.isOnline ? this.pendingGoldCost() : 0);
  }

  /** Deducts gold from the correct local gold pool. */
  private spendLocalGold(amount: number) {
    if (this.localTeam() === "player") {
      this.gold -= amount;
    } else {
      this.enemyGold -= amount;
    }
  }

  /** Refunds gold to the correct local gold pool. */
  private refundLocalGold(amount: number) {
    if (this.localTeam() === "player") {
      this.gold += amount;
    } else {
      this.enemyGold += amount;
    }
  }


  private queueDeployUnit(type: UnitType) {
    if (this.battleEnded || this.isPaused) {
      return false;
    }

    this.selectUnit(type);

    const config = UNIT_CONFIGS[type];

    if (isWorkerUnit(type)) {
      const myTeam = this.localTeam();
      const usedWorkerSlots = this.activeWorkerCount(myTeam) + this.pendingWorkerCount();

      if (usedWorkerSlots >= this.currentWorkerCap()) {
        this.statusText.setText(t("game_max_out_worker"));
        this.flashWarning("MAXED OUT");
        this.log("UI", `Queue blocked by worker cap for ${type}`);
        return false;
      }
    } else if (!this.isOnline) {
      const myTeam = this.localTeam();
      const usedCombatSlots = this.activeCombatUnitCount(myTeam) + this.pendingCombatCount();

      if (usedCombatSlots >= COMBAT_UNIT_CAP) {
        this.statusText.setText(t("game_max_out_army"));
        this.flashWarning("MAX OUT");
        this.log("UI", `Queue blocked by combat cap for ${type}`);
        return false;
      }
    }

    if (this.availableLocalGold() < config.cost) {
      this.statusText.setText(t("game_not_enough_gold"));
      this.flashWarning("NO GOLD");
      this.log("UI", `Queue blocked by gold for ${type}`);
      return false;
    }

    if (!this.isOnline) {
      this.spendLocalGold(config.cost);
      this.balanceTelemetry.recordEconomyEvent({
        second: Math.round(this.elapsedMs / 1000),
        team: this.localTeam(),
        type: "queue",
        amount: -config.cost,
        bank: this.localGold(),
        detail: type,
      });
    }
    this.pendingDeployCounts[type] = this.queuedUnitCount(type) + 1;
    this.spawnStripe.setVisible(true);
    this.spawnMarker.setVisible(true);
    this.flashUnitButton(this.localPanelSide(), type);
    this.log("DEPLOY", `Queued ${type} count=${this.queuedUnitCount(type)} total=${this.pendingUnitCount()}`);
    return true;
  }

  private refundPendingDeployQueue() {
    const entries = this.pendingDeployEntries();
    if (entries.length === 0) {
      return;
    }

    const refund = entries.reduce(
      (total, [type, count]) => total + count * UNIT_CONFIGS[type].cost,
      0,
    );
    if (this.isOnline) {
      this.log("DEPLOY", `Cancelled pending ${this.pendingDeploySummary()} without local economy mutation`);
      this.pendingDeployCounts = {};
      return;
    }
    this.refundLocalGold(refund);
    this.balanceTelemetry.recordEconomyEvent({
      second: Math.round(this.elapsedMs / 1000),
      team: this.localTeam(),
      type: "refund",
      amount: refund,
      bank: this.localGold(),
      detail: "cancelled_queue",
    });
    this.log(
      "DEPLOY",
      `Refunded pending ${this.pendingDeploySummary()}`,
    );
    this.pendingDeployCounts = {};
  }

  private deployPendingBatch(x: number, y: number) {
    if (this.battleEnded || this.isPaused) {
      return 0;
    }

    const entries = this.pendingDeployEntries();
    if (entries.length === 0) {
      this.statusText.setText(t("game_select_unit_first"));
      return 0;
    }

    const zone = this.playerDeployZone || this.levelRuntime.map.deployZone;
    const xLimits = this.localDeployXLimits(zone);
    const resolved = this.onlineGeometry
      ? resolveDeploymentClick(this.onlineGeometry, x, y)
      : undefined;
    if (this.isOnline && !resolved) return 0;
    const deployX = resolved?.x ?? clamp(x, xLimits.minX, xLimits.maxX);
    const deployY = resolved?.y ?? clamp(y, zone.minY, zone.maxY);

    let workerSlots = Math.max(0, this.currentWorkerCap() - this.activeWorkerCount(this.localTeam()));
    let combatSlots = this.isOnline
      ? this.pendingCombatCount()
      : Math.max(0, COMBAT_UNIT_CAP - this.activeCombatUnitCount(this.localTeam()));
    let batchCount = 0;
    let formationIndex = 0;
    let refund = 0;

    for (const [type, count] of entries) {
      const slots = isWorkerUnit(type) ? workerSlots : combatSlots;
      const deployCount = Math.min(count, slots);
      const skippedCount = count - deployCount;
      refund += skippedCount * UNIT_CONFIGS[type].cost;

      for (let index = 0; index < deployCount; index += 1) {
        const offset = this.batchFormationOffset(formationIndex, type);
        formationIndex += 1;

        // P2 deploys to enemy deploy zone instead of player deploy zone
        const finalX = clamp(
          deployX + (this.onlineGeometry ? formationWorldOffset(this.onlineGeometry, offset.x) : offset.x),
          xLimits.minX,
          xLimits.maxX
        );
        const finalY = clamp(deployY + offset.y, zone.minY, zone.maxY);

        if (this.isOnline) {
          this.onlineRuntime?.spawn(type, 1, finalX, finalY);
        } else {
          this.spawnUnit(
            this.localTeam(),
            type,
            finalY,
            finalX,
            { goldAlreadySpent: true },
          );
        }
      }

      batchCount += deployCount;
      if (isWorkerUnit(type)) workerSlots -= deployCount;
      else combatSlots -= deployCount;
    }

    if (refund > 0 && !this.isOnline) {
      this.refundLocalGold(refund);
      this.balanceTelemetry.recordEconomyEvent({
        second: Math.round(this.elapsedMs / 1000),
        team: this.localTeam(),
        type: "refund",
        amount: refund,
        bank: this.localGold(),
        detail: "deployment_cap",
      });
    }

    this.statusText.setText(
      `${batchCount} unit(s) deployed at the selected point.`,
    );
    this.log(
      "DEPLOY",
      `Queued batch deployed ${this.pendingDeploySummary()} at x=${Math.round(deployX)} y=${Math.round(deployY)}`,
    );
    this.pendingDeployCounts = {};
    this.selectedUnit = undefined;
    this.spawnStripe.setVisible(false);
    this.spawnMarker.setVisible(false);
    for (const [type] of entries) this.flashUnitButton(this.localPanelSide(), type);
    return batchCount;
  }

  private batchFormationOffset(index: number, type: UnitType) {
    const slot = index % BATCH_FORMATION_SLOTS_PER_COLUMN;
    const column = Math.floor(index / BATCH_FORMATION_SLOTS_PER_COLUMN);
    const ySlots = [0, -1, 1, -2, 2];
    const sizeScale = isCavalryUnit(type) ? 1.25 : 1;

    return {
      x: -column * BATCH_FORMATION_X_STEP * sizeScale,
      y: ySlots[slot] * BATCH_FORMATION_Y_STEP * sizeScale,
    };
  }

  private trySpawnPlayerUnit(type: UnitType, y: number): boolean {
    if (this.battleEnded || this.isPaused) {
      return false;
    }

    const config = UNIT_CONFIGS[type];
    const button = this.unitButtons.find(
      (candidate) => candidate.side === this.localPanelSide() && candidate.type === type,
    );
    const readyAt = button?.readyAt ?? 0;

    if (isWorkerUnit(type) && readyAt > this.elapsedMs) {
      if (button) {
        button.pulseUntil = this.elapsedMs + 120;
      }

      return false;
    }

    if (isWorkerUnit(type) && this.activeWorkerCount(this.localTeam()) >= this.currentWorkerCap()) {
      this.statusText.setText(t("game_max_out_worker"));
      this.flashWarning("MAXED OUT");
      this.log("UI", "Worker cap reached");
      return false;
    }

    if (!this.isOnline && !isWorkerUnit(type) && this.activeCombatUnitCount(this.localTeam()) >= COMBAT_UNIT_CAP) {
      this.statusText.setText(t("game_max_out_army"));
      this.flashWarning("MAX OUT");
      this.log("UI", "Combat unit cap reached");
      return false;
    }

    if (this.localGold() < config.cost) {
      this.statusText.setText(t("game_not_enough_gold"));
      this.log("UI", `Not enough gold for ${type}`);
      this.tweens.add({
        targets: this.statusText,
        scale: 1.08,
        duration: 90,
        yoyo: true,
      });
      return false;
    }

    this.spendLocalGold(config.cost);
    if (button && UNIT_DEPLOY_COOLDOWN_MS[type] > 0) {
      button.readyAt = this.elapsedMs + UNIT_DEPLOY_COOLDOWN_MS[type];
    }

    const deployY = this.playerDeployFormationY(type, y);

    if (this.isOnline) {
      const zone = this.playerDeployZone;
      this.onlineRuntime?.spawn(type, 1, zone.x, deployY);
    } else {
      this.spawnUnit(this.localTeam(), type, deployY);
    }
    this.statusText.setText(
      `${config.label} deployed. Tap again or hold while you have gold and slots available.`,
    );
    return true;
  }

  private playerDeployFormationY(type: UnitType, y: number) {
    const zone = this.playerDeployZone || this.levelRuntime.map.deployZone;
    const nextSpawnIndex = this.spawnCounts[this.localTeam()][type] + 1;
    const offsets = [0, -12, 12, -24, 24, -36, 36];
    return clamp(
      y + offsets[(nextSpawnIndex - 1) % offsets.length],
      zone.minY,
      zone.maxY,
    );
  }

  private spawnUnit(
    team: Team,
    type: UnitType,
    y: number,
    xOverride?: number,
    options?: {
      reserveWaveId?: string;
      forceBaseLevel?: boolean;
      goldAlreadySpent?: boolean;
      authoritativeId?: number;
      authoritativeLevel?: number;
    },
  ) {
    const config = UNIT_CONFIGS[type];
    const spawnIndex = this.spawnCounts[team][type] + 1;
    this.spawnCounts[team][type] = spawnIndex;

    const level = options?.authoritativeLevel ??
      (!options?.forceBaseLevel && spawnIndex % LEVEL_UP_EVERY === 0 ? 2 : 1);
    const levelBoost = level > 1 ? 1.25 : 1;
    const runtimeStats = applyUnitRuntimeStats(
      config,
      this.levelRuntime.level,
      this.levelRuntime.map,
      team,
    );
    const spawnZone = this.homeDeployZoneForTeam(team);
    let x = xOverride ?? spawnZone.x;
    const safeSpawn = this.tiledNavigation?.nearestWalkableWorld(
      x,
      y,
      this.navigationProfileForType(type),
    );
    if (!this.isOnline && safeSpawn && !this.tiledNavigation?.isWorldWalkableFor(x, y, this.navigationProfileForType(type))) {
      x = safeSpawn.x;
      y = safeSpawn.y;
    }
    const routePosition = clamp(
      flowPositionAtPoint(this.levelRuntime.map, x, y),
      0,
      1,
    );

    const shadow = this.add.ellipse(
      0,
      19,
      isCavalryUnit(type) ? 47 : 30,
      11,
      0x000000,
      0.18,
    );
    const spriteSize = this.unitBaseSpriteSize(type);
    const sprite = this.add
      .sprite(0, -2, this.unitAssetKey(team, type), "idle_000")
      .setDisplaySize(spriteSize, spriteSize);
    sprite.setFlipX(team === "enemy");
    const hpBack = this.add.image(-12, -37, "banner_bg").setOrigin(0, 0.5);
    const hpFill = this.add.image(-12, -37, team === "player" ? "banner_fill_player" : "banner_fill_enemy").setOrigin(0, 0.5);
    const children: Phaser.GameObjects.GameObject[] = [
      shadow,
      sprite,
      hpBack,
      hpFill,
    ];

    if (level > 1) {
      const badge = this.add
        .text(16, -38, "II", {
          fontFamily: "Arial Black",
          fontSize: 12,
          color: "#fff7a6",
          stroke: "#4b2a08",
          strokeThickness: 3,
        })
        .setOrigin(0.5);
      children.push(badge);
    }

    const container = this.add.container(x, y, children);
    container.setDepth(y);
    container.setScale(level > 1 ? 1.08 : 1);

    const unit: BattleUnit = {
      id: options?.authoritativeId ?? this.unitId,
      team,
      type,
      state: isWorkerUnit(type) ? "seekResource" : "move",
      x,
      y,
      hp: Math.round(runtimeStats.hp * levelBoost),
      maxHp: Math.round(runtimeStats.hp * levelBoost),
      damage: Math.round(runtimeStats.damage * levelBoost),
      range: runtimeStats.range,
      releaseRange: runtimeStats.releaseRange,
      visionRange: runtimeStats.visionRange,
      visionReleaseRange: runtimeStats.visionReleaseRange,
      fovCos: halfAngleCos(config.fovDegrees),
      cooldown: Math.max(
        420,
        Math.round(runtimeStats.cooldown / (level > 1 ? 1.08 : 1)),
      ),
      speed: runtimeStats.speed * (level > 1 ? 1.06 : 1),
      baseSpeed: runtimeStats.speed * (level > 1 ? 1.06 : 1),
      iceSlowUntil: 0,
      castleDamage: Math.round(runtimeStats.castleDamage * levelBoost),
      level,
      lastAttackAt: 0,
      nextTargetScanAt:
        this.elapsedMs + this.mapRandomInt(0, TARGETING_CONFIGS[type].retargetMs),
      lastTargetChangeAt: this.elapsedMs,
      routePosition,
      routeWaveAmplitude: 2 + this.mapRandom() * 4,
      routePhase: this.mapRandom() * Math.PI * 2,
      carryWood: 0,
      homeX: this.workerHomeX(team),
      isInsideCastle: false,
      nextHorseRunSfxAt: isCavalryUnit(type) ? this.elapsedMs + 380 : undefined,
      reserveWaveId: options?.reserveWaveId,
      facingDirection: team === "player" ? 1 : -1,
      container,
      shadow,
      sprite,
      hpBack,
      hpFill,
    };

    this.units.push(unit);
    this.unitById.set(unit.id, unit);
    if (team === "player" && !isWorkerUnit(type)) this.playerCombatTypesUsed.add(type);
    const paidWithGold = !options?.reserveWaveId;
    this.balanceTelemetry.recordSpawn(team, type, paidWithGold);
    if (paidWithGold && !options?.goldAlreadySpent) {
      this.balanceTelemetry.recordEconomyEvent({
        second: Math.round(this.elapsedMs / 1000),
        team,
        type: "spawn",
        amount: -config.cost,
        bank: team === "player" ? this.gold : this.enemyGold,
        detail: type,
      });
    }

    if (level > 1) {
      this.createLevelUpEffect(unit);
      this.log(
        "LEVEL_UP",
        `${team} ${type} spawn #${spawnIndex} became level ${level}`,
      );
    }

    this.log(
      "SPAWN",
      `${team} ${type} lvl=${level} y=${Math.round(y)} gold=${team === "player" ? this.gold : this.enemyGold}`,
    );
    this.playSfx("spawn-sfx", team === "player" ? 0.35 : 0.14);
    this.playUnitSpawnSfx(team, type);
    this.unitId = Math.max(this.unitId + 1, unit.id + 1);
    return unit;
  }

  private updateUnits(delta: number) {
    this.rebuildUnitSpatialGrid();
    for (const unit of this.units) {
      if (unit.hp <= 0) {
        continue;
      }

      const combatTempo = isWorkerUnit(unit.type)
        ? 1
        : this.battleTempoMultiplier();
      const frozen = unit.iceSlowUntil > this.elapsedMs;
      unit.speed = unit.baseSpeed * combatTempo *
        (frozen ? ICE_BLAST_SLOW_FACTOR : 1);

      if (frozen) {
        this.syncUnitVisual(unit);
        continue;
      }

      this.updateSupportAura(unit);

      if (isWorkerUnit(unit.type)) {
        this.updatePeasant(unit, delta);
        this.syncUnitVisual(unit);
        continue;
      }

      const targetUnit = this.findTargetUnit(unit);
      const targetCastle = this.opponentCastleForTeam(unit.team);

      if (targetUnit) {
        if (this.distanceBetween(unit, targetUnit) <= unit.range) {
          unit.state = "attackUnit";
          this.attackUnit(unit, targetUnit);
        } else {
          unit.state = "chase";
          this.chaseTarget(unit, targetUnit, delta);
          this.updateHorseMovementSfx(unit);
        }
      } else if (this.hasReachedCastleContact(unit, targetCastle)) {
        const castleDistance = Math.abs(targetCastle.frontX - unit.x);
        const enteringCastleContact = unit.state !== "attackCastle";
        unit.targetId = undefined;
        unit.state = "attackCastle";
        if (enteringCastleContact && !unit.castleContactLogged) {
          unit.castleContactLogged = true;
          this.log(
            "CASTLE_CONTACT",
            `${unit.team} ${unit.type}#${unit.id} unit=(${Math.round(unit.x)},${Math.round(unit.y)}) castle=(${Math.round(targetCastle.x)},${Math.round(targetCastle.y)}) contactX=${Math.round(targetCastle.frontX)} contactDx=${castleDistance.toFixed(1)}`,
          );
        }
        this.attackCastle(unit, targetCastle);
      } else {
        unit.targetId = undefined;
        unit.state = "move";
        this.moveUnit(unit, delta);
        this.updateHorseMovementSfx(unit);
      }

      this.monitorNavigationQa(unit);

      this.syncUnitVisual(unit);
    }
  }

  private updateSupportAura(unit: BattleUnit) {
    const support = UNIT_CONFIGS[unit.type].support;

    if (!support || this.elapsedMs - unit.lastAttackAt < support.healIntervalMs) {
      return;
    }

    const target = this.units
      .filter(
        (candidate) =>
          candidate.team === unit.team &&
          candidate.id !== unit.id &&
          candidate.hp > 0 &&
          candidate.hp < candidate.maxHp &&
          !candidate.isInsideCastle &&
          ((candidate.x - unit.x) * (candidate.x - unit.x) + (candidate.y - unit.y) * (candidate.y - unit.y)) <= (support.auraRadius) * (support.auraRadius),
      )
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];

    if (!target) {
      return;
    }

    const heal = Math.min(support.healAmount, target.maxHp - target.hp);
    target.hp += heal;
    unit.lastAttackAt = this.elapsedMs;
    this.createGoldPop(target.x, target.y - 52, `HEAL +${heal}`);
    this.log("SUPPORT", `${unit.team} ${unit.type}#${unit.id} healed ${target.type}#${target.id} +${heal}`);
  }

  private updatePeasant(unit: BattleUnit, delta: number) {
    if (unit.state === "shelter") {
      unit.x = unit.homeX;
      const protectedByDefender = this.units.some(
        (candidate) =>
          candidate.team === "enemy" &&
          !isWorkerUnit(candidate.type) &&
          candidate.hp > 0 &&
          !candidate.isInsideCastle &&
          candidate.x >= this.enemyCastle.x - 360,
      );
      if (!this.enemyFortressThreat() || protectedByDefender) {
        unit.state = "seekResource";
        unit.isInsideCastle = false;
        unit.nextTargetScanAt = 0;
        this.log("WORKER_RECOVERY", `enemy worker#${unit.id} left shelter`);
      }
      return;
    }

    if (unit.state === "deposit") {
      unit.x = unit.homeX;

      if (this.elapsedMs >= (unit.depositUntil ?? 0)) {
        unit.completedDelivery = true;
        unit.hp = 0;
        unit.depositUntil = undefined;
        unit.isInsideCastle = false;
        this.createGoldPop(unit.homeX, unit.y - 38, "SLOT +1");
        this.log(
          "WORKER",
          `${unit.team} peasant entered castle and despawned`,
        );
      }

      return;
    }

    if (unit.state === "gather") {
      const node = this.getResourceNode(unit.targetResourceId);

      if (!node || node.amount <= 0) {
        this.releaseResourceReservation(unit);
        unit.state = unit.carryWood > 0 ? "returnResource" : "seekResource";
        return;
      }

      if (this.elapsedMs >= (unit.gatherUntil ?? 0)) {
        const carryCapacity = this.workerCarryCapacity(unit);
        node.amount = Math.max(0, node.amount - 1);
        unit.carryWood = Math.min(carryCapacity, unit.carryWood + 1);
        unit.gatherUntil = this.elapsedMs + this.workerHarvestTickMs(unit);
        this.createHarvestEffect(node.x, node.y - 26);
        this.playAxeHarvestSfx(unit);
        this.updateResourceVisual(node);
        this.log(
          "WORKER",
          `${unit.team} peasant harvested node=${node.id} carry=${unit.carryWood}/${carryCapacity} stock=${node.amount}/${node.maxAmount}`,
        );

        if (node.amount <= 0) {
          this.depleteResource(node);
          this.releaseResourceReservation(unit);
        }

        if (unit.carryWood >= carryCapacity || node.amount <= 0) {
          if (node.amount > 0) {
            this.releaseResourceReservation(unit);
          }
          unit.state = "returnResource";
          this.log(
            "WORKER",
            `${unit.team} peasant returning with ${unit.carryWood} wood`,
          );
        }
      }

      return;
    }

    if (unit.state === "returnResource") {
      const arrivedHome =
        Math.abs(unit.homeX - unit.x) <= WORKER_HOME_REACH ||
        this.moveTowards(unit, unit.homeX, unit.y, delta);

      if (arrivedHome) {
        const carryCapacity = this.workerCarryCapacity(unit);
        const delivered = this.workerDeliveryGold(unit.carryWood, carryCapacity);

        if (unit.team === "player") {
          this.gold += delivered;
        } else {
          this.enemyGold += delivered;
        }
        this.recordIncomeEvent(unit.team, delivered);
        this.balanceTelemetry.team(unit.team).workerGold += delivered;
        this.balanceTelemetry.recordDelivery(unit.team);
        this.balanceTelemetry.recordEconomyEvent({
          second: Math.round(this.elapsedMs / 1000),
          team: unit.team,
          type: "worker_delivery",
          amount: delivered,
          bank: unit.team === "player" ? this.gold : this.enemyGold,
        });

        unit.carryWood = 0;
        unit.isInsideCastle = true;
        unit.depositUntil = this.elapsedMs + WORKER_DEPOSIT_MS;
        unit.state = "deposit";
        this.createGoldPop(unit.x, unit.y - 36, `+${delivered}`);
        this.log(
          "WORKER",
          `${unit.team} peasant delivered +${delivered} gold and will despawn`,
        );
      }
      return;
    }

    let node = this.getResourceNode(unit.targetResourceId);

    if (!node || node.amount <= 0 || !node.reservedBy.includes(unit.id)) {
      node = this.findResourceForWorker(unit);

      if (node) {
        this.reserveResource(node, unit);
      }
    }

    if (!node) {
      this.moveTowards(unit, unit.homeX, unit.y, delta);
      return;
    }

    if (this.elapsedMs >= unit.nextTargetScanAt) {
      const betterNode = this.findResourceForWorker(unit);

      if (betterNode && betterNode.id !== node.id) {
        const currentScore = this.workerResourceScore(unit, node);
        const betterScore = this.workerResourceScore(unit, betterNode);
        const returnsToHomeTerritory =
          !this.isHomeResourceNode(unit.team, node) &&
          this.isHomeResourceNode(unit.team, betterNode);

        if (
          returnsToHomeTerritory ||
          betterScore + WORKER_RESOURCE_SWITCH_HYSTERESIS < currentScore
        ) {
          this.reserveResource(betterNode, unit);
          node = betterNode;
          this.log(
            "WORKER",
            `${unit.team} peasant retargeted nearest node=${node.id}`,
          );
        }
      }

      unit.nextTargetScanAt = this.elapsedMs + WORKER_RESOURCE_RESCAN_MS;
    }

    unit.state = "seekResource";
    const arrivedResource =
      ((node.x - unit.x) * (node.x - unit.x) + (node.y - unit.y) * (node.y - unit.y)) <= (WORKER_RESOURCE_REACH) * (WORKER_RESOURCE_REACH) ||
      this.moveTowards(unit, node.x, node.y, delta);

    if (arrivedResource) {
      unit.state = "gather";
      unit.gatherUntil = this.elapsedMs + this.workerHarvestTickMs(unit);
      this.log("WORKER", `${unit.team} peasant gathering node=${node.id}`);
    }
  }

  private workerCarryCapacity(unit: BattleUnit) {
    return UNIT_CONFIGS[unit.type].economy?.carryLimit ?? WORKER_CARRY_CAPACITY;
  }

  private workerDeliveryGold(carryWood: number, carryCapacity = UNIT_CONFIGS.peasant.economy?.carryLimit ?? 3) {
    if (carryWood <= 0) return 0;
    const fullLoadGold = UNIT_CONFIGS.peasant.economy?.depositGold ?? 6;
    return Math.max(1, Math.round(fullLoadGold * (Math.min(carryWood, carryCapacity) / carryCapacity)));
  }

  private workerHarvestTickMs(unit: BattleUnit) {
    const baseTick = UNIT_CONFIGS[unit.type].economy?.gatherIntervalMs ?? HARVEST_TICK_MS;
    return Math.max(260, Math.round(baseTick / this.levelRuntime.map.modifiers.peasantGatherMultiplier));
  }

  private updateResourceNodes() {
    for (const node of this.resourceNodes) {
      if (
        node.amount <= 0 &&
        node.respawnAt !== undefined &&
        this.elapsedMs >= node.respawnAt
      ) {
        this.respawnResource(node);
      }
    }
  }

  private getResourceNode(id: number | undefined) {
    if (id === undefined) {
      return undefined;
    }

    return this.resourceNodes.find((node) => node.id === id);
  }

  private findResourceForWorker(unit: BattleUnit) {
    const viableNodes = this.resourceNodes.filter((node) => {
      const alreadyReserved = node.reservedBy.includes(unit.id);
      return node.amount > 0 && (
        alreadyReserved || node.reservedBy.length < RESOURCE_MAX_RESERVATIONS
      );
    });
    // Territory-first assignment: a worker only crosses midfield when every
    // usable tree on its own side is depleted or fully occupied. Distance and
    // danger optimize the selected tree inside that permitted territory.
    const homeNodes = viableNodes.filter((node) =>
      this.isHomeResourceNode(unit.team, node),
    );
    const candidates = homeNodes.length > 0 ? homeNodes : viableNodes;
    let selected: ResourceNode | undefined;
    let selectedScore = Number.MAX_VALUE;

    for (const node of candidates) {
      const score = this.workerResourceScore(unit, node);

      if (score < selectedScore) {
        selected = node;
        selectedScore = score;
      }
    }

    return selected;
  }

  private workerResourceScore(unit: BattleUnit, node: ResourceNode) {
    const distance = Math.sqrt((node.x - unit.x) * (node.x - unit.x) + (node.y - unit.y) * (node.y - unit.y));
    const activeReservations = node.reservedBy.filter((id) => id !== unit.id)
      .length;
    const threatPenalty = unit.team === "enemy"
      ? this.units.reduce((total, candidate) => {
          if (
            candidate.team !== "player" ||
            isWorkerUnit(candidate.type) ||
            candidate.hp <= 0 ||
            candidate.isInsideCastle
          ) return total;
          const threatDistance = Math.sqrt((node.x - candidate.x) * (node.x - candidate.x) + (node.y - candidate.y) * (node.y - candidate.y));
          return total + Math.max(0, 320 - threatDistance) * 2.4;
        }, 0)
      : 0;

    return (
      distance +
      activeReservations * WORKER_RESERVED_SLOT_PENALTY +
      threatPenalty
    );
  }

  private isHomeResourceNode(team: Team, node: ResourceNode) {
    const midfieldX = (this.playerCastle.x + this.enemyCastle.x) / 2;
    return team === "player" ? node.x <= midfieldX : node.x >= midfieldX;
  }

  private usableHomeResourceCount(unit: BattleUnit) {
    return this.resourceNodes.filter((node) => {
      const hasSlot = node.reservedBy.includes(unit.id) ||
        node.reservedBy.length < RESOURCE_MAX_RESERVATIONS;
      return node.amount > 0 && hasSlot && this.isHomeResourceNode(unit.team, node);
    }).length;
  }

  private reserveResource(node: ResourceNode, unit: BattleUnit) {
    const previousNodeId = unit.targetResourceId;
    if (unit.targetResourceId !== node.id) {
      this.releaseResourceReservation(unit);
    }

    unit.targetResourceId = node.id;

    if (!node.reservedBy.includes(unit.id)) {
      node.reservedBy.push(unit.id);
    }

    if (previousNodeId !== node.id) {
      const territory = this.isHomeResourceNode(unit.team, node) ? "home" : "remote";
      this.log(
        "WORKER_TARGET",
        `${unit.team} worker#${unit.id} node=${node.id} x=${Math.round(node.x)} territory=${territory} usableHome=${this.usableHomeResourceCount(unit)}`,
      );
    }
  }

  private releaseResourceReservation(unit: BattleUnit) {
    if (unit.targetResourceId === undefined) {
      return;
    }

    for (const node of this.resourceNodes) {
      node.reservedBy = node.reservedBy.filter((id) => id !== unit.id);
    }

    unit.targetResourceId = undefined;
  }

  private depleteResource(node: ResourceNode) {
    node.amount = 0;
    node.reservedBy = [];
    this.createWoodBurst(node.x, node.y - 14);
    this.scheduleResourceRespawn(node);
    this.updateResourceVisual(node);
    this.log("WORKER", `resource node=${node.id} depleted`);
  }

  private scheduleResourceRespawn(node: ResourceNode) {
    node.respawnAt = this.elapsedMs + this.levelRuntime.level.economy.resourceRespawnMs;
  }

  private respawnResource(node: ResourceNode) {
    node.amount = node.maxAmount;
    node.respawnAt = undefined;
    node.reservedBy = [];

    // Trees must spawn on the battlefield BETWEEN the two castle walls.
    // Player wall is at x≈224, enemy wall is at x≈1056.
    // Add margin so trees don't touch the walls either.
    const SAFE_LEFT = 290;   // well past player castle wall at x=224
    const SAFE_RIGHT = 990;  // well before enemy castle wall at x=1056
    const SAFE_TOP = 60;
    const SAFE_BOTTOM = 680;
    let newX = node.x;
    let newY = node.y;
    const otherTrees = this.resourceNodes.filter((candidate) =>
      candidate !== node && candidate.type === "tree"
    );

    // Respawn beside the old tree instead of anywhere on the battlefield.
    // The ring keeps the pair visually grouped without letting their crowns
    // overlap or placing the new tree on blocked navigation cells.
    for (let i = 0; i < 80; i += 1) {
      const anchor = node;
      const angle = this.mapRandom() * Math.PI * 2;
      const distance = this.mapRandomInt(
        RESOURCE_TREE_RESPAWN_NEAR_MIN,
        RESOURCE_TREE_RESPAWN_NEAR_MAX,
      );
      const testX = clamp(
        Math.round(anchor.x + Math.cos(angle) * distance),
        SAFE_LEFT,
        SAFE_RIGHT,
      );
      const testY = clamp(
        Math.round(anchor.y + Math.sin(angle) * distance),
        SAFE_TOP,
        SAFE_BOTTOM,
      );
      const clearOfTrees = otherTrees.every((candidate) =>
        ((testX - candidate.x) * (testX - candidate.x) + (testY - candidate.y) * (testY - candidate.y)) >= (RESOURCE_TREE_RESPAWN_SEPARATION) * (RESOURCE_TREE_RESPAWN_SEPARATION)
      );
      if (clearOfTrees && this.canPlaceTreeAt(testX, testY)) {
        newX = testX;
        newY = testY;
        break;
      }
    }
    node.x = newX;
    node.y = newY;

    node.container
      .setPosition(node.x, node.y)
      .setDepth(node.depthOffset + node.y);
    node.container.setScale(0.22);
    node.container.setAlpha(0.22);
    this.randomizeResourceTree(node);
    this.updateResourceVisual(node);
    this.createRespawnSproutEffect(node.x, node.y + 10);

    this.tweens.add({
      targets: node.container,
      x: node.x,
      y: node.y,
      scale: RESOURCE_TREE_RESPAWN_SCALE,
      alpha: 1,
      duration: 650,
      // Back.Out overshot the requested size during the spawn animation.
      // Quad.Out grows to exactly 0.8 without becoming temporarily larger.
      ease: "Quad.Out",
    });

    this.log("WORKER", `resource node=${node.id} respawned`);
  }

  private updateResourceVisual(node: ResourceNode) {
    const alive = node.amount > 0;

    for (const part of node.treeParts) {
      part.setVisible(alive);
    }

    node.stump.setVisible(!alive);
    // Full resource bars add two shape batches around every tree even though
    // they communicate no changing information. Reveal the bar only after a
    // worker has harvested the node; this keeps intact trees in one texture
    // batch and removes persistent overdraw from the normal battle view.
    const ownsOnlineResource = !this.isOnline || node.onlineSide === this.localPlayerSide;
    const showBar = alive && node.amount < node.maxAmount && ownsOnlineResource;
    node.barBack.setVisible(showBar);
    node.barFill.setVisible(showBar);
    const ratio = clamp(node.amount / node.maxAmount, 0, 1);
    node.barFill.setScale(ratio, 1);
  }

  private randomizeResourceTree(node: ResourceNode) {
    node.treeParts.forEach((part) => {
      part.setRotation(randomInt(-4, 4) * 0.01);
    });
  }

  private rebuildUnitSpatialGrid() {
    for (const key of this.activeSpatialBucketKeys) this.spatialBuckets.get(key)!.length = 0;
    this.activeSpatialBucketKeys.length = 0;
    this.unitById.clear();
    for (const unit of this.units) {
      this.unitById.set(unit.id, unit);
      if (unit.hp <= 0 || unit.isInsideCastle) continue;
      const key = (Math.floor(unit.x / 160) + 32) * 128 + Math.floor(unit.y / 160) + 32;
      let bucket = this.spatialBuckets.get(key);
      if (!bucket) {
        bucket = [];
        this.spatialBuckets.set(key, bucket);
      }
      if (bucket.length === 0) this.activeSpatialBucketKeys.push(key);
      bucket.push(unit);
    }
  }

  private findTargetUnit(unit: BattleUnit): BattleUnit | undefined {
    if (isWorkerUnit(unit.type)) {
      return undefined;
    }

    const locked = unit.targetId === undefined ? undefined : this.unitById.get(unit.targetId);
    const lockedScore = locked
      ? this.targetCandidateScore(unit, locked, true)
      : undefined;

    if (this.elapsedMs < unit.nextTargetScanAt) return lockedScore === undefined ? undefined : locked;

    unit.nextTargetScanAt =
      this.elapsedMs + TARGETING_CONFIGS[unit.type].retargetMs;
    const scanStartedAt = performance.now();
    this.targetScans += 1;

    let selected: BattleUnit | undefined;
    let selectedScore = lockedScore ?? Number.MAX_VALUE;

    if (locked && lockedScore !== undefined) {
      selected = locked;
    }

    const cellSize = 160;
    const cellX = Math.floor(unit.x / cellSize);
    const cellY = Math.floor(unit.y / cellSize);
    const radius = Math.max(unit.visionRange, unit.visionReleaseRange, TARGETING_CONFIGS[unit.type].castleInterruptRadius);
    const cellRadius = Math.max(1, Math.ceil(radius / cellSize));
    for (let y = cellY - cellRadius; y <= cellY + cellRadius; y += 1) {
      for (let x = cellX - cellRadius; x <= cellX + cellRadius; x += 1) {
        const bucket = this.spatialBuckets.get((x + 32) * 128 + y + 32);
        if (!bucket) continue;
        for (const candidate of bucket) {
          const score = this.targetCandidateScore(unit, candidate, candidate.id === unit.targetId);
          if (score !== undefined && score < selectedScore) {
            selected = candidate;
            selectedScore = score;
          }
        }
      }
    }
    this.targetScanMs += performance.now() - scanStartedAt;

    if (selected && unit.targetId !== selected.id) {
      unit.targetId = selected.id;
      unit.lastTargetChangeAt = this.elapsedMs;
      this.log(
        "TARGET",
        `${unit.team} ${unit.type}#${unit.id} locked ${selected.type}#${selected.id}`,
      );
    }

    if (!selected) {
      unit.targetId = undefined;
    }

    return selected;
  }

  private targetCandidateScore(
    unit: BattleUnit,
    candidate: BattleUnit,
    isCurrentTarget: boolean,
  ) {
    if (
      candidate.team === unit.team ||
      candidate.hp <= 0 ||
      candidate.id === unit.id ||
      candidate.isInsideCastle
    ) {
      return undefined;
    }

    const config = TARGETING_CONFIGS[unit.type];
    const dx = candidate.x - unit.x;
    const dy = candidate.y - unit.y;
    const distanceSquared = dx * dx + dy * dy;

    if (distanceSquared <= 0) {
      return undefined;
    }

    const maxRange = isCurrentTarget
      ? unit.visionReleaseRange
      : unit.visionRange;
    const castleInterrupt =
      unit.state === "attackCastle" && distanceSquared <= config.castleInterruptRadius * config.castleInterruptRadius;
    const selfDefense = candidate.targetId === unit.id;
    // Units have a small 360° personal-space awareness bubble. This prevents
    // opposing units from passing shoulder-to-shoulder merely because both
    // have just crossed the other's main forward cone.
    const nearThreat = distanceSquared <= config.nearThreatRadius * config.nearThreatRadius;

    if (distanceSquared > maxRange * maxRange && !castleInterrupt) {
      return undefined;
    }
    const distance = Math.sqrt(distanceSquared);

    // The placement stripe selects a continuous routePosition. Perception is
    // tethered to that authored flow line instead of to the unit's temporary
    // chase position, so nearby fighting can bend a route but never pull it
    // into another lane or back across the map.
    const expectedTargetY = flowYAtX(
      this.levelRuntime.map,
      candidate.x,
      unit.routePosition,
    );
    const laneDelta = Math.abs(candidate.y - expectedTargetY);
    const sameLane = laneDelta <= config.laneTolerance;
    const laneLeash = config.laneTolerance * (isCurrentTarget ? 1.7 : 1.25);
    const forward = this.laneForwardVector(unit);
    const dot = (dx * forward.x + dy * forward.y) / distance;
    const inForwardArc = dot >= unit.fovCos;
    const keepsVisibleLock = isCurrentTarget && dot >= -0.32;
    // Route placement remains authoritative. This extra allowance only covers
    // two nearby combat routes that are physically merging in front of a unit;
    // it cannot pull a unit toward a remote neighbouring lane.
    const localInterception =
      !isWorkerUnit(candidate.type) &&
      distance <= config.interceptRadius &&
      laneDelta <= config.laneTolerance * 1.65 &&
      inForwardArc;
    // An opponent actively attacking this unit is an engaged threat, not a
    // lane-selection candidate. Retaliation must survive route divergence at
    // bridges and shorelines, otherwise melee units can ignore an archer that
    // is already shooting them from a neighbouring flow line.
    const laneReach = nearThreat || selfDefense || localInterception || laneDelta <=
      (castleInterrupt ? laneLeash * 1.45 : laneLeash);

    if (!laneReach) {
      return undefined;
    }

    if (!inForwardArc && !keepsVisibleLock && !nearThreat && !castleInterrupt && !selfDefense) {
      return undefined;
    }

    // Traversal and perception are separate systems. NAV_BLOCKED describes
    // water banks, rocks and deployment geometry; it is not an opacity mask.
    // Using path-smoothing clearance as vision made units "blind" across
    // visible shorelines. Authored vision range/FOV/lane rules remain the
    // perception authority, while A* independently routes the chase.

    let score = distance + laneDelta * 1.45;
    score += sameLane ? SAME_LANE_TARGET_BONUS : 18;
    score +=
      dot >= 0
        ? FORWARD_TARGET_BONUS * dot
        : REAR_TARGET_PENALTY * Math.abs(dot);

    if (nearThreat) {
      score += NEAR_THREAT_TARGET_BONUS;
    }

    if (castleInterrupt) {
      score += CASTLE_UNIT_INTERRUPT_BONUS;
    }

    if (selfDefense) {
      score += SELF_DEFENSE_TARGET_BONUS;
    }

    if (isCurrentTarget) {
      score += CURRENT_TARGET_STICKINESS;
    }

    if (isWorkerUnit(candidate.type)) {
      score += isRangedUnit(unit.type)
        ? RANGED_WORKER_TARGET_PENALTY
        : MELEE_WORKER_TARGET_PENALTY;
    }

    if (isRangedUnit(candidate.type) && !isRangedUnit(unit.type)) {
      score += -10;
    }

    return score;
  }

  private laneForwardVector(unit: BattleUnit) {
    // Castle Stormers is a left-to-right platform battlefield. Perception must
    // follow the unit's stable team-facing axis; using route correction here
    // could rotate the cone almost vertically near bridges and make two visible
    // opponents ignore each other.
    return { x: this.advanceDirection(unit), y: 0 };
  }

  private moveUnit(unit: BattleUnit, delta: number) {
    const direction = unit.team === "player" ? 1 : -1;
    unit.facingDirection = direction;
    if (this.tiledNavigation) {
      const targetCastle = this.opponentCastleForTeam(unit.team);
      if (this.hasReachedCastleContact(unit, targetCastle)) {
        unit.state = "attackCastle";
        this.attackCastle(unit, targetCastle);
        return;
      }
      const destinationX = this.castleApproachX(unit, targetCastle);
      const castleDistance = (destinationX - unit.x) * direction;

      // Final approach corridor to castle wall:
      // Walk directly towards the castle wall facade without stalling on A* obstacle borders
      if (castleDistance <= 110) {
        const step = unit.speed * (delta / 1000);
        if (unit.team === "player") {
          unit.x = Math.min(destinationX - 4, unit.x + step);
        } else {
          unit.x = Math.max(destinationX + 4, unit.x - step);
        }
        if (this.hasReachedCastleContact(unit, targetCastle)) {
          unit.state = "attackCastle";
          this.attackCastle(unit, targetCastle);
        }
        return;
      }

      const destinationZone = this.opponentDeployZoneForTeam(unit.team);
      const destinationY = clamp(
        flowYAtX(this.levelRuntime.map, destinationX, unit.routePosition),
        destinationZone.minY,
        destinationZone.maxY,
      );
      if (this.finishCastleApproachIfClose(unit, destinationX)) return;
      // A single destination on the far side of the map gives A* enough
      // context to select a bridge. Short look-ahead goals can land inside a
      // river and leave a unit waiting at its bank.
      this.moveWithTiledPath(unit, destinationX, destinationY, delta);
      return;
    }
    const destinationX = this.castleApproachX(unit, this.opponentCastleForTeam(unit.team));
    const steppedX = unit.x + direction * unit.speed * (delta / 1000);
    const nextX = direction > 0
      ? Math.min(steppedX, destinationX)
      : Math.max(steppedX, destinationX);
    const laneY =
      flowYAtX(this.levelRuntime.map, nextX, unit.routePosition) +
      Math.sin(nextX / 118 + unit.routePhase) * unit.routeWaveAmplitude;
    const maxLaneStep = unit.speed * 0.72 * (delta / 1000);
    const nextY = unit.y + clamp(laneY - unit.y, -maxLaneStep, maxLaneStep);
    const detour = this.waterDetour(unit, nextX, nextY);
    if (detour) {
      unit.y += clamp(detour - unit.y, -maxLaneStep * 1.7, maxLaneStep * 1.7);
      if (!this.isInWater(nextX, unit.y)) unit.x = nextX;
      return;
    }
    unit.x = nextX;
    unit.y = nextY;
  }

  private chaseTarget(unit: BattleUnit, target: BattleUnit, delta: number) {
    const distance = this.distanceBetween(unit, target);

    if (distance <= 0) {
      return;
    }

    // Grid/navmesh movement must route to the target's reachable land cell.
    // Computing a stand-off point first can place that synthetic goal inside a
    // shoreline cell and make A* fail while both units are otherwise valid.
    if (this.tiledNavigation) {
      this.moveTowards(unit, target.x, target.y, delta);
      return;
    }

    const desiredDistance =
      isRangedUnit(unit.type)
        ? unit.range * 0.82
        : Math.max(18, unit.range * 0.52);
    const dx = target.x - unit.x;
    const dy = target.y - unit.y;
    const standOffX = target.x - (dx / distance) * desiredDistance;
    const standOffY = target.y - (dy / distance) * desiredDistance;

    this.moveTowards(
      unit,
      clamp(standOffX, WORLD_LEFT, WORLD_RIGHT),
      clamp(standOffY, SPAWN_MIN_Y, SPAWN_MAX_Y),
      delta,
    );
  }

  private distanceBetween(unit: BattleUnit, target: BattleUnit) {
    const dx = target.x - unit.x;
    const dy = target.y - unit.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private advanceDirection(unit: BattleUnit) {
    return unit.team === "player" ? 1 : -1;
  }


  private moveTowards(
    unit: BattleUnit,
    targetX: number,
    targetY: number,
    delta: number,
  ) {
    const planned = this.nextTiledWaypoint(unit, targetX, targetY);
    if (planned) {
      targetX = planned.x;
      targetY = planned.y;
    }
    const detour = this.tiledNavigation ? undefined : this.waterDetour(unit, targetX, targetY);
    if (detour) targetY = detour;
    const distance = Math.sqrt((targetX - unit.x) * (targetX - unit.x) + (targetY - unit.y) * (targetY - unit.y));
    const dx = targetX - unit.x;

    if (Math.abs(dx) > 2) {
      unit.facingDirection = dx > 0 ? 1 : -1;
    }

    if (distance < 5) {
      unit.x = targetX;
      unit.y = targetY;
      return true;
    }

    if (this.tiledNavigation) {
      const moved = this.moveTiledStepWithSlide(unit, targetX, targetY, delta);
      this.trackNavigationProgress(unit, moved);
      return false;
    }

    const step = Math.min(unit.speed * (delta / 1000), distance);
    const nextX = unit.x + ((targetX - unit.x) / distance) * step;
    const nextY = unit.y + ((targetY - unit.y) / distance) * step;
    if (this.isInWater(nextX, nextY)) {
      unit.y += clamp(targetY - unit.y, -step, step);
    } else {
      unit.x = nextX;
      unit.y = nextY;
    }
    return false;
  }

  private isInWater(x: number, y: number) {
    return this.tiledNavigation?.isBlocked(x, y) ?? this.waterAreas.some((area) => this.isInsideImpassable(area, x, y));
  }

  private nextTiledWaypoint(unit: BattleUnit, targetX: number, targetY: number) {
    if (!this.tiledNavigation || !this.tiledPathfinder) return undefined;
    const goal = this.tiledNavigation.worldToCell(targetX, targetY);
    const goalKey = `${goal.column}:${goal.row}`;
    const canPlan = this.elapsedMs >= (unit.navNextPlanAt ?? 0);
    const goalDx = targetX - (unit.navGoalX ?? Number.POSITIVE_INFINITY);
    const goalDy = targetY - (unit.navGoalY ?? Number.POSITIVE_INFINITY);
    const goalMovedFar =
      unit.navGoalX === undefined ||
      unit.navGoalY === undefined ||
      goalDx * goalDx + goalDy * goalDy >= 3_600;
    if (canPlan && (goalMovedFar || !unit.navPath?.length)) {
      if (this.pathPlansThisFrame >= 2) {
        unit.navNextPlanAt = this.elapsedMs + 34;
        return unit.navPath?.[0];
      }
      this.pathPlansThisFrame += 1;
      const start = this.tiledNavigation.worldToCell(unit.x, unit.y);
      const profile = this.navigationProfile(unit);
      const cacheKey = `${start.column}:${start.row}>${goalKey}:${profile}`;
      const cached = this.pathCache.get(cacheKey);
      if (cached) {
        this.astarCacheHits += 1;
        unit.navPath = cached.slice();
      } else {
        const astarStartedAt = performance.now();
        this.astarCalls += 1;
        unit.navPath = this.tiledPathfinder.findPath(unit.x, unit.y, targetX, targetY, profile);
        this.astarMs += performance.now() - astarStartedAt;
        if (unit.navPath?.length) {
          this.pathCache.set(cacheKey, unit.navPath.slice());
          if (this.pathCache.size > 192) this.pathCache.delete(this.pathCache.keys().next().value!);
        }
      }
      unit.navGoalCell = goalKey;
      unit.navGoalX = targetX;
      unit.navGoalY = targetY;
      unit.navNextPlanAt = this.elapsedMs + 420;
      if (unit.navQa && !unit.navPath) {
        this.log("NAV_QA", `sword#${unit.id} no-path start=${Math.floor(unit.x / 20)},${Math.floor(unit.y / 20)} goal=${goalKey}`);
      }
      if (
        this.balanceQaMode &&
        isWorkerUnit(unit.type) &&
        !unit.navPath &&
        this.elapsedMs - (unit.navQaLastLogAt ?? -5000) >= 5000
      ) {
        unit.navQaLastLogAt = this.elapsedMs;
        this.log(
          "BALANCE_NAV",
          `${unit.team} worker#${unit.id} no-path state=${unit.state} from=${Math.round(unit.x)},${Math.round(unit.y)} goal=${Math.round(targetX)},${Math.round(targetY)} cell=${goalKey}`,
        );
      }
    }
    while (unit.navPath?.length) {
      const dx = unit.navPath[0].x - unit.x;
      const dy = unit.navPath[0].y - unit.y;
      if (dx * dx + dy * dy >= 64) break;
      unit.navPath.shift();
    }
    if (!unit.navPath?.length) {
      const dx = targetX - unit.x;
      const dy = targetY - unit.y;
      const distanceSquared = dx * dx + dy * dy;
      if (
        distanceSquared >= 1 &&
        distanceSquared <= 1_600 &&
        this.isSafeTiledSegment(unit, targetX, targetY)
      ) {
        return { x: targetX, y: targetY };
      }
    }
    return unit.navPath?.[0];
  }

  private navigationProfile(unit: BattleUnit): NavigationProfile {
    return this.navigationProfileForType(unit.type);
  }

  private navigationProfileForType(type: UnitType): NavigationProfile {
    return type === "horseman" || type === "mace_guard" ? "HEAVY" : type === "peasant" || type === "knife_thrower" ? "SMALL" : "NORMAL";
  }

  private moveWithTiledPath(unit: BattleUnit, targetX: number, targetY: number, delta: number) {
    const waypoint = this.nextTiledWaypoint(unit, targetX, targetY);
    if (!waypoint) {
      const dx = targetX - unit.x;
      const dy = targetY - unit.y;
      if (dx * dx + dy * dy <= 16 && this.isSafeTiledSegment(unit, targetX, targetY)) {
        unit.x = targetX;
        unit.y = targetY;
        return true;
      }
      return this.tiledNavigation?.isBlocked(targetX, targetY) ?? false;
    }
    const moved = this.moveTiledStepWithSlide(unit, waypoint.x, waypoint.y, delta);
    this.trackNavigationProgress(unit, moved);
    return moved;
  }

  private finishCastleApproachIfClose(unit: BattleUnit, destinationX: number) {
    if (!this.tiledNavigation) return false;
    const isRanged = isRangedUnit(unit.type);
    const attackRange = isRanged ? Math.min(unit.range, 160) : 16;
    const dx = destinationX - unit.x;
    const forwardDistance = dx * this.advanceDirection(unit);
    if (
      forwardDistance <= attackRange &&
      forwardDistance >= -20
    ) {
      unit.navPath = undefined;
      unit.navGoalCell = undefined;
      unit.navGoalX = undefined;
      unit.navGoalY = undefined;
      unit.navNextPlanAt = this.elapsedMs + 180;
      unit.navProgressX = unit.x;
      unit.navProgressY = unit.y;
      unit.navProgressAt = this.elapsedMs;
      return true;
    }
    return false;
  }

  /** Swept movement with continuous obstacle repulsion and corridor sliding.
   * Repels units smoothly away from NAV_BLOCKED areas and guides units along bridges. */
  private moveTiledStepWithSlide(unit: BattleUnit, targetX: number, targetY: number, delta: number) {
    if (!this.tiledNavigation) return false;
    const profile = this.navigationProfile(unit);
    const radius = profile === "HEAVY" ? 14 : 10;

    // 1. Continuous Obstacle Repulsion: push smoothly away from NAV_BLOCKED tiles
    if (this.tiledCollisionGrid) {
      const repulsion = this.tiledCollisionGrid.getObstacleRepulsion(unit.x, unit.y, radius);
      if (repulsion.force > 0) {
        const pushStep = Math.min(repulsion.force, Math.max(1.5, unit.speed * 1.8 * (delta / 1000)));
        unit.x += repulsion.x * pushStep;
        unit.y += repulsion.y * pushStep;
      }
    }

    // 2. Recovery if inside a hard blocked cell
    if (this.tiledNavigation.isBlocked(unit.x, unit.y)) {
      const recovery = this.tiledNavigation.nearestWalkableWorld(unit.x, unit.y, profile);
      if (recovery) {
        const dx = recovery.x - unit.x;
        const dy = recovery.y - unit.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0.5) {
          const pushSpeed = unit.speed * 2.5 * (delta / 1000);
          const step = Math.min(dist, Math.max(1.5, pushSpeed));
          unit.x += (dx / dist) * step;
          unit.y += (dy / dist) * step;
          unit.navPath = undefined;
          unit.navGoalCell = undefined;
          unit.navGoalX = undefined;
          unit.navGoalY = undefined;
          unit.navNextPlanAt = this.elapsedMs + 100;
          return true;
        }
      }
    }

    // 3. Bridge corridor guiding: when on bridge tiles (05_BRIDGES), keep units aligned
    if (this.tiledCollisionGrid?.isBridgeAtWorld(unit.x, unit.y)) {
      const upBlocked = this.tiledNavigation.isBlocked(unit.x, unit.y - 14);
      const downBlocked = this.tiledNavigation.isBlocked(unit.x, unit.y + 14);
      if (upBlocked && !downBlocked) {
        unit.y += Math.min(1.5, unit.speed * 0.4 * (delta / 1000));
      } else if (downBlocked && !upBlocked) {
        unit.y -= Math.min(1.5, unit.speed * 0.4 * (delta / 1000));
      }
    }

    // 4. Stepped sub-movement with multi-angle projection
    const totalDistance = Math.sqrt((targetX - unit.x) * (targetX - unit.x) + (targetY - unit.y) * (targetY - unit.y));
    if (totalDistance < 0.5) return false;
    const totalStep = Math.min(unit.speed * (delta / 1000), totalDistance);
    const substeps = Math.max(1, Math.ceil(totalStep / 6));
    const stepLength = totalStep / substeps;
    let moved = false;

    for (let index = 0; index < substeps; index += 1) {
      const remainingX = targetX - unit.x;
      const remainingY = targetY - unit.y;
      const remainingDistance = Math.sqrt((remainingX) * (remainingX) + (remainingY) * (remainingY));
      if (remainingDistance < 0.5) break;
      const step = Math.min(stepLength, remainingDistance);
      const velocityX = (remainingX / remainingDistance) * step;
      const velocityY = (remainingY / remainingDistance) * step;
      const strictClearance = this.tiledNavigation.isWorldWalkableFor(unit.x, unit.y, profile);
      const walkable = (x: number, y: number) => strictClearance
        ? this.tiledNavigation!.isWorldWalkableFor(x, y, profile)
        : !this.tiledNavigation!.isBlocked(x, y);
      let selectedX = 0;
      let selectedY = 0;
      let selectedDistance = Number.POSITIVE_INFINITY;
      const choose = (x: number, y: number) => {
        if (!walkable(x, y)) return;
        const dx = x - targetX;
        const dy = y - targetY;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared < selectedDistance) {
          selectedDistance = distanceSquared;
          selectedX = x;
          selectedY = y;
        }
      };
      choose(unit.x + velocityX, unit.y + velocityY);
      choose(unit.x + velocityX, unit.y);
      choose(unit.x, unit.y + velocityY);
      choose(unit.x - velocityY, unit.y + velocityX);
      choose(unit.x + velocityY, unit.y - velocityX);
      choose(unit.x + velocityX * 0.7 - velocityY * 0.7, unit.y + velocityY * 0.7 + velocityX * 0.7);
      choose(unit.x + velocityX * 0.7 + velocityY * 0.7, unit.y + velocityY * 0.7 - velocityX * 0.7);
      if (selectedDistance === Number.POSITIVE_INFINITY) {
        unit.navPath = undefined;
        unit.navNextPlanAt = 0;
        break;
      }
      const previousX = unit.x;
      const previousY = unit.y;
      unit.x = selectedX;
      unit.y = selectedY;
      const movedX = unit.x - previousX;
      const movedY = unit.y - previousY;
      moved ||= movedX * movedX + movedY * movedY > 0.0025;
      if (Math.abs(unit.x - previousX) > 1) unit.facingDirection = unit.x > previousX ? 1 : -1;
    }
    return moved;
  }

  private trackNavigationProgress(unit: BattleUnit, moved: boolean) {
    unit.navProgressX ??= unit.x;
    unit.navProgressY ??= unit.y;
    unit.navProgressAt ??= this.elapsedMs;
    const progress = Math.sqrt((unit.x - unit.navProgressX) * (unit.x - unit.navProgressX) + (unit.y - unit.navProgressY) * (unit.y - unit.navProgressY));
    if (moved && progress >= 6) {
      unit.navProgressX = unit.x;
      unit.navProgressY = unit.y;
      unit.navProgressAt = this.elapsedMs;
      unit.navRecoveryCount = 0;
      return;
    }
    if (this.elapsedMs - unit.navProgressAt < 650) return;
    // Local avoidance fallback: slide a stalled unit sideways on the authored
    // walkable surface, then request a fresh path. Every point of the nudge is
    // clearance-checked, so a unit can never hop across water/lava to escape.
    const nudge = this.trySafeNavigationNudge(unit);
    if ((unit.navRecoveryCount ?? 0) < 3 && nudge) {
      unit.navRecoveryCount = (unit.navRecoveryCount ?? 0) + 1;
      unit.navPath = [nudge];
      unit.navGoalCell = undefined;
      unit.navGoalX = undefined;
      unit.navGoalY = undefined;
      unit.navNextPlanAt = this.elapsedMs + 650;
      unit.navProgressX = unit.x;
      unit.navProgressY = unit.y;
      unit.navProgressAt = this.elapsedMs;
      if (this.navigationQaMode || this.balanceQaMode) {
        this.log(
          "NAV_SLIDE",
          `${unit.type}#${unit.id} safe sidestep to x=${Math.round(nudge.x)} y=${Math.round(nudge.y)} recovery=${unit.navRecoveryCount}`,
        );
      }
      return;
    }
    unit.navPath = undefined;
    unit.navGoalCell = undefined;
    unit.navGoalX = undefined;
    unit.navGoalY = undefined;
    unit.navNextPlanAt = 0;
    unit.navProgressX = unit.x;
    unit.navProgressY = unit.y;
    unit.navProgressAt = this.elapsedMs;
    unit.navRecoveryCount = (unit.navRecoveryCount ?? 0) + 1;
    if (this.navigationQaMode) {
      const cell = this.tiledNavigation?.worldToCell(unit.x, unit.y);
      this.log(
        "NAV_RECOVERY",
        `${unit.type}#${unit.id} state=${unit.state} cell=${cell?.column},${cell?.row} recovery=${unit.navRecoveryCount}`,
      );
    }
    if (unit.state === "chase" && unit.navRecoveryCount >= 2) {
      unit.targetId = undefined;
      unit.nextTargetScanAt = this.elapsedMs + 180;
      unit.navRecoveryCount = 0;
    }
  }

  private trySafeNavigationNudge(unit: BattleUnit) {
    if (!this.tiledNavigation) return false;
    const waypoint = unit.navPath?.[0];
    const rawX = (waypoint?.x ?? unit.x + this.advanceDirection(unit) * 40) - unit.x;
    const rawY = (waypoint?.y ?? unit.y) - unit.y;
    const length = Math.max(1, Math.sqrt((rawX) * (rawX) + (rawY) * (rawY)));
    const forwardX = rawX / length;
    const forwardY = rawY / length;
    const lateralX = -forwardY;
    const lateralY = forwardX;
    const sideOrder = unit.id % 2 === 0 ? [1, -1] : [-1, 1];
    const candidates: Array<{ x: number; y: number; crowd: number; progress: number }> = [];

    for (const distance of [12, 18, 26]) {
      for (const side of sideOrder) {
        for (const forwardStep of [6, 0, -6]) {
          const x = unit.x + lateralX * distance * side + forwardX * forwardStep;
          const y = unit.y + lateralY * distance * side + forwardY * forwardStep;
          if (!this.isSafeTiledSegment(unit, x, y)) continue;
          const nearestAlly = this.units.reduce((nearest, other) => {
            if (other.id === unit.id || other.team !== unit.team || other.hp <= 0 || other.isInsideCastle) return nearest;
            return Math.min(nearest, Math.sqrt((other.x - x) * (other.x - x) + (other.y - y) * (other.y - y)));
          }, 80);
          candidates.push({
            x,
            y,
            crowd: Math.min(nearestAlly, 80),
            progress: waypoint ? Math.sqrt((waypoint.x - x) * (waypoint.x - x) + (waypoint.y - y) * (waypoint.y - y)) : 0,
          });
        }
      }
    }

    candidates.sort((left, right) =>
      (right.crowd - left.crowd) * 2 + (left.progress - right.progress),
    );
    const selected = candidates[0];
    if (!selected) return undefined;
    return { x: selected.x, y: selected.y };
  }

  private isSafeTiledSegment(unit: BattleUnit, targetX: number, targetY: number) {
    if (!this.tiledNavigation) return false;
    const distance = Math.sqrt((targetX - unit.x) * (targetX - unit.x) + (targetY - unit.y) * (targetY - unit.y));
    const steps = Math.max(1, Math.ceil(distance / 3));
    const profile = this.navigationProfile(unit);
    for (let step = 1; step <= steps; step += 1) {
      const ratio = step / steps;
      const x = unit.x + (targetX - unit.x) * ratio;
      const y = unit.y + (targetY - unit.y) * ratio;
      if (!this.tiledNavigation.isWorldWalkableFor(x, y, profile)) return false;
    }
    return true;
  }

  private monitorNavigationQa(unit: BattleUnit) {
    if (!unit.navQa || unit.navQaReachedEnemy || !this.tiledNavigation || unit.hp <= 0) return;
    const cell = this.tiledNavigation.worldToCell(unit.x, unit.y);
    if (!this.tiledNavigation.isWorldWalkableFor(unit.x, unit.y, this.navigationProfile(unit))) {
      if (!unit.navQaBlockedLogged) {
        unit.navQaBlockedLogged = true;
        this.navigationQaBlockedEvents += 1;
        this.log("NAV_QA", `FAIL_BLOCKED ${unit.type}#${unit.id} cell=${cell.column},${cell.row}`);
      }
      return;
    }
    const bridgeLayer = this.tiledMapRender?.tilemap.getLayer("05_BRIDGES");
    const bridgeTile = bridgeLayer?.data[Math.floor(unit.y / 40)]?.[Math.floor(unit.x / 40)];
    if (bridgeTile && bridgeTile.index >= 0 && bridgeTile.properties.navigationRole === "bridge" && !unit.navQaCrossedBridge) {
      unit.navQaCrossedBridge = true;
      this.log("NAV_QA", `${unit.type}#${unit.id} crossed bridge cell=${cell.column},${cell.row}`);
    }
    const reachedOpponentCastle = unit.team === "player"
      ? unit.x >= this.castleApproachX(unit, this.enemyCastle)
      : unit.x <= this.castleApproachX(unit, this.playerCastle);
    if ((unit.state === "attackCastle" || reachedOpponentCastle) && !unit.navQaReachedEnemy) {
      unit.navQaReachedEnemy = true;
      this.log("NAV_QA", `PASS ${unit.type}#${unit.id} reached opponent castle boundary x=${Math.round(unit.x)} y=${Math.round(unit.y)} state=${unit.state}`);
      this.publishNavigationQaResult("all_units_reached");
      return;
    }
    const intentionallyStationary = (
      unit.state === "attackUnit" ||
      unit.state === "attackCastle" ||
      unit.state === "gather" ||
      unit.state === "deposit"
    );
    if (intentionallyStationary) {
      unit.navQaLastX = unit.x;
      unit.navQaLastY = unit.y;
      unit.navQaLastProgressAt = this.elapsedMs;
      return;
    }
    const previousX = unit.navQaLastX ?? unit.x;
    const previousY = unit.navQaLastY ?? unit.y;
    if (((unit.x - previousX) * (unit.x - previousX) + (unit.y - previousY) * (unit.y - previousY)) >= (12) * (12)) {
      unit.navQaLastX = unit.x;
      unit.navQaLastY = unit.y;
      unit.navQaLastProgressAt = this.elapsedMs;
      unit.navQaStuckLogged = false;
      return;
    }
    if (
      !unit.navQaStuckLogged &&
      this.elapsedMs - (unit.navQaLastProgressAt ?? this.elapsedMs) > NAV_QA_STUCK_CONFIRM_MS &&
      this.elapsedMs - (unit.navQaLastLogAt ?? 0) > NAV_QA_STUCK_CONFIRM_MS
    ) {
      unit.navQaLastLogAt = this.elapsedMs;
      unit.navQaStuckLogged = true;
      this.navigationQaStuckEvents += 1;
      this.log("NAV_QA", `STUCK ${unit.type}#${unit.id} state=${unit.state} cell=${cell.column},${cell.row} path=${unit.navPath?.length ?? 0}`);
    }
  }

  private publishNavigationQaResult(reason: string, force = false) {
    if (this.navigationQaResultPublished || !this.isNavigationStressQaPath()) return;
    const qaUnits = this.units.filter((unit) => unit.navQa);
    const reached = qaUnits.filter((unit) => unit.navQaReachedEnemy).length;
    if (!force && reached < this.navigationQaExpectedCount) return;
    const passed =
      reached === this.navigationQaExpectedCount &&
      this.navigationQaBlockedEvents === 0 &&
      this.navigationQaStuckEvents === 0;
    const report = {
      passed,
      reason,
      levelId: this.levelRuntime.level.id,
      expected: this.navigationQaExpectedCount,
      reached,
      stuckEvents: this.navigationQaStuckEvents,
      blockedEvents: this.navigationQaBlockedEvents,
      elapsedSeconds: Math.round(this.elapsedMs / 100) / 10,
      units: qaUnits.map((unit) => ({
        id: unit.id,
        type: unit.type,
        reached: unit.navQaReachedEnemy === true,
        x: Math.round(unit.x),
        y: Math.round(unit.y),
      })),
    };
    this.navigationQaResultPublished = true;
    (window as typeof window & { __CASTLE_NAVIGATION_QA_RESULT__?: typeof report })
      .__CASTLE_NAVIGATION_QA_RESULT__ = report;
    this.log("NAV_QA_RESULT", `${passed ? "PASS" : "FAIL"} ${JSON.stringify(report)}`);
  }

  private isInsideImpassable(area: WaterArea, x: number, y: number, clearance = 0) {
    const dx = x - area.x;
    const dy = y - area.y;
    const cos = Math.cos(-area.rotation);
    const sin = Math.sin(-area.rotation);
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;
    const radiusX = area.radiusX + clearance;
    const radiusY = area.radiusY + clearance;
    return (localX * localX) / (radiusX * radiusX) + (localY * localY) / (radiusY * radiusY) < 1;
  }

  private segmentHitsImpassable(area: WaterArea, fromX: number, fromY: number, toX: number, toY: number) {
    if (this.isInsideImpassable(area, fromX, fromY, 8) || this.isInsideImpassable(area, toX, toY, 8)) return true;
    const steps = Math.max(3, Math.ceil(Math.sqrt((toX - fromX) * (toX - fromX) + (toY - fromY) * (toY - fromY)) / 22));
    for (let index = 1; index < steps; index += 1) {
      const t = index / steps;
      if (this.isInsideImpassable(area, fromX + (toX - fromX) * t, fromY + (toY - fromY) * t, 8)) return true;
    }
    return false;
  }

  private waterDetour(unit: BattleUnit, targetX: number, targetY: number) {
    const active = unit.bypassAreaId
      ? this.waterAreas.find((candidate) => candidate.id === unit.bypassAreaId)
      : undefined;
    const activeStillRelevant = active && (
      Math.abs(unit.x - active.x) <= active.radiusX + 54 ||
      this.segmentHitsImpassable(active, unit.x, unit.y, targetX, targetY)
    );
    const area = activeStillRelevant
      ? active
      : this.waterAreas.find((candidate) => this.segmentHitsImpassable(candidate, unit.x, unit.y, targetX, targetY));
    if (!area) {
      unit.bypassAreaId = undefined;
      unit.bypassSide = undefined;
      return undefined;
    }

    if (unit.bypassAreaId !== area.id || !unit.bypassSide) {
      const verticalExtent = Math.abs(Math.sin(area.rotation)) * area.radiusX + Math.abs(Math.cos(area.rotation)) * area.radiusY;
      const upper = clamp(area.y - verticalExtent - 34, SPAWN_MIN_Y, SPAWN_MAX_Y);
      const lower = clamp(area.y + verticalExtent + 34, SPAWN_MIN_Y, SPAWN_MAX_Y);
      const upperCost = Math.abs(unit.y - upper) + Math.abs(targetY - upper);
      const lowerCost = Math.abs(unit.y - lower) + Math.abs(targetY - lower);
      unit.bypassSide = Math.abs(upperCost - lowerCost) < 2 ? (unit.id % 2 === 0 ? -1 : 1) : upperCost < lowerCost ? -1 : 1;
      unit.bypassAreaId = area.id;
    }

    const verticalExtent = Math.abs(Math.sin(area.rotation)) * area.radiusX + Math.abs(Math.cos(area.rotation)) * area.radiusY;
    return clamp(area.y + unit.bypassSide * (verticalExtent + 34), SPAWN_MIN_Y, SPAWN_MAX_Y);
  }

  private attackUnit(attacker: BattleUnit, target: BattleUnit) {
    this.facePosition(attacker, target.x);

    if (this.elapsedMs - attacker.lastAttackAt < this.effectiveUnitAttackCooldown(attacker)) {
      return;
    }

    attacker.lastAttackAt = this.elapsedMs;
    this.restartUnitAttack(attacker);

    if (isRangedUnit(attacker.type)) {
      this.fireArrow(attacker, target);
      return;
    }

    const dealtDamage = this.applyDamageToUnit(attacker, target, attacker.damage);
    this.playMeleeAttackSfx(attacker);
    this.createHitEffect(target.x, target.y - 18, attacker.type);
    this.createDamageText(target.x, target.y - 45, dealtDamage);
    this.flashUnitHit(target);
  }

  private attackCastle(attacker: BattleUnit, castle: CastleState) {
    // Castle sides are fixed in shared world space. Lock the attacker toward
    // the fortress every frame so a previous unit target cannot leave it
    // attacking with its back turned.
    attacker.facingDirection = castle.team === "player" ? -1 : 1;
    // Navigation QA treats castle contact as the finish line. Keeping the
    // structure intact lets every stress unit complete the same corridor run.
    if (this.navigationQaMode && !this.castleCombatQaMode) return;

    if (this.elapsedMs - attacker.lastAttackAt < this.effectiveAttackCooldown(attacker)) {
      return;
    }

    attacker.lastAttackAt = this.elapsedMs;
    this.restartUnitAttack(attacker);

    if (isRangedUnit(attacker.type)) {
      const impact = this.castleFrontImpact(attacker, castle);

      this.fireArrowAtPosition(attacker, impact.x, impact.y, () => {
        const dealtDamage = Math.min(castle.hp, this.pacedCastleDamage(attacker));
        castle.hp = Math.max(0, castle.hp - dealtDamage);
        this.balanceTelemetry.team(attacker.team).castleDamageDealt += dealtDamage;
        if (castle.team === "player") {
          playAndroidHaptic("castle_hit");
          this.cameras.main.shake(140, 0.004);
          this.flashWarning("BASE UNDER ATTACK");
        } else if (!this.suppressOfflineAndroidOpponentCastleFeedback(castle)) {
          playAndroidHaptic("selection");
          this.cameras.main.shake(80, 0.002);
        }
        this.playCastleImpactSfx(attacker);
        this.createHitEffect(impact.x, impact.y, attacker.type);
        this.createDamageText(impact.x, impact.y - 48, dealtDamage, t("game_base_hit"));
      });
      return;
    }

    const impact = this.castleFrontImpact(attacker, castle);
    const dealtDamage = Math.min(castle.hp, this.pacedCastleDamage(attacker));
    castle.hp = Math.max(0, castle.hp - dealtDamage);
    this.balanceTelemetry.team(attacker.team).castleDamageDealt += dealtDamage;
    if (castle.team === "player") {
      playAndroidHaptic("castle_hit");
      this.cameras.main.shake(150, 0.0045);
      this.flashWarning("BASE UNDER ATTACK");
    } else if (!this.suppressOfflineAndroidOpponentCastleFeedback(castle)) {
      playAndroidHaptic("selection");
      this.cameras.main.shake(90, 0.0025);
    }
    this.playMeleeAttackSfx(attacker);
    this.playCastleImpactSfx(attacker);
    this.createHitEffect(impact.x, impact.y, attacker.type);
    this.createDamageText(impact.x, impact.y - 48, dealtDamage, t("game_base_hit"));
  }

  private suppressOfflineAndroidOpponentCastleFeedback(castle: CastleState) {
    // PERMANENT ANDROID OFFLINE UX RULE: outgoing hits on the opponent castle
    // must never shake or vibrate the player's device. Incoming damage keeps
    // its warning feedback, and online snapshot feedback remains unchanged.
    return !this.isOnline && castle.team === "enemy" && isNativeAndroidRuntime();
  }

  private pacedCastleDamage(attacker: BattleUnit) {
    return Math.max(
      0.1,
      attacker.castleDamage *
        this.levelRuntime.level.duration.castleDamagePacing *
        (this.battleDirector.isFinalSiege ? 1.35 : 1),
    );
  }

  private castleApproachX(unit: BattleUnit, castle: CastleState) {
    void unit;
    return castle.frontX;
  }

  private hasReachedCastleContact(unit: BattleUnit, castle: CastleState) {
    const isRanged = isRangedUnit(unit.type);
    const attackRange = isRanged ? Math.min(unit.range, 160) : 10;
    const dx = castle.frontX - unit.x;
    const forwardDistance = dx * this.advanceDirection(unit);

    // If unit has reached or crossed the castle contact plane
    if (forwardDistance <= 0) return true;

    // If within weapon attack range of castle front facade
    if (forwardDistance <= attackRange) {
      return true;
    }
    return false;
  }

  private workerHomeX(team: Team) {
    const castle = this.homeCastleForTeam(team);
    return castle.frontX + (team === "player" ? 4 : -4);
  }

  private castleFrontImpact(attacker: BattleUnit, castle: CastleState) {
    return {
      x: castle.frontX,
      y: clamp(attacker.y - 18, SPAWN_MIN_Y - 18, SPAWN_MAX_Y - 18),
    };
  }

  private fireArrow(attacker: BattleUnit, target: BattleUnit) {
    const targetId = target.id;
    this.log(
      "PROJECTILE",
      `${attacker.team} ${attacker.type}#${attacker.id} projectile -> ${target.type}#${target.id}`,
    );

    this.fireArrowAtPosition(attacker, target.x, target.y - 18, () => {
      const candidate = this.unitById.get(targetId);
      const liveTarget = candidate?.hp && candidate.hp > 0 ? candidate : undefined;

      if (!liveTarget) {
        return;
      }

      const dealtDamage = this.applyDamageToUnit(attacker, liveTarget, attacker.damage);
      this.createHitEffect(liveTarget.x, liveTarget.y - 18, attacker.type);
      this.createDamageText(liveTarget.x, liveTarget.y - 45, dealtDamage, t("game_zing"));
      this.flashUnitHit(liveTarget);
    });
  }

  private fireArrowAtPosition(
    attacker: BattleUnit,
    targetX: number,
    targetY: number,
    onHit: () => void,
  ) {
    this.playArrowShotSfx(attacker);
    const arrow = this.acquireArrow().setPosition(attacker.x, attacker.y - 18);
    arrow.setRotation(
      Math.atan2(targetY - (attacker.y - 18), targetX - attacker.x),
    );

    this.tweens.add({
      targets: arrow,
      x: targetX,
      y: targetY,
      duration: PROJECTILE_FLIGHT_MS,
      ease: "Linear",
      onComplete: () => {
        arrow.setActive(false).setVisible(false);
        onHit();
      },
    });
  }

  private acquireArrow() {
    for (const arrow of this.arrowPool) {
      if (!arrow.active) {
        this.tweens.killTweensOf(arrow);
        return arrow.setActive(true).setVisible(true).setAlpha(1).setDisplaySize(38, 10).setDepth(920);
      }
    }
    const arrow = this.add.image(0, 0, "projectile-arrow").setDisplaySize(38, 10).setDepth(920);
    this.arrowPool.push(arrow);
    return arrow;
  }

  private applyDamageToUnit(
    attacker: BattleUnit,
    target: BattleUnit,
    damage: number,
  ) {
    if (target.isInsideCastle) {
      return 0;
    }

    const multiplier = UNIT_CONFIGS[attacker.type].damageMultipliers?.[target.type] ?? 1;
    const appliedDamage = Math.max(
      0,
      Math.round(damage * multiplier),
    );
    target.hp -= appliedDamage;
    this.applyAreaDamage(attacker, target, appliedDamage);

    if (target.hp <= 0) {
      target.hp = 0;
      this.units.forEach((unit) => {
        if (unit.targetId === target.id) {
          unit.targetId = undefined;
        }
      });

      this.log(
        "KO",
        `${attacker.team} ${attacker.type}#${attacker.id} defeated ${target.type}#${target.id}`,
      );
      this.balanceTelemetry.recordMatchupKill(attacker.type, target.type);
      if (attacker.team === "player" && multiplier > 1) {
        this.masteryCounterKills += 1;
        this.log("COUNTER_MATCHUP", `attacker=${attacker.type} target=${target.type} multiplier=${multiplier} total=${this.masteryCounterKills}`);
      }
    }

    return appliedDamage;
  }

  private applyAreaDamage(attacker: BattleUnit, primaryTarget: BattleUnit, damage: number) {
    const areaDamage = UNIT_CONFIGS[attacker.type].areaDamage;

    if (!areaDamage || damage <= 0) {
      return;
    }

    for (const unit of this.units) {
      if (
        unit.id === primaryTarget.id ||
        unit.team === attacker.team ||
        unit.hp <= 0 ||
        unit.isInsideCastle
      ) {
        continue;
      }

      const distance = Math.sqrt((unit.x - primaryTarget.x) * (unit.x - primaryTarget.x) + (unit.y - primaryTarget.y) * (unit.y - primaryTarget.y));

      if (distance > areaDamage.radius) {
        continue;
      }

      const splashDamage = Math.max(
        1,
        Math.round(damage * areaDamage.splashMultiplier * (1 - distance / areaDamage.radius * 0.35)),
      );
      unit.hp = Math.max(0, unit.hp - splashDamage);
      this.createDamageText(unit.x, unit.y - 48, splashDamage, t("game_splash"));
      this.flashUnitHit(unit);
    }
  }

  private syncOnlineUnitTransform(unit: BattleUnit) {
    unit.container.setPosition(unit.x, unit.y);
    // setDepth marks Phaser's whole display list for sorting. Quantizing it
    // avoids sorting the complete map for every sub-pixel soldier movement.
    const depthBucket = Math.round(unit.y / 32) * 32 + UNIT_DEPTH_OFFSET;
    if (unit.visualDepthBucket !== depthBucket) {
      unit.visualDepthBucket = depthBucket;
      unit.container.setDepth(depthBucket);
    }
  }

  private syncUnitVisual(unit: BattleUnit) {
    this.syncOnlineUnitTransform(unit);
    const alpha = unit.isInsideCastle ? 0.42 : 1;
    if (unit.visualAlpha !== alpha) {
      unit.visualAlpha = alpha;
      unit.container.setAlpha(alpha);
    }
    const hpWidthRatio = clamp(unit.hp / unit.maxHp, 0, 1);
    if (unit.visualHpWidth !== hpWidthRatio) {
      unit.visualHpWidth = hpWidthRatio;
      // Use scaleX to scale the banner fill from its center
      unit.hpFill.scaleX = hpWidthRatio;
    }
    const flipX = unit.facingDirection < 0;
    if (unit.visualFlipX !== flipX) {
      unit.visualFlipX = flipX;
      unit.sprite.setFlipX(flipX);
    }
    // The team-colored atlases already identify ownership. Four independent
    // transformed geometry objects per healthy unit made sparse, real battles
    // more expensive than the dense perf scenario. Keep only useful damage
    // feedback while a small skirmish is on screen.
    const dense = this.units.length >= FX_DENSE_UNIT_THRESHOLD;
    const hideHealth = dense || unit.hp >= unit.maxHp;
    if (unit.visualDense !== hideHealth) {
      unit.visualDense = hideHealth;
      unit.shadow.setVisible(false);
      unit.hpBack.setVisible(!hideHealth);
      unit.hpFill.setVisible(!hideHealth);
    }

    const visualAction = this.unitVisualAction(unit);
    const animationKey = this.unitAnimationKey(
      unit.team,
      unit.type,
      visualAction,
    );
    if (unit.sprite.anims.currentAnim?.key !== animationKey) {
      unit.sprite.play(animationKey, true);
    }
    const animationTimeScale = this.unitAnimationTimeScale(
      unit,
      visualAction,
    );
    if (Math.abs(unit.sprite.anims.timeScale - animationTimeScale) > 0.01) {
      unit.sprite.anims.timeScale = animationTimeScale;
    }
    if (unit.visualAction !== visualAction || (!dense && this.elapsedMs >= (unit.nextVisualPolishAt ?? 0))) {
      this.applyUnitAnimationPolish(unit, visualAction);
      unit.visualAction = visualAction;
      unit.nextVisualPolishAt = this.elapsedMs + 34;
    }

    let tint: number | null = null;
    if (unit.iceSlowUntil > this.elapsedMs) {
      tint = 0xaeeeff;
    } else if (unit.isInsideCastle) {
      tint = 0xcfe8ff;
    } else if (unit.state === "attackUnit" || unit.state === "attackCastle") {
      tint = isRangedUnit(unit.type) ? 0xdff7ff : 0xffffff;
    } else if (unit.state === "gather") {
      tint = 0xfff2b8;
    }
    if (unit.visualTint !== tint) {
      unit.visualTint = tint;
      if (tint === null) unit.sprite.clearTint();
      else unit.sprite.setTint(tint);
    }
  }

  private unitVisualAction(unit: BattleUnit): UnitVisualAction {
    if (unit.iceSlowUntil > this.elapsedMs) {
      return "idle";
    }

    if (
      unit.state === "attackUnit" ||
      unit.state === "attackCastle" ||
      unit.state === "gather"
    ) {
      return "attack";
    }

    if (
      unit.state === "move" ||
      unit.state === "chase" ||
      unit.state === "seekResource" ||
      unit.state === "returnResource"
    ) {
      return "run";
    }

    return "idle";
  }

  private facePosition(unit: BattleUnit, targetX: number) {
    if (Math.abs(targetX - unit.x) > 2) {
      unit.facingDirection = targetX > unit.x ? 1 : -1;
    }
  }

  private restartUnitAttack(unit: BattleUnit) {
    unit.sprite.play(
      this.unitAnimationKey(unit.team, unit.type, "attack"),
      false,
    );
  }

  private unitAnimationTimeScale(
    unit: BattleUnit,
    visualAction: UnitVisualAction,
  ) {
    const unitVisualTimeScale = unit.type === "swordsman"
      ? SWORDSMAN_RUN_ATTACK_ANIMATION_TIME_SCALE
      : 1;

    if (visualAction === "attack") {
      // Play the authored strike as a readable combat gesture, not a hit flash.
      // Fast attackers may restart during recovery, which is preferable to
      // compressing all 16 authored poses into a twitchy half-second burst.
      const minimumCycleMs = isRangedUnit(unit.type) ? 980 : 1_200;
      const desiredCycleMs = clamp(
        this.effectiveUnitAttackCooldown(unit) * 1.08,
        minimumCycleMs,
        1_800,
      );
      return UNIT_ATTACK_REFERENCE_CYCLE_MS / desiredCycleMs * unitVisualTimeScale;
    }

    if (visualAction === "run") {
      // One 16-frame stride is about 1.33 s at reference swordsman
      // speed. The new 60 FPS-friendly atlases have more poses than the old
      // sheets, so the timeline must be calmer rather than denser and faster.
      // This range keeps cavalry readable and prevents heavy/worker units from
      // pedaling while barely advancing across the battlefield.
      return clamp(unit.speed / 43, 0.8, 1.05) * unitVisualTimeScale;
    }

    return 1;
  }

  private unitBaseSpriteSize(type: UnitType) {
    if (isCavalryUnit(type)) {
      return 61;
    }
    if (isWorkerUnit(type)) {
      return 46;
    }
    return 50;
  }

  private applyUnitAnimationPolish(
    unit: BattleUnit,
    visualAction: UnitVisualAction,
  ) {
    const baseSpriteScale = this.unitBaseSpriteSize(unit.type) / UNIT_ATLAS_SIZE;
    const actionVisualScale = visualAction === "run"
      ? UNIT_IDLE_TO_RUN_VISUAL_SCALE[unit.type]
      : visualAction === "attack"
        ? UNIT_IDLE_TO_ATTACK_VISUAL_SCALE[unit.type]
        : 1;
    const idleBottomFromOrigin = UNIT_IDLE_ATLAS_BOTTOM[unit.type] - UNIT_ATLAS_SIZE / 2;
    const visualBottomFromOrigin = (visualAction === "idle"
      ? UNIT_IDLE_ATLAS_BOTTOM[unit.type]
      : UNIT_RUN_ATLAS_BOTTOM[unit.type]) - UNIT_ATLAS_SIZE / 2;
    const baseY = -2 + baseSpriteScale * (
      idleBottomFromOrigin - visualBottomFromOrigin * actionVisualScale
    );
    unit.sprite.setScale(baseSpriteScale * actionVisualScale);
    unit.sprite.setPosition(0, baseY);
    unit.sprite.setAngle(0);
    unit.shadow.setScale(1, 1);
    unit.shadow.setAlpha(unit.isInsideCastle ? 0.08 : 0.18);

    if (visualAction === "run") {
      unit.sprite.setPosition(0, baseY);
      unit.sprite.setAngle(0);
      return;
    }

    if (visualAction === "idle") {
      unit.sprite.setPosition(0, baseY);
      unit.sprite.setAngle(0);
      return;
    }

    // The 16 attack frames already contain anticipation, strike and recovery.
    // Do not stack the legacy procedural rotation/lunge on top of that motion.
    unit.sprite.setPosition(0, baseY);
    unit.sprite.setAngle(0);
  }

  private cleanupUnits() {
    const living: BattleUnit[] = [];

    for (const unit of this.units) {
      const outsideWorld = unit.x < WORLD_LEFT - 100 || unit.x > WORLD_RIGHT + 100;

      if (outsideWorld) {
        if (!unit.completedDelivery && !this.telemetryLossUnitIds.has(unit.id)) {
          this.telemetryLossUnitIds.add(unit.id);
          this.balanceTelemetry.recordLoss(unit.team, unit.type, unit.carryWood);
        }
        this.releaseResourceReservation(unit);
        unit.container.destroy();
        continue;
      }

      if (unit.hp <= 0) {
        if (unit.deathStartedAt === undefined) {
          unit.deathStartedAt = this.elapsedMs;
          if (!unit.completedDelivery && !this.telemetryLossUnitIds.has(unit.id)) {
            this.telemetryLossUnitIds.add(unit.id);
            this.balanceTelemetry.recordLoss(unit.team, unit.type, unit.carryWood);
          }
          this.releaseResourceReservation(unit);

          if (isWorkerUnit(unit.type) && unit.carryWood > 0) {
            this.createGoldPop(unit.x, unit.y - 38, "WOOD LOST");
            this.log(
              "WORKER",
              `${unit.team} peasant died; ${unit.carryWood} carried wood was lost`,
            );
          }

          unit.hpBack.setVisible(false);
          unit.hpFill.setVisible(false);
          unit.sprite.stop();
          unit.shadow.setAlpha(0.12);
          this.tweens.killTweensOf(unit.container);
          this.tweens.add({
            targets: unit.container,
            y: unit.y - 24,
            alpha: 0,
            scaleX: unit.container.scaleX * 1.1,
            scaleY: unit.container.scaleY * 1.1,
            duration: UNIT_DEATH_ANIMATION_MS,
            ease: "Quad.Out",
          });
          this.log(
            "DEATH_ANIM",
            `${unit.team} ${unit.type}#${unit.id} duration=${UNIT_DEATH_ANIMATION_MS}ms`,
          );
        }

        if (this.elapsedMs - unit.deathStartedAt >= UNIT_DEATH_ANIMATION_MS) {
          unit.container.destroy();
        } else {
          living.push(unit);
        }
        continue;
      }

      living.push(unit);
    }

    this.units = living;
  }

  private updateBalanceTelemetry() {
    if (this.elapsedMs < this.nextTelemetrySampleAt) return;
    this.nextTelemetrySampleAt = this.elapsedMs + 250;
    const telemetryDelta = Math.max(0, this.elapsedMs - this.lastTelemetryAt);
    this.lastTelemetryAt = this.elapsedMs;
    for (const team of ["player", "enemy"] as const) {
      const idleWorkerCount = this.units.filter(
        (unit) =>
          unit.team === team &&
          isWorkerUnit(unit.type) &&
          unit.hp > 0 &&
          !unit.isInsideCastle &&
          unit.state === "seekResource" &&
          unit.targetResourceId === undefined,
      ).length;
      this.balanceTelemetry.recordWorkerIdle(team, telemetryDelta * idleWorkerCount);
    }
    const playerWorkers = this.activeWorkerCount("player");
    const enemyWorkers = this.activeWorkerCount("enemy");
    const playerCombatUnits = this.activeCombatUnitCount("player");
    const enemyCombatUnits = this.activeCombatUnitCount("enemy");
    this.updateBalanceStallTelemetry(playerCombatUnits, enemyCombatUnits);
    this.balanceTelemetry.recordPopulation("player", playerWorkers, playerCombatUnits, telemetryDelta);
    this.balanceTelemetry.recordPopulation("enemy", enemyWorkers, enemyCombatUnits, telemetryDelta);

    if (this.elapsedMs < this.nextBalanceSnapshotAt) return;

    const performanceWithMemory = performance as Performance & {
      memory?: { usedJSHeapSize: number };
    };
    const snapshot = {
      second: Math.round(this.elapsedMs / 1000),
      fps: Math.round(this.game.loop.actualFps * 10) / 10,
      jsHeapMb: performanceWithMemory.memory
        ? Math.round((performanceWithMemory.memory.usedJSHeapSize / 1_048_576) * 10) / 10
        : null,
      playerGold: Math.floor(this.gold),
      enemyGold: Math.floor(this.enemyGold),
      playerCastleHp: Math.round(this.playerCastle.hp),
      enemyCastleHp: Math.round(this.enemyCastle.hp),
      playerWorkers,
      enemyWorkers,
      playerCombatUnits,
      enemyCombatUnits,
      playerFrontX: this.balanceFrontX("player"),
      enemyFrontX: this.balanceFrontX("enemy"),
      playerWorkerState: this.balanceWorkerState("player"),
      enemyWorkerState: this.balanceWorkerState("enemy"),
      tension: Math.round(clamp((this.armyGoldValue("player") + this.armyGoldValue("enemy")) / 90, 0, 1) * 1000) / 1000,
      frontControl: Math.round(this.frontlineControl() * 1000) / 1000,
      playerIncomeLast60: this.incomeLast60("player"),
      enemyIncomeLast60: this.incomeLast60("enemy"),
      playerArmyGold: Math.round(this.armyGoldValue("player") * 10) / 10,
      enemyArmyGold: Math.round(this.armyGoldValue("enemy") * 10) / 10,
      combatTempo: Math.round(this.battleTempoMultiplier() * 1000) / 1000,
      avgSimulationMs: Math.round((this.perfSimulationMs / Math.max(1, this.perfSimulationSteps)) * 100) / 100,
      avgUnitUpdateMs: Math.round((this.perfUnitUpdateMs / Math.max(1, this.perfSimulationSteps)) * 100) / 100,
    };
    this.balanceTelemetry.addSnapshot(snapshot);
    if (import.meta.env.VITE_ANDROID_RUNTIME_TELEMETRY === "1") {
      console.log(`[CastleRuntimePerf] ${JSON.stringify(snapshot)}`);
    }
    this.log("BALANCE_SNAPSHOT", JSON.stringify(snapshot));
    this.perfSimulationMs = 0;
    this.perfUnitUpdateMs = 0;
    this.perfSimulationSteps = 0;
    this.nextBalanceSnapshotAt += 10_000;
  }

  private updateBalanceStallTelemetry(playerCombatUnits: number, enemyCombatUnits: number) {
    const sealed = this.battleDirector.isCastleSealHolding(
      this.enemyCastle.hp,
      this.enemyCastle.maxHp,
    );
    const noDefenders =
      sealed &&
      playerCombatUnits >= 5 &&
      enemyCombatUnits === 0 &&
      this.enemyCastle.hp > 0;
    if (noDefenders && this.enemyNoDefenderStartedAt === undefined) {
      this.enemyNoDefenderStartedAt = this.elapsedMs;
    } else if (!noDefenders && this.enemyNoDefenderStartedAt !== undefined) {
      const durationMs = this.elapsedMs - this.enemyNoDefenderStartedAt;
      if (durationMs >= 8_000) {
        this.balanceTelemetry.recordStallEvent({
          second: Math.round(this.elapsedMs / 1000),
          type: "no_defenders",
          durationMs,
        });
        this.log("STALL", `enemy no_defenders duration_ms=${Math.round(durationMs)}`);
      }
      this.enemyNoDefenderStartedAt = undefined;
    }

    if (sealed && this.sealWaitStartedAt === undefined) {
      this.sealWaitStartedAt = this.elapsedMs;
    } else if (!sealed && this.sealWaitStartedAt !== undefined) {
      // Telemetry sampling may observe the transition one simulation step
      // late at high QA speeds. The authoritative seal lifetime is the
      // director warning window and can never exceed it.
      const durationMs = Math.min(
        this.elapsedMs - this.sealWaitStartedAt,
        this.levelRuntime.level.director.warningMs,
      );
      this.balanceTelemetry.recordStallEvent({
        second: Math.round(this.elapsedMs / 1000),
        type: "seal_wait",
        durationMs,
      });
      this.sealWaitStartedAt = undefined;
    }
  }

  private balanceFrontX(team: Team) {
    const positions = this.units
      .filter(
        (unit) =>
          unit.team === team &&
          !isWorkerUnit(unit.type) &&
          unit.hp > 0 &&
          !unit.isInsideCastle,
      )
      .map((unit) => Math.round(unit.x));
    if (positions.length === 0) return null;
    return team === "player" ? Math.max(...positions) : Math.min(...positions);
  }

  private balanceWorkerState(team: Team) {
    return this.units
      .filter(
        (unit) =>
          unit.team === team &&
          isWorkerUnit(unit.type) &&
          unit.hp > 0 &&
          !unit.isInsideCastle,
      )
      .map(
        (unit) =>
          `${unit.id}@${Math.round(unit.x)},${Math.round(unit.y)}:${unit.state}:node${unit.targetResourceId ?? "-"}:wood${unit.carryWood}`,
      );
  }

  private updateUi() {
    this.setTextIfChanged(this.goldText, `${Math.floor(this.gold)}`);
    this.setTextIfChanged(this.enemyGoldText, `${Math.floor(this.enemyGold)}`);
    if (this.isOnline) {
      this.setTextIfChanged(this.directorText, "");
    } else {
      const seal = this.battleDirector.isCastleSealHolding(this.enemyCastle.hp, this.enemyCastle.maxHp)
        ? " · MUHUR AKTIF"
        : "";
      this.setTextIfChanged(this.directorText,
        `${this.battleDirector.phaseLabel} · RESERVES ${this.battleDirector.reserveRemaining}${seal}${this.battleDirector.isFinalSiege ? " · FINAL SIEGE" : ""}`,
      );
    }
    const playerCastleWidth = CASTLE_HP_BAR_WIDTH * clamp(this.playerCastle.hp / this.playerCastle.maxHp, 0, 1);
    const enemyCastleWidth = CASTLE_HP_BAR_WIDTH * clamp(this.enemyCastle.hp / this.enemyCastle.maxHp, 0, 1);
    if (this.playerCastle.hpFill.width !== playerCastleWidth) this.playerCastle.hpFill.width = playerCastleWidth;
    if (this.enemyCastle.hpFill.width !== enemyCastleWidth) this.enemyCastle.hpFill.width = enemyCastleWidth;

    const playerWorkers = this.activeWorkerCount("player");
    const enemyWorkers = this.activeWorkerCount("enemy");
    const workerCap = this.currentWorkerCap();
    const pendingWorkers = this.pendingWorkerCount();
    const playerCombatUnits = this.isOnline ? 0 : this.activeCombatUnitCount("player");
    const enemyCombatUnits = this.isOnline ? 0 : this.activeCombatUnitCount("enemy");
    if (this.debugText.visible) {
      const woodLeft = this.resourceNodes.reduce((total, node) => total + node.amount, 0);
      this.setTextIfChanged(this.debugText,
        `units ${this.units.length} | workers ${playerWorkers}/${workerCap} | wood ${woodLeft} | selected ${this.selectedUnit ?? "-"} | t ${Math.floor(this.elapsedMs / 1000)}s`,
      );
    }

    for (const button of this.unitButtons) {
      const isLocalButton = button.side === this.localPanelSide();
      const bank = button.side === "left" ? this.gold : this.enemyGold;
      const spendableBank = isLocalButton && this.isOnline ? this.availableLocalGold() : bank;
      const remainingCooldownMs = Math.max(0, button.readyAt - this.elapsedMs);
      const cooldownTotal = UNIT_DEPLOY_COOLDOWN_MS[button.type];
      const coolingDown =
        isLocalButton &&
        remainingCooldownMs > 0 &&
        cooldownTotal >= DEPLOY_COOLDOWN_UI_THRESHOLD_MS;
      const selected = isLocalButton && this.selectedUnit === button.type;
      const pulsing = button.pulseUntil > this.elapsedMs;
      const queuedForButton = isLocalButton ? this.queuedUnitCount(button.type) : 0;
      const workerMaxed =
        isWorkerUnit(button.type) &&
        (button.side === "left" ? playerWorkers : enemyWorkers) +
          (isLocalButton ? pendingWorkers : 0) >= workerCap;
      const armyFull =
        !this.isOnline &&
        !isWorkerUnit(button.type) &&
        (button.side === "left" ? playerCombatUnits : enemyCombatUnits) +
          (isLocalButton ? this.pendingCombatCount() : 0) >=
          COMBAT_UNIT_CAP;
      const alpha =
        spendableBank >= UNIT_CONFIGS[button.type].cost && !workerMaxed && !armyFull
          ? coolingDown
            ? 0.72
            : 1
          : 0.48;

      const queuedCount = queuedForButton;
      this.setTextIfChanged(button.label,
        workerMaxed || armyFull
          ? isWorkerUnit(button.type) ? "MAXED" : "MAX OUT"
          : UNIT_CONFIGS[button.type].shortLabel,
      );
      this.setTextIfChanged(button.text, `${UNIT_CONFIGS[button.type].cost}`);
      const hasQueued = queuedCount > 0;
      const fillColor = selected ? 0xcab786 : pulsing ? 0xc98d78 : 0xc2aa79;
      const borderThickness = button.card.width <= 42 ? 4 : 5;
      const borderColor = selected
        ? 0x2d8994
        : pulsing
          ? 0xa94b39
          : button.side === "left"
            ? 0x3b2b21
            : 0x603b39;
      const visualStateKey = `${alpha}|${fillColor}|${borderThickness}|${borderColor}|${selected ? 1 : 0}|${hasQueued ? 1 : 0}|${coolingDown ? 1 : 0}`;
      if (button.visualStateKey !== visualStateKey) {
        button.visualStateKey = visualStateKey;
        button.card.setAlpha(alpha).setFillStyle(fillColor);
        button.border.setAlpha(alpha).setStrokeStyle(borderThickness, borderColor);
        button.selectionSeal.setAlpha(alpha).setVisible(selected);
        button.icon.setAlpha(alpha);
        button.label.setAlpha(alpha);
        button.text.setAlpha(alpha);
        button.batchBack.setVisible(hasQueued).setAlpha(hasQueued ? 0.86 : alpha);
        button.batchText.setVisible(hasQueued);
        button.cooldownFill.setVisible(coolingDown);
        button.cooldownText.setVisible(coolingDown);
      }
      this.setTextIfChanged(button.batchText, queuedCount > 0 ? `x${queuedCount}` : "");

      if (coolingDown) {
        const cooldownHeight = button.card.displayHeight || button.card.height;
        button.cooldownFill.height =
          cooldownHeight * clamp(remainingCooldownMs / cooldownTotal, 0, 1);
        this.setTextIfChanged(button.cooldownText, `${Math.ceil(remainingCooldownMs / 1000)}`);
      }
    }

    this.updatePendingBatchHud();
    this.updatePowerUi();
    const canRemoveSelection = this.pendingUnitCount() > 0 || !!this.selectedUnit || (this.isOnline && !!this.activePower);
    this.removeSelectionLabel?.setText(this.isOnline && this.activePower ? "CANCEL" : t("game_remove"));
    this.setRemoveSelectionVisible(canRemoveSelection);
  }

  private setTextIfChanged(target: Phaser.GameObjects.Text, value: string) {
    if (target.text !== value) target.setText(value);
  }

  private setRemoveSelectionVisible(visible: boolean) {
    const button = this.removeSelectionButton;
    if (!button || this.removeSelectionVisible === visible) return;

    this.removeSelectionVisible = visible;
    this.tweens.killTweensOf(button);

    if (visible) {
      button.setVisible(true).setAlpha(0).setScale(0.72).setInteractive({ useHandCursor: true });
      this.tweens.add({
        targets: button,
        alpha: 1,
        scaleX: 1,
        scaleY: 1,
        duration: 170,
        ease: "Back.Out",
      });
      return;
    }

    button.disableInteractive();
    this.tweens.add({
      targets: button,
      alpha: 0,
      scaleX: 0.72,
      scaleY: 0.72,
      duration: 140,
      ease: "Sine.In",
      onComplete: () => {
        if (!this.removeSelectionVisible && button.active) button.setVisible(false);
      },
    });
  }

  private updatePendingBatchHud() {
    const hasPending = this.pendingUnitCount() > 0;
    if (this.pendingBatchBack.visible !== hasPending) this.pendingBatchBack.setVisible(hasPending);
    if (this.pendingBatchText.visible !== hasPending) this.pendingBatchText.setVisible(hasPending);

    if (!hasPending) {
      this.setTextIfChanged(this.pendingBatchText, "");
      return;
    }

    this.setTextIfChanged(this.pendingBatchText,
      `${this.pendingDeploySummary()}  →  PLACE IN TURQUOISE AREA`,
    );
  }

  private currentWorkerCap() {
    return this.isOnline ? 2 : this.levelRuntime.level.economy.maxWorkers;
  }

  private activeWorkerCount(team: Team) {
    return this.units.filter(
      (unit) => unit.team === team && isWorkerUnit(unit.type) && unit.hp > 0,
    ).length;
  }

  private activeCombatUnitCount(team: Team) {
    return this.units.filter(
      (unit) => unit.team === team && !isWorkerUnit(unit.type) && unit.hp > 0,
    ).length;
  }

  private playerPowerUnlockLevel(power: PowerType) {
    return power === "missile"
      ? this.levelRuntime.level.player.powers.missileUnlockLevel
      : this.levelRuntime.level.player.powers.iceUnlockLevel;
  }

  private playerPowerUnlocked(power: PowerType) {
    return this.isOnline || this.levelRuntime.level.order >= this.playerPowerUnlockLevel(power);
  }

  private selectPower(power: PowerType) {
    if (this.battleEnded || this.isPaused) {
      return;
    }
    if (this.isOnlineWaitingForStart()) {
      this.statusText.setText(t("game_online_arena_waiting"));
      return;
    }
    if (!this.playerPowerUnlocked(power)) {
      const unlockLevel = this.playerPowerUnlockLevel(power);
      this.statusText.setText(
        `${power === "missile" ? "Missile" : "Ice Blast"} unlocks at level ${unlockLevel}.`,
      );
      this.log(
        "POWER_LOCK",
        `player power=${power} currentLevel=${this.levelRuntime.level.order} unlockLevel=${unlockLevel}`,
      );
      return;
    }

    const readyAt = power === "missile" ? this.missileReadyAt : this.iceReadyAt;

    if (readyAt > this.elapsedMs) {
      this.statusText.setText(t("game_power_not_ready", { power: power === "missile" ? "Missile" : "Ice Blast" }));
      return;
    }

    this.cancelMissileAim();
    this.refundPendingDeployQueue();
    this.selectedUnit = undefined;
    this.activePower = power;
    this.spawnStripe.setVisible(power !== "missile");
    this.spawnMarker.setVisible(false);
    this.statusText.setText(
      power === "missile"
        ? "MISSILE READY: hold the center button and release to launch."
        : "ICE BLAST READY: select an area to freeze.",
    );
    this.flashWarning(power === "missile" ? "MISSILE READY" : "ICE BLAST READY");
    this.updateMissileAim();
    if (this.isOnline) this.updateUi();
  }

  private tryCastPower(power: PowerType, x: number, y: number) {
    if (this.isOnlineWaitingForStart()) {
      this.statusText.setText(t("game_online_arena_waiting"));
      return;
    }
    if (!this.playerPowerUnlocked(power)) {
      this.activePower = undefined;
      return;
    }

    const isInWorld = x > WORLD_LEFT && x < WORLD_RIGHT && y > 52 && y < 668;

    if (!isInWorld) {
      return;
    }

    if (this.isOnline) {
      this.onlineRuntime?.usePower(power, x, y);
      if (power === "missile") this.missileReadyAt = this.elapsedMs + MISSILE_COOLDOWN_MS;
      else this.iceReadyAt = this.elapsedMs + ICE_BLAST_COOLDOWN_MS;
    } else if (power === "missile") {
      this.castMissile("player", x, y);
      this.missileReadyAt = this.elapsedMs + MISSILE_COOLDOWN_MS;
    } else {
      this.castIceBlast("player", x, y);
      this.iceReadyAt = this.elapsedMs + ICE_BLAST_COOLDOWN_MS;
    }

    this.cancelMissileAim();
    this.activePower = undefined;
    if (this.isOnline) this.spawnStripe.setVisible(false);
    if (this.isOnline) this.updateUi();
    this.statusText.setText(t("game_power_used_hint"));
  }

  private castMissile(
    sourceTeam: Team,
    x: number,
    y: number,
    targetCount = 0,
    enemyContext?: EnemyPowerCastContext,
  ) {
    const startY = -40;
    const missile = this.add
      .rectangle(x - 72, startY, 56, 12, 0xbb2c24)
      .setStrokeStyle(3, 0xffffff)
      .setRotation(0.75)
      .setDepth(1300);
    const smoke = this.add.image(x - 104, startY - 28, "effect_smoke_puff").setDepth(1299).setScale(1.125);

    this.tweens.add({
      targets: [missile, smoke],
      x,
      y,
      duration: 520,
      ease: "Quad.In",
      onComplete: () => {
        missile.destroy();
        smoke.destroy();
        this.playPowerSfx("online-missile-impact-sfx", 0.56);
        this.showMissileImpact(x, y);
        const combatAffected = this.units.filter(
          (unit) =>
            unit.team !== sourceTeam &&
            !isWorkerUnit(unit.type) &&
            unit.hp > 0 &&
            ((unit.x - x) * (unit.x - x) + (unit.y - y) * (unit.y - y)) <= (MISSILE_RADIUS) * (MISSILE_RADIUS),
        ).length;
        const impact = this.damageUnitsInRadius(sourceTeam, x, y, MISSILE_RADIUS, MISSILE_DAMAGE);
        const escapedCount = Math.max(0, targetCount - combatAffected);
        this.log(
          "POWER",
          `${sourceTeam} missile x=${Math.round(x)} y=${Math.round(y)} affected=${impact.affected} combatAffected=${combatAffected} escaped=${escapedCount} damage=${impact.damage}${enemyContext ? ` use=${enemyContext.castIndex}/${this.levelRuntime.level.enemy.powers.maxCastsPerMatch}` : ""}`,
        );
        this.balanceTelemetry.recordPowerEvent({
          second: Math.round(this.elapsedMs / 1000),
          team: sourceTeam,
          power: "missile",
          type: "cast",
          targetCount,
          affectedCount: impact.affected,
          damage: impact.damage,
          escapedCount,
          ...(enemyContext ?? {}),
        });
      },
    });
  }

  private castIceBlast(
    sourceTeam: Team,
    x: number,
    y: number,
    targetCount = 0,
    enemyContext?: EnemyPowerCastContext,
  ) {
    this.playPowerSfx("online-ice-blast-sfx", 0.46);
    this.showIceImpact(x, y, ICE_BLAST_RADIUS);
    let affectedCount = 0;

    for (const unit of this.units) {
      if (unit.team === sourceTeam || unit.hp <= 0) {
        continue;
      }

      if (((unit.x - x) * (unit.x - x) + (unit.y - y) * (unit.y - y)) <= (ICE_BLAST_RADIUS) * (ICE_BLAST_RADIUS)) {
        affectedCount += 1;
        unit.iceSlowUntil = Math.max(
          unit.iceSlowUntil,
          this.elapsedMs + ICE_BLAST_DURATION_MS,
        );
        unit.sprite.setTint(0xaeeeff);
      }
    }

    this.flashWarning("ICE BLAST");
    const combatAffected = this.units.filter(
      (unit) =>
        unit.team !== sourceTeam &&
        !isWorkerUnit(unit.type) &&
        unit.hp > 0 &&
        ((unit.x - x) * (unit.x - x) + (unit.y - y) * (unit.y - y)) <= (ICE_BLAST_RADIUS) * (ICE_BLAST_RADIUS),
    ).length;
    const escapedCount = Math.max(0, targetCount - combatAffected);
    this.log(
      "POWER",
      `${sourceTeam} ice x=${Math.round(x)} y=${Math.round(y)} affected=${affectedCount} combatAffected=${combatAffected} escaped=${escapedCount}${enemyContext ? ` use=${enemyContext.castIndex}/${this.levelRuntime.level.enemy.powers.maxCastsPerMatch}` : ""}`,
    );
    this.balanceTelemetry.recordPowerEvent({
      second: Math.round(this.elapsedMs / 1000),
      team: sourceTeam,
      power: "ice",
      type: "cast",
      targetCount,
      affectedCount,
      escapedCount,
      ...(enemyContext ?? {}),
    });
  }

  private damageUnitsInRadius(
    sourceTeam: Team,
    x: number,
    y: number,
    radius: number,
    damage: number,
  ) {
    let affected = 0;
    let totalDamage = 0;
    for (const unit of this.units) {
      if (unit.team === sourceTeam || unit.hp <= 0) {
        continue;
      }

      const distance = Math.sqrt((unit.x - x) * (unit.x - x) + (unit.y - y) * (unit.y - y));

      if (distance > radius) {
        continue;
      }

      const scaledDamage = Math.round(damage * (1 - distance / radius * 0.45));
      affected += 1;
      totalDamage += Math.min(unit.hp, scaledDamage);
      unit.hp = Math.max(0, unit.hp - scaledDamage);
      this.createDamageText(unit.x, unit.y - 48, scaledDamage, t("game_boom"));
      this.flashUnitHit(unit);
    }
    return { affected, damage: totalDamage };
  }

  private createAreaImpact(x: number, y: number, radius: number, color: number) {
    const ring = this.add.image(x, y, "effect_runic_circle").setTint(color).setAlpha(0.6).setDepth(1240);
    ring.setScale(radius / 48);

    this.tweens.add({
      targets: ring,
      scale: radius / 26,
      alpha: 0,
      duration: 420,
      ease: "Quad.Out",
      onComplete: () => ring.destroy(),
    });
  }

  private showPowerTelegraph(
    power: PowerType,
    x: number,
    y: number,
    radius: number,
    delayMs: number,
  ) {
    if (this.battleEnded) return undefined;
    const color = power === "missile" ? 0xff4a2d : 0x74ddff;
    const marker = this.add.image(x, y, "effect_runic_circle")
      .setTint(color)
      .setAlpha(0.18)
      .setScale(radius / 48)
      .setDepth(1235);
    const pulseMs = clamp(Math.round(delayMs / 4), 110, 280);
    this.tweens.add({
      targets: marker,
      alpha: {
        from: power === "missile" ? 0.18 : 0.24,
        to: power === "missile" ? 0.7 : 0.62,
      },
      scale: { from: radius / 52, to: radius / 47 },
      duration: pulseMs,
      yoyo: true,
      repeat: Math.max(1, Math.floor(delayMs / Math.max(1, pulseMs * 2))),
      ease: "Sine.InOut",
    });
    if (delayMs > 0) {
      this.time.delayedCall(delayMs + 80, () => {
        if (marker.active) marker.destroy();
      });
    }
    return marker;
  }

  private showMissileImpact(x: number, y: number) {
    this.createAreaImpact(x, y, MISSILE_RADIUS, 0xff6a2f);
    const scorch = this.add.image(x, y + 7, MISSILE_GROUND_TEXTURE)
      .setDisplaySize(MISSILE_RADIUS * 2.15, MISSILE_RADIUS * 1.42)
      .setAlpha(0.94)
      .setRotation((Math.random() - 0.5) * 0.18)
      .setDepth(932);
    this.tweens.add({
      targets: scorch,
      alpha: 0,
      delay: MISSILE_GROUND_MARK_MS - 1_600,
      duration: 1_600,
      ease: "Sine.In",
      onComplete: () => scorch.destroy(),
    });
    if (!this.reservePowerFxBurst()) return;

    for (let index = 0; index < POWER_FX_MISSILE_FRAGMENTS; index += 1) {
      const angle = (Math.PI * 2 * index) / POWER_FX_MISSILE_FRAGMENTS + Math.random() * 0.34;
      const distance = randomInt(Math.round(MISSILE_RADIUS * 0.42), Math.round(MISSILE_RADIUS * 1.08));
      const debris = this.acquirePowerDebris()
        .setPosition(x + Math.cos(angle) * 8, y + Math.sin(angle) * 4)
        .setRotation(angle)
        .setFillStyle(index % 3 === 0 ? 0x6c4a2d : index % 3 === 1 ? 0x9a6a3c : 0x2f251c, 0.96)
        .setDisplaySize(randomInt(8, 16), randomInt(5, 10))
        .setActive(true)
        .setVisible(true)
        .setAlpha(1)
        .setDepth(1260);
      this.tweens.add({
        targets: debris,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance * 0.42 + randomInt(-12, 18),
        rotation: debris.rotation + (Math.random() > 0.5 ? 1 : -1) * randomInt(8, 18) * 0.1,
        alpha: 0,
        duration: randomInt(420, 680),
        ease: "Quad.Out",
        onComplete: () => this.releasePowerDebris(debris),
      });
    }

    this.time.delayedCall(720, () => {
      this.activePowerFxBursts = Math.max(0, this.activePowerFxBursts - 1);
    });
  }

  private showIceImpact(x: number, y: number, radius: number) {
    this.createAreaImpact(x, y, radius, 0x7ddcff);
    const frost = this.add.image(x, y, ICE_GROUND_TEXTURE)
      .setDisplaySize(radius * 2.14, radius * 1.48)
      .setAlpha(0.9)
      .setRotation((Math.random() - 0.5) * 0.12)
      .setDepth(933);
    this.tweens.add({
      targets: frost,
      alpha: 0,
      delay: Math.max(0, ICE_BLAST_DURATION_MS - 900),
      duration: 900,
      ease: "Sine.In",
      onComplete: () => frost.destroy(),
    });
    if (!this.reservePowerFxBurst()) return;

    for (let index = 0; index < POWER_FX_ICE_SHARDS; index += 1) {
      const angle = (Math.PI * 2 * index) / POWER_FX_ICE_SHARDS + Math.random() * 0.26;
      const distance = randomInt(Math.round(radius * 0.36), Math.round(radius * 1.05));
      const shard = this.acquirePowerShard()
        .setPosition(x + Math.cos(angle) * 9, y + Math.sin(angle) * 5)
        .setTint(index % 3 === 0 ? 0xc7f7ff : index % 3 === 1 ? 0x7bdcff : 0xa368ff)
        .setScale(randomInt(24, 38) / 100)
        .setRotation(angle)
        .setActive(true)
        .setVisible(true)
        .setAlpha(0.92)
        .setDepth(1260);
      this.tweens.add({
        targets: shard,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance * 0.5 + randomInt(-10, 14),
        scale: shard.scaleX * 0.55,
        rotation: shard.rotation + (Math.random() > 0.5 ? 0.9 : -0.9),
        alpha: 0,
        duration: randomInt(420, 680),
        ease: "Quad.Out",
        onComplete: () => this.releasePowerShard(shard),
      });
    }

    this.time.delayedCall(720, () => {
      this.activePowerFxBursts = Math.max(0, this.activePowerFxBursts - 1);
    });
  }

  private ensurePowerGroundTextures() {
    if (this.textures.exists(MISSILE_GROUND_TEXTURE) && this.textures.exists(ICE_GROUND_TEXTURE)) return;
    const graphics = this.make.graphics({ add: false });
    const centerX = POWER_GROUND_TEXTURE_WIDTH / 2;
    const centerY = POWER_GROUND_TEXTURE_HEIGHT / 2;
    const polygon = (points: Array<[number, number]>, fill: number, alpha: number, stroke?: number, strokeAlpha = 1, strokeWidth = 1) => {
      graphics.fillStyle(fill, alpha);
      if (stroke !== undefined) graphics.lineStyle(strokeWidth, stroke, strokeAlpha);
      graphics.beginPath();
      graphics.moveTo(points[0][0], points[0][1]);
      for (let index = 1; index < points.length; index += 1) graphics.lineTo(points[index][0], points[index][1]);
      graphics.closePath();
      graphics.fillPath();
      if (stroke !== undefined) graphics.strokePath();
    };

    if (!this.textures.exists(MISSILE_GROUND_TEXTURE)) {
      graphics.clear();
      polygon([[17, 61], [31, 39], [58, 25], [88, 20], [119, 25], [153, 38], [176, 59], [163, 82], [133, 99], [96, 105], [57, 98], [27, 82]], 0x180d08, 0.34);
      polygon([[24, 62], [40, 42], [66, 31], [97, 27], [130, 33], [161, 48], [169, 65], [148, 84], [119, 96], [83, 97], [49, 87]], 0x3a1e10, 0.92, 0xb35d28, 0.9, 4);
      polygon([[43, 62], [56, 45], [83, 38], [112, 40], [142, 51], [151, 65], [133, 78], [108, 86], [77, 84], [53, 75]], 0x160c08, 0.98, 0x6f3218, 0.9, 3);
      graphics.fillStyle(0x050302, 0.82);
      graphics.fillEllipse(centerX, centerY + 2, 72, 31);
      graphics.fillStyle(0xe36e24, 0.58);
      for (const ember of [[58, 48, 5], [127, 48, 4], [139, 72, 4], [67, 81, 3], [103, 88, 3]] as Array<[number, number, number]>) {
        graphics.fillCircle(ember[0], ember[1], ember[2]);
      }
      graphics.lineStyle(4, 0x2a140c, 0.96);
      const cracks = [
        [[52, 57], [31, 48], [17, 38]], [[58, 76], [38, 91], [22, 94]],
        [[82, 84], [73, 105], [63, 116]], [[116, 82], [131, 102], [145, 108]],
        [[138, 61], [161, 52], [181, 52]], [[118, 45], [132, 28], [144, 18]],
      ] as Array<Array<[number, number]>>;
      for (const crack of cracks) {
        graphics.beginPath();
        graphics.moveTo(crack[0][0], crack[0][1]);
        for (let index = 1; index < crack.length; index += 1) graphics.lineTo(crack[index][0], crack[index][1]);
        graphics.strokePath();
      }
      graphics.generateTexture(MISSILE_GROUND_TEXTURE, POWER_GROUND_TEXTURE_WIDTH, POWER_GROUND_TEXTURE_HEIGHT);
    }

    if (!this.textures.exists(ICE_GROUND_TEXTURE)) {
      graphics.clear();
      polygon([[13, 68], [29, 43], [55, 26], [87, 19], [121, 25], [157, 40], [181, 65], [160, 86], [128, 101], [88, 107], [49, 98], [24, 84]], 0x5265cf, 0.25, 0xb46cff, 0.78, 4);
      const facets = [
        { p: [[29, 62], [61, 34], [84, 61], [58, 77]], c: 0x79e5ff },
        { p: [[61, 34], [101, 27], [84, 61]], c: 0xc8f8ff },
        { p: [[101, 27], [145, 43], [116, 63], [84, 61]], c: 0x66bfff },
        { p: [[145, 43], [169, 66], [132, 82], [116, 63]], c: 0x976fff },
        { p: [[58, 77], [84, 61], [97, 99], [52, 91]], c: 0x4da8dc },
        { p: [[84, 61], [116, 63], [132, 82], [97, 99]], c: 0x91eaff },
      ] as Array<{ p: Array<[number, number]>; c: number }>;
      for (const facet of facets) polygon(facet.p, facet.c, 0.58, 0xe0fbff, 0.7, 2);
      graphics.lineStyle(3, 0xe9fdff, 0.92);
      const veins = [
        [[84, 61], [69, 49], [55, 45]], [[84, 61], [71, 72], [65, 85]],
        [[84, 61], [99, 48], [103, 34]], [[116, 63], [129, 53], [145, 52]],
        [[116, 63], [111, 79], [116, 92]],
      ] as Array<Array<[number, number]>>;
      for (const vein of veins) {
        graphics.beginPath();
        graphics.moveTo(vein[0][0], vein[0][1]);
        for (let index = 1; index < vein.length; index += 1) graphics.lineTo(vein[index][0], vein[index][1]);
        graphics.strokePath();
      }
      for (const crystal of [[38, 48, 9, 20], [151, 54, 8, 24], [126, 89, 7, 19], [64, 92, 6, 16]] as Array<[number, number, number, number]>) {
        polygon([[crystal[0], crystal[1] - crystal[3]], [crystal[0] + crystal[2], crystal[1]], [crystal[0], crystal[1] + 4], [crystal[0] - crystal[2], crystal[1]]], 0xb8f6ff, 0.9, 0x815cff, 0.9, 2);
      }
      graphics.generateTexture(ICE_GROUND_TEXTURE, POWER_GROUND_TEXTURE_WIDTH, POWER_GROUND_TEXTURE_HEIGHT);
    }
    graphics.destroy();
  }

  private reservePowerFxBurst() {
    if (this.activePowerFxBursts >= POWER_FX_MAX_ACTIVE_BURSTS) return false;
    this.activePowerFxBursts += 1;
    return true;
  }

  private acquirePowerShard() {
    for (const shard of this.powerFxShardPool) {
      if (!shard.active) {
        this.tweens.killTweensOf(shard);
        return shard;
      }
    }
    const shard = this.add.image(0, 0, "effect_hit_spark").setActive(false).setVisible(false);
    this.powerFxShardPool.push(shard);
    return shard;
  }

  private releasePowerShard(shard: Phaser.GameObjects.Image) {
    shard.setActive(false).setVisible(false).setAlpha(0).setScale(1).clearTint();
  }

  private acquirePowerDebris() {
    for (const debris of this.powerFxDebrisPool) {
      if (!debris.active) {
        this.tweens.killTweensOf(debris);
        return debris;
      }
    }
    const debris = this.add.rectangle(0, 0, 8, 4, 0x6c4a2d, 1).setActive(false).setVisible(false);
    this.powerFxDebrisPool.push(debris);
    return debris;
  }

  private releasePowerDebris(debris: Phaser.GameObjects.Rectangle) {
    debris.setActive(false).setVisible(false).setAlpha(0).setScale(1).setRotation(0);
  }

  private updatePowerUi() {
    this.updateSinglePowerUi("missile", this.missileCooldownFill, this.missileCooldownText, this.missileReadyAt, MISSILE_COOLDOWN_MS);
    this.updateSinglePowerUi("ice", this.iceCooldownFill, this.iceCooldownText, this.iceReadyAt, ICE_BLAST_COOLDOWN_MS);
  }

  private updateSinglePowerUi(
    power: PowerType,
    fill: Phaser.GameObjects.Arc,
    text: Phaser.GameObjects.Text,
    readyAt: number,
    cooldownMs: number,
  ) {
    if (!this.playerPowerUnlocked(power)) {
      if (!fill.visible) fill.setVisible(true);
      if (fill.alpha !== 0.78) fill.setAlpha(0.78);
      if (!text.visible) text.setVisible(true);
      if (text.style.fontSize !== "14px") text.setFontSize(14);
      this.setTextIfChanged(text, `L${this.playerPowerUnlockLevel(power)}`);
      return;
    }

    const remaining = Math.max(0, readyAt - this.elapsedMs);
    const coolingDown = remaining > 0;
    if (fill.visible !== coolingDown) fill.setVisible(coolingDown);
    if (text.visible !== coolingDown) text.setVisible(coolingDown);
    if (text.style.fontSize !== "18px") text.setFontSize(18);

    if (coolingDown) {
      const alpha = clamp(remaining / cooldownMs, 0.16, 0.72);
      if (fill.alpha !== alpha) fill.setAlpha(alpha);
      this.setTextIfChanged(text, `${Math.ceil(remaining / 1000)}`);
    }
  }

  private flashUnitButton(side: Side, type: UnitType) {
    const button = this.unitButtons.find(
      (candidate) => candidate.side === side && candidate.type === type,
    );

    if (!button) {
      return;
    }

    button.pulseUntil = this.elapsedMs + 650;
    const pulseTargets = [button.card, button.border, button.icon, button.label];
    this.tweens.killTweensOf(pulseTargets);
    button.card.setScale(1);
    button.border.setScale(1);
    button.label.setScale(1);
    button.icon.setScale(button.iconBaseScale);
    this.tweens.add({
      targets: [button.card, button.border, button.label],
      scale: 1.08,
      duration: 90,
      yoyo: true,
    });
    this.tweens.add({
      targets: button.icon,
      scale: button.iconBaseScale * 1.08,
      duration: 90,
      yoyo: true,
    });
  }

  private announceEnemySpawn(type: UnitType) {
    this.aiText.setText(t("game_ai_training", { unit: UNIT_CONFIGS[type].label }));
    this.tweens.add({
      targets: this.aiText,
      alpha: { from: 1, to: 0 },
      duration: 900,
      delay: 350,
      onComplete: () => {
        this.aiText.setAlpha(1);
        this.aiText.setText("");
      },
    });
  }

  private flashWarning(message: string) {
    if (!SHOW_BATTLE_ALERTS) {
      this.warningText.setText("").setAlpha(0);
      return;
    }

    this.warningText.setText(message);
    this.warningText.setAlpha(1);
    this.warningText.setScale(1);
    this.tweens.killTweensOf(this.warningText);
    this.tweens.add({
      targets: this.warningText,
      scale: 1.08,
      duration: 90,
      yoyo: true,
    });
    this.tweens.add({
      targets: this.warningText,
      alpha: 0,
      duration: 950,
      delay: 600,
    });
  }

  private createDamageText(
    x: number,
    y: number,
    damage: number,
    label?: string,
  ) {
    if (this.units.length >= FX_DENSE_UNIT_THRESHOLD && this.elapsedMs < this.nextDamageFxAt) return;
    if (this.units.length >= FX_DENSE_UNIT_THRESHOLD) this.nextDamageFxAt = this.elapsedMs + 240;
    const displayedDamage = Math.max(1, Math.round(damage));
    const text = this.add
      .text(x + randomInt(-8, 8), y, label ? `${label} -${displayedDamage}` : `-${displayedDamage}`, {
        fontFamily: "Arial Black",
        fontSize: label ? 17 : 14,
        color: label === t("game_zing") ? "#aeeeff" : label ? "#fff0a0" : "#ffffff",
        stroke: "#161616",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(1250);

    this.tweens.add({
      targets: text,
      y: y - 26,
      alpha: 0,
      duration: 620,
      ease: "Quad.Out",
      onComplete: () => text.destroy(),
    });
  }

  private flashUnitHit(unit: BattleUnit) {
    if (this.units.length >= FX_DENSE_UNIT_THRESHOLD && this.elapsedMs < (unit.nextHitFlashAt ?? 0)) return;
    unit.nextHitFlashAt = this.elapsedMs + (this.units.length >= FX_DENSE_UNIT_THRESHOLD ? 260 : 120);
    unit.sprite.setTint(0xffffff);
    this.tweens.add({
      targets: unit.sprite,
      alpha: 0.45,
      duration: 55,
      yoyo: true,
      onComplete: () => {
        unit.sprite.setAlpha(1);
        unit.visualTint = undefined;
      },
    });
  }

  private createHitEffect(x: number, y: number, type: UnitType) {
    if (this.units.length >= FX_DENSE_UNIT_THRESHOLD && this.elapsedMs < this.nextHitFxAt) return;
    if (this.units.length >= FX_DENSE_UNIT_THRESHOLD) this.nextHitFxAt = this.elapsedMs + 180;
    const color = isRangedUnit(type) ? 0x9ee8ff : 0xffef8a;
    const hit = this.acquireHitEffect().setPosition(x, y).setTint(color);
    hit.setRotation(Math.random() * Math.PI); // Randomize slash angle
    if (this.reserveCombatSfxSlot()) this.playSfx("hit-sfx", 0.08);
    this.tweens.add({
      targets: hit,
      scale: 2.3,
      alpha: 0,
      duration: 220,
      onComplete: () => hit.setActive(false).setVisible(false),
    });
  }

  private acquireHitEffect() {
    for (const hit of this.hitEffectPool) {
      if (!hit.active) {
        this.tweens.killTweensOf(hit);
        return hit.setActive(true).setVisible(true).setScale(1).setAlpha(1).setDepth(900);
      }
    }
    const hit = this.add.image(0, 0, "effect_hit_spark").setDepth(900);
    this.hitEffectPool.push(hit);
    return hit;
  }

  private createLevelUpEffect(unit: BattleUnit) {
    const text = this.add
      .text(unit.x, unit.y - 84, t("game_level_up"), {
        fontFamily: "Arial Black",
        fontSize: 16,
        color: "#fff4a2",
        stroke: "#3c2208",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(1200);

    this.tweens.add({
      targets: text,
      y: text.y - 26,
      alpha: 0,
      duration: 820,
      onComplete: () => text.destroy(),
    });
  }

  private createGoldPop(x: number, y: number, label: string) {
    const text = this.add
      .text(x, y, label, {
        fontFamily: "Arial Black",
        fontSize: 17,
        color: "#ffe36c",
        stroke: "#3b2607",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(1200);

    this.tweens.add({
      targets: text,
      y: y - 24,
      alpha: 0,
      duration: 720,
      onComplete: () => text.destroy(),
    });
  }

  private createHarvestEffect(x: number, y: number) {
    if (this.units.length >= FX_DENSE_UNIT_THRESHOLD) return;
    const chip = this.add
      .image(x + randomInt(-6, 6), y + randomInt(-4, 4), "effect_hit_spark")
      .setTint(0x9a6235)
      .setScale(0.3)
      .setRotation(randomInt(-8, 8) * 0.2)
      .setDepth(900);

    this.tweens.add({
      targets: chip,
      y: y - 18,
      alpha: 0,
      duration: 360,
      onComplete: () => chip.destroy(),
    });
  }

  private createWoodBurst(x: number, y: number) {
    if (this.units.length >= FX_DENSE_UNIT_THRESHOLD) return;
    for (let i = 0; i < 5; i += 1) {
      const color = i % 3 === 0 ? 0x7b4a24 : i % 3 === 1 ? 0xa56b36 : 0xc08a50;
      const chip = this.add
        .image(x + randomInt(-10, 10), y + randomInt(-4, 8), "effect_hit_spark")
        .setTint(color)
        .setScale(0.5)
        .setRotation(randomInt(-8, 8) * 0.12)
        .setDepth(940);

      this.tweens.add({
        targets: chip,
        x: chip.x + randomInt(-42, 42),
        y: chip.y + randomInt(-34, 18),
        rotation: chip.rotation + randomInt(-10, 10) * 0.18,
        alpha: 0,
        duration: randomInt(380, 680),
        ease: "Quad.Out",
        onComplete: () => chip.destroy(),
      });
    }
  }

  private createRespawnSproutEffect(x: number, y: number) {
    const burst = this.add.image(x, y + 8, "effect_spawn_burst")
      .setScale(0.1)
      .setDepth(930);

    this.tweens.add({
      targets: burst,
      y: burst.y - 20,
      scale: 1.2,
      alpha: 0,
      duration: 650,
      ease: "Quad.Out",
      onComplete: () => burst.destroy(),
    });
  }

  private unitAssetKey(team: Team, type: UnitType) {
    return `unit-${team}-${visualUnitId(type)}`;
  }

  private unitAnimationKey(
    team: Team,
    type: UnitType,
    action: UnitVisualAction,
  ) {
    return `${this.unitAssetKey(team, type)}-${action}`;
  }

  private checkBattleResult() {
    if (this.enemyCastle.hp <= 0) {
      this.finishBattle("victory");
    } else if (this.playerCastle.hp <= 0) {
      this.finishBattle("defeat");
    }
  }

  private finishBattle(result: "victory" | "defeat") {
    this.battleEnded = true;
    const masteryComplete = this.calculateMasteryComplete();
    const stars = result === "victory" ? this.calculateStars(masteryComplete) : 0;
    this.registry.set("battleResult", result);
    this.registry.set("onlineBattle", this.isOnline);
    this.registry.set("lastBattleMapId", this.levelRuntime.map.id);
    this.registry.set("onlinePlayerSide", this.isOnline ? this.localPlayerSide : null);
    this.registry.set("lastLevelId", this.levelRuntime.level.id);
    this.registry.set("battleStars", stars);
    this.registry.set("masteryComplete", masteryComplete);
    this.registry.set("masteryLabel", this.levelRuntime.level.masteryGoal.label);
    const unlockUnit = this.levelRuntime.level.rewards.unlockUnit;
    const isFirstMilestoneWin =
      result === "victory" &&
      !this.isOnline &&
      !this.editorPreview &&
      !this.balanceQaMode &&
      Boolean(unlockUnit) &&
      !isLevelCompleted(this.levelRuntime.level.id);
    this.registry.set("newlyUnlockedUnitId", isFirstMilestoneWin ? unlockUnit : null);
    if (result === "victory" && !this.isOnline && !this.editorPreview && !this.balanceQaMode) {
      markLevelCompleted(this.levelRuntime.level.id, stars);
    }
    if (!this.isOnline && !this.editorPreview && !this.balanceQaMode) {
      recordBattleAttemptResult(this.levelRuntime.level.id, result, {
        durationSeconds: this.elapsedMs / 1000,
        targetSeconds: this.levelRuntime.level.duration.targetSeconds,
        playerCastleHpRatio: this.playerCastle.hp / Math.max(1, this.playerCastle.maxHp),
        workerDeaths: this.balanceTelemetry.player.workerDeaths,
      });
    }
    this.log("RESULT", result);
    this.log(
      "BALANCE_QA",
      `match complete level=${this.levelRuntime.level.id} result=${result} duration=${Math.round(this.elapsedMs / 1000)}s`,
    );
    this.publishBalanceReport(result);
    stopSceneMusic(this, "battle-music");
    if (this.isBalanceSuitePath()) {
      this.time.delayedCall(120, () => this.advanceBalanceSuite());
      return;
    }
    this.time.delayedCall(650, () => {
      if (this.editorPreview && this.editorReturnScene === "MapEditor") {
        this.scene.start("MapEditor", { mapId: this.levelRuntime.map.id });
        return;
      }
      this.scene.start("GameOver");
    });
  }

  private publishBalanceReport(result: "victory" | "defeat") {
    if (this.balanceReportPublished) return;
    this.balanceReportPublished = true;
    if (result === "defeat") {
      this.balanceTelemetry.defeatReason = this.primaryDefeatReason();
    }
    const report = this.balanceTelemetry.finish({
      result,
      durationSeconds: this.elapsedMs / 1000,
      playerGold: this.gold,
      enemyGold: this.enemyGold,
      playerCastleHp: this.playerCastle.hp,
      playerCastleMaxHp: this.playerCastle.maxHp,
      enemyCastleHp: this.enemyCastle.hp,
      enemyCastleMaxHp: this.enemyCastle.maxHp,
    });
    (window as typeof window & { __CASTLE_BALANCE_RESULT__?: BattleBalanceReport })
      .__CASTLE_BALANCE_RESULT__ = report;
    this.syncBalanceDomBridge("castle-balance-result", report);
    const balanceWindow = window as typeof window & {
      __CASTLE_BALANCE_SUITE__?: BattleBalanceReport[];
    };
    balanceWindow.__CASTLE_BALANCE_SUITE__ = [
      ...(balanceWindow.__CASTLE_BALANCE_SUITE__ ?? []),
      report,
    ].slice(-1_000);
    this.log("BALANCE_RESULT", JSON.stringify(report));
    this.syncBalanceDomBridge("castle-balance-log", this.battleLog);
    this.forwardBalanceReport(report);
  }

  private calculateMasteryComplete() {
    const goal = this.levelRuntime.level.masteryGoal;
    const remainingHpRatio = this.playerCastle.hp / Math.max(1, this.playerCastle.maxHp);
    if (goal.type === "economy") return this.balanceTelemetry.player.workerGold >= goal.target;
    if (goal.type === "counter_kills") return this.masteryCounterKills >= goal.target;
    if (goal.type === "worker_safety") return this.balanceTelemetry.player.workerDeaths <= goal.target;
    if (goal.type === "castle_health") return remainingHpRatio * 100 >= goal.target;
    return this.playerCombatTypesUsed.size >= goal.target;
  }

  private calculateStars(masteryComplete: boolean) {
    const remainingHpRatio = this.playerCastle.hp / Math.max(1, this.playerCastle.maxHp);
    const beforeFinalSiege = this.elapsedMs <= this.levelRuntime.level.duration.targetSeconds * 1_150;

    if (masteryComplete && remainingHpRatio >= 0.45 && beforeFinalSiege) {
      return 3;
    }

    if (masteryComplete || remainingHpRatio >= 0.25) {
      return 2;
    }

    return 1;
  }

  private primaryDefeatReason() {
    if (this.balanceTelemetry.player.workerDeaths >= 2) return "worker_economy_collapsed";
    if (this.balanceTelemetry.enemy.castleDamageDealt > this.playerCastle.maxHp * 0.7) return "castle_pressure";
    if (this.armyGoldValue("enemy") > this.armyGoldValue("player") * 1.5) return "army_value_gap";
    return "counter_or_lane_mismatch";
  }

  private log(scope: string, message: string) {
    if (
      this.androidPerf.enabled &&
      this.androidPerf.profile === "telemetry" &&
      !PRODUCTION_CONSOLE_LOG_SCOPES.has(scope)
    ) {
      return;
    }
    if (this.balanceQaMode && VERBOSE_COMBAT_LOG_SCOPES.has(scope)) {
      return;
    }
    // TARGET/PROJECTILE can fire hundreds of times per second in a real
    // battle. Production used to allocate an entry and splice the bounded
    // battle log for every event even though none of it reached logcat. Keep
    // these scopes only in explicitly diagnostic builds.
    if (
      !import.meta.env.DEV &&
      import.meta.env.VITE_ANDROID_DIAGNOSTICS !== "1" &&
      VERBOSE_COMBAT_LOG_SCOPES.has(scope)
    ) {
      return;
    }
    const line = `[CastleFront][${scope}] ${message}`;
    this.battleLog.push({ scope, elapsedMs: Math.round(this.elapsedMs), message });
    const battleLogLimit = import.meta.env.DEV ? 12_000 : 600;
    if (this.battleLog.length > battleLogLimit) {
      this.battleLog.splice(0, this.battleLog.length - battleLogLimit);
    }
    if (import.meta.env.DEV || import.meta.env.VITE_ANDROID_DIAGNOSTICS === "1" || PRODUCTION_CONSOLE_LOG_SCOPES.has(scope)) {
      console.log(line);
    }
    this.forwardLogToTerminal(line);
  }

  private forwardLogToTerminal(line: string) {
    if (!import.meta.env.DEV || this.androidPerf.enabled) {
      return;
    }

    const terminalLine = line.length > 3_500
      ? `${line.slice(0, 3_300)}… [full payload sent to /__castle_balance_report]`
      : line;
    void fetch("/__castle_log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ line: terminalLine }),
      keepalive: true,
    }).catch(() => undefined);
  }

  private forwardBalanceReport(report: BattleBalanceReport) {
    if (!import.meta.env.DEV) return;
    void fetch("/__castle_balance_report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report),
    }).catch(() => undefined);
  }

  private syncBalanceDomBridge(id: string, payload: unknown) {
    if (!import.meta.env.DEV) return;
    let element = document.getElementById(id);
    if (!element) {
      element = document.createElement("script");
      element.id = id;
      element.setAttribute("type", "application/json");
      document.body.appendChild(element);
    }
    element.textContent = JSON.stringify(payload);
  }

  private advanceBalanceSuite() {
    const suiteWindow = this.balanceSuiteWindow();
    const state = suiteWindow.__CASTLE_BALANCE_SUITE_STATE__;
    if (!state) return;
    state.index += 1;
    const nextCase = state.cases[state.index];
    suiteWindow.__CASTLE_BALANCE_SUITE_STATUS__ = {
      running: Boolean(nextCase),
      completed: state.index,
      total: state.cases.length,
      currentCaseId: nextCase?.id,
    };
    this.syncBalanceDomBridge(
      "castle-balance-suite-status",
      suiteWindow.__CASTLE_BALANCE_SUITE_STATUS__,
    );
    if (nextCase) {
      if (state.index % 10 === 0) {
        this.log(
          "BALANCE_SUITE",
          `progress=${state.index}/${state.cases.length} next=${nextCase.id}`,
        );
      }
      this.scene.start("Game", {
        levelId: nextCase.levelId,
        attemptSeed: nextCase.seed,
      });
      return;
    }

    const reports = suiteWindow.__CASTLE_BALANCE_SUITE__ ?? [];
    const summary = summarizeBattleBalanceSuite(reports);
    suiteWindow.__CASTLE_BALANCE_SUITE_RESULT__ = summary;
    this.syncBalanceDomBridge("castle-balance-suite-result", summary);
    this.log(
      "BALANCE_SUITE",
      `${summary.passed ? "PASS" : "FAIL"} completed=${summary.completedMatches}/${state.cases.length} failures=${summary.failures.length}`,
    );
    if (import.meta.env.DEV) {
      void fetch("/__castle_balance_suite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startedAt: state.startedAt,
          finishedAt: new Date().toISOString(),
          summary,
        }),
      }).catch(() => undefined);
    }
  }

  private playSfx(key: string, volume: number) {
    try {
      this.sound.play(key, { volume });
    } catch {
      this.log("AUDIO", `Skipped ${key}`);
    }
  }

  private playPowerSfx(key: string, volume: number) {
    if (this.activePowerSfx.size >= POWER_SFX_MAX_ACTIVE || !this.cache.audio.exists(key)) return;
    try {
      const sound = this.sound.add(key, { volume });
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        this.activePowerSfx.delete(sound);
        sound.destroy();
      };
      this.activePowerSfx.add(sound);
      sound.once("complete", release);
      sound.once("stop", release);
      if (!sound.play()) release();
    } catch {
      this.log("AUDIO", `Skipped ${key}`);
    }
  }

  private releaseActivePowerSfx() {
    for (const sound of [...this.activePowerSfx]) {
      sound.removeAllListeners();
      sound.stop();
      sound.destroy();
    }
    this.activePowerSfx.clear();
  }

  private playMeleeAttackSfx(attacker: BattleUnit) {
    if (isRangedUnit(attacker.type) || isWorkerUnit(attacker.type)) {
      return;
    }
    if (!this.reserveCombatSfxSlot()) return;

    const key = SWORD_HIT_KEYS[Math.floor(Math.random() * SWORD_HIT_KEYS.length)];
    const volume = attacker.team === "player" ? 0.22 : 0.12;

    try {
      this.sound.play(key, {
        volume,
        rate: 0.96 + Math.random() * 0.08,
        detune: Math.round((Math.random() - 0.5) * 70),
      });
    } catch {
      this.log("AUDIO", `Skipped ${key}`);
    }
  }

  private playArrowShotSfx(attacker: BattleUnit) {
    if (!this.reserveCombatSfxSlot()) return;
    const key = ARROW_SHOT_KEYS[Math.floor(Math.random() * ARROW_SHOT_KEYS.length)];
    const volume = attacker.team === "player" ? 0.16 : 0.08;

    try {
      this.sound.play(key, {
        volume,
        rate: 0.97 + Math.random() * 0.08,
        detune: Math.round((Math.random() - 0.5) * 60),
      });
    } catch {
      this.log("AUDIO", `Skipped ${key}`);
    }
  }

  private playAxeHarvestSfx(worker: BattleUnit) {
    if (!this.reserveCombatSfxSlot()) return;
    const key = AXE_HIT_KEYS[Math.floor(Math.random() * AXE_HIT_KEYS.length)];
    const volume = worker.team === "player" ? 0.14 : 0.065;

    try {
      this.sound.play(key, {
        volume,
        rate: 0.94 + Math.random() * 0.12,
        detune: Math.round((Math.random() - 0.5) * 80),
      });
    } catch {
      this.log("AUDIO", `Skipped ${key}`);
    }
  }

  private playCastleImpactSfx(attacker: BattleUnit) {
    if (!this.reserveCombatSfxSlot()) return;
    const volume = attacker.team === "player" ? 0.26 : 0.18;

    try {
      this.sound.play("hit-sfx", {
        volume,
        rate: isRangedUnit(attacker.type) ? 1.12 : 0.86,
        detune: isRangedUnit(attacker.type) ? 90 : -120,
      });
    } catch {
      this.log("AUDIO", "Skipped castle impact");
    }
  }

  private playUnitSpawnSfx(team: Team, type: UnitType) {
    if (!isCavalryUnit(type)) {
      return;
    }

    const volume = team === "player" ? 0.42 : 0.18;

    try {
      this.sound.play("horse-run-short", {
        volume,
        rate: 0.96 + Math.random() * 0.08,
      });

      if (team === "player" || Math.random() < 0.48) {
        this.sound.play("horse-neigh-short", {
          volume: volume * 0.62,
          rate: 0.98 + Math.random() * 0.05,
        });
      }
    } catch {
      this.log("AUDIO", "Skipped horse sfx");
    }
  }

  private updateHorseMovementSfx(unit: BattleUnit) {
    if (
      !isCavalryUnit(unit.type) ||
      unit.hp <= 0 ||
      unit.isInsideCastle ||
      this.elapsedMs < (unit.nextHorseRunSfxAt ?? 0)
    ) {
      return;
    }

    if (!this.reserveCombatSfxSlot()) return;

    unit.nextHorseRunSfxAt = this.elapsedMs + HORSE_RUN_SFX_INTERVAL_MS + Math.random() * 180;
    const volume = unit.team === "player" ? 0.24 : 0.1;

    try {
      this.sound.play("horse-run-short", {
        volume,
        rate: 0.98 + Math.random() * 0.07,
      });
    } catch {
      this.log("AUDIO", "Skipped horse run");
    }
  }

  private startBattleMusic() {
    playSceneMusic(this, "battle-music", BATTLE_MUSIC_VOLUME, (scope, message) =>
      this.log(scope, message),
    );
  }

  private reserveCombatSfxSlot() {
    if (!IS_ANDROID_RUNTIME && this.units.length < FX_DENSE_UNIT_THRESHOLD) return true;
    if (this.elapsedMs < this.nextCombatSfxAt) return false;
    this.nextCombatSfxAt = this.elapsedMs + COMBAT_SFX_INTERVAL_MS;
    return true;
  }
}
