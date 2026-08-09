import { TILED_NAV_COLUMNS, TILED_NAV_ROWS, type TiledCollisionGrid } from "./TiledCollisionGrid";
import type { NavigationProfile } from "./TiledTypes";

export interface TiledPathPoint { x: number; y: number }

interface OpenNode {
  column: number;
  row: number;
  score: number;
}

/** A* can touch most of the 64x36 map. Sorting the full open array after
 * every visited cell caused long frame stalls once several units repathed at
 * the same time. This binary heap keeps push/pop at O(log n). */
class MinOpenHeap {
  private values: OpenNode[] = [];

  get length() {
    return this.values.length;
  }

  push(value: OpenNode) {
    this.values.push(value);
    let index = this.values.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.values[parent].score <= value.score) break;
      this.values[index] = this.values[parent];
      index = parent;
    }
    this.values[index] = value;
  }

  pop() {
    const first = this.values[0];
    const last = this.values.pop();
    if (!first || !last || this.values.length === 0) return first;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= this.values.length) break;
      const child = right < this.values.length && this.values[right].score < this.values[left].score
        ? right
        : left;
      if (this.values[child].score >= last.score) break;
      this.values[index] = this.values[child];
      index = child;
    }
    this.values[index] = last;
    return first;
  }
}

/**
 * Compact eight-direction A* for the 64x36 combat grid. It keeps map data
 * independent from Phaser physics and is safe to run on demand at runtime.
 */
export class TiledNavigation {
  constructor(private readonly grid: TiledCollisionGrid) {}

  findPath(startX: number, startY: number, endX: number, endY: number, profile: NavigationProfile = "NORMAL"): TiledPathPoint[] | undefined {
    const requestedStart = this.grid.worldToCell(startX, startY);
    const requestedGoal = this.grid.worldToCell(endX, endY);
    const start = this.grid.nearestWalkableCell(requestedStart.column, requestedStart.row, profile);
    const goal = this.grid.nearestWalkableCell(requestedGoal.column, requestedGoal.row, profile);
    if (!start || !goal) return undefined;
    const key = (column: number, row: number) => row * TILED_NAV_COLUMNS + column;
    const startKey = key(start.column, start.row);
    const goalKey = key(goal.column, goal.row);
    const open = new MinOpenHeap();
    open.push({ column: start.column, row: start.row, score: 0 });
    const costs = new Map([[startKey, 0]]);
    const parents = new Map<number, number>();
    const closed = new Set<number>();
    const heuristic = (column: number, row: number) => 10 * Math.max(Math.abs(goal.column - column), Math.abs(goal.row - row));

    while (open.length) {
      const current = open.pop();
      if (!current) break;
      const currentKey = key(current.column, current.row);
      if (closed.has(currentKey)) continue;
      if (currentKey === goalKey) return this.smooth(
        this.rebuild(parents, startKey, goalKey).map((cell) =>
          this.grid.cellCenter(cell % TILED_NAV_COLUMNS, Math.floor(cell / TILED_NAV_COLUMNS)),
        ),
        profile,
      );
      closed.add(currentKey);

      for (let y = -1; y <= 1; y += 1) {
        for (let x = -1; x <= 1; x += 1) {
          if (x === 0 && y === 0) continue;
          const column = current.column + x;
          const row = current.row + y;
          if (column < 0 || row < 0 || column >= TILED_NAV_COLUMNS || row >= TILED_NAV_ROWS) continue;
          const candidate = this.grid.cellAt(column, row);
          if (!candidate?.walkable || !this.grid.isWalkableFor(column, row, profile)) continue;
          // Diagonal movement cannot cut through a blocked corner.
          if (x && y && (!this.grid.isWalkableFor(current.column + x, current.row, profile) || !this.grid.isWalkableFor(current.column, current.row + y, profile))) continue;
          const candidateKey = key(column, row);
          if (closed.has(candidateKey)) continue;
          const nextCost = (costs.get(currentKey) ?? Infinity) + (x && y ? 14 : 10) * candidate.moveCost;
          if (nextCost >= (costs.get(candidateKey) ?? Infinity)) continue;
          costs.set(candidateKey, nextCost);
          parents.set(candidateKey, currentKey);
          open.push({ column, row, score: nextCost + heuristic(column, row) });
        }
      }
    }
    return undefined;
  }

  private rebuild(parents: Map<number, number>, start: number, goal: number) {
    const path = [goal];
    while (path[0] !== start) {
      const parent = parents.get(path[0]);
      if (parent === undefined) return [];
      path.unshift(parent);
    }
    return path;
  }

  private smooth(path: TiledPathPoint[], profile: NavigationProfile) {
    if (path.length < 3) return path;
    const smoothed = [path[0]];
    let anchor = 0;
    while (anchor < path.length - 1) {
      let next = path.length - 1;
      while (next > anchor + 1 && !this.hasLineOfSight(path[anchor], path[next], profile)) next -= 1;
      smoothed.push(path[next]);
      anchor = next;
    }
    return smoothed;
  }

  /** True when a straight segment stays on terrain this profile can occupy.
   * Path smoothing and combat perception deliberately share this test so a
   * unit cannot see/lock through the same wall or shoreline it must route
   * around. */
  hasLineOfSight(from: TiledPathPoint, to: TiledPathPoint, profile: NavigationProfile) {
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 6));
    for (let index = 1; index < steps; index += 1) {
      const x = from.x + ((to.x - from.x) * index) / steps;
      const y = from.y + ((to.y - from.y) * index) / steps;
      if (!this.grid.isWorldWalkableFor(x, y, profile)) return false;
    }
    return true;
  }
}
