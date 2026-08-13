import type { Scene } from "phaser";
import { MAP_ASSETS, MAP_PROP_ATLASES } from "../config/mapAssets";
import {
  BASE_VISUAL_UNIT_IDS,
  UNIT_ORDER,
  visualUnitId,
} from "../config/units.config";
import { UNIT_ANIMATION_DEFINITIONS } from "../config/unitAnimations";
import { TILED_BATTLE_MAPS } from "../tiled/TiledMapRegistry";
import type { UnitId } from "../types/UnitTypes";

type Team = "player" | "enemy";
type ImageAsset = Readonly<{ key: string; path: string }>;
type AudioAsset = Readonly<{ key: string; path: string }>;

export const MAIN_MENU_TEXTURES: readonly ImageAsset[] = [
  { key: "menu-background", path: "ui/menu/start-v2/menu-background-clean-v4.png" },
  { key: "menu-logo-base", path: "ui/menu/start-v2/menu-logo-layer-v2.png" },
  { key: "menu-upgrades-base", path: "ui/menu/start-v2/buttons/upgrades-base-compact-v1.png" },
  { key: "menu-settings-base", path: "ui/menu/start-v2/buttons/settings-base-compact-v1.png" },
  { key: "menu-campaign-button", path: "ui/menu/start-v2/buttons/campaign-button-v1.png" },
  { key: "menu-online-pvp-button", path: "ui/menu/start-v2/buttons/online-pvp-button-v1.png" },
  { key: "menu-upgrades-hover", path: "ui/menu/start-v2/buttons/upgrades-hover-v2.png" },
  { key: "menu-settings-hover", path: "ui/menu/start-v2/buttons/settings-hover-v2.png" },
];

export const SPLASH_TEXTURE_KEYS = [
  "splash-background",
  "splash-animation-soldier",
  "splash-tap-to-start-button",
] as const;

export const CAMPAIGN_TEXTURE: ImageAsset = {
  key: "world-map-v1",
  path: "maps/world-map-v2.png",
};

const BATTLE_STRUCTURE_TEXTURES: readonly ImageAsset[] = [
  { key: "structure-player-stronghold", path: "structures/player-stronghold.png" },
  { key: "structure-enemy-stronghold", path: "structures/enemy-stronghold.png" },
  { key: "structure-player-fortress-side", path: "structures/player-fortress-side-v1.png" },
  { key: "structure-enemy-fortress-side", path: "structures/enemy-fortress-side-v1.png" },
  { key: "structure-player-wall-v", path: "structures/player-wall-rampart-v3.png" },
  { key: "structure-enemy-wall-v", path: "structures/enemy-wall-rampart-v3.png" },
];

const BATTLE_AUDIO: readonly AudioAsset[] = [
  { key: "spawn-sfx", path: "audio/spawn.wav" },
  { key: "battle-music", path: "audio/battle-music.mp3" },
  { key: "sword-hit-1", path: "audio/sword-hit-1.mp3" },
  { key: "sword-hit-2", path: "audio/sword-hit-2.mp3" },
  { key: "sword-hit-3", path: "audio/sword-hit-3.mp3" },
  { key: "arrow-shot-1", path: "audio/arrow-shot-1.mp3" },
  { key: "arrow-shot-2", path: "audio/arrow-shot-2.mp3" },
  { key: "axe-hit-1", path: "audio/axe-hit-1.mp3" },
  { key: "axe-hit-2", path: "audio/axe-hit-2.mp3" },
  { key: "axe-hit-3", path: "audio/axe-hit-3.mp3" },
  { key: "horse-run-short", path: "audio/horse-run-short.mp3" },
  { key: "horse-neigh-short", path: "audio/horse-neigh-short.mp3" },
];

const POWER_BATTLE_AUDIO: readonly AudioAsset[] = [
  { key: "online-missile-impact-sfx", path: "audio/online-missile-impact.mp3" },
  { key: "online-ice-blast-sfx", path: "audio/online-ice-blast.mp3" },
];

function queueImages(scene: Scene, assets: readonly ImageAsset[]) {
  for (const asset of assets) {
    if (!scene.textures.exists(asset.key)) scene.load.image(asset.key, asset.path);
  }
}

function releaseTextures(scene: Scene, keys: Iterable<string>) {
  for (const key of keys) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
  }
}

