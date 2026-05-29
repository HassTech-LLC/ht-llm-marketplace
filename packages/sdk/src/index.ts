export type RuntimeId = "ollama" | "lmstudio" | "llamacpp" | "openai-compatible";

export type ArtifactFormat = "gguf" | "safetensors" | "onnx" | "mlx" | "diffusers" | "whisper" | "unknown";

export interface SystemGpu {
  name: string;
  driverVersion?: string;
  memoryTotalBytes?: number;
  memoryUsedBytes?: number;
  memoryFreeBytes?: number;
  utilizationPercent?: number;
  temperatureC?: number;
}

export interface SystemScan {
  os: {
    platform: string;
    arch: string;
    cpuCount: number;
    totalMemoryBytes: number;
    freeMemoryBytes: number;
  };
  disk: {
    totalBytes?: number;
    freeBytes?: number;
    modelsBytes: number;
  };
  gpus: SystemGpu[];
  runtimes: RuntimeStatus[];
  notes: string[];
  scannedAt: string;
}

export interface RuntimeStatus {
  id: RuntimeId;
  label: string;
  installed: boolean;
  online: boolean;
  version?: string;
  endpoint?: string;
  models?: RuntimeModel[];
  loadedModels?: RuntimeModel[];
  notes: string[];
}

export interface RuntimeModel {
  id: string;
  name: string;
  displayName?: string;
  sizeBytes?: number;
  format?: ArtifactFormat;
  family?: string;
  parameterSize?: string;
  quantization?: string;
  path?: string;
  loaded?: boolean;
  owned?: boolean;
  runtime: RuntimeId;
}

export interface CatalogItem {
  id: string;
  source: "huggingface" | "ollama" | "local";
  repoId?: string;
  name: string;
  author?: string;
  description?: string;
  downloads?: number;
  likes?: number;
  tags: string[];
  license?: string;
  task?: string;
  format: ArtifactFormat;
  updatedAt?: string;
  url?: string;
  fit: CompatibilityScore;
}

export interface CatalogFile {
  repoId: string;
  path: string;
  format: ArtifactFormat;
  sizeBytes?: number;
  downloadUrl: string;
  runnable: boolean;
  fit: CompatibilityScore;
  multipart?: boolean;
  partCount?: number;
  parts?: CatalogFilePart[];
}

export interface CatalogFilePart {
  path: string;
  sizeBytes?: number;
  downloadUrl: string;
}

export interface HuggingFaceDryRun {
  repoId: string;
  revision: string;
  allowPatterns: string[];
  fileCount: number;
  totalBytes: number;
  bytesToDownload: number;
  files: Array<{ path: string; sizeBytes?: number; wouldDownload: boolean }>;
}

export interface CompatibilityScore {
  level: "excellent" | "good" | "heavy" | "unsupported" | "unknown";
  label: string;
  reasons: string[];
}

export interface InventoryArtifact {
  id: string;
  source: string;
  runtime: RuntimeId;
  name: string;
  displayName?: string;
  repoId?: string;
  filename?: string;
  revision?: string;
  path?: string;
  sizeBytes?: number;
  sha256?: string;
  owned: boolean;
  runnable: boolean;
  loaded?: boolean;
  createdAt: string;
  updatedAt: string;
  deleteEligible: boolean;
  notes: string[];
}

export interface ResolvedOllamaModel {
  ref: string;
  namespace: string;
  model: string;
  tag: string;
  name: string;
  sizeBytes?: number;
  digest: string;
  downloadUrl: string;
}

export interface DownloadJob {
  id: string;
  type: "ollama-pull" | "hf-file" | "ollama-registry";
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  progress: number;
  source: string;
  target: string;
  message: string;
  totalBytes?: number;
  downloadedBytes?: number;
  artifactId?: string;
  startedAt: string;
  updatedAt: string;
}

export interface DeletePlan {
  id: string;
  artifactId: string;
  status: "planned" | "confirmed" | "blocked" | "executed";
  targetName: string;
  reclaimBytes: number;
  providerActions: string[];
  fileActions: Array<{ path: string; sizeBytes?: number; action: "delete-file" | "remove-empty-dir" }>;
  blockedReasons: string[];
  unknownLeftovers: string[];
  proof: string[];
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  type: string;
  target: string;
  details: unknown;
  createdAt: string;
}

export interface StartDownloadRequest {
  source: "ollama" | "huggingface" | "ollama-registry";
  runtime?: RuntimeId;
  model?: string;
  repoId?: string;
  filename?: string;
  filenames?: string[];
  revision?: string;
  /** For the "ollama-registry" source: an Ollama library reference, e.g. "qwen2.5:0.5b". */
  ref?: string;
  displayName?: string;
}

export interface CreateDeletePlanRequest {
  artifactId: string;
}

