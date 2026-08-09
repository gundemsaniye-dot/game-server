import { Scene } from "phaser";
import { t } from "../i18n/Localization";
import { queueCampaignStory, queueMainMenuRuntime, generateUiTextures } from "../assets/RuntimeAssets";
import { castleLog } from "../utils/DevLog";
import { getAndroidPerfRequest } from "../performance/AndroidPerf";
import {
  getUnlockedUnitIds,
  migrateCampaignProgress,
  normalizeCombatLoadout,
} from "../systems/ProgressionStore";

const GAME_WIDTH = 1280;
const GAME_HEIGHT = 720;

export class Preloader extends Scene {
  private progressFill?: Phaser.GameObjects.Rectangle;
  private progressText?: Phaser.GameObjects.Text;
  private lastLoggedProgress = -1;

  constructor() {
    super("Preloader");
  }

  init() {
    castleLog("PRELOAD", "init loading screen");
    this.cameras.main.setBackgroundColor(0x000000);
    
    // Generate dynamic UI textures for high FPS batching
    generateUiTextures(this);

    if (getAndroidPerfRequest().enabled) {
      this.add.rectangle(640, 360, GAME_WIDTH, GAME_HEIGHT, 0x071525);
      this.progressText = this.add.text(640, 360, "ANDROID PERF: LEVEL 20", {
        fontFamily: "monospace", fontSize: "22px", color: "#d9f3ff",
      }).setOrigin(0.5);
      return;
    }

    this.add.image(640, 360, "splash-background").setDisplaySize(GAME_WIDTH, GAME_HEIGHT).setDepth(0);

    const soldiers = this.add.image(640, 360, "splash-animation-soldier")
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT)
      .setDepth(2)
      .setAlpha(0.88);

    this.tweens.add({
      targets: soldiers,
      x: 646,
      y: 366,
      scaleX: soldiers.scaleX * 1.012,
      scaleY: soldiers.scaleY * 1.012,
      duration: 3200,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });

    const shade = this.add.rectangle(640, 360, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.22).setDepth(5);

    this.add.rectangle(640, 620, 520, 16, 0x1d1410, 0.72)
      .setStrokeStyle(2, 0xffd77b, 0.82)
      .setDepth(10);

    this.progressFill = this.add.rectangle(382, 620, 4, 8, 0xffd36a, 0.95)
      .setOrigin(0, 0.5)
      .setDepth(11);

    this.progressText = this.add.text(640, 648, t("map_loading", { percent: 0 }), {
      fontFamily: "Arial Black, Arial, sans-serif",
      fontSize: "22px",
      color: "#ffffff",
      stroke: "#1f1206",
      strokeThickness: 5,
    })
      .setOrigin(0.5)
      .setDepth(12);

