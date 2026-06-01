import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

const port = Number(process.env.HT_SERVER_QUALITY_SMOKE_PORT || 55941);
const base = `http://127.0.0.1:${port}`;
const requireModel = process.env.HT_SERVER_QUALITY_REQUIRE_MODEL === "1";
const smokeHome = process.env.HT_SERVER_QUALITY_SMOKE_HOME || path.join(os.tmpdir(), "htlm-server-quality-smoke");

const child = spawn(process.execPath, ["packages/daemon/dist/index.js"], {
  env: {
    ...process.env,
    HT_MARKETPLACE_PORT: String(port),
    HT_MARKETPLACE_HOME: smokeHome
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true
});

const stderr = [];
child.stderr.on("data", (chunk) => stderr.push(chunk.toString()));

try {
  await waitForHealth();
  const readiness = await json("GET", "/api/server/readiness");
  const tags = await json("GET", "/api/tags");
  const index = await json("GET", "/api/models/index");
  const models = Array.isArray(tags.models) ? tags.models : [];
  const indexedModels = Array.isArray(index.models) ? index.models : [];
  const physicalModel = indexedModels
    .filter((item) => item?.runnable && typeof item.path === "string" && !item.path.startsWith("virtual:") && isChatCandidate(item.name, item.path))
    .sort((a, b) => (a.sizeBytes || Number.MAX_SAFE_INTEGER) - (b.sizeBytes || Number.MAX_SAFE_INTEGER))[0];
  const model = physicalModel?.name || models[0]?.model || models[0]?.name;
  const checks = [
    { name: "health", ok: true },
    { name: "readiness-endpoint", ok: typeof readiness.ok === "boolean" && readiness.endpoints?.ollamaGenerate === true },
    { name: "ollama-tags", ok: Array.isArray(tags.models) },
    { name: "model-index-physical-gguf", ok: Boolean(physicalModel) || !requireModel, skipped: !physicalModel, reason: physicalModel ? undefined : "No physical GGUF model indexed." },
    { name: "openai-models", ok: Array.isArray((await json("GET", "/v1/models")).data) },
    { name: "ollama-ps", ok: Array.isArray((await json("GET", "/api/ps")).models) }
  ];

  if (!model || !physicalModel) {
    checks.push({ name: "local-generation", ok: !requireModel, skipped: true, reason: "No physical local model indexed." });
  } else {
    const first = await timed(() =>
      json("POST", "/api/generate", { model, prompt: "hi", stream: false, options: { num_predict: 8 } }, 120_000)
    );
    const second = await timed(() =>
      json("POST", "/api/generate", { model, prompt: "hi", stream: false, options: { num_predict: 8 } }, 120_000)
    );
    checks.push({
      name: "ollama-generate-warm",
      ok: first.result.done === true && second.result.done === true && typeof second.result.response === "string" && second.result.response.length > 0,
      model,
      coldMs: first.ms,
      warmMs: second.ms,
      response: second.result.response
    });

    const concurrent = await Promise.all([
      timed(() => json("POST", "/v1/completions", { model, prompt: "hi", max_tokens: 8, stream: false }, 120_000)),
      timed(() => json("POST", "/v1/completions", { model, prompt: "hi", max_tokens: 8, stream: false }, 120_000))
    ]);
    checks.push({
      name: "concurrent-completions",
      ok: concurrent.every((item) => Array.isArray(item.result.choices) && typeof item.result.choices[0]?.text === "string"),
      latenciesMs: concurrent.map((item) => item.ms)
    });
  }

  const failed = checks.filter((check) => !check.ok);
  console.log(JSON.stringify({ ok: failed.length === 0, readiness, checks }, null, 2));
  if (failed.length) process.exitCode = 1;
} finally {
  child.kill("SIGTERM");
}

async function waitForHealth() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) return;
    } catch {
      // daemon may still be starting
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`daemon did not become healthy on ${base}; stderr: ${stderr.join("").slice(-1000)}`);
}

async function json(method, route, body, timeoutMs = 20_000) {
  const res = await fetch(`${base}${route}`, {
    method,
    headers: body ? { "content-type": "application/json", "x-ht-marketplace-confirm": "privileged-action" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs)
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${method} ${route} failed with ${res.status}: ${text.slice(0, 500)}`);
  }
  return parsed;
}

async function timed(work) {
  const started = performance.now();
  const result = await work();
  return { ms: Math.round(performance.now() - started), result };
}

function isChatCandidate(name = "", filePath = "") {
  const text = `${name} ${filePath}`.toLowerCase();
  return ![
    "embed",
    "embedding",
    "nomic",
    "bge",
    "rerank",
    "clip",
    "mmproj",
    "vision",
    "whisper",
    "tts"
  ].some((marker) => text.includes(marker));
}
