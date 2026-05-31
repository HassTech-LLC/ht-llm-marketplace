import { describe, expect, it } from "vitest";
import type { BenchmarkResult, ModelIndexEntry } from "@ht-llm-marketplace/sdk";
import { chooseStandardModel } from "../standard-routing.js";

const now = new Date(0).toISOString();

function model(input: Partial<ModelIndexEntry> & Pick<ModelIndexEntry, "name">): ModelIndexEntry {
  return {
    id: input.id || input.path || input.name,
    name: input.name,
    path: input.path || `C:/models/${input.name}.gguf`,
    sizeBytes: input.sizeBytes ?? 2_000_000_000,
    source: input.source || "local",
    dir: input.dir || "C:/models",
    runnable: input.runnable ?? true,
    indexedAt: input.indexedAt || now
  };
}

function bench(input: Partial<BenchmarkResult> & Pick<BenchmarkResult, "model" | "ok">): BenchmarkResult {
  return {
    id: input.id || `${input.model}-${Math.random()}`,
    model: input.model,
    runtime: "llamacpp",
    prompt: input.prompt || "hi",
    firstTokenMs: input.firstTokenMs ?? 500,
    totalMs: input.totalMs ?? 900,
    tokensPerSecond: input.tokensPerSecond ?? 30,
    tokenCount: input.tokenCount ?? 20,
    ok: input.ok,
    error: input.error,
    createdAt: input.createdAt || now
  };
}

describe("chooseStandardModel", () => {
  it("uses successful benchmarks to choose the fastest healthy physical model", () => {
    const decision = chooseStandardModel(
      [model({ name: "slow", sizeBytes: 1_000_000_000 }), model({ name: "fast", sizeBytes: 5_000_000_000 })],
      [
        bench({ model: "slow", ok: true, firstTokenMs: 900, totalMs: 1200, tokensPerSecond: 20 }),
        bench({ model: "fast", ok: true, firstTokenMs: 120, totalMs: 400, tokensPerSecond: 90 })
      ]
    );

    expect(decision.selected?.name).toBe("fast");
    expect(decision.candidates[0].model.name).toBe("fast");
  });

  it("does not route to a failing model even when it was fast before", () => {
    const decision = chooseStandardModel(
      [model({ name: "flaky" }), model({ name: "steady" })],
      [
        bench({ model: "flaky", ok: false, firstTokenMs: 10, totalMs: 10, tokensPerSecond: 300 }),
        bench({ model: "steady", ok: true, firstTokenMs: 300, totalMs: 700, tokensPerSecond: 40 })
      ]
    );

    expect(decision.selected?.name).toBe("steady");
  });

  it("keeps virtual models as fallback behind physical candidates", () => {
    const decision = chooseStandardModel([
      model({ name: "Ternary-SSM-Specialist", path: "virtual:ternary-ssm-specialist", source: "Virtual-SSM", sizeBytes: 850_000_000 }),
      model({ name: "qwen-local", sizeBytes: 3_000_000_000 })
    ]);

    expect(decision.selected?.name).toBe("qwen-local");
  });
});
