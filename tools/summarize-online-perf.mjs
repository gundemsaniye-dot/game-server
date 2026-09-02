import { readFileSync } from 'node:fs';

// Parse native bridge lines only (console forwarding can duplicate the JSON).
// Input stays local; output contains performance measurements, not raw logcat.
const runs = [], byPid = new Map();
for (const line of readFileSync(process.argv[2], 'utf8').split('\n')) {
  const match = line.match(/^\S+\s+(\S+)\s+(\d+)\s+\d+\s+I CastlePerf\s*: \[CastlePerf\]\[(START|SNAPSHOT|RESULT|ONLINE)\] (.*)$/);
  if (!match) continue;
  const [,time,pid,kind,json] = match;
  let data; try { data = JSON.parse(json); } catch { continue; }
  if (kind === 'START') { const run={pid,start:time,samples:[],online:[],result:null}; runs.push(run); byPid.set(pid,run); }
  const run = byPid.get(pid); if (!run) continue;
  if (kind === 'SNAPSHOT' && data.schema === 2) run.samples.push(data);
  if (kind === 'RESULT' && data.schema === 2) run.result=data;
  if (kind === 'ONLINE') { run.room=data.roomId; run.online.push(data); }
}
console.log(JSON.stringify(runs.map(run => {
  const frames=run.samples.reduce((n,s)=>n+s.sampleFrameCount,0);
  const ms=run.samples.reduce((n,s)=>n+s.sampleMs,0);
  return {
    pid:run.pid,start:run.start,room:run.room,
    sampledSeconds:Math.round(ms)/1000, frames, fps:ms?Math.round(1e6*frames/ms)/1000:0,
    intervals:run.samples.length, minIntervalFps:Math.min(...run.samples.map(s=>s.fps)),
    intervalsAtOrBelow30:run.samples.filter(s=>s.fps<=30).length,
    maxUnits:Math.max(0,...run.samples.map(s=>s.counters.unitCount),...run.online.map(s=>s.units)),
    maxCastleAttackers:Math.max(0,...run.online.map(s=>s.castleAttackers)),
    result:run.result,
  };
}),null,2));
