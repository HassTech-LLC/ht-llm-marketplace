import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import os from "node:os";
import type { RuntimeLoadRequest, RuntimeModel, StartDownloadRequest } from "@ht-llm-marketplace/sdk";
import { OllamaAdapter } from "./adapters/ollama.js";
import { LmStudioAdapter } from "./adapters/lmstudio.js";
import { openAiCompatibleStatus } from "./adapters/openai.js";
import type { DaemonConfig } from "./config.js";
import { confirmDeletePlan, createDeletePlan } from "./delete/safety.js";
import { DownloadManager } from "./downloads/jobs.js";
import { defaultModelRoots, discoverGgufModels } from "./engine/discover.js";
import { LlamaEngine } from "./engine/llama.js";
import { ollamaChunk, ollamaDone, type ChatMessage } from "./engine/messages.js";
import { MarketplaceStore } from "./store.js";
import { dryRunHuggingFaceDownload, listHuggingFaceFiles, searchHuggingFace } from "./sources/huggingface.js";
import { resolveOllamaModel } from "./sources/ollama-registry.js";
import { scanSystem } from "./system/scan.js";

export interface RuntimeContext {
  config: DaemonConfig;
  store: MarketplaceStore;
  ollama: OllamaAdapter;
  lmstudio: LmStudioAdapter;
  downloads: DownloadManager;
  engine: LlamaEngine;
}

export function createContext(config: DaemonConfig): RuntimeContext {
  fs.mkdirSync(config.storageDir, { recursive: true });
  fs.mkdirSync(config.modelsDir, { recursive: true });
  fs.mkdirSync(config.downloadsDir, { recursive: true });
  const store = new MarketplaceStore(config.dbPath);
  const ollama = new OllamaAdapter({ host: config.ollamaHost });
  const lmstudio = new LmStudioAdapter(config.lmStudioHost);
  const downloads = new DownloadManager(config, store, ollama);
  const engine = new LlamaEngine();
  if (config.enableEngine) {
    // Initialize the native binding in the background so the first chat is fast
    // and the runtime list can report accurate readiness.
    void engine.probe();
  }
  return { config, store, ollama, lmstudio, downloads, engine };
}

