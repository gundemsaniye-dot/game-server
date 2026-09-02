import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { initializeGameAudio, playSceneMusic, stopSceneMusic } from '../src/game/audio/GameAudio';
import { initializeSoundPreferences, isSoundMuted, setSoundMuted, SOUND_PREFERENCE_KEY } from '../src/game/audio/SoundPreferences';

let stored = 'true', reads = 0, writes = 0, failStorage = false;
(globalThis as any).window = { localStorage: {
  getItem(key: string) { assert.equal(key, SOUND_PREFERENCE_KEY); reads++; if (failStorage) throw Error('blocked'); return stored; },
  setItem(key: string, value: string) { assert.equal(key, SOUND_PREFERENCE_KEY); writes++; if (failStorage) throw Error('blocked'); stored = value; },
} };

class Manager extends EventEmitter {
  muted = false; locked = false; pauseOnBlur = true; allocations = 0; unlocks = 0; resumes = 0;
  sounds: any[] = [];
  context: any = { state: 'running', resume: async () => {} };
  get mute() { return this.muted; }
  set mute(value: boolean) { this.muted = value; this.emit('mute', this, value); }
  add(key: string, config: any = {}) {
    this.allocations++;
    const sound = {key, volume: config.volume, isPlaying: false, play() { this.isPlaying = true; return true; },
      stop() { this.isPlaying = false; }, destroy() { this.isPlaying = false; }};
    this.sounds.push(sound); return sound;
  }
  play(key: string, config?: any) { return this.add(key, config).play(); }
  get(key: string) { return this.sounds.find(s => s.key === key); }
  stopByKey(key: string) { this.sounds.filter(s => s.key === key).forEach(s => s.stop()); }
  removeByKey(key: string) { this.sounds = this.sounds.filter(s => s.key !== key); }
  stopAll() { this.sounds.forEach(s => s.stop()); }
  removeAll() { this.sounds = []; }
  unlock() { this.unlocks++; }
  resumeAll() { this.resumes++; }
}
function scene(sound: Manager) {
  const timers: any[] = [], fades: any[] = [];
  return { sound, events: new EventEmitter(), timers, fades,
    tweens: {killTweensOf() {}, add(config: any) {
      const tween = {config, removed: false, remove() { this.removed = true; }};
      fades.push(tween); return tween;
    }},
    time: {delayedCall(_ms: number, callback: () => void) {
      const timer = {callback, removed: false, remove() { this.removed = true; }};
      timers.push(timer); return timer;
    }},
  } as any;
}
function fixture() {
  const manager = new Manager(); initializeGameAudio(manager as any); setSoundMuted(manager as any, false);
  return {manager, menu: scene(manager)};
}

test('cold boot honors stored OFF before splash, music or effects; does not allocate muted sounds', () => {
  const manager = new Manager(); initializeGameAudio(manager as any);
  assert.equal(manager.mute, true); assert.equal(reads, 1);
  const menu = scene(manager); playSceneMusic(menu, 'lobby-music', 0.4);
  for (let i = 0; i < 1000; i++) assert.equal(manager.play('select-sfx'), false);
  assert.equal(manager.allocations, 0); assert.equal(menu.timers.length, 0);
  assert.equal(manager.unlocks, 0); assert.equal(reads, 1);
});

test('mute cancels playing music, effects, fade and verification; unmute restores only current music', () => {
  const {manager, menu} = fixture();
  playSceneMusic(menu, 'lobby-music', 0.4, undefined, {fadeInMs: 500});
  manager.play('select-sfx'); assert.equal(manager.sounds.length, 2);
  assert.equal(menu.fades[0].config.targets.key, 'lobby-music');
  assert.equal(menu.fades[0].config.onUpdate, undefined);
  setSoundMuted(manager as any, true);
  assert.equal(manager.sounds.length, 0); assert.ok(menu.fades[0].removed); assert.ok(menu.timers[0].removed);
  menu.timers[0].callback(); assert.equal(manager.allocations, 2);
  setSoundMuted(manager as any, false);
  assert.deepEqual(manager.sounds.map(s => s.key), ['lobby-music']);
});

test('OFF survives menu → offline → menu → online and unlock/focus attempts without allocation', () => {
  const {manager, menu} = fixture(); setSoundMuted(manager as any, true);
  const readsBefore = reads;
  playSceneMusic(menu, 'lobby-music', 0.4);
  for (const key of ['battle-music', 'lobby-music', 'battle-music'] as const) {
    menu.events.emit('shutdown');
    const next = scene(manager); playSceneMusic(next, key, 0.4);
    manager.emit('unlocked'); manager.resumeAll();
    initializeSoundPreferences(manager as any);
    assert.equal(manager.mute, true); assert.equal(manager.play('hit-sfx'), false);
    next.events.emit('shutdown');
  }
  assert.equal(manager.allocations, 0); assert.equal(reads, readsBefore);
  assert.equal(manager.listenerCount('mute'), 2);
});

