import fs from "fs";

// Fix MainMenu hover
const MAIN_MENU = "src/game/scenes/MainMenu.ts";
let mmContent = fs.readFileSync(MAIN_MENU, "utf8");

// We commented out setFillStyle. Let's find it.
mmContent = mmContent.replace(
  `/* hover not working with static texture without re-gen, skipping for basic opt */`,
  `generateRectTexture(this, texKey + "_hover", width, height, hoverFill, 1, 2, 0xffeebb);\n      button.setTexture(texKey + "_hover");`
);
mmContent = mmContent.replace(
  `/* hover not working with static texture without re-gen, skipping for basic opt */`,
  `button.setTexture(texKey);`
);

fs.writeFileSync(MAIN_MENU, mmContent, "utf8");

// GameOver.ts
const GAME_OVER = "src/game/scenes/GameOver.ts";
let goContent = fs.readFileSync(GAME_OVER, "utf8");
if (!goContent.includes("generateRectTexture")) {
    goContent = goContent.replace('import {', 'import { generateRectTexture, queueLobbyAudio } from "../assets/RuntimeAssets";\nimport {');
    
    goContent = goContent.replace(
      `this.add.rectangle(640, 360, 1280, 720, 0x0b1018, 1);`,
      `generateRectTexture(this, "go_bg", 1280, 720, 0x0b1018, 1);\n    this.add.image(640, 360, "go_bg");`
    );
    goContent = goContent.replace(
      `this.add.rectangle(640, 360, 760, 360, 0x26384a, 0.42).setStrokeStyle(4, 0xf8d86a, 0.45);`,
      `generateRectTexture(this, "go_panel", 760, 360, 0x26384a, 0.42, 4, 0xf8d86a, 0.45);\n    this.add.image(640, 360, "go_panel");`
    );
    goContent = goContent.replace(
      `this.add.rectangle(640, 424, 520, 104, 0x5a421d, 0.96).setStrokeStyle(3, 0xffd45f);`,
      `generateRectTexture(this, "go_btn", 520, 104, 0x5a421d, 0.96, 3, 0xffd45f);\n      this.add.image(640, 424, "go_btn");`
    );
    fs.writeFileSync(GAME_OVER, goContent, "utf8");
}

// ArmyLoadout.ts
const LOADOUT = "src/game/scenes/ArmyLoadout.ts";
let loadoutContent = fs.readFileSync(LOADOUT, "utf8");
if (!loadoutContent.includes("generateRectTexture")) {
    loadoutContent = loadoutContent.replace('import {', 'import { generateRectTexture } from "../assets/RuntimeAssets";\nimport {');

    loadoutContent = loadoutContent.replace(
      `this.add.rectangle(640, 360, 1280, 720, 0x0d141d);`,
      `generateRectTexture(this, "al_bg", 1280, 720, 0x0d141d, 1);\n    this.add.image(640, 360, "al_bg");`
    );
    loadoutContent = loadoutContent.replace(
      `this.add.rectangle(640, 360, 1160, 660, 0x26384a, 0.76).setStrokeStyle(4, 0xf8d86a, 0.45);`,
      `generateRectTexture(this, "al_panel", 1160, 660, 0x26384a, 0.76, 4, 0xf8d86a, 0.45);\n    this.add.image(640, 360, "al_panel");`
    );
    loadoutContent = loadoutContent.replace(
      `const panel = this.track(this.add.rectangle(x, y, CARD_WIDTH, CARD_HEIGHT, fill, 0.98).setStrokeStyle(4, 0xd0aa55, 0.98));`,
      `generateRectTexture(this, "al_card_" + fill, CARD_WIDTH, CARD_HEIGHT, fill, 0.98, 4, 0xd0aa55, 0.98);\n    const panel = this.track(this.add.image(x, y, "al_card_" + fill));`
    );
    loadoutContent = loadoutContent.replace(
      `this.track(this.add.rectangle(x, y + 3, CARD_WIDTH - 8, 48, 0x05080b, 0.82));`,
      `generateRectTexture(this, "al_card_inner", CARD_WIDTH - 8, 48, 0x05080b, 0.82);\n      this.track(this.add.image(x, y + 3, "al_card_inner"));`
    );
    loadoutContent = loadoutContent.replace(
      `const panel = this.add.rectangle(x, y, width, 54, 0x70451f, 1).setStrokeStyle(4, 0xffeebb);`,
      `generateRectTexture(this, "al_btn_" + width, width, 54, 0x70451f, 1, 4, 0xffeebb);\n    const panel = this.add.image(x, y, "al_btn_" + width);`
    );
    loadoutContent = loadoutContent.replace(
      `panel.setFillStyle(0x9a5823)`,
      `generateRectTexture(this, "al_btn_hover_" + width, width, 54, 0x9a5823, 1, 4, 0xffeebb);\n      panel.setTexture("al_btn_hover_" + width)`
    );
    loadoutContent = loadoutContent.replace(
      `panel.setFillStyle(0x70451f)`,
      `panel.setTexture("al_btn_" + width)`
    );

    fs.writeFileSync(LOADOUT, loadoutContent, "utf8");
}
console.log("Done phase 2");
