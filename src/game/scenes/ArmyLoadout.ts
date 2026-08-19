import { generateRectTexture } from "../assets/RuntimeAssets";
import { Scene } from "phaser";
import { t } from "../i18n/Localization";
import { ALL_UNIT_IDS, queueUnitAtlases } from "../assets/RuntimeAssets";
import {
  UNIT_CONFIGS,
  UNIT_ORDER,
  UNIT_UNLOCK_AFTER_LEVEL,
  isWorkerUnit,
  visualUnitId,
} from "../config/units.config";
import {
  createDebugUnlockedProgress,
  getUnlockedUnitIds,
  loadCampaignProgress,
  normalizeCombatLoadout,
  saveCombatLoadout,
  type CampaignProgress,
} from "../systems/ProgressionStore";
import type { UnitId } from "../types/UnitTypes";
import { castleLog } from "../utils/DevLog";
import { playAndroidHaptic } from "../platform/AndroidHaptics";

const CARD_WIDTH = 132;
const CARD_HEIGHT = 164;

export class ArmyLoadout extends Scene {
  private progress!: CampaignProgress;
  private selectedCombat: UnitId[] = [];
  private activeSlot = 0;
  private dynamicObjects: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super("ArmyLoadout");
  }

  preload() {
    this.load.setPath("assets");
    queueUnitAtlases(this, ALL_UNIT_IDS);
  }

  create() {
    const debugUnlockAll = (import.meta.env.DEV || import.meta.env.VITE_ANDROID_QA === "1") &&
      new URLSearchParams(window.location.search).has("unlockAll");
    this.progress = debugUnlockAll
      ? createDebugUnlockedProgress(loadCampaignProgress())
      : loadCampaignProgress();
    this.selectedCombat = normalizeCombatLoadout(this.progress.selectedCombatUnitIds, this.progress);

    this.cameras.main.setBackgroundColor(0x101720);
    generateRectTexture(this, "al_bg", 1280, 720, 0x0d141d, 1);
    this.add.image(640, 360, "al_bg");
    this.add.rectangle(640, 360, 1160, 660, 0x26384a, 0.76)
      .setStrokeStyle(4, 0xd9a94e, 0.9);

    this.add.text(640, 54, t("loadout_title"), {
      fontFamily: "Arial Black",
      fontSize: 42,
      color: "#fff1b0",
      stroke: "#2c1708",
      strokeThickness: 7,
    }).setOrigin(0.5);
    this.add.text(640, 91, t("loadout_subtitle"), {
      fontFamily: "Arial",
      fontSize: 20,
      color: "#d8e6ef",
    }).setOrigin(0.5);

    this.createActionButton(485, 658, 270, t("loadout_save_back"), () => this.saveAndBack());
    this.createActionButton(795, 658, 270, t("loadout_cancel"), () => this.scene.start("MainMenu", { skipSplash: true }));
    this.renderCards();
    castleLog("LOADOUT", `open selected=${this.selectedCombat.join(",")}`);
  }

  private renderCards() {
    this.dynamicObjects.forEach((object) => object.destroy());
    this.dynamicObjects = [];

    const slots: UnitId[] = ["peasant", ...this.selectedCombat];
    const slotXs = [400, 560, 720, 880];
    slots.forEach((unitId, index) => {
      const selected = index > 0 && this.activeSlot === index - 1;
      this.createUnitCard(slotXs[index], 196, unitId, {
        title: index === 0 ? t("loadout_slot_fixed") : t("loadout_slot", { index: index + 1 }),
        selected,
        interactive: index > 0,
        onClick: () => {
          if (index === 0) return;
          playAndroidHaptic("selection");
          this.activeSlot = index - 1;
          this.renderCards();
        },
      });
    });

    this.track(this.add.text(640, 316, t("loadout_available_combat_units"), {
      fontFamily: "Arial Black",
      fontSize: 22,
      color: "#ffffff",
      stroke: "#17212d",
      strokeThickness: 5,
    }).setOrigin(0.5));

    const unlocked = new Set(getUnlockedUnitIds(this.progress));
    const combatUnits = UNIT_ORDER.filter((unitId) => !isWorkerUnit(unitId));
    const startX = 220;
    combatUnits.forEach((unitId, index) => {
      const isUnlocked = unlocked.has(unitId);
      const selectedIndex = this.selectedCombat.indexOf(unitId);
      this.createUnitCard(startX + index * 140, 450, unitId, {
        title: selectedIndex >= 0 ? t("loadout_selected", { index: selectedIndex + 2 }) : undefined,
        selected: selectedIndex >= 0,
        locked: !isUnlocked,
        interactive: isUnlocked,
        onClick: () => this.chooseUnit(unitId),
      });
    });

    this.track(this.add.text(640, 578, t("loadout_editing_slot", { slot: this.activeSlot + 2 }), {
      fontFamily: "Arial Black",
      fontSize: 18,
      color: "#ffd978",
    }).setOrigin(0.5));
  }

  private chooseUnit(unitId: UnitId) {
    playAndroidHaptic("selection");
    const existingIndex = this.selectedCombat.indexOf(unitId);
    if (existingIndex >= 0) {
      this.activeSlot = existingIndex;
      this.renderCards();
      return;
    }

    this.selectedCombat[this.activeSlot] = unitId;
    this.activeSlot = (this.activeSlot + 1) % 3;
    this.sound.play("select-sfx", { volume: 0.28 });
    this.renderCards();
  }

  private createUnitCard(
    x: number,
    y: number,
    unitId: UnitId,
    options: {
      title?: string;
      selected?: boolean;
      locked?: boolean;
      interactive?: boolean;
      onClick?: () => void;
    },
  ) {
    const config = UNIT_CONFIGS[unitId];
    const fill = options.locked ? 0x18212a : options.selected ? 0x5a421d : 0x31485b;
    const stroke = options.selected ? 0xffd25f : options.locked ? 0x59636d : 0xa9d2e5;
    const panel = this.track(this.add.rectangle(x, y, CARD_WIDTH, CARD_HEIGHT, fill, 0.98)
      .setStrokeStyle(options.selected ? 4 : 2, stroke, 1));
    this.track(this.add.text(x, y - 67, options.title ?? "", {
      fontFamily: "Arial Black",
      fontSize: 12,
      color: options.selected ? "#ffe28a" : "#c7d8e2",
    }).setOrigin(0.5));

    const sprite = this.track(this.add.sprite(x, y - 18, `unit-player-${visualUnitId(unitId)}`, "idle_000")
      .setDisplaySize(isWorkerUnit(unitId) ? 78 : 88, isWorkerUnit(unitId) ? 78 : 88)
      .setAlpha(options.locked ? 0.3 : 1));
    this.track(this.add.text(x, y + 42, config.label.toUpperCase(), {
      fontFamily: "Arial Black",
      fontSize: config.label.length > 10 ? 12 : 14,
      color: options.locked ? "#7c8790" : "#ffffff",
      stroke: "#111111",
      strokeThickness: 3,
      align: "center",
    }).setOrigin(0.5));
    this.track(this.add.text(x, y + 65, t("loadout_gold", { cost: config.cost }), {
      fontFamily: "Arial Black",
      fontSize: 13,
      color: options.locked ? "#6b737b" : "#ffd45c",
    }).setOrigin(0.5));

    if (options.locked) {
      const milestone = UNIT_UNLOCK_AFTER_LEVEL[unitId];
      generateRectTexture(this, "al_card_inner", CARD_WIDTH - 8, 48, 0x05080b, 0.82);
      this.track(this.add.image(x, y + 3, "al_card_inner"));
      this.track(this.add.text(x, y + 3, t("loadout_locked_win_level", { level: milestone }), {
        fontFamily: "Arial Black",
        fontSize: 13,
        color: "#ffcf69",
        align: "center",
      }).setOrigin(0.5));
    }

    if (options.interactive && options.onClick) {
      const zone = this.track(this.add.zone(x, y, CARD_WIDTH, CARD_HEIGHT)
        .setInteractive({ useHandCursor: true }));
      // Selection and hover must never alter card geometry. Re-rendering while
      // the pointer is held used to leave the last card visually enlarged.
      zone.on("pointerover", () => panel.setFillStyle(options.selected ? 0x6a4f25 : 0x3d5a70, 0.98));
      zone.on("pointerout", () => panel.setFillStyle(fill, 0.98));
      zone.on("pointerdown", options.onClick);
    }

    return sprite;
  }

  private createActionButton(x: number, y: number, width: number, label: string, onClick: () => void) {
    const panel = this.add.rectangle(x, y, width, 54, 0x70451f, 1)
      .setStrokeStyle(3, 0xffd36b, 0.95);
    this.add.text(x, y, label, {
      fontFamily: "Arial Black",
      fontSize: 20,
      color: "#ffffff",
      stroke: "#2a1407",
      strokeThickness: 4,
    }).setOrigin(0.5);
    const zone = this.add.zone(x, y, width, 54).setInteractive({ useHandCursor: true });
    zone.on("pointerover", () => panel.setScale(1.025));
    zone.on("pointerout", () => panel.setScale(1));
    zone.on("pointerdown", onClick);
  }

  private saveAndBack() {
    const saved = saveCombatLoadout(this.selectedCombat);
    castleLog("LOADOUT", `saved=${saved.join(",")}`);
    this.sound.play("select-sfx", { volume: 0.3 });
    this.scene.start("MainMenu", { skipSplash: true });
  }

  private track<T extends Phaser.GameObjects.GameObject>(object: T) {
    this.dynamicObjects.push(object);
    return object;
  }
}
