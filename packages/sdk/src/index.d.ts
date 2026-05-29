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
}
export interface HuggingFaceDryRun {
    repoId: string;
    revision: string;
    allowPatterns: string[];
    fileCount: number;
    totalBytes: number;
    bytesToDownload: number;
    files: Array<{
        path: string;
        sizeBytes?: number;
        wouldDownload: boolean;
    }>;
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
export interface DownloadJob {
    id: string;
    type: "ollama-pull" | "hf-file";
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
    fileActions: Array<{
        path: string;
        sizeBytes?: number;
        action: "delete-file" | "remove-empty-dir";
    }>;
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
    source: "ollama" | "huggingface";
    runtime?: RuntimeId;
    model?: string;
    repoId?: string;
    filename?: string;
    revision?: string;
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
export interface MarketplaceClientOptions {
    apiUrl?: string;
    fetchImpl?: typeof fetch;
}
export declare class MarketplaceClient {
    readonly apiUrl: string;
    private readonly fetchImpl;
    constructor(options?: MarketplaceClientOptions);
    health(): Promise<{
        ok: boolean;
        version: string;
        storage: {
            database: boolean;
        };
    }>;
    systemScan(): Promise<SystemScan>;
    runtimes(): Promise<{
        runtimes: RuntimeStatus[];
    }>;
    searchCatalog(query: string, limit?: number): Promise<{
        items: CatalogItem[];
    }>;
    huggingFaceFiles(repoId: string, revision?: string): Promise<{
        files: CatalogFile[];
    }>;
    dryRunHuggingFaceDownload(repoId: string, revision?: string, allowPatterns?: string[]): Promise<HuggingFaceDryRun>;
    inventory(): Promise<{
        artifacts: InventoryArtifact[];
    }>;
    downloads(): Promise<{
        jobs: DownloadJob[];
    }>;
    startDownload(request: StartDownloadRequest): Promise<{
        job: DownloadJob;
    }>;
    createDeletePlan(request: CreateDeletePlanRequest): Promise<{
        plan: DeletePlan;
    }>;
    confirmDeletePlan(planId: string): Promise<{
        plan: DeletePlan;
    }>;
    auditLog(): Promise<{
        entries: AuditLogEntry[];
    }>;
    loadRuntime(request: RuntimeLoadRequest): Promise<{
        ok: boolean;
        message: string;
    }>;
    unloadRuntime(runtime: RuntimeId, model?: string): Promise<{
        ok: boolean;
        message: string;
    }>;
    startLmStudioServer(port?: number): Promise<{
        ok: boolean;
        message: string;
    }>;
    downloadEvents(): EventSource;
    private get;
    private post;
    private read;
}
//# sourceMappingURL=index.d.ts.map