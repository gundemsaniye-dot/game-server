export interface AndroidPerfCounters {
  unitCount: number;
  textureCount: number;
  simulationMs: number;
  unitUpdateMs: number;
  simulationSteps: number;
  astarCalls: number;
  astarMs: number;
  astarCacheHits: number;
  targetScans: number;
  targetScanMs: number;
}

export interface AndroidPerfResult {
  schema: 1;
  status: "running" | "complete";
  elapsedMs: number;
  stage: "baseline" | "12-per-team" | "24-per-team" | "30-per-team";
  fps: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  over20: number;
  over34: number;
  over50: number;
  frameCount: number;
  longTaskCount: number;
  longTaskMs: number;
  jsHeapMb: number | null;
  drawCalls: number;
  drawCallsPerFrame: number;
  counters: AndroidPerfCounters;
}

declare global {
  interface Window {
    __CASTLE_ANDROID_PERF__?: AndroidPerfResult;
    CastlePerfNative?: { log(line: string): void };
  }
}

const MAX_FRAMES = 45_000;

type DrawCallState = {
  increment?: () => void;
  wrappedMethods: Set<string>;
};

// Phaser keeps one WebGL context while scenes are restarted. Install each GL
// wrapper only once and point it at the currently active battle monitor. The
// previous implementation wrapped an already wrapped function on every battle,
// retaining every old Game scene and multiplying the profiling overhead.
const drawCallStates = new WeakMap<object, DrawCallState>();

export class AndroidPerformanceMonitor {
  private readonly frames = new Float32Array(MAX_FRAMES);
  private frameCount = 0;
  private over20 = 0;
  private over34 = 0;
  private over50 = 0;
  private maxMs = 0;
  private lastSummaryAt = 0;
  private lastSummaryFrame = 0;
  private longTaskCount = 0;
  private longTaskMs = 0;
  private drawCalls = 0;
  private lastFrameAt = 0;
  private observer?: PerformanceObserver;
  private drawCallState?: DrawCallState;
  private drawCallIncrement?: () => void;
  private disposed = false;

  constructor(private readonly counters: () => AndroidPerfCounters) {
    try {
      this.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.longTaskCount += 1;
          this.longTaskMs += entry.duration;
        }
      });
      this.observer.observe({ entryTypes: ["longtask"] });
    } catch {
      this.observer = undefined;
    }
  }

  installDrawCallCounter(gl?: WebGLRenderingContext | WebGL2RenderingContext) {
    if (!gl) return;
    let state = drawCallStates.get(gl);
    if (!state) {
      state = { wrappedMethods: new Set<string>() };
      drawCallStates.set(gl, state);
    }

    const increment = () => {
      if (!this.disposed) this.drawCalls += 1;
    };
    this.drawCallState = state;
    this.drawCallIncrement = increment;
    state.increment = increment;

    const target = gl as WebGLRenderingContext & Record<string, unknown>;
    for (const name of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced"]) {
      if (state.wrappedMethods.has(name)) continue;
      const original = target[name];
      if (typeof original !== "function") continue;
      target[name] = ((...args: unknown[]) => {
        state?.increment?.();
        return (original as (...callArgs: unknown[]) => unknown).apply(gl, args);
      }) as never;
      state.wrappedMethods.add(name);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.observer?.disconnect();
    this.observer = undefined;
    const drawCallState = this.drawCallState;
    if (drawCallState && this.drawCallIncrement && drawCallState.increment === this.drawCallIncrement) {
      drawCallState.increment = undefined;
    }
    this.drawCallState = undefined;
    this.drawCallIncrement = undefined;
  }

  recordFrame(_smoothedDeltaMs: number, elapsedMs: number) {
    if (this.disposed) return;
    const now = performance.now();
    if (this.lastFrameAt === 0) {
      this.lastFrameAt = now;
      // Briefing/pause screens render before battle simulation starts. Keep
      // those draw calls out of the per-frame battle result.
      this.drawCalls = 0;
      return;
    }
    const deltaMs = now - this.lastFrameAt;
    this.lastFrameAt = now;
    const index = Math.min(this.frameCount, MAX_FRAMES - 1);
    this.frames[index] = deltaMs;
    this.frameCount += 1;
    this.maxMs = Math.max(this.maxMs, deltaMs);
    if (deltaMs > 20) this.over20 += 1;
    if (deltaMs > 34) this.over34 += 1;
    if (deltaMs > 50) this.over50 += 1;
    if (elapsedMs - this.lastSummaryAt >= 10_000) {
      this.lastSummaryAt = elapsedMs;
      this.publish(elapsedMs, false);
    }
  }

  publish(elapsedMs: number, complete: boolean) {
    const result = this.snapshot(elapsedMs, complete, complete ? 0 : this.lastSummaryFrame);
    if (!complete) this.lastSummaryFrame = Math.min(this.frameCount, MAX_FRAMES);
    window.__CASTLE_ANDROID_PERF__ = result;
    const line = `[CastlePerf][${complete ? "RESULT" : "SNAPSHOT"}] ${JSON.stringify(result)}`;
    console.log(line);
    window.CastlePerfNative?.log(line);
    if (complete) this.observer?.disconnect();
    return result;
  }

  private snapshot(elapsedMs: number, complete: boolean, startFrame: number): AndroidPerfResult {
    const count = Math.min(this.frameCount, MAX_FRAMES);
    const sorted = Array.from(this.frames.subarray(Math.min(startFrame, count), count)).sort((a, b) => a - b);
    const percentile = (ratio: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ?? 0;
    const memory = performance as Performance & { memory?: { usedJSHeapSize: number } };
    return {
      schema: 1,
      status: complete ? "complete" : "running",
      elapsedMs: Math.round(elapsedMs),
      stage: elapsedMs < 30_000 ? "baseline" : elapsedMs < 120_000 ? "12-per-team" : elapsedMs < 240_000 ? "24-per-team" : "30-per-team",
      fps: Math.round((1000 / Math.max(0.01, percentile(0.5))) * 10) / 10,
      p50Ms: round2(percentile(0.5)),
      p95Ms: round2(percentile(0.95)),
      p99Ms: round2(percentile(0.99)),
      maxMs: round2(this.maxMs),
      over20: this.over20,
      over34: this.over34,
      over50: this.over50,
      frameCount: this.frameCount,
      longTaskCount: this.longTaskCount,
      longTaskMs: round2(this.longTaskMs),
      jsHeapMb: memory.memory ? round2(memory.memory.usedJSHeapSize / 1_048_576) : null,
      drawCalls: this.drawCalls,
      drawCallsPerFrame: round2(this.drawCalls / Math.max(1, this.frameCount)),
      counters: this.counters(),
    };
  }
}

const round2 = (value: number) => Math.round(value * 100) / 100;
