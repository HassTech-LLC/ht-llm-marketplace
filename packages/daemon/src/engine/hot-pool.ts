import type { EngineRuntimeConfig, ModelIndexEntry } from "@ht-llm-marketplace/sdk";
import { LlamaEngine, type EngineChatOptions } from "./llama.js";
import type { ChatMessage } from "./messages.js";

export interface HotPoolEntry {
  model: string;
  path: string;
  source: string;
  sizeBytes: number;
  state: "loading" | "ready" | "failed";
  gpu: string | false;
  loadedAt?: string;
  lastUsedAt?: string;
  error?: string;
}

export interface HotPoolStatus {
  enabled: boolean;
  maxModels: number;
  maxModelBytes: number;
  entries: HotPoolEntry[];
}

interface HotSlot {
  entry: HotPoolEntry;
  engine: LlamaEngine;
  loading?: Promise<void>;
}

export class HotModelPool {
  private readonly slots = new Map<string, HotSlot>();

  status(config: EngineRuntimeConfig): HotPoolStatus {
    return {
      enabled: config.hotPool.enabled,
      maxModels: config.hotPool.maxModels,
      maxModelBytes: config.hotPool.maxModelBytes,
      entries: [...this.slots.values()].map((slot) => ({ ...slot.entry }))
    };
  }

  async warm(models: ModelIndexEntry[], config: EngineRuntimeConfig): Promise<HotPoolStatus> {
    if (!config.hotPool.enabled) return this.status(config);
    const candidates = models
      .filter((model) => model.runnable && !model.path.startsWith("virtual:") && model.sizeBytes <= config.hotPool.maxModelBytes)
      .slice(0, config.hotPool.maxModels);
    for (const model of candidates) {
      await this.ensureLoaded(model, config);
    }
    await this.trim(config);
    return this.status(config);
  }

  has(modelName: string): boolean {
    return Boolean(this.findSlot(modelName)?.entry.state === "ready");
  }

  async chat(modelName: string, messages: ChatMessage[], options: EngineChatOptions = {}) {
    const slot = this.findSlot(modelName);
    if (!slot || slot.entry.state !== "ready") throw new Error(`Hot model is not loaded: ${modelName}`);
    slot.entry.lastUsedAt = new Date().toISOString();
    return slot.engine.chat(messages, options);
  }

  async unloadAll(): Promise<void> {
    const slots = [...this.slots.values()];
    this.slots.clear();
    await Promise.all(slots.map((slot) => slot.engine.unload().catch(() => undefined)));
  }

  private async ensureLoaded(model: ModelIndexEntry, config: EngineRuntimeConfig) {
    const key = normalize(model.name);
    const existing = this.slots.get(key);
    if (existing?.entry.state === "ready") {
      existing.entry.lastUsedAt = new Date().toISOString();
      return;
    }
    if (existing?.loading) return existing.loading;

    const engine = existing?.engine ?? new LlamaEngine();
    const entry: HotPoolEntry = existing?.entry ?? {
      model: model.name,
      path: model.path,
      source: model.source,
      sizeBytes: model.sizeBytes,
      state: "loading",
      gpu: false
    };
    entry.state = "loading";
    entry.error = undefined;
    this.slots.set(key, { engine, entry });

    const loading = engine
      .load({
        modelPath: model.path,
        displayName: model.name,
        contextSize: Math.min(config.contextSize, 2048),
        threads: config.threads === "auto" ? undefined : config.threads,
        gpuLayers: config.gpuLayers === "auto" ? undefined : config.gpuLayers,
        draftModelPath: config.draftModel || undefined
      })
      .then((loaded) => {
        entry.state = "ready";
        entry.gpu = loaded.gpu;
        entry.loadedAt = new Date().toISOString();
        entry.lastUsedAt = entry.loadedAt;
      })
      .catch((error) => {
        entry.state = "failed";
        entry.error = (error as Error).message;
      })
      .finally(() => {
        const slot = this.slots.get(key);
        if (slot) slot.loading = undefined;
      });
    const slot = this.slots.get(key);
    if (slot) slot.loading = loading;
    await loading;
  }

  private async trim(config: EngineRuntimeConfig) {
    const ready = [...this.slots.values()]
      .filter((slot) => slot.entry.state === "ready")
      .sort((a, b) => (a.entry.lastUsedAt || "").localeCompare(b.entry.lastUsedAt || ""));
    const overflow = ready.length - config.hotPool.maxModels;
    if (overflow <= 0) return;
    for (const slot of ready.slice(0, overflow)) {
      this.slots.delete(normalize(slot.entry.model));
      await slot.engine.unload().catch(() => undefined);
    }
  }

  private findSlot(modelName: string) {
    const wanted = normalize(modelName);
    return [...this.slots.values()].find((slot) => {
      return normalize(slot.entry.model) === wanted || normalize(slot.entry.path) === wanted;
    });
  }
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}
