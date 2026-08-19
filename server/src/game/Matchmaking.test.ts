import assert from "node:assert/strict";
import test from "node:test";
import { Player } from "../state/Player";
import { GameLoop } from "./GameLoop";
import { Matchmaking } from "./Matchmaking";
import { ONLINE_MAP_POOL } from "./OnlineMapContract";

test("matched players are attached to the authoritative room", () => {
  const socket = () => ({ send() {}, getBufferedAmount: () => 0 });
  const left = new Player("left-id", socket());
  const right = new Player("right-id", socket());
  const matchmaking = new Matchmaking(new GameLoop());

  matchmaking.addToQueue(left);
  matchmaking.addToQueue(right);

  assert.ok(left.roomId);
  assert.equal(right.roomId, left.roomId);
  assert.equal(left.side, "left");
  assert.equal(right.side, "right");
  assert.ok(typeof left.mapId === "string" && ONLINE_MAP_POOL.includes(left.mapId));
  assert.equal(right.mapId, left.mapId);
});
