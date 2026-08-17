import { App, type WebSocket } from "uWebSockets.js";
import { Player } from "../state/Player";
import { Matchmaking } from "../game/Matchmaking";
import { GameLoop } from "../game/GameLoop";
import { Logger } from "../utils/Logger";
import { ClientMessages, NetworkMessage, ServerMessages, type OnlinePing } from "../network/NetworkProtocol";

export class ConnectionManager {
  private players: Map<string, Player> = new Map();
  private connectionCounter: number = 0;
  
  constructor(private matchmaking: Matchmaking, private gameLoop: GameLoop) {}

  setup(app: ReturnType<typeof App>) {
    app.ws("/*", {
      compression: 0,
      maxPayloadLength: 16 * 1024 * 1024,
      idleTimeout: 30, // 30 seconds to drop dead connections
      
      open: (ws) => {
        const socket = ws as WebSocket<unknown> & { id: string };
        const playerId = `player_${++this.connectionCounter}`;
        socket.id = playerId;
        
        const player = new Player(playerId, ws);
        this.players.set(playerId, player);
        
        Logger.info(`Client connected: ${playerId}`);
        
        const msg: NetworkMessage = {
          type: ServerMessages.CONNECTED,
          payload: { playerId }
        };
        ws.send(JSON.stringify(msg));
      },
      
      message: (ws, message, isBinary) => {
        void isBinary;
        const playerId = (ws as WebSocket<unknown> & { id: string }).id;
        const player = this.players.get(playerId);
        if (!player) return;

        try {
          // Log received bytes
          Logger.logNetworkIn(message.byteLength);

          // For prototype, we expect JSON string
          const strMsg = Buffer.from(message).toString('utf8');
          const parsed: NetworkMessage = JSON.parse(strMsg);
          
          this.handleMessage(player, parsed);
        } catch (err) {
          Logger.error(`Failed to parse message from ${playerId}`, err);
        }
      },
      
      close: (ws, code, message) => {
        void code;
        void message;
        const playerId = (ws as WebSocket<unknown> & { id: string }).id;
        const player = this.players.get(playerId);
        if (player) {
          Logger.info(`Client disconnected: ${playerId}`);
          this.matchmaking.removeFromQueue(player);
          if (player.roomId) {
            player.ws = null;
            this.gameLoop.getRoom(player.roomId)?.handleDisconnect(playerId);
          }
          this.players.delete(playerId);
        }
      }
    });
  }

  private handleMessage(player: Player, msg: NetworkMessage) {
    switch (msg.type) {
      case ClientMessages.HELLO:
        // Auth or just hello
        break;
      case ClientMessages.FIND_MATCH:
        this.matchmaking.addToQueue(player);
        break;
      case ClientMessages.CANCEL_MATCH:
        // Cancellation is explicit and synchronous. The client sends this
        // before closing its socket, so a rapid re-search cannot reuse the
        // previous queue entry.
        this.matchmaking.removeFromQueue(player);
        break;
      case ClientMessages.PING:
        this.send(player, {
          type: ServerMessages.PONG,
          payload: msg.payload as OnlinePing,
        });
        break;
      default:
        // Forward game commands to the room if player is in one
        if (player.roomId) {
          const room = this.gameLoop.getRoom(player.roomId);
          if (room) {
            room.handleClientMessage(player, msg);
          }
        }
        break;
    }
  }

  private send(player: Player, msg: NetworkMessage) {
    if (!player.ws || player.ws.getBufferedAmount() >= 64 * 1_024) return;
    const serialized = JSON.stringify(msg);
    player.ws.send(serialized);
    Logger.logNetworkOut(Buffer.byteLength(serialized, "utf8"));
  }
}
