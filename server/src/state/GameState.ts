import { Player } from "./Player";
import { Unit } from "./Unit";

export class GameState {
  public roomId: string;
  public players: Map<string, Player> = new Map();
  public units: Map<number, Unit> = new Map();
  
  public startTime: number = 0;
  private nextUnitId: number = 1;

  constructor(roomId: string) {
    this.roomId = roomId;
  }

  addPlayer(player: Player) {
    this.players.set(player.id, player);
    player.roomId = this.roomId;
  }

  removePlayer(playerId: string) {
    this.players.delete(playerId);
  }

  spawnUnit(ownerId: string, type: string, level: number, x: number, y: number): Unit {
    const unit = new Unit(this.nextUnitId++, ownerId, type, level, x, y);
    this.units.set(unit.id, unit);
    return unit;
  }
}
