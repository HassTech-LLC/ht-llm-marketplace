import type { EngineResidencyPlan, LlamaServerPoolEntry, LlamaServerPoolStatus, ModelIndexEntry } from "@ht-llm-marketplace/sdk";
import { LlamaServerManager, llamaServerManagedRoot, type LlamaServerManagerOptions } from "./llama-server.js";

interface PoolSlot {
  model: ModelIndexEntry;
  port: number;
  manager: LlamaServerManager;
  ready: boolean;
  readinessError?: string;
  readiness?: Promise<void>;
}

export interface LlamaServerPoolOptions extends Pick<LlamaServerManagerOptions, "binaryPath" | "parallel" | "continuousBatching" | "searchRoots" | "pathEnv"> {
  basePort: number;
}

export class LlamaServerPool {
  private readonly slots = new Map<string, PoolSlot>();
  private basePort = 8080;

  status(enabled = false): LlamaServerPoolStatus {
    return {
      enabled,
      basePort: this.basePort,
      entries: [...this.slots.values()].map((slot) => poolEntry(slot))
    };
  }

  endpointForModel(modelName?: string): string | undefined {
    if (!modelName) {
      return [...this.slots.values()].find((slot) => slot.ready && slot.manager.status().running)?.manager.status().endpoint;
    }
    const wanted = normalize(modelName);
    return [...this.slots.values()].find((slot) => {
      const status = slot.manager.status();
      return slot.ready && status.running && (normalize(slot.model.name) === wanted || normalize(slot.model.path) === wanted);
    })?.manager.status().endpoint;
  }

  async warm(plan: EngineResidencyPlan, options: LlamaServerPoolOptions): Promise<LlamaServerPoolStatus> {
    this.basePort = options.basePort;
    const selectedKeys = new Set(plan.selected.map((candidate) => normalize(candidate.model.path || candidate.model.name)));
    for (const slot of [...this.slots.values()]) {
      if (selectedKeys.has(normalize(slot.model.path || slot.model.name))) continue;
      await slot.manager.stop();
      this.slots.delete(normalize(slot.model.path || slot.model.name));
    }

    let index = 0;
    for (const candidate of plan.selected) {
      const model = candidate.model;
      const key = normalize(model.path || model.name);
      const port = options.basePort + index;
      const existing = this.slots.get(key);
      let manager = existing?.manager ?? new LlamaServerManager();
      let slot = existing;
      if (existing && existing.port !== port) {
        await existing.manager.stop();
        manager = new LlamaServerManager();
        slot = undefined;
      }
      manager.configure({
        binaryPath: options.binaryPath,
        modelPath: model.path,
        port,
        parallel: options.parallel,
        continuousBatching: options.continuousBatching,
        searchRoots: options.searchRoots,
        pathEnv: options.pathEnv
      });
      slot = slot ?? { model, port, manager, ready: false };
      slot.model = model;
      slot.port = port;
      slot.manager = manager;
      this.slots.set(key, slot);
      const status = manager.status();
      if (status.available && !status.running) {
        slot.ready = false;
        slot.readinessError = undefined;
        await manager.start();
        this.waitForReadiness(slot);
      } else if (status.running && !slot.ready && !slot.readiness) {
        this.waitForReadiness(slot);
      }
      index += 1;
    }
    return this.status(true);
  }

  async stopAll(enabled = false): Promise<LlamaServerPoolStatus> {
    const slots = [...this.slots.values()];
    this.slots.clear();
    await Promise.all(slots.map((slot) => slot.manager.stop().catch(() => undefined)));
    return this.status(enabled);
  }

  private waitForReadiness(slot: PoolSlot) {
    const status = slot.manager.status();
    if (!status.endpoint || !status.running) return;
    const expectedPid = status.pid;
    slot.readiness =
      waitForEndpointHealth(status.endpoint, () => {
        const current = slot.manager.status();
        return Boolean(current.running && current.pid === expectedPid);
      })
        .then(() => {
          const current = slot.manager.status();
          if (current.running && current.pid === expectedPid) {
            slot.ready = true;
            slot.readinessError = undefined;
          }
        })
        .catch((error: unknown) => {
          slot.ready = false;
          slot.readinessError = error instanceof Error ? error.message : String(error);
        })
        .finally(() => {
          slot.readiness = undefined;
        });
  }
}

export function llamaServerPoolSearchRoots(storageDir: string, cwd = process.cwd(), modelsDir?: string) {
  return [llamaServerManagedRoot(storageDir), cwd, storageDir, ...(modelsDir ? [modelsDir] : [])];
}

function poolEntry(slot: PoolSlot): LlamaServerPoolEntry {
  const status = slot.manager.status();
  const state = status.running ? (slot.ready ? "running" : "starting") : status.available ? "stopped" : "unavailable";
  return {
    model: slot.model.name,
    path: slot.model.path,
    port: slot.port,
    endpoint: status.endpoint,
    state,
    pid: status.pid,
    message: slot.readinessError || status.message
  };
}

async function waitForEndpointHealth(endpoint: string, stillCurrent: () => boolean, timeoutMs = 90_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (!stillCurrent()) throw new Error("llama-server process exited before becoming healthy.");
    try {
      const response = await fetch(`${endpoint}/health`, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
    } catch {
      // llama-server is still loading the model or binding the port.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`llama-server did not become healthy within ${timeoutMs}ms.`);
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}
