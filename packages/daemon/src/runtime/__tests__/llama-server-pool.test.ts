import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { EngineResidencyPlan, ModelIndexEntry } from "@ht-llm-marketplace/sdk";
import { LlamaServerPool, llamaServerPoolSearchRoots } from "../llama-server-pool.js";

const now = new Date(0).toISOString();

function model(name: string): ModelIndexEntry {
  return {
    id: name,
    name,
    path: `C:/models/${name}.gguf`,
    sizeBytes: 1_000_000_000,
    source: "local",
    dir: "C:/models",
    runnable: true,
    indexedAt: now
  };
}

function plan(models: ModelIndexEntry[]): EngineResidencyPlan {
  return {
    mode: "fast-parallel",
    maxModels: models.length,
    maxModelBytes: 10_000_000_000,
    memory: {
      source: "unavailable",
      totalRamBytes: 0,
      freeRamBytes: 0,
      totalVramBytes: 0,
      freeVramBytes: 0,
      gpuCount: 0,
      notes: []
    },
    selected: models.map((entry) => ({
      model: entry,
      estimatedRamBytes: entry.sizeBytes,
      estimatedVramBytes: entry.sizeBytes,
      eligible: true,
      willFit: true,
      action: "promote",
      reason: "test"
    })),
    skipped: [],
    demoted: [],
    generatedAt: now
  };
}

// Track active managers using mock prefix (hoisted)
const mockCreatedManagers: any[] = [];

// Mock LlamaServerManager as a class inside the factory or hoisted scope
vi.mock("../llama-server.js", () => {
  class MockLlamaServerManager {
    isRunning = false;
    configuredOptions: any = null;

    constructor() {
      mockCreatedManagers.push(this);
    }

    configure = vi.fn().mockImplementation((opts) => {
      this.configuredOptions = opts;
    });

    status = vi.fn().mockImplementation(() => {
      const available = Boolean(this.configuredOptions?.binaryPath);
      return {
        available,
        running: this.isRunning,
        endpoint: this.isRunning ? `http://127.0.0.1:${this.configuredOptions?.port}` : "",
        pid: this.isRunning ? 1234 : undefined,
        message: this.isRunning ? "running" : "stopped"
      };
    });

    start = vi.fn().mockImplementation(async () => {
      this.isRunning = true;
      return { available: true, running: true, endpoint: `http://127.0.0.1:${this.configuredOptions?.port}` };
    });

    stop = vi.fn().mockImplementation(async () => {
      this.isRunning = false;
      return { available: true, running: false, endpoint: "" };
    });
  }

  return {
    llamaServerManagedRoot: (storageDir: string) => `C:/managed/${storageDir}`,
    LlamaServerManager: MockLlamaServerManager
  };
});

