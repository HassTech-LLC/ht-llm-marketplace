export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatPlan {
  systemPrompt?: string;
  prompt: string;
}

/**
 * Reduce an OpenAI/Ollama-style message array down to what the embedded
 * llama.cpp chat session needs: an optional system prompt and the most recent
 * user turn. The session itself keeps conversational history between calls, so
 * we only feed it the latest user message.
 */
export function planChat(messages: ChatMessage[]): ChatPlan {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("messages must be a non-empty array");
  }

  const systemPrompt = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content?.trim())
    .filter(Boolean)
    .join("\n\n");

  const lastUser = [...messages].reverse().find((message) => message.role === "user");
  if (!lastUser || !lastUser.content?.trim()) {
    throw new Error("a user message with content is required");
  }

  return {
    systemPrompt: systemPrompt || undefined,
    prompt: lastUser.content
  };
}

/**
 * Shape a streamed token as an Ollama-compatible chat chunk so existing clients
 * that already read the daemon's `/api/chat` NDJSON stream work unchanged.
 */
export function ollamaChunk(model: string, content: string) {
  return {
    model,
    created_at: new Date().toISOString(),
    message: { role: "assistant" as const, content },
    done: false
  };
}

export function ollamaDone(model: string) {
  return {
    model,
    created_at: new Date().toISOString(),
    message: { role: "assistant" as const, content: "" },
    done: true,
    done_reason: "stop"
  };
}
