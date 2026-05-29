import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MarketplaceClient, type DiscoveredModel } from "@ht-llm-marketplace/sdk";

const client = new MarketplaceClient({ apiUrl: "http://127.0.0.1:3001" });

const FAILED_KEY = "htlm:failedModels";

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
}

function formatBytes(bytes?: number): string {
  if (!bytes) return "";
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`;
}

function readFailed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(FAILED_KEY) || "[]") as string[];
  } catch {
    return [];
  }
}

export function RunConsole({ active, pendingLoad, onPendingLoadHandled }: RunConsoleProps) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [gpu, setGpu] = useState<string | false>(false);
  const [loaded, setLoaded] = useState<string | undefined>();
  const [models, setModels] = useState<DiscoveredModel[]>([]);
  const [scanning, setScanning] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [pathInput, setPathInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [failed, setFailed] = useState<string[]>(() => readFailed());
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const streamRef = useRef<HTMLDivElement>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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
      setAvailable(Boolean(engine?.installed));
      setGpu(engine?.version?.startsWith("gpu:") ? engine.version.slice(4) : false);
      setLoaded(engine?.loadedModels?.[0]?.name);
    } catch (err) {
      setError((err as Error).message);
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
      void refreshStatus();
      void scan();
    }
  }, [active, refreshStatus, scan]);

  useEffect(() => {
    streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight });
  }, [turns]);

  const owned = useMemo(() => models.filter((model) => model.source === "marketplace"), [models]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const matches = term
      ? models.filter((model) => `${model.name} ${model.dir} ${model.source}`.toLowerCase().includes(term))
      : models;
    return matches.slice(0, 80);
  }, [models, query]);

  const load = useCallback(
    async (request: { artifactId?: string; path?: string }, label: string) => {
      setOpen(false);
      setError(undefined);
      setBusy(`Loading ${label}… (reads several GB into VRAM on first load)`);
      try {
        await client.loadEngineModel(request);
        rememberFailure(request.path, false);
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
    [refreshStatus, scan, rememberFailure]
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
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }, [refreshStatus, scan]);

  const send = useCallback(async () => {
    const content = input.trim();
    if (!content || generating || !loaded) return;
    setInput("");
    const history: ChatTurn[] = [...turns, { role: "user", content }];
    setTurns([...history, { role: "assistant", content: "" }]);
    setGenerating(true);
    setError(undefined);
    try {
      const response = await client.chat({ runtime: "llamacpp", stream: true, messages: history });
      if (!response.ok || !response.body) throw new Error(`Chat failed with ${response.status}`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistant = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let parsed: { message?: { content?: string }; error?: string };
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
          if (piece) {
            assistant += piece;
            setTurns((current) => {
              const copy = [...current];
              copy[copy.length - 1] = { role: "assistant", content: assistant };
              return copy;
            });
          }
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGenerating(false);
      void refreshStatus();
    }
  }, [input, generating, loaded, turns, refreshStatus]);

  return (
    <div className="run-console">
      <header className="run-head">
        <div>
          <h2>Run a model</h2>
          <p className="run-sub">The marketplace runs GGUF models itself — no Ollama or LM Studio required.</p>
        </div>
        <div className="run-status">
          {available === null && <span className="pill pill-muted">Checking engine…</span>}
          {available === true && <span className="pill pill-ok">Engine ready{gpu ? ` · GPU: ${gpu}` : " · CPU"}</span>}
          {available === false && <span className="pill pill-bad">Engine unavailable</span>}
          {loaded ? (
            <span className="pill pill-loaded" title={loaded}>
              Loaded: {loaded}
            </span>
          ) : (
            <span className="pill pill-muted">No model loaded</span>
          )}
          {loaded && (
            <button className="run-btn ghost" onClick={() => void unload()} disabled={Boolean(busy)}>
              Unload
            </button>
          )}
        </div>
      </header>

      {error && <div className="run-error">{error}</div>}
      {busy && <div className="run-busy">{busy}</div>}

      {owned.length > 0 && (
        <section className="run-owned">
          <span className="run-owned-label">Your downloads</span>
          <div className="run-owned-chips">
            {owned.map((model) => (
              <button
                key={model.path}
                className={`run-chip${isFailed(model.path) ? " failed" : ""}`}
                disabled={Boolean(busy)}
                title={isFailed(model.path) ? "Failed to load before — may need a newer engine" : model.path}
                onClick={() => void load({ path: model.path }, model.name)}
              >
                ▶ {model.name}
                <span className="run-chip-size">{formatBytes(model.sizeBytes)}</span>
              </button>
            ))}
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
            }}
            onFocus={() => setOpen(true)}
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
                      void load({ path: model.path }, model.name);
                    }}
                  >
                    <span className="run-option-main">
                      <span className="run-option-name">{model.name}</span>
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
        <div className="run-stream" ref={streamRef}>
          {turns.length === 0 && (
            <div className="run-empty">{loaded ? "Say something to test the model." : "Pick a model above to start chatting."}</div>
          )}
          {turns.map((turn, index) => (
            <div key={index} className={`run-bubble ${turn.role}`}>
              <span className="run-role">{turn.role === "user" ? "You" : "Model"}</span>
              <div className="run-text">{turn.content || (generating && index === turns.length - 1 ? "…" : "")}</div>
            </div>
          ))}
        </div>
        <div className="run-input-row">
          <textarea
            className="run-input"
            rows={2}
            placeholder={loaded ? "Type a message and press Enter…" : "Load a model first"}
            value={input}
            disabled={!loaded || generating}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <button className="run-btn send" disabled={!loaded || generating || !input.trim()} onClick={() => void send()}>
            {generating ? "Generating…" : "Send"}
          </button>
        </div>
      </section>
    </div>
  );
}
