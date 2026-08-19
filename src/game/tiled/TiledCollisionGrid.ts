import type { NavCell, NavigationProfile } from "./TiledTypes";
import { castleContactX } from "../../../shared/online/CastleContact";

export const TILED_NAV_CELL_SIZE = 20;
export const TILED_NAV_COLUMNS = 64;
export const TILED_NAV_ROWS = 36;

const groundCell = (): NavCell => ({
  walkable: true,
  terrainType: "ground",
  moveCost: 1,
  blocksDeploy: false,
  damagePerSecond: 0,
});

/** Phaser creates Tile objects for empty layer cells too; only an index >= 0
 * represents an authored navigation tile. */
const hasTile = (tile: Phaser.Tilemaps.Tile | null | undefined) => Boolean(tile && tile.index >= 0);
const hasNavigationRole = (tile: Phaser.Tilemaps.Tile | null | undefined, role: "bridge" | "blocked") => {
  if (!hasTile(tile)) return false;
  if (tile?.properties?.navigationRole === role) return true;
  if (role === "bridge" && (tile?.index === 577 || tile?.tileset?.name === "navigation-bridge")) return true;
  if (role === "blocked" && (tile?.index === 578 || tile?.tileset?.name === "navigation-blocked")) return true;
  return false;
};
const objectProperty = (object: Phaser.Types.Tilemaps.TiledObject, name: string) =>
  object.properties?.find((property: { name?: string; value?: unknown }) => property.name === name)?.value;

/** A high-performance 20px grid built from the Tiled navigation layers and fortress objects. */
export class TiledCollisionGrid {
  private readonly cells = Array.from({ length: TILED_NAV_ROWS }, () =>
    Array.from({ length: TILED_NAV_COLUMNS }, groundCell),
  );

  public playerCastleFrontX?: number;
  public enemyCastleFrontX?: number;

  constructor(tilemap: Phaser.Tilemaps.Tilemap) {
    const blocked = tilemap.getLayer("NAV_BLOCKED");
    const bridges = tilemap.getLayer("05_BRIDGES");
    for (let tileY = 0; tileY < 18; tileY += 1) {
      for (let tileX = 0; tileX < 32; tileX += 1) {
        const blockedTile = blocked?.data[tileY]?.[tileX] ?? null;
        const bridgeTile = bridges?.data[tileY]?.[tileX] ?? null;
        
        const isBridge = hasNavigationRole(bridgeTile, "bridge") || (hasTile(bridgeTile) && bridgeTile!.index > 0);
        const isBlocked = !isBridge && (hasNavigationRole(blockedTile, "blocked") || (hasTile(blockedTile) && blockedTile!.index > 0));
        const properties = (isBridge ? bridgeTile?.properties : blockedTile?.properties ?? {}) as Record<string, unknown>;
        const nav = {
          walkable: isBridge ? true : properties.walkable !== false && !isBlocked,
          terrainType: isBridge
            ? "bridge"
            : typeof properties.terrainType === "string" ? properties.terrainType : isBlocked ? "solid" : "ground",
          moveCost: isBridge ? 0.9 : typeof properties.moveCost === "number" ? properties.moveCost : 1,
          // Bridge decks stay walkable for troops but are reserved corridors:
          // units, resources and scenery cannot be deployed on them.
          blocksDeploy: isBridge || properties.blocksDeploy === true || (isBlocked && !isBridge),
          damagePerSecond: typeof properties.damagePerSecond === "number" ? properties.damagePerSecond : 0,
        };
        for (let offsetY = 0; offsetY < 2; offsetY += 1) {
          for (let offsetX = 0; offsetX < 2; offsetX += 1) {
            this.cells[tileY * 2 + offsetY][tileX * 2 + offsetX] = { ...nav };
          }
        }
      }
    }
    this.applyFortressObjectBlockers(tilemap);
  }

