import { generateRectTexture } from "../assets/RuntimeAssets";
import { Scene } from "phaser";
import { t } from "../i18n/Localization";
import { releaseBattleRuntimeMemory } from "../assets/RuntimeAssets";
import { UNIT_CONFIGS, visualUnitId } from "../config/units.config";
import type { UnitId } from "../types/UnitTypes";
import { castleLog } from "../utils/DevLog";
import { NetworkClient } from "../network/NetworkClient";
import { getTiledBattleMapDefinition } from "../tiled/TiledMapRegistry";

export class GameOver extends Scene {
  private onlineMapTextureKey?: string;

  constructor() {
    super("GameOver");
  }

  preload() {
    if (this.registry.get("onlineBattle") !== true) return;
    const mapId = String(this.registry.get("lastBattleMapId") ?? "grasslands_01");
    const definition = getTiledBattleMapDefinition(mapId);
    if (!definition?.referenceTextureKey || !definition.referenceImageUrl) return;
    this.onlineMapTextureKey = definition.referenceTextureKey;
    if (this.textures.exists(definition.referenceTextureKey)) return;
    this.load.setPath("assets");
    this.load.image(definition.referenceTextureKey, definition.referenceImageUrl);
  }

  create() {
    // GameOver uses only generated UI. Release the finished battle before the
    // campaign scene begins loading so repeated levels do not stack GL assets.
    releaseBattleRuntimeMemory(this);
    this.cameras.main.setBackgroundColor(0x1d2028);

    const levelId = this.registry.get("lastLevelId") ?? "level_001";
    const unlockedUnitId = this.registry.get("newlyUnlockedUnitId") as UnitId | null | undefined;
    const stars = Number(this.registry.get("battleStars") ?? 0);
    const masteryComplete = this.registry.get("masteryComplete") === true;
    const masteryLabel = String(this.registry.get("masteryLabel") ?? "");
    const isVictory = this.registry.get("battleResult") === "victory";
    const isOnlineBattle = this.registry.get("onlineBattle") === true;
    if (isOnlineBattle) {
      this.createOnlineResult(isVictory);
      return;
    }
    const result = isOnlineBattle
      ? isVictory ? "YOU WIN" : "YOU LOSE"
      : isVictory ? t("gameover_victory") : t("gameover_defeat");
    const color = isVictory ? "#f8d86a" : "#ff746d";
    const backgroundColor = isOnlineBattle && !isVictory ? 0x240a0f : 0x0b1018;
    const panelColor = isOnlineBattle && !isVictory ? 0x541b25 : 0x26384a;
    const borderColor = isVictory ? 0xf8d86a : 0xff746d;
    const resultTextureSuffix = `${isOnlineBattle ? "online" : "offline"}-${isVictory ? "victory" : "defeat"}`;
    const backgroundTexture = `go_bg_${resultTextureSuffix}`;
    const panelTexture = `go_panel_${resultTextureSuffix}`;

    generateRectTexture(this, backgroundTexture, 1280, 720, backgroundColor, 1);
    this.add.image(640, 360, backgroundTexture);
    generateRectTexture(this, panelTexture, 760, 360, panelColor, 0.72, 4, borderColor, 0.72);
    this.add.image(640, 360, panelTexture);

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
      .text(640, unlockedUnitId ? 335 : 370, isOnlineBattle
        ? "ONLINE MATCH COMPLETE"
        : isVictory ? t("gameover_complete", { level: levelId.toUpperCase() }) : t("gameover_retry", { level: levelId.toUpperCase() }), {
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
      isOnlineBattle
        ? "SERVER AUTHORITATIVE RESULT"
        : isVictory
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
      .text(640, unlockedUnitId ? 510 : 450, isOnlineBattle
        ? "CLICK TO MAIN MENU"
        : t("gameover_click_to_return"), {
        fontFamily: "Arial Black",
        fontSize: 26,
        color: "#ffffff",
        backgroundColor: isOnlineBattle && !isVictory ? "#8f2635" : "#26384a",
        padding: { x: 24, y: 14 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .once("pointerdown", () => this.scene.start("SceneTransition", {
        target: isOnlineBattle ? "MainMenu" : "MapSelect",
        release: "battle",
      }));

    const returnScene = isOnlineBattle ? "MainMenu" : "MapSelect";
    castleLog("SCENE", `GameOver result=${result} level=${levelId} next=${returnScene}`);
  }

  private createOnlineResult(isVictory: boolean) {
    const side = this.registry.get("onlinePlayerSide") === "right" ? "right" : "left";
    const sideColor = side === "left" ? 0x1978bd : 0xb42d35;
    const resultColor = isVictory ? 0xffd86a : 0xef5964;
    const resultText = isVictory ? "YOU WIN" : "YOU LOST";
    const mapId = String(this.registry.get("lastBattleMapId") ?? "grasslands_01");

    if (this.onlineMapTextureKey && this.textures.exists(this.onlineMapTextureKey)) {
      this.add.image(640, 360, this.onlineMapTextureKey).setDisplaySize(1280, 720);
    } else {
      this.add.rectangle(640, 360, 1280, 720, 0x121821);
    }
    this.add.rectangle(640, 360, 1280, 720, 0x07090d, isVictory ? 0.62 : 0.74);
    this.add.rectangle(640, 96, 1280, 192, sideColor, 0.13);
    this.add.rectangle(640, 624, 1280, 192, isVictory ? 0xb58a25 : 0x641923, 0.14);

    const banner = this.add.graphics().setDepth(10);
    banner.fillStyle(0x24170f, 0.97);
    banner.lineStyle(6, resultColor, 0.96);
    banner.beginPath();
    banner.moveTo(330, 190);
    banner.lineTo(950, 190);
    banner.lineTo(910, 245);
    banner.lineTo(950, 300);
    banner.lineTo(330, 300);
    banner.lineTo(370, 245);
    banner.closePath();
    banner.fillPath();
    banner.strokePath();
    banner.fillStyle(sideColor, 0.98);
    banner.fillRect(side === "left" ? 342 : 866, 201, 72, 88);

    this.add.circle(640, 152, 56, 0x302116, 0.98)
      .setStrokeStyle(6, resultColor, 0.98)
      .setDepth(11);
    this.add.text(640, 151, isVictory ? "V" : "X", {
      fontFamily: "Arial Black",
      fontSize: 45,
      color: isVictory ? "#ffe79a" : "#ff747d",
      stroke: "#120907",
      strokeThickness: 7,
    }).setOrigin(0.5).setDepth(12);

    this.add.text(640, 242, resultText, {
      fontFamily: "Arial Black",
      fontSize: 76,
      color: isVictory ? "#ffe07a" : "#ff6672",
      stroke: "#100907",
      strokeThickness: 10,
      align: "center",
    }).setOrigin(0.5).setDepth(12);
    this.add.text(640, 344, `${side.toUpperCase()} FORTRESS · ONLINE MATCH`, {
      fontFamily: "Arial Black",
      fontSize: 20,
      color: "#ffffff",
      stroke: "#100907",
      strokeThickness: 6,
    }).setOrigin(0.5).setDepth(12);
    this.add.text(640, 380, isVictory ? "THE ENEMY CASTLE HAS FALLEN" : "YOUR CASTLE HAS FALLEN", {
      fontFamily: "Arial Black",
      fontSize: 16,
      color: isVictory ? "#ffe5a0" : "#ffb0b5",
      stroke: "#100907",
      strokeThickness: 5,
    }).setOrigin(0.5).setDepth(12);

    generateRectTexture(this, "online_result_menu_button", 390, 82, 0x4d2f1c, 0.98, 5, resultColor, 0.96);
    const buttonBack = this.add.image(0, 0, "online_result_menu_button");
    const buttonIcon = this.add.text(-142, -1, "<", {
      fontFamily: "Arial Black",
      fontSize: 31,
      color: "#ffe7a0",
      stroke: "#160c08",
      strokeThickness: 5,
    }).setOrigin(0.5);
    const buttonText = this.add.text(18, 0, "MAIN MENU", {
      fontFamily: "Arial Black",
      fontSize: 27,
      color: "#ffffff",
      stroke: "#160c08",
      strokeThickness: 6,
    }).setOrigin(0.5);
    const button = this.add.container(640, 500, [buttonBack, buttonIcon, buttonText])
      .setSize(390, 82)
      .setDepth(20)
      .setInteractive({ useHandCursor: true });
    button.on("pointerover", () => button.setScale(1.035));
    button.on("pointerout", () => button.setScale(1));

    let returning = false;
    button.once("pointerdown", () => {
      if (returning) return;
      returning = true;
      button.disableInteractive();
      NetworkClient.getInstance().disconnect();
      this.scene.start("SceneTransition", {
        target: "MainMenu",
        targetData: { skipSplash: true },
        release: "battle",
      });
    });

    this.add.text(640, 570, "SERVER AUTHORITATIVE RESULT", {
      fontFamily: "Arial Black",
      fontSize: 13,
      color: "#d7dce3",
      stroke: "#100907",
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(12);
    castleLog("SCENE", `GameOver online result=${resultText} side=${side} map=${mapId} next=MainMenu`);
  }
}
