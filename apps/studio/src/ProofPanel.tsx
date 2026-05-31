import { useEffect, useState } from "react";
import {
  MarketplaceClient,
  type BenchmarkResult,
  type ModelIndexStatus,
  type QueueStatus,
  type StandardRouteDecision
} from "@ht-llm-marketplace/sdk";
import "./proof.css";

const client = new MarketplaceClient({ apiUrl: "http://127.0.0.1:3001" });

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
  gates: Array<{
    id: string;
    label: string;
    status: "pass" | "partial" | "planned";
  }>;
}

interface ProofState {
  scorecard?: CompatibilityScorecard;
  route?: StandardRouteDecision;
  index?: ModelIndexStatus;
  modelCount?: number;
  benchmarks?: BenchmarkResult[];
  queue?: QueueStatus;
  error?: string;
  loading: boolean;
}

export function ProofPanel({ active }: { active: boolean }) {
  const [state, setState] = useState<ProofState>({ loading: false });
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    const refresh = async () => {
      setState((current) => ({ ...current, loading: true, error: undefined }));
      try {
        const [scorecard, route, indexResult, benchmarkResult, queue] = await Promise.all([
          fetchScorecard(),
          client.standardRoute(),
          client.modelIndex(),
          client.benchmarks(),
          client.queueStatus()
        ]);
        if (stopped) return;
        setState({
          scorecard,
          route,
          index: indexResult.index,
          modelCount: indexResult.models.length,
          benchmarks: benchmarkResult.benchmarks,
          queue,
          loading: false
        });
      } catch (error) {
        if (!stopped) setState({ loading: false, error: (error as Error).message });
      }
    };
    void refresh();
    const timer = setInterval(() => {
      if (!stopped) void refresh();
    }, 8000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [active, refreshTick]);

  const scorecard = state.scorecard;
  const runningCount = (state.queue?.runningItems?.length || 0) + (state.queue?.running ? 1 : 0);
  const recentFailures = state.queue?.recent.filter((entry) => entry.state === "failed").length || 0;
  const latestBenchmark = state.benchmarks?.[0];

  return (
    <section className="proof-panel">
      <header className="proof-header">
        <div>
          <span className="run-eyebrow">Replacement evidence</span>
          <h1>Readiness Dashboard</h1>
        </div>
        <button className="run-btn small" onClick={() => setRefreshTick((current) => current + 1)} disabled={state.loading}>
          {state.loading ? "Refreshing" : "Refresh"}
        </button>
      </header>

      {state.error && <div className="run-error">{state.error}</div>}

      <div className="proof-grid">
        <ProofTile
          label="Claim"
          value={scorecard?.claim || "Checking"}
          detail={scorecard?.summary || "Waiting for daemon evidence."}
          tone={scorecard?.claim === "best-replacement" ? "ok" : scorecard?.claim === "candidate" ? "warn" : "muted"}
        />
        <ProofTile
          label="Indexed models"
          value={`${state.modelCount ?? 0}`}
          detail={state.index ? `${state.index.state}, ${state.index.modelCount} in cache` : "Model index not loaded yet."}
          tone={(state.modelCount || 0) > 0 ? "ok" : "warn"}
        />
        <ProofTile
          label="Standard route"
          value={state.route?.selected?.name || "None"}
          detail={state.route?.reason || "No local route selected yet."}
          tone={state.route?.selected ? "ok" : "warn"}
        />
        <ProofTile
          label="Benchmarks"
          value={`${state.benchmarks?.filter((item) => item.ok).length || 0} pass`}
          detail={latestBenchmark ? `${latestBenchmark.model}: ${Math.round(latestBenchmark.tokensPerSecond)} tok/s` : "Run a benchmark to strengthen the claim."}
          tone={state.benchmarks?.some((item) => item.ok) ? "ok" : "warn"}
        />
        <ProofTile
          label="Queue"
          value={`${runningCount} running`}
          detail={`${state.queue?.queued.length || 0} queued, ${recentFailures} recent failures`}
          tone={recentFailures === 0 ? "ok" : "warn"}
        />
      </div>

      <section className="proof-section">
        <h2>Gates</h2>
        <div className="proof-gates">
          {scorecard?.gates.map((gate) => (
            <div key={gate.id} className={`proof-gate proof-status-${gate.status}`}>
              <span>{gate.label}</span>
              <strong>{gate.status}</strong>
            </div>
          )) || <p className="proof-empty">No gate evidence loaded yet.</p>}
        </div>
      </section>

      <section className="proof-section">
        <h2>Evidence</h2>
        <div className="proof-evidence">
          {scorecard?.evidence.map((item) => (
            <article key={item.id} className={`proof-status-${item.status}`}>
              <span>{item.label}</span>
              <strong>{item.status}</strong>
              <p>{item.detail}</p>
            </article>
          )) || <p className="proof-empty">No scorecard evidence loaded yet.</p>}
        </div>
      </section>
    </section>
  );
}

async function fetchScorecard(): Promise<CompatibilityScorecard> {
  const res = await fetch("http://127.0.0.1:3001/api/compatibility/scorecard");
  if (!res.ok) throw new Error(`Scorecard request failed with ${res.status}`);
  return res.json();
}

function ProofTile({
  label,
  value,
  detail,
  tone
}: {
  label: string;
  value: string;
  detail: string;
  tone: "ok" | "warn" | "muted";
}) {
  return (
    <article className={`proof-tile ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}
