import { describe, expect, it } from "vitest";
import { ollamaChunk, ollamaDone, planChat, type ChatMessage } from "../messages.js";

describe("planChat", () => {
  it("extracts the system prompt and the latest user message", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "You are concise." },
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi" },
      { role: "user", content: "What is 2 + 2?" }
    ];
    expect(planChat(messages)).toEqual({ systemPrompt: "You are concise.", prompt: "What is 2 + 2?" });
  });

  it("returns undefined systemPrompt when no system message is present", () => {
    const plan = planChat([{ role: "user", content: "Hi" }]);
    expect(plan.systemPrompt).toBeUndefined();
    expect(plan.prompt).toBe("Hi");
  });

  it("merges multiple system messages", () => {
    const plan = planChat([
      { role: "system", content: "Be kind." },
      { role: "system", content: "Be brief." },
      { role: "user", content: "Go" }
    ]);
    expect(plan.systemPrompt).toBe("Be kind.\n\nBe brief.");
  });

  it("throws on an empty array", () => {
    expect(() => planChat([])).toThrow(/non-empty/);
  });

  it("throws when there is no user message with content", () => {
    expect(() => planChat([{ role: "system", content: "x" }])).toThrow(/user message/);
    expect(() => planChat([{ role: "user", content: "   " }])).toThrow(/user message/);
  });
});

describe("ollama chunk shaping", () => {
  it("shapes a streaming token", () => {
    const chunk = ollamaChunk("demo", "hello");
    expect(chunk.model).toBe("demo");
    expect(chunk.message).toEqual({ role: "assistant", content: "hello" });
    expect(chunk.done).toBe(false);
    expect(typeof chunk.created_at).toBe("string");
  });

  it("shapes the terminal chunk", () => {
    const done = ollamaDone("demo");
    expect(done.done).toBe(true);
    expect(done.message.content).toBe("");
    expect(done.done_reason).toBe("stop");
  });
});
