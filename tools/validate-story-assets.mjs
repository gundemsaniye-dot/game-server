import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const storyRoot = path.join(root, "public", "assets", "story");
const expected = [
  ...Array.from({ length: 5 }, (_, index) => `prologue-${String(index + 1).padStart(2, "0")}.webp`),
  ...Array.from({ length: 20 }, (_, index) => `level-${String(index + 1).padStart(2, "0")}.webp`),
];
const maxFileBytes = 500 * 1024;
const maxTotalBytes = Math.floor(12.5 * 1024 * 1024);
const storyData = JSON.parse(fs.readFileSync(path.join(root, "public", "assets", "data", "campaign-story.json"), "utf8"));

function webpDimensions(buffer) {
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") {
    throw new Error("not a WebP RIFF file");
  }
  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    return [1 + buffer.readUIntLE(24, 3), 1 + buffer.readUIntLE(27, 3)];
  }
  if (chunk === "VP8 ") {
    return [buffer.readUInt16LE(26) & 0x3fff, buffer.readUInt16LE(28) & 0x3fff];
  }
  if (chunk === "VP8L") {
    const bits = buffer.readUInt32LE(21);
    return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
  }
  throw new Error(`unsupported WebP chunk ${chunk}`);
}

const actual = fs.existsSync(storyRoot)
  ? fs.readdirSync(storyRoot).filter((name) => name.endsWith(".webp")).sort()
  : [];
const errors = [];
for (const file of expected) if (!actual.includes(file)) errors.push(`missing ${file}`);
for (const file of actual) if (!expected.includes(file)) errors.push(`unused variant ${file}`);
const referenced = [
  ...(storyData.prologue?.pages ?? []).map((page) => path.basename(page.image)),
  ...Object.values(storyData.levels ?? {}).map((level) => path.basename(level.image)),
];
if (new Set(referenced).size !== 25) errors.push(`story data references ${new Set(referenced).size} unique images (expected 25)`);
for (const file of expected) if (!referenced.includes(file)) errors.push(`story data does not reference ${file}`);
if ((storyData.prologue?.pages ?? []).length !== 5) errors.push("prologue must contain exactly 5 dedicated pages");
if (Object.keys(storyData.levels ?? {}).length !== 20) errors.push("story data must contain exactly 20 levels");

let totalBytes = 0;
for (const file of expected.filter((name) => actual.includes(name))) {
  const absolutePath = path.join(storyRoot, file);
  const buffer = fs.readFileSync(absolutePath);
  totalBytes += buffer.length;
  if (buffer.length > maxFileBytes) errors.push(`${file} is ${buffer.length} bytes (max ${maxFileBytes})`);
  try {
    const [width, height] = webpDimensions(buffer);
    if (width !== 1280 || height !== 720) errors.push(`${file} is ${width}x${height} (expected 1280x720)`);
  } catch (error) {
    errors.push(`${file}: ${error.message}`);
  }
}
if (totalBytes > maxTotalBytes) errors.push(`total is ${totalBytes} bytes (max ${maxTotalBytes})`);
if (errors.length) throw new Error(`Story asset validation failed:\n${errors.map((error) => `- ${error}`).join("\n")}`);
console.log(`[STORY ASSETS] PASS files=${actual.length} totalBytes=${totalBytes} maxFileBytes=${Math.max(...expected.map((file) => fs.statSync(path.join(storyRoot, file)).size))}`);
