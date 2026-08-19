import { ONLINE_MAP_CONTRACT, type OnlineMapContract } from "./OnlineMapContract";

export interface OnlinePathPoint {
  x: number;
  y: number;
}

interface GridCell {
  column: number;
  row: number;
}

const DIRECTIONS = [
  { column: 1, row: 0, cost: 1 },
  { column: -1, row: 0, cost: 1 },
  { column: 0, row: 1, cost: 1 },
  { column: 0, row: -1, cost: 1 },
  { column: 1, row: 1, cost: Math.SQRT2 },
  { column: 1, row: -1, cost: Math.SQRT2 },
  { column: -1, row: 1, cost: Math.SQRT2 },
  { column: -1, row: -1, cost: Math.SQRT2 },
] as const;

export class OnlineMapNavigation {
  constructor(private readonly contract: OnlineMapContract = ONLINE_MAP_CONTRACT) {}

  isWalkableWorld(x: number, y: number) {
    const cell = this.worldToCell(x, y);
    return this.isWalkableCell(cell.column, cell.row);
  }

  isResourcePlacementSafe(x: number, y: number, clearance = 18) {
    const points = [
      { x, y },
      { x: x - clearance, y: y - clearance },
      { x: x + clearance, y: y - clearance },
      { x: x - clearance, y: y + clearance },
      { x: x + clearance, y: y + clearance },
    ];
    return points.every((point) => {
      if (point.x < 0 || point.y < 0 || point.x >= this.contract.worldWidth || point.y >= this.contract.worldHeight) return false;
      const cell = this.worldToCell(point.x, point.y);
      const index = this.index(cell.column, cell.row);
      return !this.contract.blocked[index] && !this.contract.bridges[index];
    });
  }

  nearestWalkableWorld(x: number, y: number): OnlinePathPoint {
    const origin = this.worldToCell(x, y);
    if (this.isWalkableCell(origin.column, origin.row)) return this.cellCenter(origin);

    const maxRadius = Math.max(this.contract.columns, this.contract.rows);
    for (let radius = 1; radius <= maxRadius; radius += 1) {
      let best: GridCell | undefined;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let row = origin.row - radius; row <= origin.row + radius; row += 1) {
        for (let column = origin.column - radius; column <= origin.column + radius; column += 1) {
          if (Math.max(Math.abs(column - origin.column), Math.abs(row - origin.row)) !== radius) continue;
          if (!this.isWalkableCell(column, row)) continue;
          const center = this.cellCenter({ column, row });
          const distance = Math.hypot(center.x - x, center.y - y);
          if (distance < bestDistance) {
            best = { column, row };
            bestDistance = distance;
          }
        }
      }
      if (best) return this.cellCenter(best);
    }
    throw new Error("Online TMJ navigation has no walkable cells.");
  }

  findPath(start: OnlinePathPoint, goal: OnlinePathPoint): OnlinePathPoint[] {
    const walkableStart = this.nearestWalkableWorld(start.x, start.y);
    const walkableGoal = this.nearestWalkableWorld(goal.x, goal.y);
    const startCell = this.worldToCell(walkableStart.x, walkableStart.y);
    const goalCell = this.worldToCell(walkableGoal.x, walkableGoal.y);
    const startIndex = this.index(startCell.column, startCell.row);
    const goalIndex = this.index(goalCell.column, goalCell.row);
    const exactGoal = this.isWalkableWorld(goal.x, goal.y) ? goal : walkableGoal;
    if (startIndex === goalIndex) return [exactGoal];

    const total = this.contract.columns * this.contract.rows;
    const cameFrom = new Int32Array(total).fill(-1);
    const gScore = new Float64Array(total).fill(Number.POSITIVE_INFINITY);
    const open: number[] = [startIndex];
    const inOpen = new Uint8Array(total);
    inOpen[startIndex] = 1;
    gScore[startIndex] = 0;

    while (open.length > 0) {
      let bestAt = 0;
      let bestScore = Number.POSITIVE_INFINITY;
      for (let index = 0; index < open.length; index += 1) {
        const candidate = this.cellForIndex(open[index]);
        const score = gScore[open[index]] + this.heuristic(candidate, goalCell);
        if (score < bestScore) {
          bestAt = index;
          bestScore = score;
        }
      }
      const currentIndex = open.splice(bestAt, 1)[0];
      inOpen[currentIndex] = 0;
      if (currentIndex === goalIndex) {
        const path = this.reconstruct(cameFrom, goalIndex, startIndex);
        const last = path[path.length - 1];
        if (!last || last.x !== exactGoal.x || last.y !== exactGoal.y) path.push(exactGoal);
        return path;
      }

      const current = this.cellForIndex(currentIndex);
      for (const direction of DIRECTIONS) {
        const column = current.column + direction.column;
        const row = current.row + direction.row;
        if (!this.isWalkableCell(column, row)) continue;
        if (direction.column !== 0 && direction.row !== 0) {
          if (!this.isWalkableCell(current.column + direction.column, current.row) ||
              !this.isWalkableCell(current.column, current.row + direction.row)) continue;
        }
        const neighborIndex = this.index(column, row);
        const tentative = gScore[currentIndex] + direction.cost;
        if (tentative >= gScore[neighborIndex]) continue;
        cameFrom[neighborIndex] = currentIndex;
        gScore[neighborIndex] = tentative;
        if (!inOpen[neighborIndex]) {
          open.push(neighborIndex);
          inOpen[neighborIndex] = 1;
        }
      }
    }
    return [];
  }

  private reconstruct(cameFrom: Int32Array, goalIndex: number, startIndex: number) {
    const reversed: number[] = [];
    let current = goalIndex;
    while (current !== startIndex && current >= 0) {
      reversed.push(current);
      current = cameFrom[current];
    }
    return reversed.reverse().map((index) => this.cellCenter(this.cellForIndex(index)));
  }

  private worldToCell(x: number, y: number): GridCell {
    return {
      column: Math.min(this.contract.columns - 1, Math.max(0, Math.floor(x / this.contract.tileSize))),
      row: Math.min(this.contract.rows - 1, Math.max(0, Math.floor(y / this.contract.tileSize))),
    };
  }

  private cellCenter(cell: GridCell): OnlinePathPoint {
    return {
      x: (cell.column + 0.5) * this.contract.tileSize,
      y: (cell.row + 0.5) * this.contract.tileSize,
    };
  }

  private isWalkableCell(column: number, row: number) {
    if (column < 0 || row < 0 || column >= this.contract.columns || row >= this.contract.rows) return false;
    return !this.contract.blocked[this.index(column, row)];
  }

  private index(column: number, row: number) {
    return row * this.contract.columns + column;
  }

  private cellForIndex(index: number): GridCell {
    return { column: index % this.contract.columns, row: Math.floor(index / this.contract.columns) };
  }

  private heuristic(a: GridCell, b: GridCell) {
    const dx = Math.abs(a.column - b.column);
    const dy = Math.abs(a.row - b.row);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  }
}

export const ONLINE_MAP_NAVIGATION = new OnlineMapNavigation();
