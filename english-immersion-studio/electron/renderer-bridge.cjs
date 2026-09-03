const { WebSocketServer, WebSocket } = require("ws");

const DEFAULT_PORT = 7790;
const MAX_MESSAGE_BYTES = 4 * 1024 * 1024;
const MAX_FACE_CHANNELS = 81;
const MAX_FACE_FRAMES = 60 * 120;

function isAvatarState(message) {
  return Boolean(
    message &&
    message.version === 1 &&
    message.type === "avatar.state" &&
    typeof message.payload === "object" &&
    typeof message.payload.avatarId === "string" &&
    typeof message.payload.hairId === "string" &&
    typeof message.payload.outfitId === "string"
  );
}

function isSpeechCommand(message) {
  if (!message || message.version !== 1 || typeof message.payload !== "object") {
    return false;
  }
  if (message.type === "speech.stop") {
    return typeof message.payload.utteranceId === "string";
  }
  if (message.type === "speech.face") {
    const channels = message.payload.arkit_raw;
    const entries =
      channels && typeof channels === "object"
        ? Object.entries(channels)
        : [];
    const frameCount = Number(message.payload.n_frames);
    return Boolean(
      Number.isFinite(message.payload.fps) &&
      message.payload.fps > 0 &&
      message.payload.fps <= 120 &&
      Number.isFinite(message.payload.duration) &&
      message.payload.duration > 0 &&
      Number.isInteger(frameCount) &&
      frameCount > 0 &&
      frameCount <= MAX_FACE_FRAMES &&
      entries.length > 0 &&
      entries.length <= MAX_FACE_CHANNELS &&
      entries.every(
        ([name, values]) =>
          typeof name === "string" &&
          name.length > 0 &&
          name.length <= 80 &&
          Array.isArray(values) &&
          values.length === frameCount &&
          values.every(
            (value) =>
              Number.isFinite(value) &&
              value >= -2 &&
              value <= 2
          )
      )
    );
  }
  return Boolean(
    message.type === "speech.timeline" &&
    typeof message.payload.utteranceId === "string" &&
    Number.isFinite(message.payload.offsetMs) &&
    Array.isArray(message.payload.cues) &&
    message.payload.cues.every(
      (cue) =>
        Number.isFinite(cue?.atMs) &&
        typeof cue?.shape === "string"
    )
  );
}

function isRendererCommand(message) {
  return Boolean(
    isAvatarState(message) ||
    isSpeechCommand(message) ||
    (
      message &&
      message.version === 1 &&
      message.type === "renderer.performance" &&
      typeof message.payload === "object" &&
      ["inference", "interactive"].includes(message.payload.mode)
    )
  );
}

function createRendererBridge(port = DEFAULT_PORT) {
  const clients = new Set();
  let latestState = null;
  let activePort = port;
  const server = new WebSocketServer({
    host: "127.0.0.1",
    port,
    maxPayload: MAX_MESSAGE_BYTES
  });
  const ready = new Promise((resolve) => {
    server.once("listening", () => {
      const address = server.address();
      if (address && typeof address === "object") activePort = address.port;
      resolve(activePort);
    });
  });

  server.on("connection", (socket, request) => {
    if (request.socket.remoteAddress !== "127.0.0.1" &&
        request.socket.remoteAddress !== "::1") {
      socket.close(1008, "Local connections only");
      return;
    }

    clients.add(socket);
    if (latestState) socket.send(JSON.stringify(latestState));
    socket.on("close", () => clients.delete(socket));
  });

  server.on("error", (error) => {
    console.error("MetaHuman renderer bridge failed:", error);
  });

  return {
    get port() {
      return activePort;
    },
    ready,
    publish(message) {
      if (!isRendererCommand(message)) return false;
      if (isAvatarState(message)) latestState = message;
      const payload = JSON.stringify(message);
      for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) client.send(payload);
      }
      return true;
    },
    close() {
      for (const client of clients) client.close(1001, "Application closing");
      clients.clear();
      server.close();
    }
  };
}

module.exports = {
  createRendererBridge,
  isAvatarState,
  isRendererCommand,
  isSpeechCommand,
  DEFAULT_PORT
};
