import type { CSSProperties } from "react";

export type MarketplaceTheme = "dark" | "light" | "system";
export type MarketplaceView = "discover" | "downloads" | "library" | "runtimes" | "doctor" | "settings";
export type MarketplaceNavigationView = Exclude<MarketplaceView, "doctor">;
export type MarketplaceDownloadMode = "simple" | "advanced";

export const MARKETPLACE_VIEWS: MarketplaceNavigationView[] = ["discover", "downloads", "library", "runtimes", "settings"];

export interface MarketplaceBranding {
  name?: string;
  tagline?: string;
  mark?: string;
}

export interface MarketplaceDisplay {
  showLogos?: boolean;
  showDescriptions?: boolean;
  showBadges?: boolean;
  showSpecs?: boolean;
  downloadMode?: MarketplaceDownloadMode;
}

export interface MarketplaceLabels {
  nav?: Partial<Record<MarketplaceView, string>>;
  subtitles?: Partial<Record<MarketplaceView, string>>;
  buttons?: {
    search?: string;
    refresh?: string;
    runDoctor?: string;
    viewSettings?: string;
    close?: string;
    downloadQuantized?: string;
    pullOllama?: string;
  };
  settings?: {
    title?: string;
    showLogos?: string;
    showDescriptions?: string;
    showBadges?: string;
    showSpecs?: string;
    downloadMode?: string;
    simpleMode?: string;
    advancedMode?: string;
  };
  doctor?: {
    title?: string;
    subtitle?: string;
    scanning?: string;
    idle?: string;
    noScan?: string;
    rescan?: string;
    cpu?: string;
    memory?: string;
    gpu?: string;
    disk?: string;
    runtimes?: string;
    notes?: string;
  };
  empty?: {
    noModels?: string;
    noDownloads?: string;
    noScan?: string;
  };
}

export interface MarketplaceFeatures {
  discover?: boolean;
  downloads?: boolean;
  library?: boolean;
  runtimes?: boolean;
  doctor?: boolean;
  settings?: boolean;
  themeToggle?: boolean;
  refresh?: boolean;
  doctorAction?: boolean;
  viewSettings?: boolean;
}

export type MarketplaceTokens = Record<string, string | number | null | undefined>;

export interface MarketplaceConfig {
  apiUrl?: string;
  theme?: MarketplaceTheme;
  compact?: boolean;
  branding?: MarketplaceBranding;
  display?: MarketplaceDisplay;
  labels?: MarketplaceLabels;
  features?: MarketplaceFeatures;
  tokens?: MarketplaceTokens;
  defaultQuery?: string;
  storageKey?: string;
}

export interface LegacyMarketplaceProps {
  apiUrl?: string;
  compact?: boolean;
}

export interface ResolvedMarketplaceConfig {
  apiUrl: string;
  theme: MarketplaceTheme;
  compact: boolean;
  branding: Required<MarketplaceBranding>;
  display: Required<MarketplaceDisplay>;
  labels: {
    nav: Record<MarketplaceNavigationView, string>;
    subtitles: Record<MarketplaceNavigationView, string>;
    buttons: Required<NonNullable<MarketplaceLabels["buttons"]>>;
    settings: Required<NonNullable<MarketplaceLabels["settings"]>>;
    doctor: Required<NonNullable<MarketplaceLabels["doctor"]>>;
    empty: Required<NonNullable<MarketplaceLabels["empty"]>>;
  };
  features: Required<MarketplaceFeatures>;
  tokens: MarketplaceTokens;
  defaultQuery: string;
  storageKey: string;
}

