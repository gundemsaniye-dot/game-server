#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..');
const atlasDir = path.join(rootDir, 'public/assets/units/atlases');
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
const frameSize = 128;
const columns = 16;
const rows = [
  { action: 'idle', row: 0, count: 8 },
  { action: 'run', row: 1, count: 16 },
  { action: 'attack', row: 2, count: 8 }
];

const makeFrame = (x, y) => ({
  frame: { x, y, w: frameSize, h: frameSize },
  rotated: false,
  trimmed: false,
  spriteSourceSize: { x: 0, y: 0, w: frameSize, h: frameSize },
  sourceSize: { w: frameSize, h: frameSize }
});

fs.mkdirSync(atlasDir, { recursive: true });

let written = 0;
for (const team of teams) {
  for (const type of unitTypes) {
    const name = `${team}-${type}`;
    const png = path.join(atlasDir, `${name}.png`);
    if (!fs.existsSync(png)) {
      throw new Error(`Missing atlas PNG: ${path.relative(rootDir, png)}`);
    }

    const frames = {};
    for (const { action, row, count } of rows) {
      for (let index = 0; index < count; index += 1) {
        frames[`${action}_${String(index).padStart(3, '0')}`] = makeFrame(index * frameSize, row * frameSize);
      }
    }

    const json = {
      frames,
      meta: {
        app: 'Castle Raid 2 Atlas Pipeline',
        version: '1.1',
        image: `${name}.png`,
        format: 'RGBA8888',
        size: { w: columns * frameSize, h: rows.length * frameSize },
        scale: '1'
      }
    };

    fs.writeFileSync(path.join(atlasDir, `${name}.json`), `${JSON.stringify(json, null, 2)}\n`);
    written += 1;
  }
}

console.log(`Atlas metadata written: ${written}`);
