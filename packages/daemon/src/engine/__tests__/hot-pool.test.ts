import { describe, expect, it } from "vitest";
import type { EngineRuntimeConfig, ModelIndexEntry } from "@ht-llm-marketplace/sdk";
import { defaultRuntimeConfig } from "../../runtime/config.js";
import { selectHotPoolCandidates } from "../hot-pool.js";

const now = new Date(0).toISOString();

function model(name: string, sizeBytes: number): ModelIndexEntry {
  return {
    id: name,
    name,
    path: `C:/models/${name}.gguf`,
    sizeBytes,
    source: "local",
    dir: "C:/models",
    runnable: true,
    indexedAt: now
  };
}

function config(input: Partial<EngineRuntimeConfig>): EngineRuntimeConfig {
  return {
    ...defaultRuntimeConfig(),
    ...input,
    hotPool: {
      ...defaultRuntimeConfig().hotPool,
      ...(input.hotPool || {})
    },
    delegatedServer: {
      ...defaultRuntimeConfig().delegatedServer,
      ...(input.delegatedServer || {})
    }
  };
}

describe("selectHotPoolCandidates", () => {
  it("keeps several fast-route models resident in fast parallel mode", () => {
    const selected = selectHotPoolCandidates(
      [model("small-a", 800_000_000), model("small-b", 900_000_000), model("small-c", 1_000_000_000)],
      config({ residencyMode: "fast-parallel", hotPool: { enabled: true, maxModels: 3, maxModelBytes: 2_000_000_000, autoWarm: true } })
    );

    expect(selected.map((entry) => entry.name)).toEqual(["small-a", "small-b", "small-c"]);
  });

  it("selects the largest allowed model in quality single mode", () => {
    const selected = selectHotPoolCandidates(
      [model("fast-small", 800_000_000), model("largest-fit", 12_000_000_000), model("too-large", 28_000_000_000)],
      config({ residencyMode: "quality-single", hotPool: { enabled: true, maxModels: 4, maxModelBytes: 20_000_000_000, autoWarm: true } })
    );

    expect(selected.map((entry) => entry.name)).toEqual(["largest-fit"]);
  });

  it("keeps balanced mode conservative even when max models is higher", () => {
    const selected = selectHotPoolCandidates(
      [model("a", 800_000_000), model("b", 900_000_000), model("c", 1_000_000_000)],
      config({ residencyMode: "balanced", hotPool: { enabled: true, maxModels: 4, maxModelBytes: 2_000_000_000, autoWarm: true } })
    );

    expect(selected.map((entry) => entry.name)).toEqual(["a", "b"]);
  });
});
