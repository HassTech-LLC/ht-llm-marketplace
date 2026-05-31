import { randomUUID } from "node:crypto";
import { planChat, type ChatMessage } from "./messages.js";

// OpenAI-compatible request/response shaping for `/v1/chat/completions`, so any
// client/SDK that targets the OpenAI or Ollama OpenAI-compat API can point at
// the marketplace daemon by changing only the base URL.

export interface OpenAiChatRequest {
  model?: string;
  messages?: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  tools?: unknown[];
  tool_choice?: unknown;
  response_format?: unknown;
}

export interface ParsedOpenAiChat {
  model?: string;
  messages: ChatMessage[];
  stream: boolean;
  temperature?: number;
  maxTokens?: number;
  tools?: unknown[];
  toolChoice?: unknown;
  responseFormat?: unknown;
}

export function parseOpenAiChatRequest(body: unknown): ParsedOpenAiChat {
  const request = (body ?? {}) as OpenAiChatRequest;
  if (!Array.isArray(request.messages) || request.messages.length === 0) {
    throw new Error("'messages' is required");
  }
  // Reuse the engine's validation (ensures a user turn with content exists).
  planChat(request.messages);
  const parsed: ParsedOpenAiChat = {
    model: typeof request.model === "string" ? request.model : undefined,
    messages: request.messages,
    stream: request.stream === true,
    temperature: typeof request.temperature === "number" ? request.temperature : undefined,
    tools: Array.isArray(request.tools) ? request.tools : undefined,
    toolChoice: request.tool_choice,
    responseFormat: request.response_format
  };
  if (typeof request.max_tokens === "number") parsed.maxTokens = request.max_tokens;
  return parsed;
}

export function openAiCompletionId(): string {
  return `chatcmpl-${randomUUID().replace(/-/g, "")}`;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export interface OpenAiUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export function openAiUsage(promptTokens: number, completionTokens: number): OpenAiUsage {
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens
  };
}

const ZERO_USAGE: OpenAiUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

export function openAiCompletion(
  model: string,
  content: string,
  id: string = openAiCompletionId(),
  usage: OpenAiUsage = ZERO_USAGE
) {
  return {
    id,
    object: "chat.completion" as const,
    created: nowSeconds(),
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant" as const, content },
        finish_reason: "stop" as const
      }
    ],
    usage
  };
}

export function openAiChunk(model: string, id: string, content: string) {
  return {
    id,
    object: "chat.completion.chunk" as const,
    created: nowSeconds(),
    model,
    choices: [{ index: 0, delta: { content }, finish_reason: null }]
  };
}

export function openAiFinalChunk(model: string, id: string, usage?: OpenAiUsage) {
  const base = {
    id,
    object: "chat.completion.chunk" as const,
    created: nowSeconds(),
    model,
    choices: [{ index: 0, delta: {}, finish_reason: "stop" as const }]
  };
  return usage ? { ...base, usage } : base;
}

export function openAiModelList(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  return {
    object: "list" as const,
    data: unique.map((id) => ({ id, object: "model" as const, created: 0, owned_by: "ht-llm-marketplace" }))
  };
}
