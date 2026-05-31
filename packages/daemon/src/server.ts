import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import os from "node:os";
import { randomUUID } from "node:crypto";
import type { RuntimeLoadRequest, RuntimeModel, StartDownloadRequest } from "@ht-llm-marketplace/sdk";
import { OllamaAdapter } from "./adapters/ollama.js";
import { LmStudioAdapter } from "./adapters/lmstudio.js";
import { openAiCompatibleStatus } from "./adapters/openai.js";
import type { DaemonConfig } from "./config.js";
import { confirmDeletePlan, createDeletePlan } from "./delete/safety.js";
import { buildDocumentPrompt } from "./documents/local-rag.js";
import { mergeDocumentResults, semanticSearch } from "./documents/vector-store.js";
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
import { LlamaEngine } from "./engine/llama.js";
import { ModelIndex } from "./engine/model-index.js";
import { GenerationQueue } from "./engine/queue.js";
import { chooseStandardModel } from "./engine/standard-routing.js";
import { ollamaChunk, ollamaDone, type ChatMessage } from "./engine/messages.js";
import {
  openAiChunk,
  openAiCompletion,
  openAiCompletionId,
  openAiFinalChunk,
  openAiModelList,
  openAiUsage,
  parseOpenAiChatRequest,
  type OpenAiUsage
} from "./engine/openai.js";
import { fetchTextWithLimit, README_RESPONSE_LIMIT } from "./http.js";
import { compatibilityScorecard } from "./compatibility.js";
import { estimateTokens as estimateResponseTokens, inputToMessages, responseObject, streamEvents } from "./responses/adapter.js";
import type { LocalResponsesRequest } from "./responses/types.js";
import { LlamaServerManager } from "./runtime/llama-server.js";
import { sanitizeRuntimeConfig } from "./runtime/config.js";
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
  modelIndex: ModelIndex;
  queue: GenerationQueue;
  embeddings: Promise<EmbeddingProvider | undefined>;
  llamaServer: LlamaServerManager;
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
  const embeddings = createEmbeddingProvider().catch(() => undefined);
  const llamaServer = new LlamaServerManager({
    binaryPath: process.env.LLAMA_SERVER_BIN,
    modelPath: process.env.LLAMA_SERVER_MODEL,
    port: process.env.LLAMA_SERVER_PORT ? Number(process.env.LLAMA_SERVER_PORT) : undefined,
    searchRoots: [process.cwd(), config.storageDir, config.modelsDir]
  });
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
  return { config, store, ollama, lmstudio, downloads, engine, modelIndex, queue, embeddings, llamaServer };
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

      if (route === "GET /api/runtimes") {
        return json(response, { runtimes: await runtimeStatuses(context) });
      }

      if (route === "GET /api/system/scan") {
        return json(response, await scanSystem(context.config.modelsDir, await runtimeStatuses(context)));
      }

      if (route === "GET /api/models/index") {
        const models = await context.modelIndex.models();
        return json(response, { index: context.modelIndex.status(), models: withLoadedState(context, models) });
      }

      if (route === "POST /api/models/index/refresh") {
        const snapshot = await context.modelIndex.refresh("manual");
        return json(response, { index: snapshot.status, models: withLoadedState(context, snapshot.models) });
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

      if (route === "GET /api/queue") {
        return json(response, context.queue.status());
      }

      const cancelQueue = url.pathname.match(/^\/api\/queue\/([^/]+)\/cancel$/);
      if (request.method === "POST" && cancelQueue) {
        return json(response, { ok: context.queue.cancel(decodeURIComponent(cancelQueue[1])) });
      }

      if (route === "GET /api/compatibility/scorecard") {
        const embeddings = await context.embeddings;
        const scorecard = compatibilityScorecard({
          modelIndex: context.modelIndex.status(),
          benchmarks: context.store.listBenchmarks(),
          queue: context.queue.status(),
          embeddingsAvailable: Boolean(embeddings),
          delegatedServer: context.llamaServer.status(),
          documentsIndexed: context.store.listDocuments().length
        });
        try {
          context.store.addCompatibilityRun(scorecard);
        } catch {
          // Scorecard persistence is evidence history only; never fail the live proof route.
        }
        return json(response, scorecard);
      }

      if (route === "GET /api/documents") {
        return json(response, { documents: context.store.listDocuments() });
      }

      if (route === "POST /api/documents") {
        const body = requireObject(await readJson<{ name?: string; content?: string }>(request));
        const document = context.store.addDocument({
          name: optionalString(body.name, "name", 200) || "Untitled document",
          content: requireString(body.content, "content", 2_000_000)
        });
        await indexDocumentEmbeddings(context, document.id);
        return json(response, { document }, 201);
      }

      if (route === "GET /api/documents/search") {
        const query = required(url.searchParams.get("q"), "q");
        const limit = clampInt(Number.parseInt(url.searchParams.get("limit") || "5", 10), 1, 20);
        return json(response, { results: await retrieveDocumentCitations(context, query, limit) });
      }

      if (route === "POST /api/documents/ask") {
        const body = requireObject(await readJson<{ question?: string; documentIds?: string[]; limit?: number; model?: string }>(request, 128_000));
        const question = requireString(body.question, "question", 4_000);
        const limit = optionalClampedInt(body.limit, "limit", 1, 12) || 6;
        const allowedIds = Array.isArray(body.documentIds)
          ? new Set(body.documentIds.map((id) => requireString(id, "documentIds", 200)))
          : undefined;
        const citations = (await retrieveDocumentCitations(context, question, limit * 2))
          .filter((citation) => !allowedIds || allowedIds.has(citation.documentId))
          .slice(0, limit);
        const prompt = buildDocumentPrompt(question, citations);
        const model = optionalString(body.model, "model", 500);
        const delegatedError = delegatedBackendError(context);
        if (delegatedError) return json(response, { error: delegatedError.message }, delegatedError.status);
        if (model && context.engine.loadedModel !== model) {
          const target = resolveLocalModelByName(context, model);
          if (target) await context.engine.load({ modelPath: target.path, displayName: target.displayName });
        }
        if (!context.engine.isLoaded()) {
          await loadStandardRouteModel(context);
        }
        const answer = await context.queue.run(`documents:${context.engine.loadedModel || model || "loaded"}`, (signal) =>
          context.engine.chat([{ role: "user", content: prompt }], { maxTokens: 512, temperature: 0.2, signal })
        );
        return json(response, { answer, citations });
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
            error: `One-click install is only fully automated on Windows (via winget) in this version. On macOS/Linux, please run: ${
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
          message: `One-click installation for ${runtime} (${wingetId}) started in the background.`
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
        return json(response, context.llamaServer.status());
      }

      if (route === "POST /api/engine/server/start") {
        return json(response, await context.llamaServer.start());
      }

      if (route === "POST /api/engine/server/stop") {
        return json(response, await context.llamaServer.stop());
      }

      if (route === "POST /api/runtimes/llamacpp/load") {
        const body = sanitizeEngineLoadRequest(await readJson<unknown>(request));
        const target = resolveEngineModelPath(context, body);
        if (!target.path.startsWith("virtual:")) {
          const support = await engineArchSupport(context, target.path);
          if (!support.supported) {
            return json(response, { ok: false, error: support.reason, architecture: support.architecture, minRelease: support.minRelease }, 422);
          }
        }
        const result = await context.engine.load({
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
        ].map((model) => ({
          name: model.name,
          model: model.name,
          modified_at: new Date().toISOString(),
          size: model.sizeBytes || 0,
          digest: "",
          details: {
            parent_model: "",
            format: "gguf",
            family: "llama",
            families: ["llama"],
            parameter_size: "",
            quantization_level: ""
          }
        }));
        return json(response, { models });
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

      if (route === "POST /v1/responses") {
        const body = requireObject(await readJson<Record<string, unknown>>(request));
        await openAiResponses(request, response, context, body);
        return;
      }

      if (route === "POST /v1/embeddings") {
        const provider = await context.embeddings;
        if (!provider) {
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
        const body = requireObject<Record<string, unknown>>(await readJson<unknown>(request, 512_000));
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

function standardRouteDecision(context: RuntimeContext, models = context.modelIndex.snapshot().models) {
  return chooseStandardModel(models, context.store.listBenchmarks(), {
    loadedModel: context.engine.loadedModel
  });
}

function delegatedBackendError(context: RuntimeContext): { status: number; message: string } | undefined {
  const config = context.store.getRuntimeConfig();
  if (config.backend !== "delegated-server" && !config.delegatedServer.enabled) return undefined;
  const status = context.llamaServer.status();
  if (!status.running) {
    return {
      status: 503,
      message: `Delegated llama-server backend is selected, but no server is running. ${status.message}`
    };
  }
  return {
    status: 501,
    message: `Delegated llama-server is running at ${status.endpoint}, but chat proxying is not enabled in this build.`
  };
}

async function loadStandardRouteModel(context: RuntimeContext) {
  if (context.engine.isLoaded()) return;
  const decision = standardRouteDecision(context, await context.modelIndex.models());
  if (!decision.selected) return;
  await context.engine.load({
    modelPath: decision.selected.path,
    displayName: decision.selected.name
  });
}

async function indexDocumentEmbeddings(context: RuntimeContext, documentId: string) {
  const provider = await context.embeddings;
  if (!provider) return;
  const chunks = context.store.listDocumentChunks(documentId);
  if (chunks.length === 0) return;
  const result = await provider.embed(chunks.map((chunk) => chunk.content));
  for (let index = 0; index < chunks.length; index += 1) {
    const vector = result.vectors[index];
    if (!vector) continue;
    context.store.addDocumentEmbedding({
      documentId,
      chunkIndex: chunks[index].chunkIndex,
      model: result.model,
      dimensions: vector.length,
      vector
    });
  }
}

async function retrieveDocumentCitations(context: RuntimeContext, question: string, limit: number) {
  const lexical = context.store.searchDocuments(question, limit);
  const provider = await context.embeddings;
  if (!provider) return lexical;
  const query = await provider.embed([question]);
  const vector = query.vectors[0];
  if (!vector) return lexical;
  const semantic = semanticSearch(vector, context.store.listDocumentEmbeddings(query.model), limit);
  return mergeDocumentResults(lexical, semantic, limit);
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

async function engineChat(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  context: RuntimeContext,
  body: { messages?: ChatMessage[]; model?: string; stream?: boolean; artifactId?: string; path?: string; systemPrompt?: string; gpuLayers?: number; contextSize?: number; threads?: number; maxTokens?: number; temperature?: number }
) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const delegatedError = delegatedBackendError(context);
  if (delegatedError) return json(response, { error: delegatedError.message }, delegatedError.status);

  let useFallbackToOllama = false;

  if (body.model && context.engine.loadedModel !== body.model) {
    const target = resolveLocalModelByName(context, body.model);
    if (target) {
      if (!target.path.startsWith("virtual:")) {
        const support = await engineArchSupport(context, target.path);
        if (!support.supported) {
          const isOllamaModel = target.path.toLowerCase().includes("ollama") || target.path.toLowerCase().includes("blobs");
          const ollamaStatus = await context.ollama.status();
          if (isOllamaModel && ollamaStatus.online) {
            useFallbackToOllama = true;
          } else {
            return json(response, { error: support.reason, architecture: support.architecture, minRelease: support.minRelease }, 422);
          }
        }
      }
      if (!useFallbackToOllama) {
        await context.engine.load({
          modelPath: target.path,
          displayName: target.displayName,
          systemPrompt: body.systemPrompt,
          gpuLayers: body.gpuLayers,
          contextSize: body.contextSize,
          threads: body.threads
        });
      }
    }
  }

  if (!useFallbackToOllama && !context.engine.isLoaded() && (body.artifactId || body.path)) {
    const target = resolveEngineModelPath(context, body);
    if (!target.path.startsWith("virtual:")) {
      const support = await engineArchSupport(context, target.path);
      if (!support.supported) {
        const isOllamaModel = target.path.toLowerCase().includes("ollama") || target.path.toLowerCase().includes("blobs");
        const ollamaStatus = await context.ollama.status();
        if (isOllamaModel && ollamaStatus.online) {
          useFallbackToOllama = true;
        } else {
          return json(response, { error: support.reason, architecture: support.architecture, minRelease: support.minRelease }, 422);
        }
      }
    }
    if (!useFallbackToOllama) {
      await context.engine.load({
        modelPath: target.path,
        displayName: target.displayName,
        systemPrompt: body.systemPrompt,
        gpuLayers: body.gpuLayers,
        contextSize: body.contextSize,
        threads: body.threads
      });
    }
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

async function localGgufModels(context: RuntimeContext) {
  return context.modelIndex.models();
}

function localGgufSnapshot(context: RuntimeContext) {
  return context.modelIndex.snapshot().models;
}

function withLoadedState(context: RuntimeContext, models: Array<{ path: string }>) {
  const loadedPath = context.engine.loadedPath;
  return models.map((model) => ({
    ...model,
    loaded: !!loadedPath && path.resolve(model.path).toLowerCase() === path.resolve(loadedPath).toLowerCase()
  }));
}

/** Arch-aware preflight: would the built-in engine's current release run this GGUF? */
async function engineArchSupport(context: RuntimeContext, modelPath: string) {
  return checkArchSupport(await context.engine.readArchitecture(modelPath), readBundledLlamaRelease());
}

async function runEngineUpgrade(context: RuntimeContext) {
  const cwd = path.resolve(process.cwd());
  try {
    await runProcess(npmExecutable(), ["install", "node-llama-cpp@latest", "-w", "@ht-llm-marketplace/daemon"], cwd);
    await runProcess(npmExecutable(), ["run", "rebuild:cuda"], cwd);
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
      windowsHide: true
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

  const delegatedError = delegatedBackendError(context);
  if (delegatedError) {
    return json(response, { error: { message: delegatedError.message, type: "service_unavailable" } }, delegatedError.status);
  }

  // If a specific model was named and isn't the loaded one, load it from local storage.
  if (parsed.model && context.engine.loadedModel !== parsed.model) {
    const target = resolveLocalModelByName(context, parsed.model);
    if (target) {
      if (!target.path.startsWith("virtual:")) {
        const support = await engineArchSupport(context, target.path);
        if (!support.supported) {
          return json(response, { error: { message: support.reason, type: "model_not_supported" } }, 422);
        }
      }
      try {
        await context.engine.load({ modelPath: target.path, displayName: target.displayName });
      } catch (error) {
        return json(response, { error: { message: `Failed to load model '${parsed.model}': ${(error as Error).message}` } }, 500);
      }
    }
  }
  if (!context.engine.isLoaded() && !parsed.model) {
    await loadStandardRouteModel(context);
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

  const delegatedError = delegatedBackendError(context);
  if (delegatedError) {
    return json(response, { error: { message: delegatedError.message, type: "service_unavailable" } }, delegatedError.status);
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
    if (target) await context.engine.load({ modelPath: target.path, displayName: target.displayName });
  }
  if (!context.engine.isLoaded()) {
    throw httpError(400, "Load a local model before running a benchmark.");
  }
  try {
    const benchmark = await context.queue.run(`benchmark:${context.engine.loadedModel || input.model || "loaded"}`, (signal) =>
      runBenchmark({
        model: context.engine.loadedModel || input.model,
        runtime: "llamacpp",
        prompt: input.prompt,
        chat: (messages, options) =>
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

function sanitizeMessages(value: unknown): ChatMessage[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw httpError(400, "messages must be an array.");
  if (value.length > MAX_MESSAGES) throw httpError(400, `messages cannot exceed ${MAX_MESSAGES} items.`);
  return value.map((entry) => {
    const message = requireObject<Record<string, unknown>>(entry);
    const role = requireString(message.role, "messages.role", 40);
    if (role !== "system" && role !== "user" && role !== "assistant") throw httpError(400, `Invalid message role: ${role}`);
    return {
      role,
      content: requireString(message.content, "messages.content", MAX_MESSAGE_CHARS)
    };
  });
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
    response.setHeader("access-control-allow-headers", `content-type, ${PRIVILEGED_CONFIRM_HEADER}`);
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

export function isConfiguredOrigin(origin: string, configured: string[]) {
  if (configured.includes("*")) return true;
  const normalizedOrigin = normalizeOrigin(origin);
  return configured.some((entry) => normalizeOrigin(entry) === normalizedOrigin);
}

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const PRIVILEGED_CONFIRM_HEADER = "x-ht-marketplace-confirm";
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
  const confirmation = input.headers?.[PRIVILEGED_CONFIRM_HEADER];
  const confirmed = Array.isArray(confirmation)
    ? confirmation.includes(PRIVILEGED_CONFIRM_VALUE)
    : confirmation === PRIVILEGED_CONFIRM_VALUE;
  if (!confirmed) {
    return { ok: false, status: 403, reason: `Refusing privileged request: missing ${PRIVILEGED_CONFIRM_HEADER}.` };
  }
  return { ok: true };
}

function isPrivilegedRoute(method: string, pathname: string) {
  if (method.toUpperCase() !== "POST") return false;
  return (
    pathname === "/api/runtimes/install" ||
    pathname === "/api/runtimes/ollama/server/start" ||
    pathname === "/api/runtimes/lmstudio/server/start" ||
    pathname === "/api/engine/upgrade" ||
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
