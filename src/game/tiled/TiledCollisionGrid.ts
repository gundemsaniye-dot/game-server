import type { NavCell, NavigationProfile } from "./TiledTypes";

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
const hasNavigationRole = (tile: Phaser.Tilemaps.Tile | null | undefined, role: "bridge" | "blocked") =>
  hasTile(tile) && tile?.properties.navigationRole === role;
const objectProperty = (object: Phaser.Types.Tilemaps.TiledObject, name: string) =>
  object.properties?.find((property: { name?: string; value?: unknown }) => property.name === name)?.value;

/** A read-only 20px grid built from the invisible Tiled navigation layers. */
export class TiledCollisionGrid {
  private readonly cells = Array.from({ length: TILED_NAV_ROWS }, () =>
    Array.from({ length: TILED_NAV_COLUMNS }, groundCell),
  );

  constructor(tilemap: Phaser.Tilemaps.Tilemap) {
    const blocked = tilemap.getLayer("NAV_BLOCKED");
    const bridges = tilemap.getLayer("05_BRIDGES");
    for (let tileY = 0; tileY < 18; tileY += 1) {
      for (let tileX = 0; tileX < 32; tileX += 1) {
        const blockedTile = blocked?.data[tileY]?.[tileX] ?? null;
        const bridgeTile = bridges?.data[tileY]?.[tileX] ?? null;
        // A marker on the wrong layer must never silently change movement.
        // Only the explicit green bridge and red blocked marker properties are
        // accepted as movement data.
        const isBlocked = hasNavigationRole(blockedTile, "blocked");
        const isBridge = hasNavigationRole(bridgeTile, "bridge");
        const properties = (isBridge ? bridgeTile?.properties : blockedTile?.properties ?? {}) as Record<string, unknown>;
        const nav = {
          walkable: isBridge ? true : properties.walkable !== false && !isBlocked,
          terrainType: isBridge
            ? "bridge"
            : typeof properties.terrainType === "string" ? properties.terrainType : isBlocked ? "solid" : "ground",
          moveCost: typeof properties.moveCost === "number" ? properties.moveCost : 1,
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

      const first = this.worldToCell(object.x, object.y);
      const last = this.worldToCell(object.x + object.width - 0.001, object.y + object.height - 0.001);
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

  isWalkableFor(column: number, row: number, profile: NavigationProfile) {
    if (column < 0 || row < 0 || column >= TILED_NAV_COLUMNS || row >= TILED_NAV_ROWS) return false;
    const center = this.cellCenter(column, row);
    // Validate the actual agent radius at graph-build time. Sampling whole
    // neighbouring cells was too conservative for 40px bridges; sampling the
    // profile radius at the 20px cell centre preserves those corridors while
    // preventing A* from returning shoreline/corner cells steering cannot use.
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

  /** Continuous clearance used by path smoothing and runtime steering.
   * A* still works on the compact 20px grid, while this prevents a unit center
   * from hugging a shoreline/corner so closely that its sprite appears inside
   * the blocked surface. */
  isWorldWalkableFor(x: number, y: number, profile: NavigationProfile) {
    // Authored crossings can be 40px wide and the navigation graph samples
    // their two 20px centre lines. A radius below 10px leaves a real buffer
    // without deleting both valid centre lines from the graph. Visual sprite
    // width is intentionally independent from the gameplay collision radius.
    // Small units used to receive only 4px clearance, which kept their centre
    // legal but let the sprite visibly hang over a river bank. Every profile
    // now keeps at least the same 8.5px shoreline buffer; heavy units keep 9.5px.
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