export const DEFAULT_MARKETPLACE_CONFIG: ResolvedMarketplaceConfig = {
  apiUrl: "http://127.0.0.1:3001",
  theme: "dark",
  compact: false,
  branding: {
    name: "Local LLM Marketplace",
    tagline: "Private model supply chain",
    mark: "HT"
  },
  display: {
    showLogos: true,
    showDescriptions: true,
    showBadges: true,
    showSpecs: true,
    downloadMode: "simple"
  },
  labels: {
    nav: {
      discover: "Discover",
      downloads: "Downloads",
      library: "Library",
      runtimes: "Runtimes",
      settings: "Embed"
    },
    subtitles: {
      discover: "Search open model sources and choose exact runnable artifacts.",
      downloads: "Private local queue with resumable progress state.",
      library: "Installed inventory split from remote catalog results.",
      runtimes: "Ollama, LM Studio, direct GGUF, and OpenAI-compatible routes.",
      settings: "Drop the marketplace into any project type."
    },
    buttons: {
      search: "Search",
      refresh: "Refresh",
      runDoctor: "Run Doctor",
      viewSettings: "View Settings",
      close: "Close",
      downloadQuantized: "Download Quantized GGUF",
      pullOllama: "Pull from Ollama"
    },
    settings: {
      title: "View Settings",
      showLogos: "Show Logos",
      showDescriptions: "Show Descriptions",
      showBadges: "Show Specialty Badges",
      showSpecs: "Show Performance Specs",
      downloadMode: "Download Mode",
      simpleMode: "Simple",
      advancedMode: "Advanced"
    },
    doctor: {
      title: "Compatibility",
      subtitle: "Auto-scanning local readiness.",
      scanning: "Scanning...",
      idle: "Auto scan",
      noScan: "Waiting for first scan.",
      rescan: "Scan now",
      cpu: "CPU",
      memory: "Memory",
      gpu: "GPU",
      disk: "Disk",
      runtimes: "Runtimes",
      notes: "Signals"
    },
    empty: {
      noModels: "No models found matching the search criteria.",
      noDownloads: "No active downloads. Search a GGUF file or pull an Ollama model.",
      noScan: "Run Doctor to inspect this local machine."
    }
  },
  features: {
    discover: true,
    downloads: true,
    library: true,
    runtimes: true,
    doctor: true,
    settings: true,
    themeToggle: true,
    refresh: true,
    doctorAction: true,
    viewSettings: true
  },
  tokens: {},
  defaultQuery: "",
  storageKey: "ht_marketplace"
};

export function resolveMarketplaceConfig(config: MarketplaceConfig = {}, legacy: LegacyMarketplaceProps = {}): ResolvedMarketplaceConfig {
  const base = DEFAULT_MARKETPLACE_CONFIG;
  const features = { ...base.features, ...config.features };
  const display = {
    ...base.display,
    ...config.display,
    downloadMode: normalizeDownloadMode(config.display?.downloadMode) ?? base.display.downloadMode
  };
  return {
    apiUrl: legacy.apiUrl ?? config.apiUrl ?? base.apiUrl,
    theme: normalizeTheme(config.theme) ?? base.theme,
    compact: legacy.compact ?? config.compact ?? base.compact,
    branding: { ...base.branding, ...config.branding },
    display,
    labels: {
      nav: { ...base.labels.nav, ...config.labels?.nav },
      subtitles: { ...base.labels.subtitles, ...config.labels?.subtitles },
      buttons: { ...base.labels.buttons, ...config.labels?.buttons },
      settings: { ...base.labels.settings, ...config.labels?.settings },
      doctor: { ...base.labels.doctor, ...config.labels?.doctor },
      empty: { ...base.labels.empty, ...config.labels?.empty }
    },
    features,
    tokens: { ...base.tokens, ...config.tokens },
    defaultQuery: config.defaultQuery ?? base.defaultQuery,
    storageKey: config.storageKey ?? base.storageKey
  };
}

export function getEnabledViews(features: Required<MarketplaceFeatures>): MarketplaceNavigationView[] {
  const enabled = MARKETPLACE_VIEWS.filter((view) => features[view]);
  return enabled.length > 0 ? enabled : ["discover"];
}

export function chooseView(requested: MarketplaceView, enabledViews: MarketplaceNavigationView[]): MarketplaceNavigationView {
  if (requested !== "doctor" && enabledViews.includes(requested)) return requested;
  return enabledViews[0] ?? "discover";
}

export function tokensToStyle(tokens: MarketplaceTokens): CSSProperties {
  return Object.fromEntries(
    Object.entries(tokens)
      .filter(([, value]) => value !== undefined && value !== null && `${value}`.trim() !== "")
      .map(([key, value]) => [normalizeTokenName(key), `${value}`])
  ) as CSSProperties;
}

export function storageName(storageKey: string, setting: keyof MarketplaceDisplay): string {
  return `${storageKey}:${setting}`;
}

function normalizeTheme(theme?: string): MarketplaceTheme | undefined {
  if (theme === "dark" || theme === "light" || theme === "system") return theme;
  return undefined;
}

function normalizeDownloadMode(mode?: string): MarketplaceDownloadMode | undefined {
  if (mode === "simple" || mode === "advanced") return mode;
  return undefined;
}

function normalizeTokenName(key: string): string {
  if (key.startsWith("--")) return key;
  if (key.startsWith("ht-")) return `--${key}`;
  return `--ht-${key}`;
}
