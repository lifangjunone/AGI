const test = require("node:test");
const assert = require("node:assert/strict");
const WebSocket = require("ws");
const {
  createRendererBridge,
  isAvatarState,
  isRendererCommand
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

test("accepts speech commands without replacing replayed avatar state", async () => {
  const bridge = createRendererBridge(0);
  await bridge.ready;
  bridge.publish(validState);
  assert.equal(
    bridge.publish({
      version: 1,
      type: "speech.timeline",
      payload: {
        utteranceId: "speech-1",
        offsetMs: 12,
        cues: [{ atMs: 0, shape: "sil" }]
      }
    }),
    true
  );
  assert.equal(
    isRendererCommand({
      version: 1,
      type: "speech.stop",
      payload: { utteranceId: "speech-1" }
    }),
    true
  );

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

test("accepts bounded ARKit face animation and rejects malformed frames", () => {
  const validFace = {
    version: 1,
    type: "speech.face",
    payload: {
      fps: 60,
      duration: 0.05,
      n_frames: 3,
      arkit_raw: {
        JawOpen: [0, 0.7, 0],
        MouthFunnel: [0, 0.2, 0]
      }
    }
  };

  assert.equal(isRendererCommand(validFace), true);
  assert.equal(
    isRendererCommand({
      ...validFace,
      payload: {
        ...validFace.payload,
        arkit_raw: { JawOpen: [0, Number.NaN, 0] }
      }
    }),
    false
  );
  assert.equal(
    isRendererCommand({
      ...validFace,
      payload: {
        ...validFace.payload,
        n_frames: 4
      }
    }),
    false
  );
});

test("accepts only known renderer performance modes", () => {
  assert.equal(
    isRendererCommand({
      version: 1,
      type: "renderer.performance",
      payload: { mode: "inference" }
    }),
    true
  );
  assert.equal(
    isRendererCommand({
      version: 1,
      type: "renderer.performance",
      payload: { mode: "unlimited" }
    }),
    false
  );
});