  private applyFortressObjectBlockers(tilemap: Phaser.Tilemaps.Tilemap) {
    const layer = tilemap.getObjectLayer("GAMEPLAY_ZONES");
    for (const object of layer?.objects ?? []) {
      const type = object.type || (object as Phaser.Types.Tilemaps.TiledObject & { class?: string }).class || "";
      if (type !== "CastleAnchor") continue;
      if (objectProperty(object, "blocksNavigation") !== true) continue;
      if (
        typeof object.x !== "number" ||
        typeof object.y !== "number" ||
        typeof object.width !== "number" ||
        typeof object.height !== "number" ||
        object.width <= 0 ||
        object.height <= 0
      ) continue;

      const team = objectProperty(object, "team");
      const first = this.worldToCell(object.x, object.y);
      const last = this.worldToCell(object.x + object.width - 0.001, object.y + object.height - 0.001);
      const castleBounds = {
        minX: object.x,
        maxX: object.x + object.width,
        minY: object.y,
        maxY: object.y + object.height,
      };

      if (team === "player") {
        // TMJ owns this facade. See CastleContact.ts before changing it.
        const wallX = castleContactX(castleBounds, "left");
        this.playerCastleFrontX = wallX;
        for (let row = first.row; row <= last.row; row += 1) {
          for (let column = first.column; column <= last.column; column += 1) {
            this.cells[row][column] = {
              walkable: false,
              terrainType: "solid",
              moveCost: 999,
              blocksDeploy: true,
              damagePerSecond: 0,
            };
          }
        }
      } else if (team === "enemy") {
        // TMJ owns this facade. See CastleContact.ts before changing it.
        const wallX = castleContactX(castleBounds, "right");
        this.enemyCastleFrontX = wallX;
        for (let row = first.row; row <= last.row; row += 1) {
          for (let column = first.column; column <= last.column; column += 1) {
            this.cells[row][column] = {
              walkable: false,
              terrainType: "solid",
              moveCost: 999,
              blocksDeploy: true,
              damagePerSecond: 0,
            };
          }
        }
      }
    }
  }

  cellAtWorld(x: number, y: number) {
    const column = Math.max(0, Math.min(TILED_NAV_COLUMNS - 1, Math.floor(x / TILED_NAV_CELL_SIZE)));
    const row = Math.max(0, Math.min(TILED_NAV_ROWS - 1, Math.floor(y / TILED_NAV_CELL_SIZE)));
    return this.cells[row][column];
  }

  worldToCell(x: number, y: number) {
    return {
      column: Math.max(0, Math.min(TILED_NAV_COLUMNS - 1, Math.floor(x / TILED_NAV_CELL_SIZE))),
      row: Math.max(0, Math.min(TILED_NAV_ROWS - 1, Math.floor(y / TILED_NAV_CELL_SIZE))),
    };
  }

  cellAt(column: number, row: number) {
    return this.cells[row]?.[column];
  }

  isBridgeAtWorld(x: number, y: number): boolean {
    const cell = this.cellAtWorld(x, y);
    return cell.walkable && cell.terrainType === "bridge";
  }

  isWalkableFor(column: number, row: number, profile: NavigationProfile) {
    if (column < 0 || row < 0 || column >= TILED_NAV_COLUMNS || row >= TILED_NAV_ROWS) return false;
    const center = this.cellCenter(column, row);
    return this.isWorldWalkableFor(center.x, center.y, profile);
  }

