import assert from "node:assert/strict";
import test from "node:test";
import { ONLINE_MAP_CONTRACT, ONLINE_MAP_POOL, getOnlineMapContract } from "./OnlineMapContract";
import { ONLINE_MAP_NAVIGATION } from "./OnlineMapNavigation";
import { ONLINE_MATCH_CONFIG, ONLINE_UNIT_STATS } from "./OnlineMatchConfig";
import { OnlineMatchSimulation } from "./OnlineMatchSimulation";

const left = ONLINE_MAP_CONTRACT.deployBounds.left;
const right = ONLINE_MAP_CONTRACT.deployBounds.right;
const command = (id: string, type: string, x = left.minX, y = 320) => ({ commandId: id, type, level: 1, x, y });
const advance = (simulation: OnlineMatchSimulation, durationMs: number, inspect?: () => void) => {
  for (let elapsed = 0; elapsed < durationMs; elapsed += 200) {
    simulation.tick(Math.min(200, durationMs - elapsed));
    inspect?.();
  }
};
const advanceUntil = (
  simulation: OnlineMatchSimulation,
  predicate: () => boolean,
  timeoutMs: number,
) => {
  for (let elapsed = 0; elapsed < timeoutMs; elapsed += 200) {
    simulation.tick(Math.min(200, timeoutMs - elapsed));
    if (predicate()) return;
  }
  assert.fail(`condition was not reached within ${timeoutMs}ms`);
};

test("time alone never creates units for either online player", () => {
  const simulation = new OnlineMatchSimulation("idle", { left: "left-id", right: "right-id" }, 10);
  advance(simulation, 10_000);
  assert.equal(simulation.snapshot().units.length, 0);
});

test("server strictly validates TMJ deployment, loadout, gold, caps and command ids", () => {
  const simulation = new OnlineMatchSimulation("spawn", { left: "left-id", right: "right-id" }, 123);
  assert.equal(simulation.spawn("left-id", command("left-worker", "peasant")).ok, true);
  assert.equal(simulation.spawn("left-id", command("left-sword", "swordsman", left.maxX)).ok, true);
  assert.equal(simulation.spawn("right-id", command("right-sword", "swordsman", right.minX)).ok, true);

  const duplicate = simulation.spawn("right-id", command("right-sword", "swordsman", right.minX));
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) assert.equal(duplicate.error.code, "DUPLICATE_COMMAND");
  assert.equal(simulation.snapshot().units.length, 3);

  const outside = simulation.spawn("right-id", command("outside", "peasant", right.minX - 0.01));
  assert.equal(outside.ok, false);
  if (!outside.ok) assert.equal(outside.error.code, "INVALID_DEPLOY_X");
  const campaignOnly = simulation.spawn("right-id", command("campaign-unit", "mage", right.minX));
  assert.equal(campaignOnly.ok, false);
  if (!campaignOnly.ok) assert.equal(campaignOnly.error.code, "UNKNOWN_UNIT");
});

test("combat units have no count cap while gold remains authoritative", () => {
  const simulation = new OnlineMatchSimulation("uncapped-combat", { left: "left-id", right: "right-id" }, 124);
  advance(simulation, 1_600_000);

  for (let index = 0; index < 102; index += 1) {
    assert.equal(
      simulation.spawn("left-id", command(`left-combat-${index}`, "swordsman", left.maxX, 180 + index % 10 * 32)).ok,
      true,
    );
    assert.equal(
      simulation.spawn("right-id", command(`right-combat-${index}`, "swordsman", right.minX, 180 + index % 10 * 32)).ok,
      true,
    );
  }

  const snapshot = simulation.snapshot();
  assert.equal(snapshot.units.filter((unit) => unit.side === "left" && unit.type === "swordsman").length, 102);
  assert.equal(snapshot.units.filter((unit) => unit.side === "right" && unit.type === "swordsman").length, 102);
  const noGold = simulation.spawn("left-id", command("left-no-gold", "swordsman", left.maxX, 320));
  assert.equal(noGold.ok, false);
  if (!noGold.ok) assert.equal(noGold.error.code, "NOT_ENOUGH_GOLD");
});

test("worker delivery and passive income are calculated only by the server", () => {
  const simulation = new OnlineMatchSimulation("worker", { left: "left-id", right: "right-id" }, 456);
  assert.equal(simulation.spawn("left-id", command("worker", "peasant")).ok, true);
  advanceUntil(simulation, () => simulation.snapshot().units.length === 0, 30_000);
  const snapshot = simulation.snapshot();
  assert.equal(snapshot.units.length, 0);
  assert.ok(snapshot.left.gold >= 16);
  assert.ok(snapshot.right.gold >= 12);
});

