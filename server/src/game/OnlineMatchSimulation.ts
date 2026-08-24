import type {
  OnlineCommandError,
  OnlineGameEnd,
  OnlineMatchSnapshot,
  OnlinePowerCast,
  OnlineResourceSnapshot,
  OnlineSide,
  OnlineUnitSnapshot,
  SpawnUnitCommand,
  UsePowerCommand,
} from "../../../shared/online/Protocol";
import { ONLINE_MAP_CONTRACT, type OnlineMapContract } from "./OnlineMapContract";
import { OnlineMapNavigation, type OnlinePathPoint } from "./OnlineMapNavigation";
import { ONLINE_MATCH_CONFIG, ONLINE_UNIT_STATS, type OnlineUnitStats } from "./OnlineMatchConfig";

interface OnlinePlayerState {
  playerId: string;
  gold: number;
  powerReadyAt: { missile: number; ice: number };
  consumedCommands: Set<string>;
}

interface SimulatedUnit extends OnlineUnitSnapshot {
  stats: OnlineUnitStats;
  path: OnlinePathPoint[];
  pathIndex: number;
  pathGoalKey?: string;
  lastAttackAt: number;
  workerPhase?: "toResource" | "gathering" | "returning";
  phaseUntil?: number;
  workerResourceId?: number;
  carryWood?: number;
  castleContactLogged?: boolean;
}

interface SimulatedResource extends OnlineResourceSnapshot {
  reservedByUnitId?: number;
}

export interface OnlineMatchPlayers {
  left: string;
  right: string;
}

export type SpawnResult =
  | { ok: true; unit: OnlineUnitSnapshot }
  | { ok: false; error: OnlineCommandError };

export type PowerResult =
  | { ok: true; event: OnlinePowerCast }
  | { ok: false; error: OnlineCommandError };

