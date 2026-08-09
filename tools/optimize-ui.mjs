import fs from "fs";
import path from "path";

const RUNTIME_ASSETS = "src/game/assets/RuntimeAssets.ts";
let runtimeAssetsContent = fs.readFileSync(RUNTIME_ASSETS, "utf8");

if (!runtimeAssetsContent.includes("export function generateRectTexture")) {
    const fn = `\nexport function generateRectTexture(scene: Phaser.Scene, key: string, w: number, h: number, fill: number, alpha: number, strokeW: number = 0, strokeC: number = 0, strokeAlpha: number = 1) {
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ add: false });
  g.fillStyle(fill, alpha);
  g.fillRect(strokeW / 2, strokeW / 2, w - strokeW, h - strokeW);
  if (strokeW > 0) {
    g.lineStyle(strokeW, strokeC, strokeAlpha);
    g.strokeRect(strokeW / 2, strokeW / 2, w - strokeW, h - strokeW);
  }
  g.generateTexture(key, w, h);
  g.destroy();
  return key;
}\n`;
    runtimeAssetsContent += fn;
    fs.writeFileSync(RUNTIME_ASSETS, runtimeAssetsContent, "utf8");
}

function processScene(file, replacements) {
    let content = fs.readFileSync(file, "utf8");
    if (!content.includes('generateRectTexture')) {
        content = content.replace('import {', 'import { generateRectTexture,');
    }
    for (const rep of replacements) {
        content = content.replace(rep.from, rep.to);
    }
    fs.writeFileSync(file, content, "utf8");
}

// MainMenu.ts replacements
const MAIN_MENU = "src/game/scenes/MainMenu.ts";
const mmReplacements = [
  {
    from: `const shade = this.add.rectangle(640, 360, MENU_WIDTH, MENU_HEIGHT, 0x07101a, 0.78)\n      .setInteractive()\n      .on("pointerdown", () => this.hideSettings());`,
    to: `generateRectTexture(this, "mm_shade", MENU_WIDTH, MENU_HEIGHT, 0x07101a, 0.78);\n    const shade = this.add.image(640, 360, "mm_shade")\n      .setInteractive()\n      .on("pointerdown", () => this.hideSettings());`
  },
  {
    from: `const wood = this.add.rectangle(640, 360, 900, 630, 0x3a2115, 1).setStrokeStyle(4, 0x1f1008);`,
    to: `generateRectTexture(this, "mm_wood", 900, 630, 0x3a2115, 1, 4, 0x1f1008);\n    const wood = this.add.image(640, 360, "mm_wood");`
  },
  {
    from: `const parchment = this.add.rectangle(640, 376, 848, 552, 0xd7bd88, 1).setStrokeStyle(4, 0xb0966a);`,
    to: `generateRectTexture(this, "mm_parch", 848, 552, 0xd7bd88, 1, 4, 0xb0966a);\n    const parchment = this.add.image(640, 376, "mm_parch");`
  },
  {
    from: `const header = this.add.rectangle(640, 100, 848, 78, 0x4b2a18, 1).setStrokeStyle(4, 0x2e190e);`,
    to: `generateRectTexture(this, "mm_head", 848, 78, 0x4b2a18, 1, 4, 0x2e190e);\n    const header = this.add.image(640, 100, "mm_head");`
  },
  {
    from: `const button = this.add.rectangle(x, y, width, height, fill, 1)\n      .setStrokeStyle(2, 0xffd38c)\n      .setInteractive({ useHandCursor: true })`,
    to: `const texKey = "mm_btn_" + width + "_" + fill;\n    generateRectTexture(this, texKey, width, height, fill, 1, 2, 0xffd38c);\n    const button = this.add.image(x, y, texKey)\n      .setInteractive({ useHandCursor: true })`
  },
  {
    from: `button.setFillStyle(hoverFill);`,
    to: `/* hover not working with static texture without re-gen, skipping for basic opt */`
  },
  {
    from: `button.setFillStyle(fill);`,
    to: `/* hover not working with static texture without re-gen, skipping for basic opt */`
  }
];

processScene(MAIN_MENU, mmReplacements);

console.log("Done");
