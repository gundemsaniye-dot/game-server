export class Unit {
  public id: number;
  public ownerId: string;
  public type: string;
  public level: number;
  
  public x: number;
  public y: number;
  
  public targetX: number | null = null;
  public targetY: number | null = null;
  public speed: number = 50; // units per second
  
  public hp: number = 100;
  public maxHp: number = 100;
  public attackDamage: number = 10;
  public attackRange: number = 1.5;
  public attackCooldown: number = 1.0; // seconds
  public lastAttackTime: number = 0;
  
  public state: "idle" | "moving" | "attacking" | "gathering" | "dead" = "idle";
  public targetUnitId: string | number | null = null; // Can be a Unit ID (number) or Player/Castle ID (string)

  // Track if this unit changed since last tick
  public dirty: boolean = true;

  constructor(id: number, ownerId: string, type: string, level: number, x: number, y: number) {
    this.id = id;
    this.ownerId = ownerId;
    this.type = type;
    this.level = level;
    this.x = x;
    this.y = y;
  }
}
