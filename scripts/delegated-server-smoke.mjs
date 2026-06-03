import { spawn } from "node:child_process";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const daemonPort = Number(process.env.HT_DELEGATED_SMOKE_PORT || await freePort());
const delegatedPort = Number(process.env.LLAMA_SERVER_PORT || process.env.HT_DELEGATED_LLAMA_PORT || await freePort());
const base = `http://127.0.0.1:${daemonPort}`;
const smokeHome = process.env.HT_DELEGATED_SMOKE_HOME || path.join(os.tmpdir(), "htlm-delegated-server-smoke");
const autoInstall = process.env.HT_DELEGATED_AUTO_INSTALL !== "0";
const requireInstall = process.env.HT_DELEGATED_REQUIRE_INSTALL === "1";
const installFlavor = process.env.HT_DELEGATED_INSTALL_FLAVOR || "auto";
const release = process.env.HT_DELEGATED_LLAMA_RELEASE;

const daemon = spawn(process.execPath, ["packages/daemon/dist/index.js"], {
  env: {
    ...process.env,
    HT_MARKETPLACE_PORT: String(daemonPort),
    HT_MARKETPLACE_HOME: smokeHome,
    LLAMA_SERVER_PORT: String(delegatedPort)
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true
});

const stderr = [];
daemon.stderr.on("data", (chunk) => stderr.push(chunk.toString()));

let shouldStopDelegated = false;

try {
  await waitForHealth(base, stderr);
  const model = await selectPhysicalChatModel();
  const checks = [{ name: "physical-chat-model", ok: Boolean(model), model: model?.name, path: model?.path }];
  if (!model) throw new Error("No physical chat GGUF model is indexed.");

  const initialStatus = await json("GET", "/api/engine/server/status");
  let install;
  if (!initialStatus.available) {
    if (!autoInstall && requireInstall) {
      throw new Error(`llama-server binary is required but unavailable: ${initialStatus.message}`);
    }
    if (!autoInstall) {
      throw new Error(`llama-server binary unavailable and auto install disabled: ${initialStatus.message}`);
    }
    install = await json("POST", "/api/engine/server/install", {
      flavor: installFlavor,
      ...(release ? { release } : {})
    }, 300_000);
    checks.push({ name: "managed-install", ok: install.ok === true && install.installed === true, message: install.message, binaryPath: install.binaryPath });
  } else {
    checks.push({ name: "binary-discovered", ok: true, message: initialStatus.message });
  }

  // Load once so the daemon has a deterministic selected model path for delegated startup.
  const loaded = await json("POST", "/api/runtimes/llamacpp/load", { path: model.path }, 180_000);
  checks.push({ name: "selected-model-loaded-for-startup", ok: loaded.ok === true, loaded: loaded.loaded });

  const configured = await json("PUT", "/api/engine/config", {
    backend: "delegated-server",
    delegatedServer: {
      enabled: true,
      port: delegatedPort,
      parallel: 2,
      continuousBatching: true
    },
    hotPool: { enabled: false }
  });
  checks.push({
    name: "delegated-config",
    ok: configured.config?.backend === "delegated-server" && configured.config?.delegatedServer?.enabled === true,
    port: configured.config?.delegatedServer?.port
  });

  const started = await json("POST", "/api/engine/server/start", {}, 30_000);
  shouldStopDelegated = true;
  checks.push({ name: "start-request", ok: started.available === true, running: started.running, message: started.message });
  const delegatedStatus = await waitForDelegatedRunning();
  checks.push({ name: "status-running", ok: delegatedStatus.available === true && delegatedStatus.running === true && Boolean(delegatedStatus.endpoint), status: delegatedStatus });

  const delegatedBase = delegatedStatus.endpoint || `http://127.0.0.1:${delegatedPort}`;
  const delegatedHealth = await fetch(`${delegatedBase}/health`, { signal: AbortSignal.timeout(10_000) });
  checks.push({ name: "direct-health", ok: delegatedHealth.ok, status: delegatedHealth.status });

  const directModels = await fetch(`${delegatedBase}/v1/models`, { signal: AbortSignal.timeout(20_000) });
  checks.push({ name: "direct-v1-models", ok: directModels.ok, status: directModels.status });

  const readiness = await json("GET", "/api/server/readiness");
  checks.push({
    name: "daemon-readiness-delegated",
    ok: readiness.ok === true && readiness.mode === "delegated-server" && readiness.runtime?.delegatedServer?.running === true,
    blockers: readiness.blockers
  });

  const nonStream = await json("POST", "/v1/chat/completions", {
    model: model.name,
    messages: [{ role: "user", content: "hi" }],
    max_tokens: 8,
    stream: false
  }, 120_000);
  checks.push({
    name: "daemon-openai-nonstream",
    ok: nonStream.object === "chat.completion" && typeof nonStream.choices?.[0]?.message?.content === "string",
    text: nonStream.choices?.[0]?.message?.content
  });

  const openAiStream = await readSseStream("/v1/chat/completions", {
    model: model.name,
    messages: [{ role: "user", content: "hi" }],
    max_tokens: 12,
    stream: true
  });
  checks.push({ name: "daemon-openai-stream", ok: openAiStream.tokens.length > 0 && openAiStream.done, firstChunkMs: openAiStream.firstChunkMs });

  const apiChat = await json("POST", "/api/chat", {
    runtime: "llamacpp",
    model: model.name,
    messages: [{ role: "user", content: "hi" }],
    stream: false
  }, 120_000);
  checks.push({ name: "daemon-ollama-chat", ok: apiChat.done === true && typeof apiChat.message?.content === "string", text: apiChat.message?.content });

  const generateStream = await readNdjsonStream("/api/generate", {
    model: model.name,
    prompt: "hi",
    stream: true,
    options: { num_predict: 12 }
  });
  checks.push({ name: "daemon-ollama-generate-stream", ok: generateStream.tokens.length > 0 && generateStream.done, firstChunkMs: generateStream.firstChunkMs });

  const embeddingStatus = await status("POST", "/v1/embeddings", { model: model.name, input: "hello" }, 120_000);
  checks.push({
    name: "embeddings-success",
    ok: embeddingStatus.status === 200,
    status: embeddingStatus.status,
  });

  const concurrent = await Promise.all([
    timed(() => json("POST", "/v1/chat/completions", { model: model.name, messages: [{ role: "user", content: "hi" }], max_tokens: 8 }, 120_000)),
    timed(() => json("POST", "/v1/chat/completions", { model: model.name, messages: [{ role: "user", content: "hi" }], max_tokens: 8 }, 120_000)),
    timed(() => json("POST", "/api/generate", { model: model.name, prompt: "hi", stream: false, options: { num_predict: 8 } }, 120_000)),
    timed(() => json("POST", "/api/chat", { runtime: "llamacpp", model: model.name, messages: [{ role: "user", content: "hi" }], stream: false }, 120_000))
  ]);
  checks.push({
    name: "delegated-concurrency",
    ok: concurrent.every((item) => item.ms > 0),
    latenciesMs: concurrent.map((item) => item.ms)
  });

  const queue = await json("GET", "/api/queue");
  checks.push({ name: "queue-drained", ok: (queue.runningItems?.length || 0) === 0 && (queue.queued?.length || 0) === 0 });

  const stopped = await json("POST", "/api/engine/server/stop", {}, 20_000);
  shouldStopDelegated = false;
  checks.push({ name: "stop-request", ok: stopped.running === false, stopped });
  const finalStatus = await json("GET", "/api/engine/server/status");
  checks.push({ name: "final-not-running", ok: finalStatus.running === false, finalStatus });

  const ok = checks.every((check) => check.ok);
  console.log(JSON.stringify({ ok, base, delegatedBase, model: model.name, install, checks }, null, 2));
  if (!ok) process.exitCode = 1;
} finally {
  if (shouldStopDelegated) {
    await status("POST", "/api/engine/server/stop", {}, 20_000).catch(() => undefined);
  }
  daemon.kill("SIGTERM");
}

async function selectPhysicalChatModel() {
  const index = await json("GET", "/api/models/index");
  const models = Array.isArray(index.models) ? index.models : [];
  return models
    .filter((item) => item?.runnable && typeof item.path === "string" && !item.path.startsWith("virtual:") && isChatCandidate(item.name, item.path))
    .sort((a, b) => (a.sizeBytes || Number.MAX_SAFE_INTEGER) - (b.sizeBytes || Number.MAX_SAFE_INTEGER))[0];
}

async function waitForDelegatedRunning() {
  let last;
  for (let i = 0; i < 120; i += 1) {
    last = await json("GET", "/api/engine/server/status");
    if (last.available && last.running && last.endpoint) {
      try {
        const health = await fetch(`${last.endpoint}/health`, { signal: AbortSignal.timeout(2_000) });
        if (health.ok) return last;
      } catch {
        // server may still be loading model
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`delegated llama-server did not become healthy: ${JSON.stringify(last)}`);
}

async function readNdjsonStream(route, body) {
  const started = performance.now();
  const res = await fetch(`${base}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000)
  });
  if (!res.ok || !res.body) throw new Error(`${route} failed with ${res.status}: ${await res.text()}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const tokens = [];
  let buffer = "";
  let done = false;
  let firstChunkMs = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    if (!firstChunkMs) firstChunkMs = Math.round(performance.now() - started);
    buffer += decoder.decode(chunk.value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.response || event.message?.content) tokens.push(event.response || event.message.content);
      if (event.done) done = true;
    }
  }
  return { tokens, done, firstChunkMs };
}

async function readSseStream(route, body) {
  const started = performance.now();
  const res = await fetch(`${base}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000)
  });
  if (!res.ok || !res.body) throw new Error(`${route} failed with ${res.status}: ${await res.text()}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const tokens = [];
  let buffer = "";
  let done = false;
  let firstChunkMs = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    if (!firstChunkMs) firstChunkMs = Math.round(performance.now() - started);
    buffer += decoder.decode(chunk.value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";
    for (const event of events) {
      for (const line of event.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") {
          done = true;
          continue;
        }
        const payload = JSON.parse(data);
        const token = payload.choices?.[0]?.delta?.content || payload.choices?.[0]?.text;
        if (token) tokens.push(token);
      }
    }
  }
  return { tokens, done, firstChunkMs };
}

async function json(method, route, body, timeoutMs = 30_000) {
  const res = await fetch(`${base}${route}`, {
    method,
    headers: body ? { "content-type": "application/json", "x-ht-marketplace-confirm": "privileged-action" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs)
  });
  const text = await res.text();
  const parsed = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`${method} ${route} failed with ${res.status}: ${text.slice(0, 500)}`);
  return parsed;
}

async function status(method, route, body, timeoutMs = 30_000) {
  const res = await fetch(`${base}${route}`, {
    method,
    headers: body ? { "content-type": "application/json", "x-ht-marketplace-confirm": "privileged-action" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs)
  });
  return { status: res.status, text: await res.text() };
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

async function timed(work) {
  const started = performance.now();
  const result = await work();
  return { ms: Math.round(performance.now() - started), result };
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

function isChatCandidate(name = "", filePath = "") {
  const text = `${name} ${filePath}`.toLowerCase();
  return !["embed", "embedding", "nomic", "bge", "rerank", "clip", "mmproj", "vision", "whisper", "tts"].some((marker) => text.includes(marker));
}
