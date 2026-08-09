import type { Scene } from "phaser";
import type { TiledBattleMapDefinition, TiledMapRenderResult } from "./TiledTypes";
import { validateLoadedTiledMap } from "./TiledMapValidator";

const LAYER_DEPTHS: Record<string, number> = {
  "00_GROUND_BASE": 0,
  "01_GROUND_TERRAIN": 1,
  "02_GROUND_TRANSITIONS": 2,
  "03_HAZARD_VISUALS": 3,
  "04_ROADS": 4,
  "05_BRIDGES": 5,
  "06_DETAILS_BELOW": 6,
  "07_DETAILS_ABOVE": 590,
};

const RENDER_LAYERS = Object.keys(LAYER_DEPTHS);

export function renderTiledBattleMap(scene: Scene, definition: TiledBattleMapDefinition): TiledMapRenderResult {
  const tilemap = scene.make.tilemap({ key: definition.tilemapKey });
  const validationErrors = validateLoadedTiledMap(tilemap);
  if (validationErrors.length) throw new Error(`Tiled map '${definition.mapId}' invalid: ${validationErrors.join(", ")}`);
  const runtimeTilesets = definition.usesReferenceVisuals ? definition.tilesets.slice(1) : definition.tilesets;
  const tilesets = runtimeTilesets.map((source) => {
    const tileset = tilemap.addTilesetImage(source.tiledName, source.textureKey);
    if (!tileset) throw new Error(`Tiled tileset '${source.tiledName}' could not be resolved.`);
    return tileset;
  });
  const layers: Phaser.GameObjects.GameObject[] = [];

  if (definition.usesReferenceVisuals && definition.referenceTextureKey) {
    layers.push(scene.add.image(0, 0, definition.referenceTextureKey).setOrigin(0).setDepth(0));
  }

  const visibleLayers = definition.usesReferenceVisuals ? [] : RENDER_LAYERS;
  visibleLayers.forEach((name) => {
    if (!tilemap.getLayer(name)) return;
    const layer = tilemap.createLayer(name, tilesets);
    if (layer) {
      layer.setDepth(LAYER_DEPTHS[name]);
      // The source TMJ hides this implementation atlas so Tiled can display
      // the single-piece reference preview. Phaser still needs it visible.
      if (definition.usesReferenceVisuals && name === "00_GROUND_BASE") layer.setVisible(true);
      layers.push(layer);
    }
  });

  return {
    tilemap,
    layers,
    destroy: () => {
      layers.forEach((layer) => layer.destroy());
      tilemap.destroy();
    },
  };
}
