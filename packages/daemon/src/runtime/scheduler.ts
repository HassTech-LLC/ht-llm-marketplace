import { randomUUID } from "node:crypto";
import type { QueueEntry, QueueStatus } from "@ht-llm-marketplace/sdk";

interface QueueWork<T> {
  key: string;
  entry: QueueEntry;
  controller: AbortController;
  work: (signal: AbortSignal, id: string) => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
  timeout?: ReturnType<typeof setTimeout>;
}

export class GenerationScheduler {
  private readonly running = new Map<string, QueueWork<unknown>>();
  private readonly queued: QueueWork<unknown>[] = [];
  private readonly recent: QueueEntry[] = [];

  run<T>(
    key: string,
    work: (signal: AbortSignal, id: string) => Promise<T>,
    options: { signal?: AbortSignal; timeoutMs?: number; label?: string } = {}
  ): Promise<T> {
    const entry: QueueEntry = {
      id: randomUUID(),
      label: options.label || key,
      state: "queued",
      queuedAt: new Date().toISOString()
    };
    const controller = new AbortController();
    if (options.signal) {
      if (options.signal.aborted) controller.abort();
      else options.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
    return new Promise<T>((resolve, reject) => {
      const item: QueueWork<T> = { key, entry, controller, work, resolve, reject };
      if (options.timeoutMs && options.timeoutMs > 0) {
        item.timeout = setTimeout(() => controller.abort(), options.timeoutMs);
      }
      this.queued.push(item as QueueWork<unknown>);
      this.pump();
    });
  }

  cancel(id: string): boolean {
    const queuedIndex = this.queued.findIndex((item) => item.entry.id === id);
    if (queuedIndex !== -1) {
      const [item] = this.queued.splice(queuedIndex, 1);
      item.entry.state = "cancelled";
      item.entry.finishedAt = new Date().toISOString();
      item.controller.abort();
      if (item.timeout) clearTimeout(item.timeout);
      item.reject(new Error("Generation cancelled before it started."));
      this.remember(item.entry);
      return true;
    }
    const running = [...this.running.values()].find((item) => item.entry.id === id);
    if (running) {
      running.controller.abort();
      return true;
    }
    return false;
  }

  status(): QueueStatus {
    const runningItems = [...this.running.values()].map((item) => ({ ...item.entry }));
    return {
      running: runningItems[0],
      runningItems,
      queued: this.queued.map((item) => ({ ...item.entry })),
      recent: this.recent.map((entry) => ({ ...entry }))
    };
  }

  private pump() {
    for (let index = 0; index < this.queued.length; index += 1) {
      const item = this.queued[index];
      if (this.running.has(item.key)) continue;
      this.queued.splice(index, 1);
      index -= 1;
      this.start(item);
    }
  }

  private start(item: QueueWork<unknown>) {
    this.running.set(item.key, item);
    item.entry.state = "running";
    item.entry.startedAt = new Date().toISOString();
    void item
      .work(item.controller.signal, item.entry.id)
      .then((value) => {
        item.entry.state = item.controller.signal.aborted ? "cancelled" : "completed";
        item.entry.finishedAt = new Date().toISOString();
        item.resolve(value);
      })
      .catch((error) => {
        item.entry.state = item.controller.signal.aborted ? "cancelled" : "failed";
        item.entry.error = item.controller.signal.aborted ? "Generation cancelled." : (error as Error).message;
        item.entry.finishedAt = new Date().toISOString();
        item.reject(error);
      })
      .finally(() => {
        if (item.timeout) clearTimeout(item.timeout);
        this.remember(item.entry);
        this.running.delete(item.key);
        this.pump();
      });
  }

  private remember(entry: QueueEntry) {
    this.recent.unshift({ ...entry });
    this.recent.splice(20);
  }
}
