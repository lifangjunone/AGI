import { startServer } from "../../server.mjs";

const instance = await startServer({
  host: process.env.HOST || "127.0.0.1",
  port: Number(process.env.PORT || 4321)
});

console.log(`Web Studio: http://${instance.host}:${instance.port}/web/`);
