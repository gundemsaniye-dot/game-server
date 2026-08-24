import { GameObjects, Scene } from "phaser";
import { queueUnitAtlases } from "../assets/RuntimeAssets";
import { UNIT_CONFIGS, UNIT_ORDER, visualUnitId } from "../config/units.config";
import { getLevelConfig } from "../config/levels.config";
import { getUnlockedUnitIds, loadCampaignProgress } from "../systems/ProgressionStore";
import type { BattleStartData } from "../systems/LevelRuntime";
import type { UnitId } from "../types/UnitTypes";

interface HowToPlayData {
  battleStartData?: BattleStartData;
  returnScene?: "MainMenu";
  qaUnlockThroughLevel?: number;
  initialPage?: number;
}

const CARD_FEATURES: Record<UnitId, { title: string; body: string }> = {
  peasant: { title: "6 GOLD / TRIP", body: "Best income. Cuts timber and funds every army." },
  swordsman: { title: "BALANCED FRONTLINE", body: "Reliable fighter for holding the road." },
  archer: { title: "LONG-RANGE FIRE", body: "Strikes from safety behind your frontline." },
  horseman: { title: "FAST HEAVY CHARGE", body: "Crushes fragile ranged enemies at speed." },
  long_spearman: { title: "ANTI-CAVALRY REACH", body: "Long reach and bonus damage against horses." },
  mace_guard: { title: "HIGH-HEALTH TANK", body: "Absorbs punishment and breaks castle walls." },
  knife_thrower: { title: "FAST RANGED PRESSURE", body: "Rapid attacks punish workers and mages." },
  mage: { title: "AREA DAMAGE + HEAL", body: "Damages groups and restores nearby allies." },
};

export class HowToPlay extends Scene {
  private data!: HowToPlayData;
  private unlockedUnits: UnitId[] = [];
  private pageIndex = 0;
  private pageCount = 1;
  private pageObjects: GameObjects.GameObject[] = [];
  private inputLocked = false;
  private title?: GameObjects.Text;
  private subtitle?: GameObjects.Text;
  private pageCounter?: GameObjects.Text;
  private backButton?: GameObjects.Container;
  private nextButton?: GameObjects.Container;

  constructor() {
    super("HowToPlay");
  }

  init(data: HowToPlayData) {
    this.data = data ?? {};
    const qaLevel = data?.qaUnlockThroughLevel;
    this.unlockedUnits = qaLevel
      ? UNIT_ORDER.filter((id) => UNIT_CONFIGS[id].unlockLevel <= qaLevel)
      : getUnlockedUnitIds(loadCampaignProgress());
    if (this.data.battleStartData?.levelId === "level_001") {
      this.unlockedUnits = UNIT_ORDER.slice(0, 4);
    }
    const cardPages = Math.max(1, Math.ceil(this.unlockedUnits.length / 4));
    this.pageCount = cardPages + (this.data.battleStartData ? 1 : 0);
    this.pageIndex = Math.max(0, Math.min(this.pageCount - 1, data?.initialPage ?? 0));
    this.pageObjects = [];
    this.inputLocked = false;
  }

  preload() {
    this.load.setPath("assets");
    this.load.image("tutorial-card-bg", "ui/tutorial-card-bg.webp");
    queueUnitAtlases(this, this.unlockedUnits);
  }

  create() {
    this.cameras.main.setBackgroundColor(0x120b07);
    this.add.rectangle(640, 360, 1280, 720, 0x120b07);
    const backdrop = this.add.graphics();
    backdrop.fillStyle(0x382013, 1).fillRoundedRect(22, 18, 1236, 684, 28);
    backdrop.lineStyle(5, 0xd5a642, 1).strokeRoundedRect(22, 18, 1236, 684, 28);
    backdrop.fillStyle(0xd8bd82, 1).fillRoundedRect(44, 38, 1192, 618, 22);
    backdrop.lineStyle(3, 0x70401f, 1).strokeRoundedRect(44, 38, 1192, 618, 22);
    backdrop.fillStyle(0x4b2817, 1).fillRoundedRect(64, 54, 1152, 74, 18);

    this.title = this.add.text(640, 77, "HOW TO PLAY", {
      fontFamily: "Arial Black, Arial, sans-serif", fontSize: "32px", color: "#ffd86c",
      stroke: "#1a0d07", strokeThickness: 6,
    }).setOrigin(0.5);
    this.subtitle = this.add.text(640, 111, "THE FIRST MARCH", {
      fontFamily: "Arial, sans-serif", fontSize: "16px", color: "#f7e7bd",
    }).setOrigin(0.5);
    this.pageCounter = this.add.text(1190, 91, "", {
      fontFamily: "Arial Black, Arial, sans-serif", fontSize: "16px", color: "#f7d57f",
    }).setOrigin(1, 0.5);

    this.backButton = this.makeButton(160, 676, 230, "BACK", 0x5d351c, () => this.go(-1));
    this.nextButton = this.makeButton(1110, 676, 250, "NEXT", 0x982a22, () => this.go(1));
    this.input.keyboard?.on("keydown-LEFT", () => this.go(-1));
    this.input.keyboard?.on("keydown-RIGHT", () => this.go(1));
    this.input.keyboard?.on("keydown-ENTER", () => this.go(1));
    this.input.keyboard?.on("keydown-SPACE", () => this.go(1));
    this.showPage(this.pageIndex, false);
    this.events.once("shutdown", () => this.input.keyboard?.removeAllListeners());
  }

