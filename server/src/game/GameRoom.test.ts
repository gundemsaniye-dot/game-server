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
});
