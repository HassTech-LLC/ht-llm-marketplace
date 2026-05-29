import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import type { DownloadJob, StartDownloadRequest } from "@ht-llm-marketplace/sdk";
import type { OllamaAdapter } from "../adapters/ollama.js";
import type { DaemonConfig } from "../config.js";
import { resolveOllamaModel } from "../sources/ollama-registry.js";
import type { MarketplaceStore } from "../store.js";
import { ensureDir, id, safeSegment, sha256File } from "../utils.js";

export class DownloadManager extends EventEmitter {
  private readonly active = new Map<string, DownloadJob>();

  constructor(
    private readonly config: DaemonConfig,
    private readonly store: MarketplaceStore,
    private readonly ollama: OllamaAdapter
  ) {
    super();
    ensureDir(config.downloadsDir);
    ensureDir(config.modelsDir);
  }

  list(): DownloadJob[] {
    const activeIds = new Set(this.active.keys());
    return [...this.active.values(), ...this.store.listJobs().filter((job) => !activeIds.has(job.id))];
  }

  async start(request: StartDownloadRequest): Promise<DownloadJob> {
    if (request.source === "ollama") return this.startOllamaPull(request);
    if (request.source === "huggingface") return this.startHuggingFaceFile(request);
    if (request.source === "ollama-registry") return this.startOllamaRegistryDownload(request);
    throw new Error(`Unsupported download source: ${request.source}`);
  }

  /**
   * Pull a model from the Ollama public library (registry.ollama.ai) directly —
   * no Ollama app — and register it as an owned GGUF runnable by the built-in
   * engine. Uses the open OCI manifest/blob protocol.
   */
  private async startOllamaRegistryDownload(request: StartDownloadRequest): Promise<DownloadJob> {
    const ref = request.ref;
    if (!ref) throw new Error("ref is required for Ollama library downloads (e.g. \"qwen2.5:0.5b\").");
    const resolved = await resolveOllamaModel(ref);
    const targetDir = path.join(this.config.modelsDir, "ollama-library", safeSegment(resolved.model));
    ensureDir(targetDir);
    const targetPath = path.join(targetDir, `${safeSegment(resolved.name)}.gguf`);

    const now = new Date().toISOString();
    const job = this.save({
      id: id("job"),
      type: "ollama-registry",
      status: "running",
      progress: 0,
      source: "ollama-registry",
      target: resolved.ref,
      message: `Starting Ollama library download: ${resolved.ref}`,
      totalBytes: resolved.sizeBytes,
      startedAt: now,
      updatedAt: now
    });

    void this.downloadFromUrl(resolved.downloadUrl, targetPath, job, `Downloading ${resolved.ref} from Ollama library`)
      .then(async ({ sizeBytes }) => {
        const sha256 = await sha256File(targetPath);
        const artifact = this.store.upsertArtifact({
          source: "ollama-registry",
          runtime: "llamacpp",
          name: request.displayName || resolved.name,
          displayName: request.displayName || resolved.name,
          repoId: resolved.ref,
          filename: `${safeSegment(resolved.name)}.gguf`,
          path: targetPath,
          sizeBytes,
          sha256,
          owned: true,
          runnable: true,
          notes: ["Pulled from the Ollama library; runs in the built-in engine."]
        });
        this.save({
          ...job,
          artifactId: artifact.id,
          status: "completed",
          progress: 100,
          message: `Ollama library download completed: ${resolved.ref}`,
          totalBytes: sizeBytes,
          downloadedBytes: sizeBytes,
          updatedAt: new Date().toISOString()
        });
        this.active.delete(job.id);
        this.emit("change");
      })
      .catch((error) => {
        if (fs.existsSync(targetPath)) fs.rmSync(targetPath, { force: true });
        this.save({ ...job, status: "failed", message: (error as Error).message, updatedAt: new Date().toISOString() });
        this.active.delete(job.id);
        this.emit("change");
      });

    return job;
  }