  nearestWalkableCell(column: number, row: number, profile: NavigationProfile, maxRadius = 10) {
    for (let radius = 0; radius <= maxRadius; radius += 1) {
      const candidates: Array<{ column: number; row: number; distance: number }> = [];
      for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
        for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
          if (Math.max(Math.abs(offsetX), Math.abs(offsetY)) !== radius) continue;
          const candidateColumn = column + offsetX;
          const candidateRow = row + offsetY;
          if (
            candidateColumn < 0 || candidateRow < 0 ||
            candidateColumn >= TILED_NAV_COLUMNS || candidateRow >= TILED_NAV_ROWS ||
            !this.isWalkableFor(candidateColumn, candidateRow, profile)
          ) continue;
          candidates.push({
            column: candidateColumn,
            row: candidateRow,
            distance: offsetX ** 2 + offsetY ** 2,
          });
        }
      }
      candidates.sort((first, second) => first.distance - second.distance);
      if (candidates[0]) return candidates[0];
    }
    return undefined;
  }

  nearestWalkableWorld(x: number, y: number, profile: NavigationProfile, maxRadius = 10) {
    const origin = this.worldToCell(x, y);
    const cell = this.nearestWalkableCell(origin.column, origin.row, profile, maxRadius);
    return cell ? this.cellCenter(cell.column, cell.row) : undefined;
  }

  cellCenter(column: number, row: number) {
    return { x: column * TILED_NAV_CELL_SIZE + TILED_NAV_CELL_SIZE / 2, y: row * TILED_NAV_CELL_SIZE + TILED_NAV_CELL_SIZE / 2 };
  }

  isBlocked(x: number, y: number) {
    return !this.cellAtWorld(x, y).walkable;
  }

  /**
   * Calculates continuous obstacle repulsion to push units smoothly away
   * from NAV_BLOCKED cells and world boundaries, preventing snagging or getting stuck.
   */
  getObstacleRepulsion(x: number, y: number, radius: number): { x: number; y: number; force: number } {
    const cell = this.worldToCell(x, y);
    let pushX = 0;
    let pushY = 0;
    let count = 0;

    // Check 3x3 surrounding cells
    for (let r = Math.max(0, cell.row - 2); r <= Math.min(TILED_NAV_ROWS - 1, cell.row + 2); r += 1) {
      for (let c = Math.max(0, cell.column - 2); c <= Math.min(TILED_NAV_COLUMNS - 1, cell.column + 2); c += 1) {
        if (this.cells[r][c].walkable) continue;

        const cellMinX = c * TILED_NAV_CELL_SIZE;
        const cellMaxX = cellMinX + TILED_NAV_CELL_SIZE;
        const cellMinY = r * TILED_NAV_CELL_SIZE;
        const cellMaxY = cellMinY + TILED_NAV_CELL_SIZE;

        // Closest point on the blocked cell's rectangle to (x, y)
        const closestX = Math.max(cellMinX, Math.min(cellMaxX, x));
        const closestY = Math.max(cellMinY, Math.min(cellMaxY, y));

        const dx = x - closestX;
        const dy = y - closestY;
        const distSq = dx * dx + dy * dy;

        if (distSq < radius * radius) {
          const dist = Math.sqrt(distSq);
          const overlap = radius - dist;
          if (dist > 0.001) {
            pushX += (dx / dist) * overlap;
            pushY += (dy / dist) * overlap;
          } else {
            // Unit center is inside the blocked cell; push away from cell center
            const center = this.cellCenter(c, r);
            const cdx = x - center.x;
            const cdy = y - center.y;
            const cdist = Math.sqrt(cdx * cdx + cdy * cdy) || 1;
            pushX += (cdx / cdist) * (radius + 2);
            pushY += (cdy / cdist) * (radius + 2);
          }
          count += 1;
        }
      }
    }

    // World edge boundaries push inward
    if (x < radius + 10) pushX += (radius + 10 - x);
    if (x > TILED_NAV_COLUMNS * TILED_NAV_CELL_SIZE - radius - 10) pushX -= (x - (TILED_NAV_COLUMNS * TILED_NAV_CELL_SIZE - radius - 10));
    if (y < radius + 10) pushY += (radius + 10 - y);
    if (y > TILED_NAV_ROWS * TILED_NAV_CELL_SIZE - radius - 10) pushY -= (y - (TILED_NAV_ROWS * TILED_NAV_CELL_SIZE - radius - 10));

    const force = Math.sqrt(pushX * pushX + pushY * pushY);
    if (force > 0.001) {
      return { x: pushX / force, y: pushY / force, force };
    }
    return { x: 0, y: 0, force: 0 };
  }

  /**
   * Continuous clearance used by path smoothing and runtime steering.
   */
  isWorldWalkableFor(x: number, y: number, profile: NavigationProfile) {
    const radius = profile === "HEAVY" ? 9.5 : 8.5;
    const diagonal = radius * Math.SQRT1_2;
    const samples = [
      [0, 0],
      [radius, 0], [-radius, 0], [0, radius], [0, -radius],
      [diagonal, diagonal], [diagonal, -diagonal], [-diagonal, diagonal], [-diagonal, -diagonal],
    ];
    return samples.every(([offsetX, offsetY]) => {
      const sampleX = x + offsetX;
      const sampleY = y + offsetY;
      return sampleX >= 0 && sampleY >= 0 &&
        sampleX < TILED_NAV_COLUMNS * TILED_NAV_CELL_SIZE &&
        sampleY < TILED_NAV_ROWS * TILED_NAV_CELL_SIZE &&
        !this.isBlocked(sampleX, sampleY);
    });
  }
}
