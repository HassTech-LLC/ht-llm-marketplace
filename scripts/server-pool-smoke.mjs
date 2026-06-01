import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const daemonPort = Number(process.env.HT_SERVER_POOL_SMOKE_PORT || await freePort());
const poolPort = Number(process.env.HT_SERVER_POOL_BASE_PORT || await freePort());
const base = `http://127.0.0.1:${daemonPort}`;
const smokeHome = process.env.HT_SERVER_POOL_SMOKE_HOME || path.join(os.tmpdir(), "htlm-server-pool-smoke");
const autoInstall = process.env.HT_SERVER_POOL_AUTO_INSTALL !== "0";
const requireLivePool = process.env.HT_SERVER_POOL_REQUIRE_LIVE === "1";
const installFlavor = process.env.HT_SERVER_POOL_INSTALL_FLAVOR || "auto";
const release = process.env.HT_SERVER_POOL_LLAMA_RELEASE;
const managedBinary = process.env.LLAMA_SERVER_BIN || findExistingManagedBinary();

const daemon = spawn(process.execPath, ["packages/daemon/dist/index.js"], {
  env: {
    ...process.env,
    ...(managedBinary ? { LLAMA_SERVER_BIN: managedBinary } : {}),
    HT_MARKETPLACE_PORT: String(daemonPort),
    HT_MARKETPLACE_HOME: smokeHome
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true
});

const stderr = [];
daemon.stderr.on("data", (chunk) => stderr.push(chunk.toString()));
const stdout = [];
daemon.stdout.on("data", (chunk) => stdout.push(chunk.toString()));
let daemonExit;
daemon.once("exit", (code, signal) => {
  daemonExit = { code, signal };
});

const checks = [];
try {
  await waitForHealth(base, stderr);
  const models = await selectSmallPhysicalChatModels(2);
  checks.push({ name: "small-chat-models", ok: models.length >= 1, models: models.map((model) => ({ name: model.name, sizeBytes: model.sizeBytes })) });
  if (models.length === 0) throw new Error("No physical chat GGUF model is indexed.");

  let serverStatus = await json("GET", "/api/engine/server/status");
  if (!serverStatus.available && autoInstall) {
    const install = await json(
      "POST",
      "/api/engine/server/install",
      {
        flavor: installFlavor,
        ...(release ? { release } : {})
      },
      300_000
    );
    checks.push({ name: "managed-install", ok: install.ok === true && install.installed === true, message: install.message });
    serverStatus = await json("GET", "/api/engine/server/status");
  }
  checks.push({
    name: "pool-binary-available",
    ok: serverStatus.available === true || !requireLivePool,
    skipped: serverStatus.available !== true,
    message: serverStatus.message
  });

  const maxModelBytes = Math.max(...models.map((model) => model.sizeBytes || 0), 1_000_000_000) + 512 * 1024 * 1024;
  const configured = await json("PUT", "/api/engine/config", {
    backend: "delegated-server",
    residencyMode: "fast-parallel",
    contextSize: 512,
    delegatedServer: {
      enabled: true,
      port: poolPort,
      parallel: 2,
      continuousBatching: true
    },
    hotPool: {
      enabled: true,
      maxModels: Math.max(2, models.length),
      maxModelBytes,
      autoWarm: true
    }
  });
  checks.push({
    name: "fast-parallel-config",
    ok: configured.config?.backend === "delegated-server" && configured.config?.residencyMode === "fast-parallel",
    port: configured.config?.delegatedServer?.port
  });

  const plan = await json("GET", "/api/engine/residency");
  checks.push({
    name: "fast-parallel-plan",
    ok: plan.plan?.mode === "fast-parallel" && Array.isArray(plan.plan?.selected) && plan.plan.selected.length >= 1,
    selected: plan.plan?.selected?.map((candidate) => candidate.model?.name),
    memory: plan.plan?.memory
  });

  const warmed = await json("POST", "/api/engine/server/pool/warm", {}, 45_000);
  checks.push({
    name: "pool-warm-request",
    ok: Array.isArray(warmed.entries) && warmed.entries.length === plan.plan.selected.length,
    entries: warmed.entries
  });

  let poolStatus = await waitForPoolStatus(serverStatus.available);
  const runningEntries = poolStatus.entries.filter((entry) => entry.state === "running" && entry.endpoint);
  const expectedRunning = serverStatus.available ? (plan.plan?.selected?.length || 0) : 0;
  checks.push({
    name: "pool-running",
    ok: runningEntries.length === expectedRunning || (!serverStatus.available && !requireLivePool),
    skipped: runningEntries.length === 0,
    expectedRunning,
    entries: poolStatus.entries
  });

  if (runningEntries.length > 0) {
    for (const entry of runningEntries) {
      try {
        const health = await fetch(`${entry.endpoint}/health`, { signal: AbortSignal.timeout(10_000) });
        checks.push({ name: `direct-health:${entry.model}`, ok: health.ok, status: health.status, endpoint: entry.endpoint });
      } catch (error) {
        checks.push({
          name: `direct-health:${entry.model}`,
          ok: false,
          endpoint: entry.endpoint,
          error: errorSummary(error)
        });
      }
    }

    const target = runningEntries[0];
    const chat = await json(
      "POST",
      "/v1/chat/completions",
      {
        model: target.model,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 8,
        stream: false
      },
      120_000
    );
    checks.push({
      name: "pooled-routed-chat",
      ok: chat.object === "chat.completion" && typeof chat.choices?.[0]?.message?.content === "string",
      model: target.model,
      text: chat.choices?.[0]?.message?.content
    });
  }

  const ps = await json("GET", "/api/ps");
  checks.push({
    name: "api-ps-includes-pool-shape",
    ok: Array.isArray(ps.models),
    runningModels: ps.models?.map((model) => model.name)
  });

  const stopped = await json("POST", "/api/engine/server/pool/stop", {}, 30_000);
  checks.push({
    name: "pool-stop",
    ok: stopped.entries.length === 0,
    entries: stopped.entries
  });

  const quality = await json("PUT", "/api/engine/config", {
    backend: "in-process",
    residencyMode: "quality-single",
    contextSize: 2048,
    delegatedServer: {
      enabled: false,
      port: poolPort,
      parallel: 1,
      continuousBatching: true
    },
    hotPool: {
      enabled: true,
      maxModels: 4,
      maxModelBytes: Number(process.env.HT_SERVER_POOL_PRESSURE_MAX_BYTES || 80 * 1024 ** 3),
      autoWarm: false
    }
  });
  checks.push({ name: "quality-single-config", ok: quality.config?.residencyMode === "quality-single" });

  const pressure = await json("GET", "/api/engine/residency");
  checks.push({
    name: "quality-pressure-plan-nondestructive",
    ok: pressure.plan?.mode === "quality-single" && pressure.plan.selected.length <= 1,
    selected: pressure.plan?.selected?.map((candidate) => ({
      model: candidate.model?.name,
      estimatedVramBytes: candidate.estimatedVramBytes,
      estimatedRamBytes: candidate.estimatedRamBytes,
      action: candidate.action
    })),
    skipped: pressure.plan?.skipped?.slice(0, 5).map((candidate) => candidate.model?.name),
    memory: pressure.plan?.memory
  });

  poolStatus = await json("GET", "/api/engine/server/pool");
  checks.push({ name: "no-pool-left-running", ok: poolStatus.entries.length === 0, entries: poolStatus.entries });

  const ok = checks.every((check) => check.ok);
  console.log(JSON.stringify({ ok, base, poolPort, managedBinary, checks }, null, 2));
  if (!ok) process.exitCode = 1;
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        base,
        poolPort,
        managedBinary,
        fatal: errorSummary(error),
        daemonExit,
        checks,
        stderrTail: stderr.join("").slice(-2000),
        stdoutTail: stdout.join("").slice(-1000)
      },
      null,
      2
    )
  );
  process.exitCode = 1;
} finally {
  await status("POST", "/api/engine/server/pool/stop", {}, 30_000).catch(() => undefined);
  if (daemon.exitCode === null && daemon.signalCode === null) daemon.kill("SIGTERM");
}

