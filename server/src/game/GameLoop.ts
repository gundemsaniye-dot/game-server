import { GameRoom } from "./GameRoom";
import { Logger } from "../utils/Logger";

export class GameLoop {
  private rooms: Map<string, GameRoom> = new Map();
  private tickRate: number;
  private intervalId: NodeJS.Timeout | null = null;
  private lastTickTime: number = 0;

  constructor(tickRate: number = 20) {
    this.tickRate = tickRate;
  }

  addRoom(room: GameRoom) {
    this.rooms.set(room.id, room);
  }

  removeRoom(roomId: string) {
    this.rooms.delete(roomId);
  }

  getRoom(roomId: string): GameRoom | undefined {
    return this.rooms.get(roomId);
  }

  start() {
    if (this.intervalId) return;

    const tickMs = 1000 / this.tickRate;
    this.lastTickTime = Date.now();

    this.intervalId = setInterval(() => {
      const now = Date.now();
      const deltaMs = now - this.lastTickTime;
      this.lastTickTime = now;

      this.tick(deltaMs);
    }, tickMs);
    
    Logger.info(`GameLoop started at ${this.tickRate} Hz`);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private tick(deltaMs: number) {
    for (const room of this.rooms.values()) {
      try {
        room.tick(deltaMs);
        if (room.isFinished) this.rooms.delete(room.id);
      } catch (err) {
        Logger.error(`Error in room ${room.id} tick:`, err);
      }
    }
  }
}