export function queueMainMenuTextures(scene: Scene) {
  queueImages(scene, MAIN_MENU_TEXTURES);
}

export function queueMainMenuRuntime(scene: Scene) {
  queueMainMenuTextures(scene);
  if (!scene.textures.exists("logo")) scene.load.image("logo", "logo.png");
  if (!scene.cache.json.exists("legal-content")) {
    scene.load.json("legal-content", "data/legal-content.json");
  }
  queueLobbyAudio(scene);
}

export function queueCampaignStory(scene: Scene) {
  if (!scene.cache.json.exists("campaign-story")) {
    scene.load.json("campaign-story", "data/campaign-story.json");
  }
}

export function queueLobbyAudio(scene: Scene) {
  if (!scene.cache.audio.exists("lobby-music")) {
    scene.load.audio("lobby-music", "audio/lobi-music.mp3");
  }
}

export function queueCampaignTexture(scene: Scene) {
  queueImages(scene, [CAMPAIGN_TEXTURE]);
}

export function queueBattleStructures(scene: Scene) {
  queueImages(scene, BATTLE_STRUCTURE_TEXTURES);
}

export function queueBattleAudio(scene: Scene) {
  for (const asset of BATTLE_AUDIO) {
    if (!scene.cache.audio.exists(asset.key)) scene.load.audio(asset.key, asset.path);
  }
}

export function queuePowerBattleAudio(scene: Scene) {
  for (const asset of POWER_BATTLE_AUDIO) {
    if (!scene.cache.audio.exists(asset.key)) scene.load.audio(asset.key, asset.path);
  }
}

export function queueUnitAtlases(
  scene: Scene,
  playerUnitIds: readonly UnitId[],
  enemyUnitIds: readonly UnitId[] = [],
) {
  const byTeam: Record<Team, readonly UnitId[]> = {
    player: playerUnitIds,
    enemy: enemyUnitIds,
  };

  for (const team of ["player", "enemy"] as const) {
    const visualIds = new Set(byTeam[team].map((unitId) => visualUnitId(unitId)));
    for (const visualId of visualIds) {
      const key = `unit-${team}-${visualId}`;
      if (scene.textures.exists(key)) continue;
      scene.load.atlas(
        key,
        `units/atlases/${team}-${visualId}.png`,
        `units/atlases/${team}-${visualId}.json`,
      );
    }
  }
}

export function releaseSplashTextures(scene: Scene) {
  releaseTextures(scene, SPLASH_TEXTURE_KEYS);
}

export function releaseMainMenuTextures(_scene: Scene) {
  // Disabled for performance: releaseTextures(scene, MAIN_MENU_TEXTURES.map((asset) => asset.key));
}

export function releaseCampaignTexture(_scene: Scene) {
  // Disabled for performance: releaseTextures(scene, [CAMPAIGN_TEXTURE.key]);
}

export function releaseLobbyRuntimeMemory(scene: Scene) {
  scene.sound.stopByKey("lobby-music");
  // Disabled for performance:
  // scene.sound.removeByKey("lobby-music");
  // scene.cache.audio.remove("lobby-music");
  // scene.cache.json.remove("legal-content");
  // releaseTextures(scene, ["logo"]);
}

export function releaseBattleRuntimeMemory(scene: Scene) {
  // Disabled texture release for performance to prevent Android VRAM fragmentation
  for (const asset of BATTLE_AUDIO) {
    scene.sound.stopByKey(asset.key);
  }
  for (const asset of POWER_BATTLE_AUDIO) {
    scene.sound.stopByKey(asset.key);
    scene.sound.removeByKey(asset.key);
    scene.cache.audio.remove(asset.key);
  }
}

export const ALL_UNIT_IDS: readonly UnitId[] = UNIT_ORDER;

