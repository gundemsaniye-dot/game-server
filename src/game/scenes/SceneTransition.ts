import { Scene } from "phaser";
import {
  releaseBattleRuntimeMemory,
  releaseCampaignTexture,
  releaseLobbyRuntimeMemory,
  releaseMainMenuTextures,
  releaseSplashTextures,
} from "../assets/RuntimeAssets";
import type { BattleStartData } from "../systems/LevelRuntime";

type TransitionTarget = "MainMenu" | "MapSelect" | "Game";
type TransitionRelease = "menu" | "campaign" | "campaign-for-battle" | "battle";

export interface SceneTransitionData {
  target: TransitionTarget;
  targetData?: object;
  release: TransitionRelease;
}

/**
 * A texture-free hand-off scene for Android/WebView.
 *
 * Phaser starts a target scene's preload before its create method. Cleaning up
 * in the target's create method therefore briefly keeps the previous full-screen
 * scene and the next scene's assets resident together. This scene is entered
 * after the source is shut down, releases its assets, then starts the target.
 */
export class SceneTransition extends Scene {
  private transition: SceneTransitionData = {
    target: "MainMenu",
    release: "battle",
  };

  constructor() {
    super("SceneTransition");
  }

  init(data: SceneTransitionData) {
    this.transition = data;
  }

  create() {
    this.cameras.main.setBackgroundColor(0x071525);
    this.add.rectangle(640, 360, 1280, 720, 0x071525, 1);

    if (this.transition.release === "menu") {
      releaseSplashTextures(this);
      releaseMainMenuTextures(this);
    } else if (
      this.transition.release === "campaign" ||
      this.transition.release === "campaign-for-battle"
    ) {
      releaseCampaignTexture(this);
      if (this.transition.release === "campaign-for-battle") {
        releaseLobbyRuntimeMemory(this);
      }
    } else {
      releaseBattleRuntimeMemory(this);
    }

    // Allow one clean frame for WebView/GL to retire deleted textures before
    // the target scene begins uploading its own atlases.
    this.time.delayedCall(34, () => {
      this.scene.start(this.transition.target, this.transition.targetData);
    });
  }
}
