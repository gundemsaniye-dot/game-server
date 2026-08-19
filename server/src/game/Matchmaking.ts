import { Player } from "../state/Player";
import { GameRoom } from "./GameRoom";
import { GameLoop } from "./GameLoop";
import { Logger } from "../utils/Logger";
import { ClientMessages, ServerMessages, NetworkMessage } from "../network/NetworkProtocol";
import { getRandomOnlineMapContract } from "./OnlineMapContract";

export class Matchmaking {
  private queue: Player[] = [];
  private roomCounter: number = 0;
  
  constructor(private gameLoop: GameLoop) {}

  addToQueue(player: Player) {
    if (player.roomId || player.isQueued || this.queue.includes(player)) {
      Logger.info(`Player ${player.id} ignored duplicate matchmaking request.`);
      return;
    }
    player.isQueued = true;
    this.queue.push(player);
    {
      Logger.info(`Player ${player.id} joined matchmaking. Queue size: ${this.queue.length}`);
      this.tryMatch();
    }
  }

  removeFromQueue(player: Player) {
    const index = this.queue.indexOf(player);
    if (index !== -1) {
      this.queue.splice(index, 1);
      Logger.info(`Player ${player.id} left matchmaking. Queue size: ${this.queue.length}`);
    }
    player.isQueued = false;
  }

  private tryMatch() {
    while (this.queue.length >= 2) {
      const p1 = this.queue.shift()!;
      const p2 = this.queue.shift()!;
      p1.isQueued = false;
      p2.isQueued = false;

      const roomId = `room_${++this.roomCounter}`;

      /**
       * Online multiplayer map/camera rule:
       * - p1 (Player 1) = LEFT side  → castle on the LEFT of the shared map (deployZone)
       * - p2 (Player 2) = RIGHT side → castle on the RIGHT of the shared map (enemySpawnZone)
       * The map is NEVER mirrored. Both clients share the same world coordinate system.
       * A unit at server x=1200 is rendered at x=1200 on BOTH clients.
       * Only the camera viewport starting position differs per player.
       */
      const contract = getRandomOnlineMapContract();
      const mapId = contract.mapId;
      p1.side = "left";
      p1.mapId = mapId;
      p1.roomId = roomId;
      p2.side = "right";
      p2.mapId = mapId;
      p2.roomId = roomId;

      const seed = this.createMatchSeed(roomId);
      const room = new GameRoom(roomId, p1, p2, seed, contract);
      
      this.gameLoop.addRoom(room);
      
      p1.ws.send(JSON.stringify({
        type: ServerMessages.MATCH_FOUND,
        payload: { roomId, side: "left", mapId }
      }));
      
      p2.ws.send(JSON.stringify({
        type: ServerMessages.MATCH_FOUND,
        payload: { roomId, side: "right", mapId }
      }));

      room.start();
    }
  }

  private createMatchSeed(roomId: string) {
    let hash = Date.now() >>> 0;
    for (let index = 0; index < roomId.length; index += 1) {
      hash = Math.imul(hash ^ roomId.charCodeAt(index), 16_777_619) >>> 0;
    }
    return hash || 1;
  }
}
