import type { Scene, Sound, Time, Tweens } from 'phaser';
import { initializeSoundPreferences, isSoundMuted } from './SoundPreferences';

type MusicKey = 'lobby-music' | 'battle-music';
type LogFn = (scope: string, message: string) => void;
type MusicRequest = { scene: Scene; key: MusicKey; volume: number; fadeInMs: number; log?: LogFn };
type MusicState = {
  pending?: MusicRequest;
  resuming?: MusicRequest;
  detachRequest?: () => void;
  detachUnlock?: () => void;
  fade?: Tweens.Tween;
  verify?: Time.TimerEvent;
};
type VolumeSound = Sound.BaseSound & { volume: number; setVolume(value: number): VolumeSound };
const MUSIC_KEYS: MusicKey[] = ['lobby-music', 'battle-music'];
const states = new WeakMap<Sound.BaseSoundManager, MusicState>();

/** One music listener per manager. No update/rAF listener, polling or storage reads in combat. */
export function initializeGameAudio(sound: Sound.BaseSoundManager) {
  if (states.has(sound)) return;
  initializeSoundPreferences(sound);
  const state: MusicState = {};
  states.set(sound, state);
  sound.on('mute', (_manager: Sound.BaseSoundManager, muted: boolean) => {
    if (muted) {
      cancelDeferredMusic(state);
      // Master mute takes effect first. Stop and destroy instances (not decoded
      // buffers), so neither music nor effect nodes keep running in the background.
      sound.stopAll();
      sound.removeAll();
    } else if (state.pending) {
      requestPlayback(state, state.pending);
    }
  });
}

export function playSceneMusic(scene: Scene, key: MusicKey, volume: number,
  log?: LogFn, options: { fadeInMs?: number } = {}) {
  initializeGameAudio(scene.sound);
  const state = states.get(scene.sound)!;
  cancelDeferredMusic(state);
  state.detachRequest?.();
  const request: MusicRequest = { scene, key, volume, fadeInMs: options.fadeInMs ?? 0, log };
  state.pending = request;
  const detach = () => {
    scene.events.off('shutdown', cleanup);
    scene.events.off('destroy', cleanup);
    if (state.detachRequest === detach) state.detachRequest = undefined;
  };
  const cleanup = () => {
    detach();
    if (state.pending === request) {
      state.pending = undefined;
      cancelDeferredMusic(state);
    }
  };
  state.detachRequest = detach;
  scene.events.once('shutdown', cleanup);
  scene.events.once('destroy', cleanup);

  scene.sound.pauseOnBlur = false;
  for (const other of MUSIC_KEYS) {
    if (other !== key) {
      scene.sound.stopByKey(other);
      scene.sound.removeByKey(other);
    }
  }
  requestPlayback(state, request);
}

export function stopSceneMusic(scene: Scene, key: MusicKey) {
  const state = states.get(scene.sound);
  if (state?.pending?.key === key) {
    state.pending = undefined;
    state.detachRequest?.();
    cancelDeferredMusic(state);
  }
  const music = scene.sound.get(key);
  if (music) scene.tweens.killTweensOf(music);
  scene.sound.stopByKey(key);
  scene.sound.removeByKey(key);
}

function cancelDeferredMusic(state: MusicState) {
  state.detachUnlock?.();
  state.fade?.remove();
  state.fade = undefined;
  state.verify?.remove(false);
  state.verify = undefined;
}

function current(state: MusicState, request: MusicRequest) {
  return state.pending === request && !isSoundMuted(request.scene.sound);
}

function contextOf(scene: Scene) {
  return (scene.sound as Sound.BaseSoundManager & { context?: AudioContext }).context;
}

function requestPlayback(state: MusicState, request: MusicRequest) {
  if (!current(state, request)) return;
  const { scene, log } = request;
  if (scene.sound.locked) {
    if (state.detachUnlock) return;
    const detach = () => {
      scene.sound.off('unlocked', unlock);
      if (state.detachUnlock === detach) state.detachUnlock = undefined;
    };
    const unlock = () => { detach(); requestPlayback(state, request); };
    state.detachUnlock = detach;
    scene.sound.once('unlocked', unlock);
    scene.sound.unlock();
    return;
  }
  const context = contextOf(scene);
  if (context && context.state !== 'running') {
    if (state.resuming === request) return;
    state.resuming = request;
    void context.resume().then(() => {
      // Mute/scene changes may happen while the native resume promise is pending.
      if (current(state, request) && context.state === 'running') {
        scene.sound.resumeAll();
        startFreshMusic(state, request);
      }
    }).catch(() => {
      log?.('AUDIO', 'Audio context resume rejected; waiting for user activation');
    }).finally(() => {
      if (state.resuming === request) state.resuming = undefined;
    });
    return;
  }
  startFreshMusic(state, request);
}

function startFreshMusic(state: MusicState, request: MusicRequest, verify = true) {
  if (!current(state, request)) return;
  const { scene, key, volume, fadeInMs, log } = request;
  cancelDeferredMusic(state);
  try {
    const old = scene.sound.get(key);
    if (old) scene.tweens.killTweensOf(old);
    scene.sound.stopByKey(key);
    scene.sound.removeByKey(key);
    const initialVolume = fadeInMs > 0 ? 0 : volume;
    const music = scene.sound.add(key, { loop: true, volume: initialVolume }) as VolumeSound;
    const started = music.play({ loop: true, volume: initialVolume });
    if (started && music.isPlaying && fadeInMs > 0) {
      // A real target makes killTweensOf effective; no per-frame JS fade callback.
      state.fade = scene.tweens.add({ targets: music, volume, duration: fadeInMs, ease: 'Sine.InOut' });
    }
    log?.('AUDIO', `${key} play=${started} volume=${volume} muted=${scene.sound.mute}`);
    if (verify) {
      state.verify = scene.time.delayedCall(220, () => {
        state.verify = undefined;
        if (!current(state, request) || scene.sound.get(key)?.isPlaying || scene.sound.locked) return;
        const context = contextOf(scene);
        if (!context || context.state === 'running') startFreshMusic(state, request, false);
      });
    }
  } catch (error) {
    log?.('AUDIO', `Skipped ${key}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
