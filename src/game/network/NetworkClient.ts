import { Events } from "phaser";
import {
  ClientMessages,
  type InitialOnlineState,
  type NetworkMessage,
  type OnlineReadyState,
  ServerMessages,
  type SpawnUnitCommand,
  type UsePowerCommand,
  type OnlinePower,
  type OnlinePing,
  type OnlineEmoteId,
} from "./NetworkProtocol";

export class NetworkClient extends Events.EventEmitter {
  private static instance: NetworkClient;
  private ws: WebSocket | null = null;
  // Every socket gets a generation. A late close/error from an older socket
  // must never reset the state of a newer matchmaking attempt.
  private socketGeneration = 0;
  public isConnected: boolean = false;
  public roomId: string | null = null;
  public playerId: string | null = null;

  /**
   * Online multiplayer map/camera rule:
   * The map is NEVER mirrored. Both clients share the same world coordinate system.
   * A unit at server x=1200 is rendered at x=1200 on BOTH clients.
   * Only the camera viewport start position differs per player side.
   *
   * - "left"  → Player 1: castle on the LEFT side of the shared map
   *             Camera starts at left edge (scrollX ≈ 0)
   * - "right" → Player 2: castle on the RIGHT side of the shared map
   *             Camera starts at right edge (scrollX ≈ MAP_WIDTH - VIEWPORT_WIDTH)
   */
  public playerSide: "left" | "right" | null = null;

  /** The map ID used by both players in this match — must be identical. */
  public mapId: string | null = null;
  public matchSeed: number | null = null;
  public matchDurationMs: number | null = null;
  public matchStarted = false;
  public latestReadyState: OnlineReadyState | null = null;
  public latencyMs: number | null = null;
  private commandSequence = 0;
  private pingSequence = 0;
  private pingTimer?: number;
  private readonly pendingPings = new Map<number, number>();

  private constructor() {
    super();
  }

  public static getInstance(): NetworkClient {
    if (!NetworkClient.instance) {
      NetworkClient.instance = new NetworkClient();
    }
    return NetworkClient.instance;
  }

