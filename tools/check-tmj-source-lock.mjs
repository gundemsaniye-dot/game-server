import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const mapsRoot = path.join(root, "art", "tiled", "maps");
const lockPath = path.join(root, "art", "tiled", "tmj-source-lock.json");
const update = process.argv.includes("--update");

const sourceFiles = (await readdir(mapsRoot))
  .filter((file) => /^level\d+\.tmj$/.test(file))
  .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

async function digest(file) {
  return createHash("sha256").update(await readFile(path.join(mapsRoot, file))).digest("hex");
}

const hashes = Object.fromEntries(await Promise.all(
  sourceFiles.map(async (file) => [file, await digest(file)]),
));

if (update) {
  if (process.env.CONFIRM_TMJ_SOURCE_CHANGE !== "1") {
    console.error("\n[TMJ KILIDI] DURDURULDU: Kaynak TMJ kilidi sessizce güncellenemez.");
    console.error("Önce değişiklikleri kullanıcıya bildirin. Bilinçli onaydan sonra:");
    console.error("CONFIRM_TMJ_SOURCE_CHANGE=1 npm run tiled:lock:update\n");
    process.exit(1);
  }
  await writeFile(lockPath, `${JSON.stringify({ version: 1, files: hashes }, null, 2)}\n`);
  console.warn(`[TMJ KILIDI] ${sourceFiles.length} kaynak haritanın mevcut hali bilinçli olarak kilitlendi.`);
  process.exit(0);
}

let lock;
try {
  lock = JSON.parse(await readFile(lockPath, "utf8"));
} catch {
  console.error("\n[TMJ KILIDI] DURDURULDU: art/tiled/tmj-source-lock.json bulunamadı veya okunamadı.");
  process.exit(1);
}

const lockedFiles = lock?.files ?? {};
const changed = sourceFiles.filter((file) => lockedFiles[file] !== hashes[file]);
const removed = Object.keys(lockedFiles).filter((file) => !hashes[file]);
if (changed.length || removed.length) {
  console.error("\n============================================================");
  console.error("[TMJ KILIDI] KAYNAK HARİTA DEĞİŞİKLİĞİ TESPİT EDİLDİ");
  console.error("Bu işlem TMJ değişikliğini gizlememek için DURDURULDU.");
  for (const file of changed) console.error(`  değişti/eklendi: art/tiled/maps/${file}`);
  for (const file of removed) console.error(`  silindi: art/tiled/maps/${file}`);
  console.error("Değişikliği kullanıcıya mutlaka bildirin. Kullanıcı onaylarsa:");
  console.error("  CONFIRM_TMJ_SOURCE_CHANGE=1 npm run tiled:lock:update");
  console.error("============================================================\n");
  process.exit(1);
}

console.log(`[TMJ KILIDI] ${sourceFiles.length} kaynak harita değişmemiş.`);