export function generateUiTextures(scene: Phaser.Scene) {
  if (scene.textures.exists("banner_bg")) return;

  const g = scene.add.graphics();

  // 1. Health Banner Background (Sancak)
  g.clear();
  g.fillStyle(0x181818, 0.85);
  g.lineStyle(1, 0x3a3a3a, 1);
  g.beginPath();
  g.moveTo(1, 1);
  g.lineTo(23, 1);
  g.lineTo(23, 5);
  g.lineTo(12, 7); // bottom point of the banner
  g.lineTo(1, 5);
  g.closePath();
  g.fillPath();
  g.strokePath();
  g.generateTexture("banner_bg", 24, 8);

  // Health Banner Fill (Player - Emerald Green)
  g.clear();
  g.fillStyle(0x32a852, 1);
  g.beginPath();
  g.moveTo(2, 2);
  g.lineTo(22, 2);
  g.lineTo(22, 4.5);
  g.lineTo(12, 6);
  g.lineTo(2, 4.5);
  g.closePath();
  g.fillPath();
  g.generateTexture("banner_fill_player", 24, 8);

  // Health Banner Fill (Enemy - Crimson Red)
  g.clear();
  g.fillStyle(0xc42b2b, 1);
  g.beginPath();
  g.moveTo(2, 2);
  g.lineTo(22, 2);
  g.lineTo(22, 4.5);
  g.lineTo(12, 6);
  g.lineTo(2, 4.5);
  g.closePath();
  g.fillPath();
  g.generateTexture("banner_fill_enemy", 24, 8);

  // 2. Resource Bar Background (Horizontal Tree Health Bar)
  g.clear();
  g.fillStyle(0x2a2a2a, 0.95);
  g.lineStyle(1, 0x8a6a22, 1);
  g.fillRoundedRect(0, 0, 36, 8, 2);
  g.strokeRoundedRect(0, 0, 36, 8, 2);
  g.generateTexture("medallion_bg", 36, 8);

  // 3. Hit Spark Effect (Cross Spark)
  g.clear();
  g.fillStyle(0xffeeba, 1); // Bright yellow-white
  g.beginPath();
  g.moveTo(16, 2);
  g.lineTo(18, 14);
  g.lineTo(30, 16);
  g.lineTo(18, 18);
  g.lineTo(16, 30);
  g.lineTo(14, 18);
  g.lineTo(2, 16);
  g.lineTo(14, 14);
  g.closePath();
  g.fillPath();
  g.generateTexture("effect_hit_spark", 32, 32);

  // 4. Spawn Burst (Spirit / Sprout / Light Beam)
  g.clear();
  g.fillStyle(0xffffcc, 0.6);
  g.fillCircle(32, 32, 28);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(32, 32, 14);
  g.generateTexture("effect_spawn_burst", 64, 64);

  // 5. Arrow Trail
  g.clear();
  g.fillStyle(0xffffff, 0.4);
  g.fillRoundedRect(0, 0, 24, 2, 1);
  g.generateTexture("effect_arrow_trail", 24, 4);

  // 6. Runic Circle (Spell / Magic Seal)
  g.clear();
  g.lineStyle(3, 0x44aaff, 0.9);
  g.strokeCircle(48, 48, 44);
  g.lineStyle(1, 0x88ccff, 0.7);
  g.strokeCircle(48, 48, 38);
  g.beginPath();
  for (let i = 0; i < 5; i++) {
    const angle = (i * Math.PI * 4) / 5;
    const px = 48 + Math.cos(angle) * 38;
    const py = 48 + Math.sin(angle) * 38;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
  g.strokePath();
  g.generateTexture("effect_runic_circle", 96, 96);
  
  // 7. Smoke Puff (Castle Damage)
  g.clear();
  g.fillStyle(0xcccccc, 0.7);
  g.fillCircle(16, 16, 14);
  g.fillStyle(0xaaaaaa, 0.9);
  g.fillCircle(12, 12, 8);
  g.generateTexture("effect_smoke_puff", 32, 32);

  // Resource Bar Fill
  g.clear();
  g.fillStyle(0x5ec95e, 1);
  g.fillRoundedRect(0, 0, 34, 6, 2);
  g.generateTexture("medallion_fill", 34, 6);

  g.destroy();
}

export function generateRectTexture(scene: Phaser.Scene, key: string, w: number, h: number, fill: number, alpha: number, strokeW: number = 0, strokeC: number = 0, strokeAlpha: number = 1) {
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ add: false });
  g.fillStyle(fill, alpha);
  g.fillRect(strokeW / 2, strokeW / 2, w - strokeW, h - strokeW);
  if (strokeW > 0) {
    g.lineStyle(strokeW, strokeC, strokeAlpha);
    g.strokeRect(strokeW / 2, strokeW / 2, w - strokeW, h - strokeW);
  }
  g.generateTexture(key, w, h);
  g.destroy();
  return key;
}
