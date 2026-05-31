import type { ChatMessage } from "../engine/messages.js";
import type { LocalResponsesResponse } from "@ht-llm-marketplace/sdk";
import type { LocalResponsesRequest } from "./types.js";

export function inputToMessages(request: Pick<LocalResponsesRequest, "input" | "instructions">): ChatMessage[] {
  const messages: ChatMessage[] = [];
  if (request.instructions?.trim()) messages.push({ role: "system", content: request.instructions.trim() });
  if (typeof request.input === "string") {
    if (!request.input.trim()) throw new Error("'input' is required");
    messages.push({ role: "user", content: request.input });
    return messages;
  }
  if (!Array.isArray(request.input) || request.input.length === 0) throw new Error("'input' is required");
  for (const item of request.input) {
    const role = item.role === "assistant" || item.role === "system" ? item.role : "user";
    const content =
      typeof item.content === "string"
        ? item.content
        : (item.content || [])
            .map((part) => {
              if (part.type === "input_text" || part.type === "output_text") return part.text || "";
              if (part.type === "text") return part.text || "";
              throw new Error(`Unsupported Responses content type: ${part.type}`);
            })
            .join("\n");
    if (content.trim()) messages.push({ role, content });
  }
  if (!messages.some((message) => message.role !== "system")) throw new Error("'input' is required");
  return messages;
}

export function responseObject(input: { id: string; model: string; text: string; inputTokens: number; outputTokens: number }): LocalResponsesResponse {
  return {
    id: input.id,
    object: "response" as const,
    created_at: Math.floor(Date.now() / 1000),
    model: input.model,
    status: "completed" as const,
    output: [
      {
        id: `msg_${input.id}`,
        type: "message" as const,
        status: "completed" as const,
        role: "assistant" as const,
        content: [{ type: "output_text" as const, text: input.text }]
      }
    ],
    output_text: input.text,
    usage: {
      input_tokens: input.inputTokens,
      output_tokens: input.outputTokens,
      total_tokens: input.inputTokens + input.outputTokens
    }
  };
}

export function streamEvents(input: { id: string; model: string; text: string }) {
  return [
    { event: "response.created", data: { id: input.id, object: "response", model: input.model, status: "in_progress" } },
    { event: "response.output_text.delta", data: { response_id: input.id, delta: input.text } },
    { event: "response.output_text.done", data: { response_id: input.id, text: input.text } },
    {
      event: "response.completed",
      data: responseObject({ id: input.id, model: input.model, text: input.text, inputTokens: 0, outputTokens: estimateTokens(input.text) })
    }
  ];
}

export function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}
