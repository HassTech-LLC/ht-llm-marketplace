import type { EngineRuntimeConfig } from "@ht-llm-marketplace/sdk";

export function defaultRuntimeConfig(): EngineRuntimeConfig {
  return {
    keepWarm: true,
    unloadAfterIdleMs: 900_000,
    contextSize: 4096,
    gpuLayers: "auto",
    threads: "auto",
    backend: "in-process",
    draftModel: null,
    delegatedServer: {
      enabled: false,
      port: 8080,
      parallel: 4,
      continuousBatching: true
    },
    hotPool: {
      enabled: true,
      maxModels: 2,
      maxModelBytes: 2_000_000_000,
      autoWarm: true
    }
  };
}

export function sanitizeRuntimeConfig(
  input: Partial<EngineRuntimeConfig> | unknown,
  options: { knownModelPaths?: string[] } = {}
): EngineRuntimeConfig {
  const current = defaultRuntimeConfig();
  const source = isObject(input) ? input : {};
  const delegatedInput = isObject(source.delegatedServer) ? source.delegatedServer : {};
  const hotPoolInput = isObject(source.hotPool) ? source.hotPool : {};
  const draftModel = typeof source.draftModel === "string" && source.draftModel.trim() ? source.draftModel.trim() : null;
  if (draftModel && options.knownModelPaths && !options.knownModelPaths.includes(draftModel)) {
    throw new Error("Draft model is not in the local model index");
  }
  return {
    keepWarm: typeof source.keepWarm === "boolean" ? source.keepWarm : current.keepWarm,
    unloadAfterIdleMs: clampNumber(source.unloadAfterIdleMs, 60_000, 86_400_000, current.unloadAfterIdleMs),
    contextSize: clampNumber(source.contextSize, 512, 32_768, current.contextSize),
    gpuLayers: source.gpuLayers === "auto" ? "auto" : clampNumber(source.gpuLayers, 0, 999, "auto"),
    threads: source.threads === "auto" ? "auto" : clampNumber(source.threads, 1, 64, "auto"),
    backend: source.backend === "delegated-server" ? "delegated-server" : "in-process",
    draftModel,
    delegatedServer: {
      enabled: Boolean(delegatedInput.enabled),
      port: clampNumber(delegatedInput.port, 1024, 65_535, current.delegatedServer.port),
      parallel: clampNumber(delegatedInput.parallel, 1, 16, current.delegatedServer.parallel),
      continuousBatching: delegatedInput.continuousBatching !== false
    },
    hotPool: {
      enabled: hotPoolInput.enabled !== false,
      maxModels: clampNumber(hotPoolInput.maxModels, 1, 4, current.hotPool.maxModels),
      maxModelBytes: clampNumber(hotPoolInput.maxModelBytes, 100_000_000, 20_000_000_000, current.hotPool.maxModelBytes),
      autoWarm: hotPoolInput.autoWarm !== false
    }
  };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number;
function clampNumber(value: unknown, min: number, max: number, fallback: "auto"): number | "auto";
function clampNumber(value: unknown, min: number, max: number, fallback: number | "auto") {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
