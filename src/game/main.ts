import { Boot } from './scenes/Boot';
import { GameOver } from './scenes/GameOver';
import { Game as MainGame } from './scenes/Game';
import { MainMenu } from './scenes/MainMenu';
import { MapSelect } from './scenes/MapSelect';
import { MapEditor } from './scenes/MapEditor';
import { Game, Scene, Scale, WEBGL } from 'phaser';
import { Preloader } from './scenes/Preloader';
import { ArmyLoadout } from './scenes/ArmyLoadout';
import { SceneTransition } from './scenes/SceneTransition';
import { Story } from './scenes/Story';
import { HowToPlay } from './scenes/HowToPlay';
import { installRenderFrameClock } from './performance/RenderFrameClock';
import { generateUiTextures } from './assets/RuntimeAssets';

const launchParams = new URLSearchParams(window.location.search);
const mobileTexturesOverride = launchParams.get('mobileTextures');
const desynchronizedOverride = launchParams.get('desynchronized');
const timeoutLoopOverride = launchParams.get('timeoutLoop');
// Keep this an explicit A/B option. On the reference Android device Phaser's
// one-texture mobile mode increased the scene from about 41 to 69 draw calls,
// so the normal multi-texture batcher remains the shipping default.
const useMobileTextures = mobileTexturesOverride === null
    ? false
    : mobileTexturesOverride !== '0';
const useDesynchronizedCanvas = desynchronizedOverride === null
    ? false
    : desynchronizedOverride !== '0';

//  Find out more information about the Game Config at:
//  https://docs.phaser.io/api-documentation/typedef/types-core#gameconfig
const config: Phaser.Types.Core.GameConfig = {
    type: WEBGL,
    width: 1280,
    height: 720,
    parent: 'game-container',
    backgroundColor: '#000000',
    disableContextMenu: true,
    callbacks: { postBoot: installRenderFrameClock },
    fps: {
        target: 60,
        min: 30,
        // Keep timeout scheduling as a diagnostic override only. Driving it at
        // 60 Hz can outrun Android WebView's compositor and grow the GPU queue.
        forceSetTimeOut: timeoutLoopOverride === '1',
        // High-refresh WebViews can deliver 90/120/144 rAF callbacks even
        // though this game targets 60 FPS. Cap the actual Phaser update/render
        // work so high-Hz panels do not submit redundant full WebGL frames.
        // RenderFrameClock caps Game.step at 60 with sub-ms jitter tolerance.
        // Phaser 4's modulo limiter drops 60-Hz frames near its exact boundary
        // and passes its accumulated remainder to animation consumers.
        limit: 0,
        // Shipping simulation already uses a bounded wall-clock delta. Phaser's
        // moving-average delta made animations and tweens lag behind during a
        // slow section, then run faster while the history recovered. Use the
        // current frame duration so visual time cannot oscillate after jank.
        smoothStep: false,
        deltaHistory: 1,
        panicMax: 120
    },
    render: {
        antialias: true,
        antialiasGL: launchParams.get('msaa') === '1',
        // Desynchronized WebGL is a diagnostic override only. It increased
        // frame-time variance on the reference Android WebView.
        desynchronized: useDesynchronizedCanvas,
        pixelArt: false,
        roundPixels: false,
        powerPreference: 'high-performance',
        skipUnreadyShaders: true,
        // Atlas batching is measurably faster on the reference Android device.
        // Keep an explicit query override for visual/performance A/B checks.
        autoMobileTextures: useMobileTextures
    },
    scale: {
        mode: Scale.FIT,
        autoCenter: Scale.CENTER_BOTH
    },
    scene: [
        Boot,
        Preloader,
        SceneTransition,
        MainMenu,
        ArmyLoadout,
        MapSelect,
        MapEditor,
        Story,
        HowToPlay,
        MainGame,
        GameOver
    ]
};

const StartGame = (parent: string) => {
    const game = new Game({ ...config, parent });
    if (import.meta.env.VITE_ANDROID_DIAGNOSTICS === '1') {
        const diagnostics = window as typeof window & {
            __CASTLE_GAME__?: Game;
            __CASTLE_RECREATE_ONLINE_RENDERER__?: () => Promise<void>;
        };
        diagnostics.__CASTLE_GAME__ = game;
        // Controlled A/B only: keep the SAME authoritative connection, map and
        // units, but recreate Phaser/GL without ever loading splash/menu assets.
        // This is not a cold WebView/process launch and must not be reported as one.
        diagnostics.__CASTLE_RECREATE_ONLINE_RENDERER__ = () => new Promise((resolve, reject) => {
            const old = diagnostics.__CASTLE_GAME__;
            const battle = old?.scene.getScene('Game') as unknown as Scene & {
                battleStartData: Record<string, unknown>; localPlayerSide: 'left' | 'right';
                roomId?: string; isOnline: boolean; battleEnded: boolean;
            };
            if (!old || !battle?.sys.isActive() || !battle.isOnline || battle.battleEnded || !battle.roomId) {
                reject(new Error('A live online match is required')); return;
            }
            const data = { ...battle.battleStartData, isOnline: true, roomId: battle.roomId, side: battle.localPlayerSide };
            const mute = old.sound.mute;
            class OnlineControlPreloader extends Scene {
                constructor() { super('OnlineControlPreloader'); }
                init() { generateUiTextures(this); }
                preload() {
                    this.load.setPath('assets');
                    this.load.image('projectile-arrow', 'units/projectiles/arrow.png');
                    this.load.audio('select-sfx', 'audio/select.wav');
                    this.load.audio('hit-sfx', 'audio/hit.wav');
                }
                create() { this.scene.start('Game', data); }
            }
            old.events.once('destroy', () => setTimeout(() => {
                diagnostics.__CASTLE_GAME__ = new Game({ ...config, parent,
                    scene: [OnlineControlPreloader, MainGame, GameOver, SceneTransition, MainMenu, MapSelect],
                    callbacks: { postBoot: fresh => { installRenderFrameClock(fresh); fresh.sound.mute = mute; resolve(); } },
                });
            }, 0));
            old.destroy(true);
        });
    }
    return game;

}

export default StartGame;
