import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AndroidPerformanceMonitor } from '../src/game/performance/AndroidPerformanceMonitor';
import { releaseBattleRuntimeMemory } from '../src/game/assets/RuntimeAssets';

test('battle cleanup removes interrupted one-shot sound instances, retains reusable battle buffers', () => {
  const stopped: string[] = [], removed: string[] = [], evicted: string[] = [];
  const scene = { sound: { stopByKey: (k: string) => stopped.push(k), removeByKey: (k: string) => removed.push(k) },
    cache: {audio:{remove:(k: string) => evicted.push(k)}} };
  releaseBattleRuntimeMemory(scene as any);
  assert.deepEqual(removed, stopped);
  assert.ok(removed.includes('sword-hit-2'));
  assert.ok(removed.includes('battle-music'));
  assert.ok(!evicted.includes('battle-music'));
  assert.equal(new Set(removed).size, removed.length);
});

test('FPS is frames / elapsed, wraps safely past 45k frames, and handles pauses', () => {
  let now = 100;
  const originalPerformance = globalThis.performance;
  const originalWindow = (globalThis as any).window;
  const originalLog = console.log;
  Object.defineProperty(globalThis, 'performance', {configurable:true,value:{now:()=>now}});
  (globalThis as any).window = {};
  console.log = () => {};
  try {
    const monitor = new AndroidPerformanceMonitor(() => ({unitCount:0,textureCount:0,simulationMs:0,
      unitUpdateMs:0,simulationSteps:0,astarCalls:0,astarMs:0,astarCacheHits:0,targetScans:0,targetScanMs:0}));
    monitor.recordFrame(123, 0);
    // Alternating 90-Hz frame intervals average 60 FPS, not 45/90 median FPS.
    for(let i=0;i<48000;i++) {
      now += i % 2 === 0 ? 1000/90 : 2000/90;
      monitor.recordFrame(123, 0);
    }
    const all = monitor.publish(800000, true);
    assert.equal(all.fps, 60);
    assert.equal(all.sampleFrameCount, 48000);
    assert.equal(all.percentileFrameCount, 45000);
    assert.equal(all.stage, 'live');
    monitor.publish(800000, false);
    monitor.pause(); now += 50000; monitor.recordFrame(123,0);
    for(let i=0;i<600;i++) { now += 1000/60; monitor.recordFrame(123,0); }
    const window = monitor.publish(810000, false);
    assert.equal(window.fps,60);
    assert.equal(window.sampleFrameCount,600);
    assert.ok(Math.abs(window.sampleMs-10000)<0.01);
    monitor.dispose();
  } finally {
    Object.defineProperty(globalThis, 'performance', {configurable:true,value:originalPerformance});
    (globalThis as any).window = originalWindow;
    console.log = originalLog;
  }
});
