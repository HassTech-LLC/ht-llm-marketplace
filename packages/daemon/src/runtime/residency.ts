import type {
  EngineResidencyCandidate,
  EngineResidencyPlan,
  EngineRuntimeConfig,
  HotPoolEntry,
  ModelIndexEntry,
  RuntimeMemorySnapshot,
  SystemScan
} from "@ht-llm-marketplace/sdk";

const VRAM_SAFETY_RATIO = 0.88;
const RAM_SAFETY_RATIO = 0.75;
const KV_ESTIMATE_BYTES_PER_CONTEXT_TOKEN = 256 * 1024;
const RAM_CONTEXT_BYTES_PER_TOKEN = 96 * 1024;

export function memorySnapshotFromSystemScan(scan?: SystemScan): RuntimeMemorySnapshot {
  const totalVramBytes = sum(scan?.gpus.map((gpu) => gpu.memoryTotalBytes || 0) || []);
  const freeVramBytes = sum(scan?.gpus.map((gpu) => gpu.memoryFreeBytes || 0) || []);
  if (!scan) {
    return {
      source: "unavailable",
      totalRamBytes: 0,
      freeRamBytes: 0,
      totalVramBytes: 0,
      freeVramBytes: 0,
      gpuCount: 0,
      notes: ["System memory scan was not available for this residency decision."]
    };
  }
  return {
    source: "system-scan",
    totalRamBytes: scan.os.totalMemoryBytes,
    freeRamBytes: scan.os.freeMemoryBytes,
    totalVramBytes,
    freeVramBytes,
    gpuCount: scan.gpus.length,
    scannedAt: scan.scannedAt,
    notes: scan.notes
  };
}

export function planResidency(
  models: ModelIndexEntry[],
  config: EngineRuntimeConfig,
  currentHotEntries: HotPoolEntry[] = [],
  scan?: SystemScan
): EngineResidencyPlan {
  const memory = memorySnapshotFromSystemScan(scan);
  const maxModels = maxModelsForMode(config);
  const hotNames = new Set(currentHotEntries.filter((entry) => entry.state === "ready").map((entry) => normalize(entry.model)));
  const eligible = models
    .filter((model) => model.runnable && !model.path.startsWith("virtual:") && model.sizeBytes <= config.hotPool.maxModelBytes)
    .map((model) => candidateForModel(model, config, memory, hotNames));

  const ordered = orderCandidates(eligible, config.residencyMode);
  const selected: EngineResidencyCandidate[] = [];
  let cumulativeVram = 0;
  let cumulativeRam = 0;
  for (const candidate of ordered) {
    if (selected.length >= maxModels) break;
    const nextVram = cumulativeVram + candidate.estimatedVramBytes;
    const nextRam = cumulativeRam + candidate.estimatedRamBytes;
    const fits = candidateFits(candidate, memory, nextVram, nextRam);
    if (!fits) continue;
    selected.push({ ...candidate, action: hotNames.has(normalize(candidate.model.name)) ? "keep-hot" : "promote", willFit: true });
    cumulativeVram = nextVram;
    cumulativeRam = nextRam;
  }

  const selectedNames = new Set(selected.map((candidate) => normalize(candidate.model.name)));
  const demoted = currentHotEntries
    .filter((entry) => entry.state === "ready" && !selectedNames.has(normalize(entry.model)))
    .map((entry) => hotEntryToCandidate(entry, config, memory));
  const selectedIds = new Set(selected.map((candidate) => candidate.model.id));
  const skipped = eligible
    .filter((candidate) => !selectedIds.has(candidate.model.id))
    .map((candidate) => ({
      ...candidate,
      action: "skip" as const,
      willFit: false,
      reason: selected.length >= maxModels ? `Skipped because ${config.residencyMode} selected ${maxModels} model(s).` : candidate.reason
    }));

  return {
    mode: config.residencyMode,
    maxModels,
    maxModelBytes: config.hotPool.maxModelBytes,
    memory,
    selected,
    skipped,
    demoted,
    generatedAt: new Date().toISOString()
  };
}

