#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const animationSource = fs.readFileSync(path.join(root, 'src/game/config/unitAnimations.ts'), 'utf8');
const gameSource = fs.readFileSync(path.join(root, 'src/game/scenes/Game.ts'), 'utf8');
const unitSource = fs.readFileSync(path.join(root, 'src/game/config/units.config.ts'), 'utf8');
const animationQaSource = fs.readFileSync(path.join(root, 'public/animation-test.html'), 'utf8');

const unitIds = [
  'peasant',
  'swordsman',
  'archer',
  'horseman',
  'long_spearman',
  'mace_guard',
  'mage',
  'knife_thrower',
];
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const unitVsUnitAttackSlowdown = 1.3;
const swordsmanRunAttackTimeScale = 0.7;
const errors = [];

if ((animationSource.match(/frameRate:\s*12,/g) ?? []).length !== 2) {
  errors.push('run and attack must both use the 12-pose-per-second base rate');
}
if (!gameSource.includes('unit.speed / 43')) {
  errors.push('run playback must remain tied to movement speed / 43');
}
if (!gameSource.includes('this.effectiveUnitAttackCooldown(unit) * 1.08')) {
  errors.push('attack playback must remain tied to 108% of the effective visual cooldown');
}
if (!gameSource.includes('SWORDSMAN_RUN_ATTACK_ANIMATION_TIME_SCALE = 0.7')) {
  errors.push('swordsman run and attack playback must remain exactly 30% slower');
}
if (!animationQaSource.includes('swordsmanRunAttackTimeScale = 0.7')) {
  errors.push('animation QA must mirror the swordsman 30% playback slowdown');
}
if (gameSource.includes('const attackMs = this.elapsedMs - unit.lastAttackAt')) {
  errors.push('legacy procedural attack swing must not be layered over authored frames');
}

const rows = [];
for (const unitId of unitIds) {
  const blockMatch = unitSource.match(new RegExp(`${unitId}: \\{([\\s\\S]*?)\\n  \\},`));
  if (!blockMatch) {
    errors.push(`${unitId}: config block missing`);
    continue;
  }
  const speed = Number(blockMatch[1].match(/\bspeed:\s*(\d+)/)?.[1]);
  const cooldown = Number(blockMatch[1].match(/\bcooldown:\s*(\d+)/)?.[1]);
  if (!Number.isFinite(speed) || !Number.isFinite(cooldown)) {
    errors.push(`${unitId}: speed/cooldown missing`);
    continue;
  }

  const visualTimeScale = unitId === 'swordsman' ? swordsmanRunAttackTimeScale : 1;
  const runCycleMs = (16000 / 12) / clamp(speed / 43, 0.8, 1.05) / visualTimeScale;
  const ranged = ['archer', 'mage', 'knife_thrower'].includes(unitId);
  const visualCooldown = (ranged ? cooldown : Math.max(cooldown, 1200)) * unitVsUnitAttackSlowdown;
  const desiredAttackCycleMs = clamp(visualCooldown * 1.08, ranged ? 980 : 1200, 1800);
  const attackCycleMs = desiredAttackCycleMs / visualTimeScale;
  if (unitId !== 'swordsman' && (runCycleMs < 1250 || runCycleMs > 1680)) {
    errors.push(`${unitId}: run cycle ${runCycleMs.toFixed(0)}ms is outside natural bounds`);
  }
  if (unitId !== 'swordsman' && (attackCycleMs < (ranged ? 980 : 1200) || attackCycleMs > 1800)) {
    errors.push(`${unitId}: attack cycle ${attackCycleMs.toFixed(0)}ms is outside natural bounds`);
  }
  if (unitId === 'swordsman' && (Math.abs(runCycleMs - 1904.76) > 1 || Math.abs(attackCycleMs - 2406.86) > 1)) {
    errors.push(`swordsman: expected 30% slower run/attack cycles, got ${runCycleMs.toFixed(0)}ms/${attackCycleMs.toFixed(0)}ms`);
  }
  if (!ranged && visualCooldown < 1200) {
    errors.push(`${unitId}: melee visual cooldown must be at least 1200ms`);
  }
  if (ranged && desiredAttackCycleMs > cooldown * unitVsUnitAttackSlowdown * 1.32) {
    errors.push(`${unitId}: attack animation recovery overruns gameplay cooldown too far`);
  }
  rows.push(`${unitId} run=${runCycleMs.toFixed(0)}ms attack=${attackCycleMs.toFixed(0)}ms`);
}

if (errors.length) {
  console.error('Unit animation timing validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Unit animation timing validation passed.');
for (const row of rows) console.log(`- ${row}`);
