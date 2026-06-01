import { describe, expect, it } from "vitest";
import type { EngineRuntimeConfig, ModelIndexEntry, SystemScan } from "@ht-llm-marketplace/sdk";
import { defaultRuntimeConfig } from "../config.js";
import { memorySnapshotFromSystemScan, planResidency } from "../residency.js";

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

function scan(totalVramBytes: number): SystemScan {
  return {
    os: {
      platform: "win32",
      arch: "x64",
      cpuCount: 16,
      totalMemoryBytes: 64 * 1024 ** 3,
      freeMemoryBytes: 48 * 1024 ** 3
    },
    disk: { modelsBytes: 0 },
    gpus: [
      {
        name: "test gpu",
        memoryTotalBytes: totalVramBytes,
        memoryFreeBytes: totalVramBytes / 2
      }
    ],
    runtimes: [],
    notes: [],
    scannedAt: now
  };
}

describe("runtime residency planner", () => {
  it("summarizes RAM and VRAM from system scan data", () => {
    const snapshot = memorySnapshotFromSystemScan(scan(16 * 1024 ** 3));
    expect(snapshot.gpuCount).toBe(1);
    expect(snapshot.totalVramBytes).toBe(16 * 1024 ** 3);
    expect(snapshot.freeVramBytes).toBe(8 * 1024 ** 3);
  });

  it("selects the largest fitting model for quality single mode", () => {
    const plan = planResidency(
      [model("small", 2 * 1024 ** 3), model("large-fit", 9 * 1024 ** 3), model("too-large", 20 * 1024 ** 3)],
      config({
        residencyMode: "quality-single",
        contextSize: 1024,
        hotPool: { enabled: true, maxModels: 4, maxModelBytes: 32 * 1024 ** 3, autoWarm: true }
      }),
      [],
      scan(16 * 1024 ** 3)
    );

    expect(plan.selected.map((candidate) => candidate.model.name)).toEqual(["large-fit"]);
    expect(plan.skipped.map((candidate) => candidate.model.name)).toContain("too-large");
  });

  it("marks non-selected ready entries for demotion in quality mode", () => {
    const plan = planResidency(
      [model("new-large", 8 * 1024 ** 3)],
      config({
        residencyMode: "quality-single",
        contextSize: 1024,
        hotPool: { enabled: true, maxModels: 4, maxModelBytes: 16 * 1024 ** 3, autoWarm: true }
      }),
      [
        {
          model: "old-small",
          path: "C:/models/old-small.gguf",
          source: "local",
          sizeBytes: 2 * 1024 ** 3,
          state: "ready",
          gpu: "vulkan"
        }
      ],
      scan(16 * 1024 ** 3)
    );

    expect(plan.selected.map((candidate) => candidate.model.name)).toEqual(["new-large"]);
    expect(plan.demoted.map((candidate) => candidate.model.name)).toEqual(["old-small"]);
  });
});