async function waitForPoolStatus(binaryAvailable) {
  let last;
  for (let i = 0; i < 120; i += 1) {
    last = await json("GET", "/api/engine/server/pool");
    const entries = Array.isArray(last.entries) ? last.entries : [];
    if (!binaryAvailable) return last;
    if (entries.length > 0 && entries.every((entry) => entry.state === "running")) return last;
    if (entries.length > 0 && entries.every((entry) => entry.state !== "starting")) return last;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return last;
}

async function selectSmallPhysicalChatModels(limit) {
  const index = await json("GET", "/api/models/index");
  const models = Array.isArray(index.models) ? index.models : [];
  return models
    .filter((item) => item?.runnable && typeof item.path === "string" && !item.path.startsWith("virtual:") && isChatCandidate(item.name, item.path))
    .sort((a, b) => (a.sizeBytes || Number.MAX_SAFE_INTEGER) - (b.sizeBytes || Number.MAX_SAFE_INTEGER))
    .slice(0, limit);
}

async function json(method, route, body, timeoutMs = 30_000) {
  const res = await request(method, route, body, timeoutMs);
  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch (error) {
    throw new Error(`${method} ${route} returned invalid JSON (${res.status}): ${text.slice(0, 500)}; ${errorSummary(error)}`);
  }
  if (!res.ok) throw new Error(`${method} ${route} failed with ${res.status}: ${text.slice(0, 500)}`);
  return parsed;
}

async function status(method, route, body, timeoutMs = 30_000) {
  const res = await request(method, route, body, timeoutMs);
  return { status: res.status, text: await res.text() };
}

async function request(method, route, body, timeoutMs) {
  try {
    return await fetch(`${base}${route}`, {
      method,
      headers: body ? { "content-type": "application/json", "x-ht-marketplace-confirm": "privileged-action" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    throw new Error(`${method} ${route} request failed on ${base}: ${errorSummary(error)}`);
  }
}

async function waitForHealth(host, err) {
  for (let i = 0; i < 80; i += 1) {
    try {
      const res = await fetch(`${host}/health`);
      if (res.ok) return;
    } catch {
      // daemon may still be starting
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`daemon did not become healthy on ${host}; stderr: ${err.join("").slice(-1000)}`);
}

function errorSummary(error) {
  if (!error) return "unknown error";
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? `; cause=${error.cause.message}` : "";
    return `${error.name}: ${error.message}${cause}`;
  }
  return String(error);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function findExistingManagedBinary() {
  const root = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "HT LLM Marketplace", "tools", "llama-server");
  const manifestPath = path.join(root, "manifest.json");
  try {
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      if (typeof manifest.binaryPath === "string" && fs.existsSync(manifest.binaryPath)) return manifest.binaryPath;
    }
  } catch {
    // fall back to recursive discovery
  }
  return findBinaryRecursive(root, 4);
}

function findBinaryRecursive(root, depth) {
  if (depth < 0 || !fs.existsSync(root)) return undefined;
  const names = process.platform === "win32" ? ["llama-server.exe", "server.exe"] : ["llama-server", "server"];
  for (const name of names) {
    const candidate = path.join(root, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  if (depth === 0) return undefined;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const nested = findBinaryRecursive(path.join(root, entry.name), depth - 1);
    if (nested) return nested;
  }
  return undefined;
}

function isChatCandidate(name = "", filePath = "") {
  const text = `${name} ${filePath}`.toLowerCase();
  return !["embed", "embedding", "nomic", "bge", "rerank", "clip", "mmproj", "vision", "whisper", "tts"].some((marker) => text.includes(marker));
}
