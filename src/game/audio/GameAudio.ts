import type { Scene } from "phaser";

type MusicKey = "lobby-music" | "battle-music";

type MusicRequest = {
  key: MusicKey;
  volume: number;
  fadeInMs: number;
};

type LogFn = (scope: string, message: string) => void;
type MusicOptions = {
  fadeInMs?: number;
};
type VolumeSound = Phaser.Sound.BaseSound & {
  volume: number;
  isPlaying: boolean;
  setVolume: (value: number) => VolumeSound;
};

const MUSIC_KEYS: MusicKey[] = ["lobby-music", "battle-music"];

let pendingMusic: MusicRequest | undefined;
let unlockHandlersAttached = false;
let detachAudioUnlock: (() => void) | undefined;

export function playSceneMusic(
  scene: Scene,
  key: MusicKey,
  volume: number,
  log?: LogFn,
  options: MusicOptions = {},
) {
  keepMusicAliveWhenWindowLosesFocus(scene, log);

  const fadeInMs = options.fadeInMs ?? 0;
  pendingMusic = { key, volume, fadeInMs };

  stopOtherMusic(scene, key);

  // Critical fix:
  // Do NOT call music.play() while the Sound Manager is still locked.
  // Some browsers/Phaser builds can mark the sound as "isPlaying" even though it is still silent.
  // We queue it, unlock on the tap gesture, then start a fresh sound after unlock.
  if (scene.sound.locked) {
    log?.("AUDIO", formatAudioStatus(scene, key, "waiting for audio unlock before play"));
    attachAudioUnlock(scene, log);
    return;
  }

  if (getAudioContextState(scene) !== "running") {
    log?.("AUDIO", formatAudioStatus(scene, key, "resuming audio context before play"));
    void resumeUnlockedAudio(scene, log);
    return;
  }

  const status = startFreshLoopingMusic(scene, key, volume, fadeInMs);
  log?.("AUDIO", formatAudioStatus(scene, key, status));
}

export function stopSceneMusic(scene: Scene, key: MusicKey) {
  const music = scene.sound.get(key);
  if (music) {
    scene.tweens.killTweensOf(music);
  }

  scene.sound.stopByKey(key);
  scene.sound.removeByKey(key);

  if (pendingMusic?.key === key) {
    pendingMusic = undefined;
  }
  if (!pendingMusic) detachAudioUnlock?.();
}


function keepMusicAliveWhenWindowLosesFocus(scene: Scene, log?: LogFn) {
  if (!scene.sound.pauseOnBlur) {
    return;
  }

  scene.sound.pauseOnBlur = false;
  log?.("AUDIO", "sound.pauseOnBlur=false; music will not be paused by Phaser blur/focus handling");
}

function stopOtherMusic(scene: Scene, keepKey: MusicKey) {
  for (const musicKey of MUSIC_KEYS) {
    if (musicKey !== keepKey) {
      scene.sound.stopByKey(musicKey);
      scene.sound.removeByKey(musicKey);
    }
  }
}

