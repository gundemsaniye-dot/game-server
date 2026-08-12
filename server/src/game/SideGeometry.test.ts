import assert from "node:assert/strict";
import test from "node:test";
import {
  deploymentGuideBounds,
  formationWorldOffset,
  localToWorldX,
  resolveDeploymentClick,
  worldToLocalX,
} from "../../../shared/online/SideGeometry";
import { ONLINE_MAP_CONTRACT } from "./OnlineMapContract";

test("left and right local axes and formation offsets are exact mirrors", () => {
  const left = ONLINE_MAP_CONTRACT.sides.left;
  const right = ONLINE_MAP_CONTRACT.sides.right;
  assert.equal(localToWorldX(left, 20), left.deploy.minX + 20);
  assert.equal(localToWorldX(right, 20), right.deploy.maxX - 20);
  assert.equal(worldToLocalX(left, left.deploy.minX + 20), 20);
  assert.equal(worldToLocalX(right, right.deploy.maxX - 20), 20);
  assert.equal(formationWorldOffset(left, 12), 12);
  assert.equal(formationWorldOffset(right, 12), -12);
});

test("deploy preserves exact X/Y, castle clamps, gaps and outside points reject", () => {
  for (const side of ["left", "right"] as const) {
    const geometry = ONLINE_MAP_CONTRACT.sides[side];
    const x = (geometry.deploy.minX + geometry.deploy.maxX) / 2;
    const y = (geometry.deploy.minY + geometry.deploy.maxY) / 2;
    assert.deepEqual(resolveDeploymentClick(geometry, x, y), { x, y, source: "deploy" });

    const castleX = side === "left"
      ? (deploymentGuideBounds(geometry).minX + geometry.castle.maxX) / 2
      : (geometry.castle.minX + deploymentGuideBounds(geometry).maxX) / 2;
    assert.deepEqual(resolveDeploymentClick(geometry, castleX, y), {
      x: side === "left" ? geometry.deploy.minX : geometry.deploy.maxX,
      y,
      source: "castle",
    });
    const gapStart = side === "left" ? geometry.castle.maxX : geometry.deploy.maxX;
    const gapEnd = side === "left" ? geometry.deploy.minX : geometry.castle.minX;
    const boundaryX = (gapStart + gapEnd) / 2;
    if (gapStart < gapEnd) {
      assert.equal(resolveDeploymentClick(geometry, boundaryX, y), undefined);
    } else {
      assert.deepEqual(resolveDeploymentClick(geometry, boundaryX, y), {
        x: boundaryX,
        y,
        source: "deploy",
      });
    }
    assert.equal(resolveDeploymentClick(geometry, x, geometry.deploy.minY - 0.01), undefined);
  }
});

test("right +X deployment guide edge is reduced by exactly 35 world units", () => {
  const geometry = ONLINE_MAP_CONTRACT.sides.right;
  const untrimmed = Math.min(geometry.world.maxX, geometry.castle.maxX);
  assert.equal(deploymentGuideBounds(geometry).maxX, untrimmed - 35);
});
