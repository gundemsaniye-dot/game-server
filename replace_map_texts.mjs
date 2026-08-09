import fs from "fs";

const MAP_TS = "src/game/scenes/MapSelect.ts";
let content = fs.readFileSync(MAP_TS, "utf8");

// Add import t
if (!content.includes('import { t } from "../i18n/Localization";')) {
  content = content.replace('import { Scene } from "phaser";', 'import { Scene } from "phaser";\nimport { t } from "../i18n/Localization";');
}

const replacements = [
  ['"CAMPAIGN MAP"', 't("map_campaign_map")'],
  ['"DRAG / WHEEL TO SCOUT | PINCH TO ZOOM"', 't("map_drag_wheel_hint")'],
  ['`${completed}/${total} CLEARED`', 't("map_cleared", { completed, total })'],
  ['"‹  BACK"', 't("map_back")']
];

for (const [search, replace] of replacements) {
  content = content.split(search).join(replace);
}

fs.writeFileSync(MAP_TS, content, "utf8");
console.log("MapSelect.ts updated successfully!");