  private async downloadFromUrl(
    url: string,
    targetPath: string,
    job: DownloadJob,
    message: string
  ): Promise<{ sizeBytes: number }> {
    const response = await fetch(url);
    if (!response.ok || !response.body) throw new Error(`Download failed with ${response.status}`);
    const totalBytes = Number(response.headers.get("content-length")) || job.totalBytes || undefined;
    const writer = fs.createWriteStream(targetPath);
    const reader = response.body.getReader();
    let downloadedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!writer.write(Buffer.from(value))) {
        await new Promise<void>((resolve) => writer.once("drain", resolve));
      }
      downloadedBytes += value.length;
      const progress = totalBytes ? Math.round((downloadedBytes / totalBytes) * 100) : 0;
      this.save({ ...job, progress, totalBytes, downloadedBytes, message, updatedAt: new Date().toISOString() });
    }

    await new Promise<void>((resolve, reject) => {
      writer.end((error?: Error | null) => (error ? reject(error) : resolve()));
    });
    return { sizeBytes: downloadedBytes };
  }

  private async startOllamaPull(request: StartDownloadRequest): Promise<DownloadJob> {
    const model = request.model;
    if (!model) throw new Error("model is required for Ollama pulls");
    const now = new Date().toISOString();
    const job = this.save({
      id: id("job"),
      type: "ollama-pull",
      status: "running",
      progress: 0,
      source: "ollama",
      target: model,
      message: "Starting Ollama pull",
      startedAt: now,
      updatedAt: now
    });

    void this.ollama
      .pull(model, (event) => {
        const progress = event.total ? Math.round(((event.completed || 0) / event.total) * 100) : job.progress;
        this.save({ ...job, progress, status: "running", totalBytes: event.total, downloadedBytes: event.completed, message: event.status, updatedAt: new Date().toISOString() });
      })
      .then(() => {
        const artifact = this.store.upsertArtifact({
          source: "ollama",
          runtime: "ollama",
          name: model,
          displayName: request.displayName || model,
          owned: true,
          runnable: true,
          notes: ["Installed by HT Local LLM Marketplace through Ollama pull."]
        });
        this.save({ ...job, artifactId: artifact.id, status: "completed", progress: 100, message: "Ollama pull completed", updatedAt: new Date().toISOString() });
        this.active.delete(job.id);
        this.emit("change");
      })
      .catch((error) => {
        this.save({ ...job, status: "failed", message: (error as Error).message, updatedAt: new Date().toISOString() });
        this.active.delete(job.id);
        this.emit("change");
      });

    return job;
  }

  private async startHuggingFaceFile(request: StartDownloadRequest): Promise<DownloadJob> {
    const filenames = request.filenames?.length ? request.filenames : request.filename ? [request.filename] : [];
    if (!request.repoId || filenames.length === 0) throw new Error("repoId and filename are required for Hugging Face downloads");
    const repoId = request.repoId;
    const filename = request.filename || filenames[0];
    const revision = request.revision || "main";
    const targetDir = path.join(this.config.modelsDir, "huggingface", safeSegment(repoId));
    const targetPaths = filenames.map((part) => path.join(targetDir, part.split("/").map(safeSegment).join(path.sep)));
    const targetPath = targetPaths[0];
    for (const partTargetPath of targetPaths) {
      ensureDir(path.dirname(partTargetPath));
    }

    const now = new Date().toISOString();
    const job = this.save({
      id: id("job"),
      type: "hf-file",
      status: "running",
      progress: 0,
      source: "huggingface",
      target: `${repoId}/${request.displayName || filename}`,
      message: filenames.length > 1 ? `Starting Hugging Face multipart download (${filenames.length} files)` : "Starting Hugging Face download",
      startedAt: now,
      updatedAt: now
    });

    void this.downloadFiles(repoId, filenames, revision, targetPaths, job)
      .then(async ({ sizeBytes }) => {
        const sha256 = await sha256File(targetPath);
        
        let ollamaRegistered = false;
        let warmNote = "";

        if (request.runtime === "ollama" && filename.toLowerCase().endsWith(".gguf")) {
          try {
            const cleanName = (request.displayName || path.basename(filename, ".gguf"))
              .toLowerCase()
              .replace(/[^a-z0-9._-]/g, "-")
              .replace(/-+/g, "-");
            const modelName = `hf-${cleanName}`;
            const modelfileContent = compileModelfile(targetPath, repoId, modelName);
            
            const status = await this.ollama.status();
            if (status.online) {
              await this.ollama.createModel(modelName, modelfileContent);
              ollamaRegistered = true;
              warmNote = `Successfully warmed and registered as local Ollama model '${modelName}'.`;
            } else {
              warmNote = `Ollama engine was offline; GGUF downloaded but not registered warm.`;
            }
          } catch (err) {
            warmNote = `Auto-registration in Ollama failed: ${(err as Error).message}`;
          }
        }

        const notes = ["Downloaded by HT Local LLM Marketplace with revision-pinned source metadata."];
        if (filenames.length > 1) notes.push(`Multipart GGUF artifact downloaded with ${filenames.length} shards. Load starts from ${path.basename(filename)}.`);
        if (warmNote) notes.push(warmNote);

        const artifact = this.store.upsertArtifact({
          source: "huggingface",
          runtime: request.runtime || "llamacpp",
          name: request.displayName || path.basename(filename),
          displayName: request.displayName || path.basename(filename),
          repoId,
          filename,
          revision,
          path: targetPath,
          sizeBytes,
          sha256,
          owned: true,
          runnable: filename.toLowerCase().endsWith(".gguf"),
          notes
        });
        this.save({ ...job, artifactId: artifact.id, status: "completed", progress: 100, message: `Hugging Face download completed. ${warmNote}`, totalBytes: sizeBytes, downloadedBytes: sizeBytes, updatedAt: new Date().toISOString() });
        this.active.delete(job.id);
        this.emit("change");
      })
      .catch((error) => {
        for (const partTargetPath of targetPaths) {
          if (fs.existsSync(partTargetPath)) fs.rmSync(partTargetPath, { force: true });
        }
        this.save({ ...job, status: "failed", message: (error as Error).message, updatedAt: new Date().toISOString() });
        this.active.delete(job.id);
        this.emit("change");
      });

    return job;
  }

  private async downloadFiles(repoId: string, filenames: string[], revision: string, targetPaths: string[], job: DownloadJob) {
    let downloadedBytes = 0;

    for (let index = 0; index < filenames.length; index += 1) {
      const result = await this.downloadFile(repoId, filenames[index], revision, targetPaths[index], job, {
        fileIndex: index,
        fileCount: filenames.length,
        baseDownloadedBytes: downloadedBytes
      });
      downloadedBytes += result.sizeBytes;
    }

    return { sizeBytes: downloadedBytes };
  }

  private async downloadFile(
    repoId: string,
    filename: string,
    revision: string,
    targetPath: string,
    job: DownloadJob,
    batch?: { fileIndex: number; fileCount: number; baseDownloadedBytes: number }
  ) {
    const url = `https://huggingface.co/${repoId}/resolve/${encodeURIComponent(revision)}/${filename}`;
    const response = await fetch(url);
    if (!response.ok || !response.body) throw new Error(`Hugging Face download failed with ${response.status}`);
    const totalBytes = Number(response.headers.get("content-length")) || undefined;
    const writer = fs.createWriteStream(targetPath);
    const reader = response.body.getReader();
    let downloadedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      writer.write(Buffer.from(value));
      downloadedBytes += value.length;
      const fileProgress = totalBytes ? downloadedBytes / totalBytes : 0;
      const progress = batch
        ? Math.round(((batch.fileIndex + fileProgress) / batch.fileCount) * 100)
        : totalBytes ? Math.round(fileProgress * 100) : 0;
      this.save({
        ...job,
        progress,
        totalBytes,
        downloadedBytes: batch ? batch.baseDownloadedBytes + downloadedBytes : downloadedBytes,
        message: batch
          ? `Downloading shard ${batch.fileIndex + 1}/${batch.fileCount}: ${path.basename(filename)}`
          : `Downloading ${path.basename(filename)}`,
        updatedAt: new Date().toISOString()
      });
    }
    await new Promise<void>((resolve, reject) => {
      writer.end((error?: Error | null) => (error ? reject(error) : resolve()));
    });
    return { sizeBytes: downloadedBytes };
  }

  private save(job: DownloadJob): DownloadJob {
    this.active.set(job.id, job);
    this.store.upsertJob(job);
    this.emit("change");
    return job;
  }
}

