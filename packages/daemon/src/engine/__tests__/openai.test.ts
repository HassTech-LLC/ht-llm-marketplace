import { describe, expect, it } from "vitest";
import {
  openAiChunk,
  openAiCompletion,
  openAiFinalChunk,
  openAiModelList,
  parseOpenAiChatRequest
} from "../openai.js";

describe("parseOpenAiChatRequest", () => {
  it("parses a valid request", () => {
    const parsed = parseOpenAiChatRequest({
      model: "qwen2.5",
      messages: [{ role: "user", content: "hi" }],
      stream: true,
      temperature: 0.5,
      max_tokens: 32
    });
    expect(parsed).toEqual({
      model: "qwen2.5",
      messages: [{ role: "user", content: "hi" }],
      stream: true,
      temperature: 0.5,
      maxTokens: 32
    });
  });

  it("defaults stream to false and model to undefined", () => {
    const parsed = parseOpenAiChatRequest({ messages: [{ role: "user", content: "hi" }] });
    expect(parsed.stream).toBe(false);
    expect(parsed.model).toBeUndefined();
  });

  it("preserves response_format and tool metadata for best-effort compatibility", () => {
    const responseFormat = { type: "json_schema", json_schema: { name: "answer", schema: { type: "object" } } };
    const tools = [{ type: "function", function: { name: "lookup" } }];
    const parsed = parseOpenAiChatRequest({
      messages: [{ role: "user", content: "hi" }],
      response_format: responseFormat,
      tools,
      tool_choice: "auto"
    });

    expect(parsed.responseFormat).toBe(responseFormat);
    expect(parsed.tools).toBe(tools);
    expect(parsed.toolChoice).toBe("auto");
  });

  it("throws when messages is missing or empty", () => {
    expect(() => parseOpenAiChatRequest({})).toThrow(/messages/);
    expect(() => parseOpenAiChatRequest({ messages: [] })).toThrow(/messages/);
  });

  it("throws when there is no user message (delegated to planChat)", () => {
    expect(() => parseOpenAiChatRequest({ messages: [{ role: "system", content: "x" }] })).toThrow();
  });
});

describe("OpenAI response shaping", () => {
  it("shapes a non-streaming completion", () => {
    const c = openAiCompletion("demo", "hello", "chatcmpl-1");
    expect(c.object).toBe("chat.completion");
    expect(c.id).toBe("chatcmpl-1");
    expect(c.model).toBe("demo");
    expect(c.choices[0].message).toEqual({ role: "assistant", content: "hello" });
    expect(c.choices[0].finish_reason).toBe("stop");
  });

  it("shapes streaming delta + final chunks", () => {
    const chunk = openAiChunk("demo", "id1", "tok");
    expect(chunk.object).toBe("chat.completion.chunk");
    expect(chunk.choices[0].delta).toEqual({ content: "tok" });
    expect(chunk.choices[0].finish_reason).toBeNull();

    const final = openAiFinalChunk("demo", "id1");
    expect(final.choices[0].delta).toEqual({});
    expect(final.choices[0].finish_reason).toBe("stop");
  });

  it("shapes and de-dupes a model list", () => {
    const list = openAiModelList(["a", "b", "a", ""]);
    expect(list.object).toBe("list");
    expect(list.data.map((m) => m.id)).toEqual(["a", "b"]);
    expect(list.data[0]).toMatchObject({ object: "model", owned_by: "ht-llm-marketplace" });
  });
});
