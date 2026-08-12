export class Player {
  public id: string;
  public ws: any; // uWS.WebSocket
  public roomId: string | null = null;
  public isReady: boolean = false;

  /**
   * Online multiplayer map/camera rule:
   * - "left"  → Player 1: castle on LEFT side of the shared map (map.deployZone)
   * - "right" → Player 2: castle on RIGHT side of the shared map (map.enemySpawnZone)
   * The map is NEVER mirrored. Both clients use the same world coordinate system.
   * Server x=1200 means x=1200 on BOTH clients. Only the camera viewport differs.
   */
  public side: "left" | "right" = "left";

  /** The map being played — must be identical for both clients in a room. */
  public mapId: string = "grasslands_01";

  // Game state
  public hp: number = 100;
  public gold: number = 8;

  constructor(id: string, ws: any) {
    this.id = id;
    this.ws = ws;
  }
}
