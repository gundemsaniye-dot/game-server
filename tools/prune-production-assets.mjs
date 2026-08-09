import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const distRoot = path.join(projectRoot, "dist");
const dryRun = process.argv.includes("--dry-run");
const reportPath = path.join(
  projectRoot,
  "outputs",
  "asset-audit",
  dryRun ? "production-asset-audit-dry-run.json" : "production-asset-audit.json",
);

const ACTIVE_UI_ASSETS = new Set([
  "assets/ui/splash/background.png",
  "assets/ui/splash/animation-soldier.png",
  "assets/ui/splash/tap-to-start-button.png",
  "assets/ui/menu/start-v2/menu-background-clean-v3.png",
  "assets/ui/menu/start-v2/menu-logo-layer-v2.png",
  "assets/ui/menu/start-v2/menu-start-button-layer-v2.png",
  "assets/ui/menu/start-v2/menu-upgrades-button-layer-v2.png",
  "assets/ui/menu/start-v2/menu-settings-button-layer-v2.png",
  "assets/ui/menu/start-v2/buttons/start-hover-v2.png",
  "assets/ui/menu/start-v2/buttons/upgrades-hover-v2.png",
  "assets/ui/menu/start-v2/buttons/settings-hover-v2.png",
]);

const ACTIVE_STRUCTURE_ASSETS = new Set([
  "assets/structures/player-stronghold.png",
  "assets/structures/enemy-stronghold.png",
  "assets/structures/player-fortress-side-v1.png",
  "assets/structures/enemy-fortress-side-v1.png",
  "assets/structures/player-wall-rampart-v3.png",
  "assets/structures/enemy-wall-rampart-v3.png",
]);

const REQUIRED_EXACT_ASSETS = [
  "index.html",
  "style.css",
  "favicon.png",
  "assets/logo.png",
  "assets/data/campaign-story.json",
  "assets/data/legal-content.json",
  "assets/maps/world-map-v2.png",
  "assets/maps/runtime-resources/map-prop-frozen_pass-snow-pine.png",
  "assets/maps/runtime-resources/map-prop-infernal_dungeon-burned-tree.png",
  "assets/maps/runtime-resources/map-prop-muddy_fields-dead-tree.png",
  "assets/maps/runtime-resources/map-prop-shared-pine-tree.png",
  "assets/tiled/tilesets/navigation-bridge.png",
  "assets/tiled/tilesets/navigation-blocked.png",
  "assets/tiled/tilesets/navigation-cost.png",
  ...ACTIVE_UI_ASSETS,
  ...ACTIVE_STRUCTURE_ASSETS,
];

function normalize(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function walkFiles(root) {
  if (!fs.existsSync(root)) return [];
  const result = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(absolutePath);
      else if (entry.isFile()) result.push(absolutePath);
    }
  }
  return result;
}

function removeEmptyDirectories(root) {
  if (!fs.existsSync(root)) return;
  const directories = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const absolutePath = path.join(current, entry.name);
      directories.push(absolutePath);
      stack.push(absolutePath);
    }
  }

  directories.sort((left, right) => right.length - left.length);
  for (const directory of directories) {
    if (fs.existsSync(directory) && fs.readdirSync(directory).length === 0) {
      fs.rmdirSync(directory);
    }
  }
}

function fileBytes(absolutePath) {
  return fs.statSync(absolutePath).size;
}

function removalReason(relativePath) {
  if (relativePath === "animation-test.html") return "development-only animation test page";
  if (relativePath === "assets/bg.png") return "unused Phaser template background";
  if (relativePath === "assets/maps/world-map-v1.png") return "superseded by runtime world-map-v2.png";
  if (relativePath.startsWith("assets/maps/props/")) return "atlas build input; runtime uses maps/atlases";
  if (relativePath.startsWith("assets/ui/") && !ACTIVE_UI_ASSETS.has(relativePath)) {
    return "inactive or superseded UI variant";
  }
  if (relativePath.startsWith("assets/structures/") && !ACTIVE_STRUCTURE_ASSETS.has(relativePath)) {
    return "inactive structure variant not loaded by Preloader";
  }
  if (relativePath.startsWith("assets/tiled/tilesets/")) {
    const fileName = path.posix.basename(relativePath);
    const runtimeReferenceMap = /^reference-preview-\d+\.png$/.test(fileName);
    const runtimeNavigation = /^navigation-(bridge|blocked|cost)\.png$/.test(fileName);
    if (!runtimeReferenceMap && !runtimeNavigation) {
      return "Tiled authoring/build input absent from all runtime map definitions";
    }
  }
  return undefined;
}

function assertFile(relativePath, missing) {
  if (!fs.existsSync(path.join(distRoot, relativePath))) missing.push(relativePath);
}

function assertMatchingPairs(relativeDir, missing) {
  const absoluteDir = path.join(distRoot, relativeDir);
  if (!fs.existsSync(absoluteDir)) {
    missing.push(`${relativeDir}/`);
    return;
  }
  const names = new Set(fs.readdirSync(absoluteDir));
  for (const jsonName of [...names].filter((name) => name.endsWith(".json"))) {
    const pngName = `${jsonName.slice(0, -5)}.png`;
    if (!names.has(pngName)) missing.push(`${relativeDir}/${pngName}`);
  }
}

