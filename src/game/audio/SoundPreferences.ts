import type { Sound } from 'phaser';

export const SOUND_PREFERENCE_KEY = 'castle-stormers.sound-muted';
const preferences = new WeakMap<Sound.BaseSoundManager, { muted: boolean }>();
let sessionMuted: boolean | undefined;

/** Once per sound manager, before any scene plays audio. Never reads storage per frame. */
export function initializeSoundPreferences(sound: Sound.BaseSoundManager) {
  if (preferences.has(sound)) return;
  if (sessionMuted === undefined) {
    try {
      sessionMuted = window.localStorage.getItem(SOUND_PREFERENCE_KEY) === 'true';
    } catch {
      sessionMuted = sound.mute;
    }
  }
  const state = { muted: sessionMuted };
  preferences.set(sound, state);
  // WebAudio's mute getter reads AudioParam.value, which may lag a scheduled
  // native gain change. Keep the user's decision synchronous for all guards/UI.
  sound.on('mute', (_manager: Sound.BaseSoundManager, muted: boolean) => {
    state.muted = muted;
    // Phaser schedules mute at time 0. With an idle WebAudio graph its getter
    // can keep exposing the old intrinsic value. Synchronize that value too,
    // only on the mute event; HTML5/NoAudio managers have no master gain node.
    const master = (sound as Sound.BaseSoundManager & { masterMuteNode?: GainNode }).masterMuteNode;
    if (master) master.gain.value = muted ? 0 : 1;
  });
  sound.mute = state.muted;

  // Phaser's convenience play() allocates a sound even when globally muted.
  // Gate sound requests, not frames; existing master mute also protects live nodes.
  const play = sound.play;
  sound.play = (key, extra) => state.muted ? false : play.call(sound, key, extra);
}

export const isSoundMuted = (sound: Sound.BaseSoundManager) => preferences.get(sound)?.muted ?? sound.mute;

export function setSoundMuted(sound: Sound.BaseSoundManager, muted: boolean) {
  initializeSoundPreferences(sound);
  sessionMuted = muted;
  preferences.get(sound)!.muted = muted;
  sound.mute = muted;
  try {
    window.localStorage.setItem(SOUND_PREFERENCE_KEY, String(muted));
  } catch {
    // Keep the in-memory choice across scenes and renderer recreation.
  }
}
