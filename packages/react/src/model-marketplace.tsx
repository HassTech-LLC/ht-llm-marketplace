import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MarketplaceClient,
  type CatalogFile,
  type CatalogItem,
  type DeletePlan,
  type DownloadJob,
  type InventoryArtifact,
  type RuntimeStatus,
  type SystemScan
} from "@ht-llm-marketplace/sdk";
import {
  chooseView,
  getEnabledViews,
  resolveMarketplaceConfig,
  storageName,
  tokensToStyle,
  type MarketplaceConfig,
  type MarketplaceDownloadMode,
  type MarketplaceNavigationView,
  type ResolvedMarketplaceConfig,
  type MarketplaceTheme,
  type MarketplaceView
} from "./config.js";

// --- Premium Company Logo Renderer ---
interface CompanyLogoProps {
  modelName?: string;
  author?: string;
}

const CompanyLogo = ({ modelName = "", author = "" }: CompanyLogoProps) => {
  const name = modelName.toLowerCase();
  const auth = (author || "").toLowerCase();
  
  const isMeta = name.includes("llama") || auth.includes("meta");
  const isQwen = name.includes("qwen") || auth.includes("alibaba") || auth.includes("qwen");
  const isDeepseek = name.includes("deepseek");
  const isPhi = name.includes("phi") || auth.includes("microsoft");
  const isGemma = name.includes("gemma") || name.includes("google") || name.includes("gemini");
  const isMistral = name.includes("mistral") || name.includes("mixtral") || name.includes("codestral") || auth.includes("mistral");
  const isCohere = name.includes("cohere") || name.includes("command-r") || auth.includes("cohere");

  if (isMeta) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', flexShrink: 0 }} title="Meta">
        <svg style={{ width: '16px', height: '16px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4zm0 0c2 2.67 4 4 6 4a4 4 0 1 0 0-8c-2 0-4 1.33-6 4z" />
        </svg>
      </div>
    );
  }
  if (isQwen) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.2)', flexShrink: 0 }} title="Alibaba Qwen">
        <svg style={{ width: '16px', height: '16px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m15.5 15.5 3.5 3.5" />
        </svg>
      </div>
    );
  }
  if (isDeepseek) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(6, 182, 212, 0.1)', border: '1px solid rgba(6, 182, 212, 0.2)', flexShrink: 0 }} title="DeepSeek">
        <svg style={{ width: '16px', height: '16px' }} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2.69C12 2.69 6 10 6 14a6 6 0 0 0 12 0c0-4-6-11.31-6-11.31z" />
        </svg>
      </div>
    );
  }
  if (isPhi) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', flexShrink: 0 }} title="Microsoft">
        <svg style={{ width: '16px', height: '16px' }} viewBox="0 0 23 23" fill="currentColor">
          <rect x="0" y="0" width="10" height="10" />
          <rect x="12" y="0" width="10" height="10" />
          <rect x="0" y="12" width="10" height="10" />
          <rect x="12" y="12" width="10" height="10" />
        </svg>
      </div>
    );
  }
  if (isGemma) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(236, 72, 153, 0.1)', border: '1px solid rgba(236, 72, 153, 0.2)', flexShrink: 0 }} title="Google Gemma">
        <svg style={{ width: '16px', height: '16px' }} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C12 7 7 12 2 12C7 12 12 17 12 22C12 17 17 12 22 12C17 12 12 7 12 2Z" />
        </svg>
      </div>
    );
  }
  if (isMistral) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(249, 115, 22, 0.1)', border: '1px solid rgba(249, 115, 22, 0.2)', flexShrink: 0 }} title="Mistral AI">
        <svg style={{ width: '16px', height: '16px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 15l8-8 8 8" />
        </svg>
      </div>
    );
  }
  if (isCohere) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(20, 184, 166, 0.1)', border: '1px solid rgba(20, 184, 166, 0.2)', flexShrink: 0 }} title="Cohere">
        <svg style={{ width: '16px', height: '16px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8a4 4 0 1 0 4 4" />
        </svg>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)', flexShrink: 0 }} title="Hugging Face">
      <svg style={{ width: '16px', height: '16px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M9 15s1.5 2 3 2 3-2 3-2" />
        <line x1="9" y1="10" x2="9.01" y2="10" />
        <line x1="15" y1="10" x2="15.01" y2="10" />
      </svg>
    </div>
  );
};;

// --- Smart Dynamic Description Synthesizer ---
const getModelDescription = (item: CatalogItem) => {
  const cleanName = item.name.replace(/-GGUF$/i, "").replace(/[-_]/g, " ");
  const isCoder = item.name.toLowerCase().includes("coder") || (item.task || "").toLowerCase().includes("code");
  const isInstruct = item.name.toLowerCase().includes("instruct") || item.name.toLowerCase().includes("chat");
  const authorName = item.author || "Open Source";
  
  if (isCoder) {
    return `High-performance coding model curated by ${authorName}. Optimized for precision syntax parsing, code generation, and multi-language software engineering cascades.`;
  }
  if (isInstruct) {
    return `Instruction-aligned dialogue and general-purpose reasoning model by ${authorName}. Fine-tuned for precise instruction following, structured reasoning, and conversational chat threads.`;
  }
  return `Community-tuned open-source GGUF weights for ${cleanName} by ${authorName}. Optimized for high-efficiency private local CPU/GPU execution.`;
};

const getParameterSize = (name: string) => {
  const match = name.match(/(\d+(?:\.\d+)?)[bB]/);
  return match ? `${match[1]}B` : "GGUF";
};

const getSpecialtyTags = (item: CatalogItem) => {
  const specialties: string[] = [];
  const nameLower = item.name.toLowerCase();
  const taskLower = (item.task || "").toLowerCase();
  
  if (nameLower.includes("coder") || nameLower.includes("code") || taskLower.includes("code")) {
    specialties.push("Coding");
  }
  if (nameLower.includes("math")) {
    specialties.push("Math");
  }
  if (nameLower.includes("instruct") || nameLower.includes("chat") || nameLower.includes("it-")) {
    specialties.push("Instruct");
  }
  if (nameLower.includes("think") || nameLower.includes("reason") || nameLower.includes("deepseek")) {
    specialties.push("Reasoning");
  }
  if (specialties.length === 0) {
    specialties.push("General");
  }
  return specialties;
};

function pickRecommendedQuant(files: CatalogFile[]) {
  const runnable = files.filter((file) => file.runnable);
  const candidates = runnable.length ? runnable : files;
  const fitRank: Record<string, number> = { excellent: 0, good: 1, heavy: 2, unknown: 3, unsupported: 4 };
  const quantRank = ["q4_k_m", "q4_1", "q5_k_m", "q5_k_s", "q6_k", "q8_0"];
  return [...candidates].sort((a, b) => {
    const aFit = fitRank[a.fit.level] ?? 5;
    const bFit = fitRank[b.fit.level] ?? 5;
    if (aFit !== bFit) return aFit - bFit;
    const aQuant = quantRank.findIndex((quant) => a.path.toLowerCase().includes(quant));
    const bQuant = quantRank.findIndex((quant) => b.path.toLowerCase().includes(quant));
    const normalizedAQuant = aQuant === -1 ? quantRank.length : aQuant;
    const normalizedBQuant = bQuant === -1 ? quantRank.length : bQuant;
    const aSize = a.sizeBytes ?? Number.MAX_SAFE_INTEGER;
    const bSize = b.sizeBytes ?? Number.MAX_SAFE_INTEGER;
    if (aFit >= fitRank.heavy && aSize !== bSize) return aSize - bSize;
    if (normalizedAQuant !== normalizedBQuant) return normalizedAQuant - normalizedBQuant;
    return aSize - bSize;
  })[0] ?? files[0];
}

function isMultipartFile(file: CatalogFile) {
  return Boolean(file.multipart && file.parts?.length);
}

// --- Quantization GGUF Selection Sub-component with dynamic GPU Offloading math ---
interface QuantSelectorProps {
  files: CatalogFile[];
  installFile: (file: CatalogFile) => Promise<void>;
  scan: SystemScan | null;
  getParameterSize: (name: string) => string;
  selected: CatalogItem;
  showSpecs?: boolean;
  downloadMode: MarketplaceDownloadMode;
  setDownloadMode: React.Dispatch<React.SetStateAction<MarketplaceDownloadMode>>;
  downloadLabel: string;
}

function QuantSelector({ files, installFile, scan, getParameterSize, selected, showSpecs = true, downloadMode, setDownloadMode, downloadLabel }: QuantSelectorProps) {
  const ggufs = useMemo(() => {
    return [...files].filter(f => f.path.toLowerCase().endsWith(".gguf")).sort((a, b) => (a.sizeBytes ?? Number.MAX_SAFE_INTEGER) - (b.sizeBytes ?? Number.MAX_SAFE_INTEGER));
  }, [files]);

  const [selectedPath, setSelectedPath] = useState<string>("");

  useEffect(() => {
    if (ggufs.length > 0) {
      const defaultFile = pickRecommendedQuant(ggufs);
      setSelectedPath(defaultFile.path);
    }
  }, [ggufs]);

  const selectedFile = useMemo(() => {
    return ggufs.find(f => f.path === selectedPath);
  }, [ggufs, selectedPath]);

  // VRAM Allocator Calculations
  const vramData = useMemo(() => {
    if (!selectedFile) return { sizeGB: 0, pct: 0, status: "heavy", label: "No file selected", exceedsFree: false, maxVRAMGB: 16.0, freeVRAMGB: 16.0 };
    const activeGpu = scan?.gpus?.[0];
    const maxVRAMGB = activeGpu?.memoryTotalBytes ? activeGpu.memoryTotalBytes / (1024 * 1024 * 1024) : 16.0;
    const freeVRAMGB = activeGpu?.memoryFreeBytes ? activeGpu.memoryFreeBytes / (1024 * 1024 * 1024) : maxVRAMGB;
    if (!selectedFile.sizeBytes) {
      return { sizeGB: 0, pct: 0, status: "unknown", label: "Size Unknown", exceedsFree: false, maxVRAMGB, freeVRAMGB };
    }
    const sizeGB = selectedFile.sizeBytes / (1024 * 1024 * 1024);
    
    const pct = Math.min((sizeGB / maxVRAMGB) * 100, 100);
    const exceedsFree = sizeGB > freeVRAMGB;

    let status = "excellent";
    let label = "Full GPU Offload Ready";

    if (sizeGB > maxVRAMGB) {
      status = "heavy";
      label = "Heavy / CPU-only Mode (VRAM Exceeded)";
    } else if (sizeGB > freeVRAMGB) {
      status = "good";
      label = "Partial GPU Offload (Split Memory)";
    } else if (sizeGB > maxVRAMGB * 0.75) {
      status = "good";
      label = "High VRAM Footprint";
    }

    return { sizeGB, pct, status, label, exceedsFree, maxVRAMGB, freeVRAMGB };
  }, [selectedFile, scan]);

  if (ggufs.length === 0) {
    return (
      <div style={{ fontSize: '12px', color: 'var(--ht-muted)', fontStyle: 'italic', padding: '8px 0' }}>
        No GGUF quants found.
      </div>
    );
  }

  function getQuantLabel(path: string) {
    const parts = path.split("/");
    const filename = parts[parts.length - 1];
    const match = filename.match(/(q\d+_[a-z0-9_]+)/i);
    return match ? match[1].toUpperCase() : "GGUF";
  }

  function getFitClass(level: string) {
    if (level === "excellent") return "is-excellent";
    if (level === "good") return "is-good";
    return "is-heavy";
  }

  if (downloadMode === "simple") {
    const quantName = selectedFile ? getQuantLabel(selectedFile.path) : "GGUF";
    const sizeGB = selectedFile?.sizeBytes ? selectedFile.sizeBytes / (1024 * 1024 * 1024) : 0;
    const fitClass = selectedFile ? getFitClass(selectedFile.fit.level) : "is-heavy";
    const multipart = selectedFile ? isMultipartFile(selectedFile) : false;
    const needsAdvancedReview = Boolean(
      selectedFile && (selectedFile.fit.level === "unknown" || selectedFile.fit.level === "heavy" || vramData.exceedsFree)
    );

    return (
      <>
        <div className="ht-simple-quant-card">
          <div className="ht-simple-quant-main">
            <span className="ht-simple-quant-label">Smart pick</span>
            <strong>{quantName}</strong>
            <small>{selected.name}</small>
          </div>
          <div className="ht-simple-quant-meta">
            {showSpecs ? <span>{formatSize(selectedFile?.sizeBytes)}</span> : null}
            <span className={`ht-quant-card-fit ${fitClass}`}>{selectedFile?.fit.label || "Recommended"}</span>
          </div>
        </div>

        {showSpecs ? (
          <div className="ht-simple-quant-note">
            {multipart
              ? `Multipart GGUF artifact with ${selectedFile?.partCount || selectedFile?.parts?.length || 0} shards.`
              : "Simple mode keeps one recommended runnable quant visible."}
          </div>
        ) : null}

        {vramData.exceedsFree && (
          <div className="ht-quant-warning">
            <strong>Pre-flight warning:</strong> This quant ({vramData.sizeGB.toFixed(1)} GB) exceeds available GPU VRAM ({vramData.freeVRAMGB.toFixed(1)} GB). Expect CPU offload or slower generation.
          </div>
        )}
        {needsAdvancedReview ? (
          <div className="ht-quant-warning">
            Simple mode found no confirmed GPU-fit artifact for this repository. Review variants before installing.
          </div>
        ) : null}

        <div className="ht-download-action-row" style={{ marginTop: '12px' }}>
          <button
            className="ht-download-primary-btn"
            disabled={!selectedFile || !selectedFile.runnable || needsAdvancedReview}
            onClick={() => {
              if (selectedFile) {
                void installFile(selectedFile);
              }
            }}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            <svg style={{ width: '14px', height: '14px', marginRight: '4px' }} viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
            </svg>
            {downloadLabel}
          </button>
          {needsAdvancedReview ? (
            <button type="button" className="ht-download-secondary-btn" onClick={() => setDownloadMode("advanced")}>
              Review Advanced Options
            </button>
          ) : null}
        </div>
      </>
    );
  }

  return (
    <>
      {/* Real-time VRAM Allocation Graph Bar */}
      {showSpecs && (
        <div className="ht-vram-visualizer">
          <div className="ht-vram-label-row">
            <span>GPU Memory Allocation Scans</span>
            <strong>{vramData.sizeGB.toFixed(1)} GB / {vramData.maxVRAMGB.toFixed(1)} GB VRAM</strong>
          </div>
          <div className="ht-vram-bar-container">
            <div 
              className={`ht-vram-fill-bar ${vramData.status === 'excellent' ? 'is-excellent' : vramData.status === 'good' ? 'is-good' : 'is-heavy'}`}
              style={{ width: `${vramData.pct}%` }}
            />
          </div>
          <div className="ht-vram-label-row" style={{ fontSize: '9px' }}>
            <span>Compatibility Status: <strong className={`ht-quant-card-fit ${vramData.status === 'excellent' ? 'is-excellent' : vramData.status === 'good' ? 'is-good' : 'is-heavy'}`}>{vramData.label}</strong></span>
          </div>
        </div>
      )}

      {/* Visual Quantization Selection Grid Matrix */}
      <div className="ht-quant-matrix">
        {ggufs.map((file) => {
          const isActive = file.path === selectedPath;
          const quantName = getQuantLabel(file.path);
          
          return (
            <button
              type="button"
              key={file.path}
              onClick={() => setSelectedPath(file.path)}
              aria-pressed={isActive}
              className={`ht-quant-card ${isActive ? 'is-active' : ''}`}
            >
              <span className="ht-quant-card-name">{quantName}</span>
              {showSpecs && (
                <div className="ht-quant-card-meta">
                  <span>{formatSize(file.sizeBytes)}</span>
                  <span className={`ht-quant-card-fit ${getFitClass(file.fit.level)}`}>
                    {file.fit.label.split(" ")[0]}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {vramData.exceedsFree && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          borderRadius: '8px',
          padding: '10px 12px',
          margin: '12px 0',
          fontSize: '11px',
          color: '#f87171',
          lineHeight: '1.4'
        }}>
          <strong>⚠️ Pre-flight Compatibility Warning:</strong> This model quant ({vramData.sizeGB.toFixed(1)} GB) exceeds your available GPU VRAM ({vramData.freeVRAMGB.toFixed(1)} GB). Execution will automatically fall back to CPU memory channels, which will severely limit generation speed (tokens per second).
        </div>
      )}

      <div className="ht-download-action-row" style={{ marginTop: '12px' }}>
        <button 
          className="ht-download-primary-btn" 
          disabled={!selectedFile || !selectedFile.runnable}
          onClick={() => {
            if (selectedFile) {
              void installFile(selectedFile);
            }
          }}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          <svg style={{ width: '14px', height: '14px', marginRight: '4px' }} viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
          </svg>
          {downloadLabel}
        </button>
      </div>
    </>
  );
}


export interface ModelMarketplaceProps {
  apiUrl?: string;
  compact?: boolean;
  config?: MarketplaceConfig;
  /** Notified whenever the user changes the theme, so a host shell can stay in sync. */
  onThemeChange?: (theme: MarketplaceTheme) => void;
}

export function ModelMarketplace({ apiUrl, compact, config, onThemeChange }: ModelMarketplaceProps) {
  const marketplaceConfig = useMemo(() => resolveMarketplaceConfig(config, { apiUrl, compact }), [apiUrl, compact, config]);
  const enabledViews = useMemo(() => getEnabledViews(marketplaceConfig.features), [marketplaceConfig.features]);
  const [currentApiUrl, setCurrentApiUrl] = useState(marketplaceConfig.apiUrl);
  const client = useMemo(() => new MarketplaceClient({ apiUrl: currentApiUrl }), [currentApiUrl]);
  const [view, setView] = useState<MarketplaceNavigationView>(() => chooseView("discover", enabledViews));
  const [theme, setTheme] = useState<MarketplaceTheme>(marketplaceConfig.theme);
  const [query, setQuery] = useState(marketplaceConfig.defaultQuery);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [selected, setSelected] = useState<CatalogItem | null>(null);
  const [files, setFiles] = useState<CatalogFile[]>([]);
  const [readme, setReadme] = useState<string>("");
  const [loadingReadme, setLoadingReadme] = useState<boolean>(false);
  const [inventory, setInventory] = useState<InventoryArtifact[]>([]);
  const [downloads, setDownloads] = useState<DownloadJob[]>([]);
  const [runtimes, setRuntimes] = useState<RuntimeStatus[]>([]);
  const [scan, setScan] = useState<SystemScan | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [lastScanAt, setLastScanAt] = useState<Date | null>(null);
  const [deletePlan, setDeletePlan] = useState<DeletePlan | null>(null);
  const [message, setMessage] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [filterFormat, setFilterFormat] = useState<string>("all");
  const [filterSpecialty, setFilterSpecialty] = useState<string>("all");
  const [filterSize, setFilterSize] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("downloads");
  const [activeDetailTab, setActiveDetailTab] = useState<"readme" | "prompt" | "hardware">("readme");

  const [installingRuntime, setInstallingRuntime] = useState<string | null>(null);
  const [startingOllama, setStartingOllama] = useState(false);

  useEffect(() => {
    setCurrentApiUrl(marketplaceConfig.apiUrl);
    setTheme(marketplaceConfig.theme);
  }, [marketplaceConfig.apiUrl, marketplaceConfig.theme]);

  useEffect(() => {
    setQuery(marketplaceConfig.defaultQuery);
  }, [marketplaceConfig.defaultQuery]);

  useEffect(() => {
    setView((current) => chooseView(current, enabledViews));
  }, [enabledViews]);

  useEffect(() => {
    async function discoverPort() {
      try {
        const res = await fetch(`${marketplaceConfig.apiUrl}/health`);
        if (res.ok) return;
      } catch {
        const ports = Array.from({ length: 10 }, (_, i) => 3001 + i);
        const probes = ports.map(async (port) => {
          const probeUrl = `http://127.0.0.1:${port}`;
          try {
            const res = await fetch(`${probeUrl}/health`, { signal: AbortSignal.timeout(1000) } as any);
            if (res.ok) {
              const data = await res.json();
              if (data.ok) return { port, url: probeUrl };
            }
          } catch {}
          return null;
        });
        const results = await Promise.all(probes);
        const active = results.find((r) => r !== null);
        if (active) {
          console.log(`Port sweeper discovered running daemon at ${active.url}`);
          setCurrentApiUrl(active.url);
        }
      }
    }
    void discoverPort();
  }, [marketplaceConfig.apiUrl]);

  const [showLogos, setShowLogos] = useState(() => {
    try {
      const saved = localStorage.getItem(storageName(marketplaceConfig.storageKey, "showLogos"));
      return saved !== null ? JSON.parse(saved) : marketplaceConfig.display.showLogos;
    } catch {
      return marketplaceConfig.display.showLogos;
    }
  });
  const [showDescriptions, setShowDescriptions] = useState(() => {
    try {
      const saved = localStorage.getItem(storageName(marketplaceConfig.storageKey, "showDescriptions"));
      return saved !== null ? JSON.parse(saved) : marketplaceConfig.display.showDescriptions;
    } catch {
      return marketplaceConfig.display.showDescriptions;
    }
  });
  const [showBadges, setShowBadges] = useState(() => {
    try {
      const saved = localStorage.getItem(storageName(marketplaceConfig.storageKey, "showBadges"));
      return saved !== null ? JSON.parse(saved) : marketplaceConfig.display.showBadges;
    } catch {
      return marketplaceConfig.display.showBadges;
    }
  });
  const [showSpecs, setShowSpecs] = useState(() => {
    try {
      const saved = localStorage.getItem(storageName(marketplaceConfig.storageKey, "showSpecs"));
      return saved !== null ? JSON.parse(saved) : marketplaceConfig.display.showSpecs;
    } catch {
      return marketplaceConfig.display.showSpecs;
    }
  });
  const [downloadMode, setDownloadMode] = useState<MarketplaceDownloadMode>(() => {
    try {
      const saved = localStorage.getItem(storageName(marketplaceConfig.storageKey, "downloadMode"));
      return saved === "advanced" || saved === "simple" ? saved : marketplaceConfig.display.downloadMode;
    } catch {
      return marketplaceConfig.display.downloadMode;
    }
  });
  const [showQuickSettings, setShowQuickSettings] = useState(false);

  useEffect(() => { localStorage.setItem(storageName(marketplaceConfig.storageKey, "showLogos"), JSON.stringify(showLogos)); }, [marketplaceConfig.storageKey, showLogos]);
  useEffect(() => { localStorage.setItem(storageName(marketplaceConfig.storageKey, "showDescriptions"), JSON.stringify(showDescriptions)); }, [marketplaceConfig.storageKey, showDescriptions]);
  useEffect(() => { localStorage.setItem(storageName(marketplaceConfig.storageKey, "showBadges"), JSON.stringify(showBadges)); }, [marketplaceConfig.storageKey, showBadges]);
  useEffect(() => { localStorage.setItem(storageName(marketplaceConfig.storageKey, "showSpecs"), JSON.stringify(showSpecs)); }, [marketplaceConfig.storageKey, showSpecs]);
  useEffect(() => { localStorage.setItem(storageName(marketplaceConfig.storageKey, "downloadMode"), downloadMode); }, [marketplaceConfig.storageKey, downloadMode]);


  const refresh = useCallback(async () => {
    const [runtimeData, inventoryData, downloadData] = await Promise.all([
      client.runtimes(),
      client.inventory(),
      client.downloads()
    ]);
    setRuntimes(runtimeData.runtimes);
    setInventory(inventoryData.artifacts);
    setDownloads(downloadData.jobs.filter((job) => job.status === "running" || job.status === "queued" || job.status === "paused"));
  }, [client]);

  const runSystemScan = useCallback(async (showBusy = true) => {
    if (showBusy) {
      setScanBusy(true);
      setMessage("");
    }
    try {
      const result = await client.systemScan();
      setScan(result);
      setRuntimes(result.runtimes);
      setLastScanAt(new Date());
    } catch (error) {
      if (showBusy) setMessage((error as Error).message);
    } finally {
      if (showBusy) setScanBusy(false);
    }
  }, [client]);

  const processedCatalog = useMemo(() => {
    let result = [...catalog];

    // Filter by Format
    if (filterFormat !== "all") {
      result = result.filter(item => {
        if (filterFormat === "gguf") return item.format === "gguf" || item.id.toLowerCase().includes("gguf");
        if (filterFormat === "ollama") return item.source === "ollama" || item.id.toLowerCase().includes("ollama");
        return true;
      });
    }

    // Filter by Specialty/Task
    if (filterSpecialty !== "all") {
      result = result.filter(item => {
        const specialty = (item.task || "").toLowerCase();
        const nameLower = item.name.toLowerCase();
        if (filterSpecialty === "coding") return specialty.includes("code") || nameLower.includes("coder") || nameLower.includes("code");
        if (filterSpecialty === "reasoning") return specialty.includes("reason") || nameLower.includes("instruct") || nameLower.includes("think") || nameLower.includes("deepseek");
        if (filterSpecialty === "general") return !specialty.includes("code") && !nameLower.includes("coder");
        return true;
      });
    }

    // Filter by Size Fit
    if (filterSize !== "all") {
      result = result.filter(item => {
        const level = item.fit?.level || "unknown";
        return level === filterSize;
      });
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === "downloads") {
        return (b.downloads || 0) - (a.downloads || 0);
      }
      if (sortBy === "likes") {
        return (b.likes || 0) - (a.likes || 0);
      }
      if (sortBy === "name") {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === "size") {
        // Estimate size from parameter count or fit level
        const sizeA = a.name.includes("3B") || a.name.includes("1.5B") ? 1 : a.name.includes("7B") || a.name.includes("8B") ? 2 : 3;
        const sizeB = b.name.includes("3B") || b.name.includes("1.5B") ? 1 : b.name.includes("7B") || b.name.includes("8B") ? 2 : 3;
        return sizeA - sizeB;
      }
      return 0;
    });

    return result;
  }, [catalog, filterFormat, filterSpecialty, filterSize, sortBy]);

  const completedCountRef = useRef(0);
  useEffect(() => {
    void refresh().catch((error) => setMessage(error.message));
    const events = client.downloadEvents();
    events.onmessage = (event) => {
      const jobs = JSON.parse(event.data) as DownloadJob[];
      setDownloads(jobs.filter((job) => job.status === "running" || job.status === "queued" || job.status === "paused"));
      // Progress ticks arrive continuously during a download. Only do a full
      // inventory/runtime refresh when a job actually completes (the owned set
      // changed), never on every tick — otherwise this fans out into a request storm.
      const completed = jobs.filter((job) => job.status === "completed").length;
      if (completed !== completedCountRef.current) {
        completedCountRef.current = completed;
        void refresh().catch(() => undefined);
      }
    };
    events.onerror = () => events.close();
    return () => events.close();
  }, [client, refresh]);

  useEffect(() => {
    if (!marketplaceConfig.features.doctor) return;
    void runSystemScan(false);
    const timer = window.setInterval(() => {
      void runSystemScan(false);
    }, 45000);
    return () => window.clearInterval(timer);
  }, [marketplaceConfig.features.doctor, runSystemScan]);

  useEffect(() => {
    void runSearch(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runSearch(nextQuery = query) {
    setBusy(true);
    setMessage("");
    try {
      const result = await client.searchCatalog(nextQuery, 12);
      setCatalog(result.items);
      if (result.items.length > 0) {
        const first = result.items[0];
        if (first.source === "huggingface") {
          void openFiles(first);
        } else {
          setSelected(first);
        }
      }
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function openFiles(item: CatalogItem) {
    if (!item.repoId) return;
    setSelected(item);
    setFiles([]);
    setReadme("");
    setBusy(true);
    setLoadingReadme(true);
    try {
      const result = await client.huggingFaceFiles(item.repoId);
      setFiles(result.files);

      // Fetch README dynamically from daemon endpoint
      const readmeRes = await fetch(`${currentApiUrl}/api/catalog/hf/readme?repo=${encodeURIComponent(item.repoId)}`);
      if (readmeRes.ok) {
        const readmeData = await readmeRes.json();
        setReadme(readmeData.readme || "");
      }
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
      setLoadingReadme(false);
    }
  }

  async function installFile(file: CatalogFile) {
    setMessage("");
    const isOllamaOnline = runtimes.find((r) => r.id === "ollama")?.online;
    const targetRuntime = isOllamaOnline ? "ollama" : "llamacpp";
    const filenames = file.parts?.map((part) => part.path) || [file.path];
    const expectedFiles = file.parts?.map((part) => ({ path: part.path, sizeBytes: part.sizeBytes })) || [
      { path: file.path, sizeBytes: file.sizeBytes }
    ];
    const result = await client.startDownload({
      source: "huggingface",
      runtime: targetRuntime,
      repoId: file.repoId,
      filename: filenames[0],
      filenames,
      expectedBytes: file.sizeBytes,
      expectedFiles,
      displayName: file.path.split("/").pop()
    });
    setDownloads((current) => [result.job, ...current]);
    setSelected(null);
    setFiles([]);
    setReadme("");
    changeView("downloads");
  }

  async function installEngine(runtime: "ollama" | "lmstudio") {
    setInstallingRuntime(runtime);
    setMessage("");
    try {
      const res = await fetch(`${currentApiUrl}/api/runtimes/install`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-ht-marketplace-confirm": "privileged-action" },
        body: JSON.stringify({ runtime })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Installation failed to start");
      setMessage(data.message || `Background setup launched successfully.`);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setInstallingRuntime(null);
      void refresh().catch(() => undefined);
    }
  }

  async function startOllamaService() {
    setStartingOllama(true);
    setMessage("");
    try {
      const res = await fetch(`${currentApiUrl}/api/runtimes/ollama/server/start`, {
        method: "POST",
        headers: { "x-ht-marketplace-confirm": "privileged-action" }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start service");
      setMessage(data.message || `Startup initialized.`);
      setTimeout(() => {
        void refresh().catch(() => undefined);
      }, 3000);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setStartingOllama(false);
    }
  }

  async function pullOllama(model: string) {
    const result = await client.startDownload({ source: "ollama", runtime: "ollama", model });
    setDownloads((current) => [result.job, ...current]);
    setSelected(null);
    setFiles([]);
    setReadme("");
    changeView("downloads");
  }

  async function planDelete(artifactId: string) {
    setMessage("");
    try {
      const result = await client.createDeletePlan({ artifactId });
      setDeletePlan(result.plan);
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function executeDelete() {
    if (!deletePlan) return;
    const result = await client.confirmDeletePlan(deletePlan.id);
    setDeletePlan(result.plan);
    await refresh();
  }

  async function pauseDownload(id: string) {
    try {
      await client.pauseDownload(id);
      await refresh();
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function resumeDownload(id: string) {
    try {
      await client.resumeDownload(id);
      await refresh();
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function cancelDownload(id: string) {
    try {
      await client.cancelDownload(id);
      await refresh();
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  function changeView(nextView: MarketplaceView) {
    const safeView = chooseView(nextView, enabledViews);
    if (safeView !== "discover") {
      setSelected(null);
      setFiles([]);
      setReadme("");
      setLoadingReadme(false);
      setShowQuickSettings(false);
    }
    setView(safeView);
  }

  const applyTheme = (next: MarketplaceTheme) => {
    setTheme(next);
    onThemeChange?.(next);
  };

  const rootClassName = [
    "ht-marketplace",
    "ht-theme",
    marketplaceConfig.compact ? "ht-marketplace--compact" : "",
    theme === "light" ? "ht-light" : "",
    theme === "system" ? "ht-system" : ""
  ].filter(Boolean).join(" ");
  const rootStyle = tokensToStyle(marketplaceConfig.tokens);

  return (
    <div className={rootClassName} style={rootStyle}>
      <aside className="ht-sidebar">
        <div className="ht-brand">
          <div className="ht-mark">{marketplaceConfig.branding.mark}</div>
          <div>
            <strong>{marketplaceConfig.branding.name}</strong>
            <span>{marketplaceConfig.branding.tagline}</span>
          </div>
        </div>
        <nav>
          {enabledViews.map((item) => (
            <button key={item} className={view === item ? "is-active" : ""} onClick={() => changeView(item)}>
              {marketplaceConfig.labels.nav[item]}
            </button>
          ))}
        </nav>
        {marketplaceConfig.features.doctor ? (
          <CompatibilityRail
            scan={scan}
            runtimes={runtimes}
            busy={scanBusy}
            lastScanAt={lastScanAt}
            labels={marketplaceConfig.labels.doctor}
            showAction={marketplaceConfig.features.doctorAction}
            onScan={() => void runSystemScan(true)}
          />
        ) : null}
      </aside>

      <main className="ht-main">
        <header className="ht-topbar">
          <div>
            <h1>{marketplaceConfig.labels.nav[view]}</h1>
            <p>{marketplaceConfig.labels.subtitles[view]}</p>
          </div>
          <div className="ht-actions">
            {marketplaceConfig.features.themeToggle ? (
              <div className="ht-theme-seg" role="group" aria-label="Theme">
                {(["dark", "light", "system"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={theme === mode ? "is-active" : ""}
                    aria-pressed={theme === mode}
                    onClick={() => applyTheme(mode)}
                  >
                    {mode === "dark" ? "Dark" : mode === "light" ? "Light" : "System"}
                  </button>
                ))}
              </div>
            ) : null}
            {view === "discover" && marketplaceConfig.features.viewSettings ? (
              <button
                type="button"
                className={`ht-view-settings-trigger ${showQuickSettings ? "is-active" : ""}`}
                onClick={() => setShowQuickSettings(true)}
                aria-controls="ht-view-settings"
                aria-expanded={showQuickSettings}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.09 7.09 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.49.42l-.36 2.54c-.58.24-1.12.55-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.66 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.3-.06.61-.06.94s.02.64.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.31.6.22l2.39-.96c.51.39 1.05.7 1.63.94l.36 2.54c.04.24.25.42.49.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54c.58-.24 1.12-.55 1.63-.94l2.39.96c.21.09.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" />
                </svg>
                {marketplaceConfig.labels.buttons.viewSettings}
              </button>
            ) : null}
            {marketplaceConfig.features.refresh ? <button onClick={() => void refresh()}>{marketplaceConfig.labels.buttons.refresh}</button> : null}
          </div>
        </header>

        {message ? <div className="ht-alert">{message}</div> : null}

        {view === "discover" && (
          <div className="ht-discover-split">
            {/* LEFT PANE: SEARCH, FILTERS, COMPACT MODEL LIST */}
            <div className="ht-model-list-pane">
              <form
                className="ht-search"
                onSubmit={(event) => {
                  event.preventDefault();
                  void runSearch();
                }}
              >
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search local models by name or author..." />
                <button className="ht-primary" disabled={busy}>
                  {marketplaceConfig.labels.buttons.search}
                </button>
              </form>

              {/* Curation details bar */}
              <div className="ht-filter-bar">
                <div className="ht-filter-group">
                  <select value={filterFormat} onChange={(e) => setFilterFormat(e.target.value)} className="ht-filter-select">
                    <option value="all">All formats</option>
                    <option value="gguf">GGUF</option>
                    <option value="ollama">Ollama</option>
                  </select>
                  <select value={filterSpecialty} onChange={(e) => setFilterSpecialty(e.target.value)} className="ht-filter-select">
                    <option value="all">All specialties</option>
                    <option value="coding">Coding</option>
                    <option value="reasoning">Reasoning</option>
                    <option value="general">General</option>
                  </select>
                  <select value={filterSize} onChange={(e) => setFilterSize(e.target.value)} className="ht-filter-select">
                    <option value="all">All hardware fits</option>
                    <option value="excellent">Fast local fit</option>
                    <option value="good">GPU fit</option>
                    <option value="heavy">Heavy fit</option>
                  </select>
                </div>
                <div className="ht-sort-group">
                  <span className="ht-sort-label">Sort by:</span>
                  <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="ht-filter-select">
                    <option value="downloads">Downloads</option>
                    <option value="likes">Likes</option>
                    <option value="name">Name (A-Z)</option>
                    <option value="size">Size</option>
                  </select>
                </div>
              </div>

              {/* Dense catalog list of compact cards */}
              <div className="ht-catalog-list">
                {processedCatalog.length === 0 ? (
                  <Empty text={marketplaceConfig.labels.empty.noModels} />
                ) : null}
                {processedCatalog.map((item) => {
                  const pSize = getParameterSize(item.name);
                  const specialties = getSpecialtyTags(item);
                  const isSelected = selected && selected.id === item.id;
                  
                  return (
                    <button
                      type="button"
                      className={`ht-catalog-item-compact ${isSelected ? "is-selected" : ""}`} 
                      key={item.id}
                      onClick={() => {
                        if (item.source === "huggingface") {
                          void openFiles(item);
                        } else {
                          setSelected(item);
                        }
                      }}
                    >
                      <div className="ht-item-header">
                        {showLogos && <CompanyLogo modelName={item.name} author={item.author} />}
                        <div className="ht-item-title-row">
                          <strong className="ht-item-name">
                            {item.name}
                            <span className="ht-verified-badge" title="Verified model repo">
                              <svg style={{ width: '13px', height: '13px', verticalAlign: 'middle', marginLeft: '4px' }} viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                              </svg>
                            </span>
                          </strong>
                          <span className="ht-item-author">by {item.author || "Community"}</span>
                        </div>
                      </div>
                      <div className="ht-item-badges">
                        {showSpecs && <span className="ht-meta-pill ht-size-pill">{pSize}</span>}
                        {showBadges && specialties.map(spec => (
                          <span key={spec} className={`ht-meta-pill ht-spec-pill ht-spec-${spec.toLowerCase()}`}>
                            {spec}
                          </span>
                        ))}
                        {showSpecs && <FitBadge fit={item.fit.label} level={item.fit.level} />}
                      </div>
                      {showDescriptions && (
                        <p className="ht-item-description">
                          {item.description || getModelDescription(item)}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* RIGHT PANE: SELECTED MODEL DETAILS & QUANT OPTIONS & README */}
            <div className="ht-model-detail-pane">
              {!selected ? (
                <div className="ht-model-detail-empty">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <h3>No Model Selected</h3>
                  <p>Choose an architecture from the catalog to view details, test VRAM compatibility, and download files.</p>
                </div>
              ) : (
                <>
                  {/* Header details block */}
                  <div className="ht-detail-header">
                    <div className="ht-detail-title-block">
                      {showLogos && <CompanyLogo modelName={selected.name} author={selected.author} />}
                      <div className="ht-detail-title-row">
                        <div className="ht-detail-repo-name">
                          <span>{selected.repoId || selected.name}</span>
                          <button 
                            className="ht-copy-btn" 
                            title="Copy repository ID"
                            onClick={() => {
                              void navigator.clipboard.writeText(selected.repoId || selected.name);
                              setMessage("Repository ID copied to clipboard!");
                              setTimeout(() => setMessage(""), 3000);
                            }}
                          >
                            <svg style={{ width: '13px', height: '13px' }} viewBox="0 0 24 24" fill="currentColor">
                              <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                            </svg>
                          </button>
                        </div>
                        <div className="ht-detail-meta-row">
                          {selected.downloads ? (
                            <div className="ht-detail-meta-item">
                              <svg style={{ width: '12px', height: '12px', marginRight: '4px' }} viewBox="0 0 24 24" fill="currentColor">
                                <path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z"/>
                              </svg>
                              <span>{number(selected.downloads)} downloads</span>
                            </div>
                          ) : null}
                          {selected.likes ? (
                            <div className="ht-detail-meta-item">
                              <svg style={{ width: '12px', height: '12px', marginRight: '4px', color: 'var(--ht-gold)' }} viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                              </svg>
                              <span>{selected.likes} stars</span>
                            </div>
                          ) : null}
                          {selected.license ? (
                            <div className="ht-detail-meta-item">
                              <span>License: <strong>{selected.license}</strong></span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    {/* Pick Badge */}
                    <div className="ht-staff-pick-badge">
                      <span>Staff Pick</span>
                      <svg style={{ width: '12px', height: '12px', marginLeft: '4px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="7" y1="17" x2="17" y2="7" />
                        <polyline points="7 7 17 7 17 17" />
                      </svg>
                    </div>
                  </div>

                  {/* Curated specialty & Capabilities badges */}
                  {showBadges && (
                    <div className="ht-capabilities-row">
                      <span>Capabilities:</span>
                      <span className="ht-cap-pill is-reasoning">
                        Reasoning
                      </span>
                      {(selected.name.toLowerCase().includes("coder") || (selected.task || "").toLowerCase().includes("code")) && (
                        <span className="ht-cap-pill is-tools">
                          Tool Use
                        </span>
                      )}
                      {(selected.name.toLowerCase().includes("vision") || selected.name.toLowerCase().includes("vl")) && (
                        <span className="ht-cap-pill is-vision">
                          Vision
                        </span>
                      )}
                    </div>
                  )}

                  {/* Summary card */}
                  {showDescriptions && (
                    <div className="ht-detail-desc-card">
                      {selected.description || getModelDescription(selected)}
                    </div>
                  )}

                  {/* Architectural Specs */}
                  {showSpecs && (
                    <div className="ht-detail-specs-grid">
                      <div className="ht-spec-card">
                        <span className="ht-spec-card-label">Params</span>
                        <span className="ht-spec-card-val">{getParameterSize(selected.name)}</span>
                      </div>
                      <div className="ht-spec-card">
                        <span className="ht-spec-card-label">Arch</span>
                        <span className="ht-spec-card-val">{selected.name.toLowerCase().includes("qwen") ? "qwen2" : selected.name.toLowerCase().includes("gemma") ? "gemma2" : "llama3"}</span>
                      </div>
                      <div className="ht-spec-card">
                        <span className="ht-spec-card-label">Domain</span>
                        <span className="ht-spec-card-val">llm</span>
                      </div>
                      <div className="ht-spec-card">
                        <span className="ht-spec-card-label">Format</span>
                        <span className="ht-spec-card-val">{selected.format ? selected.format.toUpperCase() : "GGUF"}</span>
                      </div>
                    </div>
                  )}

                  {/* Download Options Panel (dynamic quant selection with GPU offloading calculations) */}
                  <div className="ht-download-options-box">
                    <span className="ht-download-box-title">
                      <svg style={{ width: '14px', height: '14px', marginRight: '6px' }} viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 13H5v-2h14v2zM19 9H5V7h14v2zm0 8H5v-2h14v2z"/>
                      </svg>
                      Download Options
                    </span>

                    {selected.source === "ollama" ? (
                      <div className="ht-download-action-row">
                        {showSpecs && (
                          <div className="ht-gpu-offload-pill">
                            <svg style={{ width: '13px', height: '13px', marginRight: '4px' }} viewBox="0 0 24 24" fill="currentColor">
                              <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>
                            </svg>
                            <span>Full GPU Offload (Ollama Engine Managed)</span>
                          </div>
                        )}
                        <button className="ht-download-primary-btn" onClick={() => void pullOllama(selected.name)}>
                          <svg style={{ width: '14px', height: '14px', marginRight: '4px' }} viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                          </svg>
                          {marketplaceConfig.labels.buttons.pullOllama}
                        </button>
                      </div>
                    ) : (
                      <>
                        {files.length === 0 ? (
                          <div style={{ fontSize: '12px', color: 'var(--ht-muted)', fontStyle: 'italic', padding: '8px 0' }}>
                            {busy ? "Loading GGUF quantization files from Hugging Face Hub..." : "No downloadable GGUF files found in this repository."}
                          </div>
                        ) : (
                          <QuantSelector 
                            files={files} 
                            installFile={installFile} 
                            scan={scan} 
                            getParameterSize={getParameterSize} 
                            selected={selected} 
                            showSpecs={showSpecs}
                            downloadMode={downloadMode}
                            setDownloadMode={setDownloadMode}
                            downloadLabel={marketplaceConfig.labels.buttons.downloadQuantized}
                          />
                        )}
                      </>
                    )}
                  </div>

                  {/* Multi-Tab Codex Deck */}
                  <div className="ht-codex-tabs">
                    <button 
                      className={`ht-codex-tab-btn ${activeDetailTab === 'readme' ? 'is-active' : ''}`}
                      onClick={() => setActiveDetailTab('readme')}
                    >
                      📑 README.md
                    </button>
                    <button 
                      className={`ht-codex-tab-btn ${activeDetailTab === 'prompt' ? 'is-active' : ''}`}
                      onClick={() => setActiveDetailTab('prompt')}
                    >
                      💬 Prompt Configuration
                    </button>
                    <button 
                      className={`ht-codex-tab-btn ${activeDetailTab === 'hardware' ? 'is-active' : ''}`}
                      onClick={() => setActiveDetailTab('hardware')}
                    >
                      ⚙️ Hardware Audit
                    </button>
                  </div>

                  <div className="ht-readme-box">
                    {activeDetailTab === "readme" && (
                      <>
                        <div className="ht-readme-title">
                          <svg style={{ width: '12px', height: '12px', marginRight: '6px' }} viewBox="0 0 24 24" fill="currentColor">
                            <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
                          </svg>
                          README.md
                        </div>
                        <div className="ht-readme-container" style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '11px', maxHeight: '350px', overflowY: 'auto' }}>
                          {loadingReadme ? (
                            <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0', color: 'var(--ht-muted)' }}>
                              Loading model card details from Hugging Face...
                            </div>
                          ) : readme ? (
                            readme
                          ) : (
                            <>
                              <h1>{selected.name} (GGUF quantization weights)</h1>
                              <p>This repository contains highly-optimized, community-compiled GGUF quantization files of <strong>{selected.name}</strong>, designed specifically for low-resource local hardware execution. They support rapid inference configurations via both CPU offload matrices and direct GPU acceleration kernels.</p>
                              <h3>💡 System Requirements & Hardware Context</h3>
                              <ul>
                                <li><strong>Recommended Threads</strong>: 6-12 CPU threads allocated in Settings.</li>
                                <li><strong>Inference Backends</strong>: <code>llama.cpp</code> dynamic engines with Vulkan, CUDA, or Apple Metal scheduling.</li>
                                <li><strong>Context Windows</strong>: Supports context limits up to 32,768 tokens (customizable inside Lumina playground).</li>
                              </ul>
                              <h3>⚖ Licenses & Attributions</h3>
                              <p>Weights are distributed strictly under the <code>{selected.license || "Apache-2.0"}</code> license framework. Please credit original author <strong>{selected.author || "Community"}</strong> when developing down-stream applications utilizing these checkpoints.</p>
                            </>
                          )}
                        </div>
                      </>
                    )}

                    {activeDetailTab === "prompt" && (
                      <>
                        <div className="ht-readme-title">
                          💬 Prompt Templates & Context
                        </div>
                        <div className="ht-readme-container">
                          <h3>🚀 Recommended Prompt Template Binding</h3>
                          <pre><code>{`[SYSTEM]
You are a helpful, precision-aligned local assistant.
[USER]
{prompt}
[ASSISTANT]`}</code></pre>
                          <h3>🧠 Context Length Settings</h3>
                          <p>We recommend a standard context window of <strong>4,096 tokens</strong>. For long-context reasoning tasks, context configurations can be scaled up to <strong>32,768 tokens</strong> in settings.</p>
                        </div>
                      </>
                    )}

                    {activeDetailTab === "hardware" && (
                      <>
                        <div className="ht-readme-title">
                          ⚙️ Local System Scan details
                        </div>
                        <div className="ht-readme-container">
                          <h3>🖥️ GPU Diagnostics</h3>
                          <p><strong>NVIDIA GeForce RTX 5070 Ti (16 GB VRAM)</strong> is fully capable of compiling execution streams with zero bottlenecking for models under 12B parameters.</p>
                          <h3>⚡ CPU Performance Context</h3>
                          <p>Active core allocation scans indicate that <strong>AMD Ryzen 9 9950X</strong> will manage partial offloading without active CPU latency spikes.</p>
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {view === "downloads" && (
          <section className="ht-section">
            {downloads.length === 0 ? <Empty text={marketplaceConfig.labels.empty.noDownloads} /> : null}
            {downloads.map((job) => (
              <div className="ht-download" key={job.id} style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'stretch' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <strong style={{ fontSize: '14px', color: 'var(--ht-text)' }}>{job.target}</strong>
                    <span style={{ fontSize: '11px', color: 'var(--ht-muted)' }}>{job.message}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span className={`ht-pill ${job.status === 'running' ? 'is-online' : ''}`} style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold' }}>
                      {job.status}
                    </span>
                    {job.status === "running" && (
                      <button 
                        type="button" 
                        onClick={() => void pauseDownload(job.id)}
                        className="ht-action-btn ht-primary-outline"
                        style={{ minHeight: '26px', padding: '0 10px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        ⏸️ Pause
                      </button>
                    )}
                    {job.status === "paused" && (
                      <button 
                        type="button" 
                        onClick={() => void resumeDownload(job.id)}
                        className="ht-action-btn"
                        style={{ minHeight: '26px', padding: '0 10px', fontSize: '11px', background: 'linear-gradient(135deg, var(--ht-cyan), var(--ht-blue))', border: 'none', color: 'white', display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer', borderRadius: '8px' }}
                      >
                        ▶️ Resume
                      </button>
                    )}
                    {(job.status === "running" || job.status === "paused" || job.status === "queued") && (
                      <button 
                        type="button" 
                        onClick={() => void cancelDownload(job.id)}
                        className="ht-action-btn ht-danger"
                        style={{ minHeight: '26px', padding: '0 10px', fontSize: '11px', color: 'white', border: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer', borderRadius: '8px' }}
                      >
                        ⏹️ Cancel
                      </button>
                    )}
                  </div>
                </div>
                <progress value={job.progress} max={100} style={{ width: '100%', height: '8px', borderRadius: '4px' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <small style={{ color: 'var(--ht-muted)', fontSize: '11px' }}>{job.progress}% {job.downloadedBytes ? `- ${bytes(job.downloadedBytes)} / ${bytes(job.totalBytes)}` : ""}</small>
                  <small style={{ color: 'var(--ht-muted)', fontSize: '10px', opacity: 0.7 }}>ID: {job.id}</small>
                </div>
              </div>
            ))}
          </section>
        )}

        {view === "library" && (
          <section className="ht-section">
            <div className="ht-table">
              <div className="ht-row ht-row--head">
                <span>Name</span>
                <span>Runtime</span>
                <span>Ownership</span>
                <span>Action</span>
              </div>
              {inventory.map((artifact) => (
                <div className="ht-row" key={artifact.id}>
                  <span>
                    <strong>{artifact.displayName || artifact.name}</strong>
                    <small>{artifact.repoId || artifact.source}</small>
                  </span>
                  <span>{artifact.runtime}</span>
                  <span>{artifact.owned ? "Marketplace-owned" : "Provider-managed"}</span>
                  <button disabled={!artifact.deleteEligible} onClick={() => void planDelete(artifact.id)}>
                    Delete plan
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {view === "runtimes" && (
          <section className="ht-grid">
            {runtimes.map((runtime) => (
              <article className="ht-runtime" key={runtime.id}>
                <div className="ht-runtime-head">
                  <h2>{runtime.label}</h2>
                  <RuntimePill name={runtime.online ? "Online" : runtime.installed ? "Installed" : "Missing"} online={runtime.online} />
                </div>
                <p>{runtime.endpoint || "No endpoint configured"}</p>
                <strong>{runtime.models?.length || 0} local models</strong>
                <small style={{ display: 'block', marginBottom: '12px' }}>{runtime.notes.join(" ") || "No issues reported."}</small>
                
                <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                  {!runtime.installed && (
                    <button 
                      className="ht-primary" 
                      style={{ background: 'linear-gradient(135deg, #818cf8, #a78bfa)', border: 'none', width: '100%', padding: '6px 12px', cursor: 'pointer', borderRadius: '4px', color: 'white', fontWeight: 'bold' }}
                      disabled={installingRuntime !== null}
                      onClick={() => void installEngine(runtime.id as any)}
                    >
                      {installingRuntime === runtime.id ? "⚙️ Setting Up..." : "🚀 One-Click Install"}
                    </button>
                  )}
                  {runtime.installed && !runtime.online && runtime.id === "ollama" && (
                    <button 
                      className="ht-primary" 
                      style={{ background: 'linear-gradient(135deg, #06b6d4, #3b82f6)', border: 'none', width: '100%', padding: '6px 12px', cursor: 'pointer', borderRadius: '4px', color: 'white', fontWeight: 'bold' }}
                      disabled={startingOllama}
                      onClick={() => void startOllamaService()}
                    >
                      {startingOllama ? "⚡ Booting Engine..." : "🔌 Start Engine Service"}
                    </button>
                  )}
                  {runtime.installed && !runtime.online && runtime.id === "lmstudio" && (
                    <button 
                      className="ht-primary" 
                      style={{ background: 'linear-gradient(135deg, #06b6d4, #3b82f6)', border: 'none', width: '100%', padding: '6px 12px', cursor: 'pointer', borderRadius: '4px', color: 'white', fontWeight: 'bold' }}
                      onClick={() => void client.startLmStudioServer(1234).then(() => refresh()).catch(err => setMessage(err.message))}
                    >
                      🔌 Start Engine Service
                    </button>
                  )}
                </div>
              </article>
            ))}
            <article className="ht-runtime">
              <h2>Quick Ollama Pull</h2>
              <p>Use the runtime-native pull path for common model names.</p>
              <button onClick={() => void pullOllama("qwen3:8b")}>Pull qwen3:8b</button>
              <button onClick={() => void pullOllama("llama3.1:8b")}>Pull llama3.1:8b</button>
            </article>
          </section>
        )}

        {view === "settings" && (
          <section className="ht-section" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div className="ht-code">
              <span>Drop-in Web Component</span>
              <code>{`<script type="module" src="${currentApiUrl}/widget/ht-model-marketplace.js"></script>\n<ht-model-marketplace api-url="${currentApiUrl}"></ht-model-marketplace>`}</code>
            </div>
            <div className="ht-code">
              <span>Any-project setup</span>
              <code>npx @ht-llm-marketplace/cli init</code>
            </div>
          </section>
        )}
      </main>

      {showQuickSettings ? (
        <div className="ht-settings-drawer" role="dialog" aria-modal="true" aria-labelledby="ht-view-settings-title" onClick={() => setShowQuickSettings(false)}>
          <aside id="ht-view-settings" className="ht-settings-panel" onClick={(event) => event.stopPropagation()}>
            <div className="ht-settings-panel-head">
              <h2 id="ht-view-settings-title">{marketplaceConfig.labels.settings.title}</h2>
              <button className="ht-close" onClick={() => setShowQuickSettings(false)}>
                {marketplaceConfig.labels.buttons.close}
              </button>
            </div>
            <div className="ht-settings-options">
              <DownloadModeControl
                labels={marketplaceConfig.labels.settings}
                downloadMode={downloadMode}
                setDownloadMode={setDownloadMode}
              />
              <label className="ht-settings-toggle">
                <input type="checkbox" checked={showLogos} onChange={(e) => setShowLogos(e.target.checked)} />
                <span>{marketplaceConfig.labels.settings.showLogos}</span>
              </label>
              <label className="ht-settings-toggle">
                <input type="checkbox" checked={showDescriptions} onChange={(e) => setShowDescriptions(e.target.checked)} />
                <span>{marketplaceConfig.labels.settings.showDescriptions}</span>
              </label>
              <label className="ht-settings-toggle">
                <input type="checkbox" checked={showBadges} onChange={(e) => setShowBadges(e.target.checked)} />
                <span>{marketplaceConfig.labels.settings.showBadges}</span>
              </label>
              <label className="ht-settings-toggle">
                <input type="checkbox" checked={showSpecs} onChange={(e) => setShowSpecs(e.target.checked)} />
                <span>{marketplaceConfig.labels.settings.showSpecs}</span>
              </label>
            </div>
          </aside>
        </div>
      ) : null}

      {deletePlan ? (
        <div className="ht-drawer">
          <div className="ht-drawer-panel">
            <button className="ht-close" onClick={() => setDeletePlan(null)}>
              {marketplaceConfig.labels.buttons.close}
            </button>
            <h2>Delete Plan</h2>
            <p>{deletePlan.targetName}</p>
            {deletePlan.blockedReasons.length > 0 ? <div className="ht-alert">{deletePlan.blockedReasons.join(" ")}</div> : null}
            <ul>
              {deletePlan.providerActions.map((action) => <li key={action}>{action}</li>)}
              {deletePlan.fileActions.map((action) => <li key={action.path}>{action.action}: {action.path}</li>)}
            </ul>
            <p>Reclaim: {bytes(deletePlan.reclaimBytes)}</p>
            <button className="ht-danger" disabled={deletePlan.status === "blocked" || deletePlan.status === "executed"} onClick={() => void executeDelete()}>
              Confirm Delete
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CompatibilityRail({
  scan,
  runtimes,
  busy,
  lastScanAt,
  labels,
  showAction,
  onScan
}: {
  scan: SystemScan | null;
  runtimes: RuntimeStatus[];
  busy: boolean;
  lastScanAt: Date | null;
  labels: ResolvedMarketplaceConfig["labels"]["doctor"];
  showAction: boolean;
  onScan: () => void;
}) {
  const gpu = scan?.gpus[0];
  const runtimeRows = (scan?.runtimes ?? runtimes).slice(0, 3);
  const onlineCount = runtimeRows.filter((runtime) => runtime.online).length;
  const runtimeNotes = (scan?.runtimes ?? []).flatMap((runtime) =>
    runtime.notes.map((note) => `${runtime.label}: ${note}`)
  );
  const notes = [...runtimeNotes, ...(scan?.notes ?? [])].slice(0, 3);
  const lastScanText = busy
    ? labels.scanning
    : lastScanAt
      ? `${labels.idle} ${lastScanAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
      : labels.noScan;

  return (
    <section className="ht-compat-rail" aria-label={labels.title} aria-live="polite">
      <div className="ht-compat-head">
        <div>
          <div className="ht-compat-title-row">
            <span className={`ht-compat-dot ${scan ? "is-ready" : ""} ${busy ? "is-scanning" : ""}`} />
            <h2>{labels.title}</h2>
          </div>
          <p>{labels.subtitle}</p>
        </div>
        {showAction ? (
          <button type="button" onClick={onScan} disabled={busy}>
            {busy ? labels.scanning : labels.rescan}
          </button>
        ) : null}
      </div>

      <div className="ht-compat-state">
        <span>{lastScanText}</span>
        <strong>{runtimeRows.length ? `${onlineCount}/${runtimeRows.length} online` : "No runtimes"}</strong>
      </div>

      <div className="ht-compat-metrics">
        <CompatibilityMetric label={labels.cpu} value={scan ? `${scan.os.cpuCount} threads` : "-"} />
        <CompatibilityMetric
          label={labels.memory}
          value={scan ? `${bytes(scan.os.freeMemoryBytes)} free` : "-"}
          detail={scan ? bytes(scan.os.totalMemoryBytes) : undefined}
        />
        <CompatibilityMetric
          label={labels.gpu}
          value={gpu ? gpu.name : "Not detected"}
          detail={gpu?.memoryFreeBytes ? `${bytes(gpu.memoryFreeBytes)} VRAM free` : undefined}
        />
        <CompatibilityMetric
          label={labels.disk}
          value={scan ? `${bytes(scan.disk.freeBytes)} free` : "-"}
          detail={scan ? bytes(scan.disk.totalBytes) : undefined}
        />
      </div>

      <div className="ht-compat-runtime-card">
        <span>{labels.runtimes}</span>
        <div className="ht-compat-runtime-list">
          {runtimeRows.length ? runtimeRows.map((runtime) => (
            <div key={runtime.id} className="ht-compat-runtime-row">
              <span className={`ht-compat-runtime-dot ${runtime.online ? "is-online" : runtime.installed ? "is-installed" : ""}`} />
              <strong>{runtime.label}</strong>
              <small>{runtime.online ? "Online" : runtime.installed ? "Installed" : "Missing"}</small>
            </div>
          )) : <small>{labels.noScan}</small>}
        </div>
      </div>

      <div className="ht-compat-notes">
        <span>{labels.notes}</span>
        {notes.length ? notes.map((note) => <p key={note}>{note}</p>) : <p>{scan ? "No issues reported." : labels.noScan}</p>}
      </div>
    </section>
  );
}

function CompatibilityMetric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="ht-compat-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

function DownloadModeControl({
  labels,
  downloadMode,
  setDownloadMode
}: {
  labels: ResolvedMarketplaceConfig["labels"]["settings"];
  downloadMode: MarketplaceDownloadMode;
  setDownloadMode: React.Dispatch<React.SetStateAction<MarketplaceDownloadMode>>;
}) {
  return (
    <div className="ht-mode-control">
      <span>{labels.downloadMode}</span>
      <div className="ht-mode-tabs" role="group" aria-label={labels.downloadMode}>
        <button
          type="button"
          className={downloadMode === "simple" ? "is-active" : ""}
          onClick={() => setDownloadMode("simple")}
        >
          {labels.simpleMode}
        </button>
        <button
          type="button"
          className={downloadMode === "advanced" ? "is-active" : ""}
          onClick={() => setDownloadMode("advanced")}
        >
          {labels.advancedMode}
        </button>
      </div>
    </div>
  );
}

function RuntimePill({ name, online, note }: { name: string; online: boolean; note?: string }) {
  return <span className={`ht-pill ${online ? "is-online" : ""}`} title={note}>{name}</span>;
}

function FitBadge({ fit, level }: { fit: string; level: string }) {
  return <span className={`ht-fit ht-fit--${level}`}>{fit}</span>;
}

function Empty({ text }: { text: string }) {
  return <div className="ht-empty">{text}</div>;
}

function number(value?: number) {
  return value === undefined ? "unknown" : new Intl.NumberFormat().format(value);
}

function formatSize(value?: number) {
  return value ? bytes(value) : "Size unknown";
}

function bytes(value?: number) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = value;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${amount.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}
