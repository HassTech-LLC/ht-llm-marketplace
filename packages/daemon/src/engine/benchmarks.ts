import type { BenchmarkResult, ChatMessage } from "@ht-llm-marketplace/sdk";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

export async function runBenchmark(
  input: {
    model?: string;
    runtime: "llamacpp";
    prompt?: string;
    chat: (messages: ChatMessage[], options: { maxTokens: number; onToken: (token: string) => void }) => Promise<string>;
  }
): Promise<BenchmarkResult> {
  const prompt = input.prompt || "hi";
  const started = performance.now();
  let firstTokenMs: number | undefined;
  let tokenCount = 0;
  const content = await input.chat([{ role: "user", content: prompt }], {
    maxTokens: 64,
    onToken: (token) => {
      tokenCount += Math.max(1, token.trim().split(/\s+/).filter(Boolean).length);
      if (firstTokenMs === undefined) firstTokenMs = performance.now() - started;
    }
  });
  const totalMs = performance.now() - started;
  if (firstTokenMs === undefined) firstTokenMs = totalMs;
  if (tokenCount === 0) tokenCount = Math.max(1, content.trim().split(/\s+/).filter(Boolean).length);
  return {
    id: randomUUID(),
    model: input.model || "loaded",
    runtime: input.runtime,
    prompt,
    firstTokenMs: Math.round(firstTokenMs),
    totalMs: Math.round(totalMs),
    tokensPerSecond: Number((tokenCount / Math.max(totalMs / 1000, 0.001)).toFixed(2)),
    tokenCount,
    ok: true,
    createdAt: new Date().toISOString()
  };
}
