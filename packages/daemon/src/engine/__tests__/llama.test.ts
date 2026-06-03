import { describe, expect, it, vi, beforeEach } from "vitest";
import { LlamaEngine } from "../llama.js";

vi.mock("../../runtime/llama-server.js", () => {
  return {
    LlamaServerManager: class {
      options: any;
      constructor(options: any) {
        this.options = options;
      }
      start = vi.fn().mockResolvedValue({ running: true, available: true, message: "OK" });
      stop = vi.fn().mockResolvedValue({ running: false, available: true, message: "Stopped" });
      status = vi.fn().mockReturnValue({ running: true, available: true, pid: 1234, endpoint: "http://127.0.0.1:18080" });
    },
    llamaServerManagedRoot: () => "/mock/storage/tools/llama-server",
    installManagedLlamaServer: async () => ({ ok: true, binaryPath: "/mock/binary" }),
    findLlamaServerBinary: () => "/mock/binary"
  };
});

describe("LlamaEngine (out-of-process)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("probes availability", async () => {
    const engine = new LlamaEngine();
    const result = await engine.probe();
    expect(result.available).toBe(true);
  });

  it("loads a model", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      text: async () => "OK"
    } as any);

    const engine = new LlamaEngine();
    const { loaded } = await engine.load({ modelPath: "/models/demo.gguf" });

    expect(loaded).toBe("demo.gguf");
    expect(engine.isLoaded("/models/demo.gguf")).toBe(true);
    fetchSpy.mockRestore();
  });

  it("streams chat output", async () => {
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'));
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":" world!"}}]}\n\n'));
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        controller.close();
      }
    });

    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation((url) => {
      if (String(url).endsWith("/health")) {
        return Promise.resolve({ ok: true, text: async () => "OK" } as any);
      }
      return Promise.resolve({
        ok: true,
        body: mockStream
      } as any);
    });

    const engine = new LlamaEngine();
    await engine.load({ modelPath: "/models/demo.gguf" });

    const tokens: string[] = [];
    const full = await engine.chat([{ role: "user", content: "hi" }], {
      onToken: (c) => tokens.push(c)
    });

    expect(full).toBe("Hello world!");
    expect(tokens).toEqual(["Hello", " world!"]);
    fetchSpy.mockRestore();
  });
});
