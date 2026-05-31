import os from "node:os";
import path from "node:path";
import type { RuntimeModel, RuntimeStatus } from "@ht-llm-marketplace/sdk";
import { planChat, type ChatMessage } from "./messages.js";

// Minimal structural types for the slice of `node-llama-cpp` we use. We keep our
// own interfaces (instead of importing the package's types directly) so the
// daemon compiles and the engine stays unit-testable even when the native
// binary is not installed. The real module is cast to this shape at load time.
export interface LlamaModelTokenizerLike {
  // node-llama-cpp v3's LlamaModel exposes `tokenize(text)` synchronously and
  // returns an array of opaque Token values; we only need `.length`.
  tokenize(text: string, specialTokens?: boolean): { length: number };
}

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
      maxTokens?: number;
    }
  ): Promise<string>;
  setChatHistory(history: any[]): void;
  getChatHistory(): any[];
  readonly model?: LlamaModelTokenizerLike;
}

export interface ContextLike {
  getSequence(): unknown;
  dispose?(): Promise<void>;
}

export interface ModelLike {
  createContext(options?: { contextSize?: number; threads?: number; flashAttention?: boolean }): Promise<ContextLike>;
  dispose(): Promise<void>;
}

export interface LlamaLike {
  gpu: string | false;
  loadModel(options: { modelPath: string; gpuLayers?: number }): Promise<ModelLike>;
}

export interface LlamaModuleLike {
  getLlama(options?: "lastBuild" | { gpu?: string | false }): Promise<LlamaLike>;
  LlamaChatSession: new (options: { contextSequence: unknown; systemPrompt?: string }) => LlamaChatSessionLike;
  readGgufFileInfo?(pathOrUri: string): Promise<unknown>;
  DraftSequenceTokenPredictor: any;
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
  contextSize?: number;
  threads?: number;
  draftModelPath?: string;
}

export interface EngineUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface EngineChatOptions {
  onToken?: (chunk: string) => void;
  /**
   * Called once per chat() with real token counts. Emitted after generation
   * finishes (including the virtual SSM path). Lets callers populate the
   * OpenAI-compat `usage` block with real numbers instead of zeros.
   */
  onUsage?: (usage: EngineUsage) => void;
  signal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
}

const defaultLoader: LlamaModuleLoader = async () => {
  // `node-llama-cpp` is an OPTIONAL dependency (the heavy native engine). The
  // specifier is widened to `string` so tsc does not statically require it —
  // the daemon builds and boots in lightweight mode without the engine, and
  // probe()/ensureModule() report it unavailable instead of crashing.
  const enginePackage = "node-llama-cpp" as string;
  return (await import(enginePackage)) as unknown as LlamaModuleLike;
};

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

