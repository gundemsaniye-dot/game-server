const REQUIRED_TILE_LAYERS = ["05_BRIDGES", "NAV_BLOCKED"];
const REQUIRED_OBJECT_LAYERS = ["GAMEPLAY_ZONES"];
const hasTile = (tile: Phaser.Tilemaps.Tile | null | undefined) => Boolean(tile && tile.index >= 0);

function validateNavigationMarkerLayer(tilemap: Phaser.Tilemaps.Tilemap, layerName: string, isValid: (tile: Phaser.Tilemaps.Tile) => boolean) {
  const layer = tilemap.getLayer(layerName);
  if (!layer) return [`missing ${layerName}`];
  const errors: string[] = [];
  layer.data.forEach((row, rowIndex) => row.forEach((tile, columnIndex) => {
    if (hasTile(tile) && !isValid(tile)) {
      errors.push(`${layerName} has an invalid navigation marker at ${columnIndex},${rowIndex}`);
    }
  }));
  return errors;
}

/** Fast runtime guard for accidentally exporting an incompatible TMJ file. */
export function validateLoadedTiledMap(tilemap: Phaser.Tilemaps.Tilemap) {
  const errors: string[] = [];
  if (tilemap.width !== 32 || tilemap.height !== 18 || tilemap.tileWidth !== 40 || tilemap.tileHeight !== 40) {
    errors.push("expected fixed 32x18 map with 40px tiles");
  }
  REQUIRED_TILE_LAYERS.forEach((name) => {
    if (!tilemap.getLayer(name)) errors.push(`missing layer ${name}`);
  });
  REQUIRED_OBJECT_LAYERS.forEach((name) => {
    if (!tilemap.getObjectLayer(name)) errors.push(`missing object layer ${name}`);
  });
  // The static build validator checks GIDs. At runtime Phaser may expose a
  // global or local index depending on the tileset loader, so validate the
  // authored tile properties instead of relying on that implementation detail.
  errors.push(...validateNavigationMarkerLayer(tilemap, "05_BRIDGES", (tile) => tile.properties.navigationRole === "bridge"));
  errors.push(...validateNavigationMarkerLayer(tilemap, "NAV_BLOCKED", (tile) => tile.properties.navigationRole === "blocked"));
  return errors;
}
