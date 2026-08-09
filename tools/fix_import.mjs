import fs from "fs";
const GAME_TS = "src/game/scenes/Game.ts";
let gameContent = fs.readFileSync(GAME_TS, "utf8");

if (!gameContent.includes('import { generateRectTexture }')) {
  gameContent = gameContent.replace('import {', 'import { generateRectTexture } from "../assets/RuntimeAssets";\nimport {');
  fs.writeFileSync(GAME_TS, gameContent, "utf8");
}
