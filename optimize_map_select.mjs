import fs from "fs";

const MAP_TS = "src/game/scenes/MapSelect.ts";
let content = fs.readFileSync(MAP_TS, "utf8");

// 1. Optimize createCampaignPath
const createCampaignPathOld = `  private createCampaignPath() {
    const graphics = this.add.graphics().setDepth(PATH_DEPTH);
    const nodes = MAIN_CAMPAIGN.nodes;

    this.drawCampaignRoute(graphics, nodes, 30, 0x21140a, 0.48);
    this.drawCampaignRoute(graphics, nodes, 18, 0xb87629, 0.96);
    this.drawCampaignRoute(graphics, nodes, 10, 0xf4d07b, 1);
    this.drawCampaignRoute(graphics, nodes, 3, 0xfff6c7, 0.92);
  }`;

const createCampaignPathNew = `  private createCampaignPath() {
    if (!this.textures.exists("campaign_path")) {
      const tempG = this.make.graphics({ x: 0, y: 0, add: false });
      const nodes = MAIN_CAMPAIGN.nodes;
      this.drawCampaignRoute(tempG, nodes, 30, 0x21140a, 0.48);
      this.drawCampaignRoute(tempG, nodes, 18, 0xb87629, 0.96);
      this.drawCampaignRoute(tempG, nodes, 10, 0xf4d07b, 1);
      this.drawCampaignRoute(tempG, nodes, 3, 0xfff6c7, 0.92);
      tempG.generateTexture("campaign_path", MAIN_CAMPAIGN.worldWidth, MAIN_CAMPAIGN.worldHeight);
      tempG.destroy();
    }
    this.add.image(0, 0, "campaign_path").setOrigin(0, 0).setDepth(PATH_DEPTH);
  }`;

content = content.replace(createCampaignPathOld, createCampaignPathNew);

// 2. Add texture generation methods for pins
const createLevelPinsMatch = `  private createLevelPins() {`;
const ensurePinTexture = `
  private getPinTextureKey(isBoss: boolean, isLocked: boolean, state: string, biome: BiomeId) {
    return \`pin_\${isBoss ? "boss" : "normal"}_\${isLocked ? "locked" : state === "completed" ? "completed" : biome}\`;
  }

  private ensurePinTexture(isBoss: boolean, isLocked: boolean, state: string, biome: BiomeId, color: number) {
    const key = this.getPinTextureKey(isBoss, isLocked, state, biome);
    if (this.textures.exists(key)) return key;

    const g = this.make.graphics({ x: 0, y: 0, add: false });
    const radius = isBoss ? PIN_RADIUS + 5 : PIN_RADIUS;
    
    // Draw shadow
    g.fillStyle(0x06121a, 0.44);
    g.fillEllipse(50, 68, 58, 20);

    // Draw outer
    g.fillStyle(color, isLocked ? 0.76 : 0.96);
    g.lineStyle(isBoss ? 5 : 4, isLocked ? 0x2c3036 : 0x5f3515, 0.9);
    g.fillCircle(50, 50, radius);
    g.strokeCircle(50, 50, radius);

    // Draw middle
    g.fillStyle(0x22170d, 0.92);
    g.lineStyle(2, 0xfff2a5, isLocked ? 0.16 : 0.55);
    const midRadius = isBoss ? PIN_RADIUS - 3 : PIN_RADIUS - 7;
    g.fillCircle(50, 50, midRadius);
    g.strokeCircle(50, 50, midRadius);

    // Draw inner
    g.fillStyle(color, isLocked ? 0.55 : 1);
    const innerRadius = isBoss ? PIN_RADIUS - 10 : PIN_RADIUS - 13;
    g.fillCircle(50, 50, innerRadius);

    g.generateTexture(key, 100, 100);
    g.destroy();

    return key;
  }

  private createLevelPins() {`;
content = content.replace(createLevelPinsMatch, ensurePinTexture);

// 3. Optimize createLevelPin
const createLevelPinOld = `    const shadow = this.add.ellipse(0, 18, 58, 20, 0x06121a, 0.44);
    const outer = this.add.circle(0, 0, isBoss ? PIN_RADIUS + 5 : PIN_RADIUS, color, isLocked ? 0.76 : 0.96);
    const middle = this.add.circle(0, 0, isBoss ? PIN_RADIUS - 3 : PIN_RADIUS - 7, 0x22170d, 0.92);
    const inner = this.add.circle(0, 0, isBoss ? PIN_RADIUS - 10 : PIN_RADIUS - 13, color, isLocked ? 0.55 : 1);`;

const createLevelPinNew = `    const textureKey = this.ensurePinTexture(isBoss, isLocked, state, node.regionId, color);
    const pinImage = this.add.image(0, 0, textureKey);`;

content = content.replace(createLevelPinOld, createLevelPinNew);

const containerReplaceOld = `    outer.setStrokeStyle(isBoss ? 5 : 4, isLocked ? 0x2c3036 : 0x5f3515, 0.9);
    middle.setStrokeStyle(2, 0xfff2a5, isLocked ? 0.16 : 0.55);
    label.setAlpha(isLocked ? 0.78 : 1);

    const pin = this.add
      .container(node.x, node.y, [shadow, outer, middle, inner, number, stateBadge, label])`;

const containerReplaceNew = `    label.setAlpha(isLocked ? 0.78 : 1);

    const pin = this.add
      .container(node.x, node.y, [pinImage, number, stateBadge, label])`;

content = content.replace(containerReplaceOld, containerReplaceNew);

fs.writeFileSync(MAP_TS, content, "utf8");
console.log("MapSelect optimizations applied!");
