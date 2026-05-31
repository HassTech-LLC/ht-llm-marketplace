import type { RuntimeStatus } from "@ht-llm-marketplace/sdk";
import { fetchWithTimeout } from "../http.js";

export async function llamaCppStatus(endpoint?: string): Promise<RuntimeStatus> {
  if (!endpoint) {
    return {
      id: "llamacpp",
      label: "llama.cpp server",
      installed: false,
      online: false,
      notes: ["Set LLAMA_CPP_HOST to attach a direct llama.cpp server."]
    };
  }

  try {
    const response = await fetchWithTimeout(`${endpoint}/health`, { timeoutMs: 5_000 });
    return {
      id: "llamacpp",
      label: "llama.cpp server",
      installed: true,
      online: response.ok,
      endpoint,
      notes: response.ok ? [] : [`/health returned ${response.status}.`]
    };
  } catch (error) {
    return {
      id: "llamacpp",
      label: "llama.cpp server",
      installed: true,
      online: false,
      endpoint,
      notes: [(error as Error).message]
    };
  }
}