test("both online sides reserve one nearest tree per worker and harvest it in stages", () => {
  const simulation = new OnlineMatchSimulation("two-workers", { left: "left-id", right: "right-id" }, 654);
  const initialResources = simulation.snapshot().resources;
  assert.equal(initialResources.filter((resource) => resource.side === "left").length, 2);
  assert.equal(initialResources.filter((resource) => resource.side === "right").length, 2);
  for (const resource of initialResources) {
    assert.equal(ONLINE_MAP_NAVIGATION.isResourcePlacementSafe(resource.x, resource.y), true);
  }

  assert.equal(simulation.spawn("left-id", command("left-worker-1", "peasant", left.minX, 240)).ok, true);
  assert.equal(simulation.spawn("left-id", command("left-worker-2", "peasant", left.maxX, 500)).ok, true);
  assert.equal(simulation.spawn("right-id", command("right-worker-1", "peasant", right.minX, 240)).ok, true);
  assert.equal(simulation.spawn("right-id", command("right-worker-2", "peasant", right.maxX, 500)).ok, true);
  const assigned = simulation.snapshot().units.filter((unit) => unit.type === "peasant");
  assert.equal(new Set(assigned.filter((unit) => unit.side === "left").map((unit) => unit.resourceId)).size, 2);
  assert.equal(new Set(assigned.filter((unit) => unit.side === "right").map((unit) => unit.resourceId)).size, 2);
  for (const unit of assigned) {
    const ownResources = initialResources.filter((resource) => resource.side === unit.side);
    const nearest = ownResources.sort((a, b) =>
      Math.hypot(a.x - unit.x, a.y - unit.y) - Math.hypot(b.x - unit.x, b.y - unit.y)
    )[0];
    assert.equal(unit.resourceId, nearest.id);
  }
  const leftThird = simulation.spawn("left-id", command("left-worker-3", "peasant", left.minX, 360));
  const rightThird = simulation.spawn("right-id", command("right-worker-3", "peasant", right.maxX, 360));
  assert.equal(leftThird.ok, false);
  assert.equal(rightThird.ok, false);
  if (!leftThird.ok) assert.equal(leftThird.error.code, "UNIT_CAP");
  if (!rightThird.ok) assert.equal(rightThird.error.code, "UNIT_CAP");

  advance(simulation, 20_000);
  const harvestedResources = simulation.snapshot().resources;
  for (const resource of harvestedResources) {
    assert.equal(ONLINE_MAP_NAVIGATION.isResourcePlacementSafe(resource.x, resource.y), true);
    assert.equal(resource.amount, resource.maxAmount - ONLINE_MATCH_CONFIG.workerCarryCapacity);
    assert.equal(resource.revision, 0);
    assert.equal(resource.respawnAtMs, 0);
    const previous = initialResources.find((candidate) => candidate.id === resource.id)!;
    assert.equal(resource.x, previous.x);
    assert.equal(resource.y, previous.y);
  }
});

test("an online tree respawns near its old safe cell only after depletion delay", () => {
  const simulation = new OnlineMatchSimulation("tree-respawn", { left: "left-id", right: "right-id" }, 655);
  const initial = simulation.snapshot().resources.find((resource) => resource.side === "left")!;
  const spawnX = left.maxX;

  for (let cycle = 1; cycle <= 3; cycle += 1) {
    assert.equal(simulation.spawn("left-id", command(`harvest-${cycle}`, "peasant", spawnX, initial.y)).ok, true);
    advanceUntil(simulation, () => !simulation.snapshot().units.some((unit) => unit.side === "left"), 30_000);
    const resource = simulation.snapshot().resources.find((candidate) => candidate.id === initial.id)!;
    assert.equal(resource.amount, resource.maxAmount - cycle * ONLINE_MATCH_CONFIG.workerCarryCapacity);
    assert.equal(resource.revision, 0);
  }

  assert.equal(simulation.spawn("left-id", command("harvest-4", "peasant", spawnX, initial.y)).ok, true);
  advanceUntil(
    simulation,
    () => simulation.snapshot().resources.find((resource) => resource.id === initial.id)?.amount === 0,
    30_000,
  );
  const depleted = simulation.snapshot().resources.find((resource) => resource.id === initial.id)!;
  assert.equal(depleted.revision, 0);
  assert.ok(depleted.respawnAtMs > 0);
  assert.equal(depleted.x, initial.x);
  assert.equal(depleted.y, initial.y);

  advance(simulation, ONLINE_MATCH_CONFIG.resourceRespawnMs - 500);
  assert.equal(simulation.snapshot().resources.find((resource) => resource.id === initial.id)?.amount, 0);
  advance(simulation, 1_000);
  const respawned = simulation.snapshot().resources.find((resource) => resource.id === initial.id)!;
  assert.equal(respawned.amount, respawned.maxAmount);
  assert.equal(respawned.revision, 1);
  assert.equal(respawned.respawnAtMs, 0);
  assert.equal(ONLINE_MAP_NAVIGATION.isResourcePlacementSafe(respawned.x, respawned.y), true);
  const distance = Math.hypot(respawned.x - initial.x, respawned.y - initial.y);
  assert.ok(distance >= ONLINE_MATCH_CONFIG.resourceRespawnNearMin - 0.01);
  assert.ok(distance <= ONLINE_MATCH_CONFIG.resourceRespawnNearMax + 0.01);
});

