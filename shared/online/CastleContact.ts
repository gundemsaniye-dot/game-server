import type { AxisAlignedBounds } from "./SideGeometry";

/**
 * PERMANENT CASTLE-CONTACT RULE — DO NOT REPLACE WITH STATIC COORDINATES:
 *
 * Every map authors its own fortress footprint with the playerCastle and
 * enemyCastle CastleAnchor rectangles in GAMEPLAY_ZONES. Their battlefield-
 * facing vertical edges are the only authoritative attack facades:
 *
 *   left/player castle  -> rectangle.maxX (x + width)
 *   right/enemy castle  -> rectangle.minX (x)
 *
 * This pure O(1) calculation is shared by offline navigation and the online
 * server. It runs when the map contract is loaded, never in the render loop.
 * anchorX is the visual stronghold/power anchor and MUST NOT be used for unit
 * contact. Rounding and global fallback numbers are also forbidden because
 * the authored facade is intentionally different on every TMJ map.
 */
export function castleContactX(
  castle: AxisAlignedBounds,
  side: "left" | "right",
) {
  const contactX = side === "left" ? castle.maxX : castle.minX;
  if (!Number.isFinite(contactX)) {
    throw new Error(`Invalid ${side} TMJ castle facade.`);
  }
  return contactX;
}
