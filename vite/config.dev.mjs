import { defineConfig } from 'vite';
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mapDirectory = path.join(projectRoot, 'src', 'game', 'maps');
const tiledMapDirectory = path.join(projectRoot, 'art', 'tiled', 'maps');
const buildTiledMapsScript = path.join(projectRoot, 'tools', 'build-tiled-maps.mjs');
const execFileAsync = promisify(execFile);
const knownMapIds = new Set([
    'grasslands_01', 'grasslands_02',
    'silent_forest_01', 'silent_forest_02', 'silent_forest_03',
    'muddy_fields_01', 'muddy_fields_02', 'muddy_fields_03',
    'storm_valley_01', 'storm_valley_02', 'storm_valley_03',
    'dry_steppe_01', 'dry_steppe_02', 'dry_steppe_03',
    'desert_01', 'desert_02', 'frozen_pass_01', 'frozen_pass_02',
    'infernal_dungeon_01', 'ash_citadel_final'
]);

const castleLogBridge = () => ({
    name: 'castle-log-bridge',
    configureServer(server) {
        server.middlewares.use('/__castle_log', (req, res, next) => {
            if (req.method !== 'POST') {
                next();
                return;
            }

            let body = '';
            req.setEncoding('utf8');
            req.on('data', (chunk) => {
                body += chunk;
                if (body.length > 4096) {
                    req.destroy();
                }
            });
            req.on('end', () => {
                try {
                    const payload = JSON.parse(body || '{}');
                    const line = typeof payload.line === 'string'
                        ? payload.line
                        : `[CastleFront][LOG_BRIDGE] ${body}`;
                    console.log(line);
                } catch {
                    console.log(`[CastleFront][LOG_BRIDGE] ${body}`);
                }

                res.statusCode = 204;
                res.end();
            });
        });
    }
});

const castleBalanceReportBridge = () => ({
    name: 'castle-balance-report-bridge',
    configureServer(server) {
        server.middlewares.use('/__castle_balance_report', (req, res, next) => {
            if (req.method !== 'POST') {
                next();
                return;
            }
            let body = '';
            req.setEncoding('utf8');
            req.on('data', (chunk) => {
                body += chunk;
                if (body.length > 2_000_000) req.destroy();
            });
            req.on('end', () => {
                try {
                    const report = JSON.parse(body || '{}');
                    console.log(`[CastleFront][BALANCE_REPORT] ${JSON.stringify(report)}`);
                    res.statusCode = 204;
                    res.end();
                } catch (error) {
                    res.statusCode = 400;
                    res.end(error instanceof Error ? error.message : 'Invalid balance report');
                }
            });
        });
    }
});

const castleBalanceSuiteBridge = () => ({
    name: 'castle-balance-suite-bridge',
    configureServer(server) {
        server.middlewares.use('/__castle_balance_suite', (req, res, next) => {
            if (req.method !== 'POST') {
                next();
                return;
            }
            let body = '';
            req.setEncoding('utf8');
            req.on('data', (chunk) => {
                body += chunk;
                if (body.length > 2_000_000) req.destroy();
            });
            req.on('end', async () => {
                try {
                    const payload = JSON.parse(body || '{}');
                    const outputDirectory = path.join(projectRoot, 'outputs', 'qa');
                    await mkdir(outputDirectory, { recursive: true });
                    await writeFile(
                        path.join(outputDirectory, 'balance-suite-latest.json'),
                        `${JSON.stringify(payload, null, 2)}\n`,
                        'utf8',
                    );
                    console.log(`[CastleFront][BALANCE_SUITE] ${JSON.stringify(payload.summary ?? payload)}`);
                    res.statusCode = 204;
                    res.end();
                } catch (error) {
                    res.statusCode = 400;
                    res.end(error instanceof Error ? error.message : 'Invalid balance suite report');
                }
            });
        });
    }
});

const castleClientIpLogger = () => ({
    name: 'castle-client-ip-logger',
    configureServer(server) {
        server.middlewares.use((req, res, next) => {
            const forwardedFor = req.headers['x-forwarded-for'];
            const forwardedIp = Array.isArray(forwardedFor)
                ? forwardedFor[0]
                : forwardedFor?.split(',')[0]?.trim();
            const remoteIp = forwardedIp || req.socket.remoteAddress || 'unknown';
            const pathName = req.url?.split('?')[0] || '/';

            // Log only browser document/API traffic, not Vite's asset and HMR noise.
            if (req.method === 'GET' && !pathName.startsWith('/@') && !pathName.startsWith('/src/')) {
                console.log(`[CastleFront][CONNECT] ${remoteIp} ${req.method} ${pathName}`);
            }
            next();
        });
    }
});

const castleMapSaveBridge = () => ({
    name: 'castle-map-save-bridge',
    configureServer(server) {
        server.middlewares.use('/__castle_map_save', (req, res, next) => {
            if (req.method !== 'POST') {
                next();
                return;
            }

            let body = '';
            req.setEncoding('utf8');
            req.on('data', (chunk) => {
                body += chunk;
                if (body.length > 2_000_000) req.destroy();
            });
            req.on('end', async () => {
                try {
                    const payload = JSON.parse(body || '{}');
                    if (!knownMapIds.has(payload.mapId) || payload.map?.id !== payload.mapId) {
                        res.statusCode = 400;
                        res.end(JSON.stringify({ ok: false, error: 'Unknown or mismatched map id.' }));
                        return;
                    }
                    const outputPath = path.join(mapDirectory, `${payload.mapId}.json`);
                    await writeFile(outputPath, `${JSON.stringify(payload.map, null, 2)}\n`, 'utf8');
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ ok: true, path: outputPath }));
                } catch (error) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Save failed.' }));
                }
            });
        });
    }
});

const castleTiledMapSync = () => ({
    name: 'castle-tiled-map-sync',
    configureServer(server) {
        let timer;
        let rebuild = Promise.resolve();
        server.watcher.add(tiledMapDirectory);
        server.watcher.on('change', (file) => {
            if (path.dirname(file) !== tiledMapDirectory || path.extname(file) !== '.tmj') return;
            clearTimeout(timer);
            timer = setTimeout(() => {
                rebuild = rebuild.then(async () => {
                    try {
                        await execFileAsync(process.execPath, [buildTiledMapsScript], { cwd: projectRoot });
                        console.log(`[CastleFront][TILED] Synced ${path.basename(file)} to the game.`);
                        server.ws.send({ type: 'full-reload' });
                    } catch (error) {
                        console.error(`[CastleFront][TILED] Sync failed: ${error instanceof Error ? error.message : String(error)}`);
                    }
                });
            }, 120);
        });
    }
});

export default defineConfig({
    base: './',
    plugins: [
        castleClientIpLogger(),
        castleLogBridge(),
        castleBalanceReportBridge(),
        castleBalanceSuiteBridge(),
        castleMapSaveBridge(),
        castleTiledMapSync()
    ],
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    phaser: ['phaser']
                }
            }
        },
    },
    server: {
        port: 8080,
        // Permit temporary ngrok subdomains while testing this local dev server.
        allowedHosts: ['.ngrok-free.dev']
    }
});