export function createServer(context: RuntimeContext) {
  return http.createServer(async (request, response) => {
    try {
      applySecurityHeaders(request, response, context.config);
      const guard = evaluateGuard(
        { method: request.method || "GET", host: request.headers.host, origin: request.headers.origin },
        context.config
      );
      if (!guard.ok) {
        return json(response, { error: guard.reason }, guard.status ?? 403);
      }
      if (request.method === "OPTIONS") {
        response.writeHead(204);
        response.end();
        return;
      }

      const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
      const route = `${request.method || "GET"} ${url.pathname}`;

      if (route === "GET /health") {
        return json(response, {
          ok: true,
          version: "0.1.0",
          storage: { database: fs.existsSync(context.config.dbPath) }
        });
      }

      if (route === "GET /api/runtimes") {
        return json(response, { runtimes: await runtimeStatuses(context) });
      }

      if (route === "GET /api/system/scan") {
        return json(response, await scanSystem(context.config.modelsDir, await runtimeStatuses(context)));
      }

      if (route === "GET /api/catalog/search") {
        const query = url.searchParams.get("q") || "";
        const limit = Number.parseInt(url.searchParams.get("limit") || "12", 10);
        return json(response, { items: await searchHuggingFace(query, Number.isFinite(limit) ? limit : 12) });
      }

      if (route === "GET /api/catalog/ollama/resolve") {
        const ref = required(url.searchParams.get("ref"), "ref");
        return json(response, { model: await resolveOllamaModel(ref) });
      }

      if (route === "GET /api/catalog/hf/files") {
        const repo = required(url.searchParams.get("repo"), "repo");
        const revision = url.searchParams.get("revision") || "main";
        return json(response, { files: await listHuggingFaceFiles(repo, revision) });
      }

      if (route === "GET /api/catalog/hf/readme") {
        const repo = required(url.searchParams.get("repo"), "repo");
        try {
          const readmeUrl = `https://huggingface.co/${repo}/raw/main/README.md`;
          const res = await fetch(readmeUrl);
          if (!res.ok) {
            const fallbackUrl = `https://huggingface.co/${repo}/raw/master/README.md`;
            const fallbackRes = await fetch(fallbackUrl);
            if (!fallbackRes.ok) {
              return json(response, { readme: "" });
            }
            return json(response, { readme: await fallbackRes.text() });
          }
          return json(response, { readme: await res.text() });
        } catch (err) {
          return json(response, { readme: "" });
        }
      }

      if (route === "POST /api/catalog/hf/dry-run") {
        const body = await readJson<{ repoId: string; revision?: string; allowPatterns?: string[]; patterns?: string[] }>(request);
        return json(
          response,
          await dryRunHuggingFaceDownload(body.repoId, body.revision || "main", body.allowPatterns || body.patterns || ["*.gguf"])
        );
      }

      if (route === "GET /api/inventory") {
        return json(response, { artifacts: await inventory(context) });
      }

      if (route === "GET /api/downloads") {
        return json(response, { jobs: context.downloads.list() });
      }

      if (route === "GET /api/downloads/events") {
        return sseDownloads(request, response, context);
      }

      if (route === "POST /api/downloads") {
        const body = await readJson<StartDownloadRequest>(request);
        return json(response, { job: await context.downloads.start(body) }, 202);
      }

      if (route === "POST /api/delete-plans") {
        const body = await readJson<{ artifactId: string }>(request);
        return json(response, {
          plan: createDeletePlan(
            { store: context.store, ollama: context.ollama, roots: [context.config.modelsDir, context.config.downloadsDir] },
            body.artifactId
          )
        });
      }

      const confirmDelete = url.pathname.match(/^\/api\/delete-plans\/([^/]+)\/confirm$/);
      if (request.method === "POST" && confirmDelete) {
        return json(response, {
          plan: await confirmDeletePlan(
            { store: context.store, ollama: context.ollama, roots: [context.config.modelsDir, context.config.downloadsDir] },
            decodeURIComponent(confirmDelete[1])
          )
        });
      }

      if (route === "GET /api/audit-log") {
        return json(response, { entries: context.store.listAuditLog() });
      }

      if (route === "POST /api/runtimes/install") {
        const body = await readJson<{ runtime: string }>(request);
        const runtime = body.runtime;
        if (runtime !== "ollama" && runtime !== "lmstudio") {
          return json(response, { ok: false, error: `Invalid runtime: ${runtime}` }, 400);
        }

        const isWin = os.platform() === "win32";
        if (!isWin) {
          return json(response, {
            ok: false,
            error: `One-click install is only fully automated on Windows (via winget) in this version. On macOS/Linux, please run: ${
              runtime === "ollama" ? "curl -fsSL https://ollama.com/install.sh | sh" : "brew install --cask lm-studio"
            }`
          }, 400);
        }

        const wingetId = runtime === "ollama" ? "Ollama.Ollama" : "LMStudio.LMStudio";
        const child = spawn("powershell", ["-Command", `winget install ${wingetId} --silent`], {
          detached: true,
          stdio: "ignore",
          windowsHide: true
        });
        child.unref();

        context.store.audit("install-triggered", runtime, { wingetId, status: "spawned" });

        return json(response, {
          ok: true,
          message: `One-click installation for ${runtime} (${wingetId}) started in the background.`
        });
      }

      if (route === "POST /api/runtimes/ollama/server/start") {
        const message = await context.ollama.startEngine();
        return json(response, { ok: true, message });
      }

      if (route === "POST /api/runtimes/lmstudio/server/start") {
        const body = await readJson<{ port?: number }>(request);
        return json(response, { ok: true, message: await context.lmstudio.startServer(body.port || 1234) });
      }

      if (route === "GET /api/runtimes/llamacpp/models") {
        const roots = defaultModelRoots({
          modelsDir: context.config.modelsDir,
          downloadsDir: context.config.downloadsDir,
          extraDirs: context.config.modelScanDirs
        });
        const loadedPath = context.engine.loadedPath;
        const models = discoverGgufModels(roots).map((model) => ({
          ...model,
          loaded: !!loadedPath && path.resolve(model.path).toLowerCase() === path.resolve(loadedPath).toLowerCase()
        }));
        return json(response, { models });
      }

      if (route === "POST /api/runtimes/llamacpp/load") {
        const body = await readJson<{ artifactId?: string; path?: string; systemPrompt?: string; gpuLayers?: number }>(request);
        const target = resolveEngineModelPath(context, body);
        const result = await context.engine.load({
          modelPath: target.path,
          displayName: target.displayName,
          systemPrompt: body.systemPrompt,
          gpuLayers: body.gpuLayers
        });
        context.store.audit("engine-load", target.displayName, { path: target.path, gpu: result.gpu });
        return json(response, { ok: true, loaded: result.loaded, gpu: result.gpu });
      }

      if (route === "POST /api/runtimes/llamacpp/unload") {
        await context.engine.unload();
        return json(response, { ok: true, message: "Built-in engine model unloaded." });
      }

      const runtimeLoad = url.pathname.match(/^\/api\/runtimes\/([^/]+)\/load$/);
      if (request.method === "POST" && runtimeLoad) {
        const runtime = decodeURIComponent(runtimeLoad[1]);
        const body = await readJson<RuntimeLoadRequest>(request);
        if (runtime === "lmstudio") return json(response, { ok: true, message: await context.lmstudio.load(body) });
        if (runtime === "ollama") return json(response, { ok: true, message: "Ollama loads models on demand through chat/generate requests." });
        return json(response, { ok: false, message: `Runtime load is not implemented for ${runtime}.` }, 400);
      }

      const runtimeUnload = url.pathname.match(/^\/api\/runtimes\/([^/]+)\/unload$/);
      if (request.method === "POST" && runtimeUnload) {
        const runtime = decodeURIComponent(runtimeUnload[1]);
        const body = await readJson<{ model?: string }>(request);
        if (runtime === "lmstudio") return json(response, { ok: true, message: await context.lmstudio.unload(body.model) });
        return json(response, { ok: false, message: `Runtime unload is not implemented for ${runtime}.` }, 400);
      }

      if (route === "POST /api/chat") {
        const body = await readJson<Record<string, unknown>>(request);
        if (body?.runtime === "llamacpp" || body?.engine === "llamacpp") {
          await engineChat(request, response, context, body as Parameters<typeof engineChat>[3]);
          return;
        }
        const upstream = await context.ollama.chat(body);
        response.writeHead(upstream.status, {
          "content-type": upstream.headers.get("content-type") || "application/json"
        });
        if (!upstream.body) {
          response.end();
          return;
        }
        const reader = upstream.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          response.write(Buffer.from(value));
        }
        response.end();
        return;
      }

      if (request.method === "GET" && url.pathname.startsWith("/widget/")) {
        return serveWidget(url.pathname, response);
      }

      return json(response, { error: "Not found" }, 404);
    } catch (error) {
      return json(response, { error: (error as Error).message }, 500);
    }
  });
}

