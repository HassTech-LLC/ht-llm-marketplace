import { describe, expect, it, vi } from "vitest";
import { createServer, readJson } from "../server.js";
import http from "node:http";
import EventEmitter from "node:events";
import fs from "node:fs";

vi.mock("../engine/doctor.js", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    readBundledLlamaRelease: () => "b8390"
  };
});


const PRIVILEGED_HEADERS = { "x-ht-studio-confirm": "privileged-action" };

// Helper to create mock request
function createMockRequest(method: string, urlPath: string, bodyObj?: any, headers?: Record<string, string>) {
  const req = new EventEmitter() as any;
  req.method = method;
  req.url = urlPath;
  req.headers = {
    host: "127.0.0.1:3001",
    ...headers
  };
  
  if (bodyObj) {
    req[Symbol.asyncIterator] = async function* () {
      yield Buffer.from(JSON.stringify(bodyObj));
    };
  } else {
    req[Symbol.asyncIterator] = async function* () {};
  }
  return req;
}

// Helper to create mock response
function createMockResponse() {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: "",
    writeHead(status: number, headers?: any) {
      this.statusCode = status;
      if (headers) {
        this.headers = { ...this.headers, ...headers };
      }
      return this;
    },
    setHeader(key: string, value: string) {
      this.headers[key] = value;
      return this;
    },
    write(chunk: any) {
      this.body += chunk.toString();
      return true;
    },
    end(chunk?: any) {
      if (chunk) {
        this.body += chunk.toString();
      }
      return this;
    }
  } as any;
  return res;
}