const ONLINE_LOADOUT = new Set(["peasant", "swordsman", "archer", "horseman"]);
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export class OnlineMatchSimulation {
  private readonly players: Record<OnlineSide, OnlinePlayerState>;
  private readonly units = new Map<number, SimulatedUnit>();
  private readonly pendingPowerCasts: OnlinePowerCast[] = [];
  private readonly resources = new Map<number, SimulatedResource>();
  private readonly castles: Record<OnlineSide, number> = {
    left: ONLINE_MATCH_CONFIG.castleHp,
    right: ONLINE_MATCH_CONFIG.castleHp,
  };
  private readonly navigation: OnlineMapNavigation;
  private elapsedMs = 0;
  private passiveIncomeAt = ONLINE_MATCH_CONFIG.passiveGoldIntervalMs;
  private nextUnitId = 1;
  private nextCastId = 1;
  private randomState: number;
  private seq = 0;
  private ended = false;

  constructor(
    public readonly roomId: string,
    playerIds: OnlineMatchPlayers,
    public readonly seed: number,
    public readonly contract: OnlineMapContract = ONLINE_MAP_CONTRACT,
  ) {
    this.randomState = seed >>> 0;
    this.navigation = new OnlineMapNavigation(this.contract);
    const player = (playerId: string): OnlinePlayerState => ({
      playerId,
      gold: ONLINE_MATCH_CONFIG.startingGold,
      powerReadyAt: { missile: 0, ice: 0 },
      consumedCommands: new Set(),
    });
    this.players = { left: player(playerIds.left), right: player(playerIds.right) };
    this.createInitialResources();
  }

  get durationMs() {
    return ONLINE_MATCH_CONFIG.durationMs;
  }

  get mapId() {
    return this.contract.mapId;
  }

  sideForPlayer(playerId: string): OnlineSide | undefined {
    if (this.players.left.playerId === playerId) return "left";
    if (this.players.right.playerId === playerId) return "right";
    return undefined;
  }

  spawn(playerId: string, command: SpawnUnitCommand): SpawnResult {
    const side = this.sideForPlayer(playerId);
    if (!side || this.ended) return this.reject(command?.commandId, "MATCH_INACTIVE", "Match is not active.");
    const duplicate = this.consumeCommand(side, command?.commandId);
    if (duplicate) return { ok: false, error: duplicate };

    const stats = ONLINE_LOADOUT.has(command.type) ? ONLINE_UNIT_STATS[command.type] : undefined;
    if (!stats) return this.reject(command.commandId, "UNKNOWN_UNIT", "Unknown online unit type.");

    if (stats.worker) {
      const activeWorkers = [...this.units.values()].filter(
        (unit) => unit.side === side && unit.hp > 0 && unit.stats.worker,
      ).length;
      if (activeWorkers >= ONLINE_MATCH_CONFIG.workerCap) {
        return this.reject(command.commandId, "UNIT_CAP", "Worker cap reached.");
      }
    }

    const player = this.players[side];
    if (player.gold < stats.cost) return this.reject(command.commandId, "NOT_ENOUGH_GOLD", "Not enough gold.");

    const bounds = this.contract.deployBounds[side];
    if (!Number.isFinite(command.x) || command.x < bounds.minX || command.x > bounds.maxX) {
      return this.reject(command.commandId, "INVALID_DEPLOY_X", "Deployment is outside the TMJ zone.");
    }
    if (!Number.isFinite(command.y) || command.y < bounds.minY || command.y > bounds.maxY) {
      return this.reject(command.commandId, "INVALID_DEPLOY_Y", "Deployment is outside the TMJ zone.");
    }
    if (!this.navigation.isWalkableWorld(command.x, command.y)) {
      return this.reject(command.commandId, "INVALID_DEPLOY_NAVIGATION", "Deployment is blocked by the TMJ navigation layer.");
    }

    player.gold -= stats.cost;
    const unit = this.createUnit(playerId, side, command.type, Math.max(1, Math.floor(command.level || 1)), command.x, command.y, stats);
    this.units.set(unit.id, unit);
    return { ok: true, unit: this.publicUnit(unit) };
  }

  usePower(playerId: string, command: UsePowerCommand): PowerResult {
    const side = this.sideForPlayer(playerId);
    if (!side || this.ended) return this.rejectPower(command?.commandId, "MATCH_INACTIVE", "Match is not active.");
    const duplicate = this.consumeCommand(side, command?.commandId);
    if (duplicate) return { ok: false, error: duplicate };
    const config = ONLINE_MATCH_CONFIG.powers[command.power];
    if (!config) return this.rejectPower(command.commandId, "UNKNOWN_POWER", "Unknown online power.");
    if (!Number.isFinite(command.x) || !Number.isFinite(command.y) ||
        command.x < 0 || command.x > this.contract.worldWidth ||
        command.y < 0 || command.y > this.contract.worldHeight) {
      return this.rejectPower(command.commandId, "INVALID_POWER_TARGET", "Power target is outside the map.");
    }

    const player = this.players[side];
    if (this.elapsedMs < player.powerReadyAt[command.power]) {
      return this.rejectPower(command.commandId, "POWER_COOLDOWN", "Power is cooling down.");
    }
    if (command.power === "missile") {
      const geometry = this.contract.sides[side];
      const opponent: OnlineSide = side === "left" ? "right" : "left";
      const opponentGeometry = this.contract.sides[opponent];
      const homeTargetX = geometry.castleLineX ?? (side === "left" ? geometry.castle.maxX : geometry.castle.minX);
      const opponentCastleEdge = opponentGeometry.castleLineX ?? (
        opponent === "left" ? opponentGeometry.castle.maxX : opponentGeometry.castle.minX
      );
      const minTargetX = Math.min(homeTargetX, opponentCastleEdge);
      const maxTargetX = Math.max(homeTargetX, opponentCastleEdge);
      if (command.x < minTargetX || command.x > maxTargetX) {
        return this.rejectPower(command.commandId, "INVALID_POWER_TARGET", "Missile target is outside the castle corridor.");
      }
    }

    player.powerReadyAt[command.power] = this.elapsedMs + config.cooldownMs;
    const event: OnlinePowerCast = {
      castId: this.nextCastId++,
      side,
      power: command.power,
      x: command.x,
      y: command.y,
      castAtMs: this.elapsedMs,
      impactAtMs: this.elapsedMs + config.impactDelayMs,
    };
    if (config.impactDelayMs === 0) this.applyPowerImpact(event);
    else this.pendingPowerCasts.push(event);
    return { ok: true, event };
  }

  tick(deltaMs: number): OnlineGameEnd | undefined {
    if (this.ended) return undefined;
    let remaining = clamp(deltaMs, 0, 250);
    while (remaining > 0 && !this.ended) {
      const step = Math.min(50, remaining);
      this.advance(step);
      remaining -= step;
    }
    return this.resolveEnd();
  }

  snapshot(): OnlineMatchSnapshot {
    const sideSnapshot = (side: OnlineSide) => ({
      playerId: this.players[side].playerId,
      gold: this.players[side].gold,
      castleHp: Math.max(0, Math.round(this.castles[side])),
      castleMaxHp: ONLINE_MATCH_CONFIG.castleHp,
      powerReadyAt: { ...this.players[side].powerReadyAt },
    });
    return {
      roomId: this.roomId,
      seq: ++this.seq,
      seed: this.seed,
      mapId: this.mapId,
      elapsedMs: Math.round(this.elapsedMs),
      durationMs: this.durationMs,
      serverTime: Date.now(),
      left: sideSnapshot("left"),
      right: sideSnapshot("right"),
      units: [...this.units.values()].filter((unit) => unit.hp > 0).map((unit) => this.publicUnit(unit)),
      resources: [...this.resources.values()].map((resource) => this.publicResource(resource)),
    };
  }

  endForDisconnect(disconnectedPlayerId: string): OnlineGameEnd | undefined {
    if (this.ended) return undefined;
    const disconnectedSide = this.sideForPlayer(disconnectedPlayerId);
    if (!disconnectedSide) return undefined;
    this.ended = true;
    return this.gameEnd(disconnectedSide === "left" ? "right" : "left", "disconnect");
  }

  private advance(deltaMs: number) {
    this.elapsedMs += deltaMs;
    while (this.elapsedMs >= this.passiveIncomeAt) {
      this.players.left.gold += ONLINE_MATCH_CONFIG.passiveGoldAmount;
      this.players.right.gold += ONLINE_MATCH_CONFIG.passiveGoldAmount;
      this.passiveIncomeAt += ONLINE_MATCH_CONFIG.passiveGoldIntervalMs;
    }
    this.applyDuePowerCasts();
    this.respawnDueResources();

    for (const unit of [...this.units.values()].sort((a, b) => a.id - b.id)) {
      if (unit.hp <= 0) continue;
      if (unit.iceUntilMs > this.elapsedMs) continue;
      if (unit.stats.worker) this.updateWorker(unit, deltaMs);
      else this.updateCombatUnit(unit, deltaMs);
    }
    for (const [id, unit] of this.units) {
      if (unit.hp > 0) continue;
      this.releaseWorkerResource(unit);
      this.units.delete(id);
    }
  }

  private updateWorker(unit: SimulatedUnit, deltaMs: number) {
    if (unit.workerPhase === "gathering") {
      unit.state = "gathering";
      if (this.elapsedMs < (unit.phaseUntil ?? 0)) return;
      const resource = unit.workerResourceId === undefined ? undefined : this.resources.get(unit.workerResourceId);
      if (!resource || resource.amount <= 0 || resource.reservedByUnitId !== unit.id) {
        this.releaseWorkerResource(unit);
        unit.workerPhase = (unit.carryWood ?? 0) > 0 ? "returning" : "toResource";
        unit.pathGoalKey = undefined;
        return;
      }

      resource.amount = Math.max(0, resource.amount - 1);
      unit.carryWood = (unit.carryWood ?? 0) + 1;
      unit.phaseUntil = this.elapsedMs + ONLINE_MATCH_CONFIG.workerGatherIntervalMs;
      if (resource.amount === 0) resource.respawnAtMs = this.elapsedMs + ONLINE_MATCH_CONFIG.resourceRespawnMs;
      if (resource.amount === 0 || unit.carryWood >= ONLINE_MATCH_CONFIG.workerCarryCapacity) {
        this.releaseWorkerResource(unit);
        unit.workerPhase = "returning";
        unit.pathGoalKey = undefined;
        unit.state = "returning";
      }
      return;
    }

    let resource = unit.workerResourceId === undefined ? undefined : this.resources.get(unit.workerResourceId);
    if (unit.workerPhase !== "returning" && (!resource || resource.amount <= 0)) {
      this.releaseWorkerResource(unit);
      resource = this.assignWorkerResource(unit);
    }
    const targetX = unit.workerPhase === "returning" ? this.castleFront(unit.side) : resource?.x ?? unit.x;
    const targetY = unit.workerPhase === "returning" ? unit.y : resource?.y ?? unit.y;
    const reached = this.moveNavigated(unit, targetX, targetY, deltaMs);
    unit.state = unit.workerPhase === "returning" ? "returning" : "moving";
    if (!reached) return;
    if (unit.workerPhase === "returning") {
      const carried = Math.min(unit.carryWood ?? 0, ONLINE_MATCH_CONFIG.workerCarryCapacity);
      this.players[unit.side].gold += Math.round(
        ONLINE_MATCH_CONFIG.workerDeliveryGold * carried / ONLINE_MATCH_CONFIG.workerCarryCapacity,
      );
      unit.hp = 0;
      unit.state = "dead";
      return;
    }
    if (!resource) return;
    unit.workerPhase = "gathering";
    unit.phaseUntil = this.elapsedMs + ONLINE_MATCH_CONFIG.workerGatherIntervalMs;
    unit.pathGoalKey = undefined;
    unit.state = "gathering";
  }

  private updateCombatUnit(unit: SimulatedUnit, deltaMs: number) {
    const opponent: OnlineSide = unit.side === "left" ? "right" : "left";
    const target = this.closestEnemy(unit);
    if (target && this.distance(unit, target) <= unit.stats.range) {
      unit.state = "attackingUnit";
      unit.facing = target.x >= unit.x ? 1 : -1;
      if (this.attackReady(unit)) target.hp = Math.max(0, target.hp - unit.stats.damage);
      return;
    }
    const castleX = this.castleFront(opponent);
    const isRanged = unit.stats.range > 80;
    const attackRange = isRanged ? Math.min(unit.stats.range, 160) : 16;
    const forwardDistance = unit.side === "left" ? castleX - unit.x : unit.x - castleX;
    if (forwardDistance <= attackRange) {
      unit.path = [];
      unit.pathIndex = 0;
      unit.pathGoalKey = undefined;
      unit.state = "attackingCastle";
      unit.facing = opponent === "right" ? 1 : -1;
      if (!unit.castleContactLogged) {
        unit.castleContactLogged = true;
        console.info(
          `[INFO] CASTLE_CONTACT room=${this.roomId} side=${unit.side} type=${unit.type} x=${unit.x.toFixed(1)} targetX=${castleX.toFixed(1)} dx=${Math.abs(castleX - unit.x).toFixed(1)}`,
        );
      }
      if (this.attackReady(unit)) this.castles[opponent] = Math.max(0, this.castles[opponent] - unit.stats.castleDamage);
      return;
    }
    unit.state = "moving";
    if (target && this.distance(unit, target) <= 190) {
      this.moveNavigated(unit, target.x, target.y, deltaMs);
      return;
    }

    // Final approach corridor to castle wall:
    const castleDistance = Math.abs(castleX - unit.x);
    if (castleDistance <= 110) {
      const step = Math.min(castleDistance, unit.stats.speed * (deltaMs / 1_000));
      unit.x += unit.side === "left" ? step : -step;
      unit.facing = unit.side === "left" ? 1 : -1;
      const updatedDistance = unit.side === "left" ? castleX - unit.x : unit.x - castleX;
      if (updatedDistance <= attackRange) {
        unit.state = "attackingCastle";
        if (this.attackReady(unit)) this.castles[opponent] = Math.max(0, this.castles[opponent] - unit.stats.castleDamage);
      }
      return;
    }

    this.moveNavigated(unit, castleX, unit.y, deltaMs);
  }

  private moveNavigated(unit: SimulatedUnit, targetX: number, targetY: number, deltaMs: number) {
    const goalKey = `${Math.floor(targetX / this.contract.tileSize)}:${Math.floor(targetY / this.contract.tileSize)}`;
    if (unit.pathGoalKey !== goalKey || unit.pathIndex >= unit.path.length) {
      unit.path = this.navigation.findPath(unit, { x: targetX, y: targetY });
      unit.pathIndex = 0;
      unit.pathGoalKey = goalKey;
    }
    const waypoint = unit.path[unit.pathIndex];
    if (!waypoint) return Math.hypot(targetX - unit.x, targetY - unit.y) <= this.contract.tileSize;
    if (this.moveToward(unit, waypoint.x, waypoint.y, deltaMs)) unit.pathIndex += 1;
    return unit.pathIndex >= unit.path.length;
  }

  private createUnit(ownerId: string, side: OnlineSide, type: string, level: number, x: number, y: number, stats: OnlineUnitStats): SimulatedUnit {
    const unit: SimulatedUnit = {
      id: this.nextUnitId++, ownerId, side, type, level, x, y,
      hp: stats.hp, maxHp: stats.hp, state: "moving", facing: side === "left" ? 1 : -1,
      iceUntilMs: 0, stats, path: [], pathIndex: 0, lastAttackAt: -stats.cooldownMs,
      workerPhase: stats.worker ? "toResource" : undefined,
      carryWood: stats.worker ? 0 : undefined,
    };
    if (stats.worker) this.assignWorkerResource(unit);
    return unit;
  }

  private moveToward(unit: SimulatedUnit, targetX: number, targetY: number, deltaMs: number) {
    const dx = targetX - unit.x;
    const dy = targetY - unit.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= 1) {
      unit.x = targetX;
      unit.y = targetY;
      return true;
    }
    const step = Math.min(distance, unit.stats.speed * (deltaMs / 1_000));
    unit.x += (dx / distance) * step;
    unit.y += (dy / distance) * step;
    if (Math.abs(dx) > 0.1) unit.facing = dx > 0 ? 1 : -1;
    return step >= distance;
  }

  private createInitialResources() {
    const anchors: Array<{ id: number; side: OnlineSide; x: number; y: number }> = [
      { id: 1, side: "left", x: 460, y: 200 },
      { id: 2, side: "left", x: 420, y: 520 },
      { id: 3, side: "right", x: 820, y: 200 },
      { id: 4, side: "right", x: 860, y: 520 },
    ];
    for (const anchor of anchors) {
      const position = this.chooseResourcePosition(anchor.side, anchor, 0, 120);
      this.resources.set(anchor.id, {
        id: anchor.id,
        side: anchor.side,
        ...position,
        revision: 0,
        amount: ONLINE_MATCH_CONFIG.resourceAmount,
        maxAmount: ONLINE_MATCH_CONFIG.resourceAmount,
        respawnAtMs: 0,
      });
    }
  }

  private resourceForWorker(side: OnlineSide, x: number, y: number) {
    return [...this.resources.values()]
      .filter((resource) => resource.side === side && resource.amount > 0 && resource.reservedByUnitId === undefined)
      .sort((left, right) =>
        Math.hypot(left.x - x, left.y - y) - Math.hypot(right.x - x, right.y - y) || left.id - right.id
      )[0];
  }

  private assignWorkerResource(unit: SimulatedUnit) {
    const resource = this.resourceForWorker(unit.side, unit.x, unit.y);
    if (!resource) return undefined;
    resource.reservedByUnitId = unit.id;
    unit.workerResourceId = resource.id;
    unit.pathGoalKey = undefined;
    return resource;
  }

  private releaseWorkerResource(unit: SimulatedUnit) {
    if (unit.workerResourceId === undefined) return;
    const resource = this.resources.get(unit.workerResourceId);
    if (resource?.reservedByUnitId === unit.id) resource.reservedByUnitId = undefined;
    unit.workerResourceId = undefined;
  }

  private respawnDueResources() {
    for (const resource of this.resources.values()) {
      if (resource.amount > 0 || resource.respawnAtMs === 0 || resource.respawnAtMs > this.elapsedMs) continue;
      this.respawnResource(resource);
    }
  }

  private respawnResource(resource: SimulatedResource) {
    const position = this.chooseResourcePosition(
      resource.side,
      resource,
      ONLINE_MATCH_CONFIG.resourceRespawnNearMin,
      ONLINE_MATCH_CONFIG.resourceRespawnNearMax,
      resource.id,
    );
    resource.x = position.x;
    resource.y = position.y;
    resource.revision += 1;
    resource.amount = resource.maxAmount;
    resource.respawnAtMs = 0;
    resource.reservedByUnitId = undefined;
  }

  private chooseResourcePosition(
    side: OnlineSide,
    anchor: OnlinePathPoint,
    minDistance: number,
    maxDistance: number,
    ignoredResourceId?: number,
  ): OnlinePathPoint {
    const midpoint = this.contract.worldWidth / 2;
    const bounds = side === "left"
      ? { minX: this.contract.deployBounds.left.maxX + 20, maxX: midpoint - 40 }
      : { minX: midpoint + 40, maxX: this.contract.deployBounds.right.minX - 20 };
    const candidates: OnlinePathPoint[] = [];
    const step = this.contract.tileSize / 2;
    for (let y = 60; y <= this.contract.worldHeight - 60; y += step) {
      for (let x = bounds.minX; x <= bounds.maxX; x += step) {
        const distance = Math.hypot(x - anchor.x, y - anchor.y);
        if (distance < minDistance || distance > maxDistance) continue;
        if (!this.navigation.isResourcePlacementSafe(x, y, 14)) continue;
        const separated = [...this.resources.values()].every((resource) =>
          resource.id === ignoredResourceId || Math.hypot(x - resource.x, y - resource.y) >= 48
        );
        if (separated) candidates.push({ x, y });
      }
    }
    if (candidates.length === 0 && maxDistance < 600) {
      return this.chooseResourcePosition(side, anchor, 0, maxDistance + 60, ignoredResourceId);
    }
    if (candidates.length === 0) throw new Error(`No safe online resource position for ${side}.`);
    candidates.sort((left, right) => Math.hypot(left.x - anchor.x, left.y - anchor.y) - Math.hypot(right.x - anchor.x, right.y - anchor.y));
    const poolSize = Math.min(12, candidates.length);
    return candidates[Math.floor(this.random() * poolSize)];
  }

  private random() {
    this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
    return this.randomState / 0x100000000;
  }

  private applyDuePowerCasts() {
    for (let index = this.pendingPowerCasts.length - 1; index >= 0; index -= 1) {
      const event = this.pendingPowerCasts[index];
      if (event.impactAtMs > this.elapsedMs) continue;
      this.pendingPowerCasts.splice(index, 1);
      this.applyPowerImpact(event);
    }
  }

  private applyPowerImpact(event: OnlinePowerCast) {
    const radius = ONLINE_MATCH_CONFIG.powers[event.power].radius;
    for (const unit of this.units.values()) {
      // Online missile fire is an area weapon, not a team-filtered attack:
      // both players' units can be caught in the blast.
      if (unit.hp <= 0) continue;
      const distance = Math.hypot(unit.x - event.x, unit.y - event.y);
      if (distance > radius) continue;
      if (event.power === "missile") {
        const config = ONLINE_MATCH_CONFIG.powers.missile;
        const damage = config.damage * (1 - (distance / config.radius) * 0.45);
        unit.hp = Math.max(0, unit.hp - damage);
      } else {
        unit.iceUntilMs = Math.max(unit.iceUntilMs, this.elapsedMs + ONLINE_MATCH_CONFIG.powers.ice.durationMs);
      }
    }
  }

  private closestEnemy(unit: SimulatedUnit) {
    let closest: SimulatedUnit | undefined;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of this.units.values()) {
      if (candidate.side === unit.side || candidate.hp <= 0) continue;
      const distance = this.distance(unit, candidate);
      if (distance < closestDistance) {
        closest = candidate;
        closestDistance = distance;
      }
    }
    return closest;
  }

  private attackReady(unit: SimulatedUnit) {
    if (this.elapsedMs - unit.lastAttackAt < unit.stats.cooldownMs) return false;
    unit.lastAttackAt = this.elapsedMs;
    return true;
  }

  private resolveEnd(): OnlineGameEnd | undefined {
    if (this.ended || (this.castles.left > 0 && this.castles.right > 0)) return undefined;
    this.ended = true;
    let winnerSide: OnlineSide;
    if (this.castles.left !== this.castles.right) winnerSide = this.castles.left > this.castles.right ? "left" : "right";
    else if (this.players.left.gold !== this.players.right.gold) winnerSide = this.players.left.gold > this.players.right.gold ? "left" : "right";
    else winnerSide = "left";
    return this.gameEnd(winnerSide, "castle");
  }

  private gameEnd(winnerSide: OnlineSide, reason: OnlineGameEnd["reason"]): OnlineGameEnd {
    return { roomId: this.roomId, winnerId: this.players[winnerSide].playerId, winnerSide, reason, finalState: this.snapshot() };
  }

  private publicUnit(unit: SimulatedUnit): OnlineUnitSnapshot {
    return {
      id: unit.id, ownerId: unit.ownerId, side: unit.side, type: unit.type, level: unit.level,
      x: Math.round(unit.x * 10) / 10, y: Math.round(unit.y * 10) / 10,
      hp: Math.max(0, Math.round(unit.hp)), maxHp: unit.maxHp, state: unit.state,
      facing: unit.facing, iceUntilMs: Math.round(unit.iceUntilMs),
      resourceId: unit.workerResourceId,
    };
  }

  private publicResource(resource: SimulatedResource): OnlineResourceSnapshot {
    return {
      id: resource.id,
      side: resource.side,
      x: resource.x,
      y: resource.y,
      revision: resource.revision,
      amount: resource.amount,
      maxAmount: resource.maxAmount,
      respawnAtMs: Math.round(resource.respawnAtMs),
    };
  }

  private castleFront(side: OnlineSide) {
    return this.contract.castleContactX[side];
  }

  private distance(a: OnlinePathPoint, b: OnlinePathPoint) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private consumeCommand(side: OnlineSide, commandId: string | undefined) {
    if (!commandId || this.players[side].consumedCommands.has(commandId)) {
      return { commandId, code: "DUPLICATE_COMMAND", message: "Command was already processed or has no id." };
    }
    this.players[side].consumedCommands.add(commandId);
    return undefined;
  }

  private reject(commandId: string | undefined, code: string, message: string): SpawnResult {
    return { ok: false, error: { commandId, code, message } };
  }

  private rejectPower(commandId: string | undefined, code: string, message: string): PowerResult {
    return { ok: false, error: { commandId, code, message } };
  }
}
