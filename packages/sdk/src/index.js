export class MarketplaceClient {
    apiUrl;
    fetchImpl;
    constructor(options = {}) {
        this.apiUrl = (options.apiUrl || "http://127.0.0.1:3001").replace(/\/$/, "");
        this.fetchImpl = options.fetchImpl || ((input, init) => fetch(input, init));
    }
    health() {
        return this.get("/health");
    }
    systemScan() {
        return this.get("/api/system/scan");
    }
    runtimes() {
        return this.get("/api/runtimes");
    }
    searchCatalog(query, limit = 12) {
        return this.get(`/api/catalog/search?q=${encodeURIComponent(query)}&limit=${limit}`);
    }
    huggingFaceFiles(repoId, revision = "main") {
        return this.get(`/api/catalog/hf/files?repo=${encodeURIComponent(repoId)}&revision=${encodeURIComponent(revision)}`);
    }
    dryRunHuggingFaceDownload(repoId, revision = "main", allowPatterns = ["*.gguf"]) {
        return this.post("/api/catalog/hf/dry-run", { repoId, revision, allowPatterns });
    }
    inventory() {
        return this.get("/api/inventory");
    }
    downloads() {
        return this.get("/api/downloads");
    }
    startDownload(request) {
        return this.post("/api/downloads", request);
    }
    createDeletePlan(request) {
        return this.post("/api/delete-plans", request);
    }
    confirmDeletePlan(planId) {
        return this.post(`/api/delete-plans/${encodeURIComponent(planId)}/confirm`, {});
    }
    auditLog() {
        return this.get("/api/audit-log");
    }
    loadRuntime(request) {
        return this.post(`/api/runtimes/${request.runtime}/load`, request);
    }
    unloadRuntime(runtime, model) {
        return this.post(`/api/runtimes/${runtime}/unload`, { model });
    }
    startLmStudioServer(port = 1234) {
        return this.post("/api/runtimes/lmstudio/server/start", { port });
    }
    downloadEvents() {
        return new EventSource(`${this.apiUrl}/api/downloads/events`);
    }
    async get(path) {
        const response = await this.fetchImpl(`${this.apiUrl}${path}`);
        return this.read(response);
    }
    async post(path, body) {
        const response = await this.fetchImpl(`${this.apiUrl}${path}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body)
        });
        return this.read(response);
    }
    async read(response) {
        const text = await response.text();
        const payload = text ? JSON.parse(text) : undefined;
        if (!response.ok) {
            const message = payload?.error || payload?.message || `Request failed with ${response.status}`;
            throw new Error(message);
        }
        return payload;
    }
}
//# sourceMappingURL=index.js.map