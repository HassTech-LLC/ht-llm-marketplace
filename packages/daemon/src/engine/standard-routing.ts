import type { BenchmarkResult, ModelIndexEntry, StandardRouteCandidate, StandardRouteDecision } from "@ht-llm-marketplace/sdk";

interface RouteOptions {
  loadedModel?: string;
}

export function chooseStandardModel(
  models: ModelIndexEntry[],
  benchmarks: BenchmarkResult[] = [],
  options: RouteOptions = {}
): StandardRouteDecision {
  const runnable = models.filter((model) => model.runnable && isChatModel(model));
  if (runnable.length === 0) {
    return { selected: null, reason: "No runnable local chat models are indexed.", candidates: [] };
  }

  const candidates = runnable
    .map((model) => scoreCandidate(model, benchmarksForModel(model, benchmarks), options))
    .sort((a, b) => a.score - b.score || a.model.name.localeCompare(b.model.name));

  const healthy = candidates.filter((candidate) => candidate.healthy);
  const physical = healthy.filter((candidate) => !isVirtualModel(candidate.model));
  const automaticPhysical = physical.filter((candidate) => isAutomaticRouteModel(candidate.model));
  const automaticFallback = healthy.filter((candidate) => isAutomaticRouteModel(candidate.model));
  const pool = automaticPhysical.length > 0 ? automaticPhysical : automaticFallback;
  const selected = pool[0]?.model ?? null;

  return {
    selected,
    reason: selected
      ? `Selected ${selected.name} as the fastest healthy standard-route model.`
      : healthy.length > 0
        ? "Runnable models are indexed, but none are trusted for automatic standard routing."
        : "All indexed models are currently failing benchmarks.",
    candidates
  };
}

function scoreCandidate(
  model: ModelIndexEntry,
  benchmarks: BenchmarkResult[],
  options: RouteOptions
): StandardRouteCandidate {
  const ok = benchmarks.filter((benchmark) => benchmark.ok);
  const failed = benchmarks.length - ok.length;
  const failureRate = benchmarks.length ? failed / benchmarks.length : 0;
  const firstTokenMs = average(ok.map((benchmark) => benchmark.firstTokenMs).filter((value) => value > 0));
  const totalMs = average(ok.map((benchmark) => benchmark.totalMs).filter((value) => value > 0));
  const tokensPerSecond = average(ok.map((benchmark) => benchmark.tokensPerSecond).filter((value) => value > 0));
  const sizeGb = Math.max(0.1, model.sizeBytes / 1_000_000_000);
  const loadedBonus = options.loadedModel && normalize(options.loadedModel) === normalize(model.name) ? -250 : 0;
  const benchmarkPenalty = benchmarks.length === 0 ? 600 : 0;
  const latency = firstTokenMs ?? Math.min(8_000, 350 + sizeGb * 175);
  const throughputBonus = tokensPerSecond ? Math.min(250, tokensPerSecond * 4) : 0;
  const virtualPenalty = isVirtualModel(model) ? 500 : 0;
  const score = latency + (totalMs ?? latency) * 0.08 + sizeGb * 35 + failureRate * 3_000 + benchmarkPenalty + virtualPenalty + loadedBonus - throughputBonus;
  const healthy = benchmarks.length === 0 || failureRate <= 0.34 || ok.length > 0;

  return {
    model,
    score: Number(score.toFixed(2)),
    healthy,
    firstTokenMs,
    totalMs,
    tokensPerSecond,
    failureRate: Number(failureRate.toFixed(3)),
    reason:
      benchmarks.length === 0
        ? "No benchmark yet; using size and runtime readiness fallback."
        : `${ok.length}/${benchmarks.length} recent benchmark runs succeeded.`
  };
}

function benchmarksForModel(model: ModelIndexEntry, benchmarks: BenchmarkResult[]) {
  const names = new Set([normalize(model.name), normalize(model.id), normalize(model.path)]);
  return benchmarks
    .filter((benchmark) => names.has(normalize(benchmark.model)))
    .slice(0, 20);
}

function average(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function isVirtualModel(model: ModelIndexEntry) {
  return model.path.startsWith("virtual:") || model.source.toLowerCase().includes("virtual");
}

function isAutomaticRouteModel(model: ModelIndexEntry) {
  if (model.autoWarmEligible === false || model.trustLevel === "ambient") return false;
  return true;
}

function isChatModel(model: ModelIndexEntry) {
  if (!isVirtualModel(model) && model.sizeBytes < 1_000_000) return false;
  const haystack = `${model.name} ${model.id} ${model.path} ${model.source}`.toLowerCase();
  return !/(^|[^a-z])(embed|embedding|embeddings|nomic|bge|e5|gte|jina-embeddings|sentence-transformers|clip|llava|bakllava|moondream|vision)([^a-z]|$)/.test(haystack);
}
