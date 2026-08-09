const REQUIRED_TILE_LAYERS = [
  "00_GROUND_BASE", "01_GROUND_TERRAIN", "02_GROUND_TRANSITIONS",
  "03_HAZARD_VISUALS", "04_ROADS", "05_BRIDGES", "06_DETAILS_BELOW",
  "07_DETAILS_ABOVE", "NAV_BLOCKED", "NAV_COST",
];
const REQUIRED_OBJECT_LAYERS = ["OBJECTS_BELOW", "OBJECTS_SORTED"];
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
  const base = tilemap.getLayer("00_GROUND_BASE");
  if (base?.data.some((row) => row.some((tile) => !tile))) errors.push("00_GROUND_BASE has empty cells");
  // The static build validator checks GIDs. At runtime Phaser may expose a
  // global or local index depending on the tileset loader, so validate the
  // authored tile properties instead of relying on that implementation detail.
  errors.push(...validateNavigationMarkerLayer(tilemap, "05_BRIDGES", (tile) => tile.properties.navigationRole === "bridge"));
  errors.push(...validateNavigationMarkerLayer(tilemap, "NAV_BLOCKED", (tile) => tile.properties.navigationRole === "blocked"));
  errors.push(...validateNavigationMarkerLayer(tilemap, "NAV_COST", (tile) => typeof tile.properties.moveCost === "number"));
  return errors;
}
