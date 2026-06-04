import type { EngineResidencyPlan, EngineRuntimeConfig, ModelIndexEntry, SystemScan } from "@ht-llm-marketplace/sdk";
import { LlamaEngine, type EngineChatOptions } from "./llama.js";
import type { ChatMessage } from "./messages.js";
import { planResidency } from "../runtime/residency.js";

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
  residencyMode: EngineRuntimeConfig["residencyMode"];
  residencyPlan?: EngineResidencyPlan;
  entries: HotPoolEntry[];
}

interface HotSlot {
  entry: HotPoolEntry;
  engine: LlamaEngine;
  loading?: Promise<void>;
}

export class HotModelPool {
  private readonly slots = new Map<string, HotSlot>();
  private lastPlan?: EngineResidencyPlan;

  status(config: EngineRuntimeConfig): HotPoolStatus {
    return {
      enabled: config.hotPool.enabled,
      maxModels: config.hotPool.maxModels,
      maxModelBytes: config.hotPool.maxModelBytes,
      residencyMode: config.residencyMode,
      residencyPlan: this.lastPlan,
      entries: [...this.slots.values()].map((slot) => ({ ...slot.entry }))
    };
  }

  async warm(
    models: ModelIndexEntry[],
    config: EngineRuntimeConfig,
    scan?: SystemScan,
    residencyPlan?: EngineResidencyPlan
  ): Promise<HotPoolStatus> {
    if (!config.hotPool.enabled) return this.status(config);
    this.lastPlan = residencyPlan ?? planResidency(models, config, this.status(config).entries, scan);
    if (config.residencyMode === "quality-single") {
      await this.unloadUnselected(this.lastPlan.selected.map((candidate) => candidate.model));
    }
    const candidates = this.lastPlan.selected.map((candidate) => candidate.model);
    for (const model of candidates) {
      await this.ensureLoaded(model, config);
    }
    await this.trim(config);
    return this.status(config);
  }

  private async unloadUnselected(selectedModels: ModelIndexEntry[]) {
    const selected = new Set(selectedModels.map((model) => normalize(model.name)));
    for (const slot of [...this.slots.values()]) {
      if (slot.entry.state !== "ready" || selected.has(normalize(slot.entry.model))) continue;
      this.slots.delete(normalize(slot.entry.model));
      await slot.engine.unload().catch(() => undefined);
    }
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
        contextSize: config.contextSize,
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

export function selectHotPoolCandidates(models: ModelIndexEntry[], config: EngineRuntimeConfig): ModelIndexEntry[] {
  return planResidency(models, config).selected.map((candidate) => candidate.model);
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}
