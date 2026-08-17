import type { Player } from "../state/Player";
import {
  ClientMessages,
  ServerMessages,
  type InitialOnlineState,
  type NetworkMessage,
  type OnlineGameEnd,
  ONLINE_EMOTE_IDS,
  type OnlineEmoteEvent,
  type OnlineReadyState,
  type SendEmoteCommand,
  type SpawnUnitCommand,
  type UsePowerCommand,
} from "../network/NetworkProtocol";
import { Logger } from "../utils/Logger";
import { OnlineMatchSimulation } from "./OnlineMatchSimulation";

export class GameRoom {
  private readonly players: [Player, Player];
  private readonly simulation: OnlineMatchSimulation;
  private endBroadcast = false;
  private started = false;
  private readonly readyPlayerIds = new Set<string>();
  private readonly lastEmoteAtByPlayer = new Map<string, number>();
  private emoteSequence = 0;
  private snapshotBroadcastAccumulatorMs = 0;

  get isFinished() {
    return this.endBroadcast;
  }

  constructor(public readonly id: string, player1: Player, player2: Player, seed: number) {
    this.players = [player1, player2];
    this.simulation = new OnlineMatchSimulation(id, { left: player1.id, right: player2.id }, seed);
  }

  start() {
    for (const player of this.players) {
      const payload: InitialOnlineState = {
        roomId: this.id,
        playerId: player.id,
        side: player.side,
        mapId: this.simulation.mapId,
        seed: this.simulation.seed,
        durationMs: this.simulation.durationMs,
      };
      this.send(player, { type: ServerMessages.INITIAL_STATE, payload });
    }
    this.broadcastReadyState();
    Logger.info(`Room ${this.id} waiting for client readiness seed=${this.simulation.seed} map=${this.simulation.mapId}`);
  }

  handleClientMessage(player: Player, msg: NetworkMessage) {
    if (msg.type === ClientMessages.READY) {
      this.markReady(player);
      return;
    }
    if (!this.started) {
      this.send(player, {
        type: ServerMessages.ERROR,
        payload: { code: "MATCH_NOT_STARTED", message: "Waiting for both arenas to finish loading." },
      });
      return;
    }
    if (msg.type === ClientMessages.SPAWN_UNIT) {
      const result = this.simulation.spawn(player.id, msg.payload as SpawnUnitCommand);
      if (!result.ok) {
        Logger.info(`REJECT room=${this.id} side=${player.side} code=${result.error.code} command=${result.error.commandId ?? "unknown"}`);
        this.send(player, { type: ServerMessages.ERROR, payload: result.error });
      }
      else Logger.info(`SPAWN room=${this.id} side=${player.side} type=${result.unit.type} x=${result.unit.x} y=${result.unit.y}`);
      this.broadcastSnapshot();
      return;
    }
    if (msg.type === ClientMessages.USE_ABILITY) {
      const result = this.simulation.usePower(player.id, msg.payload as UsePowerCommand);
      if (!result.ok) {
        Logger.info(`REJECT room=${this.id} side=${player.side} code=${result.error.code} command=${result.error.commandId ?? "unknown"}`);
        this.send(player, { type: ServerMessages.ERROR, payload: result.error });
      } else {
        Logger.info(`POWER room=${this.id} side=${player.side} power=${result.event.power} x=${result.event.x} y=${result.event.y}`);
        this.broadcast({ type: ServerMessages.POWER_CAST, payload: result.event });
      }
      this.broadcastSnapshot();
      return;
    }
    if (msg.type === ClientMessages.SEND_EMOTE) {
      const payload = msg.payload as Partial<SendEmoteCommand> | undefined;
      if (!payload || !ONLINE_EMOTE_IDS.includes(payload.emote as never)) {
        this.send(player, {
          type: ServerMessages.ERROR,
          payload: { code: "INVALID_EMOTE", message: "Unknown online emote." },
        });
        return;
      }
      const emote = payload.emote as OnlineEmoteEvent["emote"];
      const now = Date.now();
      const lastEmoteAt = this.lastEmoteAtByPlayer.get(player.id) ?? 0;
      if (now - lastEmoteAt < 1_200) {
        this.send(player, {
          type: ServerMessages.ERROR,
          payload: { code: "EMOTE_COOLDOWN", message: "Please wait before sending another emote." },
        });
        return;
      }
      this.lastEmoteAtByPlayer.set(player.id, now);
      const event: OnlineEmoteEvent = {
        roomId: this.id,
        sequence: ++this.emoteSequence,
        playerId: player.id,
        side: player.side,
        emote,
        serverTime: now,
      };
      this.broadcast({ type: ServerMessages.EMOTE, payload: event });
      Logger.info(`EMOTE room=${this.id} side=${player.side} emote=${event.emote}`);
      return;
    }
    if (msg.type === ClientMessages.RESYNC_REQUEST) {
      this.send(player, { type: ServerMessages.MATCH_STATE, payload: this.simulation.snapshot() });
      return;
    }
    Logger.info(`Ignored unsupported online command ${msg.type} from ${player.id}`);
  }

