import fs from "fs";
const MAP_TS = "src/game/scenes/MapSelect.ts";
let content = fs.readFileSync(MAP_TS, "utf8");

content = content.replace('return "OK";', 'return t("map_badge_ok");');
content = content.replace('return "LOCK";', 'return t("map_badge_lock");');
content = content.replace('return "FINAL";', 'return t("map_badge_final");');
content = content.replace('return "NEXT TARGET";', 'return t("map_badge_next");');

fs.writeFileSync(MAP_TS, content, "utf8");
console.log("Updated stateBadgeText");