describe("LlamaServerPool", () => {
  beforeEach(() => {
    mockCreatedManagers.length = 0;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true })
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("1. allocates deterministic per-model ports and reports unavailable entries without a binary", async () => {
    const pool = new LlamaServerPool();
    const status = await pool.warm(plan([model("a"), model("b")]), {
      basePort: 9100,
      parallel: 2,
      continuousBatching: true,
      searchRoots: [],
      pathEnv: ""
    });

    expect(status.basePort).toBe(9100);
    expect(status.entries.map((entry) => `${entry.model}:${entry.port}:${entry.state}`)).toEqual([
      "a:9100:unavailable",
      "b:9101:unavailable"
    ]);
  });

  it("2. removes entries outside the latest residency plan", async () => {
    const pool = new LlamaServerPool();
    await pool.warm(plan([model("a"), model("b")]), { basePort: 9200, searchRoots: [], pathEnv: "", binaryPath: "/bin" });

    // Wait for async readiness checks to finish
    await new Promise((resolve) => setTimeout(resolve, 10));

    let status = pool.status(true);
    expect(status.entries.map((entry) => entry.model)).toEqual(["a", "b"]);

    // Warm with only b
    status = await pool.warm(plan([model("b")]), { basePort: 9200, searchRoots: [], pathEnv: "", binaryPath: "/bin" });
    expect(status.entries.map((entry) => entry.model)).toEqual(["b"]);
  });

  it("3. endpointForModel(model) returns exact model endpoint when ready", async () => {
    const pool = new LlamaServerPool();
    await pool.warm(plan([model("a"), model("b")]), { basePort: 9300, searchRoots: [], pathEnv: "", binaryPath: "/bin" });

    // Wait for slots to become ready
    await new Promise((resolve) => setTimeout(resolve, 15));

    expect(pool.endpointForModel("a")).toBe("http://127.0.0.1:9300");
    expect(pool.endpointForModel("b")).toBe("http://127.0.0.1:9301");
    expect(pool.endpointForModel("c")).toBeUndefined();
  });

  it("4. endpointForModel(undefined) returns first running endpoint", async () => {
    const pool = new LlamaServerPool();
    await pool.warm(plan([model("a"), model("b")]), { basePort: 9400, searchRoots: [], pathEnv: "", binaryPath: "/bin" });

    // Wait for slots to become ready
    await new Promise((resolve) => setTimeout(resolve, 15));

    expect(pool.endpointForModel(undefined)).toBe("http://127.0.0.1:9400");
    expect(pool.endpointForModel()).toBe("http://127.0.0.1:9400");
  });

  it("5. warm(plan) starts only selected models", async () => {
    const pool = new LlamaServerPool();
    await pool.warm(plan([model("a")]), { basePort: 9500, searchRoots: [], pathEnv: "", binaryPath: "/bin" });

    // Should create exactly one manager
    expect(mockCreatedManagers.length).toBe(1);
    expect(mockCreatedManagers[0].start).toHaveBeenCalled();
  });

  it("6. Existing running slot is reused", async () => {
    const pool = new LlamaServerPool();
    await pool.warm(plan([model("a"), model("b")]), { basePort: 9600, searchRoots: [], pathEnv: "", binaryPath: "/bin" });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mockCreatedManagers.length).toBe(2);

    const firstA = mockCreatedManagers[0];
    const firstB = mockCreatedManagers[1];

    // Warm again with same models
    await pool.warm(plan([model("a"), model("b")]), { basePort: 9600, searchRoots: [], pathEnv: "", binaryPath: "/bin" });

    // Managers should not be stopped or replaced
    expect(firstA.stop).not.toHaveBeenCalled();
    expect(firstB.stop).not.toHaveBeenCalled();
  });

  it("7. Stale/unhealthy slot is replaced (index/port shifts)", async () => {
    const pool = new LlamaServerPool();
    await pool.warm(plan([model("a"), model("b")]), { basePort: 9700, searchRoots: [], pathEnv: "", binaryPath: "/bin" });

    await new Promise((resolve) => setTimeout(resolve, 10));

    const managerA = mockCreatedManagers[0];

    // Warm again, but shift indices (model b is first, model a is second)
    await pool.warm(plan([model("b"), model("a")]), { basePort: 9700, searchRoots: [], pathEnv: "", binaryPath: "/bin" });

    // Since the ports for both models changed, their managers should be stopped and re-allocated
    expect(managerA.stop).toHaveBeenCalled();
  });

  it("8. status(true) includes enabled and entries", async () => {
    const pool = new LlamaServerPool();
    await pool.warm(plan([model("a")]), { basePort: 9800, searchRoots: [], pathEnv: "", binaryPath: "/bin" });

    const status = pool.status(true);
    expect(status.enabled).toBe(true);
    expect(status.basePort).toBe(9800);
    expect(status.entries.length).toBe(1);
    expect(status.entries[0].model).toBe("a");
  });

  it("9. stopAll() stops all processes and empties entries", async () => {
    const pool = new LlamaServerPool();
    await pool.warm(plan([model("a"), model("b")]), { basePort: 9900, searchRoots: [], pathEnv: "", binaryPath: "/bin" });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mockCreatedManagers.length).toBe(2);

    const status = await pool.stopAll(false);
    expect(status.enabled).toBe(false);
    expect(status.entries.length).toBe(0);
    expect(mockCreatedManagers[0].stop).toHaveBeenCalled();
    expect(mockCreatedManagers[1].stop).toHaveBeenCalled();
  });

  it("10. Pool search roots include managed root, cwd, storage, models dir", () => {
    const roots = llamaServerPoolSearchRoots("/my/storage", "/my/cwd", "/my/models");
    expect(roots).toContain("C:/managed//my/storage"); // llamaServerManagedRoot resolved with storageDir
    expect(roots).toContain("/my/cwd");
    expect(roots).toContain("/my/storage");
    expect(roots).toContain("/my/models");
  });
});