async function runtimeStatuses(context: RuntimeContext) {
  const [ollama, lmstudio, openai] = await Promise.all([
    context.ollama.status(),
    context.lmstudio.status(),
    openAiCompatibleStatus(context.config.genericOpenAiHost)
  ]);
  // The built-in llama.cpp engine replaces the runtime slot that previously
  // probed a remote llama.cpp server; it runs owned GGUFs in-process.
  return [ollama, lmstudio, context.engine.status(ownedEngineModels(context)), openai];
}

function ownedEngineModels(context: RuntimeContext): RuntimeModel[] {
  return context.store
    .listArtifacts()
    .filter((artifact) => artifact.owned && !!artifact.path && artifact.path.toLowerCase().endsWith(".gguf"))
    .map((artifact) => ({
      id: artifact.path as string,
      name: artifact.displayName || artifact.name,
      displayName: artifact.displayName || artifact.name,
      path: artifact.path,
      sizeBytes: artifact.sizeBytes,
      format: "gguf",
      runtime: "llamacpp",
      owned: true
    }));
}

function resolveEngineModelPath(context: RuntimeContext, body: { artifactId?: string; path?: string }): {
  path: string;
  displayName: string;
} {
  if (body.artifactId) {
    const artifact = context.store.getArtifact(body.artifactId);
    if (!artifact || !artifact.path) throw new Error(`Artifact not found or has no local file: ${body.artifactId}`);
    if (!fs.existsSync(artifact.path)) throw new Error(`Artifact file is missing on disk: ${artifact.path}`);
    return { path: artifact.path, displayName: artifact.displayName || artifact.name };
  }
  if (body.path) {
    if (!fs.existsSync(body.path)) throw new Error(`Model file not found: ${body.path}`);
    if (!body.path.toLowerCase().endsWith(".gguf")) throw new Error("Only .gguf files can be loaded by the built-in engine.");
    return { path: body.path, displayName: path.basename(body.path) };
  }
  throw new Error("Provide an artifactId or a path to load.");
}