  tick(deltaMs: number) {
    if (!this.started) return;
    const gameEnd = this.simulation.tick(deltaMs);
    if (gameEnd) {
      this.broadcastEnd(gameEnd);
      return;
    }

    // Keep the authoritative simulation at 20 Hz, but present snapshots at
    // 10 Hz. Mobile WebViews otherwise receive a JSON/network task between
    // almost every display frame, which measurably halves Android rAF cadence
    // even in an empty match. Commands still trigger an immediate snapshot.
    this.snapshotBroadcastAccumulatorMs += deltaMs;
    if (this.snapshotBroadcastAccumulatorMs < 100) return;
    this.snapshotBroadcastAccumulatorMs %= 100;
    this.broadcastSnapshot();
  }

  handleDisconnect(playerId: string) {
    const gameEnd = this.simulation.endForDisconnect(playerId);
    if (gameEnd) this.broadcastEnd(gameEnd);
  }

  private broadcastSnapshot() {
    if (this.endBroadcast || !this.started) return;
    this.broadcast({ type: ServerMessages.MATCH_STATE, payload: this.simulation.snapshot() });
  }

  private markReady(player: Player) {
    if (this.endBroadcast || this.started) return;
    this.readyPlayerIds.add(player.id);
    this.broadcastReadyState();
    Logger.info(`READY room=${this.id} side=${player.side} ready=${this.readyPlayerIds.size}/2`);
    if (this.readyPlayerIds.size < this.players.length) return;

    this.started = true;
    this.broadcast({ type: ServerMessages.GAME_START, payload: { roomId: this.id } });
    this.broadcast({ type: ServerMessages.MATCH_STATE, payload: this.simulation.snapshot() });
    Logger.info(`Room ${this.id} started after both clients ready seed=${this.simulation.seed} map=${this.simulation.mapId}`);
  }

  private broadcastReadyState() {
    const payload: OnlineReadyState = {
      roomId: this.id,
      leftReady: this.readyPlayerIds.has(this.players[0].id),
      rightReady: this.readyPlayerIds.has(this.players[1].id),
    };
    this.broadcast({ type: ServerMessages.MATCH_READY_STATE, payload });
  }

  private broadcastEnd(gameEnd: OnlineGameEnd) {
    if (this.endBroadcast) return;
    this.endBroadcast = true;
    this.broadcast({ type: ServerMessages.MATCH_STATE, payload: gameEnd.finalState });
    this.broadcast({ type: ServerMessages.GAME_END, payload: gameEnd });
    Logger.info(`Room ${this.id} ended winner=${gameEnd.winnerSide} reason=${gameEnd.reason}`);
  }

  private broadcast(msg: NetworkMessage) {
    for (const player of this.players) this.send(player, msg);
  }

  private send(player: Player, msg: NetworkMessage) {
    if (!player.ws || player.ws.getBufferedAmount() >= 64 * 1_024) return;
    const serialized = JSON.stringify(msg);
    player.ws.send(serialized);
    Logger.logNetworkOut(Buffer.byteLength(serialized, "utf8"));
  }
}