  private defaultServerUrl(): string {
    const configuredUrl = import.meta.env.VITE_ONLINE_SERVER_URL?.trim();
    if (configuredUrl) return configuredUrl;

    // The production web bundle and Capacitor Android build run on different
    // origins, so they must connect directly to the public Render WebSocket.
    if (import.meta.env.PROD) {
      return "wss://game-server-qkpa.onrender.com/socket";
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/socket`;
  }

  public connect(url: string = this.defaultServerUrl()): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws && this.isConnected) {
        resolve();
        return;
      }

      const previousSocket = this.ws;
      if (previousSocket) {
        this.ws = null;
        previousSocket.close();
      }
      this.resetSessionState();
      const generation = ++this.socketGeneration;
      const socket = new WebSocket(url);
      this.ws = socket;
      let settled = false;

      socket.onopen = () => {
        if (this.ws !== socket || this.socketGeneration !== generation) {
          socket.close();
          return;
        }
        this.isConnected = true;
        this.sendMessage({ type: ClientMessages.HELLO });
        this.startLatencyProbe();
        this.emit("connected");
        settled = true;
        resolve();
      };

      socket.onmessage = (event) => {
        if (this.ws !== socket || this.socketGeneration !== generation) return;
        try {
          const msg = JSON.parse(event.data) as NetworkMessage;
          this.handleMessage(msg);
        } catch (err) {
          console.error("Failed to parse network message:", err);
        }
      };

      socket.onclose = () => {
        if (this.ws !== socket || this.socketGeneration !== generation) return;
        this.ws = null;
        this.resetSessionState();
        this.emit("disconnected");
        console.log("Disconnected from server");
        if (!settled) reject(new Error("WebSocket closed before connection"));
      };

      socket.onerror = (err) => {
        if (this.ws !== socket || this.socketGeneration !== generation) return;
        console.error("WebSocket Error:", err);
        if (!settled) {
          settled = true;
          reject(err);
        }
      };
    });
  }

  public disconnect() {
    this.socketGeneration += 1;
    const socket = this.ws;
    this.ws = null;
    this.resetSessionState();
    socket?.close();
  }

  private resetSessionState() {
    if (this.pingTimer !== undefined) window.clearInterval(this.pingTimer);
    this.pingTimer = undefined;
    this.pendingPings.clear();
    this.isConnected = false;
    this.roomId = null;
    this.playerId = null;
    this.playerSide = null;
    this.mapId = null;
    this.matchSeed = null;
    this.matchDurationMs = null;
    this.matchStarted = false;
    this.latestReadyState = null;
    this.latencyMs = null;
    this.commandSequence = 0;
  }

  private startLatencyProbe() {
    if (this.pingTimer !== undefined) window.clearInterval(this.pingTimer);
    const probe = () => {
      if (!this.ws || !this.isConnected) return;
      const id = ++this.pingSequence;
      this.pendingPings.set(id, performance.now());
      while (this.pendingPings.size > 3) {
        const oldest = this.pendingPings.keys().next().value as number | undefined;
        if (oldest === undefined) break;
        this.pendingPings.delete(oldest);
      }
      this.sendMessage({ type: ClientMessages.PING, payload: { id } satisfies OnlinePing });
    };
    probe();
    this.pingTimer = window.setInterval(probe, 2_000);
  }

  private handleMessage(msg: NetworkMessage) {
    switch (msg.type) {
      case ServerMessages.CONNECTED:
        this.playerId = msg.payload.playerId;
        break;

      case ServerMessages.MATCH_FOUND:
        this.roomId = msg.payload.roomId;
        // Store side and mapId early (confirmed again via INITIAL_STATE)
        if (msg.payload.side) this.playerSide = msg.payload.side as "left" | "right";
        if (msg.payload.mapId) this.mapId = msg.payload.mapId;
        this.emit("match_found", msg.payload);
        break;

      case ServerMessages.INITIAL_STATE:
        /**
         * INITIAL_STATE is sent individually to each player before GAME_START.
         * It confirms the player's own side and the shared mapId.
         * No coordinate transformation is needed — world coordinates are identical
         * on both clients. The camera viewport position is set based on side only.
         */
        const initialState = msg.payload as InitialOnlineState;
        this.playerSide = initialState.side;
        this.mapId = initialState.mapId;
        this.matchSeed = initialState.seed;
        this.matchDurationMs = initialState.durationMs;
        console.log(
          `[NetworkClient] INITIAL_STATE: side=${this.playerSide} mapId=${this.mapId}`
        );
        this.emit("initial_state", initialState);
        break;

      case ServerMessages.GAME_START:
        // Keep server event names canonical. Runtime listeners subscribe using
        // ServerMessages, so lower-case aliases can otherwise leave a ready
        // client permanently behind the pre-match input gate.
        this.matchStarted = true;
        this.emit(ServerMessages.GAME_START, msg.payload);
        break;

      case ServerMessages.MATCH_READY_STATE:
        this.latestReadyState = msg.payload as OnlineReadyState;
        this.emit(ServerMessages.MATCH_READY_STATE, this.latestReadyState);
        break;

      case ServerMessages.STATE_UPDATE: {
        const events = msg.payload.events;
        for (const e of events) {
          this.emit(e.type, e.payload);
        }
        break;
      }

      case ServerMessages.PONG: {
        const pong = msg.payload as OnlinePing;
        const sentAt = this.pendingPings.get(pong.id);
        if (sentAt === undefined) break;
        this.pendingPings.delete(pong.id);
        const sample = Math.max(0, performance.now() - sentAt);
        this.latencyMs = this.latencyMs === null
          ? sample
          : this.latencyMs * 0.72 + sample * 0.28;
        this.emit("latency", this.latencyMs);
        break;
      }

      default:
        this.emit(msg.type, msg.payload);
    }
  }

  public findMatch() {
    this.sendMessage({ type: ClientMessages.FIND_MATCH });
  }

  public cancelMatch() {
    this.sendMessage({ type: ClientMessages.CANCEL_MATCH });
  }

  public sendReady() {
    this.sendMessage({ type: ClientMessages.READY, payload: { roomId: this.roomId } });
  }

  public spawnUnit(type: string, level: number, x: number, y: number) {
    /**
     * Online multiplayer map/camera rule:
     * x and y are in the SHARED world coordinate space — no flip, no mirror.
     * The server receives these values as-is and broadcasts them to both clients.
     */
    const command: SpawnUnitCommand = {
      commandId: `${this.playerId ?? "pending"}:${++this.commandSequence}`,
      type,
      level,
      x,
      y,
    };
    this.sendMessage({
      type: ClientMessages.SPAWN_UNIT,
      payload: command,
    });
    return command.commandId;
  }

  public requestResync() {
    this.sendMessage({ type: ClientMessages.RESYNC_REQUEST });
  }

  public usePower(power: OnlinePower, x: number, y: number) {
    const command: UsePowerCommand = {
      commandId: `${this.playerId ?? "pending"}:${++this.commandSequence}`,
      power,
      x,
      y,
    };
    this.sendMessage({ type: ClientMessages.USE_ABILITY, payload: command });
    return command.commandId;
  }

  public sendEmote(emote: OnlineEmoteId) {
    this.sendMessage({ type: ClientMessages.SEND_EMOTE, payload: { emote } });
  }

  private sendMessage(msg: NetworkMessage) {
    if (this.ws && this.isConnected) {
      this.ws.send(JSON.stringify(msg));
    }
  }
}