test("TMJ navigation keeps every combat type walkable and reaches castle contact", () => {
  for (const type of ["swordsman", "archer", "horseman"] as const) {
    const simulation = new OnlineMatchSimulation(`navigation-${type}`, { left: "left-id", right: "right-id" }, 22);
    if (type === "horseman") advance(simulation, 8_000);
    assert.equal(simulation.spawn("left-id", command(type, type, left.maxX, 320)).ok, true);
    advance(simulation, 30_000, () => {
      for (const unit of simulation.snapshot().units) {
        assert.equal(ONLINE_MAP_NAVIGATION.isWalkableWorld(unit.x, unit.y), true, `${type} blocked at ${unit.x},${unit.y}`);
      }
    });
    const snapshot = simulation.snapshot();
    const attacker = snapshot.units.find((unit) => unit.side === "left");
    assert.ok(snapshot.right.castleHp < snapshot.right.castleMaxHp, `${type} did not touch castle`);
    assert.ok(attacker, `${type} disappeared before castle contact`);
    assert.equal(attacker.state, "attackingCastle");
    const stats = ONLINE_UNIT_STATS[attacker.type];
    const isRanged = stats.range > 80;
    const maxDistance = isRanged ? Math.min(stats.range, 160) + 2 : 18;
    assert.ok(Math.abs(attacker.x - ONLINE_MATCH_CONFIG.rightCastleFrontX) <= maxDistance);
  }
});

test("right player reaches the mirrored CastleAnchor contact before attacking", () => {
  const simulation = new OnlineMatchSimulation("right-contact", { left: "left-id", right: "right-id" }, 23);
  assert.equal(simulation.spawn("right-id", command("right-contact", "archer", right.minX, 320)).ok, true);
  advance(simulation, 30_000);
  const snapshot = simulation.snapshot();
  const attacker = snapshot.units.find((unit) => unit.side === "right");
  assert.ok(snapshot.left.castleHp < snapshot.left.castleMaxHp);
  assert.ok(attacker);
  assert.equal(attacker.state, "attackingCastle");
  const stats = ONLINE_UNIT_STATS[attacker.type];
  const isRanged = stats.range > 80;
  const maxDistance = isRanged ? Math.min(stats.range, 160) + 2 : 18;
  assert.ok(Math.abs(attacker.x - ONLINE_MATCH_CONFIG.leftCastleFrontX) <= maxDistance);
});

test("missile and ice are symmetric, server authoritative and idempotent", () => {
  const simulation = new OnlineMatchSimulation("powers", { left: "left-id", right: "right-id" }, 33);
  assert.equal(simulation.spawn("right-id", command("right-archer", "archer", right.minX, 320)).ok, true);
  const missile = simulation.usePower("left-id", { commandId: "m1", power: "missile", x: right.minX, y: 320 });
  assert.equal(missile.ok, true);
  assert.equal(simulation.usePower("left-id", { commandId: "m1", power: "missile", x: right.minX, y: 320 }).ok, false);
  const cooldown = simulation.usePower("left-id", { commandId: "m2", power: "missile", x: right.minX, y: 320 });
  assert.equal(cooldown.ok, false);
  if (!cooldown.ok) assert.equal(cooldown.error.code, "POWER_COOLDOWN");
  advance(simulation, 600);
  assert.equal(simulation.snapshot().units.length, 0);

  assert.equal(simulation.spawn("left-id", command("left-archer", "archer", left.maxX, 320)).ok, true);
  const ice = simulation.usePower("right-id", { commandId: "i1", power: "ice", x: left.maxX, y: 320 });
  assert.equal(ice.ok, true);
  const frozen = simulation.snapshot().units.find((unit) => unit.side === "left");
  assert.ok(frozen && frozen.iceUntilMs >= 6_000);
  const frozenX = frozen.x;
  advance(simulation, 3_000);
  assert.equal(simulation.snapshot().units.find((unit) => unit.side === "left")?.x, frozenX);
  assert.equal(simulation.snapshot().left.castleHp, ONLINE_MATCH_CONFIG.castleHp);
  assert.equal(simulation.snapshot().right.castleHp, ONLINE_MATCH_CONFIG.castleHp);
});

