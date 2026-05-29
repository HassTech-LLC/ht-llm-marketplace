import path from "node:path";
import type { RuntimeModel, RuntimeStatus } from "@ht-llm-marketplace/sdk";
import { planChat, type ChatMessage } from "./messages.js";

// Minimal structural types for the slice of `node-llama-cpp` we use. We keep our
// own interfaces (instead of importing the package's types directly) so the
// daemon compiles and the engine stays unit-testable even when the native
// binary is not installed. The real module is cast to this shape at load time.
export interface LlamaChatSessionLike {
  prompt(
    text: string,
    options?: {
      onTextChunk?: (chunk: string) => void;
      signal?: AbortSignal;
      stopOnAbortSignal?: boolean;
      temperature?: number;
      topK?: number;
      topP?: number;
    }
  ): Promise<string>;
}

export interface ContextLike {
  getSequence(): unknown;
}

export interface ModelLike {
  createContext(): Promise<ContextLike>;
  dispose(): Promise<void>;
}

export interface LlamaLike {
  gpu: string | false;
  loadModel(options: { modelPath: string; gpuLayers?: number }): Promise<ModelLike>;
}

export interface LlamaModuleLike {
  getLlama(options?: "lastBuild" | { gpu?: string | false }): Promise<LlamaLike>;
  LlamaChatSession: new (options: { contextSequence: unknown; systemPrompt?: string }) => LlamaChatSessionLike;
}

export type LlamaModuleLoader = () => Promise<LlamaModuleLike>;

export interface LlamaEngineOptions {
  loader?: LlamaModuleLoader;
}

export interface LoadModelOptions {
  modelPath: string;
  displayName?: string;
  systemPrompt?: string;
  gpuLayers?: number;
}

export interface EngineChatOptions {
  onToken?: (chunk: string) => void;
  signal?: AbortSignal;
  temperature?: number;
}

const defaultLoader: LlamaModuleLoader = async () =>
  // The package may be absent in minimal installs; resolved dynamically so the
  // daemon still boots and reports the engine as unavailable instead of crashing.
  (await import("node-llama-cpp")) as unknown as LlamaModuleLike;

/**
 * Dispose a model, but never block longer than `timeoutMs` — node-llama-cpp's
 * native dispose can hang on some GPU backends, and we must not wedge the engine.
 */
async function disposeWithTimeout(model: ModelLike, timeoutMs = 8000): Promise<void> {
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    (timer as { unref?: () => void }).unref?.();
    Promise.resolve(model.dispose())
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(timer);
        finish();
      });
  });
}

/**
 * In-process llama.cpp inference engine. Lets the daemon load and run GGUF
 * models itself, with no dependency on Ollama or LM Studio being installed.
 */
export class LlamaEngine {
  readonly id = "llamacpp" as const;

  private readonly loader: LlamaModuleLoader;
  private module?: LlamaModuleLike;
  private llama?: LlamaLike;
  private model?: ModelLike;
  private session?: LlamaChatSessionLike;
  private loadedPathValue?: string;
  private loadedName?: string;
  private systemPrompt?: string;

  available = false;
  gpu: string | false = false;
  lastError?: string;
  private busy = false;

  constructor(options: LlamaEngineOptions = {}) {
    this.loader = options.loader ?? defaultLoader;
  }

  /** Attempt to initialize the native binding once, recording availability. */
  async probe(): Promise<{ available: boolean; gpu: string | false; error?: string }> {
    try {
      await this.ensureLlama();
    } catch (error) {
      this.available = false;
      this.lastError = (error as Error).message;
    }
    return { available: this.available, gpu: this.gpu, error: this.lastError };
  }

  isLoaded(modelPath?: string): boolean {
    if (!this.session) return false;
    if (!modelPath) return true;
    return this.normalize(modelPath) === this.normalize(this.loadedPathValue || "");
  }

  get loadedModel(): string | undefined {
    return this.loadedName;
  }

  get loadedPath(): string | undefined {
    return this.loadedPathValue;
  }

