import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MarketplaceClient,
  type BenchmarkResult,
  type DiscoveredModel,
  type EngineRuntimeConfig,
  type LlamaServerStatus,
  type QueueStatus,
  type RuntimeModel
} from "@ht-llm-marketplace/sdk";

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

const client = new MarketplaceClient({ apiUrl: "http://127.0.0.1:3001" });

const FAILED_KEY = "htlm:failedModels";
const STANDARD_KEEP_ALIVE = "30m";
const STANDARD_CONTEXT = 512;
const FAST_STANDARD_MODELS = [
  "llama3.2:1b",
  "Llama-3.2-1B-Instruct-Q4_K_M:latest",
  "Llama-3.2-1B-Instruct-Q4_K_M",
  "qwen2.5:0.5b",
  "qwen2.5:0.5b-instruct"
];

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

function pickStandardModel(models: RuntimeModel[] = []): RuntimeModel | undefined {
  const byName = new Map(models.map((model) => [model.name.toLowerCase(), model]));
  for (const name of FAST_STANDARD_MODELS) {
    const match = byName.get(name.toLowerCase());
    if (match) return match;
  }

  return models
    .filter((model) => {
      const name = `${model.name} ${model.family || ""}`.toLowerCase();
      return !/(embed|nomic|llava|bakllava|moondream|vision)/.test(name);
    })
    .sort((a, b) => (a.sizeBytes ?? Number.POSITIVE_INFINITY) - (b.sizeBytes ?? Number.POSITIVE_INFINITY))[0];
}

