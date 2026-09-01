const test = require("node:test");
const assert = require("node:assert/strict");
const WebSocket = require("ws");
const {
  createRendererBridge,
  isAvatarState
} = require("./renderer-bridge.cjs");

const validState = {
  version: 1,
  type: "avatar.state",
  payload: {
    avatarId: "j-fashion-01",
    hairId: "long-straight",
    outfitId: "executive"
  }
};

test("accepts a complete versioned avatar state", () => {
  assert.equal(isAvatarState(validState), true);
});

test("rejects malformed or incompatible renderer messages", () => {
  assert.equal(isAvatarState(null), false);
  assert.equal(isAvatarState({ version: 2, type: "avatar.state" }), false);
  assert.equal(
    isAvatarState({
      version: 1,
      type: "avatar.state",
      payload: { avatarId: "j-fashion-01", outfitId: "executive" }
    }),
    false
  );
});

test("replays the latest avatar state to a renderer", async () => {
  const bridge = createRendererBridge(0);
  await bridge.ready;
  assert.equal(bridge.publish(validState), true);

  const message = await new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${bridge.port}`);
    socket.once("message", (data) => {
      resolve(JSON.parse(data.toString()));
      socket.close();
    });
    socket.once("error", reject);
  });

  assert.deepEqual(message, validState);
  bridge.close();
});