describe("Ollama & LM Studio Replacement Compatibility Server Routing", () => {
  // A fresh mock context generator to isolate test states
  function createMockContext() {
    const ctx = {
      config: {
        host: "127.0.0.1",
        allowedOrigins: ["*"],
        storageDir: "./storage",
        modelsDir: "./models",
        downloadsDir: "./downloads",
        dbPath: "./db.sqlite",
        ollamaHost: "http://127.0.0.1:11434",
        lmStudioHost: "http://127.0.0.1:1234",
        modelScanDirs: []
      },
      store: {
        listArtifacts: vi.fn().mockReturnValue([
          {
            owned: true,
            path: "./models/Phi-3-mini-4k-instruct-q4.gguf",
            name: "phi-3",
            displayName: "phi-3",
            sizeBytes: 2200000000,
            runtime: "llamacpp"
          }
        ]),
        getArtifact: vi.fn(),
        setArtifactVerification: vi.fn((verification: any) => verification),
        listBenchmarks: vi.fn().mockReturnValue([]),
        addBenchmark: vi.fn((benchmark: any) => benchmark),
        addResponse: vi.fn((_response: any) => _response.response),
        getResponse: vi.fn(),
        getRuntimeConfig: vi.fn().mockReturnValue({
          keepWarm: true,
          unloadAfterIdleMs: 900000,
          contextSize: 4096,
          gpuLayers: "auto",
          threads: "auto",
          backend: "in-process",
          residencyMode: "balanced",
          draftModel: null,
          delegatedServer: { enabled: false, port: 8080, parallel: 4, continuousBatching: true },
          hotPool: { enabled: true, maxModels: 2, maxModelBytes: 2_000_000_000, autoWarm: true }
        }),
        setRuntimeConfig: vi.fn((config: any) => config),
        listAuditLog: vi.fn(),
        audit: vi.fn()
      },
      ollama: {
        status: vi.fn().mockResolvedValue({ id: "ollama", online: false }),
        chat: vi.fn(),
        generate: vi.fn(),
        show: vi.fn()
      },
      lmstudio: {
        status: vi.fn().mockResolvedValue({ id: "lmstudio", online: false })
      },
      downloads: {
        list: vi.fn().mockReturnValue([]),
        start: vi.fn().mockImplementation((body: any) => Promise.resolve({
          id: "job-download",
          type: "hf-file",
          status: "queued",
          progress: 0,
          source: body.source,
          target: body.filename || body.model || body.ref,
          message: "queued",
          startedAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString()
        }))
      },
      engine: {
        available: true,
        gpu: "CUDA" as const,
        loadedModel: undefined as string | undefined,
        loadedPath: undefined as string | undefined,
        isLoaded: vi.fn().mockImplementation(function(this: any) {
          return !!this.loadedModel;
        }),
        status: vi.fn().mockReturnValue({ id: "llamacpp", online: true, models: [] }),
        readArchitecture: vi.fn().mockResolvedValue("llama"),
        load: vi.fn().mockImplementation(function(this: any, options: any) {
          this.loadedModel = options.displayName || "loaded";
          this.loadedPath = options.modelPath;
          return Promise.resolve({ loaded: this.loadedModel, gpu: "CUDA" });
        }),
        chat: vi.fn().mockResolvedValue("Mock response")
      },
      hotPool: {
        status: vi.fn().mockReturnValue({ enabled: false, maxModels: 0, maxModelBytes: 0, residencyMode: "balanced", entries: [] }),
        warm: vi.fn().mockResolvedValue({ enabled: false, maxModels: 0, maxModelBytes: 0, residencyMode: "balanced", entries: [] }),
        has: vi.fn().mockReturnValue(false),
        chat: vi.fn()
      },
      modelIndex: {
        models: vi.fn().mockResolvedValue([
          {
            id: "./models/Phi-3-mini-4k-instruct-q4.gguf",
            path: "./models/Phi-3-mini-4k-instruct-q4.gguf",
            name: "phi-3",
            sizeBytes: 2200000000,
            source: "HT Studio",
            dir: "models",
            runnable: true,
            indexedAt: new Date(0).toISOString(),
            trustLevel: "owned",
            autoWarmEligible: true
          },
          {
            id: "./research/research-fast.gguf",
            path: "./research/research-fast.gguf",
            name: "research-fast",
            sizeBytes: 1000000000,
            source: "HT LLM Research",
            dir: "research",
            runnable: true,
            indexedAt: new Date(0).toISOString(),
            trustLevel: "ambient",
            autoWarmEligible: false,
            trustReason: "reference workspace"
          },
          {
            id: "virtual:ternary-ssm-specialist",
            path: "virtual:ternary-ssm-specialist",
            name: "Ternary-SSM-Specialist",
            sizeBytes: 850000000,
            source: "Virtual-SSM",
            dir: "virtual-core",
            runnable: true,
            indexedAt: new Date(0).toISOString(),
            trustLevel: "virtual",
            autoWarmEligible: false
          }
        ]),
        snapshot: vi.fn().mockReturnValue({
          status: { state: "ready", ttlMs: 30000, modelCount: 3 },
          models: [
            {
              id: "./models/Phi-3-mini-4k-instruct-q4.gguf",
              path: "./models/Phi-3-mini-4k-instruct-q4.gguf",
              name: "phi-3",
              sizeBytes: 2200000000,
              source: "HT Studio",
              dir: "models",
              runnable: true,
              indexedAt: new Date(0).toISOString(),
              trustLevel: "owned",
              autoWarmEligible: true
            },
            {
              id: "./research/research-fast.gguf",
              path: "./research/research-fast.gguf",
              name: "research-fast",
              sizeBytes: 1000000000,
              source: "HT LLM Research",
              dir: "research",
              runnable: true,
              indexedAt: new Date(0).toISOString(),
              trustLevel: "ambient",
              autoWarmEligible: false,
              trustReason: "reference workspace"
            },
            {
              id: "virtual:ternary-ssm-specialist",
              path: "virtual:ternary-ssm-specialist",
              name: "Ternary-SSM-Specialist",
              sizeBytes: 850000000,
              source: "Virtual-SSM",
              dir: "virtual-core",
              runnable: true,
              indexedAt: new Date(0).toISOString(),
              trustLevel: "virtual",
              autoWarmEligible: false
            }
          ]
        }),
        refresh: vi.fn().mockResolvedValue({
          status: { state: "ready", ttlMs: 30000, modelCount: 2 },
          models: []
        }),
        status: vi.fn().mockReturnValue({ state: "ready", ttlMs: 30000, modelCount: 3 })
      },
      queue: {
        run: vi.fn((_label: string, work: any) => work(new AbortController().signal)),
        status: vi.fn().mockReturnValue({ queued: [], recent: [] }),
        cancel: vi.fn().mockReturnValue(true)
      },
      embeddings: Promise.resolve(undefined),
      llamaServer: {
        configure: vi.fn(),
        status: vi.fn().mockReturnValue({ available: false, running: false, message: "unavailable" }),
        start: vi.fn().mockResolvedValue({ available: false, running: false, message: "unavailable" }),
        stop: vi.fn().mockResolvedValue({ available: false, running: false, message: "unavailable" })
      },
      llamaServerPool: {
        status: vi.fn().mockReturnValue({ enabled: false, basePort: 8080, entries: [] }),
        endpointForModel: vi.fn().mockReturnValue(undefined),
        warm: vi.fn().mockResolvedValue({ enabled: true, basePort: 8080, entries: [] }),
        stopAll: vi.fn().mockResolvedValue({ enabled: true, basePort: 8080, entries: [] })
      }
    } as any;
    return ctx;
  }

  it("GET /api/version returns the daemon's own package.json version", async () => {
    const mockContext = createMockContext();
    const server = createServer(mockContext);
    const handler = (server as any)._events.request;
    const req = createMockRequest("GET", "/api/version");
    const res = createMockResponse();

    await handler(req, res);
    if (res.statusCode !== 200) {
      console.log("FAILING RESPONSE:", res.body);
    }
    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    // Don't pin to a literal — pin to the actual package.json so the two cannot drift.
    const pkgPath = new URL("../../package.json", import.meta.url);
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    expect(parsed).toEqual({ version: pkg.version });
  });

  it("OPTIONS preflight allows browser runtime config PUT requests", async () => {
    const mockContext = createMockContext();
    const server = createServer(mockContext);
    const handler = (server as any)._events.request;
    const req = createMockRequest("OPTIONS", "/api/engine/config", undefined, {
      origin: "http://127.0.0.1:3000",
      "access-control-request-method": "PUT"
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(204);
    expect(res.headers["access-control-allow-methods"]).toContain("PUT");
  });

  it("GET /api/tags lists both local and owned GGUF models formatted for Ollama", async () => {
    const mockContext = createMockContext();
    const server = createServer(mockContext);
    const handler = (server as any)._events.request;
    const req = createMockRequest("GET", "/api/tags");
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.models.length).toBeGreaterThanOrEqual(1);
    const phi3 = parsed.models.find((m: any) => m.name === "phi-3");
    expect(phi3).toBeDefined();
    expect(phi3).toMatchObject({
      name: "phi-3",
      model: "phi-3",
      size: 2200000000,
      details: {
        format: "gguf",
        family: "llama"
      }
    });
  });

  it("GET /api/server/readiness reports standalone server readiness", async () => {
    const mockContext = createMockContext();
    const server = createServer(mockContext);
    const handler = (server as any)._events.request;
    const req = createMockRequest("GET", "/api/server/readiness");
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.ok).toBe(true);
    expect(parsed.endpoints.ollamaGenerate).toBe(true);
    expect(parsed.endpoints.openAiCompletions).toBe(true);
    expect(parsed.models.runnableLocal).toBeGreaterThanOrEqual(1);
    expect(parsed.recommendations[0]).toContain("Server is ready");
  });

  it("GET /api/compatibility/scorecard reports automatic routing and ambient trust boundaries", async () => {
    const mockContext = createMockContext();
    const server = createServer(mockContext);
    const handler = (server as any)._events.request;
    const req = createMockRequest("GET", "/api/compatibility/scorecard");
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.standardRoute.selected.name).toBe("phi-3");
    expect(parsed.trust.automaticEligible).toBeGreaterThanOrEqual(1);
    expect(parsed.trust.ambientDiscovered).toBe(1);
    expect(parsed.trust.skippedAmbient).toBe(1);
    expect(parsed.recommendations.some((item: string) => item.includes("manual loading"))).toBe(true);
  });

  it("POST /api/show returns local model metadata in Ollama shape", async () => {
    const mockContext = createMockContext();
    const server = createServer(mockContext);
    const handler = (server as any)._events.request;
    const req = createMockRequest("POST", "/api/show", { model: "phi-3" });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.modelfile).toContain("Phi-3-mini-4k-instruct-q4.gguf");
    expect(parsed.details.format).toBe("gguf");
    expect(parsed.capabilities).toContain("completion");
  });

  it("GET /api/ps lists in-process loaded and hot models in Ollama shape", async () => {
    const mockContext = createMockContext();
    mockContext.engine.loadedModel = "phi-3";
    mockContext.hotPool.status = vi.fn().mockReturnValue({
      enabled: true,
      maxModels: 2,
      maxModelBytes: 3_000_000_000,
      entries: [{ model: "tiny", path: "./models/tiny.gguf", source: "local", sizeBytes: 1000, state: "ready", gpu: "CUDA" }]
    });
    const server = createServer(mockContext);
    const handler = (server as any)._events.request;
    const req = createMockRequest("GET", "/api/ps");
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.models.map((model: any) => model.name)).toEqual(expect.arrayContaining(["phi-3", "tiny"]));
    expect(parsed.models[0]).toHaveProperty("expires_at");
  });

  it("GET /api/models/index returns cached model-index state", async () => {
    const mockContext = createMockContext();
    const server = createServer(mockContext);
    const handler = (server as any)._events.request;
    const req = createMockRequest("GET", "/api/models/index");
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.index.state).toBe("ready");
    expect(parsed.models.some((model: any) => model.name === "phi-3")).toBe(true);
  });

  it("POST /api/downloads requires explicit license acceptance for Hugging Face installs", async () => {
    const mockContext = createMockContext();
    const server = createServer(mockContext);
    const handler = (server as any)._events.request;
    const req = createMockRequest("POST", "/api/downloads", {
      source: "huggingface",
      runtime: "llamacpp",
      repoId: "test/model",
      filename: "model.Q4_K_M.gguf"
    }, PRIVILEGED_HEADERS);
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain("licenseAccepted");
    expect(mockContext.downloads.start).not.toHaveBeenCalled();
  });

  it("POST /api/downloads accepts Hugging Face installs after license review is marked", async () => {
    const mockContext = createMockContext();
    const server = createServer(mockContext);
    const handler = (server as any)._events.request;
    const req = createMockRequest("POST", "/api/downloads", {
      source: "huggingface",
      runtime: "llamacpp",
      repoId: "test/model",
      filename: "model.Q4_K_M.gguf",
      license: "Apache-2.0",
      licenseAccepted: true
    }, PRIVILEGED_HEADERS);
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(202);
    expect(mockContext.downloads.start).toHaveBeenCalledWith(expect.objectContaining({
      license: "Apache-2.0",
      licenseAccepted: true
    }));
  });

  it("GET /api/routing/standard returns benchmark-aware standard route decision", async () => {
    const mockContext = createMockContext();
    mockContext.store.listBenchmarks = vi.fn().mockReturnValue([
      {
        id: "bench-1",
        model: "phi-3",
        runtime: "llamacpp",
        prompt: "hi",
        firstTokenMs: 90,
        totalMs: 220,
        tokensPerSecond: 80,
        tokenCount: 12,
        ok: true,
        createdAt: new Date(0).toISOString()
      }
    ]);
    const server = createServer(mockContext);
    const handler = (server as any)._events.request;
    const req = createMockRequest("GET", "/api/routing/standard");
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.selected.name).toBe("phi-3");
    expect(parsed.candidates[0].healthy).toBe(true);
  });

  it("POST /v1/embeddings returns stable unsupported response until local embeddings are enabled", async () => {
    const mockContext = createMockContext();
    const server = createServer(mockContext);
    const handler = (server as any)._events.request;
    const req = createMockRequest("POST", "/v1/embeddings", { input: "hello", model: "local" });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(501);
    expect(JSON.parse(res.body).error.type).toBe("not_implemented");
  });

  it("POST /v1/embeddings returns embeddings when a local provider is enabled", async () => {
    const mockContext = createMockContext();
    mockContext.embeddings = Promise.resolve({
      model: "local-test-embed",
      embed: vi.fn().mockResolvedValue({ model: "local-test-embed", vectors: [[1, 0]], tokenEstimate: 1, dimensions: 2 })
    });
    const server = createServer(mockContext);
    const handler = (server as any)._events.request;
    const req = createMockRequest("POST", "/v1/embeddings", { input: "hello", model: "local" });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.object).toBe("list");
    expect(parsed.data[0].embedding).toEqual([1, 0]);
  });

  it("GET and PUT /api/engine/config expose sanitized runtime controls", async () => {
    const mockContext = createMockContext();
    const server = createServer(mockContext);
    const handler = (server as any)._events.request;
    const getReq = createMockRequest("GET", "/api/engine/config");
    const getRes = createMockResponse();

    await handler(getReq, getRes);

    expect(getRes.statusCode).toBe(200);
    expect(JSON.parse(getRes.body).config.backend).toBe("in-process");

    const putReq = createMockRequest(
      "PUT",
      "/api/engine/config",
      { contextSize: 999999, delegatedServer: { parallel: 99 } },
      PRIVILEGED_HEADERS
    );
    const putRes = createMockResponse();

    await handler(putReq, putRes);

    expect(putRes.statusCode).toBe(200);
    expect(JSON.parse(putRes.body).config.contextSize).toBe(32768);
  });

  it("GET /api/engine/server/status exposes delegated server status", async () => {
    const mockContext = createMockContext();
    const server = createServer(mockContext);
    const handler = (server as any)._events.request;
    const req = createMockRequest("GET", "/api/engine/server/status");
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).available).toBe(false);
  });

  it("POST /v1/responses returns and stores OpenAI-style response objects", async () => {
    const mockContext = createMockContext();
    mockContext.engine.loadedModel = "phi-3";
    mockContext.engine.loadedPath = "./models/Phi-3-mini-4k-instruct-q4.gguf";
    mockContext.engine.chat = vi.fn().mockResolvedValue("hi");
    const server = createServer(mockContext);
    const handler = (server as any)._events.request;
    const req = createMockRequest("POST", "/v1/responses", { input: "hello", max_output_tokens: 4 });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.object).toBe("response");
    expect(parsed.output_text).toBe("hi");
    expect(mockContext.store.addResponse).toHaveBeenCalled();
  });

  it("POST /v1/completions supports legacy OpenAI-compatible text completions", async () => {
    const mockContext = createMockContext();
    mockContext.engine.loadedModel = "phi-3";
    mockContext.engine.loadedPath = "./models/Phi-3-mini-4k-instruct-q4.gguf";
    mockContext.engine.chat = vi.fn().mockResolvedValue("legacy text");
    const server = createServer(mockContext);
    const handler = (server as any)._events.request;
    const req = createMockRequest("POST", "/v1/completions", { prompt: "hello", max_tokens: 4 });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.object).toBe("text_completion");
    expect(parsed.choices[0].text).toBe("legacy text");
    expect(mockContext.engine.chat).toHaveBeenCalledWith([{ role: "user", content: "hello" }], expect.objectContaining({ maxTokens: 4 }));
  });

  it("POST /v1/chat/completions rejects unknown model names instead of silently using the loaded model", async () => {
    const mockContext = createMockContext();
    mockContext.engine.loadedModel = "phi-3";
    mockContext.engine.loadedPath = "./models/Phi-3-mini-4k-instruct-q4.gguf";
    const server = createServer(mockContext);
    const handler = (server as any)._events.request;
    const req = createMockRequest("POST", "/v1/chat/completions", {
      model: "missing-model",
      messages: [{ role: "user", content: "hello" }]
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error.type).toBe("model_not_found");
    expect(mockContext.engine.chat).not.toHaveBeenCalled();
  });

  it("POST /api/chat rejects unknown explicit llama.cpp models instead of silently using the loaded model", async () => {
    const mockContext = createMockContext();
    mockContext.engine.loadedModel = "phi-3";
    mockContext.engine.loadedPath = "./models/Phi-3-mini-4k-instruct-q4.gguf";
    const server = createServer(mockContext);
    const handler = (server as any)._events.request;
    const req = createMockRequest("POST", "/api/chat", {
      runtime: "llamacpp",
      model: "missing-model",
      messages: [{ role: "user", content: "hello" }],
      stream: false
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toContain("Model not found locally");
    expect(mockContext.engine.chat).not.toHaveBeenCalled();
  });

  it("POST /api/generate supports Ollama-compatible prompt generation over the local engine", async () => {
    const mockContext = createMockContext();
    const server = createServer(mockContext);
    const handler = (server as any)._events.request;
    const req = createMockRequest("POST", "/api/generate", {
      model: "phi-3",
      prompt: "Hello there",
      stream: false,
      options: { num_predict: 4, temperature: 0.2 }
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(mockContext.engine.load).toHaveBeenCalledWith(expect.objectContaining({ displayName: "phi-3" }));
    expect(mockContext.engine.chat).toHaveBeenCalledWith(
      [{ role: "user", content: "Hello there" }],
      expect.objectContaining({ maxTokens: 4, temperature: 0.2 })
    );
    const parsed = JSON.parse(res.body);
    expect(parsed.response).toBe("Mock response");
    expect(parsed.done).toBe(true);
  });

  it("POST /api/chat auto-routes local GGUF model requests to in-process engine", async () => {
    const mockContext = createMockContext();
    const server = createServer(mockContext);
    const handler = (server as any)._events.request;
    
    // Requesting a local model
    const req = createMockRequest("POST", "/api/chat", {
      model: "phi-3",
      messages: [{ role: "user", content: "Hello there" }],
      stream: false
    });
    const res = createMockResponse();

    await handler(req, res);

    // Should load the model dynamically since it matches a local name
    expect(mockContext.engine.load).toHaveBeenCalledWith(
      expect.objectContaining({
        modelPath: "./models/Phi-3-mini-4k-instruct-q4.gguf",
        displayName: "phi-3"
      })
    );
    expect(mockContext.engine.chat).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.model).toBe("phi-3");
    expect(parsed.message.content).toBe("Mock response");
  });

  it("POST /api/chat honors an explicit Ollama runtime when names overlap local models", async () => {
    const mockContext = createMockContext();
    mockContext.ollama.chat.mockResolvedValue(
      new Response(JSON.stringify({ model: "phi-3", message: { role: "assistant", content: "Ollama response" }, done: true }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    const server = createServer(mockContext);
    const handler = (server as any)._events.request;

    const req = createMockRequest("POST", "/api/chat", {
      runtime: "ollama",
      model: "phi-3",
      messages: [{ role: "user", content: "Hello there" }],
      stream: false
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(mockContext.engine.load).not.toHaveBeenCalled();
    expect(mockContext.ollama.chat).toHaveBeenCalledWith(
      expect.objectContaining({ runtime: "ollama", model: "phi-3" })
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("Ollama response");
  });

  it("POST /api/chat proxies delegated llama-server streams as Ollama NDJSON", async () => {
    const mockContext = createMockContext();
    mockContext.store.getRuntimeConfig = vi.fn().mockReturnValue({
      keepWarm: true,
      unloadAfterIdleMs: 900000,
      contextSize: 4096,
      gpuLayers: "auto",
      threads: "auto",
      backend: "delegated-server",
      residencyMode: "balanced",
      draftModel: null,
      delegatedServer: { enabled: true, port: 8080, parallel: 4, continuousBatching: true },
      hotPool: { enabled: true, maxModels: 2, maxModelBytes: 2_000_000_000, autoWarm: true }
    });
    mockContext.llamaServer.status = vi.fn().mockReturnValue({
      available: true,
      running: true,
      endpoint: "http://127.0.0.1:8080",
      message: "running"
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: [DONE]\n\n', {
        status: 200,
        headers: { "content-type": "text/event-stream" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    try {
      const server = createServer(mockContext);
      const handler = (server as any)._events.request;
      const req = createMockRequest("POST", "/api/chat", {
        runtime: "llamacpp",
        messages: [{ role: "user", content: "Hello there" }],
        stream: true
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(fetchMock).toHaveBeenCalledWith(
        "http://127.0.0.1:8080/v1/chat/completions",
        expect.objectContaining({ method: "POST" })
      );
      expect(res.body).toContain('"content":"hi"');
      expect(res.body).toContain('"done":true');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("POST /api/chat reconfigures and auto-starts delegated llama-server from saved config", async () => {
    const mockContext = createMockContext();
    mockContext.store.getRuntimeConfig = vi.fn().mockReturnValue({
      keepWarm: true,
      unloadAfterIdleMs: 900000,
      contextSize: 4096,
      gpuLayers: "auto",
      threads: "auto",
      backend: "delegated-server",
      residencyMode: "balanced",
      draftModel: null,
      delegatedServer: { enabled: true, port: 8080, parallel: 2, continuousBatching: true },
      hotPool: { enabled: true, maxModels: 2, maxModelBytes: 2_000_000_000, autoWarm: true }
    });
    mockContext.llamaServer.status = vi
      .fn()
      .mockReturnValueOnce({
        available: true,
        running: false,
        endpoint: "http://127.0.0.1:8080",
        message: "binary found"
      })
      .mockReturnValue({
        available: true,
        running: true,
        endpoint: "http://127.0.0.1:8080",
        message: "running"
      });
    mockContext.llamaServer.start = vi.fn().mockResolvedValue({
      available: true,
      running: true,
      endpoint: "http://127.0.0.1:8080",
      message: "started"
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/health")) return new Response("ok", { status: 200 });
      return new Response(JSON.stringify({ choices: [{ message: { content: "hi" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const server = createServer(mockContext);
      const handler = (server as any)._events.request;
      const req = createMockRequest("POST", "/api/chat", {
        runtime: "llamacpp",
        model: "phi-3",
        messages: [{ role: "user", content: "Hello there" }],
        stream: false
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(mockContext.llamaServer.configure).toHaveBeenCalledWith(expect.objectContaining({ port: 8080, parallel: 2 }));
      expect(mockContext.llamaServer.start).toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8080/health", expect.any(Object));
      expect(fetchMock).toHaveBeenCalledWith(
        "http://127.0.0.1:8080/v1/chat/completions",
        expect.objectContaining({ method: "POST" })
      );
      expect(JSON.parse(res.body).message.content).toBe("hi");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("POST /api/chat auto-routes virtual Ternary SSM Specialist model correctly", async () => {
    const mockContext = createMockContext();
    const server = createServer(mockContext);
    const handler = (server as any)._events.request;
    
    const req = createMockRequest("POST", "/api/chat", {
      model: "Ternary-SSM-Specialist",
      messages: [{ role: "user", content: "What is GLA?" }],
      stream: false
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(mockContext.engine.load).toHaveBeenCalledWith(
      expect.objectContaining({
        modelPath: "virtual:ternary-ssm-specialist",
        displayName: "Ternary-SSM-Specialist"
      })
    );
    expect(mockContext.engine.chat).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.model).toBe("Ternary-SSM-Specialist");
    expect(parsed.message.content).toBe("Mock response");
  });

  it("returns client error statuses from request parsing failures", async () => {
    const mockContext = createMockContext();
    const server = createServer(mockContext);
    const handler = (server as any)._events.request;
    const req = createMockRequest("POST", "/api/chat") as any;
    req[Symbol.asyncIterator] = async function* () {
      yield Buffer.from("{bad");
    };
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: "Request body must be valid JSON." });
  });

  it("POST /api/runtimes/llamacpp/load loads Ollama blobs directly without .gguf extension", async () => {
    const mockContext = createMockContext();
    const server = createServer(mockContext);
    const handler = (server as any)._events.request;

    // Stub fs.existsSync to report true for a dummy Ollama blob path
    const mockFs = vi.spyOn(fs, "existsSync").mockReturnValue(true);

    const req = createMockRequest("POST", "/api/runtimes/llamacpp/load", {
      path: "/home/user/.ollama/models/blobs/sha256-11223344556677889900aabbccddeeff"
    }, PRIVILEGED_HEADERS);
    const res = createMockResponse();

    try {
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      const parsed = JSON.parse(res.body);
      expect(parsed.ok).toBe(true);
      expect(parsed.loaded).toBe("sha256-11223344556677889900aabbccddeeff");
    } finally {
      mockFs.mockRestore();
    }
  });

  it("GET /api/server/readiness flags multiRuntimeVramResident warning when multiple runtimes are active", async () => {
    const mockContext = createMockContext();
    mockContext.ollama.status.mockResolvedValue({
      id: "ollama",
      online: true,
      loadedModels: [{ id: "ollama-model", name: "ollama-model", loaded: true, runtime: "ollama" }]
    });
    mockContext.lmstudio.status.mockResolvedValue({
      id: "lmstudio",
      online: true,
      loadedModels: [{ id: "lms-model", name: "lms-model", loaded: true, runtime: "lmstudio" }]
    });

    const server = createServer(mockContext);
    const handler = (server as any)._events.request;
    const req = createMockRequest("GET", "/api/server/readiness");
    const res = createMockResponse();

    await handler(req, res);
    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.multiRuntimeVramResident.active).toBe(true);
    expect(parsed.multiRuntimeVramResident.ollama).toHaveLength(1);
    expect(parsed.multiRuntimeVramResident.lmstudio).toHaveLength(1);
    expect(parsed.warnings.some((w: string) => w.includes("VRAM saturation alert"))).toBe(true);
  });

  it("POST /api/runtimes/evict-all unloads Ollama, LM Studio, and in-process active models", async () => {
    const mockContext = createMockContext();
    mockContext.ollama.ps = vi.fn().mockResolvedValue([{ name: "ollama-model-1" }]);
    mockContext.ollama.unload = vi.fn().mockResolvedValue(undefined);
    mockContext.lmstudio.unload = vi.fn().mockResolvedValue(undefined);
    mockContext.engine.unload = vi.fn().mockResolvedValue(undefined);

    const server = createServer(mockContext);
    const handler = (server as any)._events.request;
    const req = createMockRequest("POST", "/api/runtimes/evict-all", {}, PRIVILEGED_HEADERS);
    const res = createMockResponse();

    await handler(req, res);
    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.ok).toBe(true);
    expect(parsed.ollamaEvicted).toEqual(["ollama-model-1"]);
    expect(parsed.lmstudioEvicted).toEqual(["all"]);
    expect(mockContext.lmstudio.unload).toHaveBeenCalled();
    expect(mockContext.ollama.unload).toHaveBeenCalledWith("ollama-model-1");
    expect(mockContext.engine.unload).toHaveBeenCalled();
  });

  describe("Bilingual / Multilingual GGUF Safety Prompt Guard", () => {
    it("POST /api/chat prepends the default English-only system message if none is provided", async () => {
      const mockContext = createMockContext();
      const server = createServer(mockContext);
      const handler = (server as any)._events.request;
      const req = createMockRequest("POST", "/api/chat", {
        runtime: "llamacpp",
        model: "phi-3",
        messages: [{ role: "user", content: "hi" }],
        stream: false
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(mockContext.engine.chat).toHaveBeenCalledWith(
        [
          { role: "system", content: "You are a helpful assistant. Always respond strictly in English." },
          { role: "user", content: "hi" }
        ],
        expect.any(Object)
      );
    });

    it("POST /api/chat accepts empty system prompt to bypass/disable the guard", async () => {
      const mockContext = createMockContext();
      const server = createServer(mockContext);
      const handler = (server as any)._events.request;
      const req = createMockRequest("POST", "/api/chat", {
        runtime: "llamacpp",
        model: "phi-3",
        messages: [
          { role: "system", content: "" },
          { role: "user", content: "hi" }
        ],
        stream: false
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(mockContext.engine.chat).toHaveBeenCalledWith(
        [
          { role: "system", content: "" },
          { role: "user", content: "hi" }
        ],
        expect.any(Object)
      );
    });

    it("POST /api/chat honors a custom system prompt and does not overwrite it", async () => {
      const mockContext = createMockContext();
      const server = createServer(mockContext);
      const handler = (server as any)._events.request;
      const req = createMockRequest("POST", "/api/chat", {
        runtime: "llamacpp",
        model: "phi-3",
        messages: [
          { role: "system", content: "Always respond in Spanish" },
          { role: "user", content: "hi" }
        ],
        stream: false
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(mockContext.engine.chat).toHaveBeenCalledWith(
        [
          { role: "system", content: "Always respond in Spanish" },
          { role: "user", content: "hi" }
        ],
        expect.any(Object)
      );
    });
  });

  describe("Unsupported Architecture Fallback to Ollama", () => {
    it("POST /api/chat auto-registers and falls back to Ollama when architecture is unsupported and Ollama is online", async () => {
      const mockContext = createMockContext();
      
      // Make phi-3 architecture unsupported for the bundled release
      mockContext.engine.readArchitecture.mockResolvedValue("gemma4");
      // Ollama status is online
      mockContext.ollama.status.mockResolvedValue({ id: "ollama", online: true });
      mockContext.ollama.createModel = vi.fn().mockResolvedValue(undefined);
      
      const upstreamBody = { ok: true, status: 200, headers: new Map([["content-type", "application/json"]]), body: {
        getReader() {
          let count = 0;
          return {
            async read() {
              if (count > 0) return { done: true, value: undefined };
              count++;
              return { done: false, value: new TextEncoder().encode(JSON.stringify({ model: "ht-phi-3", message: { role: "assistant", content: "Ollama fallback content" }, done: true })) };
            }
          };
        }
      } };
      mockContext.ollama.chat.mockResolvedValue(upstreamBody);

      const server = createServer(mockContext);
      const handler = (server as any)._events.request;
      const req = createMockRequest("POST", "/api/chat", {
        runtime: "llamacpp",
        model: "phi-3",
        messages: [{ role: "user", content: "hi" }],
        stream: false
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(mockContext.ollama.createModel).toHaveBeenCalledWith("ht-phi-3", expect.stringContaining("FROM"));
      expect(mockContext.engine.load).toHaveBeenCalledWith(expect.objectContaining({
        modelPath: "virtual:ollama:ht-phi-3"
      }));
      expect(mockContext.ollama.chat).toHaveBeenCalled();
      const parsed = JSON.parse(res.body);
      expect(parsed.message.content).toBe("Ollama fallback content");
    });

    it("POST /api/chat throws 422 error when architecture is unsupported and Ollama is offline", async () => {
      const mockContext = createMockContext();
      
      mockContext.engine.readArchitecture.mockResolvedValue("gemma4");
      mockContext.ollama.status.mockResolvedValue({ id: "ollama", online: false });

      const server = createServer(mockContext);
      const handler = (server as any)._events.request;
      const req = createMockRequest("POST", "/api/chat", {
        runtime: "llamacpp",
        model: "phi-3",
        messages: [{ role: "user", content: "hi" }],
        stream: false
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(422);
      const parsed = JSON.parse(res.body);
      expect(parsed.error).toContain("Model architecture 'gemma4' needs llama.cpp");
    });
  });
});

describe("readJson", () => {
  it("rejects oversized request bodies before parsing", async () => {
    const req = createMockRequest("POST", "/api/chat") as any;
    req[Symbol.asyncIterator] = async function* () {
      yield Buffer.alloc(12, "a");
    };

    await expect(readJson(req, 8)).rejects.toThrow("Request body exceeds 8 bytes.");
  });

  it("reports invalid JSON as a client error", async () => {
    const req = createMockRequest("POST", "/api/chat") as any;
    req[Symbol.asyncIterator] = async function* () {
      yield Buffer.from("{bad");
    };

    await expect(readJson(req)).rejects.toThrow("Request body must be valid JSON.");
  });
});
