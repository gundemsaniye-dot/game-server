export type OnlineSide = "left" | "right";
export type OnlinePower = "missile" | "ice";

export type OnlineUnitState =
  | "moving"
  | "attackingUnit"
  | "attackingCastle"
  | "gathering"
  | "returning"
  | "dead";

export interface OnlineUnitSnapshot {
  id: number;
  ownerId: string;
  side: OnlineSide;
  type: string;
  level: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  state: OnlineUnitState;
  facing: 1 | -1;
  iceUntilMs: number;
  resourceId?: number;
}

export interface OnlineResourceSnapshot {
  id: number;
  side: OnlineSide;
  x: number;
  y: number;
  revision: number;
  amount: number;
  maxAmount: number;
  respawnAtMs: number;
}

export interface OnlineSideSnapshot {
  playerId: string;
  gold: number;
  castleHp: number;
  castleMaxHp: number;
  powerReadyAt: Record<OnlinePower, number>;
}

export interface OnlineMatchSnapshot {
  roomId: string;
  seq: number;
  seed: number;
  mapId: string;
  elapsedMs: number;
  durationMs: number;
  serverTime: number;
  left: OnlineSideSnapshot;
  right: OnlineSideSnapshot;
  units: OnlineUnitSnapshot[];
  resources: OnlineResourceSnapshot[];
}

export interface InitialOnlineState {
  roomId: string;
  playerId: string;
  side: OnlineSide;
  mapId: string;
  seed: number;
  durationMs: number;
}

export interface OnlineReadyState {
  roomId: string;
  leftReady: boolean;
  rightReady: boolean;
}

export interface SpawnUnitCommand {
  commandId: string;
  type: string;
  level: number;
  x: number;
  y: number;
}

export interface UsePowerCommand {
  commandId: string;
  power: OnlinePower;
  x: number;
  y: number;
}

export interface OnlinePowerCast {
  castId: number;
  side: OnlineSide;
  power: OnlinePower;
  x: number;
  y: number;
  castAtMs: number;
  impactAtMs: number;
}

export interface OnlineGameEnd {
  roomId: string;
  winnerId: string;
  winnerSide: OnlineSide;
  reason: "castle" | "time" | "disconnect";
  finalState: OnlineMatchSnapshot;
}

export interface OnlineCommandError {
  commandId?: string;
  code: string;
  message: string;
}

export enum ClientMessages {
  HELLO = "HELLO",
  FIND_MATCH = "FIND_MATCH",
  CANCEL_MATCH = "CANCEL_MATCH",
  SPAWN_UNIT = "SPAWN_UNIT",
  MOVE_UNIT = "MOVE_UNIT",
  READY = "READY",
  ATTACK_UNIT = "ATTACK_UNIT",
  USE_ABILITY = "USE_ABILITY",
  RESYNC_REQUEST = "RESYNC_REQUEST"
}

export enum ServerMessages {
  CONNECTED = "CONNECTED",
  MATCH_FOUND = "MATCH_FOUND",
  MATCH_READY_STATE = "MATCH_READY_STATE",
  GAME_START = "GAME_START",
  INITIAL_STATE = "INITIAL_STATE",
  MATCH_STATE = "MATCH_STATE",
  UNIT_SPAWN = "UNIT_SPAWN",
  UNIT_MOVE = "UNIT_MOVE",
  UNIT_ATTACK = "UNIT_ATTACK",
  PROJECTILE_SPAWN = "PROJECTILE_SPAWN",
  PROJECTILE_HIT = "PROJECTILE_HIT",
  UNIT_DAMAGE = "UNIT_DAMAGE",
  UNIT_DEATH = "UNIT_DEATH",
  UNIT_STATE_CHANGE = "UNIT_STATE_CHANGE",
  RESOURCE_UPDATE = "RESOURCE_UPDATE",
  STATE_CORRECTION = "STATE_CORRECTION",
  GAME_END = "GAME_END",
  POWER_CAST = "POWER_CAST",
  STATE_UPDATE = "STATE_UPDATE",
  ERROR = "ERROR"
}

export interface NetworkMessage<T = any> {
  type: ClientMessages | ServerMessages;
  payload?: T;
  seq?: number;
  ts?: number;
}
