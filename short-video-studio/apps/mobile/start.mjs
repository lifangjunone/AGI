import { networkInterfaces } from "node:os";
import { startServer } from "../../server.mjs";

function localAddresses(port) {
  return Object.values(networkInterfaces())
    .flat()
    .filter(
      (entry) =>
        entry?.family === "IPv4" &&
        !entry.internal &&
        !entry.address.startsWith("169.254.")
    )
    .map((entry) => `http://${entry.address}:${port}/mobile/`);
}

const instance = await startServer({
  host: process.env.HOST || "0.0.0.0",
  port: Number(process.env.PORT || 4317)
});

console.log(`Mobile Studio: http://127.0.0.1:${instance.port}/mobile/`);
for (const address of localAddresses(instance.port)) {
  console.log(`On your phone: ${address}`);
}
