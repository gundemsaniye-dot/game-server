import { Boot } from './scenes/Boot';
import { GameOver } from './scenes/GameOver';
import { Game as MainGame } from './scenes/Game';
import { MainMenu } from './scenes/MainMenu';
import { MapSelect } from './scenes/MapSelect';
import { MapEditor } from './scenes/MapEditor';
import { Game, Scale, WEBGL } from 'phaser';
import { Preloader } from './scenes/Preloader';
import { ArmyLoadout } from './scenes/ArmyLoadout';
import { SceneTransition } from './scenes/SceneTransition';

const launchParams = new URLSearchParams(window.location.search);
const mobileTexturesOverride = launchParams.get('mobileTextures');
const isAndroidRuntime = /Android/i.test(navigator.userAgent);
const timeoutLoopOverride = launchParams.get('timeoutLoop');
const desynchronizedOverride = launchParams.get('desynchronized');
// Keep this an explicit A/B option. On the reference Android device Phaser's
// one-texture mobile mode increased the scene from about 41 to 69 draw calls,
// so the normal multi-texture batcher remains the shipping default.
const useMobileTextures = mobileTexturesOverride === null
    ? false
    : mobileTexturesOverride !== '0';

//  Find out more information about the Game Config at:
//  https://docs.phaser.io/api-documentation/typedef/types-core#gameconfig
const config: Phaser.Types.Core.GameConfig = {
    type: WEBGL,
    width: 1280,
    height: 720,
    parent: 'game-container',
    backgroundColor: '#17232f',
    disableContextMenu: true,
    fps: {
        target: 60,
        min: 30,
        // Keep timeout scheduling as a diagnostic override only. Driving it at
        // 60 Hz can outrun Android WebView's compositor and grow the GPU queue.
        forceSetTimeOut: timeoutLoopOverride === '1',
        // Do not add Phaser's secondary FPS limiter. It can skip every second
        // callback on 60 Hz Android WebViews because of sub-ms rounding.
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
        // Android WebView otherwise keeps an extra compositor queue between
        // WebGL and the display. Desynchronized mode lowers that latency while
        // retaining the same 1280x720 render resolution and texture quality.
        desynchronized: false,
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
        MainGame,
        GameOver
    ]
};

const StartGame = (parent: string) => {

    return new Game({ ...config, parent });

}

export default StartGame;
