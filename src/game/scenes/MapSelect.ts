import { Math as PhaserMath, Scene, Textures } from "phaser";
import { t } from "../i18n/Localization";
import {
  queueCampaignTexture,
  queueLobbyAudio,
  releaseBattleRuntimeMemory,
  releaseMainMenuTextures,
} from "../assets/RuntimeAssets";
import { playSceneMusic, stopSceneMusic } from "../audio/GameAudio";
import { MAIN_CAMPAIGN } from "../config/campaign.config";
import { getLevelConfig } from "../config/levels.config";
import type { CampaignNodeConfig } from "../types/CampaignTypes";
import type { BiomeId } from "../types/MapTypes";
import { castleLog } from "../utils/DevLog";
import {
  createDebugUnlockedProgress,
  ensureLevelAttemptSeed,
  getNodeState,
  loadCampaignProgress,
  resetCampaignProgress,
  type CampaignProgress,
} from "../systems/ProgressionStore";
import {
  formatCampaignValidation,
  getLevelRuntime,
  validateCampaignConfig,
  type BattleStartData,
} from "../systems/LevelRuntime";
import { difficultySummary } from "../systems/DifficultyMath";

const DRAG_THRESHOLD_PX = 10;
const PIN_RADIUS = 30;
const PATH_DEPTH = 4;
const PIN_DEPTH = 24;
const HUD_DEPTH = 1000;
const INTRO_PIN_SCALE = 1.32;
const ROUTE_BEND_RATIO = 0.22;
const ROUTE_MAX_BEND = 92;
const DEFAULT_MAP_ZOOM = 0.65 * 1.25;
const MIN_MAP_ZOOM = 0.58;
const MAX_MAP_ZOOM = 1.25;
const PINCH_EPSILON_PX = 2;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export class MapSelect extends Scene {
  private pointerDown = false;
  private activePointerId?: number;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartScrollX = 0;
  private dragStartScrollY = 0;
  private dragMoved = false;
  private transitionLocked = false;
  private lastLoggedScrollX = Number.NaN;
  private lastLoggedScrollY = Number.NaN;
  private lastScrollLogAt = 0;
  private pinchActive = false;
  private pinchStartDistance = 0;
  private pinchStartZoom = DEFAULT_MAP_ZOOM;
  private progress: CampaignProgress = loadCampaignProgress();
  private unlockAllForDebug = false;

  constructor() {
    super("MapSelect");
  }

  preload() {
    this.load.setPath("assets");
    queueCampaignTexture(this);
    queueLobbyAudio(this);
  }

  create() {
    releaseMainMenuTextures(this);
    releaseBattleRuntimeMemory(this);
    const lobbyMusic = this.sound.get("lobby-music");
    if (!lobbyMusic?.isPlaying) {
      playSceneMusic(this, "lobby-music", 0.46, (scope, message) => this.log(scope, message));
    }
    this.resetInteractionState();
    this.configureProgressMode();
    this.configureCamera();
    this.createWorldBackground();
    this.createCampaignPath();
    this.createLevelPins();
    this.createFixedHud();
    this.enableMapPan();
    this.logCampaignValidation();

    this.log(
      "MAP",
      `create world=${MAIN_CAMPAIGN.worldWidth}x${MAIN_CAMPAIGN.worldHeight} viewport=${MAIN_CAMPAIGN.viewportWidth}x${MAIN_CAMPAIGN.viewportHeight} maxScrollX=${this.maxScrollX()} maxScrollY=${this.maxScrollY()}`,
    );
    this.log("MAP", `campaign loaded nodes=${MAIN_CAMPAIGN.nodes.length} unlockAll=${this.unlockAllForDebug}`);
    this.logScroll(true);
  }

  private resetInteractionState() {
    // Phaser reuses Scene instances after scene.start(). Do not carry the lock
    // from the previous level transition back into the campaign map.
    this.pointerDown = false;
    this.activePointerId = undefined;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.dragStartScrollX = 0;
    this.dragStartScrollY = 0;
    this.dragMoved = false;
    this.transitionLocked = false;
    this.pinchActive = false;
    this.pinchStartDistance = 0;
    this.pinchStartZoom = DEFAULT_MAP_ZOOM;
    this.lastLoggedScrollX = Number.NaN;
    this.lastLoggedScrollY = Number.NaN;
    this.lastScrollLogAt = 0;
  }

  update() {
    const scrollX = this.clampScrollX(this.cameras.main.scrollX);
    const scrollY = this.clampScrollY(this.cameras.main.scrollY);

    if (this.cameras.main.scrollX !== scrollX || this.cameras.main.scrollY !== scrollY) {
      this.cameras.main.setScroll(scrollX, scrollY);
    }
  }

  private configureProgressMode() {
    const params = new URLSearchParams(window.location.search);

    if (params.has("resetProgress")) {
      this.progress = resetCampaignProgress();
      this.log("PROGRESS", "reset campaign progress from query");
    } else {
      this.progress = loadCampaignProgress();
    }

    this.unlockAllForDebug =
      import.meta.env.DEV && (params.has("unlockAll") || params.has("allLevels"));

    if (this.unlockAllForDebug) {
      this.progress = createDebugUnlockedProgress(this.progress);
      this.log("PROGRESS", "unlockAll debug enabled");
    }
  }

  private configureCamera() {
    const camera = this.cameras.main;
    camera.setBackgroundColor(0x0c1720);
    camera.setBounds(0, 0, MAIN_CAMPAIGN.worldWidth, MAIN_CAMPAIGN.worldHeight);
    camera.setZoom(DEFAULT_MAP_ZOOM);
    camera.setScroll(0, this.clampScrollY(600 - camera.displayHeight * 0.52));
    camera.fadeIn(180, 0, 0, 0);
  }

  private createWorldBackground() {
    this.textures
      .get(MAIN_CAMPAIGN.backgroundKey)
      .setFilter(Textures.FilterMode.LINEAR);
    const sourceImage = this.textures.get(MAIN_CAMPAIGN.backgroundKey).getSourceImage() as {
      width?: number;
      height?: number;
      naturalWidth?: number;
      naturalHeight?: number;
    };
    const sourceWidth = sourceImage.naturalWidth ?? sourceImage.width ?? MAIN_CAMPAIGN.worldWidth;
    const sourceHeight = sourceImage.naturalHeight ?? sourceImage.height ?? MAIN_CAMPAIGN.worldHeight;
    const mapScale = MAIN_CAMPAIGN.worldWidth / sourceWidth;
    const displayHeight = Math.round(sourceHeight * mapScale);

    this.add
      .image(0, 0, MAIN_CAMPAIGN.backgroundKey)
      .setOrigin(0, 0)
      .setScale(mapScale)
      .setDepth(0);

    this.log(
      "MAP",
      `background scale source=${sourceWidth}x${sourceHeight} display=${MAIN_CAMPAIGN.worldWidth}x${displayHeight} world=${MAIN_CAMPAIGN.worldWidth}x${MAIN_CAMPAIGN.worldHeight} scale=${mapScale.toFixed(3)}`,
    );
  }

  private createCampaignPath() {
    if (!this.textures.exists("campaign_path")) {
      const tempG = this.make.graphics({ x: 0, y: 0, add: false });
      const nodes = MAIN_CAMPAIGN.nodes;
      this.drawCampaignRoute(tempG, nodes, 30, 0x21140a, 0.48);
      this.drawCampaignRoute(tempG, nodes, 18, 0xb87629, 0.96);
      this.drawCampaignRoute(tempG, nodes, 10, 0xf4d07b, 1);
      this.drawCampaignRoute(tempG, nodes, 3, 0xfff6c7, 0.92);
      tempG.generateTexture("campaign_path", MAIN_CAMPAIGN.worldWidth, MAIN_CAMPAIGN.worldHeight);
      tempG.destroy();
    }
    this.add.image(0, 0, "campaign_path").setOrigin(0, 0).setDepth(PATH_DEPTH);
  }

  private drawCampaignRoute(
    graphics: Phaser.GameObjects.Graphics,
    nodes: readonly CampaignNodeConfig[],
    width: number,
    color: number,
    alpha: number,
  ) {
    graphics.lineStyle(width, color, alpha);
    graphics.beginPath();
    graphics.moveTo(nodes[0].x, nodes[0].y);

    for (let index = 1; index < nodes.length; index += 1) {
      const previous = nodes[index - 1];
      const current = nodes[index];
      const dx = current.x - previous.x;
      const dy = current.y - previous.y;
      const distance = Math.hypot(dx, dy);
      const bend = Math.min(ROUTE_MAX_BEND, distance * ROUTE_BEND_RATIO) * (index % 2 === 0 ? -1 : 1);
      const controlX = (previous.x + current.x) / 2 - (dy / distance) * bend;
      const controlY = (previous.y + current.y) / 2 + (dx / distance) * bend;

      // Sample the quadratic curve directly: this Phaser build exposes no runtime Bezier command.
      for (let step = 1; step <= 14; step += 1) {
        const t = step / 14;
        const inverseT = 1 - t;
        const x = inverseT * inverseT * previous.x + 2 * inverseT * t * controlX + t * t * current.x;
        const y = inverseT * inverseT * previous.y + 2 * inverseT * t * controlY + t * t * current.y;
        graphics.lineTo(x, y);
      }
    }

    graphics.strokePath();
  }


  private getPinTextureKey(isBoss: boolean, isLocked: boolean, state: string, biome: BiomeId) {
    return `pin_${isBoss ? "boss" : "normal"}_${isLocked ? "locked" : state === "completed" ? "completed" : biome}`;
  }

  private ensurePinTexture(isBoss: boolean, isLocked: boolean, state: string, biome: BiomeId, color: number) {
    const key = this.getPinTextureKey(isBoss, isLocked, state, biome);
    if (this.textures.exists(key)) return key;

    const g = this.make.graphics({ x: 0, y: 0, add: false });
    const radius = isBoss ? PIN_RADIUS + 5 : PIN_RADIUS;
    
    // Draw shadow
    g.fillStyle(0x06121a, 0.44);
    g.fillEllipse(50, 68, 58, 20);

    // Draw outer
    g.fillStyle(color, isLocked ? 0.76 : 0.96);
    g.lineStyle(isBoss ? 5 : 4, isLocked ? 0x2c3036 : 0x5f3515, 0.9);
    g.fillCircle(50, 50, radius);
    g.strokeCircle(50, 50, radius);

    // Draw middle
    g.fillStyle(0x22170d, 0.92);
    g.lineStyle(2, 0xfff2a5, isLocked ? 0.16 : 0.55);
    const midRadius = isBoss ? PIN_RADIUS - 3 : PIN_RADIUS - 7;
    g.fillCircle(50, 50, midRadius);
    g.strokeCircle(50, 50, midRadius);

    // Draw inner
    g.fillStyle(color, isLocked ? 0.55 : 1);
    const innerRadius = isBoss ? PIN_RADIUS - 10 : PIN_RADIUS - 13;
    g.fillCircle(50, 50, innerRadius);

    g.generateTexture(key, 100, 100);
    g.destroy();

    return key;
  }

  private createLevelPins() {
    MAIN_CAMPAIGN.nodes.forEach((node, index) => this.createLevelPin(node, index));
  }

  private createLevelPin(node: CampaignNodeConfig, index: number) {
    const level = getLevelConfig(node.levelId);
    const state = getNodeState(node.levelId, this.progress, this.unlockAllForDebug);
    const color = this.pinColor(node.regionId, state);
    const isLocked = state === "locked";
    const isBoss = node.nodeType === "boss" || node.nodeType === "final";
    const baseScale = level.order <= 3 ? INTRO_PIN_SCALE : 1;
    const textureKey = this.ensurePinTexture(isBoss, isLocked, state, node.regionId, color);
    const pinImage = this.add.image(0, 0, textureKey);
    const number = this.add
      .text(0, -1, String(level.order), {
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: isBoss ? "23px" : "21px",
        color: isLocked ? "#cbd0d5" : "#ffffff",
        stroke: "#1c1008",
        strokeThickness: 5,
      })
      .setOrigin(0.5);
    const label = this.add
      .text(0, 39, this.nodeLabel(level.title, state), {
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: "10px",
        color: isLocked ? "#d2d5d8" : "#fff2c2",
        stroke: "#160d08",
        strokeThickness: 4,
        align: "center",
      })
      .setOrigin(0.5);
    const stateBadge = this.add
      .text(0, -32, this.stateBadgeText(state, node.nodeType), {
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: "11px",
        color: "#ffffff",
        stroke: "#15100b",
        strokeThickness: 4,
      })
      .setOrigin(0.5);

    label.setAlpha(isLocked ? 0.78 : 1);

    const pin = this.add
      .container(node.x, node.y, [pinImage, number, stateBadge, label])
      .setDepth(PIN_DEPTH + index)
      .setScale(baseScale);
    const zone = this.add
      .zone(node.x, node.y, PIN_RADIUS * 3.2 * baseScale, PIN_RADIUS * 3.4 * baseScale)
      .setDepth(PIN_DEPTH + 160 + index)
      .setInteractive({ useHandCursor: !isLocked || this.unlockAllForDebug });

    if (state === "current" || (!isLocked && isBoss)) {
      this.tweens.add({
        targets: pin,
        y: node.y - 5,
        duration: 980 + index * 30,
        yoyo: true,
        repeat: -1,
        ease: "Sine.InOut",
      });
    }

    this.log("MAP", `node ${node.levelId} state=${state} x=${node.x} y=${node.y}`);

    zone.on("pointerover", () => {
      if (this.transitionLocked) {
        return;
      }
      this.tweens.killTweensOf(pin);
      this.tweens.add({
        targets: pin,
        scaleX: baseScale * (isLocked ? 1.03 : 1.13),
        scaleY: baseScale * (isLocked ? 1.03 : 1.13),
        duration: 90,
        ease: "Sine.Out",
      });
    });

    zone.on("pointerout", () => {
      if (this.transitionLocked) {
        return;
      }
      this.tweens.killTweensOf(pin);
      this.tweens.add({
        targets: pin,
        scaleX: baseScale,
        scaleY: baseScale,
        y: node.y,
        duration: 115,
        ease: "Sine.Out",
        onComplete: () => {
          if (pin.active && (state === "current" || (!isLocked && isBoss))) {
            this.tweens.add({
              targets: pin,
              y: node.y - 5,
              duration: 980 + index * 30,
              yoyo: true,
              repeat: -1,
              ease: "Sine.InOut",
            });
          }
        },
      });
    });

    zone.on("pointerdown", () => {
      if (this.transitionLocked) {
        return;
      }
      this.tweens.killTweensOf(pin);
      this.tweens.add({
        targets: pin,
        scaleX: baseScale * 0.93,
        scaleY: baseScale * 0.93,
        duration: 55,
        ease: "Sine.Out",
      });
    });

    zone.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (this.transitionLocked || this.didPointerDrag(pointer)) {
        return;
      }

      this.selectLevel(node, pin);
    });
  }

  private createFixedHud() {
    const completed = this.progress.completedLevelIds.length;
    const total = MAIN_CAMPAIGN.nodes.length;
    const progressWidth = 260;
    const shade = this.add
      .rectangle(640, 54, 510, 98, 0x061018, 0.7)
      .setDepth(HUD_DEPTH)
      .setScrollFactor(0);
    const title = this.add
      .text(640, 25, t("map_campaign_map"), {
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: "30px",
        color: "#fff0b7",
        stroke: "#1a1008",
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(HUD_DEPTH + 1)
      .setScrollFactor(0);
    const hint = this.add
      .text(640, 52, t("map_drag_wheel_hint"), {
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: "12px",
        color: "#d9ecff",
        stroke: "#101820",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(HUD_DEPTH + 1)
      .setScrollFactor(0);
    const progressBack = this.add
      .rectangle(640, 78, progressWidth, 12, 0x091018, 0.82)
      .setDepth(HUD_DEPTH + 1)
      .setScrollFactor(0);
    const progressFill = this.add
      .rectangle(640 - progressWidth / 2, 78, Math.max(8, progressWidth * (completed / total)), 12, 0xf7d36c, 0.94)
      .setOrigin(0, 0.5)
      .setDepth(HUD_DEPTH + 2)
      .setScrollFactor(0);
    const progressText = this.add
      .text(640, 78, t("map_cleared", { completed, total }), {
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: "12px",
        color: "#fff2c2",
        stroke: "#1b1009",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(HUD_DEPTH + 3)
      .setScrollFactor(0);

    shade.setStrokeStyle(2, 0xf7d36c, 0.45);
    title.setShadow(0, 3, "#000000", 8, true, true);
    hint.setShadow(0, 2, "#000000", 5, true, true);
    progressBack.setStrokeStyle(2, 0xf7d36c, 0.46);
    progressFill.setStrokeStyle(1, 0xfff0a0, 0.35);
    progressText.setShadow(0, 2, "#000000", 5, true, true);

    const backShadow = this.add
      .rectangle(87, 57, 146, 62, 0x120b07, 0.72)
      .setDepth(HUD_DEPTH)
      .setScrollFactor(0);
    const backButton = this.add
      .rectangle(84, 53, 146, 62, 0x5a3219, 0.98)
      .setStrokeStyle(4, 0xe3b653, 1)
      .setDepth(HUD_DEPTH + 2)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    const backInner = this.add
      .rectangle(84, 53, 132, 48, 0x75431f, 0.98)
      .setStrokeStyle(2, 0x3a1d0e, 0.9)
      .setDepth(HUD_DEPTH + 3)
      .setScrollFactor(0);
    const backLabel = this.add
      .text(84, 52, t("map_back"), {
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: "21px",
        color: "#fff1bd",
        stroke: "#1b0e07",
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(HUD_DEPTH + 4)
      .setScrollFactor(0);

    backShadow.setRotation(-0.012);
    backLabel.setShadow(0, 2, "#000000", 4, true, true);
    backButton.on("pointerover", () => {
      backButton.setFillStyle(0x74441f, 1);
      backInner.setFillStyle(0x8a5427, 1);
    });
    backButton.on("pointerout", () => {
      backButton.setFillStyle(0x5a3219, 0.98);
      backInner.setFillStyle(0x75431f, 0.98);
    });
    backButton.on("pointerdown", () => this.returnToMainMenu());

  }

  private returnToMainMenu() {
    if (this.transitionLocked) return;

    this.transitionLocked = true;
    this.pointerDown = false;
    this.activePointerId = undefined;
    this.sound.play("select-sfx", { volume: 0.3 });
    this.log("MAP", "back -> main menu");
    this.cameras.main.fadeOut(150, 0, 0, 0);
    this.time.delayedCall(150, () => this.scene.start("SceneTransition", {
      target: "MainMenu",
      targetData: { skipSplash: true },
      release: "campaign",
    }));
  }

  private enableMapPan() {
    if (!this.input.pointer2) {
      this.input.addPointer(1);
    }

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.transitionLocked) {
        return;
      }

      if (this.beginPinchIfReady()) {
        return;
      }

      this.pointerDown = true;
      this.activePointerId = pointer.id;
      this.dragStartX = pointer.x;
      this.dragStartY = pointer.y;
      this.dragStartScrollX = this.cameras.main.scrollX;
      this.dragStartScrollY = this.cameras.main.scrollY;
      this.dragMoved = false;
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.updatePinch()) {
        return;
      }

      if (
        this.transitionLocked ||
        !this.pointerDown ||
        this.activePointerId !== pointer.id ||
        !pointer.isDown
      ) {
        return;
      }

      const dx = pointer.x - this.dragStartX;
      const dy = pointer.y - this.dragStartY;
      const distance = Math.hypot(dx, dy);

      if (distance >= DRAG_THRESHOLD_PX) {
        this.dragMoved = true;
      }

      if (!this.dragMoved) {
        return;
      }

      this.cameras.main.setScroll(
        this.clampScrollX(this.dragStartScrollX - dx),
        this.clampScrollY(this.dragStartScrollY - dy),
      );
      this.logScroll();
    });

    this.input.on(
      "wheel",
      (
        _pointer: Phaser.Input.Pointer,
        _gameObjects: Phaser.GameObjects.GameObject[],
        deltaX: number,
        deltaY: number,
      ) => {
        if (this.transitionLocked) {
          return;
        }

        this.cameras.main.setScroll(
          this.clampScrollX(this.cameras.main.scrollX + deltaX),
          this.clampScrollY(this.cameras.main.scrollY + deltaY),
        );
        this.logScroll();
      },
    );

    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => this.releasePointer(pointer));
    this.input.on("pointerupoutside", (pointer: Phaser.Input.Pointer) => this.releasePointer(pointer));
  }

  private releasePointer(pointer: Phaser.Input.Pointer) {
    if (this.pinchActive) {
      this.pinchActive = false;
      this.dragMoved = true;
      this.log("MAP", `pinch end zoom=${this.cameras.main.zoom.toFixed(2)}`);
    }

    if (this.activePointerId !== pointer.id) {
      return;
    }

    this.pointerDown = false;
    this.activePointerId = undefined;
  }

  private didPointerDrag(pointer: Phaser.Input.Pointer) {
    return this.dragMoved || pointer.getDistance() >= DRAG_THRESHOLD_PX;
  }

  private selectLevel(node: CampaignNodeConfig, pin: Phaser.GameObjects.Container) {
    const state = getNodeState(node.levelId, this.progress, this.unlockAllForDebug);

    if (state === "locked") {
      this.log("MAP", `locked level selected id=${node.levelId}`);
      this.sound.play("hit-sfx", { volume: 0.16 });
      this.tweens.add({
        targets: pin,
        x: { from: node.x - 8, to: node.x + 8 },
        duration: 42,
        yoyo: true,
        repeat: 3,
        onComplete: () => pin.setX(node.x),
      });
      return;
    }

    const attemptSeed = ensureLevelAttemptSeed(node.levelId);
    this.progress = loadCampaignProgress();
    const runtime = getLevelRuntime(node.levelId, undefined, this.progress);
    const battleData: BattleStartData = { ...runtime.battleStartData, attemptSeed };

    this.transitionLocked = true;
    this.sound.play("select-sfx", { volume: 0.34 });
    this.log(
      "MAP",
      `level selected id=${battleData.levelId} mapId=${battleData.mapId} biome=${battleData.biome}`,
    );
    this.log("MATH", difficultySummary(runtime.level, runtime.map));

    this.tweens.killTweensOf(pin);
    this.tweens.add({
      targets: pin,
      scaleX: 1.2,
      scaleY: 1.2,
      duration: 120,
      yoyo: true,
      ease: "Sine.Out",
    });

    stopSceneMusic(this, "lobby-music");
    this.cameras.main.fadeOut(180, 0, 0, 0);
    this.time.delayedCall(180, () => this.scene.start("SceneTransition", {
      target: "Game",
      targetData: battleData,
      release: "campaign-for-battle",
    }));
  }

  private nodeLabel(title: string, state: string) {
    if (state === "locked") {
      return "LOCKED";
    }

    return title.toUpperCase().split(" ").slice(0, 2).join("\n");
  }

  private stateBadgeText(state: string, nodeType: string) {
    if (state === "completed") {
      return t("map_badge_ok");
    }

    if (state === "locked") {
      return t("map_badge_lock");
    }

    if (nodeType === "final") {
      return t("map_badge_final");
    }

    if (nodeType === "boss") {
      return "BOSS";
    }

    if (nodeType === "elite") {
      return "ELITE";
    }

    return state === "current" ? "NEXT" : "PLAY";
  }

  private pinColor(biome: BiomeId, state: string) {
    if (state === "locked") {
      return 0x68707b;
    }

    if (state === "completed") {
      return 0x4fd06f;
    }

    const colors: Record<BiomeId, number> = {
      grasslands: 0x3ac468,
      silent_forest: 0x1d9b66,
      muddy_fields: 0x9d7a45,
      storm_valley: 0x4eb8ff,
      dry_steppe: 0xd18745,
      desert: 0xf0bd54,
      frozen_pass: 0xa8e3ff,
      infernal_dungeon: 0xff5a35,
    };

    return colors[biome];
  }

  private clampScrollX(scrollX: number) {
    return clamp(scrollX, 0, this.maxScrollX());
  }

  private clampScrollY(scrollY: number) {
    return clamp(scrollY, 0, this.maxScrollY());
  }

  private maxScrollX() {
    return Math.max(0, MAIN_CAMPAIGN.worldWidth - this.cameras.main.displayWidth);
  }

  private maxScrollY() {
    return Math.max(0, MAIN_CAMPAIGN.worldHeight - this.cameras.main.displayHeight);
  }

  private beginPinchIfReady() {
    const pointers = this.activeTouchPointers();

    if (pointers.length < 2) {
      return false;
    }

    const [first, second] = pointers;
    this.pinchActive = true;
    this.pointerDown = false;
    this.activePointerId = undefined;
    this.dragMoved = true;
    this.pinchStartDistance = PhaserMath.Distance.Between(first.x, first.y, second.x, second.y);
    this.pinchStartZoom = this.cameras.main.zoom;
    this.log("MAP", `pinch start zoom=${this.pinchStartZoom.toFixed(2)}`);
    return true;
  }

  private updatePinch() {
    const pointers = this.activeTouchPointers();

    if (pointers.length < 2) {
      return false;
    }

    if (!this.pinchActive) {
      return this.beginPinchIfReady();
    }

    const [first, second] = pointers;
    const distance = PhaserMath.Distance.Between(first.x, first.y, second.x, second.y);

    if (this.pinchStartDistance < PINCH_EPSILON_PX || distance < PINCH_EPSILON_PX) {
      return true;
    }

    const targetZoom = clamp(
      this.pinchStartZoom * (distance / this.pinchStartDistance),
      MIN_MAP_ZOOM,
      MAX_MAP_ZOOM,
    );
    const focusX = (first.x + second.x) / 2;
    const focusY = (first.y + second.y) / 2;
    this.setZoomAt(targetZoom, focusX, focusY);
    return true;
  }

  private activeTouchPointers() {
    return [this.input.pointer1, this.input.pointer2].filter(
      (pointer): pointer is Phaser.Input.Pointer => Boolean(pointer?.isDown && pointer.wasTouch),
    );
  }

  private setZoomAt(zoom: number, screenX: number, screenY: number) {
    const camera = this.cameras.main;
    const previousZoom = camera.zoom;

    if (Math.abs(zoom - previousZoom) < 0.001) {
      return;
    }

    const focus = camera.getWorldPoint(screenX, screenY);
    camera.setZoom(zoom);
    camera.setScroll(
      this.clampScrollX(focus.x - screenX / zoom),
      this.clampScrollY(focus.y - screenY / zoom),
    );
    this.logScroll();
  }

  private logCampaignValidation() {
    const result = validateCampaignConfig();
    this.log("CONFIG", formatCampaignValidation(result));
    result.errors.forEach((error) => this.log("CONFIG_ERROR", error));
  }

  private logScroll(force = false) {
    const scrollX = Math.round(this.cameras.main.scrollX);
    const scrollY = Math.round(this.cameras.main.scrollY);
    const now = this.time.now;
    const movedEnough =
      !Number.isFinite(this.lastLoggedScrollX) ||
      !Number.isFinite(this.lastLoggedScrollY) ||
      Math.abs(scrollX - this.lastLoggedScrollX) >= 128 ||
      Math.abs(scrollY - this.lastLoggedScrollY) >= 128;
    const waitedEnough = now - this.lastScrollLogAt >= 180;

    if (!force && (!movedEnough || !waitedEnough)) {
      return;
    }

    this.lastLoggedScrollX = scrollX;
    this.lastLoggedScrollY = scrollY;
    this.lastScrollLogAt = now;
    this.log("MAP", `scroll x=${scrollX} y=${scrollY}`);
  }

  private log(scope: string, message: string) {
    castleLog(scope, message);
  }
}
