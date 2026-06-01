import { describe, expect, it } from "vitest";
import type { EngineResidencyPlan, ModelIndexEntry } from "@ht-llm-marketplace/sdk";
import { LlamaServerPool } from "../llama-server-pool.js";

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

describe("LlamaServerPool", () => {
  it("allocates deterministic per-model ports and reports unavailable entries without a binary", async () => {
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

  it("removes entries outside the latest residency plan", async () => {
    const pool = new LlamaServerPool();
    await pool.warm(plan([model("a"), model("b")]), { basePort: 9200, searchRoots: [], pathEnv: "" });
    const status = await pool.warm(plan([model("b")]), { basePort: 9200, searchRoots: [], pathEnv: "" });

    expect(status.entries.map((entry) => entry.model)).toEqual(["b"]);
  });
});
