import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RenderFrameClock, RenderFrameLimiter, installRenderFrameClock, renderedFps } from '../src/game/performance/RenderFrameClock.ts';

for (const hz of [60, 90, 120, 130, 144]) {
  test(`60 FPS limiter at ${hz} Hz: actual elapsed time, no animation acceleration`, () => {
    const clock = new RenderFrameClock();
    const limiter = new RenderFrameLimiter();
    let first, last, total = 0, frames = 0;
    // Jittered rAF timestamps exercise fractional refresh rates and boundaries.
    for (let i = 1; i <= hz * 60; i++) {
      const now = i * 1000 / hz + Math.sin(i) * 0.03;
      if (limiter.due(now)) {
        total += clock.step(now);
        first ??= now;
        last = now;
        frames++;
      }
    }
    assert.ok(Math.abs(total - (last - first)) < 1e-6);
    assert.ok(Math.abs(frames / 60 - 60) < 0.1);
    assert.ok(Math.abs(clock.fps - 60) < 2);
  });
}

test('reset excludes background time and clears stale FPS', () => {
  const clock = new RenderFrameClock();
  clock.step(100);
  assert.equal(clock.step(120), 20);
  clock.reset();
  assert.equal(clock.step(120000), 0);
  assert.equal(clock.step(120020), 20);
});

test('game wrapper fixes every step consumer, is idempotent and resets on resume', () => {
  const deltas = [], events = new Map();
  const game = { step: (time, delta) => deltas.push(delta), events: { on: (name, fn) => events.set(name, fn) } };
  installRenderFrameClock(game);
  const installed = game.step;
  installRenderFrameClock(game);
  assert.equal(game.step, installed);
  game.step(0, 25);
  for (let i = 1; i <= 60; i++) game.step(i * 1000 / 60, 25);
  assert.ok(Math.abs(deltas.reduce((sum, n) => sum + n, 0) - 1000) < 1e-6);
  assert.ok(Math.abs(renderedFps(game) - 60) < 1e-6);
  events.get('resume')();
  game.step(100000, 5000);
  assert.equal(deltas.at(-1), 0);
});
