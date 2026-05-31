import type { DiscoveredModel } from "@ht-llm-marketplace/sdk";
import { discoverGgufModels, type ModelRoot } from "./discover.js";

export interface ModelIndexEntry extends DiscoveredModel {
  id: string;
  runnable: boolean;
  indexedAt: string;
}

export interface ModelIndexStatus {
  state: "cold" | "ready" | "refreshing" | "stale";
  ttlMs: number;
  modelCount: number;
  refreshedAt?: string;
  refreshingSince?: string;
  lastError?: string;
}

export interface ModelIndexSnapshot {
  status: ModelIndexStatus;
  models: ModelIndexEntry[];
}

const VIRTUAL_MODEL: Omit<ModelIndexEntry, "indexedAt"> = {
  id: "virtual:ternary-ssm-specialist",
  name: "Ternary-SSM-Specialist",
  path: "virtual:ternary-ssm-specialist",
  sizeBytes: 850000000,
  source: "Virtual-SSM",
  dir: "virtual-core",
  runnable: true
};

export class ModelIndex {
  private entries: ModelIndexEntry[] = [];
  private refreshedAtMs = 0;
  private refreshingSinceMs = 0;
  private lastError?: string;
  private pending?: Promise<ModelIndexSnapshot>;

  constructor(
    private readonly rootsProvider: () => ModelRoot[],
    private readonly options: { ttlMs?: number; maxFiles?: number } = {}
  ) {}

  snapshot(): ModelIndexSnapshot {
    return {
      status: this.status(),
      models: [...this.entries]
    };
  }

  async models(): Promise<ModelIndexEntry[]> {
    if (this.entries.length === 0) {
      return (await this.refresh("cold-start")).models;
    }
    if (this.isExpired() && !this.pending) {
      void this.refresh("ttl");
    }
    return [...this.entries];
  }

  async refresh(_reason = "manual"): Promise<ModelIndexSnapshot> {
    if (this.pending) return this.pending;
    this.refreshingSinceMs = Date.now();
    this.pending = Promise.resolve()
      .then(() => {
        const indexedAt = new Date().toISOString();
        const discovered = discoverGgufModels(this.rootsProvider(), {
          maxFiles: this.options.maxFiles ?? 800
        }).map((model) => ({
          ...model,
          id: model.path,
          runnable: true,
          indexedAt
        }));
        this.entries = [{ ...VIRTUAL_MODEL, indexedAt }, ...dedupe(discovered)];
        this.refreshedAtMs = Date.now();
        this.lastError = undefined;
        this.refreshingSinceMs = 0;
        return this.snapshot();
      })
      .catch((error) => {
        this.lastError = (error as Error).message;
        if (this.entries.length > 0) return this.snapshot();
        throw error;
      })
      .finally(() => {
        this.refreshingSinceMs = 0;
        this.pending = undefined;
      });
    return this.pending;
  }

  resolveByName(name?: string): ModelIndexEntry | undefined {
    if (!name) return undefined;
    const lowered = name.toLowerCase();
    return this.entries.find((model) => model.name.toLowerCase() === lowered || model.path.toLowerCase() === lowered);
  }

  status(): ModelIndexStatus {
    const now = Date.now();
    const refreshing = this.refreshingSinceMs > 0;
    const state = refreshing
      ? "refreshing"
      : this.entries.length === 0
        ? "cold"
        : this.isExpired(now)
          ? "stale"
          : "ready";
    return {
      state,
      ttlMs: this.ttlMs,
      modelCount: this.entries.length,
      refreshedAt: this.refreshedAtMs ? new Date(this.refreshedAtMs).toISOString() : undefined,
      refreshingSince: refreshing ? new Date(this.refreshingSinceMs).toISOString() : undefined,
      lastError: this.lastError
    };
  }

  private isExpired(now = Date.now()) {
    return !this.refreshedAtMs || now - this.refreshedAtMs > this.ttlMs;
  }

  private get ttlMs() {
    return this.options.ttlMs ?? 30_000;
  }
}

function dedupe(models: ModelIndexEntry[]) {
  const seen = new Set<string>();
  const result: ModelIndexEntry[] = [];
  for (const model of models) {
    const key = model.path.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(model);
  }
  return result;
}
