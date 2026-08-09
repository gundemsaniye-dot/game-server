import type { Scene } from "phaser";
import { getTiledBattleMapDefinition } from "./TiledMapRegistry";

const DEV_TILED_ASSET_VERSION = import.meta.env.DEV ? String(Date.now()) : "";

function versionedAssetUrl(url: string) {
  if (!DEV_TILED_ASSET_VERSION) return url;
  return `${url}${url.includes("?") ? "&" : "?"}tiled=${DEV_TILED_ASSET_VERSION}`;
}

export function preloadTiledBattleMap(scene: Scene, mapId: string) {
  const definition = getTiledBattleMapDefinition(mapId);
  if (!definition) return undefined;

  if (!scene.cache.tilemap.exists(definition.tilemapKey)) {
    scene.load.tilemapTiledJSON(definition.tilemapKey, versionedAssetUrl(definition.mapUrl));
  }
  const runtimeTilesets = definition.usesReferenceVisuals ? definition.tilesets.slice(1) : definition.tilesets;
  runtimeTilesets.forEach((tileset) => {
    if (!scene.textures.exists(tileset.textureKey)) {
      scene.load.image(tileset.textureKey, versionedAssetUrl(tileset.imageUrl));
    }
  });
  if (definition.referenceTextureKey && definition.referenceImageUrl && !scene.textures.exists(definition.referenceTextureKey)) {
    scene.load.image(definition.referenceTextureKey, versionedAssetUrl(definition.referenceImageUrl));
  }
  return definition;
}