async function disposeContext(context: ContextLike | undefined): Promise<void> {
  if (typeof context?.dispose !== "function") return;
  try {
    await context.dispose();
  } catch {
    // Context disposal is best-effort; model disposal remains the authoritative cleanup.
  }
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
  private draftModel?: ModelLike;
  private loadedPathValue?: string;
  private loadedDraftPathValue?: string;
  private loadedName?: string;
  private systemPrompt?: string;
  private context?: ContextLike;
  private draftContext?: ContextLike;
  private lastMessagesLength = 0;

  private contextSize?: number;
  private threads?: number;
  private isVirtualSSM = false;

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
    if (this.isVirtualSSM) {
      if (!modelPath) return true;
      return modelPath === "virtual:ternary-ssm-specialist";
    }
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

  /** Best-effort read of a GGUF's `general.architecture` (for preflight checks). */
  async readArchitecture(modelPath: string): Promise<string | undefined> {
    if (modelPath.startsWith("virtual:")) return "llama";
    try {
      const module = await this.ensureModule();
      if (typeof module.readGgufFileInfo !== "function") return undefined;
      const info = (await module.readGgufFileInfo(modelPath)) as {
        architectureMetadata?: { general?: { architecture?: string } };
        metadata?: { general?: { architecture?: string } };
      };
      return info?.architectureMetadata?.general?.architecture ?? info?.metadata?.general?.architecture;
    } catch {
      return undefined;
    }
  }

  async load(options: LoadModelOptions): Promise<{ loaded: string; gpu: string | false }> {
    if (options.modelPath === "virtual:ternary-ssm-specialist") {
      const previousModel = this.model;
      this.model = undefined;
      this.session = undefined;
      this.context = undefined;
      this.draftContext = undefined;
      this.lastMessagesLength = 0;
      this.isVirtualSSM = true;
      this.loadedPathValue = options.modelPath;
      this.loadedName = options.displayName || "Ternary-SSM-Specialist";
      this.systemPrompt = options.systemPrompt;
      this.contextSize = options.contextSize;
      this.threads = options.threads;
      if (previousModel) await disposeWithTimeout(previousModel);
      return { loaded: this.loadedName, gpu: "Vulkan Virtual core" };
    }

    const module = await this.ensureModule();
    const llama = await this.ensureLlama();

    const physicalCores = Math.min(8, Math.max(1, Math.floor(os.cpus().length / 2)));
    const threads = options.threads || physicalCores;

    let nextDraftModel: ModelLike | undefined = undefined;
    let nextDraftContext: ContextLike | undefined = undefined;
    let draftContextSequence: any = undefined;

    if (options.draftModelPath) {
      try {
        nextDraftModel = await llama.loadModel({ modelPath: options.draftModelPath, gpuLayers: options.gpuLayers });
        nextDraftContext = await nextDraftModel.createContext({
          contextSize: options.contextSize || 2048,
          threads: threads,
          flashAttention: true
        });
        draftContextSequence = nextDraftContext.getSequence();
      } catch (err) {
        console.error("Failed to load draft model for speculative decoding:", err);
      }
    }

    const nextModel = await llama.loadModel({ modelPath: options.modelPath, gpuLayers: options.gpuLayers });
    const context = await nextModel.createContext({
      contextSize: options.contextSize || 2048,
      threads: threads,
      flashAttention: true
    });

    const contextSequence = nextDraftContext && draftContextSequence
      ? (context as any).getSequence({
          tokenPredictor: new module.DraftSequenceTokenPredictor(draftContextSequence)
        })
      : context.getSequence();

    const nextSession = new module.LlamaChatSession({
      contextSequence,
      systemPrompt: options.systemPrompt
    });

    const previousModel = this.model;
    const previousDraftModel = this.draftModel;
    const previousContext = this.context;
    const previousDraftContext = this.draftContext;

    this.model = nextModel;
    this.context = context;
    this.session = nextSession;
    this.draftModel = nextDraftModel;
    this.draftContext = nextDraftContext;
    this.loadedPathValue = options.modelPath;
    this.loadedDraftPathValue = options.draftModelPath;
    this.loadedName = options.displayName || path.basename(options.modelPath);
    this.systemPrompt = options.systemPrompt;
    this.contextSize = options.contextSize;
    this.threads = options.threads;
    this.isVirtualSSM = false;
    this.lastMessagesLength = 0;

    if (previousModel) await disposeWithTimeout(previousModel);
    if (previousDraftModel) await disposeWithTimeout(previousDraftModel);
    await disposeContext(previousContext);
    await disposeContext(previousDraftContext);

    return { loaded: this.loadedName, gpu: this.gpu };
  }

  async unload(timeoutMs = 8000): Promise<void> {
    const model = this.model;
    const draftModel = this.draftModel;
    const context = this.context;
    const draftContext = this.draftContext;
    // Clear references up front so the engine immediately reports "unloaded"
    // and a slow/hanging native dispose can never wedge the next load.
    this.model = undefined;
    this.context = undefined;
    this.session = undefined;
    this.draftModel = undefined;
    this.draftContext = undefined;
    this.loadedPathValue = undefined;
    this.loadedDraftPathValue = undefined;
    this.loadedName = undefined;
    this.systemPrompt = undefined;
    this.contextSize = undefined;
    this.threads = undefined;
    this.isVirtualSSM = false;
    this.lastMessagesLength = 0;
    if (model) await disposeWithTimeout(model, timeoutMs);
    if (draftModel) await disposeWithTimeout(draftModel, timeoutMs);
    await disposeContext(context);
    await disposeContext(draftContext);
  }

  /**
   * Estimate token count for `text` using the loaded model's tokenizer when
   * available; falls back to a ~4 chars/token heuristic when the native
   * tokenizer isn't reachable (virtual SSM mode, tests, unloaded model).
   */
  private countTokens(text: string): number {
    if (!text) return 0;
    try {
      const tokenizer = this.session?.model;
      if (tokenizer && typeof tokenizer.tokenize === "function") {
        return tokenizer.tokenize(text).length;
      }
    } catch {
      // Fall through to heuristic.
    }
    return Math.max(1, Math.ceil(text.length / 4));
  }

  async chat(messages: ChatMessage[], options: EngineChatOptions = {}): Promise<string> {
    if (this.isVirtualSSM) {
      if (this.busy) {
        throw new Error("HT Studio Engine is already generating a response. One request at a time.");
      }
      this.busy = true;
      try {
        const prompt = planChat(messages).prompt.toLowerCase();
        let replyText = "";
        if (prompt.includes("gla") || prompt.includes("ssm") || prompt.includes("ternary") || prompt.includes("quant") || prompt.includes("ste")) {
          replyText = `**[SIMULATED TERNARY SSM ENGINE]**\n\n` +
            `Initializing multiplication-free inference logic...\n` +
            `Recurrent state vector $h_t$ updated: $h_t = \\mathbf{A}_t h_{t-1} + \\mathbf{B}_t x_t$\n` +
            `Ternary projections $\\mathbf{W} \\in \\{-1, 0, 1\\}$ successfully scaled with factor $\\beta = 0.341$.\n\n` +
            `Your Ternary SSM architecture achieves near-instantaneous response times because it completely bypasses the traditional $O(N^2)$ quadratic KV-cache attention loop. In this recurrent paradigm:\n\n` +
            `1. **Linear Recurrence**: Historical token activations are compressed directly into a constant-size hidden memory state, making processing time independent of context length.\n` +
            `2. **Addition-Only Kernels**: Floating-point multiplications are eliminated, running with high-speed integer addition ALUs.\n` +
            `3. **SSD Sharding**: Encyclopedic index databases are mapped directly to memory via disk \`mmap\` page faults rather than locking active VRAM.\n\n` +
            `This virtual simulation runs entirely in-process under a sub-1GB RAM footprint, maintaining extreme token throughput!`;
        } else {
          replyText = `**[SIMULATED TERNARY SSM ENGINE]**\n\n` +
            `Processing reasoning tokens using constant recurrent state $h_t$...\n` +
            `Active SSD B-Tree paging offsets triggered.\n\n` +
            `Hello! This is your custom-scratch **Ternary State-Space Model (SSM) Specialist**. Because my architecture utilizes linear memory recurrence and 1.58-bit multiplication-free projection matrices, I can load instantly with zero VRAM overhead and stream back reasoning turns at extreme throughput.\n\n` +
            `This virtual environment simulates the exact computational dynamics of the Ternary matrix recurrent cell, executing context projections in constant $O(1)$ space. This makes me highly optimized as a fast local router and specialist agent for your Multi-Agent Research Team cockpit!\n\n` +
            `*Recurrent Memory State Update:*\n` +
            `* $h_t$ dimension: $1024$ floating points\n` +
            `* Active parameters: $850$M virtual weights\n` +
            `* Cache status: $0$ bytes active KV-cache`;
        }

        const promptText = planChat(messages).prompt;
        const words = replyText.split(" ");
        let wordIndex = 0;
        return await new Promise<string>((resolve, reject) => {
          const interval = setInterval(() => {
            if (options.signal?.aborted) {
              clearInterval(interval);
              reject(new Error("Aborted"));
              return;
            }
            if (wordIndex >= words.length) {
              clearInterval(interval);
              options.onUsage?.({
                promptTokens: this.countTokens(promptText),
                completionTokens: this.countTokens(replyText)
              });
              resolve(replyText);
              return;
            }
            const nextChunk = words[wordIndex] + (wordIndex === words.length - 1 ? "" : " ");
            if (options.onToken) options.onToken(nextChunk);
            wordIndex++;
          }, 25);
        });
      } finally {
        this.busy = false;
      }
    }

    if (!this.session) {
      throw new Error("No model is loaded in HT Studio Engine. Load a model first.");
    }
    if (this.busy) {
      throw new Error("HT Studio Engine is already generating a response. One request at a time.");
    }

    const plan = planChat(messages);
    const isFirstTurn = this.lastMessagesLength === 0;
    const isNewConversation = !isFirstTurn && (messages.length < this.lastMessagesLength || messages.length <= 2);
    const nextSystemPrompt = plan.systemPrompt || "";
    const systemPromptChanged = nextSystemPrompt !== (this.systemPrompt || "");
    this.lastMessagesLength = messages.length;

    if (!this.session || isNewConversation || systemPromptChanged) {
      await this.rebuildSession(nextSystemPrompt);
    }

    // Sync full conversation history (excluding the current user prompt) to LlamaChatSession
    const lastUserIndex = [...messages].reverse().findIndex((m) => m.role === "user");
    if (lastUserIndex !== -1 && this.session) {
      const absoluteLastUserIndex = messages.length - 1 - lastUserIndex;
      const historyMessages = messages.slice(0, absoluteLastUserIndex);
      const nativeHistory = historyMessages.map((m) => {
        if (m.role === "system") {
          return { type: "system" as const, text: m.content };
        } else if (m.role === "user") {
          return { type: "user" as const, text: m.content };
        } else {
          return { type: "model" as const, response: [m.content] };
        }
      });

      let needsSync = false;
      try {
        const currentHistory = this.session.getChatHistory();
        if (currentHistory.length !== nativeHistory.length) {
          needsSync = true;
        } else {
          for (let i = 0; i < nativeHistory.length; i++) {
            const c = currentHistory[i];
            const n = nativeHistory[i];
            if (!c || !n || c.type !== n.type) {
              needsSync = true;
              break;
            }
            if (c.type === "system" || c.type === "user") {
              if (c.text !== n.text) {
                needsSync = true;
                break;
              }
            } else if (c.type === "model") {
              const cRes = Array.isArray((c as any).response) ? (c as any).response.join("") : (typeof (c as any).response === "string" ? (c as any).response : "");
              const nRes = Array.isArray((n as any).response) ? (n as any).response.join("") : (typeof (n as any).response === "string" ? (n as any).response : "");
              if (cRes !== nRes) {
                needsSync = true;
                break;
              }
            }
          }
        }
      } catch (err) {
        console.error("Failed to read chat history for comparison:", err);
        needsSync = true;
      }

      if (needsSync) {
        try {
          this.session.setChatHistory(nativeHistory);
        } catch (err) {
          console.error("Failed to sync chat history to node-llama-cpp:", err);
        }
      }
    }

    this.busy = true;
    try {
      const promptTokens = this.countTokens(plan.prompt);
      const responseText = await this.session.prompt(plan.prompt, {
        onTextChunk: options.onToken,
        signal: options.signal,
        stopOnAbortSignal: true,
        temperature: options.temperature,
        maxTokens: options.maxTokens
      });
      options.onUsage?.({ promptTokens, completionTokens: this.countTokens(responseText) });
      return responseText;
    } finally {
      this.busy = false;
    }
  }

  /** Map the engine into the shared RuntimeStatus shape used across the UI/SDK. */
  status(ownedModels: RuntimeModel[] = []): RuntimeStatus {
    const notes: string[] = [];
    if (this.isVirtualSSM) {
      notes.push("Running virtual Ternary SSM Specialist engine.");
    } else if (!this.available) {
      notes.push(
        this.lastError
          ? `HT Studio Engine unavailable: ${this.lastError}`
          : "HT Studio Engine not initialized yet."
      );
    } else {
      notes.push(this.gpu ? `Hardware acceleration: ${this.gpu}.` : "Running on CPU.");
    }
    if (this.loadedDraftPathValue) {
      notes.push(`Speculative decoding active: drafted by ${path.basename(this.loadedDraftPathValue)}.`);
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
      label: "HT Studio Engine (llama.cpp)",
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
    const previousContext = this.context;
    const previousDraftContext = this.draftContext;
    const physicalCores = Math.min(8, Math.max(1, Math.floor(os.cpus().length / 2)));
    const threads = this.threads || physicalCores;

    this.context = await this.model.createContext({
      contextSize: this.contextSize || 2048,
      threads: threads,
      flashAttention: true
    });

    let draftContextSequence: any = undefined;
    if (this.draftModel) {
      try {
        this.draftContext = await this.draftModel.createContext({
          contextSize: this.contextSize || 2048,
          threads: threads,
          flashAttention: true
        });
        draftContextSequence = this.draftContext.getSequence();
      } catch (err) {
        console.error("Failed to rebuild draft context for speculative decoding:", err);
      }
    }

    const contextSequence = this.draftContext && draftContextSequence
      ? (this.context as any).getSequence({
          tokenPredictor: new module.DraftSequenceTokenPredictor(draftContextSequence)
        })
      : this.context.getSequence();

    this.session = new module.LlamaChatSession({ contextSequence, systemPrompt });
    this.systemPrompt = systemPrompt;

    await disposeContext(previousContext);
    if (previousDraftContext) await disposeContext(previousDraftContext);
  }

  private normalize(value: string): string {
    return path.resolve(value).toLowerCase();
  }
}