  private showPage(index: number, animate: boolean) {
    if (this.inputLocked) return;
    const old = this.pageObjects;
    this.pageIndex = index;
    const basics = Boolean(this.data.battleStartData) && index === 0;
    const cardPage = index - (this.data.battleStartData ? 1 : 0);
    const next = basics ? this.buildBasics() : this.buildCards(Math.max(0, cardPage));
    this.pageObjects = next;
    this.title?.setText(basics ? "HOW TO PLAY" : "YOUR ARMY");
    this.subtitle?.setText(basics ? "THE FIRST MARCH" : `${this.unlockedUnits.length} UNITS UNLOCKED`);
    this.pageCounter?.setText(`${index + 1} / ${this.pageCount}`);
    this.backButton?.setAlpha(index === 0 ? 0.45 : 1);
    const final = index === this.pageCount - 1;
    this.setButtonLabel(this.nextButton, final
      ? (this.data.battleStartData ? "START BATTLE" : "BACK TO MENU")
      : "NEXT");

    if (!animate) {
      old.forEach((object) => object.destroy());
      this.publishQa();
      return;
    }
    this.inputLocked = true;
    next.forEach((object) => (object as GameObjects.Components.Alpha).setAlpha?.(0));
    this.tweens.add({ targets: old, alpha: 0, duration: 180, ease: "Sine.InOut" });
    this.tweens.add({
      targets: next, alpha: 1, duration: 180, ease: "Sine.InOut",
      onComplete: () => {
        old.forEach((object) => object.destroy());
        this.inputLocked = false;
        this.publishQa();
      },
    });
  }

  private buildBasics(): GameObjects.GameObject[] {
    const objects: GameObjects.GameObject[] = [];
    objects.push(...this.infoPanel(86, 150, 522, 133, "1  TRAIN A WORKER", "Workers cut timber and return 6 gold per trip.\nMore workers mean a faster economy.", 0x24466c));
    objects.push(...this.infoPanel(86, 302, 522, 133, "2  CHOOSE A UNIT CARD", "Spend gold to deploy troops from your blue castle.\nBuild a frontline before the enemy reaches you.", 0x365a31));
    objects.push(...this.infoPanel(86, 454, 522, 133, "3  BREAK THE ENEMY CASTLE", "Protect the blue castle and destroy the red castle\nto win the battle.", 0x783226));
    objects.push(...this.powerPanel(636, 150, "ICE BLAST", "AVAILABLE NOW", "Tap ICE to freeze and slow a dangerous enemy group.", 0x2c7eb6, false));
    objects.push(...this.powerPanel(636, 348, "BOMB / MISSILE", "UNLOCKS AT LEVEL 6", "Hold, aim and release. The impact damages enemies in a wide area.", 0x9b3428, true));
    return objects;
  }

  private infoPanel(x: number, y: number, width: number, height: number, heading: string, body: string, color: number) {
    const g = this.add.graphics();
    g.fillStyle(0xf3dfae, 1).fillRoundedRect(x, y, width, height, 18);
    g.lineStyle(3, color, 1).strokeRoundedRect(x, y, width, height, 18);
    g.fillStyle(color, 1).fillRoundedRect(x + 12, y + 12, width - 24, 38, 12);
    const h = this.add.text(x + 28, y + 31, heading, {
      fontFamily: "Arial Black, Arial, sans-serif", fontSize: "19px", color: "#fff4d2",
    }).setOrigin(0, 0.5);
    const b = this.add.text(x + 26, y + 66, body, {
      fontFamily: "Arial, sans-serif", fontSize: "17px", color: "#3b2818", lineSpacing: 6,
    });
    return [g, h, b];
  }

