import { generateRectTexture, queueLobbyAudio } from "../assets/RuntimeAssets";
import { Scene } from "phaser";
import { t } from "../i18n/Localization";
import { releaseBattleRuntimeMemory } from "../assets/RuntimeAssets";
import { UNIT_CONFIGS, visualUnitId } from "../config/units.config";
import type { UnitId } from "../types/UnitTypes";
import { castleLog } from "../utils/DevLog";

export class GameOver extends Scene {
  constructor() {
    super("GameOver");
  }

  create() {
    // GameOver uses only generated UI. Release the finished battle before the
    // campaign scene begins loading so repeated levels do not stack GL assets.
    releaseBattleRuntimeMemory(this);
    this.cameras.main.setBackgroundColor(0x1d2028);

    const result = this.registry.get("battleResult") === "victory" ? t("gameover_victory") : t("gameover_defeat");
    const levelId = this.registry.get("lastLevelId") ?? "level_001";
    const unlockedUnitId = this.registry.get("newlyUnlockedUnitId") as UnitId | null | undefined;
    const stars = Number(this.registry.get("battleStars") ?? 0);
    const masteryComplete = this.registry.get("masteryComplete") === true;
    const masteryLabel = String(this.registry.get("masteryLabel") ?? "");
    const isVictory = this.registry.get("battleResult") === "victory";
    const color = isVictory ? "#f8d86a" : "#ff746d";

    generateRectTexture(this, "go_bg", 1280, 720, 0x0b1018, 1);
    this.add.image(640, 360, "go_bg");
    generateRectTexture(this, "go_panel", 760, 360, 0x26384a, 0.42, 4, 0xf8d86a, 0.45);
    this.add.image(640, 360, "go_panel");

    this.add
      .text(640, unlockedUnitId ? 250 : 290, result, {
        fontFamily: "Arial Black",
        fontSize: 78,
        color,
        stroke: "#000000",
        strokeThickness: 8,
        align: "center",
      })
      .setOrigin(0.5);

    this.add
      .text(640, unlockedUnitId ? 335 : 370, isVictory ? t("gameover_complete", { level: levelId.toUpperCase() }) : t("gameover_retry", { level: levelId.toUpperCase() }), {
        fontFamily: "Arial Black",
        fontSize: 22,
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 5,
      })
      .setOrigin(0.5);

    this.add.text(
      640,
      unlockedUnitId ? 372 : 410,
      isVictory
        ? t("gameover_mastery_status", { stars: `${"★".repeat(stars)}${"☆".repeat(Math.max(0, 3 - stars))}`, status: masteryComplete ? t("mastery_complete") : t("mastery_missing") })
        : t("gameover_mastery_target", { target: masteryLabel }),
      { fontFamily: "Arial Black", fontSize: 18, color: masteryComplete ? "#9dff9d" : "#ffffff" },
    ).setOrigin(0.5);

    if (isVictory && unlockedUnitId) {
      const config = UNIT_CONFIGS[unlockedUnitId];
      generateRectTexture(this, "go_btn", 520, 104, 0x5a421d, 0.96, 3, 0xffd45f);
      this.add.image(640, 424, "go_btn");
      this.add.sprite(440, 424, `unit-player-${visualUnitId(unlockedUnitId)}`, "idle_000")
        .setDisplaySize(86, 86);
      this.add.text(500, 399, t("gameover_new_unit_unlocked"), {
        fontFamily: "Arial Black",
        fontSize: 20,
        color: "#ffe077",
      });
      this.add.text(500, 430, t("gameover_available_next_level", { unit: config.label.toUpperCase() }), {
        fontFamily: "Arial Black",
        fontSize: 17,
        color: "#ffffff",
      });
    }

    this.add
      .text(640, unlockedUnitId ? 510 : 450, t("gameover_click_to_return"), {
        fontFamily: "Arial Black",
        fontSize: 26,
        color: "#ffffff",
        backgroundColor: "#26384a",
        padding: { x: 24, y: 14 },
      })
      .setOrigin(0.5);

    castleLog("SCENE", `GameOver result=${result} level=${levelId} next=MapSelect`);
    this.input.once("pointerdown", () => this.scene.start("SceneTransition", {
      target: "MapSelect",
      release: "battle",
    }));
  }
}