export function RunConsole({ active, pendingLoad, onPendingLoadHandled }: RunConsoleProps) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [ollamaOnline, setOllamaOnline] = useState(false);
  const [standardModel, setStandardModel] = useState<RuntimeModel | undefined>();
  const [customOllamaModel, setCustomOllamaModel] = useState<RuntimeModel | undefined>();
  const [preferLoadedModel, setPreferLoadedModel] = useState(false);
  const [warmedStandardModel, setWarmedStandardModel] = useState<string | undefined>();
  const [failedStandardModel, setFailedStandardModel] = useState<string | undefined>();
  const [warmingStandard, setWarmingStandard] = useState(false);
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
  const [threads, setThreads] = useState<number>(() => {
    try {
      return navigator.hardwareConcurrency || 4;
    } catch {
      return 4;
    }
  });
  const [gpuLayers, setGpuLayers] = useState<number>(-1);
  const [maxTokens, setMaxTokens] = useState<number>(512);
  const [benchmark, setBenchmark] = useState<BenchmarkResult | undefined>();
  const [queue, setQueue] = useState<QueueStatus | undefined>();
  const [runtimeConfig, setRuntimeConfig] = useState<EngineRuntimeConfig | undefined>();
  const [serverStatus, setServerStatus] = useState<LlamaServerStatus | undefined>();
  const streamRef = useRef<HTMLDivElement>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const abortControllerRef = useRef<AbortController | null>(null);

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
      const nextStandardModel = ollama?.online ? pickStandardModel(ollama.models) : undefined;
      const nextLoadedModel = engine?.loadedModels?.[0];
      const [configResult, serverResult] = await Promise.allSettled([client.engineConfig(), client.engineServerStatus()]);
      if (configResult.status === "fulfilled") setRuntimeConfig(configResult.value.config);
      if (serverResult.status === "fulfilled") setServerStatus(serverResult.value);
      setAvailable(Boolean(engine?.installed));
      setOllamaOnline(Boolean(ollama?.online));
      setStandardModel(nextStandardModel);
      setWarmedStandardModel((current) => (current && current === nextStandardModel?.name ? current : undefined));
      setFailedStandardModel((current) => (current && current === nextStandardModel?.name ? current : undefined));
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
        contextSize,
        threads,
        gpuLayers: gpuLayers === -1 ? "auto" : gpuLayers,
        draftModel: draftModelPath || null,
        backend: runtimeConfig?.backend || "in-process",
        delegatedServer: runtimeConfig?.delegatedServer || { enabled: false, port: 8080, parallel: 4, continuousBatching: true }
      });
      setRuntimeConfig(payload.config);
      const status = await client.engineServerStatus();
      setServerStatus(status);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }, [contextSize, draftModelPath, gpuLayers, runtimeConfig, threads]);

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

  const warmStandardModel = useCallback(async () => {
    const modelName = standardModel?.name;
    if (!modelName || warmingStandard || warmedStandardModel === modelName) return;
    setWarmingStandard(true);
    try {
      const response = await client.chat({
        runtime: "ollama",
        model: modelName,
        stream: false,
        keep_alive: STANDARD_KEEP_ALIVE,
        options: { num_ctx: STANDARD_CONTEXT, num_predict: 1, temperature: 0 },
        messages: [{ role: "user", content: "ready" }]
      });
      if (!response.ok) throw new Error(`Warmup failed with ${response.status}`);
      await response.text();
      setWarmedStandardModel(modelName);
      setFailedStandardModel(undefined);
    } catch (err) {
      setFailedStandardModel(modelName);
      setError(`Standard model warmup failed: ${(err as Error).message}`);
    } finally {
      setWarmingStandard(false);
    }
  }, [standardModel, warmedStandardModel, warmingStandard]);

  // Auto-refresh whenever the tab becomes active (e.g. right after a download).
  useEffect(() => {
    if (active) {
      void refreshStatus();
      void scan();
    }
  }, [active, refreshStatus, scan]);

  useEffect(() => {
    if (active && standardModel && warmedStandardModel !== standardModel.name) {
      void warmStandardModel();
    }
  }, [active, standardModel, warmedStandardModel, warmStandardModel]);

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

  const activeOllamaModel = customOllamaModel || standardModel;
  const standardReady = ollamaOnline && Boolean(standardModel);
  const standardWarmed = Boolean(standardModel && warmedStandardModel === standardModel.name);
  const standardFailed = Boolean(standardModel && failedStandardModel === standardModel.name);
  const standardUsable = standardReady && standardWarmed && !warmingStandard && !standardFailed;
  const shouldUseStandardModel = !preferLoadedModel && Boolean(activeOllamaModel) && (activeOllamaModel === standardModel ? standardUsable : ollamaOnline);
  const usingLoadedModel = !shouldUseStandardModel && Boolean(loaded);
  const chatReady = shouldUseStandardModel || usingLoadedModel;
  const assistantLabel = shouldUseStandardModel
    ? activeOllamaModel?.displayName || activeOllamaModel?.name || "Model"
    : loaded || "Model";
  const inputPlaceholder = shouldUseStandardModel
    ? "Type a message and press Enter..."
    : loaded
      ? "Type a message and press Enter..."
      : standardModel && !standardFailed
        ? "Warming local model..."
        : "Load a model first";

  const load = useCallback(
    async (request: { artifactId?: string; path?: string }, label: string) => {
      setOpen(false);
      setError(undefined);
      setBusy(`Loading ${label}… (reads several GB into VRAM on first load)`);
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
        // Always re-sync so the loaded pill reflects reality — a failed load now
        // leaves any previously-loaded model in place, and we must show that.
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
    setBusy("Unloading…");
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
      const res = await fetch("http://127.0.0.1:3001/api/engine/upgrade", {
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
      const payload = await client.runBenchmark({ model: usingLoadedModel ? loaded : undefined, prompt: "hi" });
      setBenchmark(payload.benchmark);
      const queuePayload = await client.queueStatus();
      setQueue(queuePayload);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }, [loaded, usingLoadedModel]);

  const send = useCallback(async () => {
    const content = input.trim();
    if (!content || generating || !chatReady) return;
    setInput("");
    const history: ChatTurn[] = [...turns, { role: "user", content }];
    setTurns([...history, { role: "assistant", content: "" }]);
    setGenerating(true);
    setError(undefined);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const request =
        shouldUseStandardModel && activeOllamaModel
          ? {
              runtime: "ollama",
              model: activeOllamaModel.name,
              stream: true,
              keep_alive: STANDARD_KEEP_ALIVE,
              options: { num_ctx: STANDARD_CONTEXT, num_predict: maxTokens, temperature: 0.7 },
              messages: history
            }
          : { runtime: "llamacpp", stream: true, messages: history, maxTokens, temperature: 0.7 };
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
            if (piece) assistant += piece;
            if (thinkingPiece) assistantThinking += thinkingPiece;
            scheduleAssistant();
          }
        }
      }
      if (raf) cancelAnimationFrame(raf);
      applyAssistant(assistant, assistantThinking);
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
  }, [input, generating, chatReady, turns, shouldUseStandardModel, activeOllamaModel, maxTokens, refreshStatus]);

  return (
    <div className="run-console">
      <header className="run-head">
        <div>
          <h2>HT Studio</h2>
          <p className="run-sub">Private local model workspace running in-process.</p>
        </div>
        <div className="run-status">
          {available === null && <span className="pill pill-muted">Checking HT Studio…</span>}
          {available === true && <span className="pill pill-ok">HT Studio ready{gpu ? ` · GPU: ${gpu}` : " · CPU"}</span>}
          {available === false && <span className="pill pill-bad">HT Studio unavailable</span>}
          {loaded ? (
            <span className="pill pill-loaded" title={loaded}>
              Loaded: {loaded}
            </span>
          ) : (
            <span className="pill pill-muted">No model loaded</span>
          )}
          {activeOllamaModel && !preferLoadedModel && (
            <span className={`pill ${activeOllamaModel === standardModel && standardWarmed ? "pill-ok" : "pill-muted"}`} title={activeOllamaModel.name}>
              {activeOllamaModel === standardModel ? "Default" : "Ollama"}: {activeOllamaModel.displayName || activeOllamaModel.name}
            </span>
          )}
          {loaded && (
            <button className="run-btn ghost" onClick={() => void unload()} disabled={Boolean(busy)}>
              Unload
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="run-error" style={{ display: "flex", flexDirection: "column", gap: "10px", alignItems: "flex-start" }}>
          <span>{error}</span>
          {(error.includes("needs llama.cpp") || error.includes("llama.cpp ≥") || error.includes("engine") || error.includes("Failed to load") || error.includes("Failure")) && (
            <button
              className="run-btn active"
              style={{ background: "var(--ht-accent, #5b9dff)", border: "none", color: "#fff", padding: "6px 12px", borderRadius: "4px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}
              onClick={() => void handleSelfHeal()}
              disabled={Boolean(busy)}
            >
              ⚡ Self-Heal & Upgrade Engine
            </button>
          )}
        </div>
      )}
      {busy && <div className="run-busy">{busy}</div>}

      <section className="run-benchmark">
        <div>
          <span className="run-owned-label">Speed proof</span>
          <p className="run-sub">
            {benchmark
              ? `${benchmark.model}: ${benchmark.firstTokenMs}ms first token, ${benchmark.totalMs}ms total, ${benchmark.tokensPerSecond} tok/s`
              : "Run a short benchmark against the loaded local model."}
          </p>
          {queue?.running && <p className="run-sub">Queue running: {queue.running.label}</p>}
        </div>
        <button className="run-btn secondary small" onClick={() => void runSpeedCheck()} disabled={Boolean(busy) || !usingLoadedModel}>
          Speed check
        </button>
      </section>

      {owned.length > 0 && (
        <section className="run-owned">
          <span className="run-owned-label">Your downloads</span>
          <div className="run-owned-chips">
            {owned.map((model) => {
              const isCurrent = (loadedPath && model.path && loadedPath.toLowerCase() === model.path.toLowerCase()) || 
                                (loaded && loaded.toLowerCase() === model.name.toLowerCase());
              return (
                <button
                  key={model.path}
                  className={`run-chip${isCurrent ? " active" : ""}${isFailed(model.path) ? " failed" : ""}`}
                  disabled={Boolean(busy)}
                  title={isFailed(model.path) ? "Failed to load before — may need a newer engine" : model.path}
                  onClick={() => void load({ path: model.path }, model.name)}
                >
                  {isCurrent ? "●" : "▶"} {formatModelName(model.name)}
                  <span className="run-chip-size">{formatBytes(model.sizeBytes)}</span>
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
            {scanning ? "Scanning your system…" : `${models.length} model${models.length === 1 ? "" : "s"} found on this system`}
          </span>
          <button className="run-btn ghost small" onClick={() => void scan()} disabled={scanning || Boolean(busy)}>
            Rescan
          </button>
        </div>

        <div className="run-combo">
          <input
            className="run-search"
            placeholder={models.length ? "Search models by name, family, or folder…" : "No models found — load by path below"}
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
              {filtered.map((model) => (
                <li key={model.path}>
                  <button
                    className="run-option"
                    disabled={Boolean(busy)}
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
                      {isFailed(model.path) && <span className="run-tag warn">⚠ failed before</span>}
                    </span>
                    <span className="run-option-meta">
                      <span className="run-tag">{model.source}</span>
                      <span className="run-option-dir">{model.dir}</span>
                      <span className="run-option-size">{formatBytes(model.sizeBytes)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <details className="run-advanced" style={{ marginTop: '12px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '8px', padding: '10px 14px' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 650, fontSize: '13px', color: 'var(--ht-muted)' }}>
            ⚙️ Advanced Engine Optimization Parameters
          </summary>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px', marginTop: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', color: 'var(--ht-muted)', fontWeight: 600 }}>Context size (tokens)</label>
              <select 
                value={contextSize} 
                onChange={(e) => setContextSize(Number(e.target.value))}
                style={{ background: 'var(--ht-control-bg, rgba(20, 24, 30, 0.9))', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--ht-text)', borderRadius: '4px', padding: '4px 8px', fontSize: '12px' }}
              >
                <option value={512}>512 (Ultra Light/Fast)</option>
                <option value={1024}>1024 (Lightweight)</option>
                <option value={2048}>2048 (Standard)</option>
                <option value={4096}>4096 (Expanded)</option>
                <option value={8192}>8192 (Detailed)</option>
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', color: 'var(--ht-muted)', fontWeight: 600 }}>CPU threads</label>
              <input 
                type="number" 
                min={1} 
                max={64} 
                value={threads} 
                onChange={(e) => setThreads(Number(e.target.value))}
                style={{ background: 'var(--ht-control-bg, rgba(20, 24, 30, 0.9))', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--ht-text)', borderRadius: '4px', padding: '4px 8px', fontSize: '12px' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', color: 'var(--ht-muted)', fontWeight: 600 }}>GPU offload layers</label>
              <select 
                value={gpuLayers} 
                onChange={(e) => setGpuLayers(Number(e.target.value))}
                style={{ background: 'var(--ht-control-bg, rgba(20, 24, 30, 0.9))', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--ht-text)', borderRadius: '4px', padding: '4px 8px', fontSize: '12px' }}
              >
                <option value={-1}>Auto (Optimal)</option>
                <option value={0}>0 (CPU Only)</option>
                <option value={16}>16 layers</option>
                <option value={32}>32 layers</option>
                <option value={64}>64 layers (Max VRAM)</option>
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', color: 'var(--ht-muted)', fontWeight: 600 }}>Response cap</label>
              <select
                value={maxTokens}
                onChange={(e) => setMaxTokens(Number(e.target.value))}
                style={{ background: 'var(--ht-control-bg, rgba(20, 24, 30, 0.9))', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--ht-text)', borderRadius: '4px', padding: '4px 8px', fontSize: '12px' }}
              >
                <option value={32}>32 tokens</option>
                <option value={96}>96 tokens</option>
                <option value={256}>256 tokens</option>
                <option value={512}>512 tokens (Standard)</option>
                <option value={1024}>1024 tokens (Expanded)</option>
                <option value={2048}>2048 tokens (Detailed)</option>
                <option value={4096}>4096 tokens (Maximum)</option>
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', gridColumn: 'span 2' }}>
              <label style={{ fontSize: '11px', color: 'var(--ht-muted)', fontWeight: 600 }}>Speculative Draft Model (2x-3x Speedup)</label>
              <select 
                value={draftModelPath} 
                onChange={(e) => setDraftModelPath(e.target.value)}
                style={{ background: 'var(--ht-control-bg, rgba(20, 24, 30, 0.9))', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--ht-text)', borderRadius: '4px', padding: '4px 8px', fontSize: '12px' }}
              >
                <option value="">None (Standard inference)</option>
                {draftModels.map((m) => (
                  <option key={m.path} value={m.path}>
                    🚀 {formatModelName(m.name)} ({formatBytes(m.sizeBytes)})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: '10px', color: 'var(--ht-muted)', opacity: 0.85, lineHeight: 1.3 }}>
            💡 *Tip: Lowering context size to 512/1024 tokens reduces load times. Activating a Speculative Draft Model accelerates heavy model inference by up to 2x-3x by predicting tokens in parallel.*
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginTop: '12px', flexWrap: 'wrap' }}>
            <small style={{ color: 'var(--ht-muted)' }}>
              Runtime config: {runtimeConfig?.backend || "in-process"} | delegated server {serverStatus?.running ? "running" : "offline"}
            </small>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px', padding: '0 4px' }}>
          <span style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, color: 'var(--ht-muted)' }}>
            Console Chat Stream
          </span>
          {turns.length > 0 && (
            <button
              onClick={copyFullChat}
              title="Copy the entire conversation transcript to your clipboard in Markdown format"
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: 'var(--ht-muted)',
                borderRadius: '6px',
                padding: '4px 10px',
                cursor: 'pointer',
                fontSize: '0.75rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease-in-out',
                backdropFilter: 'blur(4px)',
                fontWeight: 500
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
              {fullChatCopied ? (
                <>
                  <CheckIcon />
                  <span style={{ color: 'var(--ht-cyan)' }}>Copied Transcript!</span>
                </>
              ) : (
                <>
                  <CopyIcon />
                  <span>Copy Full Chat</span>
                </>
              )}
            </button>
          )}
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
                  {turn.content || (generating && isLast ? (showThinking ? "Writing response..." : "…") : "")}
                </div>
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
              ⏹ Stop
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
