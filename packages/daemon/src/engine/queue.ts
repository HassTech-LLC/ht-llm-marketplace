import { GenerationScheduler } from "../runtime/scheduler.js";

export class GenerationQueue extends GenerationScheduler {
  override run<T>(
    label: string,
    work: (signal: AbortSignal, id: string) => Promise<T>,
    options: { signal?: AbortSignal; timeoutMs?: number } = {}
  ): Promise<T> {
    return super.run("global", work, { ...options, label });
  }
}