  private powerPanel(x: number, y: number, title: string, badge: string, body: string, color: number, locked: boolean) {
    const g = this.add.graphics();
    g.fillStyle(locked ? 0xcdb785 : 0xe8d3a0, 1).fillRoundedRect(x, y, 558, 172, 22);
    g.lineStyle(4, color, 1).strokeRoundedRect(x, y, 558, 172, 22);
    g.fillStyle(color, 1).fillRoundedRect(x + 18, y + 18, 522, 58, 16);
    const icon = this.add.text(x + 48, y + 47, locked ? "✹" : "❄", {
      fontFamily: "Arial Black, Arial, sans-serif", fontSize: "34px", color: "#ffffff",
    }).setOrigin(0.5);
    const heading = this.add.text(x + 78, y + 35, title, {
      fontFamily: "Arial Black, Arial, sans-serif", fontSize: "23px", color: "#ffffff",
    });
    const status = this.add.text(x + 78, y + 62, badge, {
      fontFamily: "Arial Black, Arial, sans-serif", fontSize: "14px", color: locked ? "#ffd66e" : "#bfeaff",
    }).setOrigin(0, 0.5);
    const description = this.add.text(x + 26, y + 98, body, {
      fontFamily: "Arial, sans-serif", fontSize: "18px", color: "#3a2718",
      wordWrap: { width: 502 }, lineSpacing: 5,
    });
    return [g, icon, heading, status, description];
  }

  private buildCards(cardPage: number): GameObjects.GameObject[] {
    const units = this.unlockedUnits.slice(cardPage * 4, cardPage * 4 + 4);
    const cardWidth = 264;
    const gap = 22;
    const rowWidth = units.length * cardWidth + Math.max(0, units.length - 1) * gap;
    const startX = 640 - rowWidth / 2 + cardWidth / 2;
    return units.flatMap((unitId, index) => this.buildUnitCard(startX + index * (cardWidth + gap), unitId));
  }

  private buildUnitCard(x: number, unitId: UnitId): GameObjects.GameObject[] {
    const config = UNIT_CONFIGS[unitId];
    const feature = CARD_FEATURES[unitId];
    const y = 364;
    const background = this.add.image(x, y + 6, "tutorial-card-bg").setDisplaySize(278, 466);
    const g = this.add.graphics();
    g.fillStyle(unitId === "peasant" ? 0x315f38 : 0x63351e, 0.94).fillRoundedRect(x - 112, y - 166, 224, 44, 12);
    const name = this.add.text(x, y - 144, unitId === "peasant" ? "WORKER / WOODCUTTER" : config.label.toUpperCase(), {
      fontFamily: "Arial Black, Arial, sans-serif", fontSize: unitId === "peasant" ? "14px" : "18px", color: "#fff1c3",
      stroke: "#241208", strokeThickness: 3,
    }).setOrigin(0.5);
    const cost = this.add.text(x + 98, y - 108, `${config.cost}G`, {
      fontFamily: "Arial Black, Arial, sans-serif", fontSize: "15px", color: "#5b3519",
    }).setOrigin(1, 0.5);
    const sprite = this.add.sprite(x, y - 72, `unit-player-${visualUnitId(unitId)}`, "idle_000")
      .setDisplaySize(unitId === "horseman" ? 92 : 72, unitId === "horseman" ? 92 : 72);
    const badge = this.add.text(x, y - 22, feature.title, {
      fontFamily: "Arial Black, Arial, sans-serif", fontSize: "12px", color: unitId === "peasant" ? "#24532b" : "#773120",
      align: "center", wordWrap: { width: 210 },
    }).setOrigin(0.5);
    const body = this.add.text(x, y + 8, feature.body, {
      fontFamily: "Arial, sans-serif", fontSize: "13px", color: "#3b291b", align: "center",
      wordWrap: { width: 202, useAdvancedWrap: true }, lineSpacing: 2,
    }).setOrigin(0.5, 0);
    const damage = config.damage === 0 ? 0 : Math.min(5, Math.max(1, Math.ceil(config.damage / 6)));
    const speed = Math.min(5, Math.max(1, Math.ceil(config.speed / 12)));
    const health = Math.min(5, Math.max(1, Math.ceil(config.hp / 52)));
    const stats = [
      this.statRow(x, y + 86, "HIT", damage, config.damage === 0 ? "ECONOMY" : undefined),
      this.statRow(x, y + 119, "SPEED", speed),
      this.statRow(x, y + 152, "HEALTH", health),
    ].flat();
    const unlock = this.add.text(x - 98, y - 108, config.unlockLevel === 1 ? "STARTER" : `LEVEL ${config.unlockLevel}`, {
      fontFamily: "Arial Black, Arial, sans-serif", fontSize: "10px", color: "#6b4524",
    }).setOrigin(0, 0.5);
    return [background, g, name, cost, sprite, badge, body, ...stats, unlock];
  }

