import type {
  OnlineCommandError,
  OnlineGameEnd,
  OnlineMatchSnapshot,
  OnlineReadyState,
  OnlinePower,
  OnlinePowerCast,
} from "./NetworkProtocol";
import { ServerMessages } from "./NetworkProtocol";
import { NetworkClient } from "./NetworkClient";

export interface OnlineMatchRuntimeCallbacks {
  onSnapshot(snapshot: OnlineMatchSnapshot): void;
  onGameEnd(result: OnlineGameEnd): void;
  onCommandError(error: OnlineCommandError): void;
  onPowerCast(event: OnlinePowerCast): void;
  onGameStart?(): void;
  onReadyState?(state: OnlineReadyState): void;
}

export class OnlineMatchRuntime {
  private lastSequence = -1;
  private disposed = false;

  private readonly snapshotHandler = (payload: OnlineMatchSnapshot) => {
    if (this.disposed || payload.seq <= this.lastSequence) return;
    this.lastSequence = payload.seq;
    this.callbacks.onSnapshot(payload);
  };

  private readonly gameEndHandler = (payload: OnlineGameEnd) => {
    if (!this.disposed) this.callbacks.onGameEnd(payload);
  };

  private readonly errorHandler = (payload: OnlineCommandError) => {
    if (!this.disposed) this.callbacks.onCommandError(payload);
  };

  private readonly powerCastHandler = (payload: OnlinePowerCast) => {
    if (!this.disposed) this.callbacks.onPowerCast(payload);
  };

  private readonly gameStartHandler = () => {
    if (!this.disposed) this.callbacks.onGameStart?.();
  };

  private readonly readyStateHandler = (payload: OnlineReadyState) => {
    if (!this.disposed) this.callbacks.onReadyState?.(payload);
  };

  constructor(
    private readonly network: NetworkClient,
    private readonly callbacks: OnlineMatchRuntimeCallbacks,
  ) {
    network.on(ServerMessages.MATCH_STATE, this.snapshotHandler);
    network.on(ServerMessages.GAME_END, this.gameEndHandler);
    network.on(ServerMessages.ERROR, this.errorHandler);
    network.on(ServerMessages.POWER_CAST, this.powerCastHandler);
    network.on(ServerMessages.GAME_START, this.gameStartHandler);
    network.on(ServerMessages.MATCH_READY_STATE, this.readyStateHandler);
    // INITIAL_STATE starts the scene asynchronously. A fast peer can make the
    // room ready while this client is still loading map textures, so replay the
    // latest authoritative readiness state after listeners are attached.
    if (network.latestReadyState) this.readyStateHandler(network.latestReadyState);
    if (network.matchStarted) this.gameStartHandler();
  }

  spawn(type: string, level: number, x: number, y: number) {
    return this.network.spawnUnit(type, level, x, y);
  }

  usePower(power: OnlinePower, x: number, y: number) {
    return this.network.usePower(power, x, y);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.network.off(ServerMessages.MATCH_STATE, this.snapshotHandler);
    this.network.off(ServerMessages.GAME_END, this.gameEndHandler);
    this.network.off(ServerMessages.ERROR, this.errorHandler);
    this.network.off(ServerMessages.POWER_CAST, this.powerCastHandler);
    this.network.off(ServerMessages.GAME_START, this.gameStartHandler);
    this.network.off(ServerMessages.MATCH_READY_STATE, this.readyStateHandler);
  }
}
