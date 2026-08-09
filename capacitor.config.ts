import type { CapacitorConfig } from '@capacitor/cli';

const enableWebDebugging = process.env.CAPACITOR_WEB_DEBUG === '1';
const enablePerfTest = process.env.CAPACITOR_PERF_TEST === '1';
const perfProfile = process.env.CAPACITOR_PERF_PROFILE === 'diagnostic' ? 'diagnostic' : 'telemetry';
const perfMobileTextures = process.env.CAPACITOR_PERF_MOBILE_TEXTURES === '0' ? '0' : '1';
const requestedPerfLevel = Number.parseInt(process.env.CAPACITOR_PERF_LEVEL ?? '20', 10);
const perfLevel = Number.isFinite(requestedPerfLevel) ? Math.min(20, Math.max(1, requestedPerfLevel)) : 20;
// Benchmarks must exercise the shipping game by default. Synthetic population
// is an explicit stress-test option instead of silently changing game rules.
const perfRealSystems = process.env.CAPACITOR_PERF_REAL_SYSTEMS === '0' ? '0' : '1';
const perfSyntheticPopulation = process.env.CAPACITOR_PERF_SYNTHETIC_POPULATION === '1' ? '1' : '0';
const perfSkipBriefing = process.env.CAPACITOR_PERF_SKIP_BRIEFING === '1' ? '1' : '0';

const config: CapacitorConfig = {
    appId: 'com.castlestormers.game',
    appName: 'Castle Stormers',
    webDir: 'dist',
    backgroundColor: '#071525',
    server: enablePerfTest ? {
        appStartPath: `/android-perf?androidPerf=1&scene=battle&level=${perfLevel}&seed=${20000 + perfLevel}&profile=${perfProfile}&skipBriefing=${perfSkipBriefing}&mobileTextures=${perfMobileTextures}&realSystems=${perfRealSystems}&syntheticPopulation=${perfSyntheticPopulation}`
    } : undefined,
    android: {
        backgroundColor: '#071525',
        allowMixedContent: false,
        webContentsDebuggingEnabled: enableWebDebugging,
        loggingBehavior: enableWebDebugging || enablePerfTest ? 'debug' : 'none'
    }
};

export default config;
