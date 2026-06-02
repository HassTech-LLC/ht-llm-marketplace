import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import os from "node:os";
import { randomUUID } from "node:crypto";
import type { RuntimeLoadRequest, RuntimeModel, StartDownloadRequest, ModelIndexEntry, ModelTrustLevel, EngineResidencyPlan } from "@ht-llm-marketplace/sdk";
import { OllamaAdapter } from "./adapters/ollama.js";
import { LmStudioAdapter } from "./adapters/lmstudio.js";
import { openAiCompatibleStatus } from "./adapters/openai.js";
import type { DaemonConfig } from "./config.js";
import { confirmDeletePlan, createDeletePlan } from "./delete/safety.js";
import { DownloadManager } from "./downloads/jobs.js";
import { createEmbeddingProvider, normalizeEmbeddingInput } from "./embeddings/local.js";
import type { EmbeddingProvider, LocalEmbeddingRequest } from "./embeddings/types.js";
import {
  checkArchSupport,
  installedEngineVersion,
  latestEngineVersion,
  MIN_RELEASE_BY_ARCH,
  readBundledLlamaRelease
} from "./engine/doctor.js";
import { runBenchmark } from "./engine/benchmarks.js";
import { defaultModelRoots } from "./engine/discover.js";
import { HotModelPool } from "./engine/hot-pool.js";
import { LlamaEngine } from "./engine/llama.js";
import { ModelIndex } from "./engine/model-index.js";
import { GenerationQueue } from "./engine/queue.js";
import { chooseStandardModel } from "./engine/standard-routing.js";
import { ollamaChunk, ollamaDone, ollamaGenerateChunk, ollamaGenerateDone, type ChatMessage } from "./engine/messages.js";
import {
  openAiChunk,
  openAiCompletion,
  openAiCompletionId,
  openAiFinalChunk,
  openAiModelList,
  openAiTextChunk,
  openAiTextCompletion,
  openAiTextFinalChunk,
  openAiUsage,
  parseOpenAiChatRequest,
  type OpenAiUsage
} from "./engine/openai.js";
import { fetchTextWithLimit, fetchWithTimeout, README_RESPONSE_LIMIT, responseTextWithLimit } from "./http.js";
import { estimateTokens as estimateResponseTokens, inputToMessages, responseObject, streamEvents } from "./responses/adapter.js";
import type { LocalResponsesRequest } from "./responses/types.js";
import { installManagedLlamaServer, llamaServerManagedRoot, LlamaServerManager } from "./runtime/llama-server.js";
import { LlamaServerPool, llamaServerPoolSearchRoots } from "./runtime/llama-server-pool.js";
import { sanitizeRuntimeConfig } from "./runtime/config.js";
import { planResidency } from "./runtime/residency.js";
import { MarketplaceStore } from "./store.js";
import {
  dryRunHuggingFaceDownload,
  listHuggingFaceFiles,
  searchHuggingFace,
  validateHuggingFacePath,
  validateHuggingFaceRepoId,
  validateHuggingFaceRevision
} from "./sources/huggingface.js";
import { resolveOllamaModel, searchOllamaCatalog } from "./sources/ollama-registry.js";
import { scanSystem } from "./system/scan.js";
import { sha256File } from "./utils.js";

export interface RuntimeContext {
  config: DaemonConfig;
  store: MarketplaceStore;
  ollama: OllamaAdapter;
  lmstudio: LmStudioAdapter;
  downloads: DownloadManager;
  engine: LlamaEngine;
  hotPool: HotModelPool;
  modelIndex: ModelIndex;
  queue: GenerationQueue;
  embeddings: Promise<EmbeddingProvider | undefined>;
  llamaServer: LlamaServerManager;
  llamaServerPool: LlamaServerPool;
}

// Read the daemon's version from its own package.json once at module load so
// /health and /api/version always agree with the published package version.
// Resolves the same way at src/ (tsc) and dist/ (runtime): both sit one dir
// below the package.json (src/server.ts → ../package.json; dist/server.js →
// ../package.json).
const DAEMON_VERSION: string = (() => {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = path.resolve(here, "..", "package.json");
    const raw = fs.readFileSync(pkgPath, "utf8");
    const parsed = JSON.parse(raw) as { version?: unknown };
    if (typeof parsed.version === "string" && parsed.version.length > 0) return parsed.version;
  } catch {
    // Fall through to dev sentinel.
  }
  return "0.0.0-unknown";
})();

