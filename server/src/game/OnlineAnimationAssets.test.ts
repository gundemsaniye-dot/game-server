import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("both online teams have idle, run and attack frames for the fixed loadout", () => {
  for (const team of ["player", "enemy"] as const) {
    for (const type of ["peasant", "swordsman", "archer", "horseman"] as const) {
      const atlasPath = resolve(__dirname, `../../../public/assets/units/atlases/${team}-${type}.json`);
      const atlas = JSON.parse(readFileSync(atlasPath, "utf8")) as { frames: Record<string, unknown> };
      const frameNames = Object.keys(atlas.frames);
      for (const action of ["idle", "run", "attack"] as const) {
        assert.ok(frameNames.some((frame) => frame.startsWith(`${action}_`)), `${team}-${type} has no ${action} frames`);
      }
    }
  }
});
