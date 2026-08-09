import { Scene } from "phaser";
import { castleLog, installGlobalErrorLogging } from "../utils/DevLog";
import { getAndroidPerfRequest } from "../performance/AndroidPerf";


export class Boot extends Scene {
  constructor() {
    super("Boot");
  }

  preload() {
    installGlobalErrorLogging();
    castleLog("BOOT", "preload start");

    if (!getAndroidPerfRequest().enabled) {
      this.load.setPath("assets");
      this.load.image("splash-background", "ui/splash/background.png");
      this.load.image("splash-animation-soldier", "ui/splash/animation-soldier.png");
      this.load.image("splash-tap-to-start-button", "ui/splash/tap-to-start-button.png");
    }

    this.load.on("filecomplete", (key: string, type: string) => {
      castleLog("BOOT_FILE", `${key} loaded type=${type}`);
    });

    this.load.on("loaderror", (file: Phaser.Loader.File) => {
      castleLog("BOOT_LOAD_ERROR", `${file.key} url=${file.url}`);
    });
  }

  create() {
    castleLog("BOOT", "preload complete -> Preloader");
    this.scene.start("Preloader");
  }
}
