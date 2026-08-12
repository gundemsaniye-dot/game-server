import type { OnlineSide } from "./Protocol";

export interface AxisAlignedBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface SideGeometry {
  side: OnlineSide;
  direction: 1 | -1;
  deploy: AxisAlignedBounds;
  castle: AxisAlignedBounds;
  world: AxisAlignedBounds;
  outerCastleInset: number;
}

export interface ResolvedDeployment {
  x: number;
  y: number;
  source: "deploy" | "castle";
}

const inside = (bounds: AxisAlignedBounds, x: number, y: number) =>
  x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;

export function createSideGeometry(
  side: OnlineSide,
  deploy: AxisAlignedBounds,
  castle: AxisAlignedBounds,
  world: AxisAlignedBounds,
  outerCastleInset = side === "right" ? 35 : 0,
): SideGeometry {
  return {
    side,
    direction: side === "left" ? 1 : -1,
    deploy,
    castle,
    world,
    outerCastleInset: Math.max(0, outerCastleInset),
  };
}

export function deployHomeEdge(geometry: SideGeometry) {
  return geometry.side === "left" ? geometry.deploy.minX : geometry.deploy.maxX;
}

export function deployBattlefieldEdge(geometry: SideGeometry) {
  return geometry.side === "left" ? geometry.deploy.maxX : geometry.deploy.minX;
}

export function localToWorldX(geometry: SideGeometry, localX: number) {
  return deployHomeEdge(geometry) + geometry.direction * localX;
}

export function worldToLocalX(geometry: SideGeometry, worldX: number) {
  return geometry.direction * (worldX - deployHomeEdge(geometry));
}

export function formationWorldOffset(geometry: SideGeometry, localOffsetX: number) {
  return geometry.direction * localOffsetX;
}

export function deploymentGuideBounds(geometry: SideGeometry): AxisAlignedBounds {
  const castleMinX = Math.max(geometry.world.minX, geometry.castle.minX);
  const castleMaxX = Math.min(geometry.world.maxX, geometry.castle.maxX) -
    (geometry.side === "right" ? geometry.outerCastleInset : 0);
  return {
    minX: Math.min(geometry.deploy.minX, castleMinX),
    maxX: Math.max(geometry.deploy.maxX, castleMaxX),
    minY: geometry.deploy.minY,
    maxY: geometry.deploy.maxY,
  };
}

export function resolveDeploymentClick(
  geometry: SideGeometry,
  x: number,
  y: number,
): ResolvedDeployment | undefined {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  if (inside(geometry.deploy, x, y)) return { x, y, source: "deploy" };

  const guide = deploymentGuideBounds(geometry);
  const castleSlice: AxisAlignedBounds = {
    minX: Math.max(guide.minX, geometry.castle.minX),
    maxX: Math.min(guide.maxX, geometry.castle.maxX),
    minY: geometry.deploy.minY,
    maxY: geometry.deploy.maxY,
  };
  if (!inside(castleSlice, x, y)) return undefined;
  return { x: deployHomeEdge(geometry), y, source: "castle" };
}

export function isInsideBounds(bounds: AxisAlignedBounds, x: number, y: number) {
  return inside(bounds, x, y);
}
