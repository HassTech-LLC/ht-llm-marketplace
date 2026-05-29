import type { RuntimeStatus } from "@ht-llm-marketplace/sdk";

export async function openAiCompatibleStatus(endpoint?: string): Promise<RuntimeStatus> {
  if (!endpoint) {
    return {
      id: "openai-compatible",
      label: "OpenAI-compatible endpoint",
      installed: false,
      online: false,
      notes: ["Set OPENAI_COMPATIBLE_BASE_URL to enable a generic local endpoint."]
    };
  }

  try {
    const response = await fetch(`${endpoint}/v1/models`);
    const online = response.ok;
    return {
      id: "openai-compatible",
      label: "OpenAI-compatible endpoint",
      installed: true,
      online,
      endpoint,
      notes: online ? [] : [`/v1/models returned ${response.status}.`]
    };
  } catch (error) {
    return {
      id: "openai-compatible",
      label: "OpenAI-compatible endpoint",
      installed: true,
      online: false,
      endpoint,
      notes: [(error as Error).message]
    };
  }
}
