import assert from "node:assert/strict";
import test from "node:test";
import { ClientMessages, ServerMessages, type NetworkMessage } from "../network/NetworkProtocol";
import { Player } from "../state/Player";
import { GameRoom } from "./GameRoom";

class FakeSocket {
  sent: NetworkMessage[] = [];

  getBufferedAmount() {
    return 0;
  }

  send(serialized: string) {
    this.sent.push(JSON.parse(serialized) as NetworkMessage);
  }
}

const createPlayer = (id: string, side: "left" | "right") => {
  const socket = new FakeSocket();
  const player = new Player(id, socket);
  player.side = side;
  player.roomId = "room-ready";
  return { player, socket };
};

test("online room waits for both loaded clients before game start and simulation ticks", () => {
  const left = createPlayer("left-id", "left");
  const right = createPlayer("right-id", "right");
  const room = new GameRoom("room-ready", left.player, right.player, 123);

  room.start();
  room.tick(5_000);

  assert.equal(left.socket.sent.some((message) => message.type === ServerMessages.INITIAL_STATE), true);
  assert.equal(right.socket.sent.some((message) => message.type === ServerMessages.INITIAL_STATE), true);
  assert.equal(left.socket.sent.some((message) => message.type === ServerMessages.GAME_START), false);
  assert.equal(right.socket.sent.some((message) => message.type === ServerMessages.GAME_START), false);
  assert.equal(left.socket.sent.some((message) => message.type === ServerMessages.MATCH_STATE), false);

  room.handleClientMessage(left.player, { type: ClientMessages.READY });
  room.tick(5_000);
  assert.equal(left.socket.sent.some((message) => message.type === ServerMessages.GAME_START), false);

  room.handleClientMessage(right.player, { type: ClientMessages.READY });
  assert.equal(left.socket.sent.some((message) => message.type === ServerMessages.GAME_START), true);
  assert.equal(right.socket.sent.some((message) => message.type === ServerMessages.GAME_START), true);

  const firstSnapshot = left.socket.sent.find((message) => message.type === ServerMessages.MATCH_STATE);
  assert.ok(firstSnapshot);
  assert.equal(firstSnapshot.payload.elapsedMs, 0);

  const snapshotCount = () => left.socket.sent.filter(
    (message) => message.type === ServerMessages.MATCH_STATE,
  ).length;
  assert.equal(snapshotCount(), 1);
  room.tick(50);
  room.tick(49);
  assert.equal(snapshotCount(), 1, "20 Hz simulation must not imply 20 Hz network snapshots");
  room.tick(1);
  assert.equal(snapshotCount(), 2, "the room should present one snapshot per 100 ms");
  room.tick(50);
  assert.equal(snapshotCount(), 2);
  room.tick(50);
  assert.equal(snapshotCount(), 3);
});

test("online king emotes are validated and broadcast to both players", () => {
  const left = createPlayer("left-id", "left");
  const right = createPlayer("right-id", "right");
  const room = new GameRoom("room-ready", left.player, right.player, 456);

  room.start();
  room.handleClientMessage(left.player, { type: ClientMessages.READY });
  room.handleClientMessage(right.player, { type: ClientMessages.READY });
  room.handleClientMessage(left.player, {
    type: ClientMessages.SEND_EMOTE,
    payload: { emote: "laugh" },
  });

  for (const socket of [left.socket, right.socket]) {
    const message = socket.sent.find((candidate) => candidate.type === ServerMessages.EMOTE);
    assert.ok(message);
    assert.equal(message.payload.side, "left");
    assert.equal(message.payload.emote, "laugh");
  }

  room.handleClientMessage(right.player, {
    type: ClientMessages.SEND_EMOTE,
    payload: { emote: "not-an-emote" },
  });
  const error = right.socket.sent.find(
    (candidate) => candidate.type === ServerMessages.ERROR && candidate.payload.code === "INVALID_EMOTE",
  );
  assert.ok(error);
});