async function engineChat(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  context: RuntimeContext,
  body: { messages?: ChatMessage[]; model?: string; stream?: boolean; artifactId?: string; path?: string; systemPrompt?: string }
) {
  const messages = Array.isArray(body.messages) ? body.messages : [];

  if (!context.engine.isLoaded() && (body.artifactId || body.path)) {
    const target = resolveEngineModelPath(context, body);
    await context.engine.load({ modelPath: target.path, displayName: target.displayName, systemPrompt: body.systemPrompt });
  }
  if (!context.engine.isLoaded()) {
    return json(response, { error: "No model is loaded in the built-in engine. Load one first or pass an artifactId/path." }, 400);
  }

  const modelName = body.model || context.engine.loadedModel || "llamacpp";
  const stream = body.stream !== false;

  if (!stream) {
    const content = await context.engine.chat(messages, {});
    return json(response, { model: modelName, message: { role: "assistant", content }, done: true });
  }

  response.writeHead(200, { "content-type": "application/x-ndjson", "cache-control": "no-cache" });
  const controller = new AbortController();
  request.on("close", () => controller.abort());
  try {
    await context.engine.chat(messages, {
      signal: controller.signal,
      onToken: (token) => response.write(`${JSON.stringify(ollamaChunk(modelName, token))}\n`)
    });
    response.write(`${JSON.stringify(ollamaDone(modelName))}\n`);
  } catch (error) {
    response.write(`${JSON.stringify({ model: modelName, error: (error as Error).message, done: true })}\n`);
  }
  response.end();
}

async function inventory(context: RuntimeContext) {
  const artifacts = context.store.listArtifacts();
  const ownedNames = new Set(artifacts.map((artifact) => `${artifact.runtime}:${artifact.name}`));
  const runtimes = await runtimeStatuses(context);
  const external = runtimes.flatMap((runtime) =>
    (runtime.models || [])
      .filter((model) => !model.owned && !ownedNames.has(`${model.runtime}:${model.name}`))
      .map((model) => ({
        id: `${model.runtime}:${model.name}`,
        source: "runtime",
        runtime: model.runtime,
        name: model.name,
        displayName: model.displayName,
        sizeBytes: model.sizeBytes,
        owned: false,
        runnable: true,
        loaded: model.loaded,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
        deleteEligible: false,
        notes: ["Runtime-managed model discovered locally; not marketplace-owned."]
      }))
  );
  return [...artifacts, ...external];
}

function applySecurityHeaders(request: http.IncomingMessage, response: http.ServerResponse, config: DaemonConfig) {
  const origin = request.headers.origin;
  if (origin && isAllowedLocalOrigin(origin, config.allowedOrigins)) {
    response.setHeader("access-control-allow-origin", origin);
    response.setHeader("vary", "origin");
    response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
    response.setHeader("access-control-allow-headers", "content-type");
  }
  response.setHeader("x-content-type-options", "nosniff");
}

