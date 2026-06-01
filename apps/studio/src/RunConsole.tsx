import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MarketplaceClient,
  type BenchmarkResult,
  type DiscoveredModel,
  type EngineResidencyPlan,
  type EngineRuntimeConfig,
  type HotPoolStatus,
  type LlamaServerPoolStatus,
  type LlamaServerStatus,
  type QueueStatus,
  type RuntimeModel,
  type StandardRouteDecision,
  type SystemScan
} from "@ht-llm-marketplace/sdk";
import { studioApiUrl } from "./api";

const CopyIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>
);

const CheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', color: 'var(--ht-cyan, #00f0ff)' }}>
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
);

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };
  return (
    <button 
      className={`run-copy-btn${copied ? " copied" : ""}`}
      onClick={handleCopy}
      title="Copy response to clipboard"
      style={{
        position: 'absolute',
        right: '8px',
        top: '6px',
        background: 'rgba(255, 255, 255, 0.04)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        color: 'var(--ht-muted)',
        borderRadius: '6px',
        width: '26px',
        height: '26px',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.15s ease-in-out',
        backdropFilter: 'blur(4px)',
        zIndex: 5
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
        e.currentTarget.style.color = 'var(--ht-cyan)';
        e.currentTarget.style.borderColor = 'var(--ht-accent-line)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
        e.currentTarget.style.color = 'var(--ht-muted)';
        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
};

const client = new MarketplaceClient({ apiUrl: studioApiUrl() });

const FAILED_KEY = "htlm:failedModels";
const STANDARD_KEEP_ALIVE = "30m";
const STANDARD_CONTEXT = 512;
export const ICON_LABELS_STORAGE_KEY = "htlm:iconLabels";
export const ICON_LABELS_EVENT = "htlm:icon-labels-changed";
const AUTO_WARM_STORAGE_KEY = "htlm:autoWarm";

const RUN_ICONS = {
  active: "\u25cf",
  bolt: "\u26a1\ufe0f",
  bulb: "\ud83d\udca1",
  check: "\u2713",
  play: "\u25b6",
  rocket: "\ud83d\ude80",
  stop: "\u23f9",
  warning: "\u26a0\ufe0f"
};

const PRESETS = [
  { id: "fast", label: "Fast Chat", contextSize: 512, maxTokens: 96, temperature: 0.5 },
  { id: "coding", label: "Coding", contextSize: 4096, maxTokens: 1024, temperature: 0.2 },
  { id: "long", label: "Long Context", contextSize: 8192, maxTokens: 2048, temperature: 0.4 },
  { id: "json", label: "JSON/API", contextSize: 2048, maxTokens: 512, temperature: 0.1 },
  { id: "creative", label: "Creative", contextSize: 2048, maxTokens: 1024, temperature: 0.9 }
] as const;

type PresetId = (typeof PRESETS)[number]["id"];

export interface PendingLoad {
  artifactId?: string;
  path?: string;
  label: string;
}

interface RunConsoleProps {
  active: boolean;
  pendingLoad: PendingLoad | null;
  onPendingLoadHandled: () => void;
}

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  timing?: RunTiming;
  preset?: string;
}

interface RunTiming {
  model: string;
  backend: string;
  firstTokenMs?: number;
  totalMs?: number;
  tokensApprox?: number;
  tokensPerSecond?: number;
  queueDepthAtStart: number;
  generatedAt: string;
}

interface ComparisonResult {
  model: string;
  ok: boolean;
  firstTokenMs?: number;
  totalMs?: number;
  tokensPerSecond?: number;
  error?: string;
}

function formatBytes(bytes?: number): string {
  if (!bytes) return "";
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`;
}

function formatModelName(name: string): string {
  if (!name) return "";
  // Strip double underscores and training run metadata
  let cleaned = name.split("__")[0];
  // Strip Hugging Face snapshot hashes
  cleaned = cleaned.replace(/-snapshots-[a-f0-9]+(-[a-f0-9]+)?/gi, "");
  // Strip duplicate vendor name prefixes like Qwen--Qwen
  cleaned = cleaned.replace(/^(qwen|llama|gemma|mistral|deepseek)-+\1/i, (m) => {
    const parts = m.split(/-+/);
    return parts[0];
  });
  // Strip .gguf extension
  cleaned = cleaned.replace(/\.gguf$/i, "");
  return cleaned;
}

function readFailed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(FAILED_KEY) || "[]") as string[];
  } catch {
    return [];
  }
}

function readIconLabels(): boolean {
  try {
    return localStorage.getItem(ICON_LABELS_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

function readAutoWarm(): boolean {
  try {
    return localStorage.getItem(AUTO_WARM_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

function defaultThreadCount() {
  try {
    return navigator.hardwareConcurrency || 4;
  } catch {
    return 4;
  }
}

function clampUiNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function estimateTokens(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words * 1.33));
}

function formatLatency(value?: number) {
  return typeof value === "number" ? `${value}ms` : "n/a";
}

export function RunConsole({ active, pendingLoad, onPendingLoadHandled }: RunConsoleProps) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [ollamaOnline, setOllamaOnline] = useState(false);
  const [standardRoute, setStandardRoute] = useState<StandardRouteDecision | undefined>();
  const [standardRouteError, setStandardRouteError] = useState<string | undefined>();
  const [customOllamaModel, setCustomOllamaModel] = useState<RuntimeModel | undefined>();
  const [preferLoadedModel, setPreferLoadedModel] = useState(false);
  const [gpu, setGpu] = useState<string | false>(false);
  const [loaded, setLoaded] = useState<string | undefined>();
  const [loadedPath, setLoadedPath] = useState<string | undefined>();
  const [models, setModels] = useState<DiscoveredModel[]>([]);
  const [scanning, setScanning] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [pathInput, setPathInput] = useState("");
  const [draftModelPath, setDraftModelPath] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [failed, setFailed] = useState<string[]>(() => readFailed());
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [fullChatCopied, setFullChatCopied] = useState(false);
  const [contextSize, setContextSize] = useState<number>(2048);
  const [threads, setThreads] = useState<number>(() => defaultThreadCount());
  const [gpuLayers, setGpuLayers] = useState<number>(-1);
  const [maxTokens, setMaxTokens] = useState<number>(512);
  const [temperature, setTemperature] = useState<number>(0.7);
  const [preset, setPreset] = useState<PresetId>("fast");
  const [runtimeControlsDirty, setRuntimeControlsDirty] = useState(false);
  const [keepWarm, setKeepWarm] = useState(true);
  const [backend, setBackend] = useState<EngineRuntimeConfig["backend"]>("in-process");
  const [residencyMode, setResidencyMode] = useState<EngineRuntimeConfig["residencyMode"]>("balanced");
  const [delegatedEnabled, setDelegatedEnabled] = useState(false);
  const [delegatedPort, setDelegatedPort] = useState(8080);
  const [delegatedParallel, setDelegatedParallel] = useState(4);
  const [delegatedBatching, setDelegatedBatching] = useState(true);
  const [hotPoolEnabled, setHotPoolEnabled] = useState(true);
  const [hotPoolMaxModels, setHotPoolMaxModels] = useState(2);
  const [hotPoolMaxGb, setHotPoolMaxGb] = useState(2);
  const [iconLabels, setIconLabels] = useState(() => readIconLabels());
  const [autoWarm, setAutoWarm] = useState(() => readAutoWarm());
  const [warmStatus, setWarmStatus] = useState<string | undefined>();
  const [benchmark, setBenchmark] = useState<BenchmarkResult | undefined>();
  const [lastRun, setLastRun] = useState<RunTiming | undefined>();
  const [comparison, setComparison] = useState<ComparisonResult[]>([]);
  const [queue, setQueue] = useState<QueueStatus | undefined>();
  const [runtimeConfig, setRuntimeConfig] = useState<EngineRuntimeConfig | undefined>();
  const [serverStatus, setServerStatus] = useState<LlamaServerStatus | undefined>();
  const [serverPool, setServerPool] = useState<LlamaServerPoolStatus | undefined>();
  const [hotPool, setHotPool] = useState<HotPoolStatus | undefined>();
  const [residencyPlan, setResidencyPlan] = useState<EngineResidencyPlan | undefined>();
  const [systemScan, setSystemScan] = useState<SystemScan | undefined>();
  const streamRef = useRef<HTMLDivElement>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const abortControllerRef = useRef<AbortController | null>(null);
  const warmedTarget = useRef<string | undefined>(undefined);

  const isFailed = useCallback(
    (path: string) => failed.some((entry) => entry.toLowerCase() === path.toLowerCase()),
    [failed]
  );

  const rememberFailure = useCallback((path: string | undefined, didFail: boolean) => {
    if (!path) return;
    setFailed((prev) => {
      const without = prev.filter((entry) => entry.toLowerCase() !== path.toLowerCase());
      const next = didFail ? [...without, path] : without;
      try {
        localStorage.setItem(FAILED_KEY, JSON.stringify(next));
      } catch {
        /* ignore quota errors */
      }
      return next;
    });
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const { runtimes } = await client.runtimes();
      const engine = runtimes.find((runtime) => runtime.id === "llamacpp");
      const ollama = runtimes.find((runtime) => runtime.id === "ollama");
      const nextLoadedModel = engine?.loadedModels?.[0];
      const [configResult, serverResult, poolResult, routeResult, queueResult, scanResult, hotPoolResult, residencyResult] = await Promise.allSettled([
        client.engineConfig(),
        client.engineServerStatus(),
        client.engineServerPoolStatus(),
        client.standardRoute(),
        client.queueStatus(),
        client.systemScan(),
        client.hotPoolStatus(),
        client.engineResidency()
      ]);
      if (configResult.status === "fulfilled") setRuntimeConfig(configResult.value.config);
      if (serverResult.status === "fulfilled") setServerStatus(serverResult.value);
      if (poolResult.status === "fulfilled") setServerPool(poolResult.value);
      if (queueResult.status === "fulfilled") setQueue(queueResult.value);
      if (scanResult.status === "fulfilled") setSystemScan(scanResult.value);
      if (hotPoolResult.status === "fulfilled") setHotPool(hotPoolResult.value);
      if (residencyResult.status === "fulfilled") setResidencyPlan(residencyResult.value.plan);
      if (routeResult.status === "fulfilled") {
        setStandardRoute(routeResult.value);
        setStandardRouteError(undefined);
      } else {
        setStandardRoute(undefined);
        setStandardRouteError((routeResult.reason as Error).message);
      }
      setAvailable(Boolean(engine?.installed));
      setOllamaOnline(Boolean(ollama?.online));
      setPreferLoadedModel((current) => {
        if (nextLoadedModel?.name) return true;
        return current;
      });
      setGpu(engine?.version?.startsWith("gpu:") ? engine.version.slice(4) : false);
      setLoaded(nextLoadedModel?.name);
      setLoadedPath(nextLoadedModel?.path);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  const saveRuntimeControls = useCallback(async () => {
    setBusy("Saving runtime controls...");
    setError(undefined);
    try {
      const payload = await client.updateEngineConfig({
        ...(runtimeConfig ?? {}),
        keepWarm,
        contextSize,
        threads,
        gpuLayers: gpuLayers === -1 ? "auto" : gpuLayers,
        draftModel: draftModelPath || null,
        backend,
        residencyMode,
        delegatedServer: {
          enabled: delegatedEnabled,
          port: delegatedPort,
          parallel: delegatedParallel,
          continuousBatching: delegatedBatching
        },
        hotPool: {
          enabled: hotPoolEnabled,
          maxModels: hotPoolMaxModels,
          maxModelBytes: Math.round(hotPoolMaxGb * 1024 ** 3),
          autoWarm
        }
      });
      setRuntimeConfig(payload.config);
      setRuntimeControlsDirty(false);
      const status = await client.engineServerStatus();
      setServerStatus(status);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }, [
    backend,
    contextSize,
    delegatedBatching,
    delegatedEnabled,
    delegatedParallel,
    delegatedPort,
    draftModelPath,
    gpuLayers,
    hotPoolEnabled,
    hotPoolMaxGb,
    hotPoolMaxModels,
    keepWarm,
    residencyMode,
    runtimeConfig,
    threads
  ]);

  const installLlamaServer = useCallback(async () => {
    setBusy("Installing llama-server...");
    setError(undefined);
    try {
      const result = await client.installEngineServer({ flavor: "auto" });
      const status = await client.engineServerStatus();
      setServerStatus(status);
      setWarmStatus(result.message);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }, []);

  const startLlamaServer = useCallback(async () => {
    setBusy("Starting llama-server...");
    setError(undefined);
    try {
      if (runtimeControlsDirty) await saveRuntimeControls();
      const status = await client.startEngineServer();
      setServerStatus(status);
      if (!status.running) setError(status.message);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }, [runtimeControlsDirty, saveRuntimeControls]);

  const stopLlamaServer = useCallback(async () => {
    setBusy("Stopping llama-server...");
    setError(undefined);
    try {
      const status = await client.stopEngineServer();
      setServerStatus(status);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }, []);

  const warmLlamaServerPool = useCallback(async () => {
    setBusy("Warming llama-server pool...");
    setError(undefined);
    try {
      if (runtimeControlsDirty) await saveRuntimeControls();
      const status = await client.warmEngineServerPool();
      setServerPool(status);
      await refreshStatus();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }, [refreshStatus, runtimeControlsDirty, saveRuntimeControls]);

  const stopLlamaServerPool = useCallback(async () => {
    setBusy("Stopping llama-server pool...");
    setError(undefined);
    try {
      const status = await client.stopEngineServerPool();
      setServerPool(status);
      await refreshStatus();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }, [refreshStatus]);

  const setIconLabelsPreference = useCallback((next: boolean) => {
    setIconLabels(next);
    try {
      localStorage.setItem(ICON_LABELS_STORAGE_KEY, String(next));
      window.dispatchEvent(new CustomEvent(ICON_LABELS_EVENT, { detail: next }));
    } catch {
      /* storage unavailable; preference still applies for this session */
    }
  }, []);

  const setAutoWarmPreference = useCallback((next: boolean) => {
    setAutoWarm(next);
    try {
      localStorage.setItem(AUTO_WARM_STORAGE_KEY, String(next));
    } catch {
      /* storage unavailable; preference still applies for this session */
    }
  }, []);

  const scan = useCallback(async () => {
    setScanning(true);
    try {
      const { models: found } = await client.engineModels();
      setModels(found);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setScanning(false);
    }
  }, []);

  // Auto-refresh whenever the tab becomes active (e.g. right after a download).
  useEffect(() => {
    if (active) {
      void (async () => {
        await refreshStatus();
        await scan();
        await refreshStatus();
      })();
    }
  }, [active, refreshStatus, scan]);

  useEffect(() => {
    if (!runtimeConfig || runtimeControlsDirty) return;
    setContextSize(runtimeConfig.contextSize);
    setThreads(runtimeConfig.threads === "auto" ? defaultThreadCount() : runtimeConfig.threads);
    setGpuLayers(runtimeConfig.gpuLayers === "auto" ? -1 : runtimeConfig.gpuLayers);
    setDraftModelPath(runtimeConfig.draftModel || "");
    setKeepWarm(runtimeConfig.keepWarm);
    setBackend(runtimeConfig.backend);
    setResidencyMode(runtimeConfig.residencyMode || "balanced");
    setDelegatedEnabled(runtimeConfig.delegatedServer.enabled);
    setDelegatedPort(runtimeConfig.delegatedServer.port);
    setDelegatedParallel(runtimeConfig.delegatedServer.parallel);
    setDelegatedBatching(runtimeConfig.delegatedServer.continuousBatching);
    setHotPoolEnabled(runtimeConfig.hotPool.enabled);
    setHotPoolMaxModels(runtimeConfig.hotPool.maxModels);
    setHotPoolMaxGb(Number((runtimeConfig.hotPool.maxModelBytes / 1024 ** 3).toFixed(1)));
    setAutoWarm(runtimeConfig.hotPool.autoWarm);
  }, [runtimeConfig, runtimeControlsDirty]);

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    const refreshQueue = async () => {
      try {
        const payload = await client.queueStatus();
        if (!stopped) setQueue(payload);
      } catch {
        /* daemon may be restarting */
      }
    };
    void refreshQueue();
    const timer = setInterval(() => void refreshQueue(), generating ? 1000 : 3000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [active, generating]);

  useEffect(() => {
    streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight });
  }, [turns]);

  const owned = useMemo(() => models.filter((model) => model.source === "marketplace"), [models]);

  const draftModels = useMemo(() => {
    return models.filter((model) => model.source !== "Ollama" && model.sizeBytes > 0 && model.sizeBytes < 2.5 * 1024 ** 3);
  }, [models]);

  const filtered = useMemo(() => {
    if (!isTyping) return models.slice(0, 200);
    const term = query.trim().toLowerCase();
    const matches = term
      ? models.filter((model) => `${model.name} ${model.dir} ${model.source}`.toLowerCase().includes(term))
      : models;
    return matches.slice(0, 200);
  }, [models, query, isTyping]);

  const backendStandardModel = standardRoute?.selected || undefined;
  const shouldUseOllamaModel = !preferLoadedModel && Boolean(customOllamaModel) && ollamaOnline;
  const shouldUseBackendStandardRoute = !preferLoadedModel && !customOllamaModel && Boolean(backendStandardModel);
  const usingLoadedModel = !shouldUseOllamaModel && !shouldUseBackendStandardRoute && Boolean(loaded);
  const chatReady = shouldUseOllamaModel || shouldUseBackendStandardRoute || usingLoadedModel;
  const benchmarkTarget = usingLoadedModel ? loaded : shouldUseBackendStandardRoute ? backendStandardModel?.name : undefined;
  const queueRunning = queue?.running;
  const queuedItems = queue?.queued ?? [];
  const showQueue = Boolean(queueRunning) || queuedItems.length > 0;
  const queueDepth = queuedItems.length + (queueRunning ? 1 : 0);
  const gpuSummary = systemScan?.gpus?.[0];
  const runtimeHealth = [
    available ? "Engine installed" : "Engine missing",
    gpu ? `GPU ${gpu}` : "CPU path",
    serverStatus?.running ? `llama-server ${serverStatus.endpoint || "online"}` : "llama-server offline",
    runtimeConfig?.keepWarm ? "keep-warm on" : "keep-warm off",
    hotPool?.enabled ? `${hotPool.entries.filter((entry) => entry.state === "ready").length}/${hotPool.maxModels} hot` : "hot pool off"
  ];
  const assistantLabel = shouldUseOllamaModel
    ? customOllamaModel?.displayName || customOllamaModel?.name || "Model"
    : shouldUseBackendStandardRoute
      ? backendStandardModel?.name || "HT route"
      : loaded || "Model";
  const inputPlaceholder = shouldUseOllamaModel || shouldUseBackendStandardRoute
    ? "Type a message and press Enter..."
    : loaded
      ? "Type a message and press Enter..."
      : standardRouteError
        ? "Standard route unavailable"
        : "Load a model first";

  const applyPreset = useCallback((id: PresetId) => {
    const next = PRESETS.find((item) => item.id === id);
    if (!next) return;
    setPreset(id);
    setContextSize(next.contextSize);
    setMaxTokens(next.maxTokens);
    setTemperature(next.temperature);
    setRuntimeControlsDirty(true);
  }, []);

  const readinessForModel = useCallback(
    (model: DiscoveredModel) => {
      const notes: string[] = [];
      let level: "ready" | "active" | "warn" | "blocked" = "ready";
      const isCurrent =
        (loadedPath && model.path && loadedPath.toLowerCase() === model.path.toLowerCase()) ||
        (loaded && loaded.toLowerCase() === model.name.toLowerCase());
      if (isCurrent) {
        level = "active";
        notes.push("active");
      }
      if (isFailed(model.path)) {
        level = "warn";
        notes.push("failed before");
      }
      if (model.source === "Ollama") {
        notes.push(ollamaOnline ? "Ollama ready" : "Ollama offline");
        if (!ollamaOnline) level = "warn";
      } else if (model.sizeBytes > 0) {
        const gpuFree = gpuSummary?.memoryFreeBytes || gpuSummary?.memoryTotalBytes || 0;
        if (gpuFree && model.sizeBytes > gpuFree * 0.9) {
          notes.push("CPU-safe / GPU tight");
          if (level === "ready") level = "warn";
        } else if (gpuFree) {
          notes.push("GPU fit likely");
        } else {
          notes.push("CPU runnable");
        }
      }
      if (!available && model.source !== "Ollama") {
        level = "blocked";
        notes.push("runtime missing");
      }
      return { level, notes: notes.slice(0, 2) };
    },
    [available, gpuSummary?.memoryFreeBytes, gpuSummary?.memoryTotalBytes, isFailed, loaded, loadedPath, ollamaOnline]
  );

  const load = useCallback(
    async (request: { artifactId?: string; path?: string }, label: string) => {
      setOpen(false);
      setError(undefined);
      setBusy(`Loading ${label}... (reads several GB into VRAM on first load)`);
      try {
        await client.loadEngineModel({
          ...request,
          contextSize,
          threads,
          gpuLayers: gpuLayers === -1 ? undefined : gpuLayers,
          draftModelPath: draftModelPath || undefined
        });
        rememberFailure(request.path, false);
        setPreferLoadedModel(true);
        setTurns([]);
      } catch (err) {
        rememberFailure(request.path, true);
        setError(`Could not load ${label}: ${(err as Error).message}`);
      } finally {
        // Always re-sync so the loaded pill reflects reality after a failed load.
        await Promise.all([refreshStatus(), scan()]);
        setBusy(null);
      }
    },
    [refreshStatus, scan, rememberFailure, contextSize, threads, gpuLayers, draftModelPath]
  );

  // One-click hand-off from a download-complete toast.
  useEffect(() => {
    if (!pendingLoad) return;
    void (async () => {
      await load({ artifactId: pendingLoad.artifactId, path: pendingLoad.path }, pendingLoad.label);
      onPendingLoadHandled();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingLoad]);

  const unload = useCallback(async () => {
    setBusy("Unloading...");
    try {
      await client.unloadEngineModel();
      await Promise.all([refreshStatus(), scan()]);
      setPreferLoadedModel(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }, [refreshStatus, scan]);

  const handleSelfHeal = useCallback(async () => {
    setError(undefined);
    setBusy("Self-healing & upgrading HT Studio Engine to support new architectures...");
    try {
      const res = await fetch(`${client.apiUrl}/api/engine/upgrade`, {
        method: "POST",
        headers: { "x-ht-marketplace-confirm": "privileged-action" }
      });
      const data = await res.json();
      if (data.ok) {
        setBusy("Self-healing launched! Upgrading node-llama-cpp and compiling with native acceleration in the background. Please wait ~1-2 minutes, then click Rescan and Reload.");
      } else {
        setError(`Self-healing failed: ${data.error || "Unknown error"}`);
        setBusy(null);
      }
    } catch (err) {
      setError(`Self-healing failed: ${(err as Error).message}`);
      setBusy(null);
    }
  }, []);

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setGenerating(false);
  }, []);

  const cancelQueueItem = useCallback(
    async (id: string) => {
      setError(undefined);
      try {
        await client.cancelGeneration(id);
        const queuePayload = await client.queueStatus();
        setQueue(queuePayload);
        if (queue?.running?.id === id || queue?.runningItems?.some((item) => item.id === id)) {
          stopGeneration();
        }
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [queue, stopGeneration]
  );

  const copyFullChat = useCallback(async () => {
    if (turns.length === 0) return;
    const formattedTranscript = turns
      .map((turn) => {
        const roleName = turn.role === "user" ? "User" : assistantLabel;
        let block = `### ${roleName}\n\n`;
        if (turn.thinking) {
          block += `> **Thinking Process:**\n> ${turn.thinking.split("\n").join("\n> ")}\n\n`;
        }
        block += `${turn.content}\n`;
        return block;
      })
      .join("\n---\n\n");

    try {
      await navigator.clipboard.writeText(formattedTranscript);
      setFullChatCopied(true);
      setTimeout(() => setFullChatCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy full chat:", err);
    }
  }, [turns, assistantLabel]);

  const runSpeedCheck = useCallback(async () => {
    setBusy("Running speed check...");
    setError(undefined);
    try {
      const payload = await client.runBenchmark({ model: benchmarkTarget, prompt: "hi" });
      setBenchmark(payload.benchmark);
      setLastRun({
        model: payload.benchmark.model,
        backend: shouldUseBackendStandardRoute ? "standard route" : usingLoadedModel ? "loaded llama.cpp" : "benchmark",
        firstTokenMs: payload.benchmark.firstTokenMs,
        totalMs: payload.benchmark.totalMs,
        tokensApprox: payload.benchmark.tokenCount,
        tokensPerSecond: payload.benchmark.tokensPerSecond,
        queueDepthAtStart: queueDepth,
        generatedAt: new Date().toISOString()
      });
      const queuePayload = await client.queueStatus();
      setQueue(queuePayload);
      await refreshStatus();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }, [benchmarkTarget, queueDepth, refreshStatus, shouldUseBackendStandardRoute, usingLoadedModel]);

  const warmStandardRoute = useCallback(async (mode: "quiet" | "manual" = "manual") => {
    if (!benchmarkTarget) return;
    if (mode === "manual") setBusy("Warming standard route...");
    setWarmStatus(`Warming ${benchmarkTarget}...`);
    try {
      const poolStatus = await client.warmHotPool();
      setHotPool(poolStatus);
      const payload = await client.runBenchmark({ model: benchmarkTarget, prompt: "hi" });
      warmedTarget.current = benchmarkTarget;
      setBenchmark(payload.benchmark);
      setLastRun({
        model: payload.benchmark.model,
        backend: shouldUseBackendStandardRoute ? "standard route warmup" : "loaded model warmup",
        firstTokenMs: payload.benchmark.firstTokenMs,
        totalMs: payload.benchmark.totalMs,
        tokensApprox: payload.benchmark.tokenCount,
        tokensPerSecond: payload.benchmark.tokensPerSecond,
        queueDepthAtStart: queueDepth,
        generatedAt: new Date().toISOString()
      });
      setWarmStatus(`Warm: ${payload.benchmark.model}`);
    } catch (err) {
      setWarmStatus(`Warmup skipped: ${(err as Error).message}`);
      if (mode === "manual") setError((err as Error).message);
    } finally {
      if (mode === "manual") setBusy(null);
    }
  }, [benchmarkTarget, queueDepth, shouldUseBackendStandardRoute]);

  useEffect(() => {
    if (!active || !autoWarm || !benchmarkTarget || warmedTarget.current === benchmarkTarget || busy) return;
    void warmStandardRoute("quiet");
  }, [active, autoWarm, benchmarkTarget, busy, warmStandardRoute]);

  const optimizeForThisPc = useCallback(async () => {
    setBusy("Optimizing for this PC...");
    setError(undefined);
    try {
      const scanPayload = await client.systemScan();
      setSystemScan(scanPayload);
      const cpuCount = scanPayload.os.cpuCount || defaultThreadCount();
      const nextThreads = clampUiNumber(Math.max(1, cpuCount - 1), 1, 64);
      const nextConfig = await client.updateEngineConfig({
        ...(runtimeConfig ?? {}),
        keepWarm: true,
        contextSize: 512,
        threads: nextThreads,
        gpuLayers: "auto",
        draftModel: draftModelPath || null,
        backend,
        residencyMode: "fast-parallel",
        delegatedServer: {
          enabled: delegatedEnabled,
          port: delegatedPort,
          parallel: delegatedParallel,
          continuousBatching: delegatedBatching
        },
        hotPool: {
          enabled: true,
          maxModels: 2,
          maxModelBytes: Math.round(hotPoolMaxGb * 1024 ** 3),
          autoWarm
        }
      });
      setRuntimeConfig(nextConfig.config);
      setKeepWarm(true);
      setContextSize(512);
      setThreads(nextThreads);
      setGpuLayers(-1);
      setMaxTokens(96);
      setTemperature(0.5);
      setPreset("fast");
      setResidencyMode("fast-parallel");
      setHotPoolEnabled(true);
      setHotPoolMaxModels(2);
      setRuntimeControlsDirty(false);
      await refreshStatus();
      if (benchmarkTarget) await warmStandardRoute("quiet");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }, [
    backend,
    benchmarkTarget,
    delegatedBatching,
    delegatedEnabled,
    delegatedParallel,
    delegatedPort,
    draftModelPath,
    autoWarm,
    hotPoolMaxGb,
    refreshStatus,
    runtimeConfig,
    warmStandardRoute
  ]);

  const runComparison = useCallback(async () => {
    const candidates = [
      benchmarkTarget,
      ...owned.filter((model) => !isFailed(model.path)).map((model) => model.name)
    ].filter((item): item is string => Boolean(item));
    const unique = Array.from(new Set(candidates)).slice(0, 3);
    if (!unique.length) return;
    setBusy("Comparing local models...");
    setComparison([]);
    setError(undefined);
    try {
      const results: ComparisonResult[] = [];
      for (const model of unique) {
        try {
          const payload = await client.runBenchmark({ model, prompt: "hi" });
          results.push({
            model,
            ok: payload.benchmark.ok,
            firstTokenMs: payload.benchmark.firstTokenMs,
            totalMs: payload.benchmark.totalMs,
            tokensPerSecond: payload.benchmark.tokensPerSecond,
            error: payload.benchmark.error
          });
        } catch (err) {
          results.push({ model, ok: false, error: (err as Error).message });
        }
        setComparison([...results]);
      }
    } finally {
      setBusy(null);
      await refreshStatus();
    }
  }, [benchmarkTarget, isFailed, owned, refreshStatus]);

  const runChat = useCallback(async (content: string, baseTurns: ChatTurn[]) => {
    if (!content || generating || !chatReady) return;
    setInput("");
    const history: ChatTurn[] = [...baseTurns, { role: "user", content }];
    setTurns([...history, { role: "assistant", content: "" }]);
    setGenerating(true);
    setError(undefined);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const startedAt = performance.now();
    const queueDepthAtStart = queueDepth;
    let firstTokenMs: number | undefined;

    try {
      const request =
        shouldUseOllamaModel && customOllamaModel
          ? {
              runtime: "ollama",
              model: customOllamaModel.name,
              stream: true,
              keep_alive: STANDARD_KEEP_ALIVE,
              options: { num_ctx: STANDARD_CONTEXT, num_predict: maxTokens, temperature },
              messages: history
            }
          : { runtime: "llamacpp", stream: true, messages: history, maxTokens, temperature };
      const response = await client.chat(request, { signal: controller.signal });
      if (!response.ok || !response.body) throw new Error(`Chat failed with ${response.status}`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistant = "";
      let assistantThinking = "";
      let raf = 0;
      const applyAssistant = (nextContent: string, nextThinking: string) => {
        setTurns((current) => {
          const copy = [...current];
          copy[copy.length - 1] = { 
            role: "assistant", 
            content: nextContent, 
            thinking: nextThinking || undefined 
          };
          return copy;
        });
      };
      const scheduleAssistant = () => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          applyAssistant(assistant, assistantThinking);
        });
      };
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let parsed: { message?: { content?: string; thinking?: string; reasoning_content?: string }; error?: string };
          try {
            parsed = JSON.parse(line);
          } catch {
            continue;
          }
          if (parsed.error) {
            setError(parsed.error);
            continue;
          }
          const piece = parsed.message?.content ?? "";
          const thinkingPiece = parsed.message?.thinking ?? (parsed.message as any)?.reasoning_content ?? "";
          if (piece || thinkingPiece) {
            if (firstTokenMs === undefined) firstTokenMs = Math.round(performance.now() - startedAt);
            if (piece) assistant += piece;
            if (thinkingPiece) assistantThinking += thinkingPiece;
            scheduleAssistant();
          }
        }
      }
      if (raf) cancelAnimationFrame(raf);
      const totalMs = Math.round(performance.now() - startedAt);
      const tokensApprox = estimateTokens(assistant);
      const timing: RunTiming = {
        model: assistantLabel,
        backend: shouldUseOllamaModel ? "Ollama" : shouldUseBackendStandardRoute ? "standard route" : "loaded llama.cpp",
        firstTokenMs,
        totalMs,
        tokensApprox,
        tokensPerSecond: Number((tokensApprox / Math.max(totalMs / 1000, 0.001)).toFixed(2)),
        queueDepthAtStart,
        generatedAt: new Date().toISOString()
      };
      setLastRun(timing);
      setTurns((current) => {
        const copy = [...current];
        copy[copy.length - 1] = {
          role: "assistant",
          content: assistant,
          thinking: assistantThinking || undefined,
          timing,
          preset
        };
        return copy;
      });
    } catch (err) {
      if ((err as Error).name === "AbortError" || (err as Error).message?.includes("aborted")) {
        // Ignored
      } else {
        setError((err as Error).message);
      }
    } finally {
      setGenerating(false);
      abortControllerRef.current = null;
      void refreshStatus();
    }
  }, [
    assistantLabel,
    chatReady,
    customOllamaModel,
    generating,
    maxTokens,
    preset,
    queueDepth,
    refreshStatus,
    shouldUseBackendStandardRoute,
    shouldUseOllamaModel,
    temperature
  ]);

  const send = useCallback(async () => {
    await runChat(input.trim(), turns);
  }, [input, runChat, turns]);

  const regenerateLast = useCallback(async () => {
    const lastUserIndex = turns.map((turn) => turn.role).lastIndexOf("user");
    if (lastUserIndex < 0) return;
    const prompt = turns[lastUserIndex].content;
    await runChat(prompt, turns.slice(0, lastUserIndex));
  }, [runChat, turns]);

  const editUserTurn = useCallback((index: number) => {
    const turn = turns[index];
    if (!turn || turn.role !== "user") return;
    setInput(turn.content);
    setTurns(turns.slice(0, index));
  }, [turns]);

  const branchAt = useCallback((index: number) => {
    setTurns(turns.slice(0, index + 1));
  }, [turns]);

  const clearChat = useCallback(() => {
    stopGeneration();
    setTurns([]);
    setInput("");
    setLastRun(undefined);
  }, [stopGeneration]);

  const exportChat = useCallback(() => {
    if (!turns.length) return;
    const body = turns
      .map((turn) => `${turn.role === "user" ? "User" : assistantLabel}: ${turn.content}`)
      .join("\n\n");
    const blob = new Blob([body], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ht-studio-chat-${new Date().toISOString().replace(/[:.]/g, "-")}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }, [assistantLabel, turns]);

  return (
    <div className="run-console">
      <header className="run-head">
        <div>
          <h2>HT Studio</h2>
          <p className="run-sub">Private local model workspace running in-process.</p>
        </div>
        <div className="run-status">
          {available === null && <span className="pill pill-muted">Checking HT Studio...</span>}
          {available === true && <span className="pill pill-ok">HT Studio ready{gpu ? ` / GPU: ${gpu}` : " / CPU"}</span>}
          {available === false && <span className="pill pill-bad">HT Studio unavailable</span>}
          {loaded ? (
            <span className="pill pill-loaded" title={loaded}>
              Loaded: {loaded}
            </span>
          ) : (
            <span className="pill pill-muted">No model loaded</span>
          )}
          {customOllamaModel && !preferLoadedModel && (
            <span className="pill pill-muted" title={customOllamaModel.name}>
              Ollama: {customOllamaModel.displayName || customOllamaModel.name}
            </span>
          )}
          {!customOllamaModel && backendStandardModel && !preferLoadedModel && (
            <span className="pill pill-ok" title={standardRoute?.reason}>
              Default route: {backendStandardModel.name}
            </span>
          )}
          {loaded && (
            <button className="run-btn ghost" onClick={() => void unload()} disabled={Boolean(busy)}>
              Unload
            </button>
          )}
          <button
            className="run-btn ghost small"
            type="button"
            onClick={() => setIconLabelsPreference(!iconLabels)}
            title="Toggle decorative icons in HT Studio labels"
          >
            Icons {iconLabels ? "on" : "off"}
          </button>
          <button
            className="run-btn ghost small"
            type="button"
            onClick={() => setAutoWarmPreference(!autoWarm)}
            title="Warm the standard route automatically when HT Studio opens"
          >
            Warm {autoWarm ? "on" : "off"}
          </button>
        </div>
      </header>

      <section className="run-peak-grid">
        <div className="run-telemetry-panel">
          <div className="run-panel-head">
            <span className="run-owned-label">Latency dashboard</span>
            <span className="run-mini-pill">{warmStatus || "No warmup yet"}</span>
          </div>
          <div className="run-metric-grid">
            <span><strong>{formatLatency(lastRun?.firstTokenMs ?? benchmark?.firstTokenMs)}</strong><small>first token</small></span>
            <span><strong>{formatLatency(lastRun?.totalMs ?? benchmark?.totalMs)}</strong><small>total</small></span>
            <span><strong>{lastRun?.tokensPerSecond ?? benchmark?.tokensPerSecond ?? "n/a"}</strong><small>tok/s</small></span>
            <span><strong>{queueDepth}</strong><small>queue depth</small></span>
          </div>
          <p className="run-sub">
            Backend: {lastRun?.backend || (shouldUseBackendStandardRoute ? "standard route" : usingLoadedModel ? "loaded llama.cpp" : "not selected")} | Model: {lastRun?.model || benchmarkTarget || "none"}
          </p>
        </div>
        <div className="run-telemetry-panel">
          <div className="run-panel-head">
            <span className="run-owned-label">Runtime health</span>
            <button className="run-btn ghost small" type="button" onClick={() => void optimizeForThisPc()} disabled={Boolean(busy)}>
              Optimize for my PC
            </button>
          </div>
          <div className="run-health-list">
            {runtimeHealth.map((item) => <span key={item}>{item}</span>)}
          </div>
          <p className="run-sub">
            {gpuSummary
              ? `${gpuSummary.name}${gpuSummary.memoryFreeBytes ? ` / ${formatBytes(gpuSummary.memoryFreeBytes)} free VRAM` : ""}`
              : systemScan
                ? `${systemScan.os.cpuCount} CPU threads available`
                : "System scan pending"}
          </p>
            {hotPool && hotPool.entries.length > 0 && (
              <p className="run-sub">
                Hot pool: {hotPool.entries.map((entry) => `${entry.model} (${entry.state})`).join(" | ")}
              </p>
            )}
            {residencyPlan && (
              <p className="run-sub">
                Residency: {residencyPlan.mode}; selected {residencyPlan.selected.map((candidate) => candidate.model.name).join(", ") || "none"}; VRAM free {formatBytes(residencyPlan.memory.freeVramBytes)}
              </p>
            )}
            {serverPool && serverPool.entries.length > 0 && (
              <p className="run-sub">
                Server pool: {serverPool.entries.map((entry) => `${entry.model} (${entry.state}:${entry.port})`).join(" | ")}
              </p>
            )}
        </div>
      </section>

      <section className="run-presets">
        <span className="run-owned-label">Conversation preset</span>
        <div className="run-preset-buttons">
          {PRESETS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`run-btn small ${preset === item.id ? "active" : "ghost"}`}
              onClick={() => applyPreset(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      {error && (
        <div className="run-error" style={{ display: "flex", flexDirection: "column", gap: "10px", alignItems: "flex-start" }}>
          <span>{error}</span>
          {(error.includes("needs llama.cpp") || error.includes("llama.cpp >=") || error.includes("engine") || error.includes("Failed to load") || error.includes("Failure")) && (
            <button
              className="run-btn active"
              style={{ background: "var(--ht-accent, #5b9dff)", border: "none", color: "#fff", padding: "6px 12px", borderRadius: "4px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}
              onClick={() => void handleSelfHeal()}
              disabled={Boolean(busy)}
            >
              {iconLabels ? `${RUN_ICONS.bolt} ` : ""}Self-Heal & Upgrade Engine
            </button>
          )}
        </div>
      )}
      {busy && <div className="run-busy">{busy}</div>}

      <section className="run-benchmark">
        <div>
          <span className="run-owned-label">Speed metrics</span>
          <p className="run-sub">
            {benchmark
              ? `${benchmark.model}: ${
                  benchmark.ok
                    ? `${benchmark.firstTokenMs}ms first token, ${benchmark.totalMs}ms total, ${benchmark.tokensPerSecond} tok/s`
                    : `failed - ${benchmark.error || "unknown error"}`
                }`
              : benchmarkTarget
                ? `Run a short benchmark against ${benchmarkTarget}.`
                : "Load a local chat model or let standard routing select one before benchmarking."}
          </p>
        </div>
        <button className="run-btn secondary small" onClick={() => void runSpeedCheck()} disabled={Boolean(busy) || !benchmarkTarget}>
          Speed check
        </button>
        <button className="run-btn ghost small" onClick={() => void warmStandardRoute("manual")} disabled={Boolean(busy) || !benchmarkTarget}>
          Warm now
        </button>
        <button className="run-btn ghost small" onClick={() => void runComparison()} disabled={Boolean(busy) || (!benchmarkTarget && owned.length === 0)}>
          Compare models
        </button>
      </section>

      {comparison.length > 0 && (
        <section className="run-comparison">
          <span className="run-owned-label">Model comparison</span>
          <div className="run-comparison-rows">
            {comparison.map((item) => (
              <div key={item.model} className={`run-comparison-row${item.ok ? "" : " failed"}`}>
                <strong>{formatModelName(item.model)}</strong>
                <span>{item.ok ? `${formatLatency(item.firstTokenMs)} first / ${formatLatency(item.totalMs)} total / ${item.tokensPerSecond} tok/s` : item.error || "failed"}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {showQueue && (
        <section className="run-queue">
          <div>
            <span className="run-owned-label">Generation queue</span>
            {queueRunning && <p className="run-sub">Running: {queueRunning.label}</p>}
            {queuedItems.length > 0 && <p className="run-sub">Queued: {queuedItems.length}</p>}
          </div>
          <div className="run-queue-actions">
            {queueRunning && (
              <button className="run-btn ghost small" onClick={() => void cancelQueueItem(queueRunning.id)}>
                Cancel running
              </button>
            )}
            {queuedItems.slice(0, 2).map((item) => (
              <button key={item.id} className="run-btn ghost small" onClick={() => void cancelQueueItem(item.id)}>
                Cancel {item.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {owned.length > 0 && (
        <section className="run-owned">
          <span className="run-owned-label">Your downloads</span>
          <div className="run-owned-chips">
            {owned.map((model) => {
              const isCurrent = (loadedPath && model.path && loadedPath.toLowerCase() === model.path.toLowerCase()) || 
                                (loaded && loaded.toLowerCase() === model.name.toLowerCase());
              const readiness = readinessForModel(model);
              return (
                <button
                  key={model.path}
                  className={`run-chip${isCurrent ? " active" : ""}${isFailed(model.path) ? " failed" : ""}`}
                  disabled={Boolean(busy)}
                  title={`${readiness.notes.join(" / ") || "ready"} - ${model.path}`}
                  onClick={() => void load({ path: model.path }, model.name)}
                >
                  {iconLabels ? `${isCurrent ? RUN_ICONS.active : RUN_ICONS.play} ` : ""}
                  {isCurrent ? "Active" : "Load"} {formatModelName(model.name)}
                  <span className="run-chip-size">{formatBytes(model.sizeBytes)}</span>
                  {readiness.notes[0] && <span className={`run-chip-state ${readiness.level}`}>{readiness.notes[0]}</span>}
                  {isCurrent && <span className="run-chip-active-badge">active</span>}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="run-loader">
        <div className="run-loader-head">
          <span className="run-loader-title">
            {scanning ? "Scanning your system..." : `${models.length} model${models.length === 1 ? "" : "s"} found on this system`}
          </span>
          <button className="run-btn ghost small" onClick={() => void scan()} disabled={scanning || Boolean(busy)}>
            Rescan
          </button>
        </div>

        <div className="run-combo">
          <input
            className="run-search"
            placeholder={models.length ? "Search models by name, family, or folder..." : "No models found - load by path below"}
            value={query}
            disabled={Boolean(busy)}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
              setIsTyping(true);
            }}
            onFocus={() => {
              setOpen(true);
              setIsTyping(false);
            }}
            onClick={() => {
              setOpen(true);
              setIsTyping(false);
            }}
            onBlur={() => {
              blurTimer.current = setTimeout(() => setOpen(false), 150);
            }}
          />
          {open && filtered.length > 0 && (
            <ul
              className="run-dropdown"
              onMouseDown={(event) => {
                event.preventDefault();
                if (blurTimer.current) clearTimeout(blurTimer.current);
              }}
            >
              {filtered.map((model) => {
                const readiness = readinessForModel(model);
                return (
                  <li key={model.path}>
                    <button
                      className="run-option"
                      disabled={Boolean(busy) || readiness.level === "blocked"}
                      onClick={() => {
                        setQuery(model.name);
                        if (model.source === "Ollama") {
                          setCustomOllamaModel({
                            id: model.name,
                            name: model.name,
                            displayName: model.name,
                            runtime: "ollama"
                          });
                          setPreferLoadedModel(false);
                          setOpen(false);
                        } else {
                          void load({ path: model.path }, model.name);
                        }
                      }}
                    >
                      <span className="run-option-main">
                        <span className="run-option-name">{formatModelName(model.name)}</span>
                        {model.loaded && <span className="run-tag loaded">loaded</span>}
                        {readiness.notes.map((note) => (
                          <span key={note} className={`run-tag ${readiness.level === "warn" ? "warn" : readiness.level}`}>
                            {note === "failed before" && iconLabels ? `${RUN_ICONS.warning} ` : ""}{note}
                          </span>
                        ))}
                      </span>
                      <span className="run-option-meta">
                        <span className="run-tag">{model.source}</span>
                        <span className="run-option-dir">{model.dir}</span>
                        <span className="run-option-size">{formatBytes(model.sizeBytes)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <details className="run-advanced run-runtime-panel">
          <summary>Advanced engine controls</summary>
          <div className="run-runtime-grid">
            <label className="run-field">
              <span>Context size (tokens)</span>
              <select 
                value={contextSize} 
                onChange={(e) => {
                  setRuntimeControlsDirty(true);
                  setContextSize(Number(e.target.value));
                }}
              >
                <option value={512}>512 (Ultra Light/Fast)</option>
                <option value={1024}>1024 (Lightweight)</option>
                <option value={2048}>2048 (Standard)</option>
                <option value={4096}>4096 (Expanded)</option>
                <option value={8192}>8192 (Detailed)</option>
              </select>
            </label>
            <label className="run-field">
              <span>CPU threads</span>
              <input 
                type="number" 
                min={1} 
                max={64} 
                value={threads} 
                onChange={(e) => {
                  setRuntimeControlsDirty(true);
                  setThreads(clampUiNumber(Number(e.target.value), 1, 64));
                }}
              />
            </label>
            <label className="run-field">
              <span>GPU offload layers</span>
              <select 
                value={gpuLayers} 
                onChange={(e) => {
                  setRuntimeControlsDirty(true);
                  setGpuLayers(Number(e.target.value));
                }}
              >
                <option value={-1}>Auto (Optimal)</option>
                <option value={0}>0 (CPU Only)</option>
                <option value={16}>16 layers</option>
                <option value={32}>32 layers</option>
                <option value={64}>64 layers (Max VRAM)</option>
              </select>
            </label>
            <label className="run-field">
              <span>Response cap</span>
              <select
                value={maxTokens}
                onChange={(e) => setMaxTokens(Number(e.target.value))}
              >
                <option value={32}>32 tokens</option>
                <option value={96}>96 tokens</option>
                <option value={256}>256 tokens</option>
                <option value={512}>512 tokens (Standard)</option>
                <option value={1024}>1024 tokens (Expanded)</option>
                <option value={2048}>2048 tokens (Detailed)</option>
                <option value={4096}>4096 tokens (Maximum)</option>
              </select>
            </label>
            <label className="run-field">
              <span>Temperature</span>
              <input
                type="number"
                min={0}
                max={1.5}
                step={0.1}
                value={temperature}
                onChange={(e) => setTemperature(Math.min(1.5, Math.max(0, Number(e.target.value))))}
              />
            </label>
            <label className="run-field run-field-wide">
              <span>Speculative draft model</span>
              <select 
                value={draftModelPath} 
                onChange={(e) => {
                  setRuntimeControlsDirty(true);
                  setDraftModelPath(e.target.value);
                }}
              >
                <option value="">None (Standard inference)</option>
                {draftModels.map((m) => (
                  <option key={m.path} value={m.path}>
                    {iconLabels ? `${RUN_ICONS.rocket} ` : ""}{formatModelName(m.name)} ({formatBytes(m.sizeBytes)})
                  </option>
                ))}
              </select>
            </label>
            <label className="run-field">
              <span>Backend</span>
              <select
                value={backend}
                onChange={(e) => {
                  setRuntimeControlsDirty(true);
                  setBackend(e.target.value as EngineRuntimeConfig["backend"]);
                }}
              >
                <option value="in-process">In-process</option>
                <option value="delegated-server">Delegated llama-server</option>
              </select>
            </label>
            <label className="run-field">
              <span>Residency</span>
              <select
                value={residencyMode}
                onChange={(e) => {
                  const nextMode = e.target.value as EngineRuntimeConfig["residencyMode"];
                  setRuntimeControlsDirty(true);
                  setResidencyMode(nextMode);
                  if (nextMode === "quality-single") setHotPoolMaxModels(1);
                  if (nextMode === "fast-parallel") setHotPoolEnabled(true);
                }}
              >
                <option value="balanced">Balanced</option>
                <option value="fast-parallel">Fast parallel</option>
                <option value="quality-single">Quality single</option>
              </select>
            </label>
            <label className="run-check-field">
              <input
                type="checkbox"
                checked={keepWarm}
                onChange={(e) => {
                  setRuntimeControlsDirty(true);
                  setKeepWarm(e.target.checked);
                }}
              />
              <span>Keep model warm</span>
            </label>
            <label className="run-check-field">
              <input
                type="checkbox"
                checked={delegatedEnabled}
                onChange={(e) => {
                  setRuntimeControlsDirty(true);
                  setDelegatedEnabled(e.target.checked);
                }}
              />
              <span>Enable delegated server</span>
            </label>
            <label className="run-check-field">
              <input
                type="checkbox"
                checked={delegatedBatching}
                onChange={(e) => {
                  setRuntimeControlsDirty(true);
                  setDelegatedBatching(e.target.checked);
                }}
              />
              <span>Continuous batching</span>
            </label>
            <label className="run-check-field">
              <input
                type="checkbox"
                checked={hotPoolEnabled}
                onChange={(e) => {
                  setRuntimeControlsDirty(true);
                  setHotPoolEnabled(e.target.checked);
                }}
              />
              <span>Hot model pool</span>
            </label>
            <label className="run-field">
              <span>Delegated port</span>
              <input
                type="number"
                min={1024}
                max={65535}
                value={delegatedPort}
                onChange={(e) => {
                  setRuntimeControlsDirty(true);
                  setDelegatedPort(clampUiNumber(Number(e.target.value), 1024, 65535));
                }}
              />
            </label>
            <label className="run-field">
              <span>Parallel slots</span>
              <input
                type="number"
                min={1}
                max={16}
                value={delegatedParallel}
                onChange={(e) => {
                  setRuntimeControlsDirty(true);
                  setDelegatedParallel(clampUiNumber(Number(e.target.value), 1, 16));
                }}
              />
            </label>
            <label className="run-field">
              <span>Hot models</span>
              <input
                type="number"
                min={1}
                max={4}
                value={hotPoolMaxModels}
                onChange={(e) => {
                  setRuntimeControlsDirty(true);
                  setHotPoolMaxModels(clampUiNumber(Number(e.target.value), 1, 4));
                }}
              />
            </label>
            <label className="run-field">
              <span>Max hot model GB</span>
              <input
                type="number"
                min={0.1}
                max={20}
                step={0.1}
                value={hotPoolMaxGb}
                onChange={(e) => {
                  setRuntimeControlsDirty(true);
                  setHotPoolMaxGb(Math.min(20, Math.max(0.1, Number(e.target.value))));
                }}
              />
            </label>
          </div>
          <p className="run-runtime-tip">
            {iconLabels ? `${RUN_ICONS.bulb} ` : ""}Tip: Fast parallel keeps several smaller models hot when memory allows. Quality single favors the strongest allowed model and avoids competing hot slots.
          </p>
          <div className="run-runtime-actions">
            <small>
              Runtime config: {runtimeConfig?.backend || "in-process"} | residency {runtimeConfig?.residencyMode || "balanced"} | delegated server {serverStatus?.running ? "running" : serverStatus?.available ? "ready" : "missing"}
              {runtimeControlsDirty ? " | unsaved changes" : ""}
            </small>
            {!serverStatus?.available && (
              <button className="run-btn secondary small" type="button" onClick={() => void installLlamaServer()} disabled={Boolean(busy)}>
                Install llama-server
              </button>
            )}
            {serverStatus?.available && !serverStatus.running && (
              <button className="run-btn secondary small" type="button" onClick={() => void startLlamaServer()} disabled={Boolean(busy)}>
                Start llama-server
              </button>
            )}
            {serverStatus?.running && (
              <button className="run-btn ghost small" type="button" onClick={() => void stopLlamaServer()} disabled={Boolean(busy)}>
                Stop llama-server
              </button>
            )}
            <button className="run-btn secondary small" type="button" onClick={() => void warmLlamaServerPool()} disabled={Boolean(busy)}>
              Warm server pool
            </button>
            {serverPool && serverPool.entries.length > 0 && (
              <button className="run-btn ghost small" type="button" onClick={() => void stopLlamaServerPool()} disabled={Boolean(busy)}>
                Stop server pool
              </button>
            )}
            <button className="run-btn secondary small" type="button" onClick={() => void saveRuntimeControls()} disabled={Boolean(busy)}>
              Save runtime controls
            </button>
          </div>
        </details>

        <details className="run-advanced">
          <summary>Load a model by exact path</summary>
          <div className="run-path-row">
            <input
              className="run-path"
              placeholder="C:\\path\\to\\model.gguf"
              value={pathInput}
              onChange={(event) => setPathInput(event.target.value)}
            />
            <button
              className="run-btn"
              disabled={Boolean(busy) || !pathInput.trim()}
              onClick={() => void load({ path: pathInput.trim() }, pathInput.trim().split(/[\\/]/).pop() || "model")}
            >
              Load by path
            </button>
          </div>
        </details>
      </section>

      <section className="run-chat">
        <div className="run-chat-toolbar">
          <span>
            Console Chat Stream
          </span>
          <div className="run-chat-actions">
            {turns.length > 0 && (
              <>
                <button className="run-btn ghost small" type="button" onClick={() => void regenerateLast()} disabled={generating}>
                  Regenerate
                </button>
                <button className="run-btn ghost small" type="button" onClick={exportChat}>
                  Export
                </button>
                <button className="run-btn ghost small" type="button" onClick={clearChat}>
                  Clear
                </button>
              </>
            )}
            <button
              onClick={copyFullChat}
              className="run-copy-transcript"
              disabled={turns.length === 0}
              title="Copy the entire conversation transcript to your clipboard in Markdown format"
            >
              {fullChatCopied ? (
                <>
                  <CheckIcon />
                  <span>Copied Transcript!</span>
                </>
              ) : (
                <>
                  <CopyIcon />
                  <span>Copy Full Chat</span>
                </>
              )}
            </button>
          </div>
        </div>
        <div className="run-stream" ref={streamRef}>
          {turns.length === 0 && (
            <div className="run-empty">{chatReady ? "Say something to test the model." : "Pick a model above to start chatting."}</div>
          )}
          {turns.map((turn, index) => {
            const isLast = index === turns.length - 1;
            const showThinking = Boolean(turn.thinking);
            return (
              <div key={index} className={`run-bubble ${turn.role}`} style={{ position: 'relative' }}>
                <span className="run-role">{turn.role === "user" ? "You" : assistantLabel}</span>
                {turn.role === "assistant" && turn.content && (
                  <CopyButton text={turn.content} />
                )}
                <div className="run-turn-actions">
                  {turn.role === "user" && (
                    <button type="button" onClick={() => editUserTurn(index)} disabled={generating}>
                      Edit
                    </button>
                  )}
                  <button type="button" onClick={() => branchAt(index)} disabled={generating || index === turns.length - 1}>
                    Branch
                  </button>
                </div>
                {turn.role === "assistant" && showThinking && (
                  <details className="run-thinking-container" open={generating && isLast}>
                    <summary className="run-thinking-summary">
                      <span>Thinking Process</span>
                      {generating && isLast && !turn.content && <span className="thinking-pulse" />}
                    </summary>
                    <div className="run-thinking-content">{turn.thinking}</div>
                  </details>
                )}
                <div className="run-text">
                  {turn.content || (generating && isLast ? (showThinking ? "Writing response..." : "...") : "")}
                </div>
                {turn.role === "assistant" && turn.timing && (
                  <div className="run-turn-timing">
                    {formatLatency(turn.timing.firstTokenMs)} first token | {formatLatency(turn.timing.totalMs)} total | {turn.timing.tokensPerSecond} tok/s | {turn.timing.backend}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="run-input-row">
          <textarea
            className="run-input"
            rows={2}
            placeholder={inputPlaceholder}
            value={input}
            disabled={!chatReady}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (generating) {
                  stopGeneration();
                } else {
                  void send();
                }
              }
            }}
          />
          {generating ? (
            <button className="run-btn stop" style={{ background: "rgba(239, 68, 68, 0.9)", border: "none", color: "#fff", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }} onClick={stopGeneration}>
              {iconLabels ? `${RUN_ICONS.stop} ` : ""}Stop
            </button>
          ) : (
            <button className="run-btn send" disabled={!chatReady || !input.trim()} onClick={() => void send()}>
              Send
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