function validateRuntimeAssets() {
  const missing = [];
  REQUIRED_EXACT_ASSETS.forEach((relativePath) => assertFile(relativePath, missing));

  for (let level = 1; level <= 20; level += 1) {
    assertFile(`assets/tiled/tilesets/reference-preview-${level}.png`, missing);
  }

  const tiledMapDir = path.join(distRoot, "assets", "tiled", "maps");
  const tiledMaps = fs.existsSync(tiledMapDir)
    ? fs.readdirSync(tiledMapDir).filter((name) => name.endsWith(".json"))
    : [];
  if (tiledMaps.length !== 20) missing.push(`assets/tiled/maps/*.json (expected 20, found ${tiledMaps.length})`);

  for (const mapName of tiledMaps) {
    const mapPath = path.join(tiledMapDir, mapName);
    const mapJson = JSON.parse(fs.readFileSync(mapPath, "utf8"));
    for (const tileset of mapJson.tilesets ?? []) {
      if (!tileset.image) continue;
      if (/reference-map-\d+\.png$/.test(tileset.image)) continue;
      const imagePath = path.resolve(tiledMapDir, tileset.image);
      if (!fs.existsSync(imagePath)) {
        missing.push(normalize(path.relative(distRoot, imagePath)));
      }
    }
  }

  assertMatchingPairs("assets/units/atlases", missing);
  assertMatchingPairs("assets/maps/atlases", missing);

  const unitAtlasDir = path.join(distRoot, "assets", "units", "atlases");
  const unitAtlasJsonCount = fs.existsSync(unitAtlasDir)
    ? fs.readdirSync(unitAtlasDir).filter((name) => name.endsWith(".json")).length
    : 0;
  if (unitAtlasJsonCount !== 16) {
    missing.push(`assets/units/atlases/*.json (expected 16, found ${unitAtlasJsonCount})`);
  }

  const mapAtlasDir = path.join(distRoot, "assets", "maps", "atlases");
  const mapAtlasJsonCount = fs.existsSync(mapAtlasDir)
    ? fs.readdirSync(mapAtlasDir).filter((name) => name.endsWith(".json")).length
    : 0;
  if (mapAtlasJsonCount !== 9) {
    missing.push(`assets/maps/atlases/*.json (expected 9, found ${mapAtlasJsonCount})`);
  }

  if (missing.length > 0) {
    throw new Error(`Production asset validation failed:\n${[...new Set(missing)].sort().map((item) => `- ${item}`).join("\n")}`);
  }

  return {
    tiledMapCount: tiledMaps.length,
    referenceMapCount: 20,
    unitAtlasCount: unitAtlasJsonCount,
    mapAtlasCount: mapAtlasJsonCount,
    requiredExactCount: REQUIRED_EXACT_ASSETS.length,
  };
}

if (!fs.existsSync(distRoot)) {
  throw new Error(`Production directory does not exist: ${distRoot}`);
}

const validationBefore = validateRuntimeAssets();
const allFiles = walkFiles(distRoot);
const candidates = allFiles
  .map((absolutePath) => {
    const relativePath = normalize(path.relative(distRoot, absolutePath));
    const reason = removalReason(relativePath);
    return reason ? { absolutePath, path: relativePath, bytes: fileBytes(absolutePath), reason } : undefined;
  })
  .filter(Boolean)
  .sort((left, right) => right.bytes - left.bytes || left.path.localeCompare(right.path));

const beforeBytes = allFiles.reduce((total, absolutePath) => total + fileBytes(absolutePath), 0);
const removableBytes = candidates.reduce((total, candidate) => total + candidate.bytes, 0);

if (!dryRun) {
  for (const candidate of candidates) fs.rmSync(candidate.absolutePath);
  removeEmptyDirectories(distRoot);
}

const validationAfter = validateRuntimeAssets();
const afterBytes = dryRun
  ? beforeBytes - removableBytes
  : walkFiles(distRoot).reduce((total, absolutePath) => total + fileBytes(absolutePath), 0);

const report = {
  generatedAt: new Date().toISOString(),
  dryRun,
  beforeBytes,
  removableBytes,
  afterBytes,
  savedPercent: beforeBytes === 0 ? 0 : Number(((removableBytes / beforeBytes) * 100).toFixed(2)),
  validationBefore,
  validationAfter,
  removedFileCount: candidates.length,
  candidates: candidates.map(({ path: relativePath, bytes, reason }) => ({ path: relativePath, bytes, reason })),
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(2);
console.log(`[asset-prune] ${dryRun ? "DRY RUN" : "DONE"}`);
console.log(`[asset-prune] files=${candidates.length} before=${mb(beforeBytes)}MB removed=${mb(removableBytes)}MB after=${mb(afterBytes)}MB saved=${report.savedPercent}%`);
console.log(`[asset-prune] verified maps=${validationAfter.tiledMapCount} referenceMaps=${validationAfter.referenceMapCount} unitAtlases=${validationAfter.unitAtlasCount} mapAtlases=${validationAfter.mapAtlasCount}`);
console.log(`[asset-prune] report=${path.relative(projectRoot, reportPath)}`);
