import { GameObjects, Scene } from "phaser";
import { stopSceneMusic } from "../audio/GameAudio";
import {
  queueStoryTextures,
  storyTextureKey,
} from "../assets/RuntimeAssets";
import type {
  CampaignStoryData,
  StoryBubble,
  StoryPage,
  StorySceneData,
} from "../types/StoryTypes";
import type { BattleStartData } from "../systems/LevelRuntime";

const FADE_MS = 220;
const STORY_DEPTH = 100;

export class Story extends Scene {
  private battleStartData!: BattleStartData;
  private pages: StoryPage[] = [];
  private pageIndex = 0;
  private pageObjects: GameObjects.GameObject[] = [];
  private inputLocked = false;
  private backButton?: GameObjects.Container;
  private nextButton?: GameObjects.Container;
  private skipButton?: GameObjects.Container;
  private pageCounter?: GameObjects.Text;
  private lastFrameAt = 0;
  private maxFrameMs = 0;

  constructor() {
    super("Story");
  }

  init(data: StorySceneData) {
    this.battleStartData = data.battleStartData;
    this.pageIndex = 0;
    this.pageObjects = [];
    this.inputLocked = false;
    this.maxFrameMs = 0;
  }

  preload() {
    this.cameras.main.setBackgroundColor(0x100b09);
    this.load.setPath("assets");
    const data = this.cache.json.get("campaign-story") as CampaignStoryData;
    this.pages = this.pagesForLevel(data);
    queueStoryTextures(this, this.pages.map((page) => page.image));

    const loading = this.add.text(640, 360, "OPENING THE CHRONICLE…", {
      fontFamily: "Georgia, serif",
      fontSize: "24px",
      color: "#e7cf94",
    }).setOrigin(0.5);
    this.load.once("complete", () => loading.destroy());
  }

  create() {
    this.cameras.main.fadeIn(180, 0, 0, 0);
    this.add.rectangle(640, 360, 1280, 720, 0x090706).setDepth(0);
    this.createChrome();
    this.showPage(0, false);
    this.bindKeys();
    this.events.once("shutdown", () => this.releaseSceneReferences());
    this.publishQa();
  }

  runtimeObjectReferenceCount() {
    return this.pageObjects.length + [this.backButton, this.nextButton, this.skipButton, this.pageCounter]
      .filter(Boolean).length;
  }

  update(time: number) {
    if (this.lastFrameAt > 0) this.maxFrameMs = Math.max(this.maxFrameMs, time - this.lastFrameAt);
    this.lastFrameAt = time;
  }

  private pagesForLevel(data: CampaignStoryData): StoryPage[] {
    const entry = data.levels[this.battleStartData.levelId];
    const finalPage: StoryPage = {
      image: entry.image,
      title: entry.title,
      bubbles: [
        { kind: "caption", text: entry.body, x: 38, y: 73, width: 58 },
        { kind: "speech", speaker: "MISSION", text: entry.objective, x: 84, y: 24, width: 27 },
      ],
    };
    return this.battleStartData.levelId === "level_001"
      ? [...data.prologue.pages, finalPage]
      : [finalPage];
  }

  private createChrome() {
    this.add.rectangle(640, 26, 1280, 52, 0x130c08, 0.96)
      .setStrokeStyle(2, 0xd3a84d).setDepth(STORY_DEPTH + 10);
    this.add.text(30, 26, "CHRONICLE OF THE SHATTERED CROWN", {
      fontFamily: "Arial Black, Arial, sans-serif", fontSize: "19px", color: "#f5dda0",
    }).setOrigin(0, 0.5).setDepth(STORY_DEPTH + 11);
    this.pageCounter = this.add.text(1248, 26, "", {
      fontFamily: "Arial Black, Arial, sans-serif", fontSize: "18px", color: "#f5dda0",
    }).setOrigin(1, 0.5).setDepth(STORY_DEPTH + 11);

    this.backButton = this.makeButton(128, 674, 210, "BACK", 0x5a351d, () => this.go(-1));
    this.nextButton = this.makeButton(1125, 674, 250, "NEXT", 0x9f2d24, () => this.go(1));
    if (this.pages.length > 1) {
      this.skipButton = this.makeButton(640, 674, 230, "SKIP STORY", 0x3d291b, () => {
        if (!this.inputLocked && this.pageIndex !== this.pages.length - 1) this.showPage(this.pages.length - 1, true);
      });
    }
  }

  private makeButton(x: number, y: number, width: number, label: string, color: number, action: () => void) {
    const back = this.add.rectangle(0, 0, width, 64, color, 0.98)
      .setStrokeStyle(4, 0xe4b950);
    const inner = this.add.rectangle(0, 0, width - 14, 50, color + 0x080604, 0.95)
      .setStrokeStyle(2, 0x30170d);
    const text = this.add.text(0, 0, label, {
      fontFamily: "Arial Black, Arial, sans-serif", fontSize: "21px", color: "#fff1bd",
      stroke: "#1b0e07", strokeThickness: 5,
    }).setOrigin(0.5);
    const button = this.add.container(x, y, [back, inner, text]).setDepth(STORY_DEPTH + 20)
      .setSize(width, 64).setInteractive({ useHandCursor: true });
    button.on("pointerover", () => button.setScale(1.025));
    button.on("pointerout", () => button.setScale(1));
    button.on("pointerdown", action);
    return button;
  }

  private bindKeys() {
    this.input.keyboard?.on("keydown-LEFT", () => this.go(-1));
    this.input.keyboard?.on("keydown-RIGHT", () => this.go(1));
    this.input.keyboard?.on("keydown-ENTER", () => this.go(1));
    this.input.keyboard?.on("keydown-SPACE", () => this.go(1));
  }

