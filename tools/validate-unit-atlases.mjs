#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..');
const publicUnitsDir = path.join(rootDir, 'public/assets/units');
const atlasDir = path.join(publicUnitsDir, 'atlases');
const projectileDir = path.join(publicUnitsDir, 'projectiles');
const unitTypes = [
  'horseman',
  'archer',
  'swordsman',
  'peasant',
  'long_spearman',
  'mace_guard',
  'mage',
  'knife_thrower'
];
const teams = ['player', 'enemy'];
const actions = [
  { name: 'idle', count: 8, row: 0 },
  { name: 'run', count: 16, row: 1 },
  { name: 'attack', count: 16, row: 2 }
];
const frameSize = 128;
const columns = 16;
const expectedRuntimeFiles = new Set(['atlases', 'projectiles']);
const errors = [];

const rel = (file) => path.relative(rootDir, file);
const fail = (message) => errors.push(message);

const readPngDimensions = (file) => {
  const header = fs.readFileSync(file).subarray(0, 24);
  const signature = header.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a' || header.toString('ascii', 12, 16) !== 'IHDR') {
    return undefined;
  }

  return {
    width: header.readUInt32BE(16),
    height: header.readUInt32BE(20)
  };
};

if (!fs.existsSync(atlasDir)) fail('Missing public/assets/units/atlases directory');
if (!fs.existsSync(projectileDir)) fail('Missing public/assets/units/projectiles directory');

for (const entry of fs.readdirSync(publicUnitsDir)) {
  if (!expectedRuntimeFiles.has(entry)) {
    fail(`Unused runtime unit asset remains in public/assets/units: ${entry}`);
  }
}

for (const team of teams) {
  for (const type of unitTypes) {
    const name = `${team}-${type}`;
    const png = path.join(atlasDir, `${name}.png`);
    const jsonPath = path.join(atlasDir, `${name}.json`);

    if (!fs.existsSync(png)) fail(`Missing atlas PNG: ${rel(png)}`);
    if (fs.existsSync(png)) {
      const dimensions = readPngDimensions(png);
      if (!dimensions || dimensions.width !== columns * frameSize || dimensions.height !== actions.length * frameSize) {
        fail(`Bad atlas dimensions ${rel(png)}: ${JSON.stringify(dimensions)}`);
      }
    }
    if (!fs.existsSync(jsonPath)) {
      fail(`Missing atlas JSON: ${rel(jsonPath)}`);
      continue;
    }

    let atlas;
    try {
      atlas = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    } catch (error) {
      fail(`Invalid JSON ${rel(jsonPath)}: ${error.message}`);
      continue;
    }

    if (!atlas.frames || typeof atlas.frames !== 'object') {
      fail(`Atlas has no frames object: ${rel(jsonPath)}`);
      continue;
    }

    for (const action of actions) {
      for (let index = 0; index < action.count; index += 1) {
        const frameName = `${action.name}_${String(index).padStart(3, '0')}`;
        const frame = atlas.frames[frameName];
        if (!frame) {
          fail(`Missing frame ${frameName} in ${rel(jsonPath)}`);
          continue;
        }

        const expectedX = index * frameSize;
        const expectedY = action.row * frameSize;
        const box = frame.frame;
        if (!box || box.x !== expectedX || box.y !== expectedY || box.w !== frameSize || box.h !== frameSize) {
          fail(`Bad frame box ${frameName} in ${rel(jsonPath)}: ${JSON.stringify(box)}`);
        }
      }
    }
  }
}

const arrow = path.join(projectileDir, 'arrow.png');
if (!fs.existsSync(arrow)) fail(`Missing projectile: ${rel(arrow)}`);

if (errors.length > 0) {
  console.error('Atlas validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Atlas validation passed. Runtime unit assets are clean.');