  private statRow(x: number, y: number, label: string, stars: number, override?: string) {
    const heading = this.add.text(x - 96, y, label, {
      fontFamily: "Arial Black, Arial, sans-serif", fontSize: "12px", color: "#4b321f",
    }).setOrigin(0, 0.5);
    const value = this.add.text(x + 96, y, override ?? `${"★".repeat(stars)}${"☆".repeat(5 - stars)}`, {
      fontFamily: "Arial, sans-serif", fontSize: override ? "11px" : "18px", color: override ? "#2e6d37" : "#b67812",
    }).setOrigin(1, 0.5);
    return [heading, value];
  }

  private makeButton(x: number, y: number, width: number, label: string, color: number, action: () => void) {
    const g = this.add.graphics();
    g.fillStyle(color, 1).fillRoundedRect(-width / 2, -30, width, 60, 18);
    g.lineStyle(3, 0xe2b650, 1).strokeRoundedRect(-width / 2, -30, width, 60, 18);
    const text = this.add.text(0, 0, label, {
      fontFamily: "Arial Black, Arial, sans-serif", fontSize: "19px", color: "#fff0bd",
      stroke: "#1d0d07", strokeThickness: 4,
    }).setOrigin(0.5);
    const zone = this.add.zone(0, 0, width, 64).setInteractive({ useHandCursor: true });
    const button = this.add.container(x, y, [g, text, zone]);
    button.on("pointerover", () => button.setScale(1.025));
    button.on("pointerout", () => button.setScale(1));
    zone.on("pointerdown", action);
    return button;
  }

  private setButtonLabel(button: GameObjects.Container | undefined, label: string) {
    (button?.list.find((child) => child instanceof GameObjects.Text) as GameObjects.Text | undefined)?.setText(label);
  }

  private go(direction: -1 | 1) {
    if (this.inputLocked) return;
    if (direction < 0) {
      if (this.pageIndex > 0) this.showPage(this.pageIndex - 1, true);
      else if (!this.data.battleStartData) this.exitToMenu();
      return;
    }
    if (this.pageIndex < this.pageCount - 1) {
      this.showPage(this.pageIndex + 1, true);
      return;
    }
    if (this.data.battleStartData) this.startBattle();
    else this.exitToMenu();
  }

  private startBattle() {
    this.inputLocked = true;
    this.cameras.main.fadeOut(160, 0, 0, 0);
    this.time.delayedCall(160, () => this.scene.start("SceneTransition", {
      target: "Game",
      targetData: this.data.battleStartData,
      release: "tutorial-for-battle",
    }));
  }

  private exitToMenu() {
    this.scene.start("MainMenu", { skipSplash: true });
  }

  private publishQa() {
    if (new URLSearchParams(window.location.search).get("tutorialQa") !== "1") return;
    const result = {
      levelId: this.data.battleStartData?.levelId ?? "settings",
      pageIndex: this.pageIndex,
      pageCount: this.pageCount,
      shownUnits: this.unlockedUnits,
      visibleUnits: this.unlockedUnits.slice(Math.max(0, this.pageIndex - (this.data.battleStartData ? 1 : 0)) * 4, Math.max(0, this.pageIndex - (this.data.battleStartData ? 1 : 0)) * 4 + 4),
      powerUnlocks: { ice: 1, bomb: 6 },
      inputLocked: this.inputLocked,
    };
    (window as typeof window & { __CASTLE_TUTORIAL_QA__?: typeof result }).__CASTLE_TUTORIAL_QA__ = result;
    document.documentElement.dataset.tutorialQa = JSON.stringify(result);
  }
}
