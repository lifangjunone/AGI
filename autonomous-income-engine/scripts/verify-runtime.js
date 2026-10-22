const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const port = Number(process.env.AIE_VERIFY_PORT || 4199);
const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aie-runtime-verify-"));
const secret = "runtime-verification-secret-123456789";
const adminSecret = "runtime-admin-verification-secret-987654321";

function requestJson(pathname, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = http.get(
      {
        hostname: "127.0.0.1",
        port,
        path: pathname,
        timeout: 1000,
        headers,
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          try {
            resolve({
              statusCode: response.statusCode,
              body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
            });
          } catch (error) {
            reject(error);
          }
        });
      }
    );
    request.on("timeout", () => request.destroy(new Error("runtime verification request timed out")));
    request.on("error", reject);
  });
}

async function waitForStatus(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      return await requestJson("/api/status");
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  throw lastError || new Error("runtime verification service did not become healthy");
}

async function main() {
  const child = spawn(process.execPath, [path.join(ROOT, "src", "server.js")], {
    cwd: ROOT,
    env: {
      ...process.env,
      HOST: "0.0.0.0",
      PORT: String(port),
      AIE_DATA_DIR: path.join(stateRoot, "data"),
      AIE_RUNTIME_DIR: path.join(stateRoot, "runtime"),
      AIE_DIST_DIR: path.join(stateRoot, "dist"),
      AIE_PUBLIC_SITE_DIR: path.join(stateRoot, "public-site"),
      WECHAT_QR_PATH: path.join(ROOT, "assets", "wechat-pay.jpg"),
      ADAPTERS_FROM_ENV: "1",
      REQUIRE_PAYMENT_WEBHOOK_SECRET: "1",
      PAYMENT_WEBHOOK_SECRET: secret,
      REQUIRE_ADMIN_API_SECRET: "1",
      ADMIN_API_SECRET: adminSecret,
      ADMIN_MOBILE_PASSWORD: "runtime-mobile-password-123456",
      PAYMENT_AUTOSYNC: "0",
      COMMERCE_AUTORUN: "0",
      PUBLIC_ACCESS_MONITOR: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  try {
    const publicResponse = await waitForStatus();
    if (publicResponse.statusCode !== 200 || publicResponse.body?.ok !== true) {
      throw new Error(`runtime public status failed: HTTP ${publicResponse.statusCode}`);
    }
    if (publicResponse.body.status !== undefined || publicResponse.body.productId !== "product-image-batch-studio") {
      throw new Error("public runtime status leaked private operational state");
    }
    const response = await requestJson("/api/status", { "X-Admin-Secret": adminSecret });
    if (response.body.status?.adapters?.payments?.webhookSecretConfigured !== true) {
      throw new Error("runtime did not load the payment webhook secret");
    }
    for (const required of [
      path.join(stateRoot, "data", "adapters.json"),
      path.join(stateRoot, "dist", "index.html"),
      path.join(stateRoot, "public-site", "index.html"),
    ]) {
      if (!fs.existsSync(required)) throw new Error(`runtime did not persist required file: ${required}`);
    }
    console.log(
      JSON.stringify(
        {
          ok: true,
          listenHost: "0.0.0.0",
          port,
          paymentSecretConfigured: true,
          adminSecretConfigured: true,
          publicStatusRedacted: true,
          persistentStateVerified: true,
          orders: response.body.status.orders,
          revenue: response.body.status.revenue,
        },
        null,
        2
      )
    );
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once("exit", resolve);
      setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, 3000).unref();
    });
    fs.rmSync(stateRoot, { recursive: true, force: true });
    if (stderr.trim()) process.stderr.write(stderr);
    if (!stdout.includes("0.0.0.0")) {
      throw new Error(`runtime did not bind the external host\n${stdout}`);
    }
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