export function createContext(config: DaemonConfig): RuntimeContext {
  fs.mkdirSync(config.storageDir, { recursive: true });
  fs.mkdirSync(config.modelsDir, { recursive: true });
  fs.mkdirSync(config.downloadsDir, { recursive: true });
  const store = new MarketplaceStore(config.dbPath);
  const ollama = new OllamaAdapter({ host: config.ollamaHost });
  const lmstudio = new LmStudioAdapter(config.lmStudioHost);
  const downloads = new DownloadManager(config, store, ollama);
  const engine = new LlamaEngine();
  const hotPool = new HotModelPool();
  const embeddings = createEmbeddingProvider().catch(() => undefined);
  const llamaServer = new LlamaServerManager({
    binaryPath: process.env.LLAMA_SERVER_BIN,
    modelPath: process.env.LLAMA_SERVER_MODEL,
    port: process.env.LLAMA_SERVER_PORT ? Number(process.env.LLAMA_SERVER_PORT) : undefined,
    searchRoots: [llamaServerManagedRoot(config.storageDir), process.cwd(), config.storageDir, config.modelsDir]
  });
  const llamaServerPool = new LlamaServerPool();
  const modelIndex = new ModelIndex(() =>
    defaultModelRoots({
      modelsDir: config.modelsDir,
      downloadsDir: config.downloadsDir,
      extraDirs: config.modelScanDirs
    })
  );
  const queue = new GenerationQueue();
  if (config.enableEngine) {
    // Initialize the native binding in the background so the first chat is fast
    // and the runtime list can report accurate readiness.
    void engine.probe();
  }
  void modelIndex.refresh("startup");
  void warmHotPool({ config, store, ollama, lmstudio, downloads, engine, hotPool, modelIndex, queue, embeddings, llamaServer, llamaServerPool }).catch(() => undefined);
  return { config, store, ollama, lmstudio, downloads, engine, hotPool, modelIndex, queue, embeddings, llamaServer, llamaServerPool };
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
      const privilegedGuard = evaluatePrivilegedActionGuard(
        { method: request.method || "GET", pathname: url.pathname, origin: request.headers.origin, headers: request.headers },
        context.config
      );
      if (!privilegedGuard.ok) {
        return json(response, { error: privilegedGuard.reason }, privilegedGuard.status);
      }

      if (route === "GET /health") {
        return json(response, {
          ok: true,
          version: DAEMON_VERSION,
          storage: { database: fs.existsSync(context.config.dbPath) }
        });
      }

      if (route === "GET /api/server/readiness") {
        return json(response, await serverReadiness(context));
      }

      if (route === "GET /api/runtimes") {
        return json(response, { runtimes: await runtimeStatuses(context) });
      }

      if (route === "GET /api/system/scan") {
        return json(response, await scanSystem(context.config.modelsDir, await runtimeStatuses(context)));
      }

      if (route === "GET /api/models/index") {
        const models = await context.modelIndex.models();
        const merged = await mergeActiveRuntimeModels(context, models);
        return json(response, { index: context.modelIndex.status(), models: withLoadedState(context, merged) });
      }

      if (route === "POST /api/models/index/refresh") {
        const snapshot = await context.modelIndex.refresh("manual");
        const merged = await mergeActiveRuntimeModels(context, snapshot.models);
        return json(response, { index: snapshot.status, models: withLoadedState(context, merged) });
      }

      if (route === "GET /api/benchmarks") {
        return json(response, { benchmarks: context.store.listBenchmarks() });
      }

      if (route === "POST /api/benchmarks/run") {
        const body = requireObject(await readJson<{ model?: string; prompt?: string }>(request));
        const benchmark = await runLocalBenchmark(context, {
          model: optionalString(body.model, "model", 500),
          prompt: optionalString(body.prompt, "prompt", 2_000)
        });
        return json(response, { benchmark });
      }

      if (route === "GET /api/routing/standard") {
        return json(response, standardRouteDecision(context, await context.modelIndex.models()));
      }

      if (route === "GET /api/compatibility/scorecard") {
        return json(response, await compatibilityScorecard(context));
      }

      if (route === "GET /api/engine/hot-pool") {
        return json(response, context.hotPool.status(context.store.getRuntimeConfig()));
      }

      if (route === "POST /api/engine/hot-pool/warm") {
        return json(response, await warmHotPool(context));
      }

      if (route === "GET /api/engine/residency") {
        const config = context.store.getRuntimeConfig();
        const plan = await residencyPlanForContext(context);
        return json(response, {
          plan,
          hotPool: context.hotPool.status(config)
        });
      }

      if (route === "GET /api/queue") {
        return json(response, context.queue.status());
      }

      const cancelQueue = url.pathname.match(/^\/api\/queue\/([^/]+)\/cancel$/);
      if (request.method === "POST" && cancelQueue) {
        return json(response, { ok: context.queue.cancel(decodeURIComponent(cancelQueue[1])) });
      }

      if (route === "GET /api/catalog/search") {
        const query = url.searchParams.get("q") || "";
        const rawLimit = Number.parseInt(url.searchParams.get("limit") || "12", 10);
        const limit = clampInt(Number.isFinite(rawLimit) ? rawLimit : 12, 1, 50);
        const source = (url.searchParams.get("source") || "").toLowerCase();
        let items;
        if (source === "hf" || source === "huggingface") {
          items = await searchHuggingFace(query, limit);
        } else if (source === "ollama") {
          items = await searchOllamaCatalog(query, limit);
        } else {
          // Default (no source param): merge both catalogs so users see options
          // across registries; keep HF first since it's the wider library.
          const [hf, ollama] = await Promise.all([
            searchHuggingFace(query, limit).catch(() => []),
            searchOllamaCatalog(query, limit).catch(() => [])
          ]);
          items = [...hf, ...ollama].slice(0, limit);
        }
        return json(response, { items, source: source || "all" });
      }

      if (route === "GET /api/catalog/ollama/resolve") {
        const ref = required(url.searchParams.get("ref"), "ref");
        return json(response, { model: await resolveOllamaModel(ref) });
      }

      if (route === "GET /api/catalog/hf/files") {
        const repo = validateHuggingFaceRepoId(required(url.searchParams.get("repo"), "repo"));
        const revision = validateHuggingFaceRevision(url.searchParams.get("revision") || "main");
        return json(response, { files: await listHuggingFaceFiles(repo, revision) });
      }

      if (route === "GET /api/catalog/hf/readme") {
        const repo = validateHuggingFaceRepoId(required(url.searchParams.get("repo"), "repo"));
        try {
          const readmeUrl = `https://huggingface.co/${repo}/raw/main/README.md`;
          const res = await fetchTextWithLimit(readmeUrl, { maxBytes: README_RESPONSE_LIMIT, timeoutMs: 8_000 });
          if (!res.ok) {
            const fallbackUrl = `https://huggingface.co/${repo}/raw/master/README.md`;
            const fallbackRes = await fetchTextWithLimit(fallbackUrl, { maxBytes: README_RESPONSE_LIMIT, timeoutMs: 8_000 });
            if (!fallbackRes.ok) {
              return json(response, { readme: "" });
            }
            return json(response, { readme: await fallbackRes.limitedText() });
          }
          return json(response, { readme: await res.limitedText() });
        } catch (err) {
          return json(response, { readme: "" });
        }
      }

      if (route === "POST /api/catalog/hf/dry-run") {
        const body = requireObject(await readJson<{ repoId: string; revision?: string; allowPatterns?: string[]; patterns?: string[] }>(request));
        const repoId = validateHuggingFaceRepoId(requireString(body.repoId, "repoId", 200));
        const revision = validateHuggingFaceRevision(typeof body.revision === "string" ? body.revision : "main");
        const patterns = sanitizePatterns(body.allowPatterns || body.patterns || ["*.gguf"]);
        return json(
          response,
          await dryRunHuggingFaceDownload(repoId, revision, patterns)
        );
      }

      if (route === "GET /api/inventory") {
        return json(response, { artifacts: await inventory(context) });
      }

      const verifyArtifactMatch = url.pathname.match(/^\/api\/artifacts\/([^/]+)\/verify$/);
      if (request.method === "POST" && verifyArtifactMatch) {
        return json(response, { verification: await verifyArtifact(context, decodeURIComponent(verifyArtifactMatch[1])) });
      }

      const revealArtifactMatch = url.pathname.match(/^\/api\/artifacts\/([^/]+)\/reveal$/);
      if (request.method === "POST" && revealArtifactMatch) {
        return json(response, await revealArtifact(context, decodeURIComponent(revealArtifactMatch[1])));
      }

      if (route === "GET /api/downloads") {
        return json(response, { jobs: context.downloads.list() });
      }

      if (route === "GET /api/downloads/events") {
        return sseDownloads(request, response, context);
      }

      if (route === "POST /api/downloads") {
        const body = sanitizeDownloadRequest(await readJson<StartDownloadRequest>(request));
        return json(response, { job: await context.downloads.start(body) }, 202);
      }

      const matchDownloadPause = url.pathname.match(/^\/api\/downloads\/([^/]+)\/pause$/);
      if (request.method === "POST" && matchDownloadPause) {
        const jobId = decodeURIComponent(matchDownloadPause[1]);
        return json(response, { job: await context.downloads.pause(jobId) });
      }

      const matchDownloadResume = url.pathname.match(/^\/api\/downloads\/([^/]+)\/resume$/);
      if (request.method === "POST" && matchDownloadResume) {
        const jobId = decodeURIComponent(matchDownloadResume[1]);
        return json(response, { job: await context.downloads.resume(jobId) });
      }

      const matchDownloadCancel = url.pathname.match(/^\/api\/downloads\/([^/]+)\/cancel$/);
      if (request.method === "POST" && matchDownloadCancel) {
        const jobId = decodeURIComponent(matchDownloadCancel[1]);
        return json(response, { job: await context.downloads.cancel(jobId) });
      }

      if (route === "POST /api/delete-plans") {
        const body = requireObject(await readJson<{ artifactId: string }>(request));
        const artifactId = requireString(body.artifactId, "artifactId", 200);
        return json(response, {
          plan: createDeletePlan(
            { store: context.store, ollama: context.ollama, roots: [context.config.modelsDir, context.config.downloadsDir] },
            artifactId
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
        const body = requireObject(await readJson<{ runtime: string }>(request));
        const runtime = requireString(body.runtime, "runtime", 40);
        if (runtime !== "ollama" && runtime !== "lmstudio") {
          return json(response, { ok: false, error: `Invalid runtime: ${runtime}` }, 400);
        }

        const isWin = os.platform() === "win32";
        if (!isWin) {
          return json(response, {
            ok: false,
            error: `Optional runtime install is only fully automated on Windows (via winget) in this version. On macOS/Linux, please run: ${
              runtime === "ollama" ? "curl -fsSL https://ollama.com/install.sh | sh" : "brew install --cask lm-studio"
            }`
          }, 400);
        }

        const wingetId = runtime === "ollama" ? "Ollama.Ollama" : "LMStudio.LMStudio";
        const child = spawn("winget", ["install", wingetId, "--silent", "--accept-package-agreements", "--accept-source-agreements"], {
          detached: true,
          stdio: "ignore",
          windowsHide: true
        });
        child.unref();

        context.store.audit("install-triggered", runtime, { wingetId, status: "spawned", origin: request.headers.origin || "no-origin" });

        return json(response, {
          ok: true,
          message: `Optional runtime installation for ${runtime} (${wingetId}) started in the background.`
        });
      }

      if (route === "POST /api/runtimes/ollama/server/start") {
        const message = await context.ollama.startEngine();
        return json(response, { ok: true, message });
      }

      if (route === "POST /api/runtimes/lmstudio/server/start") {
        const body = requireObject(await readJson<{ port?: number }>(request));
        const port = optionalClampedInt(body.port, "port", 1, 65_535) || 1234;
        return json(response, { ok: true, message: await context.lmstudio.startServer(port) });
      }

      if (route === "POST /api/runtimes/evict-all") {
        const lmstudioEvicted = [];
        try {
          await context.lmstudio.unload();
          lmstudioEvicted.push("all");
        } catch {
          // Ignored
        }

        const ollamaEvicted = [];
        try {
          const loadedOllama = await context.ollama.ps();
          for (const m of loadedOllama) {
            await context.ollama.unload(m.name);
            ollamaEvicted.push(m.name);
          }
        } catch {
          // Ignored
        }

        try {
          await context.engine.unload();
        } catch {
          // Ignored
        }

        context.store.audit("multi-runtime-eviction", "all", {
          ollamaEvicted,
          lmstudioEvicted,
          origin: request.headers.origin || "no-origin"
        });

        return json(response, {
          ok: true,
          message: "Triggered eviction of resident models in Ollama, LM Studio, and built-in engine to clear GPU VRAM.",
          ollamaEvicted,
          lmstudioEvicted
        });
      }

      if (route === "POST /api/engine/upgrade") {
        context.store.audit("engine-upgrade-triggered", "node-llama-cpp", { origin: request.headers.origin || "no-origin" });
        void runEngineUpgrade(context);

        return json(response, {
          ok: true,
          message: "Engine self-healing upgrade launched in the background. Rebuilding with native acceleration."
        });
      }

      if (route === "GET /api/runtimes/llamacpp/models") {
        const models = withLoadedState(context, await context.modelIndex.models());
        return json(response, { models });
      }

      if (route === "GET /api/engine/doctor") {
        const installed = installedEngineVersion();
        const latest = await latestEngineVersion();
        return json(response, {
          engine: {
            available: context.engine.available,
            gpu: context.engine.gpu,
            loadedModel: context.engine.loadedModel ?? null,
            error: context.engine.lastError ?? null
          },
          bundledLlamaRelease: readBundledLlamaRelease() ?? null,
          nodeLlamaCppVersion: installed ?? null,
          latestNodeLlamaCpp: latest ?? null,
          updateAvailable: Boolean(latest && installed && latest !== installed),
          knownUnsupportedArchitectures: Object.entries(MIN_RELEASE_BY_ARCH).map(([architecture, min]) => ({
            architecture,
            minRelease: `b${min}`
          }))
        });
      }

      if (route === "GET /api/engine/config") {
        return json(response, { config: context.store.getRuntimeConfig() });
      }

      if (route === "PUT /api/engine/config") {
        try {
          const knownModelPaths = (await context.modelIndex.models()).map((model) => model.path).filter(Boolean);
          const config = sanitizeRuntimeConfig(await readJson<unknown>(request), { knownModelPaths });
          return json(response, { config: context.store.setRuntimeConfig(config) });
        } catch (error) {
          return json(response, { error: (error as Error).message }, 400);
        }
      }

      if (route === "GET /api/engine/server/status") {
        await configureLlamaServer(context);
        return json(response, context.llamaServer.status());
      }

      if (route === "GET /api/engine/server/pool") {
        const config = context.store.getRuntimeConfig();
        return json(response, context.llamaServerPool.status(config.delegatedServer.enabled));
      }

      if (route === "POST /api/engine/server/install") {
        const body = await readJson<unknown>(request, 64_000);
        const result = await installManagedLlamaServer(context.config.storageDir, sanitizeLlamaServerInstallRequest(body));
        await configureLlamaServer(context);
        return json(response, result, result.ok ? 200 : 422);
      }

      if (route === "POST /api/engine/server/start") {
        await configureLlamaServer(context);
        return json(response, await context.llamaServer.start());
      }

      if (route === "POST /api/engine/server/stop") {
        return json(response, await context.llamaServer.stop());
      }

      if (route === "POST /api/engine/server/pool/warm") {
        return json(response, await warmLlamaServerPool(context));
      }

      if (route === "POST /api/engine/server/pool/stop") {
        const config = context.store.getRuntimeConfig();
        return json(response, await context.llamaServerPool.stopAll(config.delegatedServer.enabled));
      }

      if (route === "POST /api/runtimes/llamacpp/load") {
        const body = sanitizeEngineLoadRequest(await readJson<unknown>(request));
        const target = resolveEngineModelPath(context, body);
        try {
          const result = await safeLoadEngineModel(context, {
            modelPath: target.path,
            displayName: target.displayName,
            systemPrompt: body.systemPrompt,
            gpuLayers: body.gpuLayers,
            contextSize: body.contextSize,
            threads: body.threads,
            draftModelPath: body.draftModelPath
          });
          context.store.audit("engine-load", target.displayName, { path: target.path, gpu: result.gpu });
          return json(response, { ok: true, loaded: result.loaded, gpu: result.gpu });
        } catch (err) {
          return json(response, { ok: false, error: (err as Error).message }, 422);
        }
      }

      if (route === "POST /api/runtimes/llamacpp/unload") {
        await context.engine.unload();
        return json(response, { ok: true, message: "HT Studio Engine model unloaded." });
      }

      const runtimeLoad = url.pathname.match(/^\/api\/runtimes\/([^/]+)\/load$/);
      if (request.method === "POST" && runtimeLoad) {
        const runtime = decodeURIComponent(runtimeLoad[1]);
        const body = sanitizeRuntimeLoadRequest(await readJson<unknown>(request), runtime);
        if (runtime === "lmstudio") return json(response, { ok: true, message: await context.lmstudio.load(body) });
        if (runtime === "ollama") return json(response, { ok: true, message: "Ollama loads models on demand through chat/generate requests." });
        return json(response, { ok: false, message: `Runtime load is not implemented for ${runtime}.` }, 400);
      }

      const runtimeUnload = url.pathname.match(/^\/api\/runtimes\/([^/]+)\/unload$/);
      if (request.method === "POST" && runtimeUnload) {
        const runtime = decodeURIComponent(runtimeUnload[1]);
        const body = requireObject(await readJson<{ model?: string }>(request));
        const model = typeof body.model === "string" ? requireString(body.model, "model", 500) : undefined;
        if (runtime === "lmstudio") return json(response, { ok: true, message: await context.lmstudio.unload(model) });
        return json(response, { ok: false, message: `Runtime unload is not implemented for ${runtime}.` }, 400);
      }

      if (route === "GET /api/version") {
        return json(response, { version: DAEMON_VERSION });
      }

      if (route === "GET /api/tags") {
        const models = [
          ...ownedEngineModels(context),
          ...(await localGgufModels(context))
        ].map(ollamaModelSummary);
        return json(response, { models });
      }

      if (route === "POST /api/show") {
        const body = requireObject<Record<string, unknown>>(await readJson<unknown>(request));
        const model = requireString(body.model, "model", 500);
        const local = resolveLocalModelByName(context, model);
        if (local) {
          const entry = [...ownedEngineModels(context), ...localGgufSnapshot(context)].find((candidate) => candidate.name === model);
          return json(response, ollamaShowModel(model, local, entry));
        }
        try {
          const upstream = await context.ollama.show(model);
          return json(response, upstream);
        } catch (error) {
          return json(response, { error: `Model not found locally and Ollama show is unavailable: ${(error as Error).message}` }, 404);
        }
      }

      if (route === "GET /api/ps") {
        return json(response, ollamaRunningModels(context));
      }

      if (route === "GET /v1/models") {
        const ids = [
          ...(context.engine.loadedModel ? [context.engine.loadedModel] : []),
          ...ownedEngineModels(context).map((model) => model.name),
          ...(await localGgufModels(context)).map((model) => model.name)
        ];
        return json(response, openAiModelList(ids));
      }

      const getResponseMatch = url.pathname.match(/^\/v1\/responses\/([^/]+)$/);
      if (request.method === "GET" && getResponseMatch) {
        const stored = context.store.getResponse(decodeURIComponent(getResponseMatch[1]));
        if (!stored) return json(response, { error: { message: "Response not found", type: "not_found" } }, 404);
        return json(response, stored);
      }

      if (route === "POST /v1/chat/completions") {
        const body = await readJson<unknown>(request);
        await openAiChat(request, response, context, body);
        return;
      }

      if (route === "POST /v1/completions") {
        const body = requireObject<Record<string, unknown>>(await readJson<unknown>(request));
        await openAiLegacyCompletions(request, response, context, body);
        return;
      }

      if (route === "POST /v1/responses") {
        const body = requireObject(await readJson<Record<string, unknown>>(request));
        await openAiResponses(request, response, context, body);
        return;
      }

      if (route === "POST /v1/embeddings") {
        const body = requireObject<Record<string, unknown>>(await readJson<unknown>(request, 512_000));
        const provider = await context.embeddings;
        if (!provider) {
          const delegated = await delegatedBackend(context, { autoStart: false, model: typeof body.model === "string" ? body.model : undefined });
          if (delegated && "endpoint" in delegated) {
            return proxyJsonRequest(request, response, `${delegated.endpoint}/v1/embeddings`, body);
          }
          return json(
            response,
            {
              error: {
                message: "Local embeddings are not enabled.",
                type: "not_implemented",
                code: "local_embeddings_unavailable"
              }
            },
            501
          );
        }
        const input = normalizeEmbeddingInput(body.input as LocalEmbeddingRequest["input"]);
        const dimensions = optionalClampedInt(body.dimensions, "dimensions", 1, 8192);
        const result = await provider.embed(input, { dimensions });
        const base64 = body.encoding_format === "base64";
        return json(response, {
          object: "list",
          model: result.model,
          data: result.vectors.map((embedding, index) => ({
            object: "embedding",
            index,
            embedding: base64 ? Buffer.from(Float32Array.from(embedding).buffer).toString("base64") : embedding
          })),
          usage: { prompt_tokens: result.tokenEstimate, total_tokens: result.tokenEstimate }
        });
      }

      if (route === "POST /api/chat") {
        const body = requireObject(await readJson<Record<string, unknown>>(request));
        if (Array.isArray(body.messages)) {
          body.messages = applyBilingualSystemPromptGuard(body.messages as ChatMessage[]);
        }
        const requestedRuntime = typeof body?.runtime === "string" ? body.runtime : undefined;
        const wantsLlamaCpp = requestedRuntime === "llamacpp" || body?.engine === "llamacpp";
        const wantsExternalRuntime = Boolean(requestedRuntime && requestedRuntime !== "llamacpp");
        const isLocalModel =
          !wantsExternalRuntime && typeof body?.model === "string" && !!resolveLocalModelByName(context, body.model);
        if (wantsLlamaCpp || isLocalModel) {
          await engineChat(request, response, context, sanitizeEngineChatRequest(body));
          return;
        }
        const upstream = await context.ollama.chat(sanitizeOllamaChatRequest(body));
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

      if (route === "POST /api/generate") {
        const body = requireObject(await readJson<Record<string, unknown>>(request));
        await ollamaGenerate(request, response, context, sanitizeOllamaGenerateRequest(body));
        return;
      }

      if (request.method === "GET" && url.pathname.startsWith("/widget/")) {
        return serveWidget(url.pathname, response);
      }

      return json(response, { error: "Not found" }, 404);
    } catch (error) {
      return json(response, { error: (error as Error).message }, errorStatus(error));
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

async function serverReadiness(context: RuntimeContext) {
  const [models, runtimes] = await Promise.all([context.modelIndex.models(), runtimeStatuses(context)]);
  const runtimeConfig = context.store.getRuntimeConfig();
  const engineRuntime = runtimes.find((runtime) => runtime.id === "llamacpp");
  const llamaServer = context.llamaServer.status();
  const llamaServerPool = context.llamaServerPool.status(runtimeConfig.delegatedServer.enabled);
  const queue = context.queue.status();
  const hotPool = context.hotPool.status(runtimeConfig);
  const localRunnableModels = models.filter((model) => model.runnable && !model.path.startsWith("virtual:"));
  const trust = modelTrustSummary(models, hotPool.residencyPlan);
  const loadedModels = [
    ...(context.engine.loadedModel ? [context.engine.loadedModel] : []),
    ...hotPool.entries.filter((entry) => entry.state === "ready").map((entry) => entry.model)
  ];
  const endpoints = {
    health: true,
    openAiModels: true,
    openAiChatCompletions: true,
    openAiCompletions: true,
    openAiResponses: true,
    openAiEmbeddings: true,
    ollamaVersion: true,
    ollamaTags: true,
    ollamaChat: true,
    ollamaGenerate: true,
    ollamaShow: true,
    ollamaPs: true
  };
  const blockers: string[] = [];
  if (!engineRuntime?.online) blockers.push("Built-in llama.cpp engine is not available.");
  if (localRunnableModels.length === 0) blockers.push("No runnable local GGUF models are indexed.");
  if (runtimeConfig.backend === "delegated-server" && !llamaServer.running && !llamaServerPool.entries.some((entry) => entry.state === "running")) {
    blockers.push("Delegated llama-server backend is selected but no delegated server process is running.");
  }
  const warnings: string[] = [];
  if ((queue.queued?.length || 0) > 0) warnings.push(`${queue.queued.length} generation request(s) are currently queued.`);
  if (hotPool.enabled && hotPool.entries.filter((entry) => entry.state === "ready").length === 0) {
    warnings.push("Hot model pool is enabled but has no ready entries yet.");
  }

  const ollamaStatus = runtimes.find((r) => r.id === "ollama");
  const lmStudioStatus = runtimes.find((r) => r.id === "lmstudio");
  const ollamaLoaded = ollamaStatus?.loadedModels || [];
  const lmstudioLoaded = lmStudioStatus?.loadedModels || [];
  const inprocessLoaded = loadedModels.map((m) => ({ id: m, name: m, runtime: "llamacpp" as const }));
  const activeRuntimesCount =
    (ollamaLoaded.length > 0 ? 1 : 0) +
    (lmstudioLoaded.length > 0 ? 1 : 0) +
    (inprocessLoaded.length > 0 ? 1 : 0);
  const multiRuntimeVramResident = {
    active: activeRuntimesCount > 1,
    ollama: ollamaLoaded,
    lmstudio: lmstudioLoaded,
    inprocess: inprocessLoaded
  };
  if (multiRuntimeVramResident.active) {
    warnings.push("VRAM saturation alert: Multiple active local model engines are resident in VRAM. Consider evicting unused external runtimes.");
  }

  return {
    ok: blockers.length === 0,
    mode: runtimeConfig.backend,
    version: DAEMON_VERSION,
    multiRuntimeVramResident,
    endpoints,
    runtime: {
      engineAvailable: Boolean(engineRuntime?.online),
      engineLoadedModel: context.engine.loadedModel || null,
      delegatedServer: llamaServer,
      delegatedServerPool: llamaServerPool
    },
    models: {
      indexed: models.length,
      runnableLocal: localRunnableModels.length,
      automaticEligible: trust.automaticEligible,
      ambientDiscovered: trust.ambientDiscovered,
      loaded: loadedModels
    },
    trust,
    queue,
    hotPool,
    blockers,
    warnings,
    recommendations: blockers.length
      ? [
          "Install or enable the built-in engine runtime.",
          "Download or sideload at least one runnable GGUF model.",
          "Use /api/engine/server/status and /api/engine/server/start when delegated-server mode is selected."
        ]
      : ["Server is ready for local OpenAI/Ollama-compatible single-user inference."]
  };
}

async function compatibilityScorecard(context: RuntimeContext): Promise<any> {
  const [models, readiness] = await Promise.all([context.modelIndex.models(), serverReadiness(context)]);
  const config = context.store.getRuntimeConfig();
  const standardRoute = standardRouteDecision(context, models);
  const residencyPlan = await residencyPlanForContext(context);
  const trust = modelTrustSummary(models, residencyPlan);
  const recommendations = compatibilityRecommendations(readiness.recommendations, standardRoute.selected, trust);

  return {
    ok: Boolean(readiness.ok && (standardRoute.selected || readiness.models.loaded.length > 0)),
    generatedAt: new Date().toISOString(),
    readiness: {
      ok: readiness.ok,
      mode: readiness.mode,
      blockers: readiness.blockers,
      warnings: readiness.warnings,
      recommendations: readiness.recommendations
    },
    endpoints: readiness.endpoints,
    standardRoute,
    queue: readiness.queue,
    runtime: {
      backend: config.backend,
      residencyMode: config.residencyMode,
      hotPoolEnabled: config.hotPool.enabled,
      delegatedServerEnabled: config.delegatedServer.enabled
    },
    trust,
    recommendations
  };
}

function compatibilityRecommendations(
  existing: string[],
  selected: ModelIndexEntry | null,
  trust: ReturnType<typeof modelTrustSummary>
) {
  const recommendations = [...existing];
  if (!selected) {
    recommendations.push("Install a model through HT Studio, use Ollama/LM Studio, or add a deliberate HT_STUDIO_MODEL_DIRS root to enable automatic standard routing.");
  }
  if (trust.ambientDiscovered > 0) {
    recommendations.push(`${trust.ambientDiscovered} ambient model(s) are visible for manual loading but excluded from automatic startup warmup.`);
  }
  return [...new Set(recommendations)];
}

function modelTrustSummary(models: ModelIndexEntry[], residencyPlan?: EngineResidencyPlan) {
  const levels: Record<ModelTrustLevel, number> = {
    owned: 0,
    configured: 0,
    "installed-runtime": 0,
    ambient: 0,
    virtual: 0
  };
  const physical = models.filter((model) => !model.path.startsWith("virtual:"));
  for (const model of models) {
    levels[modelTrustLevel(model)] += 1;
  }
  return {
    policy: "Owned, configured, Ollama, and LM Studio models can be used for automatic routing/residency; broad filesystem and cache discoveries remain manual-only until explicitly configured.",
    indexedPhysical: physical.length,
    automaticEligible: physical.filter((model) => model.runnable && isAutomaticModel(model)).length,
    ambientDiscovered: physical.filter((model) => modelTrustLevel(model) === "ambient").length,
    skippedAmbient: residencyPlan?.skipped.filter((candidate) => modelTrustLevel(candidate.model) === "ambient").length ?? 0,
    levels
  };
}

function modelTrustLevel(model: ModelIndexEntry): ModelTrustLevel {
  if (model.path.startsWith("virtual:")) return "virtual";
  return model.trustLevel ?? "owned";
}

function isAutomaticModel(model: ModelIndexEntry) {
  if (model.autoWarmEligible === false || modelTrustLevel(model) === "ambient") return false;
  return true;
}

function standardRouteDecision(context: RuntimeContext, models = context.modelIndex.snapshot().models) {
  return chooseStandardModel(models, context.store.listBenchmarks(), {
    loadedModel: context.engine.loadedModel
  });
}

async function warmHotPool(context: RuntimeContext) {
  const config = context.store.getRuntimeConfig();
  if (!context.hotPool || !config.hotPool?.enabled) {
    return context.hotPool?.status(config) ?? { enabled: false, maxModels: 0, maxModelBytes: 0, residencyMode: config.residencyMode, entries: [] };
  }
  const plan = await residencyPlanForContext(context);
  return context.hotPool.warm(plan.selected.map((candidate) => candidate.model), config, plan.memory.source === "system-scan" ? await scanSystem(context.config.modelsDir, []) : undefined);
}

async function residencyPlanForContext(context: RuntimeContext) {
  const config = context.store.getRuntimeConfig();
  const decision = standardRouteDecision(context, await context.modelIndex.models());
  const models = decision.candidates
    .filter((candidate) => candidate.healthy)
    .map((candidate) => candidate.model);
  const scan = await scanSystem(context.config.modelsDir, []);
  return planResidency(models, config, context.hotPool.status(config).entries, scan);
}

async function warmLlamaServerPool(context: RuntimeContext) {
  const config = context.store.getRuntimeConfig();
  const plan = await residencyPlanForContext(context);
  return context.llamaServerPool.warm(plan, {
    binaryPath: process.env.LLAMA_SERVER_BIN,
    basePort: config.delegatedServer.port,
    parallel: config.delegatedServer.parallel,
    continuousBatching: config.delegatedServer.continuousBatching,
    searchRoots: llamaServerPoolSearchRoots(context.config.storageDir, process.cwd(), context.config.modelsDir)
  });
}

function ollamaModelSummary(model: {
  name: string;
  sizeBytes?: number;
  format?: string;
  family?: string;
  parameterSize?: string;
  quantization?: string;
}) {
  const family = model.family || "llama";
  return {
    name: model.name,
    model: model.name,
    modified_at: new Date().toISOString(),
    size: model.sizeBytes || 0,
    digest: "",
    details: {
      parent_model: "",
      format: model.format || "gguf",
      family,
      families: [family],
      parameter_size: model.parameterSize || "",
      quantization_level: model.quantization || ""
    }
  };
}

function ollamaShowModel(
  model: string,
  local: { path: string; displayName: string },
  entry?: { sizeBytes?: number; family?: string; parameterSize?: string; quantization?: string; source?: string }
) {
  const family = entry?.family || "llama";
  return {
    modelfile: `FROM ${local.path}`,
    parameters: "",
    template: "",
    details: {
      parent_model: "",
      format: "gguf",
      family,
      families: [family],
      parameter_size: entry?.parameterSize || "",
      quantization_level: entry?.quantization || ""
    },
    model_info: {
      "general.architecture": family,
      "general.name": local.displayName || model,
      "general.file_type": "gguf"
    },
    capabilities: ["completion"],
    modified_at: new Date().toISOString(),
    size: entry?.sizeBytes || 0
  };
}

function ollamaRunningModels(context: RuntimeContext) {
  const loaded = new Map<string, ReturnType<typeof ollamaModelSummary> & { expires_at: string; size_vram: number; context_length: number }>();
  const config = context.store.getRuntimeConfig();
  const expiresAt = new Date(Date.now() + Math.max(60_000, config.unloadAfterIdleMs || 900_000)).toISOString();
  const push = (model: { name: string; sizeBytes?: number; family?: string; parameterSize?: string; quantization?: string }) => {
    const summary = ollamaModelSummary(model);
    loaded.set(summary.name, {
      ...summary,
      expires_at: expiresAt,
      size_vram: 0,
      context_length: config.contextSize || 4096
    });
  };
  if (context.engine.loadedModel) {
    const entry = localGgufSnapshot(context).find((model) => model.name === context.engine.loadedModel);
    push({ name: context.engine.loadedModel, sizeBytes: entry?.sizeBytes });
  }
  if (context.hotPool) {
    for (const entry of context.hotPool.status(config).entries) {
      if (entry.state === "ready") push({ name: entry.model, sizeBytes: entry.sizeBytes });
    }
  }
  const delegated = context.llamaServer.status();
  if (delegated.running) {
    push({ name: context.engine.loadedModel || "delegated-llama-server" });
  }
  for (const entry of context.llamaServerPool.status(config.delegatedServer.enabled).entries) {
    if (entry.state === "running") push({ name: entry.model });
  }
  return { models: [...loaded.values()] };
}

async function configureLlamaServer(context: RuntimeContext) {
  const config = context.store.getRuntimeConfig();
  const decision = standardRouteDecision(context, await context.modelIndex.models());
  const selectedModel = decision.selected && !decision.selected.path.startsWith("virtual:") ? decision.selected.path : undefined;
  context.llamaServer.configure({
    binaryPath: process.env.LLAMA_SERVER_BIN,
    modelPath: process.env.LLAMA_SERVER_MODEL || context.engine.loadedPath || selectedModel,
    port: config.delegatedServer.port,
    parallel: config.delegatedServer.parallel,
    continuousBatching: config.delegatedServer.continuousBatching,
    searchRoots: [llamaServerManagedRoot(context.config.storageDir), process.cwd(), context.config.storageDir, context.config.modelsDir]
  });
}

async function delegatedBackend(
  context: RuntimeContext,
  options: { autoStart?: boolean; model?: string } = {}
): Promise<{ endpoint: string } | { status: number; message: string } | undefined> {
  const config = context.store.getRuntimeConfig();
  if (config.backend !== "delegated-server" && !config.delegatedServer.enabled) return undefined;
  const pooledEndpoint = context.llamaServerPool.endpointForModel(options.model);
  if (pooledEndpoint) return { endpoint: pooledEndpoint };
  if (config.delegatedServer.enabled && options.autoStart !== false) {
    const pool = await warmLlamaServerPool(context);
    const endpoint = context.llamaServerPool.endpointForModel(options.model) || pool.entries.find((entry) => entry.state === "running")?.endpoint;
    if (endpoint) return { endpoint };
    if (pool.entries.some((entry) => entry.state === "starting")) {
      const readyEndpoint = await waitForPoolEndpoint(context, options.model, 90_000);
      if (readyEndpoint) return { endpoint: readyEndpoint };
      return {
        status: 503,
        message: "Delegated llama-server pool is still starting and did not become healthy in time."
      };
    }
  }
  await configureLlamaServer(context);
  let status = context.llamaServer.status();
  if (!status.running && options.autoStart !== false && status.available) {
    status = await context.llamaServer.start();
    if (status.running && status.endpoint) {
      const ready = await waitForDelegatedHealth(status.endpoint, 45_000);
      if (!ready) {
        return {
          status: 503,
          message: `Delegated llama-server started, but did not become healthy in time. ${context.llamaServer.status().message}`
        };
      }
      status = context.llamaServer.status();
    }
  }
  if (!status.running) {
    return {
      status: 503,
      message: `Delegated llama-server backend is selected, but no server is running. ${status.message}`
    };
  }
  if (!status.endpoint) {
    return {
      status: 503,
      message: "Delegated llama-server backend is selected, but no endpoint is available."
    };
  }
  return {
    endpoint: status.endpoint
  };
}

async function waitForPoolEndpoint(context: RuntimeContext, model: string | undefined, timeoutMs: number) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const endpoint = context.llamaServerPool.endpointForModel(model);
    if (endpoint) return endpoint;
    const status = context.llamaServerPool.status(true);
    if (status.entries.length > 0 && status.entries.every((entry) => entry.state !== "starting")) return undefined;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return undefined;
}

async function waitForDelegatedHealth(endpoint: string, timeoutMs: number) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${endpoint}/health`, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return true;
    } catch {
      // Keep polling until the server finishes loading or the timeout expires.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

function sanitizeLlamaServerInstallRequest(value: unknown) {
  const source = typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const flavor = ["auto", "vulkan", "cpu", "cuda"].includes(String(source.flavor)) ? (source.flavor as "auto" | "vulkan" | "cpu" | "cuda") : "auto";
  const release = typeof source.release === "string" && /^b[0-9]+$/.test(source.release) ? source.release : undefined;
  return {
    flavor,
    force: source.force === true,
    release
  };
}

async function loadStandardRouteModel(context: RuntimeContext) {
  if (context.engine.isLoaded()) return;
  const decision = standardRouteDecision(context, await context.modelIndex.models());
  if (!decision.selected) return;
  try {
    await safeLoadEngineModel(context, {
      modelPath: decision.selected.path,
      displayName: decision.selected.name
    });
  } catch (err) {
    console.error("Failed to load standard route model:", err);
  }
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
    if (body.path.startsWith("virtual:")) {
      return { path: body.path, displayName: body.path.split(":").pop() || "virtual" };
    }
    if (!fs.existsSync(body.path)) throw new Error(`Model file not found: ${body.path}`);
    const isGguf = body.path.toLowerCase().endsWith(".gguf");
    const isOllamaBlob = body.path.toLowerCase().includes("blobs") || path.basename(body.path).startsWith("sha256-");
    if (!isGguf && !isOllamaBlob) {
      throw new Error("Only .gguf files or Ollama blobs can be loaded by HT Studio Engine.");
    }
    return { path: body.path, displayName: path.basename(body.path) };
  }
  throw new Error("Provide an artifactId or a path to load.");
}

interface TextGenerationTarget {
  modelName: string;
  kind: "hot" | "engine";
}

async function textGenerationTarget(context: RuntimeContext, requestedModel?: string): Promise<TextGenerationTarget> {
  const hotModel = await hotPoolTarget(context, requestedModel);
  if (hotModel) return { modelName: hotModel, kind: "hot" };

  if (requestedModel && context.engine.loadedModel !== requestedModel) {
    const target = resolveLocalModelByName(context, requestedModel);
    if (target) {
      try {
        await safeLoadEngineModel(context, { modelPath: target.path, displayName: target.displayName });
      } catch (err) {
        throw httpError(422, (err as Error).message);
      }
    } else if (!canUseLoadedModelAlias(context, requestedModel)) {
      throw httpError(404, `Model not found locally: ${requestedModel}`);
    }
  }

  if (!context.engine.isLoaded() && !requestedModel) {
    await loadStandardRouteModel(context);
  }
  if (!context.engine.isLoaded()) {
    throw httpError(400, "No model is loaded. Load a model first or pass the name of a locally available model.");
  }
  return { modelName: context.engine.loadedModel || requestedModel || "ht-engine", kind: "engine" };
}

function runTextGeneration(
  context: RuntimeContext,
  target: TextGenerationTarget,
  label: string,
  messages: ChatMessage[],
  options: {
    maxTokens?: number;
    temperature?: number;
    onToken?: (token: string) => void;
    onUsage?: (usage: { promptTokens: number; completionTokens: number }) => void;
    signal?: AbortSignal;
  }
) {
  return context.queue.run(
    label,
    (queueSignal) => {
      const signal = options.signal ? combineAbortSignals(queueSignal, options.signal) : queueSignal;
      const engineOptions = {
        maxTokens: options.maxTokens,
        temperature: options.temperature,
        onToken: options.onToken,
        onUsage: options.onUsage,
        signal
      };
      return target.kind === "hot"
        ? context.hotPool.chat(target.modelName, messages, engineOptions)
        : context.engine.chat(messages, engineOptions);
    },
    options.signal ? { signal: options.signal } : undefined
  );
}

async function ollamaGenerate(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  context: RuntimeContext,
  body: {
    model?: string;
    prompt: string;
    messages: ChatMessage[];
    stream?: boolean;
    maxTokens?: number;
    temperature?: number;
    proxyBody: Record<string, unknown>;
  }
) {
  const delegated = await delegatedBackend(context, { model: body.model });
  if (delegated && "status" in delegated) return json(response, { error: delegated.message }, delegated.status);
  if (delegated) return delegatedOllamaGenerate(request, response, delegated.endpoint, body);

  if (body.model && !resolveLocalModelByName(context, body.model) && !canUseLoadedModelAlias(context, body.model)) {
    return proxyOllamaGenerate(request, response, context, body.proxyBody);
  }

  const target = await textGenerationTarget(context, body.model);
  if (context.engine.loadedPath?.startsWith("virtual:ollama:")) {
    const fallbackName = context.engine.loadedPath.slice("virtual:ollama:".length);
    return delegatedOllamaGenerate(request, response, context.config.ollamaHost, {
      ...body,
      model: fallbackName
    });
  }
  const stream = body.stream !== false;
  if (!stream) {
    const content = await runTextGeneration(context, target, `generate:${target.modelName}`, body.messages, {
      maxTokens: body.maxTokens,
      temperature: body.temperature
    });
    return json(response, ollamaGenerateDone(target.modelName, content));
  }

  response.writeHead(200, { "content-type": "application/x-ndjson", "cache-control": "no-cache" });
  const controller = new AbortController();
  request.on("close", () => controller.abort());
  try {
    await runTextGeneration(context, target, `generate-stream:${target.modelName}`, body.messages, {
      maxTokens: body.maxTokens,
      temperature: body.temperature,
      signal: controller.signal,
      onToken: (token) => response.write(`${JSON.stringify(ollamaGenerateChunk(target.modelName, token))}\n`)
    });
    response.write(`${JSON.stringify(ollamaGenerateDone(target.modelName))}\n`);
  } catch (error) {
    response.write(`${JSON.stringify({ model: target.modelName, error: (error as Error).message, done: true })}\n`);
  }
  response.end();
}

async function engineChat(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  context: RuntimeContext,
  body: { messages?: ChatMessage[]; model?: string; stream?: boolean; artifactId?: string; path?: string; systemPrompt?: string; gpuLayers?: number; contextSize?: number; threads?: number; maxTokens?: number; temperature?: number }
) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const delegated = await delegatedBackend(context, { model: body.model });
  if (delegated && "status" in delegated) return json(response, { error: delegated.message }, delegated.status);
  if (delegated) return delegatedOllamaChat(request, response, delegated.endpoint, body);

  const hotModel = await hotPoolTarget(context, body.model);
  if (hotModel) return hotPoolChat(request, response, context, hotModel, messages, body);

  let useFallbackToOllama = false;

  if (body.model && context.engine.loadedModel !== body.model) {
    const target = resolveLocalModelByName(context, body.model);
    if (target) {
      try {
        await safeLoadEngineModel(context, {
          modelPath: target.path,
          displayName: target.displayName,
          systemPrompt: body.systemPrompt,
          gpuLayers: body.gpuLayers,
          contextSize: body.contextSize,
          threads: body.threads
        });
        if (context.engine.loadedPath?.startsWith("virtual:ollama:")) {
          useFallbackToOllama = true;
          body.model = context.engine.loadedPath.slice("virtual:ollama:".length);
        }
      } catch (err) {
        return json(response, { error: (err as Error).message }, 422);
      }
    } else if (!canUseLoadedModelAlias(context, body.model)) {
      return json(response, { error: `Model not found locally: ${body.model}` }, 404);
    }
  }

  if (!useFallbackToOllama && !context.engine.isLoaded() && (body.artifactId || body.path)) {
    const target = resolveEngineModelPath(context, body);
    try {
      await safeLoadEngineModel(context, {
        modelPath: target.path,
        displayName: target.displayName,
        systemPrompt: body.systemPrompt,
        gpuLayers: body.gpuLayers,
        contextSize: body.contextSize,
        threads: body.threads
      });
      if (context.engine.loadedPath?.startsWith("virtual:ollama:")) {
        useFallbackToOllama = true;
        body.model = context.engine.loadedPath.slice("virtual:ollama:".length);
      }
    } catch (err) {
      return json(response, { error: (err as Error).message }, 422);
    }
  }

  if (!useFallbackToOllama && !context.engine.isLoaded() && !body.model && !body.artifactId && !body.path) {
    await loadStandardRouteModel(context);
  }

  if (context.engine.loadedPath?.startsWith("virtual:ollama:")) {
    useFallbackToOllama = true;
    body.model = context.engine.loadedPath.slice("virtual:ollama:".length);
  }

  if (useFallbackToOllama) {
    const controller = new AbortController();
    request.on("close", () => controller.abort());
    try {
      const upstream = await context.ollama.chat(body, { signal: controller.signal });
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
    } catch (err) {
      // Request aborted or connection failed, release silently
    } finally {
      response.end();
    }
    return;
  }

  if (!context.engine.isLoaded() && !body.model && !body.artifactId && !body.path) {
    await loadStandardRouteModel(context);
  }

  if (!context.engine.isLoaded()) {
    return json(response, { error: "No model is loaded in HT Studio Engine. Load one first or pass an artifactId/path/model name." }, 400);
  }

  const modelName = body.model || context.engine.loadedModel || "llamacpp";
  const stream = body.stream !== false;

  if (!stream) {
    const content = await context.queue.run(`chat:${modelName}`, (signal) =>
      context.engine.chat(messages, { maxTokens: body.maxTokens, temperature: body.temperature, signal })
    );
    return json(response, { model: modelName, message: { role: "assistant", content }, done: true });
  }

  response.writeHead(200, { "content-type": "application/x-ndjson", "cache-control": "no-cache" });
  const controller = new AbortController();
  request.on("close", () => controller.abort());
  try {
    await context.queue.run(
      `stream:${modelName}`,
      (queueSignal) =>
        context.engine.chat(messages, {
          signal: combineAbortSignals(queueSignal, controller.signal),
          maxTokens: body.maxTokens,
          temperature: body.temperature,
          onToken: (token) => response.write(`${JSON.stringify(ollamaChunk(modelName, token))}\n`)
        }),
      { signal: controller.signal }
    );
    response.write(`${JSON.stringify(ollamaDone(modelName))}\n`);
  } catch (error) {
    response.write(`${JSON.stringify({ model: modelName, error: (error as Error).message, done: true })}\n`);
  }
  response.end();
}

async function hotPoolTarget(context: RuntimeContext, requestedModel?: string) {
  const config = context.store.getRuntimeConfig();
  if (!context.hotPool || !config.hotPool?.enabled) return undefined;
  let modelName = requestedModel;
  if (!modelName) {
    const decision = standardRouteDecision(context, await context.modelIndex.models());
    modelName = decision.selected?.name;
  }
  if (!modelName) return undefined;
  if (!context.hotPool.has(modelName) && config.hotPool.autoWarm) {
    await warmHotPool(context);
  }
  return context.hotPool.has(modelName) ? modelName : undefined;
}

async function hotPoolChat(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  context: RuntimeContext,
  modelName: string,
  messages: ChatMessage[],
  body: { stream?: boolean; maxTokens?: number; temperature?: number }
) {
  const stream = body.stream !== false;
  if (!stream) {
    const content = await context.queue.run(`hot:${modelName}`, (signal) =>
      context.hotPool.chat(modelName, messages, { maxTokens: body.maxTokens, temperature: body.temperature, signal })
    );
    return json(response, { model: modelName, message: { role: "assistant", content }, done: true });
  }

  response.writeHead(200, { "content-type": "application/x-ndjson", "cache-control": "no-cache" });
  const controller = new AbortController();
  request.on("close", () => controller.abort());
  try {
    await context.queue.run(
      `hot-stream:${modelName}`,
      (queueSignal) =>
        context.hotPool.chat(modelName, messages, {
          signal: combineAbortSignals(queueSignal, controller.signal),
          maxTokens: body.maxTokens,
          temperature: body.temperature,
          onToken: (token) => response.write(`${JSON.stringify(ollamaChunk(modelName, token))}\n`)
        }),
      { signal: controller.signal }
    );
    response.write(`${JSON.stringify(ollamaDone(modelName))}\n`);
  } catch (error) {
    response.write(`${JSON.stringify({ model: modelName, error: (error as Error).message, done: true })}\n`);
  }
  response.end();
}

async function delegatedOllamaChat(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  endpoint: string,
  body: { messages?: ChatMessage[]; model?: string; stream?: boolean; maxTokens?: number; temperature?: number }
) {
  const stream = body.stream !== false;
  const modelName = body.model || "local";
  const upstream = await delegatedPostJson(request, `${endpoint}/v1/chat/completions`, {
      model: modelName,
      messages: body.messages || [],
      stream,
      max_tokens: body.maxTokens,
      temperature: body.temperature
  });

  if (!stream) {
    const payload = await safeJson(upstream);
    if (!upstream.ok) return json(response, payload, upstream.status);
    const content = extractOpenAiContent(payload);
    return json(response, { model: modelName, message: { role: "assistant", content }, done: true }, upstream.status);
  }

  response.writeHead(upstream.status, { "content-type": "application/x-ndjson", "cache-control": "no-cache" });
  if (!upstream.ok || !upstream.body) {
    response.write(`${JSON.stringify({ model: modelName, error: await upstream.text(), done: true })}\n`);
    response.end();
    return;
  }
  await pipeOpenAiSseAsOllamaNdjson(upstream, response, modelName);
}

async function delegatedOllamaGenerate(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  endpoint: string,
  body: { messages: ChatMessage[]; model?: string; stream?: boolean; maxTokens?: number; temperature?: number }
) {
  const stream = body.stream !== false;
  const modelName = body.model || "local";
  const upstream = await delegatedPostJson(request, `${endpoint}/v1/chat/completions`, {
    model: modelName,
    messages: body.messages,
    stream,
    max_tokens: body.maxTokens,
    temperature: body.temperature
  });

  if (!stream) {
    const payload = await safeJson(upstream);
    if (!upstream.ok) return json(response, payload, upstream.status);
    return json(response, ollamaGenerateDone(modelName, extractOpenAiContent(payload)), upstream.status);
  }

  response.writeHead(upstream.status, { "content-type": "application/x-ndjson", "cache-control": "no-cache" });
  if (!upstream.ok || !upstream.body) {
    response.write(`${JSON.stringify({ model: modelName, error: await upstream.text(), done: true })}\n`);
    response.end();
    return;
  }
  await pipeOpenAiSseAsOllamaGenerateNdjson(upstream, response, modelName);
}

async function proxyOllamaGenerate(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  context: RuntimeContext,
  body: Record<string, unknown>
) {
  let upstream: Response;
  try {
    upstream = await context.ollama.generate(body, { signal: abortSignalForRequest(request) });
  } catch (error) {
    return json(response, { error: `Model is not local and Ollama generate is unavailable: ${(error as Error).message}` }, 503);
  }
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
}

async function delegatedOpenAiChat(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  endpoint: string,
  input: { model?: string; messages: ChatMessage[]; stream: boolean; maxTokens?: number; temperature?: number }
) {
  const upstream = await delegatedPostJson(request, `${endpoint}/v1/chat/completions`, {
      model: input.model || "local",
      messages: input.messages,
      stream: input.stream,
      max_tokens: input.maxTokens,
      temperature: input.temperature
  });
  response.writeHead(upstream.status, {
    "content-type": upstream.headers.get("content-type") || (input.stream ? "text/event-stream" : "application/json"),
    "cache-control": upstream.headers.get("cache-control") || "no-cache"
  });
  if (!upstream.body) {
    response.end();
    return;
  }
  await pipeResponseBodyWithLimit(upstream, response);
  response.end();
}

async function openAiLegacyCompletions(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  context: RuntimeContext,
  body: Record<string, unknown>
) {
  const parsed = sanitizeOpenAiCompletionRequest(body);
  const messages: ChatMessage[] = [{ role: "user", content: parsed.prompt }];
  const delegated = await delegatedBackend(context, { model: parsed.model });
  if (delegated && "status" in delegated) {
    return json(response, { error: { message: delegated.message, type: "service_unavailable" } }, delegated.status);
  }
  if (delegated) {
    const upstream = await delegatedPostJson(request, `${delegated.endpoint}/v1/chat/completions`, {
      model: parsed.model || "local",
      messages,
      stream: parsed.stream,
      max_tokens: parsed.maxTokens,
      temperature: parsed.temperature
    });
    if (!parsed.stream) {
      const payload = await safeJson(upstream);
      if (!upstream.ok) return json(response, payload, upstream.status);
      return json(response, openAiTextCompletion(parsed.model || "local", extractOpenAiContent(payload)), upstream.status);
    }
    response.writeHead(upstream.status, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    if (!upstream.ok || !upstream.body) {
      response.write(`data: ${JSON.stringify({ error: { message: await upstream.text() } })}\n\n`);
      response.end();
      return;
    }
    const id = `cmpl-${cryptoRandomId()}`;
    await pipeOpenAiSseAsTextCompletion(upstream, response, parsed.model || "local", id);
    return;
  }

  const target = await textGenerationTarget(context, parsed.model);
  if (context.engine.loadedPath?.startsWith("virtual:ollama:")) {
    const fallbackName = context.engine.loadedPath.slice("virtual:ollama:".length);
    const upstream = await delegatedPostJson(request, `${context.config.ollamaHost}/v1/chat/completions`, {
      model: fallbackName,
      messages,
      stream: parsed.stream,
      max_tokens: parsed.maxTokens,
      temperature: parsed.temperature
    });
    if (!parsed.stream) {
      const payload = await safeJson(upstream);
      if (!upstream.ok) return json(response, payload, upstream.status);
      return json(response, openAiTextCompletion(fallbackName, extractOpenAiContent(payload)), upstream.status);
    }
    response.writeHead(upstream.status, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    if (!upstream.ok || !upstream.body) {
      response.write(`data: ${JSON.stringify({ error: { message: await upstream.text() } })}\n\n`);
      response.end();
      return;
    }
    const id = `cmpl-${cryptoRandomId()}`;
    await pipeOpenAiSseAsTextCompletion(upstream, response, fallbackName, id);
    return;
  }
  if (!parsed.stream) {
    let usage: OpenAiUsage | undefined;
    const content = await runTextGeneration(context, target, `completion:${target.modelName}`, messages, {
      maxTokens: parsed.maxTokens,
      temperature: parsed.temperature,
      onUsage: (u) => {
        usage = openAiUsage(u.promptTokens, u.completionTokens);
      }
    });
    return json(response, openAiTextCompletion(target.modelName, content, undefined, usage));
  }

  response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
  const id = `cmpl-${cryptoRandomId()}`;
  const controller = new AbortController();
  request.on("close", () => controller.abort());
  let streamUsage: OpenAiUsage | undefined;
  try {
    await runTextGeneration(context, target, `completion-stream:${target.modelName}`, messages, {
      maxTokens: parsed.maxTokens,
      temperature: parsed.temperature,
      signal: controller.signal,
      onToken: (token) => response.write(`data: ${JSON.stringify(openAiTextChunk(target.modelName, id, token))}\n\n`),
      onUsage: (u) => {
        streamUsage = openAiUsage(u.promptTokens, u.completionTokens);
      }
    });
    response.write(`data: ${JSON.stringify(openAiTextFinalChunk(target.modelName, id, streamUsage))}\n\n`);
    response.write("data: [DONE]\n\n");
  } catch (error) {
    response.write(`data: ${JSON.stringify({ error: { message: (error as Error).message } })}\n\n`);
  }
  response.end();
}

async function delegatedResponses(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  endpoint: string,
  parsed: LocalResponsesRequest,
  messages: ChatMessage[],
  body: Record<string, unknown>
) {
  const modelName = parsed.model || "local";
  const maxTokens = optionalClampedInt(body.max_output_tokens, "max_output_tokens", 1, MAX_TOKENS) || 1024;
  const temperature = optionalClampedFloat(body.temperature, "temperature", 0, 2) ?? 0.7;
  const stream = body.stream === true;
  const id = `resp_${cryptoRandomId()}`;
  if (!stream) {
    const upstream = await delegatedPostJson(request, `${endpoint}/v1/chat/completions`, {
      model: modelName,
      messages,
      stream: false,
      max_tokens: maxTokens,
      temperature
    });
    const payload = await safeJson(upstream);
    if (!upstream.ok) return json(response, payload, upstream.status);
    const content = extractOpenAiContent(payload);
    return json(
      response,
      responseObject({
        id,
        model: modelName,
        text: content,
        inputTokens: estimateResponseTokens(messages.map((message) => message.content).join("\n")),
        outputTokens: estimateResponseTokens(content)
      })
    );
  }

  response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
  writeResponseEvent(response, "response.created", { id, object: "response", model: modelName, status: "in_progress" });
  const upstream = await delegatedPostJson(request, `${endpoint}/v1/chat/completions`, {
    model: modelName,
    messages,
    stream: true,
    max_tokens: maxTokens,
    temperature
  });
  if (!upstream.ok || !upstream.body) {
    writeResponseEvent(response, "error", { error: { message: await upstream.text() } });
    response.end();
    return;
  }
  let content = "";
  await readOpenAiSse(upstream, (payload) => {
    const token = extractOpenAiDelta(payload);
    if (!token) return;
    content += token;
    writeResponseEvent(response, "response.output_text.delta", { response_id: id, delta: token });
  });
  for (const event of streamEvents({ id, model: modelName, text: content }).slice(2)) {
    writeResponseEvent(response, event.event, event.data);
  }
  response.write("data: [DONE]\n\n");
  response.end();
}

async function proxyJsonRequest(request: http.IncomingMessage, response: http.ServerResponse, url: string, body: unknown) {
  const upstream = await delegatedPostJson(request, url, body);
  const text = await responseTextWithLimit(upstream, DELEGATED_JSON_RESPONSE_LIMIT);
  response.writeHead(upstream.status, { "content-type": upstream.headers.get("content-type") || "application/json" });
  response.end(text);
}

const DELEGATED_REQUEST_TIMEOUT_MS = 120_000;
const DELEGATED_JSON_RESPONSE_LIMIT = 1024 * 1024;
const DELEGATED_STREAM_RESPONSE_LIMIT = 16 * 1024 * 1024;

async function delegatedPostJson(request: http.IncomingMessage, url: string, body: unknown): Promise<Response> {
  return fetchWithTimeout(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: abortSignalForRequest(request),
    timeoutMs: DELEGATED_REQUEST_TIMEOUT_MS
  });
}

function abortSignalForRequest(request: http.IncomingMessage) {
  const controller = new AbortController();
  request.on("close", () => controller.abort());
  return controller.signal;
}

async function pipeOpenAiSseAsOllamaNdjson(upstream: Response, response: http.ServerResponse, modelName: string) {
  await readOpenAiSse(upstream, (payload) => {
    const token = extractOpenAiDelta(payload);
    if (token) response.write(`${JSON.stringify(ollamaChunk(modelName, token))}\n`);
  });
  response.write(`${JSON.stringify(ollamaDone(modelName))}\n`);
  response.end();
}

async function pipeOpenAiSseAsOllamaGenerateNdjson(upstream: Response, response: http.ServerResponse, modelName: string) {
  await readOpenAiSse(upstream, (payload) => {
    const token = extractOpenAiDelta(payload);
    if (token) response.write(`${JSON.stringify(ollamaGenerateChunk(modelName, token))}\n`);
  });
  response.write(`${JSON.stringify(ollamaGenerateDone(modelName))}\n`);
  response.end();
}

async function pipeOpenAiSseAsTextCompletion(upstream: Response, response: http.ServerResponse, modelName: string, id: string) {
  await readOpenAiSse(upstream, (payload) => {
    const token = extractOpenAiDelta(payload);
    if (token) response.write(`data: ${JSON.stringify(openAiTextChunk(modelName, id, token))}\n\n`);
  });
  response.write(`data: ${JSON.stringify(openAiTextFinalChunk(modelName, id))}\n\n`);
  response.write("data: [DONE]\n\n");
  response.end();
}

async function readOpenAiSse(upstream: Response, onPayload: (payload: unknown) => void) {
  if (!upstream.body) return;
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > DELEGATED_STREAM_RESPONSE_LIMIT) {
      await reader.cancel().catch(() => undefined);
      throw new Error(`Delegated llama-server stream exceeded ${DELEGATED_STREAM_RESPONSE_LIMIT} bytes.`);
    }
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) {
      for (const line of event.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          onPayload(JSON.parse(data));
        } catch {
          // Ignore malformed upstream chunks.
        }
      }
    }
  }
}

async function safeJson(response: Response): Promise<unknown> {
  const text = await responseTextWithLimit(response, DELEGATED_JSON_RESPONSE_LIMIT);
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: { message: text || `Upstream returned ${response.status}` } };
  }
}

async function pipeResponseBodyWithLimit(upstream: Response, response: http.ServerResponse) {
  const reader = upstream.body?.getReader();
  if (!reader) return;
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > DELEGATED_STREAM_RESPONSE_LIMIT) {
      await reader.cancel().catch(() => undefined);
      throw new Error(`Delegated llama-server response exceeded ${DELEGATED_STREAM_RESPONSE_LIMIT} bytes.`);
    }
    response.write(Buffer.from(value));
  }
}

function extractOpenAiContent(payload: unknown): string {
  const choice = (payload as { choices?: Array<{ message?: { content?: string }; text?: string }> }).choices?.[0];
  return choice?.message?.content ?? choice?.text ?? "";
}

function extractOpenAiDelta(payload: unknown): string {
  const choice = (payload as { choices?: Array<{ delta?: { content?: string }; message?: { content?: string }; text?: string }> }).choices?.[0];
  return choice?.delta?.content ?? choice?.message?.content ?? choice?.text ?? "";
}

async function localGgufModels(context: RuntimeContext) {
  return context.modelIndex.models();
}

function localGgufSnapshot(context: RuntimeContext) {
  return context.modelIndex.snapshot().models;
}

async function mergeActiveRuntimeModels(context: RuntimeContext, discoveredModels: any[]): Promise<any[]> {
  const merged = [...discoveredModels];

  // 1. Ollama online models
  try {
    const ollamaStatus = await context.ollama.status();
    if (ollamaStatus.online && Array.isArray(ollamaStatus.models)) {
      for (const oModel of ollamaStatus.models) {
        const alreadyExists = merged.some(
          (m) =>
            m.name.toLowerCase() === oModel.name.toLowerCase() ||
            m.path.toLowerCase() === oModel.name.toLowerCase() ||
            (m.source === "Ollama" && m.name.toLowerCase() === oModel.name.replace(/:latest$/, "").toLowerCase())
        );
        if (!alreadyExists) {
          merged.push({
            id: `ollama:${oModel.name}`,
            name: oModel.name,
            path: `ollama:${oModel.name}`,
            sizeBytes: oModel.sizeBytes || 0,
            source: "Ollama",
            dir: "ollama-runtime",
            runnable: true,
            indexedAt: new Date().toISOString(),
            trustLevel: "installed-runtime",
            autoWarmEligible: true,
            trustReason: "Active online model served by Ollama."
          });
        }
      }
    }
  } catch (error) {
    // Ignore and proceed
  }

  // 2. LM Studio online models
  try {
    const lmStatus = await context.lmstudio.status();
    if (lmStatus.online && Array.isArray(lmStatus.models)) {
      for (const lModel of lmStatus.models) {
        const alreadyExists = merged.some(
          (m) =>
            (m.path && lModel.path && m.path.toLowerCase() === lModel.path.toLowerCase()) ||
            m.name.toLowerCase() === lModel.name.toLowerCase()
        );
        if (!alreadyExists) {
          merged.push({
            id: lModel.path || `lmstudio:${lModel.name}`,
            name: lModel.name,
            path: lModel.path || `lmstudio:${lModel.name}`,
            sizeBytes: lModel.sizeBytes || 0,
            source: "LM Studio",
            dir: "lmstudio-runtime",
            runnable: true,
            indexedAt: new Date().toISOString(),
            trustLevel: "installed-runtime",
            autoWarmEligible: false,
            trustReason: "Model discovered from LM Studio library."
          });
        }
      }
    }
  } catch (error) {
    // Ignore and proceed
  }

  return merged;
}

function withLoadedState(context: RuntimeContext, models: Array<{ name: string; path: string }>) {
  const loadedPath = context.engine.loadedPath;
  if (!loadedPath) {
    return models.map((m) => ({ ...m, loaded: false }));
  }

  const isVirtualOllama = loadedPath.startsWith("virtual:ollama:");
  const fallbackModelName = isVirtualOllama ? loadedPath.slice("virtual:ollama:".length).toLowerCase() : "";

  return models.map((model) => {
    let isLoaded = false;
    try {
      isLoaded = path.resolve(model.path).toLowerCase() === path.resolve(loadedPath).toLowerCase();
    } catch {
      isLoaded = model.path.toLowerCase() === loadedPath.toLowerCase();
    }

    if (!isLoaded && isVirtualOllama) {
      const normalizedModelName = model.name.toLowerCase();
      isLoaded = 
        fallbackModelName === normalizedModelName || 
        fallbackModelName === `ht-${normalizedModelName}` ||
        fallbackModelName === `ht-${normalizedModelName.replace(/[^a-z0-9.-]/g, "-")}`;
    }

    return {
      ...model,
      loaded: isLoaded
    };
  });
}

/** Arch-aware preflight: would the built-in engine's current release run this GGUF? */
async function engineArchSupport(context: RuntimeContext, modelPath: string) {
  return checkArchSupport(await context.engine.readArchitecture(modelPath), readBundledLlamaRelease());
}

async function safeLoadEngineModel(
  context: RuntimeContext,
  options: {
    modelPath: string;
    displayName?: string;
    systemPrompt?: string;
    gpuLayers?: number;
    contextSize?: number;
    threads?: number;
    draftModelPath?: string;
  }
): Promise<{ loaded: string; gpu: string | false }> {
  if (options.modelPath.startsWith("ollama:")) {
    const ollamaModelName = options.modelPath.slice("ollama:".length);
    return await context.engine.load({
      modelPath: `virtual:ollama:${ollamaModelName}`,
      displayName: options.displayName || ollamaModelName,
      systemPrompt: options.systemPrompt,
      gpuLayers: options.gpuLayers,
      contextSize: options.contextSize,
      threads: options.threads
    });
  }

  if (!options.modelPath.startsWith("virtual:")) {
    const support = await engineArchSupport(context, options.modelPath);
    if (!support.supported) {
      const ollamaStatus = await context.ollama.status();
      if (ollamaStatus.online) {
        const displayName = options.displayName || path.basename(options.modelPath);
        const fallbackName = `ht-${displayName.toLowerCase().replace(/[^a-z0-9.-]/g, "-")}`;
        const ollamaPath = options.modelPath.replace(/\\/g, "/");
        const modelfileContent = `FROM "${ollamaPath}"`;
        await context.ollama.createModel(fallbackName, modelfileContent);
        
        return await context.engine.load({
          modelPath: `virtual:ollama:${fallbackName}`,
          displayName: displayName,
          systemPrompt: options.systemPrompt,
          gpuLayers: options.gpuLayers,
          contextSize: options.contextSize,
          threads: options.threads
        });
      } else {
        throw new Error(support.reason || `Model architecture is not supported: ${support.architecture}`);
      }
    }
  }

  return await context.engine.load(options);
}

async function runEngineUpgrade(context: RuntimeContext) {
  const cwd = path.resolve(process.cwd());
  try {
    await runProcess(npmExecutable(), ["install", "node-llama-cpp@latest", "-w", "@ht-llm-marketplace/daemon"], cwd);
    const npxCmd = os.platform() === "win32" ? "npx.cmd" : "npx";
    await runProcess(npxCmd, ["node-llama-cpp", "source", "download", "--release", "b8637", "--gpu", "auto"], cwd);
    context.store.audit("engine-upgrade-completed", "node-llama-cpp", { status: "completed" });
  } catch (error) {
    context.store.audit("engine-upgrade-failed", "node-llama-cpp", { error: (error as Error).message });
  }
}

function runProcess(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "ignore",
      windowsHide: true,
      shell: process.platform === "win32"
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
      }
    });
  });
}

function npmExecutable() {
  return os.platform() === "win32" ? "npm.cmd" : "npm";
}

function resolveLocalModelByName(context: RuntimeContext, name?: string): { path: string; displayName: string } | undefined {
  if (!name) return undefined;
  if (name.toLowerCase() === "ternary-ssm-specialist" || name === "virtual:ternary-ssm-specialist") {
    return { path: "virtual:ternary-ssm-specialist", displayName: "Ternary-SSM-Specialist" };
  }
  const owned = context.store
    .listArtifacts()
    .find(
      (artifact) =>
        artifact.owned &&
        !!artifact.path &&
        artifact.path.toLowerCase().endsWith(".gguf") &&
        (artifact.name === name || artifact.displayName === name)
    );
  if (owned?.path) return { path: owned.path, displayName: owned.displayName || owned.name };
  const found = localGgufSnapshot(context).find((model) => model.name === name);
  if (found) return { path: found.path, displayName: found.name };
  return undefined;
}

function canUseLoadedModelAlias(context: RuntimeContext, requestedModel?: string) {
  if (!requestedModel) return true;
  const loaded = context.engine.loadedModel;
  if (!loaded) return false;
  const normalized = requestedModel.trim().toLowerCase();
  return normalized === loaded.toLowerCase() || normalized === "local" || normalized === "ht-engine" || normalized === "llamacpp";
}

/** OpenAI-compatible chat handler (`POST /v1/chat/completions`). */
async function openAiChat(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  context: RuntimeContext,
  body: unknown
) {
  let parsed;
  try {
    parsed = parseOpenAiChatRequest(body);
  } catch (error) {
    return json(response, { error: { message: (error as Error).message, type: "invalid_request_error" } }, 400);
  }

  parsed.messages = applyBilingualSystemPromptGuard(parsed.messages);

  const delegated = await delegatedBackend(context, { model: parsed.model });
  if (delegated && "status" in delegated) {
    return json(response, { error: { message: delegated.message, type: "service_unavailable" } }, delegated.status);
  }
  if (delegated) {
    return delegatedOpenAiChat(request, response, delegated.endpoint, {
      model: parsed.model,
      messages: parsed.messages,
      stream: parsed.stream,
      maxTokens: parsed.maxTokens,
      temperature: parsed.temperature
    });
  }

  let useFallbackToOllama = false;

  // If a specific model was named and isn't the loaded one, load it from local storage.
  if (parsed.model && context.engine.loadedModel !== parsed.model) {
    const target = resolveLocalModelByName(context, parsed.model);
    if (target) {
      try {
        await safeLoadEngineModel(context, { modelPath: target.path, displayName: target.displayName });
        if (context.engine.loadedPath?.startsWith("virtual:ollama:")) {
          useFallbackToOllama = true;
          parsed.model = context.engine.loadedPath.slice("virtual:ollama:".length);
        }
      } catch (error) {
        return json(response, { error: { message: `Failed to load model '${parsed.model}': ${(error as Error).message}` } }, 500);
      }
    } else if (!canUseLoadedModelAlias(context, parsed.model)) {
      return json(response, { error: { message: `Model not found locally: ${parsed.model}`, type: "model_not_found" } }, 404);
    }
  }
  if (!useFallbackToOllama && !context.engine.isLoaded() && !parsed.model) {
    await loadStandardRouteModel(context);
  }

  if (context.engine.loadedPath?.startsWith("virtual:ollama:")) {
    useFallbackToOllama = true;
    parsed.model = context.engine.loadedPath.slice("virtual:ollama:".length);
  }

  if (useFallbackToOllama) {
    return delegatedOpenAiChat(request, response, context.config.ollamaHost, {
      model: parsed.model,
      messages: parsed.messages,
      stream: parsed.stream,
      maxTokens: parsed.maxTokens,
      temperature: parsed.temperature
    });
  }

  if (!context.engine.isLoaded()) {
    return json(
      response,
      {
        error: {
          message: "No model is loaded. Load a model first (or pass the name of a locally available model).",
          type: "model_not_found"
        }
      },
      400
    );
  }

  const modelName = context.engine.loadedModel || parsed.model || "ht-engine";

  if (!parsed.stream) {
    try {
      let usage: OpenAiUsage | undefined;
      const content = await context.queue.run(`openai:${modelName}`, (signal) =>
        context.engine.chat(parsed.messages, {
          temperature: parsed.temperature,
          maxTokens: parsed.maxTokens,
          signal,
          onUsage: (u) => { usage = openAiUsage(u.promptTokens, u.completionTokens); }
        })
      );
      return json(response, openAiCompletion(modelName, content, undefined, usage));
    } catch (error) {
      return json(response, { error: { message: (error as Error).message } }, 500);
    }
  }

  response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
  const id = openAiCompletionId();
  const controller = new AbortController();
  request.on("close", () => controller.abort());
  let streamUsage: OpenAiUsage | undefined;
  try {
    await context.queue.run(
      `openai-stream:${modelName}`,
      (queueSignal) =>
        context.engine.chat(parsed.messages, {
          temperature: parsed.temperature,
          maxTokens: parsed.maxTokens,
          signal: combineAbortSignals(queueSignal, controller.signal),
          onToken: (token) => response.write(`data: ${JSON.stringify(openAiChunk(modelName, id, token))}\n\n`),
          onUsage: (u) => { streamUsage = openAiUsage(u.promptTokens, u.completionTokens); }
        }),
      { signal: controller.signal }
    );
    response.write(`data: ${JSON.stringify(openAiFinalChunk(modelName, id, streamUsage))}\n\n`);
    response.write("data: [DONE]\n\n");
  } catch (error) {
    response.write(`data: ${JSON.stringify({ error: { message: (error as Error).message } })}\n\n`);
  }
  response.end();
}

async function openAiResponses(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  context: RuntimeContext,
  body: Record<string, unknown>
) {
  let parsed: LocalResponsesRequest;
  let messages: ChatMessage[];
  try {
    parsed = body as unknown as LocalResponsesRequest;
    messages = inputToMessages(parsed);
  } catch (error) {
    return json(response, { error: { message: (error as Error).message, type: "invalid_request_error" } }, 400);
  }

  const delegated = await delegatedBackend(context, { model: parsed.model });
  if (delegated && "status" in delegated) {
    return json(response, { error: { message: delegated.message, type: "service_unavailable" } }, delegated.status);
  }
  if (delegated) {
    return delegatedResponses(request, response, delegated.endpoint, parsed, messages, body);
  }

  const model = optionalString(body.model, "model", 500);
  if (parsed.previous_response_id) {
    const previous = context.store.getResponse(parsed.previous_response_id);
    if (!previous) return json(response, { error: { message: "previous_response_id was not found", type: "not_found" } }, 404);
    const insertAt = messages[0]?.role === "system" ? 1 : 0;
    messages.splice(insertAt, 0, { role: "assistant", content: previous.output_text });
  }
  const stream = body.stream === true;
  if (model && context.engine.loadedModel !== model) {
    const target = resolveLocalModelByName(context, model);
    if (target) await context.engine.load({ modelPath: target.path, displayName: target.displayName });
    else if (!canUseLoadedModelAlias(context, model)) return json(response, { error: { message: `Model not found locally: ${model}`, type: "model_not_found" } }, 404);
  }
  if (!context.engine.isLoaded() && !model) {
    await loadStandardRouteModel(context);
  }
  if (!context.engine.isLoaded()) {
    return json(response, { error: { message: "No model is loaded.", type: "model_not_found" } }, 400);
  }
  const modelName = context.engine.loadedModel || model || "ht-engine";
  const id = `resp_${cryptoRandomId()}`;
  const maxTokens = optionalClampedInt(body.max_output_tokens, "max_output_tokens", 1, MAX_TOKENS) || 1024;
  const temperature = optionalClampedFloat(body.temperature, "temperature", 0, 2) ?? 0.7;
  if (!stream) {
    const content = await context.queue.run(`responses:${modelName}`, (signal) =>
      context.engine.chat(messages, { signal, maxTokens, temperature })
    );
    const output = responseObject({
      id,
      model: modelName,
      text: content,
      inputTokens: estimateResponseTokens(messages.map((message) => message.content).join("\n")),
      outputTokens: estimateResponseTokens(content)
    });
    if (parsed.store !== false) context.store.addResponse({ id, model: modelName, request: parsed, response: output });
    return json(response, output);
  }

  response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
  const controller = new AbortController();
  let content = "";
  request.on("close", () => controller.abort());
  writeResponseEvent(response, "response.created", { id, object: "response", model: modelName, status: "in_progress" });
  try {
    await context.queue.run(
      `responses-stream:${modelName}`,
      (queueSignal) =>
        context.engine.chat(messages, {
          signal: combineAbortSignals(queueSignal, controller.signal),
          maxTokens,
          temperature,
          onToken: (token) => {
            content += token;
            writeResponseEvent(response, "response.output_text.delta", { response_id: id, delta: token });
          }
        }),
      { signal: controller.signal }
    );
    for (const event of streamEvents({ id, model: modelName, text: content }).slice(2)) {
      writeResponseEvent(response, event.event, event.data);
    }
    const output = responseObject({
      id,
      model: modelName,
      text: content,
      inputTokens: estimateResponseTokens(messages.map((message) => message.content).join("\n")),
      outputTokens: estimateResponseTokens(content)
    });
    if (parsed.store !== false) context.store.addResponse({ id, model: modelName, request: parsed, response: output });
    response.write("data: [DONE]\n\n");
  } catch (error) {
    writeResponseEvent(response, "error", { error: { message: (error as Error).message } });
  }
  response.end();
}

function writeResponseEvent(response: http.ServerResponse, event: string, data: unknown) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function runLocalBenchmark(context: RuntimeContext, input: { model?: string; prompt?: string }) {
  if (input.model && context.engine.loadedModel !== input.model) {
    const target = resolveLocalModelByName(context, input.model);
    if (target) {
      try {
        await safeLoadEngineModel(context, { modelPath: target.path, displayName: target.displayName });
      } catch (err) {
        throw httpError(422, (err as Error).message);
      }
    }
  }
  if (!context.engine.isLoaded()) {
    throw httpError(400, "Load a local model before running a benchmark.");
  }
  try {
    const isVirtualOllama = context.engine.loadedPath?.startsWith("virtual:ollama:");
    const fallbackName = isVirtualOllama ? context.engine.loadedPath!.slice("virtual:ollama:".length) : "";

    const benchmark = await context.queue.run(`benchmark:${context.engine.loadedModel || input.model || "loaded"}`, (signal) =>
      runBenchmark({
        model: context.engine.loadedModel || input.model,
        runtime: "llamacpp",
        prompt: input.prompt,
        chat: isVirtualOllama
          ? async (messages, options) => {
              const res = await context.ollama.chat({
                model: fallbackName,
                messages,
                stream: true
              }, { signal });
              if (!res.body) return "";
              const reader = res.body.getReader();
              const decoder = new TextDecoder();
              let fullText = "";
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value);
                const lines = chunk.split("\n").filter(Boolean);
                for (const line of lines) {
                  try {
                    const parsed = JSON.parse(line);
                    const content = parsed.message?.content || "";
                    if (content) {
                      options.onToken(content);
                      fullText += content;
                    }
                  } catch {
                    // Ignore parsing errors
                  }
                }
              }
              return fullText;
            }
          : (messages, options) =>
              context.engine.chat(messages, {
                signal,
                maxTokens: options.maxTokens,
                onToken: options.onToken
              })
      })
    );
    return context.store.addBenchmark(benchmark);
  } catch (error) {
    const failed = context.store.addBenchmark({
      id: cryptoRandomId(),
      model: context.engine.loadedModel || input.model || "loaded",
      runtime: "llamacpp",
      prompt: input.prompt || "hi",
      firstTokenMs: 0,
      totalMs: 0,
      tokensPerSecond: 0,
      tokenCount: 0,
      ok: false,
      error: (error as Error).message,
      createdAt: new Date().toISOString()
    });
    return failed;
  }
}

async function verifyArtifact(context: RuntimeContext, artifactId: string) {
  const artifact = context.store.getArtifact(artifactId);
  if (!artifact) throw httpError(404, `Artifact not found: ${artifactId}`);
  if (!artifact.path || !fs.existsSync(artifact.path)) {
    return context.store.setArtifactVerification({
      artifactId,
      status: "failed",
      message: "Artifact file is missing.",
      verifiedAt: new Date().toISOString()
    });
  }
  const actualBytes = fs.statSync(artifact.path).size;
  const sha256 = await sha256File(artifact.path);
  const expectedBytes = artifact.expectedBytes || artifact.sizeBytes;
  const status = expectedBytes !== undefined && expectedBytes !== actualBytes ? "failed" : "verified";
  return context.store.setArtifactVerification({
    artifactId,
    status,
    sha256,
    expectedBytes,
    actualBytes,
    verifiedAt: new Date().toISOString(),
    message: status === "verified" ? "Artifact bytes and hash were verified locally." : "Artifact byte count does not match expected size."
  });
}

async function revealArtifact(context: RuntimeContext, artifactId: string) {
  const artifact = context.store.getArtifact(artifactId);
  if (!artifact) throw httpError(404, `Artifact not found: ${artifactId}`);
  if (!artifact.path || !fs.existsSync(artifact.path)) throw httpError(400, "Artifact path is missing.");

  const stat = fs.statSync(artifact.path);
  const targetDir = stat.isDirectory() ? artifact.path : path.dirname(artifact.path);
  let command: string;
  let args: string[];

  if (process.platform === "win32") {
    command = "explorer.exe";
    args = stat.isDirectory() ? [artifact.path] : ["/select,", artifact.path];
  } else if (process.platform === "darwin") {
    command = "open";
    args = [targetDir];
  } else {
    command = "xdg-open";
    args = [targetDir];
  }

  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();
  context.store.audit("artifact-revealed", artifact.name, { artifactId, path: artifact.path, targetDir });
  return { ok: true, message: "Opened artifact location." };
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

const JSON_BODY_LIMIT_BYTES = 1024 * 1024;
const MAX_CONTEXT_SIZE = 131_072;
const MAX_THREADS = Math.max(1, Math.min(128, (os.cpus()?.length || 8) * 2));
const MAX_GPU_LAYERS = 999;
const MAX_TOKENS = 4096;
const MAX_MESSAGES = 64;
const MAX_MESSAGE_CHARS = 32_768;

function sanitizeDownloadRequest(body: unknown): StartDownloadRequest {
  const input = requireObject<Record<string, unknown>>(body);
  const source = requireString(input.source, "source", 40);
  if (source !== "ollama" && source !== "huggingface" && source !== "ollama-registry") {
    throw httpError(400, `Unsupported download source: ${source}`);
  }

  const request: StartDownloadRequest = { source };
  const runtime = optionalString(input.runtime, "runtime", 40);
  if (runtime) {
    if (!["ollama", "lmstudio", "llamacpp", "openai-compatible"].includes(runtime)) {
      throw httpError(400, `Unsupported runtime: ${runtime}`);
    }
    request.runtime = runtime as StartDownloadRequest["runtime"];
  }
  request.displayName = optionalString(input.displayName, "displayName", 300);

  if (source === "ollama") {
    request.model = requireString(input.model, "model", 500);
  }
  if (source === "ollama-registry") {
    request.ref = requireString(input.ref, "ref", 200);
  }
  if (source === "huggingface") {
    request.repoId = validateHuggingFaceRepoId(requireString(input.repoId, "repoId", 200));
    request.revision = validateHuggingFaceRevision(optionalString(input.revision, "revision", 200) || "main");
    request.license = optionalString(input.license, "license", 200);
    request.licenseAccepted = input.licenseAccepted === true;
    if (!request.licenseAccepted) {
      throw httpError(400, "Hugging Face downloads require licenseAccepted: true after reviewing the model card and license.");
    }
    const filenames = Array.isArray(input.filenames)
      ? input.filenames.map((item) => validateHuggingFacePath(requireString(item, "filename", 500)))
      : [validateHuggingFacePath(requireString(input.filename, "filename", 500))];
    if (filenames.length > 128) throw httpError(400, "Too many files requested.");
    request.filename = filenames[0];
    request.filenames = filenames;
    request.expectedBytes = optionalClampedInt(input.expectedBytes, "expectedBytes", 0, Number.MAX_SAFE_INTEGER);
    if (Array.isArray(input.expectedFiles)) {
      request.expectedFiles = input.expectedFiles.map((entry) => {
        const file = requireObject<Record<string, unknown>>(entry);
        return {
          path: validateHuggingFacePath(requireString(file.path, "expectedFiles.path", 500)),
          sizeBytes: optionalClampedInt(file.sizeBytes, "expectedFiles.sizeBytes", 0, Number.MAX_SAFE_INTEGER)
        };
      });
    }
  }
  return request;
}

function sanitizeRuntimeLoadRequest(body: unknown, runtime: string): RuntimeLoadRequest {
  const input = requireObject<Record<string, unknown>>(body);
  if (!["ollama", "lmstudio", "llamacpp", "openai-compatible"].includes(runtime)) {
    throw httpError(400, `Unsupported runtime: ${runtime}`);
  }
  return {
    runtime: runtime as RuntimeLoadRequest["runtime"],
    model: requireString(input.model, "model", 500),
    contextLength: optionalClampedInt(input.contextLength, "contextLength", 128, MAX_CONTEXT_SIZE),
    gpu: sanitizeGpuOption(input.gpu),
    ttlSeconds: optionalClampedInt(input.ttlSeconds, "ttlSeconds", 0, 86_400)
  };
}

function sanitizeEngineLoadRequest(body: unknown): {
  artifactId?: string;
  path?: string;
  systemPrompt?: string;
  gpuLayers?: number;
  contextSize?: number;
  threads?: number;
  draftModelPath?: string;
} {
  const input = requireObject<Record<string, unknown>>(body);
  return {
    artifactId: optionalString(input.artifactId, "artifactId", 200),
    path: optionalString(input.path, "path", 4096),
    systemPrompt: optionalString(input.systemPrompt, "systemPrompt", 32_000),
    gpuLayers: optionalClampedInt(input.gpuLayers, "gpuLayers", -1, MAX_GPU_LAYERS),
    contextSize: optionalClampedInt(input.contextSize, "contextSize", 128, MAX_CONTEXT_SIZE),
    threads: optionalClampedInt(input.threads, "threads", 1, MAX_THREADS),
    draftModelPath: optionalString(input.draftModelPath, "draftModelPath", 4096)
  };
}

function sanitizeEngineChatRequest(body: Record<string, unknown>): Parameters<typeof engineChat>[3] {
  return {
    messages: sanitizeMessages(body.messages),
    model: optionalString(body.model, "model", 500),
    stream: typeof body.stream === "boolean" ? body.stream : undefined,
    artifactId: optionalString(body.artifactId, "artifactId", 200),
    path: optionalString(body.path, "path", 4096),
    systemPrompt: optionalString(body.systemPrompt, "systemPrompt", 32_000),
    gpuLayers: optionalClampedInt(body.gpuLayers, "gpuLayers", -1, MAX_GPU_LAYERS),
    contextSize: optionalClampedInt(body.contextSize, "contextSize", 128, MAX_CONTEXT_SIZE),
    threads: optionalClampedInt(body.threads, "threads", 1, MAX_THREADS),
    maxTokens: optionalClampedInt(body.maxTokens, "maxTokens", 1, MAX_TOKENS),
    temperature: optionalClampedFloat(body.temperature, "temperature", 0, 2)
  };
}

function sanitizeOllamaChatRequest(body: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = { ...body };
  if (body.messages !== undefined) sanitized.messages = sanitizeMessages(body.messages);
  if (body.model !== undefined) sanitized.model = requireString(body.model, "model", 500);
  if (body.stream !== undefined && typeof body.stream !== "boolean") throw httpError(400, "stream must be a boolean.");
  if (isPlainObject(body.options)) {
    const options: Record<string, unknown> = { ...body.options };
    if (options.num_predict !== undefined) options.num_predict = optionalClampedInt(options.num_predict, "options.num_predict", 1, MAX_TOKENS);
    if (options.num_ctx !== undefined) options.num_ctx = optionalClampedInt(options.num_ctx, "options.num_ctx", 128, MAX_CONTEXT_SIZE);
    sanitized.options = options;
  }
  return sanitized;
}

function sanitizeOllamaGenerateRequest(body: Record<string, unknown>) {
  const prompt = requireString(body.prompt, "prompt", MAX_MESSAGE_CHARS);
  const systemPrompt = optionalString(body.system, "system", MAX_MESSAGE_CHARS);
  const messages: ChatMessage[] = [
    ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
    { role: "user" as const, content: prompt }
  ];
  const options = isPlainObject(body.options) ? body.options : {};
  const maxTokens =
    optionalClampedInt(options.num_predict, "options.num_predict", 1, MAX_TOKENS) ??
    optionalClampedInt(body.max_tokens, "max_tokens", 1, MAX_TOKENS) ??
    optionalClampedInt(body.maxTokens, "maxTokens", 1, MAX_TOKENS);
  const temperature =
    optionalClampedFloat(options.temperature, "options.temperature", 0, 2) ??
    optionalClampedFloat(body.temperature, "temperature", 0, 2);
  if (body.stream !== undefined && typeof body.stream !== "boolean") throw httpError(400, "stream must be a boolean.");
  return {
    model: optionalString(body.model, "model", 500),
    prompt,
    messages,
    stream: typeof body.stream === "boolean" ? body.stream : undefined,
    maxTokens,
    temperature,
    proxyBody: {
      ...body,
      model: optionalString(body.model, "model", 500),
      prompt,
      stream: typeof body.stream === "boolean" ? body.stream : undefined
    }
  };
}

function sanitizeOpenAiCompletionRequest(body: Record<string, unknown>) {
  const prompt = promptToText(body.prompt);
  if (!prompt.trim()) throw httpError(400, "prompt is required.");
  if (body.stream !== undefined && typeof body.stream !== "boolean") throw httpError(400, "stream must be a boolean.");
  return {
    model: optionalString(body.model, "model", 500),
    prompt,
    stream: body.stream === true,
    maxTokens:
      optionalClampedInt(body.max_tokens, "max_tokens", 1, MAX_TOKENS) ??
      optionalClampedInt(body.maxTokens, "maxTokens", 1, MAX_TOKENS),
    temperature: optionalClampedFloat(body.temperature, "temperature", 0, 2)
  };
}

function promptToText(value: unknown): string {
  if (typeof value === "string") return value.slice(0, MAX_MESSAGE_CHARS);
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item : ""))
      .join("\n")
      .slice(0, MAX_MESSAGE_CHARS);
  }
  throw httpError(400, "prompt must be a string or string array.");
}

function sanitizeMessages(value: unknown): ChatMessage[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw httpError(400, "messages must be an array.");
  if (value.length > MAX_MESSAGES) throw httpError(400, `messages cannot exceed ${MAX_MESSAGES} items.`);
  return value.map((entry) => {
    const message = requireObject<Record<string, unknown>>(entry);
    const role = requireString(message.role, "messages.role", 40);
    if (role !== "system" && role !== "user" && role !== "assistant") throw httpError(400, `Invalid message role: ${role}`);
    
    let content = "";
    if (role === "system") {
      if (typeof message.content !== "string") throw httpError(400, "messages.content must be a string.");
      if (message.content.length > MAX_MESSAGE_CHARS) throw httpError(400, "messages.content is too long.");
      content = message.content;
    } else {
      content = requireString(message.content, "messages.content", MAX_MESSAGE_CHARS);
    }

    return { role, content };
  });
}

function applyBilingualSystemPromptGuard(messages: ChatMessage[]): ChatMessage[] {
  const hasSystem = messages.some((m) => m.role === "system");
  if (hasSystem) {
    return messages;
  }
  return [
    { role: "system", content: "You are a helpful assistant. Always respond strictly in English." },
    ...messages
  ];
}

function sanitizePatterns(value: unknown): string[] {
  if (!Array.isArray(value)) throw httpError(400, "allowPatterns must be an array.");
  if (value.length > 20) throw httpError(400, "allowPatterns cannot exceed 20 items.");
  return value.map((item) => requireString(item, "allowPatterns", 120));
}

function sanitizeGpuOption(value: unknown): RuntimeLoadRequest["gpu"] | undefined {
  if (value === undefined) return undefined;
  if (value === "off" || value === "max" || value === "auto") return value;
  return optionalClampedInt(value, "gpu", 0, MAX_GPU_LAYERS);
}

function requireObject<T extends object = Record<string, unknown>>(value: unknown): T {
  if (!isPlainObject(value)) throw httpError(400, "Request body must be a JSON object.");
  return value as T;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, name: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim()) throw httpError(400, `${name} is required.`);
  const trimmed = value.trim();
  if (trimmed.length > maxLength) throw httpError(400, `${name} is too long.`);
  return trimmed;
}

function optionalString(value: unknown, name: string, maxLength: number): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requireString(value, name, maxLength);
}

function optionalClampedInt(value: unknown, name: string, min: number, max: number): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) throw httpError(400, `${name} must be a finite number.`);
  return clampInt(value, min, max);
}

function optionalClampedFloat(value: unknown, name: string, min: number, max: number): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) throw httpError(400, `${name} must be a finite number.`);
  return Math.max(min, Math.min(max, value));
}

function clampInt(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function combineAbortSignals(...signals: AbortSignal[]) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener("abort", abort, { once: true });
  }
  return controller.signal;
}

function cryptoRandomId() {
  return randomUUID().replace(/-/g, "");
}

function httpError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}

function errorStatus(error: unknown) {
  const status = (error as { statusCode?: unknown })?.statusCode;
  return typeof status === "number" && status >= 400 && status < 600 ? status : 500;
}

function applySecurityHeaders(request: http.IncomingMessage, response: http.ServerResponse, config: DaemonConfig) {
  const origin = request.headers.origin;
  if (origin && isAllowedLocalOrigin(origin, config.allowedOrigins)) {
    response.setHeader("access-control-allow-origin", origin);
    response.setHeader("vary", "origin");
    response.setHeader("access-control-allow-methods", "GET,POST,PUT,OPTIONS");
    response.setHeader(
      "access-control-allow-headers",
      `content-type, ${PRIVILEGED_CONFIRM_HEADER_MARKETPLACE}, ${PRIVILEGED_CONFIRM_HEADER_STUDIO}`
    );
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

function isSlidingAppPortOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    const isLoopback = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost" || parsed.hostname === "::1";
    if (!isLoopback) return false;
    const port = parsed.port ? parseInt(parsed.port, 10) : (parsed.protocol === "https:" ? 443 : 80);
    return port >= 3000 && port <= 3010;
  } catch {
    return false;
  }
}

export function isConfiguredOrigin(origin: string, configured: string[]) {
  const normalizedOrigin = normalizeOrigin(origin);
  return (
    configured.some((entry) => entry !== "*" && normalizeOrigin(entry) === normalizedOrigin) ||
    isSlidingAppPortOrigin(origin)
  );
}

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const PRIVILEGED_CONFIRM_HEADER_MARKETPLACE = "x-ht-marketplace-confirm";
const PRIVILEGED_CONFIRM_HEADER_STUDIO = "x-ht-studio-confirm";
const PRIVILEGED_CONFIRM_HEADER = PRIVILEGED_CONFIRM_HEADER_MARKETPLACE;
const PRIVILEGED_CONFIRM_VALUE = "privileged-action";

interface GuardConfig {
  host: string;
  allowedOrigins: string[];
}

/**
 * Defend the loopback daemon against DNS-rebinding and drive-by-localhost CSRF.
 * The Host header must resolve to loopback (or a configured host), which blocks
 * rebinding attacks; and any state-changing request that carries a browser
 * Origin must come from a configured origin, which blocks arbitrary localhost
 * pages from silently triggering installs, downloads, model loads, or deletes.
 * Non-browser clients (CLI, SDK from Node) send no Origin and are unaffected.
 */
export function isLoopbackHost(hostHeader: string | undefined, config: GuardConfig): boolean {
  if (!hostHeader) return false;
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
    !isConfiguredOrigin(input.origin, config.allowedOrigins)
  ) {
    return { ok: false, status: 403, reason: "Refusing request: Origin is not configured for a state-changing request." };
  }
  return { ok: true };
}

export function evaluatePrivilegedActionGuard(
  input: { method: string; pathname: string; origin?: string; headers?: http.IncomingHttpHeaders },
  config: GuardConfig
): { ok: true } | { ok: false; status: number; reason: string } {
  if (!isPrivilegedRoute(input.method, input.pathname)) return { ok: true };
  if (input.origin && !isConfiguredOrigin(input.origin, config.allowedOrigins)) {
    return { ok: false, status: 403, reason: "Refusing privileged request: Origin is not configured." };
  }
  const confirmation1 = input.headers?.[PRIVILEGED_CONFIRM_HEADER_MARKETPLACE];
  const confirmation2 = input.headers?.[PRIVILEGED_CONFIRM_HEADER_STUDIO];
  const checkValue = (val: unknown) =>
    Array.isArray(val) ? val.includes(PRIVILEGED_CONFIRM_VALUE) : val === PRIVILEGED_CONFIRM_VALUE;
  const confirmed = checkValue(confirmation1) || checkValue(confirmation2);
  if (!confirmed) {
    return {
      ok: false,
      status: 403,
      reason: `Refusing privileged request: missing ${PRIVILEGED_CONFIRM_HEADER_MARKETPLACE} or ${PRIVILEGED_CONFIRM_HEADER_STUDIO}.`
    };
  }
  return { ok: true };
}

function isPrivilegedRoute(method: string, pathname: string) {
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod === "PUT" && pathname === "/api/engine/config") return true;
  if (normalizedMethod !== "POST") return false;
  return (
    pathname === "/api/downloads" ||
    /^\/api\/downloads\/[^/]+\/(?:pause|resume|cancel)$/.test(pathname) ||
    pathname === "/api/models/index/refresh" ||
    pathname === "/api/engine/hot-pool/warm" ||
    pathname === "/api/engine/server/install" ||
    pathname === "/api/engine/server/start" ||
    pathname === "/api/engine/server/stop" ||
    pathname === "/api/engine/server/pool/warm" ||
    pathname === "/api/engine/server/pool/stop" ||
    pathname === "/api/runtimes/evict-all" ||
    pathname === "/api/runtimes/install" ||
    pathname === "/api/runtimes/ollama/server/start" ||
    pathname === "/api/runtimes/lmstudio/server/start" ||
    pathname === "/api/runtimes/llamacpp/load" ||
    pathname === "/api/runtimes/llamacpp/unload" ||
    pathname === "/api/engine/upgrade" ||
    /^\/api\/runtimes\/[^/]+\/(?:load|unload)$/.test(pathname) ||
    /^\/api\/artifacts\/[^/]+\/reveal$/.test(pathname) ||
    /^\/api\/delete-plans\/[^/]+\/confirm$/.test(pathname)
  );
}

function normalizeOrigin(origin: string) {
  try {
    return new URL(origin).origin;
  } catch {
    return origin.replace(/\/+$/, "");
  }
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

export async function readJson<T>(request: http.IncomingMessage, maxBytes = JSON_BODY_LIMIT_BYTES): Promise<T> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > maxBytes) {
      throw httpError(413, `Request body exceeds ${maxBytes} bytes.`);
    }
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return raw ? (JSON.parse(raw) as T) : ({} as T);
  } catch {
    throw httpError(400, "Request body must be valid JSON.");
  }
}

function required(value: string | null, name: string) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}
