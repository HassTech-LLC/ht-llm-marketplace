import { describe, expect, it, vi } from "vitest";
import { LlamaEngine, type LlamaModuleLike } from "../llama.js";

interface FakeOptions {
  gpu?: string | false;
  reply?: string;
}

function makeFakeModule(options: FakeOptions = {}) {
  const reply = options.reply ?? "Four.";
  const events = { disposed: 0, sessionsCreated: 0, loadedPaths: [] as string[] };

  class FakeChatSession {
    systemPrompt?: string;
    constructor(opts: { contextSequence: unknown; systemPrompt?: string }) {
      this.systemPrompt = opts.systemPrompt;
      events.sessionsCreated += 1;
    }
    async prompt(_text: string, opts?: { onTextChunk?: (chunk: string) => void }) {
      for (const word of reply.split(" ")) opts?.onTextChunk?.(`${word} `);
      return reply;
    }
  }

  const llama = {
    gpu: options.gpu ?? "cuda",
    async loadModel({ modelPath }: { modelPath: string }) {
      if (modelPath.includes("bad")) throw new Error("unsupported architecture");
      events.loadedPaths.push(modelPath);
      return {
        async createContext() {
          return { getSequence: () => ({}) };
        },
        async dispose() {
          events.disposed += 1;
        }
      };
    }
  };

  const module: LlamaModuleLike = {
    async getLlama() {
      return llama;
    },
    LlamaChatSession: FakeChatSession as unknown as LlamaModuleLike["LlamaChatSession"]
  };

  return { module, events };
}

describe("LlamaEngine", () => {
  it("probes availability and GPU type through the injected loader", async () => {
    const { module } = makeFakeModule({ gpu: "cuda" });
    const engine = new LlamaEngine({ loader: async () => module });

    const result = await engine.probe();

    expect(result.available).toBe(true);
    expect(result.gpu).toBe("cuda");
    expect(engine.status().installed).toBe(true);
  });

  it("reports unavailable gracefully when the binary cannot load", async () => {
    const engine = new LlamaEngine({
      loader: async () => {
        throw new Error("prebuilt binary missing");
      }
    });

    const result = await engine.probe();

    expect(result.available).toBe(false);
    expect(result.error).toMatch(/prebuilt binary missing/);
    const status = engine.status();
    expect(status.installed).toBe(false);
    expect(status.online).toBe(false);
    expect(status.notes.join(" ")).toMatch(/unavailable/);
  });

  it("loads a model and surfaces it as the loaded model", async () => {
    const { module } = makeFakeModule();
    const engine = new LlamaEngine({ loader: async () => module });

    const { loaded, gpu } = await engine.load({ modelPath: "/models/demo.gguf" });

    expect(loaded).toBe("demo.gguf");
    expect(gpu).toBe("cuda");
    expect(engine.isLoaded("/models/demo.gguf")).toBe(true);
    expect(engine.status().loadedModels?.[0]?.name).toBe("demo.gguf");
  });

  it("streams tokens and returns the full reply", async () => {
    const { module } = makeFakeModule({ reply: "two plus two is four" });
    const engine = new LlamaEngine({ loader: async () => module });
    await engine.load({ modelPath: "/models/demo.gguf" });

    const tokens: string[] = [];
    const full = await engine.chat([{ role: "user", content: "2+2?" }], {
      onToken: (chunk) => tokens.push(chunk)
    });

    expect(full).toBe("two plus two is four");
    expect(tokens.join("")).toContain("four");
  });

  it("refuses to chat before a model is loaded", async () => {
    const { module } = makeFakeModule();
    const engine = new LlamaEngine({ loader: async () => module });

    await expect(engine.chat([{ role: "user", content: "hi" }])).rejects.toThrow(/Load a model first/);
  });

  it("keeps the current model loaded when a new load fails", async () => {
    const { module } = makeFakeModule();
    const engine = new LlamaEngine({ loader: async () => module });

    await engine.load({ modelPath: "/models/good.gguf" });
    await expect(engine.load({ modelPath: "/models/bad.gguf" })).rejects.toThrow(/unsupported/);

    expect(engine.isLoaded("/models/good.gguf")).toBe(true);
    expect(engine.loadedModel).toBe("good.gguf");
  });

  it("disposes the model on unload and on reload", async () => {
    const { module, events } = makeFakeModule();
    const engine = new LlamaEngine({ loader: async () => module });

    await engine.load({ modelPath: "/models/a.gguf" });
    await engine.load({ modelPath: "/models/b.gguf" }); // triggers an unload of "a" first
    expect(events.disposed).toBe(1);

    await engine.unload();
    expect(events.disposed).toBe(2);
    expect(engine.isLoaded()).toBe(false);
  });
});