test("online match does not end because time passes", () => {
  const simulation = new OnlineMatchSimulation("unlimited", { left: "left-id", right: "right-id" }, 44);
  let gameEnd;
  for (let elapsed = 0; elapsed < 180_000; elapsed += 200) {
    gameEnd = simulation.tick(200) ?? gameEnd;
  }
  assert.equal(gameEnd, undefined);
  assert.equal(simulation.snapshot().left.castleHp, ONLINE_MATCH_CONFIG.castleHp);
  assert.equal(simulation.snapshot().right.castleHp, ONLINE_MATCH_CONFIG.castleHp);
});

test("match produces one authoritative winner and disconnect has no bot takeover", () => {
  const simulation = new OnlineMatchSimulation("end", { left: "left-id", right: "right-id" }, 789);
  const disconnect = simulation.endForDisconnect("right-id");
  assert.equal(disconnect?.winnerId, "left-id");
  assert.equal(disconnect?.reason, "disconnect");
  assert.equal(simulation.tick(200), undefined);
});

test("all 20 maps in ONLINE_MAP_POOL initialize a valid simulation with correct castle contact", () => {
  assert.equal(ONLINE_MAP_POOL.length, 20);
  const leftFacades = new Set<number>();
  const rightFacades = new Set<number>();
  for (const mapId of ONLINE_MAP_POOL) {
    const contract = getOnlineMapContract(mapId);
    assert.equal(contract.mapId, mapId);
    // Regression lock: each server room must use this map's exact TMJ
    // CastleAnchor inner edge, never a shared/static contact coordinate.
    assert.equal(contract.castleContactX.left, contract.sides.left.castle.maxX);
    assert.equal(contract.castleContactX.right, contract.sides.right.castle.minX);
    leftFacades.add(contract.castleContactX.left);
    rightFacades.add(contract.castleContactX.right);
    const simulation = new OnlineMatchSimulation(`pool-${mapId}`, { left: "p1", right: "p2" }, 1234, contract);
    assert.equal(simulation.mapId, mapId);
    const snapshot = simulation.snapshot();
    assert.equal(snapshot.left.castleHp, ONLINE_MATCH_CONFIG.castleHp);
    assert.equal(snapshot.right.castleHp, ONLINE_MATCH_CONFIG.castleHp);
    assert.equal(snapshot.resources.length, 4);
  }
  assert.ok(leftFacades.size > 5, "left castle facades must vary with the TMJ maps");
  assert.ok(rightFacades.size > 5, "right castle facades must vary with the TMJ maps");
});

test("both armies reach every TMJ castle facade without entering its CastleAnchor", () => {
  for (const mapId of ONLINE_MAP_POOL) {
    const contract = getOnlineMapContract(mapId);
    const deployY = (contract.deployBounds.left.minY + contract.deployBounds.left.maxY) / 2;

    const leftSimulation = new OnlineMatchSimulation(
      `left-facade-${mapId}`,
      { left: "left-id", right: "right-id" },
      4321,
      contract,
    );
    assert.equal(
      leftSimulation.spawn(
        "left-id",
        command(`left-${mapId}`, "swordsman", contract.deployBounds.left.maxX, deployY),
      ).ok,
      true,
      `${mapId}: left spawn failed`,
    );
    advanceUntil(
      leftSimulation,
      () => leftSimulation.snapshot().right.castleHp < leftSimulation.snapshot().right.castleMaxHp,
      60_000,
    );
    const leftAttacker = leftSimulation.snapshot().units.find((unit) => unit.side === "left");
    assert.ok(leftAttacker, `${mapId}: left attacker disappeared before contact`);
    assert.equal(leftAttacker.state, "attackingCastle", `${mapId}: left attacker never attacked the castle`);
    assert.ok(
      leftAttacker.x < contract.sides.right.castle.minX,
      `${mapId}: left attacker entered enemy CastleAnchor at ${leftAttacker.x}`,
    );

    const rightSimulation = new OnlineMatchSimulation(
      `right-facade-${mapId}`,
      { left: "left-id", right: "right-id" },
      4321,
      contract,
    );
    assert.equal(
      rightSimulation.spawn(
        "right-id",
        command(`right-${mapId}`, "swordsman", contract.deployBounds.right.minX, deployY),
      ).ok,
      true,
      `${mapId}: right spawn failed`,
    );
    advanceUntil(
      rightSimulation,
      () => rightSimulation.snapshot().left.castleHp < rightSimulation.snapshot().left.castleMaxHp,
      60_000,
    );
    const rightAttacker = rightSimulation.snapshot().units.find((unit) => unit.side === "right");
    assert.ok(rightAttacker, `${mapId}: right attacker disappeared before contact`);
    assert.equal(rightAttacker.state, "attackingCastle", `${mapId}: right attacker never attacked the castle`);
    assert.ok(
      rightAttacker.x > contract.sides.left.castle.maxX,
      `${mapId}: right attacker entered player CastleAnchor at ${rightAttacker.x}`,
    );
  }
});
