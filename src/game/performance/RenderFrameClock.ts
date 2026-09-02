/** Time between executed game steps, never Phaser's limiter remainder. */
export class RenderFrameClock {
  private previous: number | undefined;
  private sampleMs = 0;
  private sampleFrames = 0;
  fps = 0;

  reset() {
    this.previous = undefined;
    this.sampleMs = 0;
    this.sampleFrames = 0;
    this.fps = 0;
  }

  step(now: number): number {
    const delta = this.previous === undefined ? 0 : Math.max(0, now - this.previous);
    this.previous = now;
    if (delta > 0) {
      this.sampleMs += delta;
      this.sampleFrames++;
      if (this.sampleMs >= 500) {
        this.fps = 1000 * this.sampleFrames / this.sampleMs;
        this.sampleFrames = 0;
        this.sampleMs = 0;
      }
    }
    return delta;
  }
}

const clocks = new WeakMap<object, RenderFrameClock>();

export class RenderFrameLimiter {
  private next = 0;
  reset() { this.next = 0; }
  due(now: number): boolean {
    // Sub-millisecond rAF jitter at 60 Hz must not skip a whole frame.
    if (now + 0.5 < this.next) return false;
    const period = 1000 / 60;
    this.next = this.next === 0 ? now + period
      : this.next + Math.max(1, Math.floor((now - this.next) / period) + 1) * period;
    return true;
  }
}

export function installRenderFrameClock(game: {
  step(time: number, delta: number): void;
  events: { on(event: string, callback: () => void): unknown };
}) {
  if (clocks.has(game)) return;
  const clock = new RenderFrameClock();
  const limiter = new RenderFrameLimiter();
  clocks.set(game, clock);
  const step = game.step.bind(game);
  // Installed in postBoot, before Phaser binds Game.step to TimeStep.callback.
  // Fix the delta for all consumers (animations, timers, tweens and scenes).
  game.step = (time: number) => {
    if (limiter.due(time)) step(time, clock.step(time));
  };
  for (const event of ['hidden', 'visible', 'pause', 'resume']) {
    game.events.on(event, () => { clock.reset(); limiter.reset(); });
  }
}

export const renderedFps = (game: object): number => clocks.get(game)?.fps ?? 0;
