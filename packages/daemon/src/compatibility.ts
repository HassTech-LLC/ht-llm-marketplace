import type { BenchmarkResult, LlamaServerStatus, ModelIndexEntry, QueueStatus } from "@ht-llm-marketplace/sdk";

interface CompatibilityScorecard {
  generatedAt: string;
  claim: "foundation" | "candidate" | "best-replacement";
  summary: string;
  evidence: Array<{
    id: string;
    label: string;
    status: "pass" | "partial" | "planned";
    detail: string;
  }>;
  competitors: Array<{
    name: string;
    parity: "strong" | "partial" | "planned";
    covered: string[];
    gaps: string[];
  }>;
  gates: Array<{
    id: string;
    label: string;
    status: "pass" | "partial" | "planned";
  }>;
}

export interface ScorecardInput {
  models: ModelIndexEntry[];
  benchmarks: BenchmarkResult[];
  queue: QueueStatus;
  embeddingsAvailable: boolean;
  delegatedServer: LlamaServerStatus;
  documentsIndexed: number;
}

export function compatibilityScorecard(input: ScorecardInput): CompatibilityScorecard {
  const runnableModels = input.models.filter((model) => model.runnable);
  const successfulBenchmarks = input.benchmarks.filter((benchmark) => benchmark.ok);
  const failedBenchmarks = input.benchmarks.filter((benchmark) => !benchmark.ok);
  const queueHealthy = input.queue.recent.filter((entry) => entry.state === "failed").length === 0;

  const gates: CompatibilityScorecard["gates"] = [
    { id: "local-models", label: "Local GGUF discovery", status: runnableModels.length > 0 ? "pass" : "planned" },
    { id: "openai-ollama-api", label: "OpenAI and Ollama-compatible APIs", status: "pass" },
    {
      id: "benchmarks",
      label: "Measured local benchmark evidence",
      status: successfulBenchmarks.length > 0 ? "pass" : input.benchmarks.length > 0 ? "partial" : "planned"
    },
    {
      id: "delegated-batching",
      label: "llama-server delegated batching",
      status: input.delegatedServer.running ? "pass" : input.delegatedServer.available ? "partial" : "planned"
    },
    { id: "embeddings", label: "Local embeddings endpoint", status: input.embeddingsAvailable ? "pass" : "partial" },
    { id: "queue", label: "Cancelable generation queue", status: queueHealthy ? "pass" : "partial" }
  ];

  const requiredPasses = ["local-models", "openai-ollama-api", "benchmarks", "queue"];
  const requiredReady = requiredPasses.every((id) => gates.find((gate) => gate.id === id)?.status === "pass");
  const allReady = gates.every((gate) => gate.status === "pass");
  const claim: CompatibilityScorecard["claim"] = allReady ? "best-replacement" : requiredReady ? "candidate" : "foundation";

  return {
    generatedAt: new Date().toISOString(),
    claim,
    summary:
      claim === "best-replacement"
        ? "HT Studio has enough runtime, API, benchmark, batching, queue, and embedding evidence to claim best-replacement readiness."
        : claim === "candidate"
          ? "HT Studio has the core replacement path working, with remaining proof needed for every advanced Ollama/LM Studio parity claim."
          : "HT Studio is a replacement foundation until local benchmark and route evidence are present on this machine.",
    gates,
    evidence: [
      {
        id: "model-index",
        label: "Model index",
        status: runnableModels.length > 0 ? "pass" : "planned",
        detail: `${runnableModels.length} runnable local models indexed.`
      },
      {
        id: "benchmark-history",
        label: "Benchmark history",
        status: successfulBenchmarks.length > 0 ? "pass" : input.benchmarks.length > 0 ? "partial" : "planned",
        detail: `${successfulBenchmarks.length} passing benchmark runs, ${failedBenchmarks.length} failed runs.`
      },
      {
        id: "delegated-server",
        label: "Delegated llama-server",
        status: input.delegatedServer.running ? "pass" : input.delegatedServer.available ? "partial" : "planned",
        detail: input.delegatedServer.running
          ? `Running at ${input.delegatedServer.endpoint || "configured endpoint"}.`
          : input.delegatedServer.message
      },
      {
        id: "embeddings",
        label: "Embeddings",
        status: input.embeddingsAvailable ? "pass" : "partial",
        detail: input.embeddingsAvailable
          ? "Local embeddings provider is enabled."
          : "OpenAI-compatible embeddings route exists, but no local provider is configured."
      },
      {
        id: "documents",
        label: "Document/RAG evidence",
        status: input.documentsIndexed > 0 ? "pass" : "planned",
        detail:
          input.documentsIndexed > 0
            ? `${input.documentsIndexed} documents indexed.`
            : "Document/RAG surface is not part of the current studio build."
      }
    ],
    competitors: [
      {
        name: "Ollama",
        parity: "strong",
        covered: ["Local GGUF execution", "Ollama-style /api/chat", "/api/tags", "model discovery"],
        gaps: ["Full registry management parity still depends on catalog coverage and install flows."]
      },
      {
        name: "LM Studio",
        parity: "partial",
        covered: ["OpenAI-compatible chat", "local model loading", "runtime controls"],
        gaps: ["Desktop polish, model-card curation, and user-facing server controls need more smoke evidence."]
      },
      {
        name: "llama.cpp server",
        parity: input.delegatedServer.running ? "strong" : "partial",
        covered: ["Delegated /v1/chat/completions proxy", "stream forwarding", "optional batching backend"],
        gaps: input.delegatedServer.running ? [] : ["Start a delegated server to prove batching on this machine."]
      },
      {
        name: "Jan / LocalAI / Open WebUI",
        parity: "planned",
        covered: ["OpenAI-compatible API foundation"],
        gaps: ["Plugin ecosystems, multi-user hosting, and full admin surfaces are outside the current proof gate."]
      }
    ]
  };
}