function startFreshLoopingMusic(scene: Scene, key: MusicKey, volume: number, fadeInMs: number) {
  try {
    const oldMusic = scene.sound.get(key);
    if (oldMusic) {
      scene.tweens.killTweensOf(oldMusic);
      scene.sound.stopByKey(key);
      scene.sound.removeByKey(key);
    }

    const initialVolume = fadeInMs > 0 ? 0 : volume;
    const music = scene.sound.add(key, { loop: true, volume: initialVolume }) as VolumeSound;
    music.setVolume(initialVolume);

    const started = music.play({ loop: true, volume: initialVolume });

    if (!started || !music.isPlaying) {
      return `play rejected started=${String(started)} isPlaying=${String(music.isPlaying)}`;
    }

    fadeMusicTo(scene, music, volume, fadeInMs);
    scene.time.delayedCall(220, () => verifyMusicAudible(scene, key, volume, logNoop));

    return fadeInMs > 0
      ? `fresh play started with ${fadeInMs}ms fade-in volume=${volume}`
      : `fresh play started volume=${volume}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `play error ${message}`;
  }
}

function verifyMusicAudible(scene: Scene, key: MusicKey, volume: number, log: LogFn) {
  const music = scene.sound.get(key) as VolumeSound | null;

  if (!music) {
    log("AUDIO", `${key} verify missing sound object`);
    return;
  }

  if (!music.isPlaying && !scene.sound.locked && getAudioContextState(scene) === "running") {
    scene.sound.stopByKey(key);
    const retry = scene.sound.add(key, { loop: true, volume }) as VolumeSound;
    retry.play({ loop: true, volume });
    log("AUDIO", `${key} verify retry play volume=${volume}`);
  }
}

function logNoop() {
  // Intentionally silent; verification is a fallback, not normal logging spam.
}

function fadeMusicTo(scene: Scene, music: VolumeSound, volume: number, fadeInMs: number) {
  scene.tweens.killTweensOf(music);

  if (fadeInMs <= 0) {
    music.setVolume(volume);
    return;
  }

  music.setVolume(0);
  scene.tweens.addCounter({
    from: 0,
    to: volume,
    duration: fadeInMs,
    ease: "Sine.InOut",
    onUpdate: (tween) => {
      music.setVolume(tween.getValue() ?? volume);
    },
    onComplete: () => {
      music.setVolume(volume);
    },
  });
}

function attachAudioUnlock(scene: Scene, log?: LogFn) {
  if (unlockHandlersAttached) {
    return;
  }

  unlockHandlersAttached = true;

  const cleanup = () => {
    scene.sound.off("unlocked", unlock);
    scene.events.off("shutdown", cleanup);
    if (detachAudioUnlock === cleanup) detachAudioUnlock = undefined;
    unlockHandlersAttached = false;
  };
  const unlock = () => {
    cleanup();
    void unlockAudio(scene, log);
  };

  detachAudioUnlock = cleanup;
  scene.sound.once("unlocked", unlock);
  scene.events.once("shutdown", cleanup);
  scene.sound.unlock();
}

async function unlockAudio(scene: Scene, log?: LogFn) {
  await resumeAudioContext(scene);
  scene.sound.resumeAll();

  replayPendingMusicFresh(scene, log, "after unlock");
}

async function resumeUnlockedAudio(scene: Scene, log?: LogFn) {
  await resumeAudioContext(scene);
  scene.sound.resumeAll();
  replayPendingMusicFresh(scene, log, "after resume");
}

function replayPendingMusicFresh(scene: Scene, log?: LogFn, suffix = "") {
  if (!pendingMusic) {
    return;
  }

  const { key, volume, fadeInMs } = pendingMusic;

  if (scene.sound.locked || getAudioContextState(scene) !== "running") {
    log?.("AUDIO", formatAudioStatus(scene, key, `still blocked ${suffix}`));
    return;
  }

  stopOtherMusic(scene, key);
  const status = startFreshLoopingMusic(scene, key, volume, fadeInMs);
  const statusLine = formatAudioStatus(scene, key, status);

  log?.("AUDIO", suffix ? `${statusLine} ${suffix}` : statusLine);
}

function getAudioContext(scene: Scene) {
  return (scene.sound as Phaser.Sound.BaseSoundManager & { context?: AudioContext }).context;
}

function getAudioContextState(scene: Scene) {
  return getAudioContext(scene)?.state ?? "no-context";
}

async function resumeAudioContext(scene: Scene) {
  const context = getAudioContext(scene);

  if (context && context.state !== "running") {
    try {
      await context.resume();
    } catch {
      // Some browsers reject resume until a stronger user activation arrives.
    }
  }
}

function formatAudioStatus(scene: Scene, key: MusicKey, status: string) {
  const music = scene.sound.get(key) as VolumeSound | null;
  const playing = music ? ` isPlaying=${String(music.isPlaying)} volume=${String(music.volume)}` : " isPlaying=no-sound";
  return `${key} ${status} context=${getAudioContextState(scene)} locked=${scene.sound.locked}${playing}`;
}
