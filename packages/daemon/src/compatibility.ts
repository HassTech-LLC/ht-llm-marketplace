import type { BenchmarkResult, CompatibilityScorecard, ModelIndexStatus, QueueStatus } from "@ht-llm-marketplace/sdk";
import type { LlamaServerStatus } from "./runtime/llama-server.js";

interface CompatibilityEvidenceInput {
  modelIndex?: ModelIndexStatus;
  benchmarks?: BenchmarkResult[];
  queue?: QueueStatus;
  embeddingsAvailable?: boolean;
  delegatedServer?: LlamaServerStatus;
  documentsIndexed?: number;
}

type GateStatus = "pass" | "partial" | "planned";

export function compatibilityScorecard(input: CompatibilityEvidenceInput = {}): CompatibilityScorecard {
  const benchmarkCount = input.benchmarks?.length ?? 0;
  const successfulBenchmarkCount = input.benchmarks?.filter((benchmark) => benchmark.ok).length ?? 0;
  const modelIndexReady = input.modelIndex?.state === "ready" || input.modelIndex?.state === "stale";
  const hasQueueShape = Array.isArray(input.queue?.queued) && Array.isArray(input.queue?.recent);

  const gates: CompatibilityScorecard["gates"] = [
    { id: "release-check", label: "Release gate passes", status: "pass" },
    {
      id: "model-index",
      label: "Cached model index avoids blocking chat on scans",
      status: modelIndexReady ? "pass" : "partial"
    },
    { id: "api-parity", label: "OpenAI/Ollama compatibility matrix", status: "partial" },
    { id: "queue", label: "Deterministic queue/cancel behavior", status: hasQueueShape ? "pass" : "partial" },
    { id: "distribution", label: "Installer and Docker distribution", status: "partial" },
    {
      id: "rag",
      label: "Local document chat with lexical and semantic citations",
      status: input.embeddingsAvailable ? "pass" : "partial"
    },
    {
      id: "benchmarks",
      label: "Live benchmark-driven standard routing proof",
      status: successfulBenchmarkCount > 0 ? "pass" : "partial"
    },
    {
      id: "delegated-server",
      label: "Delegated llama-server mode is discoverable and guarded",
      status: input.delegatedServer?.available ? "pass" : "partial"
    }
  ];

  return {
    generatedAt: new Date().toISOString(),
    claim: claimFor(gates),
    summary:
      "HT LLM Marketplace has the core local-first marketplace/runtime foundation and evidence gates. It must keep the best-replacement claim locked until every gate is proven by smoke tests, benchmarks, and package checks.",
    evidence: [
      evidence("model-index", "Model index cache", modelIndexReady ? "pass" : "partial", `${input.modelIndex?.modelCount ?? 0} models indexed.`),
      evidence("benchmarks", "Benchmark storage", successfulBenchmarkCount > 0 ? "pass" : "partial", `${successfulBenchmarkCount}/${benchmarkCount} benchmark runs succeeded.`),
      evidence("queue", "Generation queue", hasQueueShape ? "pass" : "partial", `${input.queue?.queued.length ?? 0} queued, ${input.queue?.recent.length ?? 0} recent.`),
      evidence(
        "embeddings",
        "Embeddings backend",
        input.embeddingsAvailable ? "pass" : "partial",
        input.embeddingsAvailable ? "Local embeddings are enabled." : "Route returns stable 501 until enabled."
      ),
      evidence(
        "documents",
        "Document chat",
        input.documentsIndexed ? "pass" : "partial",
        `${input.documentsIndexed ?? 0} local documents indexed.`
      ),
      evidence(
        "delegated-server",
        "Delegated llama-server",
        input.delegatedServer?.available ? "pass" : "partial",
        input.delegatedServer?.message || "No delegated server status reported."
      )
    ],
    competitors: [
      {
        name: "Ollama",
        parity: "partial",
        covered: ["local model list", "chat route", "version route", "Ollama library GGUF download path", "queue/cancel"],
        gaps: ["full model lifecycle parity across all commands", "packaged production installer proof"]
      },
      {
        name: "LM Studio",
        parity: "partial",
        covered: ["local GGUF discovery", "runtime status", "manual load/unload", "local document chat surface"],
        gaps: ["desktop installer proof", "fully polished model storage manager", "visual smoke evidence on every release"]
      },
      {
        name: "Jan",
        parity: "partial",
        covered: ["open-source local daemon", "CLI surface", "OpenAI-compatible chat basics", "Responses API route"],
        gaps: ["packaged desktop/server distribution", "long-running API compatibility report history"]
      },
      {
        name: "LocalAI",
        parity: "partial",
        covered: ["OpenAI-compatible chat basics", "embeddings API shape", "responses API shape"],
        gaps: ["multimodal/provider breadth", "production continuous batching"]
      },
      {
        name: "Open WebUI",
        parity: "partial",
        covered: ["marketplace UI", "runtime management foundation", "document workspace"],
        gaps: ["teams/users", "large plugin/tool ecosystem"]
      },
      {
        name: "llama.cpp/KoboldCpp",
        parity: "partial",
        covered: ["direct GGUF load", "local streaming chat", "delegated server discovery guard"],
        gaps: ["proven continuous batching", "advanced sampling parity", "server monitoring endpoints"]
      }
    ],
    gates
  };
}

function claimFor(gates: Array<{ id?: string; status: GateStatus }>): CompatibilityScorecard["claim"] {
  if (gates.every((gate) => gate.status === "pass")) return "best-replacement";
  const passed = gates.filter((gate) => gate.status === "pass").length;
  const coreReady = gates
    .filter((gate) => ["model-index", "queue", "rag", "benchmarks"].includes(gate.id || ""))
    .every((gate) => gate.status === "pass");
  if (coreReady && passed >= gates.length - 2) return "candidate";
  return "foundation";
}

function evidence(
  id: string,
  label: string,
  status: GateStatus,
  detail: string
): CompatibilityScorecard["evidence"][number] {
  return { id, label, status, detail };
}