  async load(options: LoadModelOptions): Promise<{ loaded: string; gpu: string | false }> {
    const module = await this.ensureModule();
    const llama = await this.ensureLlama();

    // Load the new model BEFORE dropping the current one, so a failed load
    // (e.g. an unsupported architecture) leaves the working model intact.
    const nextModel = await llama.loadModel({ modelPath: options.modelPath, gpuLayers: options.gpuLayers });
    const context = await nextModel.createContext();
    const nextSession = new module.LlamaChatSession({
      contextSequence: context.getSequence(),
      systemPrompt: options.systemPrompt
    });

    const previousModel = this.model;
    this.model = nextModel;
    this.session = nextSession;
    this.loadedPathValue = options.modelPath;
    this.loadedName = options.displayName || path.basename(options.modelPath);
    this.systemPrompt = options.systemPrompt;

    if (previousModel) await disposeWithTimeout(previousModel);

    return { loaded: this.loadedName, gpu: this.gpu };
  }

  async unload(timeoutMs = 8000): Promise<void> {
    const model = this.model;
    // Clear references up front so the engine immediately reports "unloaded"
    // and a slow/hanging native dispose can never wedge the next load.
    this.model = undefined;
    this.session = undefined;
    this.loadedPathValue = undefined;
    this.loadedName = undefined;
    this.systemPrompt = undefined;
    if (model) await disposeWithTimeout(model, timeoutMs);
  }

  async chat(messages: ChatMessage[], options: EngineChatOptions = {}): Promise<string> {
    if (!this.session) {
      throw new Error("No model is loaded in the built-in engine. Load a model first.");
    }
    if (this.busy) {
      throw new Error("The built-in engine is already generating a response. One request at a time.");
    }

    const plan = planChat(messages);
    if (plan.systemPrompt && plan.systemPrompt !== this.systemPrompt) {
      await this.rebuildSession(plan.systemPrompt);
    }

    this.busy = true;
    try {
      return await this.session.prompt(plan.prompt, {
        onTextChunk: options.onToken,
        signal: options.signal,
        stopOnAbortSignal: true,
        temperature: options.temperature
      });
    } finally {
      this.busy = false;
    }
  }

  /** Map the engine into the shared RuntimeStatus shape used across the UI/SDK. */
  status(ownedModels: RuntimeModel[] = []): RuntimeStatus {
    const notes: string[] = [];
    if (!this.available) {
      notes.push(
        this.lastError
          ? `Built-in engine unavailable: ${this.lastError}`
          : "Built-in engine not initialized yet."
      );
    } else {
      notes.push(this.gpu ? `Hardware acceleration: ${this.gpu}.` : "Running on CPU.");
    }
    if (this.busy) notes.push("Currently generating a response.");

    const loadedModels: RuntimeModel[] = this.loadedName
      ? [
          {
            id: this.loadedPathValue || this.loadedName,
            name: this.loadedName,
            displayName: this.loadedName,
            path: this.loadedPathValue,
            format: "gguf",
            runtime: "llamacpp",
            loaded: true,
            owned: true
          }
        ]
      : [];

    return {
      id: "llamacpp",
      label: "Built-in engine (llama.cpp)",
      installed: this.available,
      online: this.available,
      version: this.gpu ? `gpu:${this.gpu}` : undefined,
      models: ownedModels,
      loadedModels,
      notes
    };
  }

  private async ensureModule(): Promise<LlamaModuleLike> {
    if (!this.module) {
      this.module = await this.loader();
    }
    return this.module;
  }

  private async ensureLlama(): Promise<LlamaLike> {
    if (!this.llama) {
      const module = await this.ensureModule();
      this.llama = await module.getLlama();
      this.gpu = this.llama.gpu;
      this.available = true;
      this.lastError = undefined;
    }
    return this.llama;
  }

  private async rebuildSession(systemPrompt: string): Promise<void> {
    if (!this.model) return;
    const module = await this.ensureModule();
    const context = await this.model.createContext();
    this.session = new module.LlamaChatSession({ contextSequence: context.getSequence(), systemPrompt });
    this.systemPrompt = systemPrompt;
  }

  private normalize(value: string): string {
    return path.resolve(value).toLowerCase();
  }
}
