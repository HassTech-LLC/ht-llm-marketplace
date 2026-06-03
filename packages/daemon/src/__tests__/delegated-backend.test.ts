import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { delegatedBackend, type RuntimeContext } from "../server.js";
import { planResidency } from "../runtime/residency.js";

// Mock planResidency since it is used inside residencyPlanForContext
vi.mock("../runtime/residency.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../runtime/residency.js")>();
  return {
    ...actual,
    planResidency: vi.fn().mockReturnValue({ selected: [], plan: [], memory: { source: "test" } })
  };
});

describe("delegatedBackend Unit Coverage", () => {
  let mockContext: any;
  let runningState = false;

  beforeEach(() => {
    runningState = false;
    mockContext = {
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
        setArtifactVerification: vi.fn(),
        listBenchmarks: vi.fn().mockReturnValue([]),
        addBenchmark: vi.fn(),
        addResponse: vi.fn(),
        getResponse: vi.fn(),
        getRuntimeConfig: vi.fn().mockReturnValue({
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
        }),
        setRuntimeConfig: vi.fn()
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
        start: vi.fn()
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
          }
        ]),
        refresh: vi.fn().mockResolvedValue({
          status: { state: "ready", ttlMs: 30000, modelCount: 1 },
          models: []
        }),
        status: vi.fn().mockReturnValue({ state: "ready", ttlMs: 30000, modelCount: 1 })
      },
      llamaServer: {
        configure: vi.fn(),
        status: vi.fn().mockImplementation(() => ({
          available: true,
          running: runningState,
          endpoint: runningState ? "http://127.0.0.1:8080" : "",
          message: runningState ? "running" : "stopped"
        })),
        start: vi.fn().mockImplementation(async () => {
          runningState = true;
          return { available: true, running: true, endpoint: "http://127.0.0.1:8080", message: "started" };
        }),
        stop: vi.fn().mockImplementation(async () => {
          runningState = false;
          return { available: true, running: false, endpoint: "", message: "stopped" };
        })
      },
      llamaServerPool: {
        status: vi.fn().mockReturnValue({ enabled: true, basePort: 8080, entries: [] }),
        endpointForModel: vi.fn().mockReturnValue(undefined),
        warm: vi.fn().mockResolvedValue({ enabled: true, basePort: 8080, entries: [] }),
        stopAll: vi.fn()
      },
      hotPool: {
        status: vi.fn().mockReturnValue({ entries: [] })
      },
      engine: {
        loadedPath: undefined
      }
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("1. Backend disabled: returns undefined when engine/delegatedServer is disabled", async () => {
    mockContext.store.getRuntimeConfig.mockReturnValue({
      backend: "in-process",
      delegatedServer: { enabled: false }
    });

    const res = await delegatedBackend(mockContext);
    expect(res).toBeUndefined();
  });

  it("2. Pooled endpoint exists: returns pool endpoint immediately", async () => {
    mockContext.llamaServerPool.endpointForModel.mockReturnValue("http://127.0.0.1:8081");

    const res = await delegatedBackend(mockContext, { model: "phi-3" });
    expect(res).toEqual({ endpoint: "http://127.0.0.1:8081" });
    expect(mockContext.llamaServer.configure).not.toHaveBeenCalled();
  });

  it("3. Single server already running: returns single endpoint and does not warm pool", async () => {
    runningState = true;

    const res = await delegatedBackend(mockContext);
    expect(res).toEqual({ endpoint: "http://127.0.0.1:8080" });
    expect(mockContext.llamaServerPool.warm).not.toHaveBeenCalled();
  });

  it("4. No pool, no single server, available binary: starts single server and waits for health", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    mockContext.llamaServerPool.status.mockReturnValue({ enabled: true, entries: [] });

    const res = await delegatedBackend(mockContext);
    expect(res).toEqual({ endpoint: "http://127.0.0.1:8080" });
    expect(mockContext.llamaServer.start).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8080/health", expect.any(Object));
  });

  it("5. Started single server fails health: returns 503 with timeout message", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("Timeout/Connection refused"));
    vi.stubGlobal("fetch", fetchMock);

    mockContext.llamaServerPool.status.mockReturnValue({ enabled: true, entries: [] });

    // Jump Date.now to fail the loop quickly on second try
    let dateCalls = 0;
    const dateSpy = vi.spyOn(Date, "now").mockImplementation(() => {
      dateCalls++;
      return dateCalls > 1 ? 1000000 : 1000;
    });

    const setTimeoutSpy = vi.spyOn(global, "setTimeout").mockImplementation((fn: any) => {
      fn();
      return 0 as any;
    });

    try {
      const res = await delegatedBackend(mockContext);
      expect(res).toEqual(expect.objectContaining({
        status: 503,
        message: expect.stringContaining("did not become healthy in time")
      }));
    } finally {
      dateSpy.mockRestore();
      setTimeoutSpy.mockRestore();
    }
  });

  it("6. Pool warm returns running endpoint: returns pool endpoint", async () => {
    mockContext.llamaServerPool.status
      .mockReturnValueOnce({ enabled: true, entries: [] })
      .mockReturnValue({
        enabled: true,
        entries: [{ model: "phi-3", endpoint: "http://127.0.0.1:8085", state: "running" }]
      });
    mockContext.llamaServerPool.endpointForModel.mockReturnValue("http://127.0.0.1:8085");

    const res = await delegatedBackend(mockContext, { model: "phi-3" });
    expect(res).toEqual({ endpoint: "http://127.0.0.1:8085" });
  });

  it("7. Pool warm has starting entries: waits for pool endpoint", async () => {
    mockContext.llamaServerPool.status.mockReturnValue({
      enabled: true,
      entries: [{ model: "phi-3", endpoint: "http://127.0.0.1:8085", state: "starting" }]
    });

    let calls = 0;
    mockContext.llamaServerPool.endpointForModel = vi.fn().mockImplementation(() => {
      calls++;
      return calls > 1 ? "http://127.0.0.1:8085" : undefined;
    });

    const setTimeoutSpy = vi.spyOn(global, "setTimeout").mockImplementation((fn: any) => {
      fn();
      return 0 as any;
    });

    try {
      const res = await delegatedBackend(mockContext, { model: "phi-3" });
      expect(res).toEqual({ endpoint: "http://127.0.0.1:8085" });
      expect(calls).toBeGreaterThan(1);
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });

  it("8. Pool stays starting past timeout: returns 503", async () => {
    mockContext.llamaServerPool.status.mockReturnValue({
      enabled: true,
      entries: [{ model: "phi-3", endpoint: "http://127.0.0.1:8085", state: "starting" }]
    });
    mockContext.llamaServerPool.endpointForModel.mockReturnValue(undefined);

    let now = 1000;
    const dateSpy = vi.spyOn(Date, "now").mockImplementation(() => {
      now += 150000; // Increment past 90_000ms
      return now;
    });

    const setTimeoutSpy = vi.spyOn(global, "setTimeout").mockImplementation((fn: any) => {
      fn();
      return 0 as any;
    });

    try {
      const res = await delegatedBackend(mockContext, { model: "phi-3" });
      expect(res).toEqual(expect.objectContaining({
        status: 503,
        message: expect.stringContaining("did not become healthy in time")
      }));
    } finally {
      dateSpy.mockRestore();
      setTimeoutSpy.mockRestore();
    }
  });

  it("9. Pool finishes with no endpoint: falls back to single-server path", async () => {
    mockContext.llamaServerPool.status.mockReturnValue({ enabled: true, entries: [] });

    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await delegatedBackend(mockContext);
    expect(res).toEqual({ endpoint: "http://127.0.0.1:8080" });
    expect(mockContext.llamaServer.start).toHaveBeenCalled();
  });

  it("10. autoStart: false prevents warm/start and only uses already-running endpoints", async () => {
    mockContext.llamaServer.status.mockImplementation(() => ({
      available: true,
      running: false,
      endpoint: "",
      message: "stopped"
    }));

    const res = await delegatedBackend(mockContext, { autoStart: false });
    expect(res).toEqual(expect.objectContaining({
      status: 503,
      message: expect.stringContaining("no server is running")
    }));
    expect(mockContext.llamaServer.start).not.toHaveBeenCalled();
    expect(mockContext.llamaServerPool.warm).not.toHaveBeenCalled();
  });
});
