import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value = "1"] = arg.replace(/^--/, "").split("=", 2);
  return [key, value];
}));
const variant = args.variant ?? "release";
const durationSeconds = Number(args.duration ?? 610);
const sustained = args.sustained === "1";
const deviceList = spawnSync("adb", ["devices"], { encoding: "utf8" }).stdout ?? "";
const serial = args.serial ?? deviceList.split("\n").slice(1).map((line) => line.split(/\s+/)).find(([, state]) => state === "device")?.[0];
if (!serial) throw new Error("Bağlı fiziksel Android cihaz bulunamadı.");

const release = variant === "release";
const appId = release ? "com.castlestormers.game.perf" : "com.castlestormers.game";
const apk = resolve(release
  ? "android/app/build/outputs/apk/benchmark/app-benchmark.apk"
  : "android/app/build/outputs/apk/debug/app-debug.apk");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir = resolve("outputs/performance/android", stamp);
mkdirSync(outputDir, { recursive: true });

function adb(command, allowFailure = false, options = {}) {
  const commandArgs = serial ? ["-s", serial, ...command] : command;
  const result = spawnSync("adb", commandArgs, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, ...options });
  if (!allowFailure && result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout ?? "";
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
async function waitForNormalThermal() {
  let normalSamples = 0;
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const thermal = adb(["shell", "dumpsys", "thermalservice"], true);
    const status = Number(thermal.match(/Thermal Status:\s*(\d+)/)?.[1] ?? 99);
    const skin = thermal.match(/Temperature\{mValue=([\d.]+), mType=3, mName=SKIN/)?.[1] ?? "?";
    console.log(`[thermal] status=${status} skin=${skin}C sample=${normalSamples + 1}/3`);
    normalSamples = status === 0 ? normalSamples + 1 : 0;
    if (normalSamples >= 3) return;
    await sleep(10_000);
  }
  throw new Error("Cihaz 30 dakika içinde normal termal duruma dönmedi.");
}

writeFileSync(resolve(outputDir, "run.json"), JSON.stringify({ variant, durationSeconds, sustained, serial, appId, startedAt: new Date().toISOString() }, null, 2));
writeFileSync(resolve(outputDir, "device.txt"), [
  adb(["shell", "getprop", "ro.product.manufacturer"], true),
  adb(["shell", "getprop", "ro.product.model"], true),
  adb(["shell", "getprop", "ro.build.version.release"], true),
  adb(["shell", "getprop", "ro.build.version.sdk"], true),
  adb(["shell", "wm", "size"], true),
  adb(["shell", "wm", "density"], true),
  adb(["shell", "dumpsys", "battery"], true),
].join("\n"));
await waitForNormalThermal();
adb(["shell", "input", "keyevent", "KEYCODE_WAKEUP"], true);
adb(["shell", "wm", "dismiss-keyguard"], true);
adb(["install", "-r", apk]);
adb(["shell", "am", "force-stop", appId]);
adb(["shell", "dumpsys", "gfxinfo", appId, "reset"], true);
adb(["logcat", "-c"]);

const logStream = createWriteStream(resolve(outputDir, "logcat.txt"));
const logcat = spawn("adb", ["-s", serial, "logcat", "-v", "threadtime"]);
logcat.stdout.pipe(logStream);
logcat.stderr.pipe(logStream);

adb(["shell", "am", "start", "-n", `${appId}/com.castlestormers.game.MainActivity`, "--ez", "sustainedPerformance", String(sustained)]);

const traceAtSeconds = Math.min(240, Math.max(5, durationSeconds - 65));
await sleep(traceAtSeconds * 1000);
adb(["push", resolve("tools/android-perfetto.cfg"), "/data/local/tmp/castle-perfetto.cfg"]);
const perfetto = spawn("adb", ["-s", serial, "shell", "perfetto", "--txt", "-c", "/data/local/tmp/castle-perfetto.cfg", "-o", "/data/local/tmp/castle-perfetto.pb"]);
let perfettoOutput = "";
perfetto.stdout.on("data", (chunk) => { perfettoOutput += chunk.toString(); });
perfetto.stderr.on("data", (chunk) => { perfettoOutput += chunk.toString(); });
const perfettoDone = new Promise((done) => perfetto.once("close", done));
await sleep(60_000);
await perfettoDone;
writeFileSync(resolve(outputDir, "perfetto.txt"), perfettoOutput);
adb(["pull", "/data/local/tmp/castle-perfetto.pb", resolve(outputDir, "perfetto.pb")], true);
await sleep(Math.max(0, durationSeconds - traceAtSeconds - 60) * 1000);

logcat.kill("SIGINT");
await sleep(500);
await new Promise((done) => logStream.end(done));
writeFileSync(resolve(outputDir, "gfxinfo.txt"), adb(["shell", "dumpsys", "gfxinfo", appId], true));
writeFileSync(resolve(outputDir, "meminfo.txt"), adb(["shell", "dumpsys", "meminfo", appId], true));
writeFileSync(resolve(outputDir, "thermalservice.txt"), adb(["shell", "dumpsys", "thermalservice"], true));
writeFileSync(resolve(outputDir, "display.txt"), adb(["shell", "dumpsys", "display"], true));
writeFileSync(resolve(outputDir, "screenshot.png"), adb(["exec-out", "screencap", "-p"], false, { encoding: null }));
const log = readFileSync(resolve(outputDir, "logcat.txt"), "utf8");
const resultLine = log.split("\n").filter((line) => line.includes("[CastlePerf][RESULT]")).at(-1);
if (resultLine) writeFileSync(resolve(outputDir, "result.json"), resultLine.slice(resultLine.indexOf("{") ));
console.log(outputDir);