export function selectResidencyModels(
  models: ModelIndexEntry[],
  config: EngineRuntimeConfig,
  currentHotEntries: HotPoolEntry[] = [],
  scan?: SystemScan
) {
  return planResidency(models, config, currentHotEntries, scan).selected.map((candidate) => candidate.model);
}

function candidateForModel(
  model: ModelIndexEntry,
  config: EngineRuntimeConfig,
  memory: RuntimeMemorySnapshot,
  hotNames: Set<string>
): EngineResidencyCandidate {
  const estimatedVramBytes = estimateVramBytes(model, config);
  const estimatedRamBytes = estimateRamBytes(model, config);
  const willFit = candidateFits({ estimatedVramBytes, estimatedRamBytes } as EngineResidencyCandidate, memory, estimatedVramBytes, estimatedRamBytes);
  return {
    model,
    estimatedRamBytes,
    estimatedVramBytes,
    eligible: true,
    willFit,
    action: hotNames.has(normalize(model.name)) ? "keep-hot" : "promote",
    reason: willFit ? "Estimated to fit within the current residency budget." : "Estimated model residency exceeds the current memory budget."
  };
}

function hotEntryToCandidate(
  entry: HotPoolEntry,
  config: EngineRuntimeConfig,
  memory: RuntimeMemorySnapshot
): EngineResidencyCandidate {
  const model: ModelIndexEntry = {
    id: entry.path || entry.model,
    name: entry.model,
    path: entry.path,
    sizeBytes: entry.sizeBytes,
    source: entry.source,
    dir: "",
    runnable: true,
    indexedAt: entry.loadedAt || new Date(0).toISOString()
  };
  return {
    model,
    estimatedRamBytes: estimateRamBytes(model, config),
    estimatedVramBytes: estimateVramBytes(model, config),
    eligible: true,
    willFit: false,
    action: "demote",
    reason: `Demoted because ${config.residencyMode} selected a higher-priority residency set.`
  };
}

function orderCandidates(candidates: EngineResidencyCandidate[], mode: EngineRuntimeConfig["residencyMode"]) {
  if (mode === "quality-single") {
    return [...candidates].sort((a, b) => b.model.sizeBytes - a.model.sizeBytes || a.model.name.localeCompare(b.model.name));
  }
  return candidates;
}

function maxModelsForMode(config: EngineRuntimeConfig) {
  if (config.residencyMode === "quality-single") return 1;
  if (config.residencyMode === "balanced") return Math.min(2, config.hotPool.maxModels);
  return config.hotPool.maxModels;
}

function estimateVramBytes(model: ModelIndexEntry, config: EngineRuntimeConfig) {
  if (config.gpuLayers === 0) return 0;
  return Math.round(model.sizeBytes * 1.08 + config.contextSize * KV_ESTIMATE_BYTES_PER_CONTEXT_TOKEN);
}

function estimateRamBytes(model: ModelIndexEntry, config: EngineRuntimeConfig) {
  return Math.round(model.sizeBytes * 1.18 + config.contextSize * RAM_CONTEXT_BYTES_PER_TOKEN);
}

function candidateFits(
  candidate: Pick<EngineResidencyCandidate, "estimatedRamBytes" | "estimatedVramBytes">,
  memory: RuntimeMemorySnapshot,
  cumulativeVram: number,
  cumulativeRam: number
) {
  if (memory.totalVramBytes > 0 && candidate.estimatedVramBytes > 0) {
    return cumulativeVram <= memory.totalVramBytes * VRAM_SAFETY_RATIO;
  }
  if (memory.totalRamBytes > 0) {
    return cumulativeRam <= memory.totalRamBytes * RAM_SAFETY_RATIO;
  }
  return true;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}
