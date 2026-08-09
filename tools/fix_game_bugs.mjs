import fs from "fs";

// 1. Fix AndroidPerf skipBriefing
const ANDROID_PERF = "src/game/performance/AndroidPerf.ts";
let perfContent = fs.readFileSync(ANDROID_PERF, "utf8");
perfContent = perfContent.replace('skipBriefing: params.get("skipBriefing") !== "0",', 'skipBriefing: params.get("skipBriefing") === "1",');
fs.writeFileSync(ANDROID_PERF, perfContent, "utf8");

// 2. Fix Tree Scale and Story Overlay in Game.ts
const GAME_TS = "src/game/scenes/Game.ts";
let gameContent = fs.readFileSync(GAME_TS, "utf8");

// Tree Scale Fix
gameContent = gameContent.replace(
  `if (config.type !== "wood") return config;`,
  `if (config.type !== "wood") return config;\n    config.scale = (config.scale || 1) * 0.6; // Scale down wood trees`
);

// Story Overlay Optimization
gameContent = gameContent.replace(
  `const shade = this.add.rectangle(640, 360, 1280, 720, 0x07101a, 0.88)`,
  `generateRectTexture(this, "story_shade", 1280, 720, 0x07101a, 0.88);\n    const shade = this.add.image(640, 360, "story_shade")`
);
gameContent = gameContent.replace(
  `const panel = this.add.rectangle(640, 360, 920, 570, 0x24364a, 0.98)\n      .setStrokeStyle(5, 0xf0c85b)`,
  `generateRectTexture(this, "story_panel", 920, 570, 0x24364a, 0.98, 5, 0xf0c85b);\n    const panel = this.add.image(640, 360, "story_panel")`
);

// Change "Start Battle" to "Close"
gameContent = gameContent.replace(
  `const startBack = this.add.rectangle(640, 618, 330, 66, 0xa42820)\n      .setStrokeStyle(5, 0xffd45f)`,
  `generateRectTexture(this, "story_btn", 330, 66, 0xa42820, 1, 5, 0xffd45f);\n    const startBack = this.add.image(640, 618, "story_btn")`
);
gameContent = gameContent.replace(
  `const startText = this.add.text(640, 617, t("game_start_battle"), {`,
  `const startText = this.add.text(640, 617, t("game_close"), {`
);

// Fix Pause Menu buttons optimization
gameContent = gameContent.replace(
  `const menuBack = this.add.rectangle(485, 618, 300, 66, 0x5a351d)\n      .setStrokeStyle(5, 0xffd45f)`,
  `generateRectTexture(this, "pause_menu_btn", 300, 66, 0x5a351d, 1, 5, 0xffd45f);\n    const menuBack = this.add.image(485, 618, "pause_menu_btn")`
);
gameContent = gameContent.replace(
  `const closeBack = this.add.rectangle(795, 618, 260, 66, 0xa42820)\n      .setStrokeStyle(5, 0xffd45f)`,
  `generateRectTexture(this, "pause_close_btn", 260, 66, 0xa42820, 1, 5, 0xffd45f);\n    const closeBack = this.add.image(795, 618, "pause_close_btn")`
);

// Ensure generateRectTexture is imported
if (!gameContent.includes('generateRectTexture')) {
  gameContent = gameContent.replace('import {', 'import { generateRectTexture } from "../assets/RuntimeAssets";\nimport {');
}

fs.writeFileSync(GAME_TS, gameContent, "utf8");
console.log("Done");