function compileModelfile(filePath: string, repoId: string, name: string): string {
  const normalized = `${repoId}/${name}`.toLowerCase();
  
  let template = "";
  let parameters = "";

  if (normalized.includes("qwen") || normalized.includes("alibaba")) {
    template = `TEMPLATE """{{ if .System }}<|im_start|>system
{{ .System }}<|im_end|>
{{ end }}{{ if .Prompt }}<|im_start|>user
{{ .Prompt }}<|im_end|>
{{ end }}<|im_start|>assistant
"""`;
    parameters = `PARAMETER stop "<|im_start|>"
PARAMETER stop "<|im_end|>"`;
  } else if (normalized.includes("llama-3") || normalized.includes("llama3") || normalized.includes("meta")) {
    template = `TEMPLATE """{{ if .System }}<|start_header_id|>system<|end_header_id|>

{{ .System }}<|eot_id|>{{ end }}{{ if .Prompt }}<|start_header_id|>user<|end_header_id|>

{{ .Prompt }}<|eot_id|>{{ end }}<|start_header_id|>assistant<|end_header_id|>

"""`;
    parameters = `PARAMETER stop "<|start_header_id|>"
PARAMETER stop "<|end_header_id|>"
PARAMETER stop "<|eot_id|>"`;
  } else if (normalized.includes("gemma") || normalized.includes("google")) {
    template = `TEMPLATE """{{ if .System }}<start_of_turn>system
{{ .System }}<end_of_turn>
{{ end }}{{ if .Prompt }}<start_of_turn>user
{{ .Prompt }}<end_of_turn>
{{ end }}<start_of_turn>model
"""`;
    parameters = `PARAMETER stop "<start_of_turn>"
PARAMETER stop "<end_of_turn>"`;
  } else if (normalized.includes("deepseek")) {
    template = `TEMPLATE """{{ if .System }}{{ .System }}
{{ end }}{{ if .Prompt }}<｜User｜>{{ .Prompt }}<｜Assistant｜>{{ end }}"""`;
    parameters = `PARAMETER stop "<｜User｜>"
PARAMETER stop "<｜Assistant｜>"`;
  }

  if (!template) {
    template = `TEMPLATE """{{ if .System }}{{ .System }}
{{ end }}{{ if .Prompt }}user: {{ .Prompt }}
assistant: {{ end }}"""`;
  }

  const ollamaPath = filePath.replace(/\\/g, "/");

  return `FROM "${ollamaPath}"
${template}
${parameters}
`;
}