test('blocked storage never turns session mute back on, including a new renderer', () => {
  const {manager} = fixture(); failStorage = true;
  try {
    setSoundMuted(manager as any, true);
    initializeSoundPreferences(manager as any); assert.equal(manager.mute, true);
    const replacement = new Manager(); initializeGameAudio(replacement as any);
    assert.equal(replacement.mute, true); assert.equal(replacement.play('select-sfx'), false);
  } finally { failStorage = false; }
});

test('muting cancels a pending browser unlock and resumes music only after explicit ON', () => {
  const {manager, menu} = fixture(); manager.locked = true;
  playSceneMusic(menu, 'lobby-music', 0.4);
  assert.equal(manager.listenerCount('unlocked'), 1);
  setSoundMuted(manager as any, true); manager.locked = false; manager.emit('unlocked');
  assert.equal(manager.listenerCount('unlocked'), 0); assert.equal(manager.allocations, 0);
  setSoundMuted(manager as any, false); assert.equal(manager.allocations, 1);
});

test('in-flight context resume cannot restart muted music', async () => {
  const {manager, menu} = fixture(); let resume!: () => void;
  manager.context = {state: 'suspended', resume: () => new Promise<void>(resolve => {resume = resolve;})};
  playSceneMusic(menu, 'lobby-music', 0.4); setSoundMuted(manager as any, true);
  manager.context.state = 'running'; resume(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(manager.allocations, 0); assert.equal(manager.resumes, 0);
});

test('stale resume, retry and unlock work cannot resurrect a previous scene', async () => {
  const {manager, menu} = fixture(); let resume!: () => void;
  manager.context = {state: 'suspended', resume: () => new Promise<void>(resolve => {resume = resolve;})};
  playSceneMusic(menu, 'lobby-music', 0.4); menu.events.emit('shutdown');
  manager.context.state = 'running'; playSceneMusic(scene(manager), 'battle-music', 0.3);
  resume(); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(manager.sounds.map(s => s.key), ['battle-music']); assert.equal(manager.resumes, 0);
});

test('repeated toggles keep one listener/request and no muted timers, sounds or fade updates', () => {
  const {manager, menu} = fixture(); playSceneMusic(menu, 'lobby-music', 0.4);
  const readsBefore = reads;
  for (let i = 0; i < 100; i++) {
    setSoundMuted(manager as any, true); assert.equal(manager.sounds.length, 0);
    setSoundMuted(manager as any, false); assert.equal(manager.sounds.length, 1);
  }
  assert.equal(reads, readsBefore); assert.equal(manager.listenerCount('mute'), 2);
  assert.equal(menu.events.listenerCount('shutdown'), 1); assert.equal(menu.events.listenerCount('destroy'), 1);
  stopSceneMusic(menu, 'lobby-music');
  setSoundMuted(manager as any, true); setSoundMuted(manager as any, false);
  assert.equal(manager.sounds.length, 0); assert.equal(menu.events.listenerCount('shutdown'), 0);
  assert.ok(writes > 0);
});

test('native AudioParam getter lag cannot undo OFF or prevent explicit ON', () => {
  const manager = new Manager();
  // Model the real WebView: native gain still reads ON inside the mute event.
  Object.defineProperty(manager, 'mute', {
    get: () => false,
    set: value => manager.emit('mute', manager, value),
  });
  initializeGameAudio(manager as any); setSoundMuted(manager as any, false);
  const menu = scene(manager); playSceneMusic(menu, 'lobby-music', 0.4);
  setSoundMuted(manager as any, true);
  assert.equal(isSoundMuted(manager as any), true);
  assert.equal(manager.play('select-sfx'), false); assert.equal(manager.sounds.length, 0);
  playSceneMusic(scene(manager), 'battle-music', 0.3);
  assert.equal(manager.sounds.length, 0);
  setSoundMuted(manager as any, !isSoundMuted(manager as any));
  assert.equal(isSoundMuted(manager as any), false);
  assert.deepEqual(manager.sounds.map(s => s.key), ['battle-music']);
});

test('mute events synchronize the intrinsic native master gain even while its audio graph is idle', () => {
  const manager = new Manager() as Manager & {masterMuteNode: {gain: {value: number}}};
  manager.masterMuteNode = {gain: {value: 1}};
  initializeGameAudio(manager as any);
  setSoundMuted(manager as any, true); assert.equal(manager.masterMuteNode.gain.value, 0);
  setSoundMuted(manager as any, false); assert.equal(manager.masterMuteNode.gain.value, 1);
});