  private go(direction: -1 | 1) {
    if (this.inputLocked) return;
    if (direction < 0 && this.pageIndex > 0) this.showPage(this.pageIndex - 1, true);
    else if (direction > 0 && this.pageIndex < this.pages.length - 1) this.showPage(this.pageIndex + 1, true);
    else if (direction > 0 && this.pageIndex === this.pages.length - 1) this.startBattle();
  }

  private showPage(index: number, animate: boolean) {
    if (this.inputLocked || index === this.pageIndex && this.pageObjects.length > 0) return;
    this.inputLocked = animate;
    const oldObjects = this.pageObjects;
    const nextObjects = this.buildPage(this.pages[index]);
    this.pageObjects = nextObjects;
    this.pageIndex = index;
    const final = index === this.pages.length - 1;
    this.setButtonLabel(this.nextButton, final ? "START BATTLE" : "NEXT");
    this.backButton?.setAlpha(index === 0 ? 0.42 : 1);
    this.skipButton?.setVisible(!final);
    this.pageCounter?.setText(`${index + 1} / ${this.pages.length}`);

    if (!animate) {
      oldObjects.forEach((object) => object.destroy());
      this.publishQa();
      return;
    }
    nextObjects.forEach((object) => {
      if ("setAlpha" in object && typeof object.setAlpha === "function") object.setAlpha(0);
    });
    this.tweens.add({ targets: oldObjects, alpha: 0, duration: FADE_MS, ease: "Sine.InOut" });
    this.tweens.add({
      targets: nextObjects, alpha: 1, duration: FADE_MS, ease: "Sine.InOut",
      onComplete: () => {
        oldObjects.forEach((object) => object.destroy());
        this.inputLocked = false;
        this.publishQa();
      },
    });
  }

  private buildPage(page: StoryPage): GameObjects.GameObject[] {
    const objects: GameObjects.GameObject[] = [];
    const image = this.add.image(640, 342, storyTextureKey(page.image))
      .setDisplaySize(1280, 576).setDepth(STORY_DEPTH);
    const shade = this.add.rectangle(640, 342, 1280, 576, 0x000000, 0.13).setDepth(STORY_DEPTH + 1);
    objects.push(image, shade);
    if (page.title) {
      objects.push(this.add.text(42, 78, page.title.toUpperCase(), {
        fontFamily: "Arial Black, Arial, sans-serif", fontSize: "34px", color: "#ffe39a",
        stroke: "#160b07", strokeThickness: 8,
      }).setDepth(STORY_DEPTH + 5));
    }
    page.bubbles.forEach((bubble) => objects.push(...this.createBubble(bubble)));
    return objects;
  }

  private createBubble(bubble: StoryBubble): GameObjects.GameObject[] {
    const x = bubble.x * 12.8;
    const y = 54 + bubble.y * 5.76;
    const width = bubble.width * 12.8;
    const text = bubble.speaker ? `${bubble.speaker.toUpperCase()}\n${bubble.text}` : bubble.text;
    const label = this.add.text(x, y, text, {
      fontFamily: bubble.kind === "caption" ? "Georgia, serif" : "Arial, sans-serif",
      fontStyle: bubble.kind === "caption" ? "italic" : "normal",
      fontSize: bubble.kind === "caption" ? "21px" : "20px",
      color: bubble.kind === "caption" ? "#f8e8bc" : "#17110d",
      lineSpacing: 5,
      align: bubble.align ?? "left",
      wordWrap: { width: width - 38, useAdvancedWrap: true },
    }).setOrigin(0.5).setDepth(STORY_DEPTH + 8);
    const height = Math.max(74, label.height + 30);
    const panel = this.add.rectangle(x, y, width, height,
      bubble.kind === "caption" ? 0x17100c : 0xfff5d8,
      bubble.kind === "caption" ? 0.9 : 0.96)
      .setStrokeStyle(3, bubble.kind === "caption" ? 0xd6aa4a : 0x2b1b12)
      .setDepth(STORY_DEPTH + 7);
    return [panel, label];
  }

  private setButtonLabel(button: GameObjects.Container | undefined, label: string) {
    (button?.list.find((child) => child instanceof GameObjects.Text) as GameObjects.Text | undefined)?.setText(label);
  }

  private startBattle() {
    if (this.inputLocked) return;
    this.inputLocked = true;
    stopSceneMusic(this, "lobby-music");
    this.cameras.main.fadeOut(180, 0, 0, 0);
    const tutorial = this.battleStartData.levelId === "level_001";
    this.time.delayedCall(180, () => this.scene.start("SceneTransition", {
      target: tutorial ? "HowToPlay" : "Game",
      targetData: tutorial ? { battleStartData: this.battleStartData } : this.battleStartData,
      release: tutorial ? "story-for-tutorial" : "story-for-battle",
    }));
  }

  private releaseSceneReferences() {
    this.input.keyboard?.removeAllListeners();
    this.pageObjects = [];
    this.pages = [];
    this.backButton = undefined;
    this.nextButton = undefined;
    this.skipButton = undefined;
    this.pageCounter = undefined;
    this.inputLocked = true;
  }

  private publishQa() {
    if (new URLSearchParams(window.location.search).get("storyQa") !== "1") return;
    const result = {
      levelId: this.battleStartData.levelId,
      pageIndex: this.pageIndex,
      pageCount: this.pages.length,
      inputLocked: this.inputLocked,
      loadedTextures: this.pages.filter((page) => this.textures.exists(storyTextureKey(page.image))).length,
      maxFrameMs: Math.round(this.maxFrameMs * 10) / 10,
    };
    (window as typeof window & { __CASTLE_STORY_QA__?: typeof result }).__CASTLE_STORY_QA__ = result;
    document.documentElement.dataset.storyQa = JSON.stringify(result);
  }
}
