export type TiledMapMode = "legacy" | "tiled-hybrid";

export interface TiledTilesetDefinition {
  tiledName: string;
  textureKey: string;
  imageUrl: string;
}

export interface TiledBattleMapDefinition {
  mapId: string;
  tilemapKey: string;
  mapUrl: string;
  tilesets: TiledTilesetDefinition[];
  mode: TiledMapMode;
  renderLegacyTerrain: boolean;
  renderLegacyObjects: boolean;
  renderLegacyResources: boolean;
  useTiledNavigation: boolean;
  /** The map's visible ground is a cell-for-cell reference-art Tilemap. */
  usesReferenceVisuals: boolean;
  referenceTextureKey?: string;
  referenceImageUrl?: string;
}

export interface TiledMapRenderResult {
  tilemap: Phaser.Tilemaps.Tilemap;
  layers: Phaser.GameObjects.GameObject[];
  destroy: () => void;
}

export interface NavCell {
  walkable: boolean;
  terrainType: string;
  moveCost: number;
  blocksDeploy: boolean;
  damagePerSecond: number;
}

export type NavigationProfile = "SMALL" | "NORMAL" | "HEAVY";
