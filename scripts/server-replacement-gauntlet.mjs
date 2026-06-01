import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

const daemonPort = Number(process.env.HT_GAUNTLET_PORT || 55951);
const cliPort = daemonPort + 1;
const base = `http://127.0.0.1:${daemonPort}`;
const requireModel = process.env.HT_GAUNTLET_REQUIRE_MODEL === "1";
const requireDelegated = process.env.HT_GAUNTLET_REQUIRE_DELEGATED === "1";
const soakLoops = Number(process.env.HT_GAUNTLET_SOAK_LOOPS || 3);
const smokeHome = process.env.HT_GAUNTLET_HOME || path.join(os.tmpdir(), "htlm-server-gauntlet");

const daemon = spawn(process.execPath, ["packages/daemon/dist/index.js"], {
  env: {
    ...process.env,
    HT_MARKETPLACE_PORT: String(daemonPort),
    HT_MARKETPLACE_HOME: smokeHome
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true
});

const stderr = [];
daemon.stderr.on("data", (chunk) => stderr.push(chunk.toString()));

try {
  await waitForHealth(base, stderr);
  const model = await selectPhysicalChatModel();
  const sections = [];
  sections.push(await realClientCompatibility(model));
  sections.push(await streamingProof(model));
  sections.push(await concurrencySoak(model));
  sections.push(await delegatedProof());
  sections.push(await badModelHandling(model));
  sections.push(await serviceBehavior());
  sections.push(await endpointEdgeCases(model));

  const ok = sections.every((section) => section.ok);
  console.log(JSON.stringify({ ok, model: model?.name || null, sections }, null, 2));
  if (!ok) process.exitCode = 1;
} finally {
  daemon.kill("SIGTERM");
}

async function selectPhysicalChatModel() {
  const index = await json(base, "GET", "/api/models/index");
  const models = Array.isArray(index.models) ? index.models : [];
  const model = models
    .filter((item) => item?.runnable && typeof item.path === "string" && !item.path.startsWith("virtual:") && isChatCandidate(item.name, item.path))
    .sort((a, b) => (a.sizeBytes || Number.MAX_SAFE_INTEGER) - (b.sizeBytes || Number.MAX_SAFE_INTEGER))[0];
  if (!model && requireModel) throw new Error("No physical chat GGUF model is indexed.");
  return model;
}

async function realClientCompatibility(model) {
  const checks = [];
  checks.push(check("openai-models", Array.isArray((await json(base, "GET", "/v1/models")).data)));
  checks.push(check("ollama-tags", Array.isArray((await json(base, "GET", "/api/tags")).models)));
  checks.push(check("ollama-ps", Array.isArray((await json(base, "GET", "/api/ps")).models)));
  if (!model) return section("real-client-compatibility", checks, "Skipped generation checks: no local chat GGUF.");

  const chat = await json(base, "POST", "/v1/chat/completions", {
    model: model.name,
    messages: [{ role: "user", content: "hi" }],
    max_tokens: 8,
    stream: false
  }, 120_000);
  checks.push(check("openai-chat-shape", chat.object === "chat.completion" && typeof chat.choices?.[0]?.message?.content === "string"));

  const completion = await json(base, "POST", "/v1/completions", { model: model.name, prompt: "hi", max_tokens: 8 }, 120_000);
  checks.push(check("openai-completion-shape", completion.object === "text_completion" && typeof completion.choices?.[0]?.text === "string"));

  const response = await json(base, "POST", "/v1/responses", { model: model.name, input: "hi", max_output_tokens: 8, store: false }, 120_000);
  checks.push(check("responses-shape", response.object === "response" && typeof response.output_text === "string"));

  const generate = await json(base, "POST", "/api/generate", { model: model.name, prompt: "hi", stream: false, options: { num_predict: 8 } }, 120_000);
  checks.push(check("ollama-generate-shape", generate.done === true && typeof generate.response === "string"));

  const show = await json(base, "POST", "/api/show", { model: model.name });
  checks.push(check("ollama-show-shape", show.details?.format === "gguf"));
  return section("real-client-compatibility", checks);
}

async function streamingProof(model) {
  if (!model) return section("streaming-proof", [check("skipped-no-model", !requireModel, "No local chat GGUF.")]);
  const ollama = await timed(() => readNdjsonStream("/api/generate", { model: model.name, prompt: "hi", stream: true, options: { num_predict: 12 } }));
  const openai = await timed(() =>
    readSseStream("/v1/chat/completions", { model: model.name, messages: [{ role: "user", content: "hi" }], stream: true, max_tokens: 12 })
  );
  const abort = await abortStreamingRequest(model.name);
  return section("streaming-proof", [
    check("ollama-ndjson-stream", ollama.result.tokens.length > 0 && ollama.result.done === true, `firstChunkMs=${ollama.result.firstChunkMs}`),
    check("openai-sse-stream", openai.result.tokens.length > 0 && openai.result.done === true, `firstChunkMs=${openai.result.firstChunkMs}`),
    check("stream-abort-cleanup", abort.ok, abort.note)
  ], { ollamaMs: ollama.ms, openaiMs: openai.ms });
}

async function concurrencySoak(model) {
  if (!model) return section("concurrency-soak", [check("skipped-no-model", !requireModel, "No local chat GGUF.")]);
  const latencies = [];
  for (let i = 0; i < soakLoops; i += 1) {
    const pair = await Promise.all([
      timed(() => json(base, "POST", "/api/generate", { model: model.name, prompt: "hi", stream: false, options: { num_predict: 8 } }, 120_000)),
      timed(() => json(base, "POST", "/v1/completions", { model: model.name, prompt: "hi", max_tokens: 8 }, 120_000))
    ]);
    latencies.push(...pair.map((item) => item.ms));
  }
  const queue = await json(base, "GET", "/api/queue");
  return section("concurrency-soak", [
    check("mixed-generate-completion", latencies.length === soakLoops * 2),
    check("queue-drained", (queue.runningItems?.length || 0) === 0 && (queue.queued?.length || 0) === 0)
  ], { loops: soakLoops, latenciesMs: latencies });
}

async function delegatedProof() {
  const status = await json(base, "GET", "/api/engine/server/status");
  const liveProof = status.available
    ? check("delegated-binary-available", true, status.message)
    : { name: "delegated-live-proof", ok: !requireDelegated, skipped: !requireDelegated, note: status.message };
  return section("delegated-llama-server-proof", [
    check("status-surface", typeof status.running === "boolean" && typeof status.available === "boolean"),
    liveProof
  ], { status });
}

async function badModelHandling(model) {
  const checks = [];
  if (model) {
    await json(base, "POST", "/api/generate", { model: model.name, prompt: "hi", stream: false, options: { num_predict: 4 } }, 120_000);
  }
  checks.push(check("openai-chat-missing-model", (await status("POST", "/v1/chat/completions", {
    model: "definitely-missing-model",
    messages: [{ role: "user", content: "hi" }],
    max_tokens: 4
  })).status === 404));
  checks.push(check("openai-completion-missing-model", (await status("POST", "/v1/completions", {
    model: "definitely-missing-model",
    prompt: "hi",
    max_tokens: 4
  })).status === 404));
  checks.push(check("ollama-generate-missing-model-not-200", (await status("POST", "/api/generate", {
    model: "definitely-missing-model",
    prompt: "hi",
    stream: false
  })).status !== 200));
  checks.push(check("empty-prompt-400", (await status("POST", "/api/generate", { model: model?.name || "local", prompt: "" })).status === 400));
  return section("bad-model-handling", checks);
}

async function serviceBehavior() {
  const help = await runProcess(process.execPath, ["packages/cli/dist/index.js", "--help"]);
  const cliHome = path.join(os.tmpdir(), "htlm-cli-serve-gauntlet");
  const cli = spawn(process.execPath, ["packages/cli/dist/index.js", "serve"], {
    env: {
      ...process.env,
      HT_MARKETPLACE_API_URL: `http://127.0.0.1:${cliPort}`,
      HT_MARKETPLACE_PORT: String(cliPort),
      HT_MARKETPLACE_HOME: cliHome
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  const cliErr = [];
  cli.stderr.on("data", (chunk) => cliErr.push(chunk.toString()));
  try {
    await waitForHealth(`http://127.0.0.1:${cliPort}`, cliErr);
    const health = await json(`http://127.0.0.1:${cliPort}`, "GET", "/health");
    return section("installer-service-behavior", [
      check("cli-help", help.stdout.includes("HT Local LLM Marketplace CLI")),
      check("htlm-serve-health", health.ok === true)
    ]);
  } finally {
    cli.kill("SIGTERM");
  }
}

async function endpointEdgeCases(model) {
  if (!model) return section("endpoint-edge-cases", [check("skipped-no-model", !requireModel, "No local chat GGUF.")]);
  const openai = await status("POST", "/v1/chat/completions", {
    model: model.name,
    messages: [{ role: "user", content: "return one word" }],
    max_tokens: 8,
    stop: ["\n"],
    seed: 7,
    response_format: { type: "json_object" },
    tools: [{ type: "function", function: { name: "noop", parameters: { type: "object", properties: {} } } }]
  }, 120_000);
  const ollama = await status("POST", "/api/generate", {
    model: model.name,
    prompt: "hi",
    stream: false,
    keep_alive: "5m",
    options: { num_predict: 8, num_ctx: 1024, temperature: 0.1, seed: 7 }
  }, 120_000);
  const badMessages = await status("POST", "/v1/chat/completions", { model: model.name, messages: [] });
  return section("endpoint-edge-cases", [
    check("openai-advanced-payload-not-5xx", openai.status < 500, `status=${openai.status}`),
    check("ollama-options-payload-not-5xx", ollama.status < 500, `status=${ollama.status}`),
    check("empty-messages-400", badMessages.status === 400)
  ]);
}

async function readNdjsonStream(route, body) {
  const started = performance.now();
  const res = await fetch(`${base}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000)
  });
  if (!res.ok || !res.body) throw new Error(`${route} stream failed with ${res.status}`);
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
  if (!res.ok || !res.body) throw new Error(`${route} stream failed with ${res.status}`);
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
        const parsed = JSON.parse(data);
        const token = parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.text;
        if (token) tokens.push(token);
      }
    }
  }
  return { tokens, done, firstChunkMs };
}

async function abortStreamingRequest(model) {
  const controller = new AbortController();
  try {
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "write a short greeting" }], stream: true, max_tokens: 64 }),
      signal: controller.signal
    });
    const reader = res.body?.getReader();
    await reader?.read();
    controller.abort();
    await new Promise((resolve) => setTimeout(resolve, 250));
    const queue = await json(base, "GET", "/api/queue");
    return { ok: (queue.queued?.length || 0) === 0, note: `running=${queue.runningItems?.length || 0}` };
  } catch (error) {
    if (controller.signal.aborted) return { ok: true, note: "client abort raised locally" };
    return { ok: false, note: error.message };
  }
}

async function json(host, method, route, body, timeoutMs = 20_000) {
  const res = await fetch(`${host}${route}`, {
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

async function status(method, route, body, timeoutMs = 20_000) {
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

function runProcess(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk.toString()));
    child.stderr.on("data", (chunk) => stderr.push(chunk.toString()));
    child.on("close", (code) => resolve({ code, stdout: stdout.join(""), stderr: stderr.join("") }));
  });
}

function section(name, checks, details = undefined) {
  return {
    name,
    ok: checks.every((item) => item.ok),
    checks,
    ...(typeof details === "string" ? { note: details } : details ? { details } : {})
  };
}

function check(name, ok, note) {
  return { name, ok: Boolean(ok), ...(note ? { note } : {}) };
}

function isChatCandidate(name = "", filePath = "") {
  const text = `${name} ${filePath}`.toLowerCase();
  return !["embed", "embedding", "nomic", "bge", "rerank", "clip", "mmproj", "vision", "whisper", "tts"].some((marker) => text.includes(marker));
}
