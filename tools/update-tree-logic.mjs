import fs from "fs";

const GAME_TS = "src/game/scenes/Game.ts";
let content = fs.readFileSync(GAME_TS, "utf8");

// 1. Move canPlaceTreeAt out
const oldResolve = `  private resolveTreeResourcePlacement(config: ResourceNodeConfig): ResourceNodeConfig {
    if (config.type !== "tree" || !this.tiledNavigation) return config;

    const canPlaceTreeAt = (x: number, y: number) => {
      const first = this.tiledNavigation!.worldToCell(x - TREE_NAV_CLEARANCE, y - TREE_NAV_CLEARANCE);
      const last = this.tiledNavigation!.worldToCell(x + TREE_NAV_CLEARANCE, y + TREE_NAV_CLEARANCE);
      for (let row = first.row; row <= last.row; row += 1) {
        for (let column = first.column; column <= last.column; column += 1) {
          if (this.tiledNavigation!.cellAt(column, row)?.blocksDeploy) return false;
        }
      }
      return true;
    };`;

const newResolve = `  private canPlaceTreeAt(x: number, y: number) {
    if (!this.tiledNavigation) return true;
    const first = this.tiledNavigation.worldToCell(x - TREE_NAV_CLEARANCE, y - TREE_NAV_CLEARANCE);
    const last = this.tiledNavigation.worldToCell(x + TREE_NAV_CLEARANCE, y + TREE_NAV_CLEARANCE);
    for (let row = first.row; row <= last.row; row += 1) {
      for (let column = first.column; column <= last.column; column += 1) {
        if (this.tiledNavigation.cellAt(column, row)?.blocksDeploy) return false;
      }
    }
    return true;
  }

  private resolveTreeResourcePlacement(config: ResourceNodeConfig): ResourceNodeConfig {
    if (config.type !== "tree" || !this.tiledNavigation) return config;
    
    // Scale down trees globally
    config.scale = (config.scale || 1) * 0.6;`;

content = content.replace(oldResolve, newResolve);
content = content.replace(/canPlaceTreeAt\(/g, "this.canPlaceTreeAt(");

// 2. Update respawnResource
const oldRespawn = `  private respawnResource(node: ResourceNode) {
    node.amount = node.maxAmount;
    node.respawnAt = undefined;
    node.reservedBy = [];
    node.container.setPosition(
      node.x + randomInt(-18, 18),
      node.y + randomInt(-12, 12),
    );`;

const newRespawn = `  private respawnResource(node: ResourceNode) {
    node.amount = node.maxAmount;
    node.respawnAt = undefined;
    node.reservedBy = [];

    // Find new location
    let newX = node.x;
    let newY = node.y;
    for (let i = 0; i < 20; i++) {
      const testX = randomInt(TREE_NAV_CLEARANCE, 1280 - TREE_NAV_CLEARANCE);
      const testY = randomInt(TREE_NAV_CLEARANCE, 720 - TREE_NAV_CLEARANCE);
      if (this.canPlaceTreeAt(testX, testY)) {
        newX = testX;
        newY = testY;
        break;
      }
    }
    node.x = newX;
    node.y = newY;

    node.container.setPosition(node.x, node.y);`;

content = content.replace(oldRespawn, newRespawn);

fs.writeFileSync(GAME_TS, content, "utf8");
console.log("Updated tree logic");