export interface RuntimeLoadRequest {
  runtime: RuntimeId;
  model: string;
  contextLength?: number;
  gpu?: "off" | "max" | "auto" | number;
  ttlSeconds?: number;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface EngineLoadRequest {
  artifactId?: string;
  path?: string;
  systemPrompt?: string;
  gpuLayers?: number;
}

export interface DiscoveredModel {
  name: string;
  path: string;
  sizeBytes: number;
  source: string;
  dir: string;
  loaded?: boolean;
}

export interface EngineChatRequest {
  runtime: "llamacpp";
  messages: ChatMessage[];
  model?: string;
  artifactId?: string;
  path?: string;
  systemPrompt?: string;
  stream?: boolean;
}

export interface MarketplaceClientOptions {
  apiUrl?: string;
  fetchImpl?: typeof fetch;
}

export class MarketplaceClient {
  readonly apiUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: MarketplaceClientOptions = {}) {
    this.apiUrl = (options.apiUrl || "http://127.0.0.1:3001").replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl || ((input, init) => fetch(input, init));
  }

  health() {
    return this.get<{ ok: boolean; version: string; storage: { database: boolean } }>("/health");
  }

  systemScan() {
    return this.get<SystemScan>("/api/system/scan");
  }

  runtimes() {
    return this.get<{ runtimes: RuntimeStatus[] }>("/api/runtimes");
  }

  searchCatalog(query: string, limit = 12) {
    return this.get<{ items: CatalogItem[] }>(`/api/catalog/search?q=${encodeURIComponent(query)}&limit=${limit}`);
  }

  /** Resolve an Ollama library reference (e.g. "qwen2.5:0.5b") to a downloadable GGUF. */
  resolveOllamaModel(ref: string) {
    return this.get<{ model: ResolvedOllamaModel }>(`/api/catalog/ollama/resolve?ref=${encodeURIComponent(ref)}`);
  }

  huggingFaceFiles(repoId: string, revision = "main") {
    return this.get<{ files: CatalogFile[] }>(
      `/api/catalog/hf/files?repo=${encodeURIComponent(repoId)}&revision=${encodeURIComponent(revision)}`
    );
  }

  dryRunHuggingFaceDownload(repoId: string, revision = "main", allowPatterns = ["*.gguf"]) {
    return this.post<HuggingFaceDryRun>("/api/catalog/hf/dry-run", { repoId, revision, allowPatterns });
  }

  inventory() {
    return this.get<{ artifacts: InventoryArtifact[] }>("/api/inventory");
  }

  downloads() {
    return this.get<{ jobs: DownloadJob[] }>("/api/downloads");
  }

  startDownload(request: StartDownloadRequest) {
    return this.post<{ job: DownloadJob }>("/api/downloads", request);
  }

  createDeletePlan(request: CreateDeletePlanRequest) {
    return this.post<{ plan: DeletePlan }>("/api/delete-plans", request);
  }

  confirmDeletePlan(planId: string) {
    return this.post<{ plan: DeletePlan }>(`/api/delete-plans/${encodeURIComponent(planId)}/confirm`, {});
  }

  auditLog() {
    return this.get<{ entries: AuditLogEntry[] }>("/api/audit-log");
  }

  loadRuntime(request: RuntimeLoadRequest) {
    return this.post<{ ok: boolean; message: string }>(`/api/runtimes/${request.runtime}/load`, request);
  }

  unloadRuntime(runtime: RuntimeId, model?: string) {
    return this.post<{ ok: boolean; message: string }>(`/api/runtimes/${runtime}/unload`, { model });
  }

  startLmStudioServer(port = 1234) {
    return this.post<{ ok: boolean; message: string }>("/api/runtimes/lmstudio/server/start", { port });
  }

  engineModels() {
    return this.get<{ models: DiscoveredModel[] }>("/api/runtimes/llamacpp/models");
  }

  loadEngineModel(request: EngineLoadRequest) {
    return this.post<{ ok: boolean; loaded: string; gpu: string | false }>("/api/runtimes/llamacpp/load", request);
  }

  unloadEngineModel() {
    return this.post<{ ok: boolean; message: string }>("/api/runtimes/llamacpp/unload", {});
  }

  /**
   * Chat with the built-in engine (or Ollama). Returns the raw streaming
   * Response so callers can read the NDJSON token stream directly.
   */
  chat(request: EngineChatRequest | Record<string, unknown>): Promise<Response> {
    return this.fetchImpl(`${this.apiUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request)
    });
  }

  downloadEvents(): EventSource {
    return new EventSource(`${this.apiUrl}/api/downloads/events`);
  }

  private async get<T>(path: string): Promise<T> {
    const response = await this.fetchImpl(`${this.apiUrl}${path}`);
    return this.read<T>(response);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetchImpl(`${this.apiUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    return this.read<T>(response);
  }

  private async read<T>(response: Response): Promise<T> {
    const text = await response.text();
    const payload = text ? JSON.parse(text) : undefined;
    if (!response.ok) {
      const message = payload?.error || payload?.message || `Request failed with ${response.status}`;
      throw new Error(message);
    }
    return payload as T;
  }
}
