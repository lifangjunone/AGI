const { WebSocketServer, WebSocket } = require("ws");

const DEFAULT_PORT = 7790;
const MAX_MESSAGE_BYTES = 16 * 1024;

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
      if (!isAvatarState(message)) return false;
      latestState = message;
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
  DEFAULT_PORT
};
