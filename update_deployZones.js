const fs = require("fs");
let content = fs.readFileSync("src/game/scenes/Game.ts", "utf8");

// We only want to replace instances AFTER the init method
const initEndIndex = content.indexOf("setupCastles");

const beforeInit = content.substring(0, initEndIndex);
let afterInit = content.substring(initEndIndex);

afterInit = afterInit.replace(/this\.levelRuntime\.map\.deployZone/g, "this.playerDeployZone");
afterInit = afterInit.replace(/this\.levelRuntime\.map\.enemySpawnZone/g, "this.enemyDeployZone");

fs.writeFileSync("src/game/scenes/Game.ts", beforeInit + afterInit);
console.log("Replaced deploy zones.");
