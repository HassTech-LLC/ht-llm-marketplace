import { useEffect, useMemo, useRef, useState } from "react";
import { ModelMarketplace, type MarketplaceTheme } from "@ht-llm-marketplace/react";
import {
  MarketplaceClient,
  type BenchmarkResult,
  type CompatibilityScorecard,
  type DocumentSearchResult,
  type LocalDocument,
  type ModelIndexStatus,
  type QueueStatus,
  type StandardRouteDecision
} from "@ht-llm-marketplace/sdk";
import { RunConsole, type PendingLoad } from "./RunConsole";

const THEME_STORAGE_KEY = "ht_marketplace:theme";

const client = new MarketplaceClient({ apiUrl: "http://127.0.0.1:3001" });

type Tab = "marketplace" | "run" | "documents" | "proof";

interface Toast {
  id: string;
  label: string;
  artifactId?: string;
}

export function App() {
  const [tab, setTab] = useState<Tab>("marketplace");
  const [pendingLoad, setPendingLoad] = useState<PendingLoad | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const initialized = useRef(false);

  // Theme is owned by the shell so it can drive every surface — the marketplace
  // pane, the Run console, the tab bar, and the toasts — not just the catalog.
  const [theme, setTheme] = useState<MarketplaceTheme>(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      return saved === "light" || saved === "system" ? saved : "dark";
    } catch {
      return "dark";
    }
  });

  useEffect(() => {
    // Mirror the theme onto <html> so the page backdrop matches the shell.
    const el = document.documentElement;
    el.classList.add("ht-theme");
    el.classList.toggle("ht-light", theme === "light");
    el.classList.toggle("ht-system", theme === "system");
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* storage unavailable; theme still applies for this session */
    }
  }, [theme]);

  const marketplaceConfig = useMemo(() => ({ theme }), [theme]);

  // Watch for completed downloads so we can offer a one-click "Run it" hand-off.
  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      try {
        const { jobs } = await client.downloads();
        const completed = jobs.filter((job) => job.status === "completed");
        if (!initialized.current) {
          // Ignore downloads that already finished before this session started.
          completed.forEach((job) => seen.current.add(job.id));
          initialized.current = true;
          return;
        }
        for (const job of completed) {
          if (seen.current.has(job.id)) continue;
          seen.current.add(job.id);
          setToasts((current) => [...current, { id: job.id, label: job.target, artifactId: job.artifactId }]);
        }
      } catch {
        /* daemon momentarily unavailable; try again next tick */
      }
    };
    void poll();
    const timer = setInterval(() => {
      if (!stopped) void poll();
    }, 4000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);

  const runFromToast = (toast: Toast) => {
    setPendingLoad({ artifactId: toast.artifactId, label: toast.label });
    setTab("run");
    setToasts((current) => current.filter((item) => item.id !== toast.id));
  };

  const shellClassName = [
    "studio-shell",
    "ht-theme",
    theme === "light" ? "ht-light" : "",
    theme === "system" ? "ht-system" : ""
  ].filter(Boolean).join(" ");

  return (
    <div className={shellClassName}>
      <nav className="studio-tabbar">
        <button className={tab === "marketplace" ? "active" : ""} onClick={() => setTab("marketplace")}>
          Marketplace
        </button>
        <button className={tab === "run" ? "active" : ""} onClick={() => setTab("run")}>
          HT Studio
        </button>
        <button className={tab === "documents" ? "active" : ""} onClick={() => setTab("documents")}>
          Documents
        </button>
        <button className={tab === "proof" ? "active" : ""} onClick={() => setTab("proof")}>
          Proof
        </button>
      </nav>

      {/* Both panes stay mounted so state and chat history survive tab switches. */}
      <div className="studio-pane" style={{ display: tab === "marketplace" ? "block" : "none" }}>
        <ModelMarketplace config={marketplaceConfig} onThemeChange={setTheme} />
      </div>
      <div className="studio-pane" style={{ display: tab === "run" ? "block" : "none" }}>
        <RunConsole active={tab === "run"} pendingLoad={pendingLoad} onPendingLoadHandled={() => setPendingLoad(null)} />
      </div>
      <div className="studio-pane" style={{ display: tab === "documents" ? "block" : "none" }}>
        <DocumentsPanel active={tab === "documents"} />
      </div>
      <div className="studio-pane" style={{ display: tab === "proof" ? "block" : "none" }}>
        <ProofPanel active={tab === "proof"} />
      </div>

      {toasts.length > 0 && (
        <div className="studio-toasts">
          {toasts.map((toast) => (
            <div key={toast.id} className="studio-toast">
              <span className="studio-toast-text">
                ✓ <strong>{toast.label}</strong> downloaded
              </span>
              <div className="studio-toast-actions">
                <button className="run-btn small" onClick={() => runFromToast(toast)}>
                  Run it
                </button>
                <button
                  className="run-btn ghost small"
                  onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProofPanel({ active }: { active: boolean }) {
  const [scorecard, setScorecard] = useState<CompatibilityScorecard | null>(null);
  const [route, setRoute] = useState<StandardRouteDecision | null>(null);
  const [index, setIndex] = useState<ModelIndexStatus | null>(null);
  const [benchmarks, setBenchmarks] = useState<BenchmarkResult[]>([]);
  const [queue, setQueue] = useState<QueueStatus | null>(null);
  const [error, setError] = useState<string | undefined>();

  const refresh = async () => {
    setError(undefined);
    const [scorecardPayload, routePayload, indexPayload, benchmarkPayload, queuePayload] = await Promise.all([
      client.compatibilityScorecard(),
      client.standardRoute(),
      client.modelIndex(),
      client.benchmarks(),
      client.queueStatus()
    ]);
    setScorecard(scorecardPayload);
    setRoute(routePayload);
    setIndex(indexPayload.index);
    setBenchmarks(benchmarkPayload.benchmarks);
    setQueue(queuePayload);
  };

  useEffect(() => {
    if (active) void refresh().catch((err) => setError((err as Error).message));
  }, [active]);

  return (
    <section className="proof-panel">
      <header className="documents-header">
        <div>
          <p className="run-eyebrow">Replacement proof</p>
          <h1>Readiness Dashboard</h1>
        </div>
        <button className="run-btn secondary" onClick={() => void refresh()}>
          Refresh
        </button>
      </header>

      {error && <div className="run-error">{error}</div>}

      <div className="proof-grid">
        <ProofTile label="Claim" value={scorecard?.claim || "loading"} tone={scorecard?.claim === "best-replacement" ? "ok" : "warn"} />
        <ProofTile label="Indexed models" value={String(index?.modelCount ?? 0)} detail={index?.state || "unknown"} />
        <ProofTile label="Standard route" value={route?.selected?.name || "none"} detail={route?.reason} />
        <ProofTile label="Benchmarks" value={String(benchmarks.length)} detail={`${benchmarks.filter((item) => item.ok).length} passing`} />
        <ProofTile label="Queue" value={String((queue?.queued.length || 0) + (queue?.running ? 1 : 0))} detail={`${queue?.recent.length || 0} recent`} />
      </div>

      <div className="proof-section">
        <h2>Gates</h2>
        <div className="proof-gates">
          {(scorecard?.gates || []).map((gate) => (
            <div key={gate.id} className={`proof-gate ${gate.status}`}>
              <strong>{gate.label}</strong>
              <span>{gate.status}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="proof-section">
        <h2>Evidence</h2>
        <div className="proof-evidence">
          {(scorecard?.evidence || []).map((item) => (
            <article key={item.id} className={`proof-evidence-item ${item.status}`}>
              <strong>{item.label}</strong>
              <span>{item.status}</span>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProofTile({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone?: "ok" | "warn" }) {
  return (
    <article className={`proof-tile ${tone || ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <p>{detail}</p> : null}
    </article>
  );
}

function DocumentsPanel({ active }: { active: boolean }) {
  const [documents, setDocuments] = useState<LocalDocument[]>([]);
  const [results, setResults] = useState<DocumentSearchResult[]>([]);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [query, setQuery] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const refresh = async () => {
    const payload = await client.documents();
    setDocuments(payload.documents);
  };

  useEffect(() => {
    if (active) void refresh().catch((err) => setError((err as Error).message));
  }, [active]);

  const add = async () => {
    if (!content.trim()) return;
    setBusy(true);
    setError(undefined);
    try {
      await client.addDocument({ name: name.trim() || "Untitled document", content });
      setName("");
      setContent("");
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const search = async () => {
    if (!query.trim()) return;
    setBusy(true);
    setError(undefined);
    try {
      const payload = await client.searchDocuments(query, 8);
      setResults(payload.results);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const ask = async () => {
    if (!question.trim()) return;
    setBusy(true);
    setError(undefined);
    try {
      const payload = await client.askDocument({ question, limit: 6 });
      setAnswer(payload.answer);
      setResults(payload.citations);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="documents-panel">
      <header className="documents-header">
        <div>
          <p className="run-eyebrow">Local documents</p>
          <h1>Document Search</h1>
        </div>
        <span className="run-tag">{documents.length} indexed</span>
      </header>

      {error && <div className="run-error">{error}</div>}

      <div className="documents-grid">
        <div className="documents-ingest">
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Research note" />
          </label>
          <label>
            Text
            <textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="Paste local document text..." />
          </label>
          <button className="run-btn" onClick={add} disabled={busy || !content.trim()}>
            Index document
          </button>
        </div>

        <div className="documents-search">
          <label>
            Search
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void search();
              }}
              placeholder="Search local chunks..."
            />
          </label>
          <button className="run-btn secondary" onClick={search} disabled={busy || !query.trim()}>
            Search
          </button>
          <label>
            Ask
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask a question about indexed local documents..."
            />
          </label>
          <button className="run-btn" onClick={ask} disabled={busy || !question.trim()}>
            Ask documents
          </button>
          {answer ? (
            <article className="documents-answer">
              <strong>Answer</strong>
              <p>{answer}</p>
            </article>
          ) : null}
          <div className="documents-results">
            {results.length === 0 ? <p className="run-empty">No local document results yet.</p> : null}
            {results.map((result) => (
              <article className="documents-result" key={`${result.documentId}:${result.chunkIndex}`}>
                <strong>{result.documentName}</strong>
                <span>chunk {result.chunkIndex + 1} - score {result.score.toFixed(2)}</span>
                <p>{result.content}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
