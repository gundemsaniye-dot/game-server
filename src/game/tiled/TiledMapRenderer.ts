import type { Scene } from "phaser";
import type { TiledBattleMapDefinition, TiledMapRenderResult } from "./TiledTypes";
import { validateLoadedTiledMap } from "./TiledMapValidator";

export function renderTiledBattleMap(scene: Scene, definition: TiledBattleMapDefinition): TiledMapRenderResult {
  const tilemap = scene.make.tilemap({ key: definition.tilemapKey });
  const validationErrors = validateLoadedTiledMap(tilemap);
  if (validationErrors.length) throw new Error(`Tiled map '${definition.mapId}' invalid: ${validationErrors.join(", ")}`);
  const runtimeTilesets = definition.usesReferenceVisuals ? definition.tilesets.slice(1) : definition.tilesets;
  runtimeTilesets.forEach((source) => {
    const tileset = tilemap.addTilesetImage(source.tiledName, source.textureKey);
    if (!tileset) throw new Error(`Tiled tileset '${source.tiledName}' could not be resolved.`);
  });
  const layers: Phaser.GameObjects.GameObject[] = [];

  if (definition.usesReferenceVisuals && definition.referenceTextureKey) {
    layers.push(scene.add.image(0, 0, definition.referenceTextureKey).setOrigin(0).setDepth(0));
  }

  return {
    tilemap,
    layers,
    destroy: () => {
      layers.forEach((layer) => layer.destroy());
      tilemap.destroy();
    },
  };
}
