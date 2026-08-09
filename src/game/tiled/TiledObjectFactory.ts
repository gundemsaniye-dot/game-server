import type { Scene } from "phaser";
import { createMapPropVisual } from "../systems/MapRenderer";
import type { MapVisualConfig } from "../types/MapTypes";

type TiledObjectProperties = Record<string, unknown>;

function objectProperties(source: Phaser.Types.Tilemaps.TiledObject) {
  const properties: TiledObjectProperties = {};
  for (const candidate of source.properties ?? []) {
    const property = candidate as { name?: string; value?: unknown };
    if (property.name) properties[property.name] = property.value;
  }
  return properties;
}

/** Creates optional static props from OBJECTS_* layers. Game-owned map props
 * remain authoritative while `renderLegacyObjects` is enabled. */
export function createTiledObjectLayer(scene: Scene, tilemap: Phaser.Tilemaps.Tilemap, layerName: "OBJECTS_BELOW" | "OBJECTS_SORTED") {
  const layer = tilemap.getObjectLayer(layerName);
  if (!layer) return [] as Phaser.GameObjects.GameObject[];
  return layer.objects.flatMap((source) => {
    const properties = objectProperties(source);
    const assetKey = typeof properties.assetKey === "string" ? properties.assetKey : undefined;
    if (!assetKey) return [];
    const depthMode = properties.depthMode === "aboveUnits" ? "aboveUnits" : properties.depthMode === "ground" ? "ground" : properties.depthMode === "fixed" ? "fixed" : "ySort";
    const scale = typeof properties.scale === "number" ? properties.scale : 1;
    const rotation = ((typeof properties.rotationOffset === "number" ? properties.rotationOffset : 0) + (source.rotation ?? 0)) * Math.PI / 180;
    const depthOffset = typeof properties.depthOffset === "number" ? properties.depthOffset : 0;
    const visual: MapVisualConfig = { source: "asset", assetKey };
    const object = createMapPropVisual(scene, {
      visual,
      x: source.x ?? 0,
      y: source.y ?? 0,
      scale,
      rotation,
      depth: depthMode === "aboveUnits" ? 590 + depthOffset : depthMode === "ground" ? 8 + depthOffset : depthMode === "fixed" ? depthOffset : (source.y ?? 0) + depthOffset,
    });
    return [object];
  });
}