export function isAllowedLocalOrigin(origin: string, configured: string[]) {
  if (configured.includes("*") || configured.includes(origin)) return true;
  try {
    const parsed = new URL(origin);
    return (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost" || parsed.hostname === "::1") && /^https?:$/.test(parsed.protocol);
  } catch {
    return false;
  }
}

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

interface GuardConfig {
  host: string;
  allowedOrigins: string[];
}

/**
 * Defend the loopback daemon against DNS-rebinding and drive-by-localhost CSRF.
 * The Host header must resolve to loopback (or a configured host), which blocks
 * rebinding attacks; and any state-changing request that carries a browser
 * Origin must come from an allowed local origin, which blocks a malicious web
 * page from silently triggering installs, downloads, model loads, or deletes.
 * Non-browser clients (CLI, SDK from Node) send no Origin and are unaffected.
 */
export function isLoopbackHost(hostHeader: string | undefined, config: GuardConfig): boolean {
  if (!hostHeader) return false;
  if (config.allowedOrigins.includes("*")) return true;
  const hostname = hostHeader
    .replace(/:\d+$/, "")
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  if (hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1") return true;
  if (config.host && hostname === config.host.toLowerCase()) return true;
  const allowedHosts = config.allowedOrigins
    .map((origin) => {
      try {
        return new URL(origin).hostname.toLowerCase();
      } catch {
        return "";
      }
    })
    .filter(Boolean);
  return allowedHosts.includes(hostname);
}

export function evaluateGuard(
  input: { method: string; host?: string; origin?: string },
  config: GuardConfig
): { ok: true } | { ok: false; status: number; reason: string } {
  if (!isLoopbackHost(input.host, config)) {
    return { ok: false, status: 403, reason: "Refusing request: Host header is not a loopback/allowed host." };
  }
  if (
    STATE_CHANGING_METHODS.has(input.method.toUpperCase()) &&
    input.origin &&
    !isAllowedLocalOrigin(input.origin, config.allowedOrigins)
  ) {
    return { ok: false, status: 403, reason: "Refusing request: Origin is not allowed for a state-changing request." };
  }
  return { ok: true };
}

function sseDownloads(request: http.IncomingMessage, response: http.ServerResponse, context: RuntimeContext) {
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive"
  });
  // Coalesce bursts: a download emits a "change" per network chunk (thousands/sec).
  // Without throttling, every tick fans out to all SSE clients and can trigger a
  // refresh storm. Send at most once per interval; always flush the latest state.
  const MIN_INTERVAL_MS = 250;
  let lastSent = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    timer = undefined;
    lastSent = Date.now();
    if (!response.writableEnded) response.write(`data: ${JSON.stringify(context.downloads.list())}\n\n`);
  };
  const send = () => {
    if (timer) return;
    timer = setTimeout(flush, Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastSent)));
  };
  send();
  context.downloads.on("change", send);
  request.on("close", () => {
    context.downloads.off("change", send);
    if (timer) clearTimeout(timer);
  });
}

function serveWidget(pathname: string, response: http.ServerResponse) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  let filename = pathname.replace(/^\/widget\//, "");
  
  // Backward compatibility alias for legacy integrations
  if (filename === "lumina-widget.js" || filename === "lumina-widget") {
    filename = "ht-model-marketplace.js";
  }
  
  const candidate = path.resolve(here, "..", "..", "web-component", "dist", filename);
  const distRoot = path.resolve(here, "..", "..", "web-component", "dist");
  const relative = path.relative(distRoot, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative) || !fs.existsSync(candidate)) {
    return json(response, { error: "Widget asset not built. Run npm run build -w @ht-llm-marketplace/web-component." }, 404);
  }
  const contentType = candidate.endsWith(".js") ? "text/javascript" : candidate.endsWith(".css") ? "text/css" : "application/octet-stream";
  response.writeHead(200, {
    "content-type": contentType,
    "access-control-allow-origin": "*",
    "cross-origin-resource-policy": "cross-origin",
    "cache-control": "public, max-age=60"
  });
  fs.createReadStream(candidate).pipe(response);
}

function json(response: http.ServerResponse, payload: unknown, status = 200) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(payload, null, 2));
}

async function readJson<T>(request: http.IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? (JSON.parse(raw) as T) : ({} as T);
}

function required(value: string | null, name: string) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}
