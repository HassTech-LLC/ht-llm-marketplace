import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import type { RuntimeModel, RuntimeStatus } from "@ht-llm-marketplace/sdk";
import { fetchWithTimeout } from "../http.js";
import { runCommand } from "../utils.js";

export interface OllamaAdapterOptions {
  host: string;
}

export class OllamaAdapter {
  readonly id = "ollama" as const;

  constructor(private readonly options: OllamaAdapterOptions) {}

  async status(): Promise<RuntimeStatus> {
    const notes: string[] = [];
    let version: string | undefined;
    let models: RuntimeModel[] = [];
    let loadedModels: RuntimeModel[] = [];
    let online = false;
    let installed = false;

    // Check if ollama is available on PATH
    const versionCmd = await runCommand("ollama", ["--version"], 2000);
    if (versionCmd.ok) {
      installed = true;
    } else {
      // Check default Windows install locations
      const appData = process.env.LOCALAPPDATA || "";
      const path1 = appData ? path.join(appData, "Programs", "Ollama", "ollama.exe") : "";
      const path2 = "C:\\Program Files\\Ollama\\ollama.exe";
      if ((path1 && fs.existsSync(path1)) || fs.existsSync(path2)) {
        installed = true;
      }
    }

    try {
      const versionResponse = await this.fetchJson<{ version: string }>("/api/version");
      version = versionResponse.version;
      online = true;
      installed = true;
    } catch (error) {
      notes.push(`Ollama API is not reachable: ${(error as Error).message}`);
    }

    if (online) {
      try {
        const tags = await this.tags();
        models = tags;
      } catch (error) {
        notes.push(`Could not list Ollama models: ${(error as Error).message}`);
      }

      try {
        loadedModels = await this.ps();
      } catch (error) {
        notes.push(`Could not list loaded Ollama models: ${(error as Error).message}`);
      }
    }

    if (online && loadedModels.length === 0) {
      notes.push("Ollama is healthy but no model is currently loaded.");
    }

    return {
      id: "ollama",
      label: "Ollama",
      installed,
      online,
      version,
      endpoint: this.options.host,
      models,
      loadedModels,
      notes
    };
  }

  async startEngine(): Promise<string> {
    let execPath = "ollama";
    const appData = process.env.LOCALAPPDATA || "";
    const path1 = appData ? path.join(appData, "Programs", "Ollama", "ollama.exe") : "";
    const path2 = "C:\\Program Files\\Ollama\\ollama.exe";

    if (path1 && fs.existsSync(path1)) {
      execPath = path1;
    } else if (fs.existsSync(path2)) {
      execPath = path2;
    }

    try {
      const child = spawn(execPath, ["serve"], {
        detached: true,
        stdio: "ignore",
        windowsHide: true
      });
      child.unref();
      return "Ollama background service startup initialized.";
    } catch (error) {
      throw new Error(`Failed to start Ollama background service: ${(error as Error).message}`);
    }
  }

  async tags(): Promise<RuntimeModel[]> {
    const payload = await this.fetchJson<{ models?: OllamaTag[] }>("/api/tags");
    return (payload.models || []).map((model) => ({
      id: model.model || model.name,
      name: model.model || model.name,
      displayName: model.name,
      sizeBytes: model.size,
      format: "gguf",
      family: model.details?.family,
      parameterSize: model.details?.parameter_size,
      quantization: model.details?.quantization_level,
      runtime: "ollama",
      owned: false
    }));
  }

  async ps(): Promise<RuntimeModel[]> {
    const payload = await this.fetchJson<{ models?: OllamaTag[] }>("/api/ps");
    return (payload.models || []).map((model) => ({
      id: model.model || model.name,
      name: model.model || model.name,
      displayName: model.name,
      sizeBytes: model.size,
      format: "gguf",
      family: model.details?.family,
      parameterSize: model.details?.parameter_size,
      quantization: model.details?.quantization_level,
      runtime: "ollama",
      loaded: true
    }));
  }

  async pull(model: string, onProgress: (event: OllamaPullEvent) => void): Promise<void> {
    const response = await fetchWithTimeout(`${this.options.host}/api/pull`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, stream: true }),
      timeoutMs: 30_000
    });
    if (!response.ok || !response.body) {
      throw new Error(`Ollama pull failed with ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        onProgress(JSON.parse(line) as OllamaPullEvent);
      }
    }
  }

  async createModel(name: string, modelfile: string) {
    await this.fetchJson("/api/create", {
      method: "POST",
      body: JSON.stringify({ name, modelfile, stream: false })
    });
  }

  async deleteModel(model: string) {
    await this.fetchJson("/api/delete", {
      method: "DELETE",
      body: JSON.stringify({ model })
    });
  }

  async chat(body: unknown, options?: { signal?: AbortSignal }) {
    const response = await fetchWithTimeout(`${this.options.host}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      timeoutMs: 120_000,
      signal: options?.signal
    });
    if (!response.ok) throw new Error(`Ollama chat failed with ${response.status}`);
    return response;
  }

  async generate(body: unknown, options?: { signal?: AbortSignal }) {
    const response = await fetchWithTimeout(`${this.options.host}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      timeoutMs: 120_000,
      signal: options?.signal
    });
    if (!response.ok) throw new Error(`Ollama generate failed with ${response.status}`);
    return response;
  }

  async show(model: string) {
    return this.fetchJson<unknown>("/api/show", {
      method: "POST",
      body: JSON.stringify({ model })
    });
  }

  private async fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetchWithTimeout(`${this.options.host}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init.headers || {}) },
      timeoutMs: 8_000
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as T;
  }
}

interface OllamaTag {
  name: string;
  model: string;
  size?: number;
  details?: {
    family?: string;
    parameter_size?: string;
    quantization_level?: string;
  };
}

export interface OllamaPullEvent {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
}