    this.tweens.add({
      targets: shade,
      alpha: { from: 0.18, to: 0.31 },
      duration: 1300,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });
  }

  preload() {
    castleLog("PRELOAD", "asset queue start");
    this.attachLoaderLogs();

    this.load.setPath("assets");

    queueCampaignStory(this);
    if (!getAndroidPerfRequest().enabled) {
      queueMainMenuRuntime(this);
    }
    this.load.image("projectile-arrow", "units/projectiles/arrow.png");
    this.load.audio("select-sfx", "audio/select.wav");
    this.load.audio("hit-sfx", "audio/hit.wav");
  }

  create() {

    if (new URLSearchParams(window.location.search).get("nativeReturn") === "menu") {
      castleLog("PRELOAD", "complete -> native return MainMenu");
      this.scene.start("MainMenu", { skipSplash: true });
      return;
    }

    if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("progressionQa")) {
      this.runProgressionMigrationQa();
    }
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).get("scene") === "unlock-result") {
      this.registry.set("battleResult", "victory");
      this.registry.set("lastLevelId", "level_005");
      this.registry.set("newlyUnlockedUnitId", "long_spearman");
      this.scene.start("GameOver");
      return;
    }
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).get("scene") === "loadout") {
      castleLog("PRELOAD", "complete -> ArmyLoadout direct path");
      this.scene.start("ArmyLoadout");
      return;
    }
    const directBattleLevel = this.directBattleLevel();
    if (directBattleLevel) {
      castleLog("PRELOAD", `complete -> Game direct level=${directBattleLevel}`);
      this.scene.start("Game", { levelId: directBattleLevel });
      return;
    }
    if (this.shouldOpenMapEditorDirectly()) {
      castleLog("PRELOAD", "complete -> MapEditor direct path");
      this.scene.start("MapEditor");
      return;
    }

    if (this.shouldOpenSoldierMenuTestDirectly()) {
      castleLog("PRELOAD", "complete -> generated soldier menu test");
      this.scene.start("Game", { levelId: "level_014" });
      return;
    }

    if (this.shouldOpenMapSelectDirectly()) {
      castleLog("PRELOAD", "complete -> MapSelect direct path");
      this.scene.start("MapSelect");
      return;
    }

    castleLog("PRELOAD", "complete -> MainMenu");
    this.scene.start("MainMenu");
  }

  private runProgressionMigrationQa() {
    const migrated = migrateCampaignProgress({
      completedLevelIds: ["level_005", "level_009", "level_013", "level_017"],
      unlockedLevelIds: ["level_001"],
      starsByLevel: {},
      updatedAt: 1,
    });
    const unlocked = getUnlockedUnitIds(migrated);
    const chosen = normalizeCombatLoadout(["mage", "knife_thrower", "archer"], migrated);
    const passed =
      ["long_spearman", "mace_guard", "knife_thrower", "mage"].every((unitId) =>
        unlocked.includes(unitId as (typeof unlocked)[number]),
      ) &&
      migrated.selectedCombatUnitIds.join(",") === "swordsman,archer,horseman" &&
      chosen.join(",") === "mage,knife_thrower,archer" &&
      migrated.unlockedLevelIds.includes("level_018");
    castleLog(
      "PROGRESSION_QA",
      `${passed ? "PASS" : "FAIL"} legacyUnits=${unlocked.join(",")} default=${migrated.selectedCombatUnitIds.join(",")} chosen=${chosen.join(",")}`,
    );
  }

  private directBattleLevel() {
    const params = new URLSearchParams(window.location.search);
    const perf = getAndroidPerfRequest();
    if ((!import.meta.env.DEV && !perf.enabled) || params.get("scene") !== "battle") return undefined;
    const order = Math.max(1, Math.min(20, Number.parseInt(params.get("level") ?? "1", 10) || 1));
    return `level_${String(order).padStart(3, "0")}`;
  }

  private shouldOpenMapSelectDirectly() {
    const params = new URLSearchParams(window.location.search);

    return (
      window.location.pathname.endsWith("/map-view") ||
      params.has("mapView") ||
      params.get("scene") === "map"
    );
  }

  private shouldOpenMapEditorDirectly() {
    const params = new URLSearchParams(window.location.search);
    return params.get("scene") === "editor" || params.has("mapEditor");
  }

  private shouldOpenSoldierMenuTestDirectly() {
    const params = new URLSearchParams(window.location.search);

    return (
      window.location.pathname.endsWith("/soldier-menu-test") ||
      params.has("soldierMenuTest") ||
      params.get("scene") === "soldier-menu-test"
    );
  }

  private attachLoaderLogs() {
    this.load.on("progress", (progress: number) => {
      const percent = Math.floor(progress * 100);

      if (this.progressFill) {
        this.progressFill.width = Math.max(4, 512 * progress);
      }

      if (this.progressText) {
        this.progressText.setText(t("map_loading", { percent }));
      }

      if (percent >= this.lastLoggedProgress + 10 || percent === 100) {
        this.lastLoggedProgress = percent;
        castleLog("PRELOAD_PROGRESS", `${percent}%`);
      }
    });

    this.load.on("filecomplete", (key: string, type: string) => {
      castleLog("PRELOAD_FILE", `${key} loaded type=${type}`);
    });

    this.load.on("loaderror", (file: Phaser.Loader.File) => {
      const message = `${file.key} failed url=${file.url}`;
      castleLog("PRELOAD_ERROR", message);
      this.showLoadError(message);
    });

    this.load.on("complete", () => {
      castleLog("PRELOAD", "loader complete event");
    });
  }

  private showLoadError(message: string) {
    this.add.rectangle(640, 110, 980, 86, 0x300000, 0.82)
      .setStrokeStyle(2, 0xff5a5a, 0.95)
      .setDepth(50);

    this.add.text(640, 110, t("map_asset_error", { message }), {
      fontFamily: "Arial, sans-serif",
      fontSize: "18px",
      color: "#ffffff",
      align: "center",
      wordWrap: { width: 920 },
    })
      .setOrigin(0.5)
      .setDepth(51);
  }
}
