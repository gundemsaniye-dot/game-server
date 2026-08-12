import type { AxisAlignedBounds } from "./SideGeometry";

export const CASTLE_CONTACT_CLEARANCE = 10;
export const CASTLE_CONTACT_TOLERANCE = 1.5;

/**
 * Locked gameplay rule: every unit reaches the same TMJ CastleAnchor facade
 * before attacking. Unit weapon range must never move this contact line.
 */
export function castleContactX(
  castle: AxisAlignedBounds,
  side: "left" | "right",
) {
  return side === "left"
    ? castle.maxX + CASTLE_CONTACT_CLEARANCE
    : castle.minX - CASTLE_CONTACT_CLEARANCE;
}
