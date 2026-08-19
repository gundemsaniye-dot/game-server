import type { AxisAlignedBounds } from "./SideGeometry";

export const CASTLE_CONTACT_CLEARANCE = 10;
export const CASTLE_CONTACT_TOLERANCE = 1.5;

export const ONLINE_LEFT_CASTLE_FACADE_X = 195;
export const ONLINE_RIGHT_CASTLE_FACADE_X = 1085;

/**
 * Locked gameplay rule: every unit reaches the visual stone tower facade
 * (195 on left, 1085 on right) before attacking.
 */
export function castleContactX(
  castle: AxisAlignedBounds,
  side: "left" | "right",
) {
  void castle;
  return side === "left"
    ? ONLINE_LEFT_CASTLE_FACADE_X
    : ONLINE_RIGHT_CASTLE_FACADE_X;
}
