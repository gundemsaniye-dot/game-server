import type {
  OnlineCommandError,
  OnlineGameEnd,
  OnlineMatchSnapshot,
  OnlineReadyState,
  OnlinePower,
  OnlinePowerCast,
  OnlineEmoteEvent,
  OnlineEmoteId,
} from "./NetworkProtocol";
import { ServerMessages } from "./NetworkProtocol";
import { NetworkClient } from "./NetworkClient";

export interface OnlineMatchRuntimeCallbacks {
  onSnapshot(snapshot: OnlineMatchSnapshot): void;
  onGameEnd(result: OnlineGameEnd): void;
  onCommandError(error: OnlineCommandError): void;
  onPowerCast(event: OnlinePowerCast): void;
  onEmote(event: OnlineEmoteEvent): void;
  onGameStart?(): void;
  onReadyState?(state: OnlineReadyState): void;
}

export class OnlineMatchRuntime {
  private lastSequence = -1;
  private lastAppliedElapsedMs = Number.NEGATIVE_INFINITY;
  private pendingSnapshot?: OnlineMatchSnapshot;
  private disposed = false;

  private readonly snapshotHandler = (payload: OnlineMatchSnapshot) => {
    if (this.disposed || payload.seq <= this.lastSequence) return;
    this.lastSequence = payload.seq;
    // The server simulates at 20 Hz, but rendering every authoritative packet
    // makes Android WebView repeatedly dirty scene state between compositor
    // frames. Apply a 10 Hz presentation stream and interpolate it locally.
    // Commands, combat and the final result remain fully server-authoritative.
    if (payload.elapsedMs - this.lastAppliedElapsedMs < 100) return;
    this.lastAppliedElapsedMs = payload.elapsedMs;
    // WebSocket callbacks run between animation frames. Mutating Phaser's
    // display list from that task can force Android WebView to invalidate the
    // scene halfway through compositor scheduling. Keep only the newest state;
    // Game drains it at the beginning of its next render update.
    this.pendingSnapshot = payload;
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

  private readonly emoteHandler = (payload: OnlineEmoteEvent) => {
    if (!this.disposed) this.callbacks.onEmote(payload);
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
    network.on(ServerMessages.EMOTE, this.emoteHandler);
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

  sendEmote(emote: OnlineEmoteId) {
    this.network.sendEmote(emote);
  }

  applyLatestSnapshot() {
    const snapshot = this.pendingSnapshot;
    if (!snapshot || this.disposed) return;
    this.pendingSnapshot = undefined;
    this.callbacks.onSnapshot(snapshot);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.pendingSnapshot = undefined;
    this.network.off(ServerMessages.MATCH_STATE, this.snapshotHandler);
    this.network.off(ServerMessages.GAME_END, this.gameEndHandler);
    this.network.off(ServerMessages.ERROR, this.errorHandler);
    this.network.off(ServerMessages.POWER_CAST, this.powerCastHandler);
    this.network.off(ServerMessages.EMOTE, this.emoteHandler);
    this.network.off(ServerMessages.GAME_START, this.gameStartHandler);
    this.network.off(ServerMessages.MATCH_READY_STATE, this.readyStateHandler);
  }
}
