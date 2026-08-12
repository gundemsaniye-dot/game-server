import { generateRectTexture, Scene } from "phaser";
import { i18n, t } from "../i18n/Localization";
import {
  queueMainMenuRuntime,
  releaseBattleRuntimeMemory,
  releaseCampaignTexture,
  releaseSplashTextures,
} from "../assets/RuntimeAssets";
import { MenuLevelRuntime } from "../types/MapTypes";
import { NetworkClient } from "../network/NetworkClient";
import { playSceneMusic } from "../audio/GameAudio";
import { castleLog } from "../utils/DevLog";

type MenuButtonConfig = {
  action: string;
  hoverKey: string;
  sourceBox?: SourceBox;
  onClick: () => void;
  hoverScale?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

type SourceBox = readonly [left: number, top: number, right: number, bottom: number];

type LegalSection = {
  id: string;
  title: string;
  summary: string;
  body: string;
};

type LegalContent = {
  appName: string;
  version: string;
  effectiveDate: string;
  sections: LegalSection[];
};

const MENU_WIDTH = 1280;
const MENU_HEIGHT = 720;
const MENU_SOURCE_WIDTH = 1672;
const MENU_SOURCE_HEIGHT = 941;
const LOBBY_MUSIC_VOLUME = 0.46;
const LOBBY_MUSIC_FADE_IN_MS = 1500;

// These values come from the transparent PNG's real visible button bounds.
// Source PNG bbox: x 437..1235, y 588..824 on a 1672x941 image.
const TAP_HIT_X = 640;
const TAP_HIT_Y = 540;
const TAP_HIT_WIDTH = 612;
const TAP_HIT_HEIGHT = 181;

const SPLASH_DARKEN_MS = 620;
const SPLASH_REVEAL_MS = 480;
const SOUND_PREFERENCE_KEY = "castle-stormers.sound-muted";

export class MainMenu extends Scene {
  private skipSplash = false;
  private splashDismissing = false;
  private splashButtonPulse?: Phaser.Tweens.Tween;
  private splashSoldierFloat?: Phaser.Tweens.Tween;
  private splashVisuals: Phaser.GameObjects.GameObject[] = [];
  private splashHitZone?: Phaser.GameObjects.Zone;
  private transitionCurtain?: Phaser.GameObjects.Rectangle;
  private settingsVisuals: Phaser.GameObjects.GameObject[] = [];
  private settingsOpen = false;

  constructor() {
    super("MainMenu");
  }

  init(data?: { skipSplash?: boolean }) {
    this.skipSplash = Boolean(data?.skipSplash);
  }

  preload() {
    this.load.setPath("assets");
    // MainMenu can be entered after a direct benchmark battle, so it must own
    // all of its runtime assets instead of assuming Preloader already did it.
    queueMainMenuRuntime(this);
  }

  create() {
    this.cameras.main.setBackgroundColor(0x000000);
    releaseBattleRuntimeMemory(this);
    releaseCampaignTexture(this);
    this.applyStoredSoundPreference();
    if (this.skipSplash) {
      releaseSplashTextures(this);
      this.createMainMenuVisuals();
      this.createMenuButtons();
      this.startLobbyMusic();
      return;
    }
    this.createSplashScreen();
  }

  private createSplashScreen() {
    this.splashDismissing = false;
    this.cameras.main.resetFX();
    this.log("SPLASH", "create layered splash");

    const background = this.add
      .image(640, 360, "splash-background")
      .setDisplaySize(MENU_WIDTH, MENU_HEIGHT)
      .setDepth(0);

    const soldiers = this.add
      .image(640, 360, "splash-animation-soldier")
      .setDisplaySize(MENU_WIDTH, MENU_HEIGHT)
      .setDepth(10)
      .setAlpha(0.96);

    // IMPORTANT: use the full transparent PNG as-is. The button is already positioned
    // correctly inside the 1672x941 source image, so we only scale the whole layer to 1280x720.
    const tapButtonLayer = this.add
      .image(640, 360, "splash-tap-to-start-button")
      .setDisplaySize(MENU_WIDTH, MENU_HEIGHT)
      .setDepth(20);

    const hitZone = this.add
      .zone(TAP_HIT_X, TAP_HIT_Y, TAP_HIT_WIDTH, TAP_HIT_HEIGHT)
      .setDepth(25)
      .setInteractive({ useHandCursor: true });

    this.splashVisuals = [background, soldiers, tapButtonLayer];
    this.splashHitZone = hitZone;

    const buttonBaseScaleX = tapButtonLayer.scaleX;
    const buttonBaseScaleY = tapButtonLayer.scaleY;

    this.splashButtonPulse = this.tweens.add({
      targets: tapButtonLayer,
      alpha: { from: 0.86, to: 1 },
      scaleX: buttonBaseScaleX * 1.012,
      scaleY: buttonBaseScaleY * 1.012,
      duration: 1280,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });

    const soldierBaseScaleX = soldiers.scaleX;
    const soldierBaseScaleY = soldiers.scaleY;

    this.splashSoldierFloat = this.tweens.add({
      targets: soldiers,
      x: 646,
      y: 366,
      scaleX: soldierBaseScaleX * 1.012,
      scaleY: soldierBaseScaleY * 1.012,
      duration: 4300,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });

    hitZone.once("pointerdown", () => this.dismissSplashScreen());
  }

  private dismissSplashScreen() {
    if (this.splashDismissing) {
      return;
    }

    this.splashDismissing = true;
    this.log("SPLASH", "tap-to-start pressed");
    this.sound.play("select-sfx", { volume: 0.28 });
    this.startLobbyMusic();

    this.splashHitZone?.disableInteractive();
    this.splashButtonPulse?.stop();
    this.splashSoldierFloat?.stop();

    const curtain = this.add
      .rectangle(640, 360, MENU_WIDTH, MENU_HEIGHT, 0x000000, 0)
      .setDepth(100);
    this.transitionCurtain = curtain;

    this.tweens.add({
      targets: this.splashVisuals,
      scaleX: "*=1.012",
      scaleY: "*=1.012",
      alpha: 0.72,
      duration: SPLASH_DARKEN_MS,
      ease: "Sine.InOut",
    });

    this.tweens.add({
      targets: curtain,
      alpha: 1,
      duration: SPLASH_DARKEN_MS,
      ease: "Cubic.InOut",
      onComplete: () => {
        this.destroySplashVisuals();
        this.createMainMenuVisuals();
        this.createMenuButtons();
        this.log("SPLASH", "main menu revealed");

        this.tweens.add({
          targets: curtain,
          alpha: 0,
          duration: SPLASH_REVEAL_MS,
          ease: "Cubic.Out",
          onComplete: () => {
            curtain.destroy();
            if (this.transitionCurtain === curtain) {
              this.transitionCurtain = undefined;
            }
          },
        });
      },
    });
  }

  private destroySplashVisuals() {
    this.splashVisuals.forEach((object) => object.destroy());
    this.splashVisuals = [];
    this.splashHitZone?.destroy();
    this.splashHitZone = undefined;
    releaseSplashTextures(this);
  }

  private createMainMenuVisuals() {
    this.add.image(640, 360, "menu-background").setDisplaySize(MENU_WIDTH, MENU_HEIGHT).setDepth(0);
    this.add.image(640, 360, "menu-logo-base").setDisplaySize(MENU_WIDTH, MENU_HEIGHT).setDepth(10);
    this.add.image(500, 630, "menu-upgrades-base").setDisplaySize(171, 136).setDepth(20);
    this.add.image(780, 630, "menu-settings-base").setDisplaySize(168, 136).setDepth(20);
  }

  private createMenuButtons() {
    this.createModeButton({
      texture: "menu-campaign-button",
      label: "CAMPAIGN",
      x: 640,
      y: 408,
      width: 414,
      height: 92,
      fontSize: 34,
      onClick: () => this.startMapSelect(),
    });

    this.createHitButton({
      action: "upgrades",
      hoverKey: "menu-upgrades-hover",
      x: 500,
      y: 630,
      width: 171,
      height: 136,
      onClick: () => this.scene.start("ArmyLoadout"),
    });
    this.createHitButton({
      action: "settings",
      hoverKey: "menu-settings-hover",
      x: 780,
      y: 630,
      width: 168,
      height: 136,
      onClick: () => this.openSettings(),
    });

    this.createModeButton({
      texture: "menu-online-pvp-button",
      label: "1V1 ONLINE",
      x: 640,
      y: 497,
      width: 414,
      height: 92,
      fontSize: 26,
      labelOffsetY: 7,
      onClick: () => this.startOnlineMatch(),
    });
  }

  private createModeButton(config: {
    texture: string;
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
    fontSize: number;
    labelOffsetY?: number;
    onClick: () => void;
  }) {
    const plate = this.add.image(0, 0, config.texture).setDisplaySize(config.width, config.height);
    const label = this.add.text(0, config.labelOffsetY ?? 0, config.label, {
      fontFamily: "Arial Black",
      fontSize: `${config.fontSize}px`,
      color: "#ffffff",
      stroke: "#120b08",
      strokeThickness: Math.max(5, Math.round(config.fontSize * 0.16)),
      align: "center",
    }).setOrigin(0.5);
    const button = this.add.container(config.x, config.y, [plate, label])
      .setDepth(60)
      .setSize(config.width, config.height)
      .setInteractive({ useHandCursor: true });

    button.on("pointerover", () => button.setScale(1.035));
    button.on("pointerout", () => button.setScale(1));
    button.on("pointerdown", () => {
      this.sound.play("select-sfx", { volume: 0.32 });
      config.onClick();
    });
  }

  private async startOnlineMatch() {
    const net = NetworkClient.getInstance();

    // Create dark backdrop
    const backdrop = this.add.rectangle(640, 360, 1280, 720, 0x070b12, 0.88)
      .setDepth(200)
      .setInteractive();

    // Modal panel box
    const modal = this.add.rectangle(640, 360, 520, 280, 0x121b29, 0.96)
      .setStrokeStyle(4, 0x27d6f0)
      .setDepth(201);

    const titleText = this.add.text(640, 250, "1V1 ONLINE EŞLEŞME", {
      fontFamily: "Arial Black",
      fontSize: "26px",
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 5,
    }).setOrigin(0.5).setDepth(202);

    const statusText = this.add.text(640, 340, "Sunucuya bağlanılıyor...", {
      fontFamily: "Arial",
      fontSize: "20px",
      color: "#7ee7f8",
      stroke: "#000000",
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(202);

    // Cancel Button
    const cancelBtn = this.add.text(640, 440, "  İPTAL  ", {
      fontFamily: "Arial Black",
      fontSize: "18px",
      color: "#ffffff",
      backgroundColor: "#b43a29",
      padding: { x: 20, y: 8 },
    }).setOrigin(0.5).setDepth(202).setInteractive({ useHandCursor: true });

    const closeOverlay = () => {
      backdrop.destroy();
      modal.destroy();
      titleText.destroy();
      statusText.destroy();
      cancelBtn.destroy();
    };

    cancelBtn.on("pointerdown", () => {
      this.sound.play("select-sfx", { volume: 0.32 });
      net.disconnect();
      closeOverlay();
    });

    try {
      await net.connect();
      statusText.setText("Rakip aranıyor...");

      net.once("match_found", () => {
        statusText.setText("RAKİP BULUNDU! HAZIRLANILIYOR...");
        statusText.setColor("#55ff88");
      });

      net.once("initial_state", () => {
        const authoritativeSide = net.playerSide;
        const authoritativeRoomId = net.roomId;
        if (!authoritativeSide || !authoritativeRoomId) {
          statusText.setText("SUNUCU TARAF BİLGİSİ EKSİK");
          statusText.setColor("#ff4444");
          return;
        }
        statusText.setText("ARENA YÜKLENİYOR...");
        closeOverlay();
        this.scene.start("Game", {
          isOnline: true,
          roomId: authoritativeRoomId,
          side: authoritativeSide,
          levelId: "level_001",
          mapIndex: 0,
          playerLoadout: ["peasant", "swordsman", "archer", "horseman"],
          attemptSeed: net.matchSeed ?? undefined,
        });
      });

      net.findMatch();
    } catch (err) {
      statusText.setText("Sunucuya bağlanılamadı!");
      statusText.setColor("#ff4444");
      setTimeout(() => closeOverlay(), 2500);
    }
  }

  private createHitButton(config: MenuButtonConfig) {
    const box = config.sourceBox
      ? this.sourceBoxToGame(config.sourceBox)
      : { x: config.x!, y: config.y!, width: config.width!, height: config.height! };
    const hoverButton = this.add
      .image(box.x, box.y, config.hoverKey)
      .setDisplaySize(box.width, box.height)
      .setDepth(42)
      .setAlpha(0);
    const baseScaleX = hoverButton.scaleX;
    const baseScaleY = hoverButton.scaleY;
    const hoverScale = config.hoverScale ?? 1.045;
    const zone = this.add
      .zone(box.x, box.y, box.width, box.height)
      .setDepth(50)
      .setInteractive({ useHandCursor: true });

    zone.on("pointerover", () => {
      this.tweens.killTweensOf(hoverButton);
      this.tweens.add({
        targets: hoverButton,
        alpha: 1,
        scaleX: baseScaleX * hoverScale,
        scaleY: baseScaleY * hoverScale,
        duration: 92,
        ease: "Sine.Out",
      });
    });
    zone.on("pointerout", () => {
      this.tweens.killTweensOf(hoverButton);
      this.tweens.add({
        targets: hoverButton,
        alpha: 0,
        scaleX: baseScaleX,
        scaleY: baseScaleY,
        duration: 110,
        ease: "Sine.Out",
      });
    });
    zone.on("pointerdown", () => {
      this.sound.play("select-sfx", { volume: 0.32 });
      this.tweens.add({
        targets: hoverButton,
        alpha: 1,
        scaleX: baseScaleX * 0.985,
        scaleY: baseScaleY * 0.985,
        duration: 55,
        yoyo: true,
        repeat: 1,
      });
      this.log("MENU", `${config.action} pressed`);
      config.onClick();
    });

    return zone;
  }

  private sourceBoxToGame(sourceBox: SourceBox) {
    const [left, top, right, bottom] = sourceBox;
    const scaleX = MENU_WIDTH / MENU_SOURCE_WIDTH;
    const scaleY = MENU_HEIGHT / MENU_SOURCE_HEIGHT;

    return {
      x: ((left + right) / 2) * scaleX,
      y: ((top + bottom) / 2) * scaleY,
      width: (right - left) * scaleX,
      height: (bottom - top) * scaleY,
    };
  }

  private startMapSelect() {
    this.log("MENU", "start -> map");
    this.cameras.main.fadeOut(150, 0, 0, 0);
    this.time.delayedCall(150, () => {
      this.scene.start("SceneTransition", {
        target: "MapSelect",
        release: "menu",
      });
    });
  }

  private openSettings() {
    if (this.settingsOpen) return;
    this.settingsOpen = true;
    this.log("SETTINGS", "opened");
    this.renderSettingsHome();
  }

  private renderSettingsHome() {
    this.clearSettingsVisuals();
    const content = this.getLegalContent();
    this.createSettingsFrame(t("menu_settings_title"), t("menu_settings_subtitle"));

    const muted = this.sound.mute;
    this.createSettingsAction(445, 186, 360, 58, t("menu_settings_sound", { state: muted ? t("off") : t("on") }), () => {
      this.sound.mute = !this.sound.mute;
      this.storeSoundPreference(this.sound.mute);
      this.renderSettingsHome();
    }, 0x5a351d);

    this.createSettingsAction(835, 186, 360, 58, t("menu_settings_language", { lang: i18n.getLanguageName(i18n.getLanguage()) }), () => {
      i18n.toggleLanguage();
      this.renderSettingsHome();
    }, 0x5a351d);

    const positions = [
      [445, 278],
      [835, 278],
      [445, 362],
      [835, 362],
      [640, 446],
    ] as const;

    content.sections.slice(0, positions.length).forEach((section, index) => {
      const [x, y] = positions[index];
      this.createSettingsAction(x, y, index === 4 ? 620 : 360, 64, section.title, () => {
        this.renderLegalSection(section);
      });
    });

    const version = this.add.text(640, 515, t("menu_version", { appName: content.appName, version: content.version }), {
      fontFamily: "Arial, sans-serif",
      fontSize: "16px",
      color: "#53351f",
    }).setOrigin(0.5).setDepth(224);
    this.settingsVisuals.push(version);

    this.createSettingsAction(640, 594, 280, 58, t("menu_settings_close"), () => this.closeSettings(), 0x8f241d);
  }

  private renderLegalSection(section: LegalSection) {
    this.clearSettingsVisuals();
    const content = this.getLegalContent();
    this.createSettingsFrame(section.title, section.summary);

    const body = this.add.text(250, 170, section.body, {
      fontFamily: "Arial, sans-serif",
      fontSize: "19px",
      color: "#3b291b",
      lineSpacing: 8,
      wordWrap: { width: 780, useAdvancedWrap: true },
      align: "left",
    }).setDepth(224);
    this.settingsVisuals.push(body);

    const date = this.add.text(640, 532, t("menu_effective_date", { date: content.effectiveDate }), {
      fontFamily: "Arial, sans-serif",
      fontSize: "15px",
      color: "#6a4930",
    }).setOrigin(0.5).setDepth(224);
    this.settingsVisuals.push(date);

    this.createSettingsAction(490, 594, 260, 58, t("menu_settings_back"), () => this.renderSettingsHome(), 0x5a351d);
    this.createSettingsAction(790, 594, 260, 58, t("menu_settings_close"), () => this.closeSettings(), 0x8f241d);
  }

  private createSettingsFrame(title: string, subtitle: string) {
    const shade = this.add.rectangle(640, 360, MENU_WIDTH, MENU_HEIGHT, 0x07101a, 0.78)
      .setDepth(210)
      .setInteractive();
    const wood = this.add.rectangle(640, 360, 900, 630, 0x3a2115, 1)
      .setStrokeStyle(5, 0xd6a744, 1)
      .setDepth(215);
    const parchment = this.add.rectangle(640, 376, 848, 552, 0xd7bd88, 1)
      .setStrokeStyle(4, 0x7b4b27, 1)
      .setDepth(216);
    const header = this.add.rectangle(640, 100, 848, 78, 0x4b2a18, 1)
      .setStrokeStyle(3, 0xe2b54f, 1)
      .setDepth(220);
    const heading = this.add.text(640, 91, title, {
      fontFamily: "Arial Black, Arial, sans-serif",
      fontSize: "30px",
      color: "#f5d36b",
      stroke: "#160d08",
      strokeThickness: 5,
    }).setOrigin(0.5).setDepth(224);
    const subheading = this.add.text(640, 130, subtitle, {
      fontFamily: "Arial, sans-serif",
      fontSize: "14px",
      color: "#f0dfb9",
    }).setOrigin(0.5).setDepth(224);
    this.settingsVisuals.push(shade, wood, parchment, header, heading, subheading);
  }

  private createSettingsAction(
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    onClick: () => void,
    fill = 0x70421f,
  ) {
    const button = this.add.rectangle(x, y, width, height, fill, 1)
      .setStrokeStyle(3, 0xe0b85a, 1)
      .setDepth(226)
      .setInteractive({ useHandCursor: true });
    const text = this.add.text(x, y, label, {
      fontFamily: "Arial Black, Arial, sans-serif",
      fontSize: label.length > 22 ? "17px" : "20px",
      color: "#fff4d0",
      stroke: "#1d1009",
      strokeThickness: 3,
      align: "center",
    }).setOrigin(0.5).setDepth(227);

    button.on("pointerover", () => button.setFillStyle(0x8a5429, 1));
    button.on("pointerout", () => button.setFillStyle(fill, 1));
    button.on("pointerdown", () => {
      if (!this.sound.mute) this.sound.play("select-sfx", { volume: 0.28 });
      onClick();
    });
    this.settingsVisuals.push(button, text);
  }

  private closeSettings() {
    this.clearSettingsVisuals();
    this.settingsOpen = false;
    this.log("SETTINGS", "closed");
  }

  private clearSettingsVisuals() {
    this.settingsVisuals.forEach((object) => object.destroy());
    this.settingsVisuals = [];
  }

  private getLegalContent() {
    return this.cache.json.get("legal-content") as LegalContent;
  }

  private applyStoredSoundPreference() {
    try {
      this.sound.mute = window.localStorage.getItem(SOUND_PREFERENCE_KEY) === "true";
    } catch {
      this.sound.mute = false;
    }
  }

  private storeSoundPreference(muted: boolean) {
    try {
      window.localStorage.setItem(SOUND_PREFERENCE_KEY, String(muted));
    } catch {
      // The preference simply remains session-only if storage is unavailable.
    }
  }

  private startLobbyMusic() {
    playSceneMusic(
      this,
      "lobby-music",
      LOBBY_MUSIC_VOLUME,
      (scope, message) => this.log(scope, message),
      { fadeInMs: LOBBY_MUSIC_FADE_IN_MS },
    );
  }

  private log(scope: string, message: string) {
    castleLog(scope, message);
  }
}
