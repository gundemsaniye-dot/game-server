import { GameObjects, type Scene } from 'phaser';

// Fixed keys, shared by both panels and every battle. Never allocate per-match
// decoration textures. Keep dynamic cards/selection overlays as game objects.
function cached(scene: Scene, key: string, width: number, height: number,
  paint: (ctx: CanvasRenderingContext2D) => void): string {
  if (scene.textures.exists(key)) return key;
  const texture = scene.textures.createCanvas(key, width, height);
  if (!texture) throw new Error(`Cannot create HUD texture: ${key}`);
  paint(texture.context);
  texture.refresh();
  return key;
}

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  fill: string, stroke?: string, lineWidth = 1) {
  ctx.fillStyle = fill;
  ctx.fillRect(x - w / 2, y - h / 2, w, h);
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.strokeRect(x - w / 2, y - h / 2, w, h);
  }
}

function nail(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number,
  fill: string, stroke: string) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.stroke();
}

export function woodPanelTexture(scene: Scene): string {
  return cached(scene, 'hud-wood-panel-v1', 108, 720, ctx => {
    rect(ctx, 54, 360, 104, 710, '#5b3822b8', '#7a5637b8', 2);
    [-44, -31, -17, -3, 12, 27, 42].forEach((offset, index) => {
      ctx.save();
      ctx.translate(54 + offset, 360);
      ctx.rotate((index % 2 === 0 ? -1 : 1) * 0.003);
      rect(ctx, 0, 0, index % 3 === 0 ? 3 : 2, 706,
        index % 2 === 0 ? '#2f1b1157' : '#8a5b362e');
      ctx.restore();
    });
    [68, 174, 280, 386, 492, 704].forEach((y, index) => {
      rect(ctx, 54, y, 104, index === 5 ? 3 : 2, '#24150d85');
      rect(ctx, 54, y + 2, 102, 1, '#a4774a2e');
    });
    for (const y of [76, 354, 696]) {
      for (const offset of [-48, 48]) nail(ctx, 54 + offset, y, 3, '#30251e', '#8c7963');
    }
  });
}

export function cardDecorationTexture(scene: Scene, side: 'left' | 'right', compact: boolean): string {
  const size = compact ? 42 : 66;
  return cached(scene, `hud-card-${side}-${compact ? 'compact' : 'normal'}-v1`, size, size, ctx => {
    const inset = size - (compact ? 7 : 9);
    rect(ctx, size / 2, size / 2, inset, inset, '#cab58629', side === 'left' ? '#557f7885' : '#79505285');
    const offset = size / 2 - (compact ? 4 : 6);
    for (const x of [-1, 1]) for (const y of [-1, 1]) {
      nail(ctx, size / 2 + x * offset, size / 2 + y * offset, compact ? 1.5 : 2, '#4f4234', '#9a8568b8');
    }
  });
}

export function sideBadgeTexture(scene: Scene, side: 'left' | 'right'): string {
  return cached(scene, `hud-badge-${side}-v1`, 82, 29, ctx => {
    rect(ctx, 41, 14.5, 78, 25, side === 'left' ? '#1978bdfa' : '#b42d35fa', '#ffd86af5', 3);
  });
}

const cssColor = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

/** Container keeps original logical size/hit area; the child includes stroke padding. */
export class HudPlate extends GameObjects.Container {
  private plate: GameObjects.Image;
  constructor(scene: Scene, x: number, y: number, width: number, height: number,
    private fill: number, private lineWidth: number, private lineColor: number) {
    super(scene, x, y);
    this.setSize(width, height);
    this.plate = new GameObjects.Image(scene, 0, 0, this.textureKey());
    this.add(this.plate);
    scene.add.existing(this);
  }
  private textureKey() {
    // Only the fixed HUD palette calls this, never an interpolated/tween color.
    const padding = 8;
    const w = this.width, h = this.height;
    return cached(this.scene, `hud-plate-${w}-${h}-${this.fill}-${this.lineWidth}-${this.lineColor}`,
      w + padding, h + padding, ctx => rect(ctx, (w + padding) / 2, (h + padding) / 2,
        w, h, cssColor(this.fill), cssColor(this.lineColor), this.lineWidth));
  }
  setFillStyle(color: number) {
    if (color !== this.fill) { this.fill = color; this.plate.setTexture(this.textureKey()); }
    return this;
  }
  setStrokeStyle(width: number, color: number) {
    if (width !== this.lineWidth || color !== this.lineColor) {
      this.lineWidth = width; this.lineColor = color; this.plate.setTexture(this.textureKey());
    }
    return this;
  }
}

export function hudCoin(scene: Scene, x: number, y: number, radius: number, lineWidth: number) {
  const size = radius * 2 + lineWidth * 2;
  const key = cached(scene, `hud-coin-${radius}-${lineWidth}`, size, size, ctx => {
    ctx.beginPath(); ctx.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#d9aa35'; ctx.fill();
    ctx.lineWidth = lineWidth; ctx.strokeStyle = '#765018'; ctx.stroke();
  });
  return scene.add.image(x, y, key);
}
