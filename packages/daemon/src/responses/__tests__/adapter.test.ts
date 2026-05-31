import { describe, expect, it } from "vitest";
import { inputToMessages, responseObject, streamEvents } from "../adapter.js";

describe("Responses API adapter", () => {
  it("converts string input to chat messages", () => {
    expect(inputToMessages({ input: "hello" })).toEqual([{ role: "user", content: "hello" }]);
  });

  it("builds an OpenAI-style response object", () => {
    const response = responseObject({ id: "resp_1", model: "local", text: "hi", inputTokens: 1, outputTokens: 1 });
    expect(response.object).toBe("response");
    expect(response.output_text).toBe("hi");
    expect(response.output[0].content[0].type).toBe("output_text");
  });

  it("emits ordered stream events", () => {
    const events = streamEvents({ id: "resp_1", model: "local", text: "hi" }).map((event) => event.event);
    expect(events).toEqual(["response.created", "response.output_text.delta", "response.output_text.done", "response.completed"]);
  });
});
