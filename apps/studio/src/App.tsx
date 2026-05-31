import { useEffect, useMemo, useRef, useState } from "react";
import { ModelMarketplace, type MarketplaceTheme } from "@ht-llm-marketplace/react";
import { MarketplaceClient } from "@ht-llm-marketplace/sdk";
import { RunConsole, type PendingLoad } from "./RunConsole";

const THEME_STORAGE_KEY = "ht_marketplace:theme";

const client = new MarketplaceClient({ apiUrl: "http://127.0.0.1:3001" });

type Tab = "marketplace" | "run";

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
      </nav>

      {/* Both panes stay mounted so state and chat history survive tab switches. */}
      <div className="studio-pane" style={{ display: tab === "marketplace" ? "block" : "none" }}>
        <ModelMarketplace config={marketplaceConfig} onThemeChange={setTheme} />
      </div>
      <div className="studio-pane" style={{ display: tab === "run" ? "block" : "none" }}>
        <RunConsole active={tab === "run"} pendingLoad={pendingLoad} onPendingLoadHandled={() => setPendingLoad(null)} />
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

