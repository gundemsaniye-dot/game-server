// Local diagnostic WebView only. Forward its devtools socket to localhost:9222.
// Usage: node tools/android-cdp.mjs 'read-only JavaScript expression'
const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const target = targets.find(t => t.url.startsWith('https://localhost/'));
if (!target) throw new Error('Diagnostic Android WebView not found');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
const expression = process.argv[2] ?? `(() => {
  const g = window.__CASTLE_GAME__;
  if (!g) return {diagnostics:false};
  const battle = g.scene.getScene('Game');
  return {
    now: Date.now(), online: window.__CASTLE_ONLINE_PERF__, perf: window.__CASTLE_ANDROID_PERF__,
    scenes: g.scene.scenes.map(s => ({key:s.sys.settings.key,active:s.sys.isActive(),visible:s.sys.isVisible(),objects:s.children?.length,tweens:s.tweens?.getTweens().length})),
    textures:g.textures.getTextureKeys(), sounds:g.sound.sounds.map(s=>({key:s.key,playing:s.isPlaying})),
    heap:performance.memory?.usedJSHeapSize, room:battle?.roomId, map:battle?.battleStartData, ended:battle?.battleEnded,
    units:battle?.units?.map(u=>({side:u.team,type:u.type,state:u.state,x:u.x,y:u.y,hp:u.hp})),
    text:battle?.onlinePerformanceText?.text
  };
})()`;
const result = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('CDP timeout')), 15000);
  ws.onmessage = event => {
    const msg = JSON.parse(event.data);
    if (msg.id !== 1) return;
    clearTimeout(timer);
    if (msg.error || msg.result?.exceptionDetails) reject(new Error(JSON.stringify(msg)));
    else resolve(process.argv[2] === '--heap' ? msg.result : msg.result.result.value);
  };
  ws.send(JSON.stringify(process.argv[2] === '--heap'
    ? {id:1,method:'Runtime.getHeapUsage'}
    : {id:1,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}}));
});
console.log(JSON.stringify(result));
ws.close();
