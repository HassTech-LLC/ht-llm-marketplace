import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { RuntimeLoadRequest, RuntimeModel, RuntimeStatus } from "@ht-llm-marketplace/sdk";
import { fetchWithTimeout } from "../http.js";
import { runCommand } from "../utils.js";

export class LmStudioAdapter {
  readonly id = "lmstudio" as const;

  constructor(private readonly host: string) {}

  async status(): Promise<RuntimeStatus> {
    const notes: string[] = [];
    let installed = (await runCommand("lms", ["--version"], 5000)).ok;
    let serverOnline = false;
    let models: RuntimeModel[] = [];
    let loadedModels: RuntimeModel[] = [];

    if (!installed) {
      const home = os.homedir();
      const path1 = path.join(home, ".cache", "lm-studio", "bin", "lms.exe");
      const localAppData = process.env.LOCALAPPDATA || "";
      const path2 = localAppData ? path.join(localAppData, "Programs", "LM-Studio", "LM Studio.exe") : "";
      if (fs.existsSync(path1) || (path2 && fs.existsSync(path2))) {
        installed = true;
      }
    }

    if (!installed) {
      return {
        id: "lmstudio",
        label: "LM Studio",
        installed: false,
        online: false,
        endpoint: this.host,
        notes: ["LM Studio CLI `lms` is not available on PATH."]
      };
    }

    const server = await runCommand("lms", ["server", "status"], 5000);
    const serverText = `${server.stdout}\n${server.stderr}`;
    serverOnline = /server:\s*on|server is running/i.test(serverText) && !/not running|server:\s*off/i.test(serverText);
    if (!serverOnline) notes.push("LM Studio is installed, but the local HTTP server is off.");

    const ls = await runCommand("lms", ["ls", "--json"], 15000);
    if (ls.ok && ls.stdout) {
      try {
        models = (JSON.parse(ls.stdout) as LmStudioModel[]).map(mapLmStudioModel);
      } catch (error) {
        notes.push(`Could not parse LM Studio model list: ${(error as Error).message}`);
      }
    }

    const ps = await runCommand("lms", ["ps", "--json"], 10000);
    if (ps.ok && ps.stdout) {
      try {
        loadedModels = (JSON.parse(ps.stdout) as LmStudioModel[]).map((model) => ({ ...mapLmStudioModel(model), loaded: true }));
      } catch (error) {
        notes.push(`Could not parse LM Studio loaded models: ${(error as Error).message}`);
      }
    }

    if (serverOnline) {
      try {
        const response = await fetchWithTimeout(`${this.host}/v1/models`, { timeoutMs: 5_000 });
        if (!response.ok) {
          serverOnline = false;
          notes.push(`LM Studio /v1/models returned ${response.status}.`);
        }
      } catch (error) {
        serverOnline = false;
        notes.push(`LM Studio server status said online, but /v1/models failed: ${(error as Error).message}`);
      }
    }

    return {
      id: "lmstudio",
      label: "LM Studio",
      installed,
      online: serverOnline,
      endpoint: this.host,
      models,
      loadedModels,
      notes
    };
  }

  async startServer(port = 1234) {
    const result = await runCommand("lms", ["server", "start", "--port", String(port)], 30000);
    if (!result.ok) throw new Error(result.stderr || "Could not start LM Studio server");
    return result.stdout || `LM Studio server start requested on port ${port}.`;
  }

  async load(request: RuntimeLoadRequest) {
    const args = ["load", request.model];
    if (request.contextLength) args.push("--context-length", String(request.contextLength));
    if (request.gpu !== undefined) args.push("--gpu", String(request.gpu));
    if (request.ttlSeconds) args.push("--ttl", String(request.ttlSeconds));
    const result = await runCommand("lms", args, 60000);
    if (!result.ok) throw new Error(result.stderr || "LM Studio model load failed");
    return result.stdout || "LM Studio model load requested.";
  }

  async unload(model?: string) {
    const args = model ? ["unload", model] : ["unload", "--all"];
    const result = await runCommand("lms", args, 30000);
    if (!result.ok) throw new Error(result.stderr || "LM Studio model unload failed");
    return result.stdout || "LM Studio model unload requested.";
  }

  async estimate(model: string, request: Pick<RuntimeLoadRequest, "contextLength" | "gpu"> = {}) {
    const args = ["load", "--estimate-only", model];
    if (request.contextLength) args.push("--context-length", String(request.contextLength));
    if (request.gpu !== undefined) args.push("--gpu", String(request.gpu));
    const result = await runCommand("lms", args, 30000);
    if (!result.ok) throw new Error(result.stderr || "LM Studio estimate failed");
    return result.stdout;
  }
}

interface LmStudioModel {
  type?: string;
  modelKey?: string;
  displayName?: string;
  path?: string;
  sizeBytes?: number;
  architecture?: string;
  paramsString?: string;
  quantization?: { name?: string };
}

function mapLmStudioModel(model: LmStudioModel): RuntimeModel {
  return {
    id: model.modelKey || model.path || model.displayName || "lmstudio-model",
    name: model.modelKey || model.path || model.displayName || "lmstudio-model",
    displayName: model.displayName,
    path: model.path,
    sizeBytes: model.sizeBytes,
    format: model.type === "embedding" ? "unknown" : "gguf",
    family: model.architecture,
    parameterSize: model.paramsString,
    quantization: model.quantization?.name,
    runtime: "lmstudio"
  };
}
