import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import type { DownloadJob, StartDownloadRequest } from "@ht-llm-marketplace/sdk";
import type { OllamaAdapter } from "../adapters/ollama.js";
import type { DaemonConfig } from "../config.js";
import { resolveOllamaModel } from "../sources/ollama-registry.js";
import {
  huggingFaceResolveUrl,
  validateHuggingFacePath,
  validateHuggingFaceRepoId,
  validateHuggingFaceRevision
} from "../sources/huggingface.js";
import { fetchWithTimeout } from "../http.js";
import type { MarketplaceStore } from "../store.js";
import { ensureDir, id, safeSegment, sha256File } from "../utils.js";

export class DownloadManager extends EventEmitter {
  private readonly active = new Map<string, DownloadJob>();
  private readonly controllers = new Map<string, AbortController>();

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

  async pause(jobId: string): Promise<DownloadJob> {
    const controller = this.controllers.get(jobId);
    if (controller) {
      controller.abort();
      this.controllers.delete(jobId);
    }
    const job = this.list().find((j) => j.id === jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);
    
    const pausedJob: DownloadJob = {
      ...job,
      status: "paused" as const,
      message: "Download paused",
      updatedAt: new Date().toISOString()
    };
    this.save(pausedJob);
    this.active.delete(jobId);
    this.emit("change");
    return pausedJob;
  }

  async resume(jobId: string): Promise<DownloadJob> {
    const job = this.list().find((j) => j.id === jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);
    if (job.status !== "paused" && job.status !== "failed" && job.status !== "cancelled") {
      throw new Error(`Job cannot be resumed from status: ${job.status}`);
    }

    const payloadStr = (job as any).requestPayload;
    if (!payloadStr) throw new Error(`Cannot resume download: missing request metadata payload.`);

    const request = JSON.parse(payloadStr) as StartDownloadRequest;
    
    const runningJob: DownloadJob = {
      ...job,
      status: "running" as const,
      message: "Resuming download...",
      updatedAt: new Date().toISOString()
    };
    this.save(runningJob);

    if (request.source === "ollama") {
      void this.runOllamaPull(request, runningJob);
    } else if (request.source === "huggingface") {
      const filenames = hfFilenames(request);
      const repoId = validateHuggingFaceRepoId(request.repoId!);
      const targetDir = path.join(this.config.modelsDir, "huggingface", safeSegment(repoId));
      const targetPaths = filenames.map((part) => path.join(targetDir, part.split("/").map(safeSegment).join(path.sep)));
      void this.runHuggingFaceFile(request, runningJob, targetPaths);
    } else if (request.source === "ollama-registry") {
      const ref = request.ref!;
      const resolved = await resolveOllamaModel(ref);
      const targetDir = path.join(this.config.modelsDir, "ollama-library", safeSegment(resolved.model));
      const targetPath = path.join(targetDir, `${safeSegment(resolved.name)}.gguf`);
      void this.runOllamaRegistryDownload(request, runningJob, resolved.downloadUrl, targetPath);
    }

    return runningJob;
  }

  async cancel(jobId: string): Promise<DownloadJob> {
    const controller = this.controllers.get(jobId);
    if (controller) {
      controller.abort();
      this.controllers.delete(jobId);
    }
    const job = this.list().find((j) => j.id === jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);

    const cancelledJob: DownloadJob = {
      ...job,
      status: "cancelled" as const,
      message: "Download cancelled",
      updatedAt: new Date().toISOString()
    };
    this.save(cancelledJob);
    this.active.delete(jobId);

    const payloadStr = (job as any).requestPayload;
    if (payloadStr) {
      try {
        const request = JSON.parse(payloadStr) as StartDownloadRequest;
        if (request.source === "huggingface") {
          const filenames = hfFilenames(request);
          const repoId = validateHuggingFaceRepoId(request.repoId!);
          const targetDir = path.join(this.config.modelsDir, "huggingface", safeSegment(repoId));
          for (const filename of filenames) {
            const targetPath = path.join(targetDir, filename.split("/").map(safeSegment).join(path.sep));
            const partPath = targetPath + ".part";
            if (fs.existsSync(partPath)) fs.rmSync(partPath, { force: true });
          }
        } else if (request.source === "ollama-registry") {
          const ref = request.ref!;
          const resolved = await resolveOllamaModel(ref);
          const targetDir = path.join(this.config.modelsDir, "ollama-library", safeSegment(resolved.model));
          const targetPath = path.join(targetDir, `${safeSegment(resolved.name)}.gguf`);
          const partPath = targetPath + ".part";
          if (fs.existsSync(partPath)) fs.rmSync(partPath, { force: true });
        }
      } catch {
        // Ignored
      }
    }

    this.emit("change");
    return cancelledJob;
  }

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
      requestPayload: JSON.stringify(request),
      startedAt: now,
      updatedAt: now
    });

    void this.runOllamaRegistryDownload(request, job, resolved.downloadUrl, targetPath);
    return job;
  }

  private async runOllamaRegistryDownload(
    request: StartDownloadRequest,
    job: DownloadJob,
    downloadUrl: string,
    targetPath: string
  ): Promise<void> {
    const controller = new AbortController();
    this.controllers.set(job.id, controller);

    const partPath = targetPath + ".part";
    void this.downloadFromUrl(downloadUrl, partPath, job, `Downloading ${job.target} from Ollama library`, controller.signal)
      .then(async ({ sizeBytes }) => {
        this.controllers.delete(job.id);
        if (fs.existsSync(partPath)) {
          fs.renameSync(partPath, targetPath);
        }
        const sha256 = await sha256File(targetPath);
        const artifact = this.store.upsertArtifact({
          source: "ollama-registry",
          runtime: "llamacpp",
          name: request.displayName || job.target.split(":")[0],
          displayName: request.displayName || job.target.split(":")[0],
          repoId: job.target,
          filename: path.basename(targetPath),
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
          message: `Ollama library download completed: ${job.target}`,
          totalBytes: sizeBytes,
          downloadedBytes: sizeBytes,
          updatedAt: new Date().toISOString()
        });
        this.active.delete(job.id);
        this.emit("change");
      })
      .catch((error) => {
        this.controllers.delete(job.id);
        if ((error as Error).name === "AbortError" || (error as Error).message?.includes("aborted")) {
          return;
        }
        if (fs.existsSync(partPath)) fs.rmSync(partPath, { force: true });
        this.save({ ...job, status: "failed", message: (error as Error).message, updatedAt: new Date().toISOString() });
        this.active.delete(job.id);
        this.emit("change");
      });
  }

  private async downloadFromUrl(
    url: string,
    partPath: string,
    job: DownloadJob,
    message: string,
    signal: AbortSignal
  ): Promise<{ sizeBytes: number }> {
    let existingBytes = 0;
    if (fs.existsSync(partPath)) {
      existingBytes = fs.statSync(partPath).size;
    }

    const headers: Record<string, string> = {};
    if (existingBytes > 0) {
      headers["Range"] = `bytes=${existingBytes}-`;
    }

    const response = await fetchWithTimeout(url, { headers, signal, timeoutMs: 30_000 });
    if (!response.ok || !response.body) {
      if (response.status === 416) {
        return { sizeBytes: existingBytes };
      }
      throw new Error(`Download failed with ${response.status}`);
    }

    const isPartial = response.status === 206;
    const incomingBytes = Number(response.headers.get("content-length")) || 0;
    const totalBytes = isPartial ? existingBytes + incomingBytes : incomingBytes || job.totalBytes || undefined;

    const writer = fs.createWriteStream(partPath, { flags: isPartial ? "a" : "w" });
    const reader = response.body.getReader();
    let downloadedBytes = isPartial ? existingBytes : 0;

    try {
      while (true) {
        if (signal.aborted) {
          throw new DOMException("The user aborted a request.", "AbortError");
        }
        const { done, value } = await reader.read();
        if (done) break;

        if (!writer.write(Buffer.from(value))) {
          await new Promise<void>((resolve, reject) => {
            const onDrain = () => {
              signal.removeEventListener("abort", onAbort);
              resolve();
            };
            const onAbort = () => {
              writer.removeListener("drain", onDrain);
              reject(new DOMException("The user aborted a request.", "AbortError"));
            };
            writer.once("drain", onDrain);
            signal.addEventListener("abort", onAbort);
          });
        }
        downloadedBytes += value.length;
        const progress = totalBytes ? Math.round((downloadedBytes / totalBytes) * 100) : 0;
        this.save({ ...job, progress, totalBytes, downloadedBytes, message, updatedAt: new Date().toISOString() });
      }
    } finally {
      await new Promise<void>((resolve) => {
        writer.end(() => resolve());
      });
    }

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
      requestPayload: JSON.stringify(request),
      startedAt: now,
      updatedAt: now
    });

    void this.runOllamaPull(request, job);
    return job;
  }

  private async runOllamaPull(request: StartDownloadRequest, job: DownloadJob): Promise<void> {
    const model = request.model!;
    const controller = new AbortController();
    this.controllers.set(job.id, controller);

    void this.ollama
      .pull(model, (event) => {
        if (controller.signal.aborted) return;
        const progress = event.total ? Math.round(((event.completed || 0) / event.total) * 100) : job.progress;
        this.save({ ...job, progress, status: "running", totalBytes: event.total, downloadedBytes: event.completed, message: event.status, updatedAt: new Date().toISOString() });
      })
      .then(() => {
        this.controllers.delete(job.id);
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
        this.controllers.delete(job.id);
        if (controller.signal.aborted) return;
        this.save({ ...job, status: "failed", message: (error as Error).message, updatedAt: new Date().toISOString() });
        this.active.delete(job.id);
        this.emit("change");
      });
  }

  private async startHuggingFaceFile(request: StartDownloadRequest): Promise<DownloadJob> {
    const filenames = hfFilenames(request);
    if (!request.repoId || filenames.length === 0) throw new Error("repoId and filename are required for Hugging Face downloads");
    const repoId = validateHuggingFaceRepoId(request.repoId);
    const filename = filenames[0];
    const revision = validateHuggingFaceRevision(request.revision || "main");
    request = { ...request, repoId, filename, filenames, revision };
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
      totalBytes: request.expectedBytes,
      requestPayload: JSON.stringify(request),
      startedAt: now,
      updatedAt: now
    });

    void this.runHuggingFaceFile(request, job, targetPaths);
    return job;
  }

  private async runHuggingFaceFile(request: StartDownloadRequest, job: DownloadJob, targetPaths: string[]): Promise<void> {
    const filenames = hfFilenames(request);
    const repoId = validateHuggingFaceRepoId(request.repoId!);
    const filename = filenames[0];
    const targetPath = targetPaths[0];

    const controller = new AbortController();
    this.controllers.set(job.id, controller);

    void this.downloadFiles(repoId, filenames, validateHuggingFaceRevision(request.revision || "main"), targetPaths, job, controller.signal, request)
      .then(async ({ sizeBytes }) => {
        this.controllers.delete(job.id);
        if (request.expectedBytes !== undefined && sizeBytes !== request.expectedBytes) {
          throw new Error(`Downloaded byte count mismatch: expected ${request.expectedBytes}, got ${sizeBytes}`);
        }
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
          revision: request.revision || "main",
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
        this.controllers.delete(job.id);
        if ((error as Error).name === "AbortError" || (error as Error).message?.includes("aborted")) {
          return;
        }
        for (const partTargetPath of targetPaths) {
          const partPath = partTargetPath + ".part";
          if (fs.existsSync(partPath)) fs.rmSync(partPath, { force: true });
          if (fs.existsSync(partTargetPath)) fs.rmSync(partTargetPath, { force: true });
        }
        this.save({ ...job, status: "failed", message: (error as Error).message, updatedAt: new Date().toISOString() });
        this.active.delete(job.id);
        this.emit("change");
      });
  }

  private async downloadFiles(
    repoId: string,
    filenames: string[],
    revision: string,
    targetPaths: string[],
    job: DownloadJob,
    signal: AbortSignal,
    request: StartDownloadRequest
  ) {
    let downloadedBytes = 0;
    const expectedByPath = new Map((request.expectedFiles || []).map((file) => [file.path, file.sizeBytes]));

    for (let index = 0; index < filenames.length; index += 1) {
      const partTargetPath = targetPaths[index];
      const partPath = partTargetPath + ".part";
      const result = await this.downloadFile(repoId, filenames[index], revision, partPath, job, signal, {
        fileIndex: index,
        fileCount: filenames.length,
        baseDownloadedBytes: downloadedBytes,
        expectedSizeBytes: expectedByPath.get(filenames[index])
      });
      if (signal.aborted) {
        throw new DOMException("The user aborted a request.", "AbortError");
      }
      const expectedSize = expectedByPath.get(filenames[index]);
      if (expectedSize !== undefined && result.sizeBytes !== expectedSize) {
        throw new Error(`Downloaded byte count mismatch for ${filenames[index]}: expected ${expectedSize}, got ${result.sizeBytes}`);
      }
      if (fs.existsSync(partPath)) {
        fs.renameSync(partPath, partTargetPath);
      }
      downloadedBytes += result.sizeBytes;
    }

    return { sizeBytes: downloadedBytes };
  }

  private async downloadFile(
    repoId: string,
    filename: string,
    revision: string,
    partPath: string,
    job: DownloadJob,
    signal: AbortSignal,
    batch?: { fileIndex: number; fileCount: number; baseDownloadedBytes: number; expectedSizeBytes?: number }
  ) {
    const safeRepoId = validateHuggingFaceRepoId(repoId);
    const safeRevision = validateHuggingFaceRevision(revision);
    const safeFilename = validateHuggingFacePath(filename);
    const url = huggingFaceResolveUrl(safeRepoId, safeRevision, safeFilename);
    
    let existingBytes = 0;
    if (fs.existsSync(partPath)) {
      existingBytes = fs.statSync(partPath).size;
    }

    const headers: Record<string, string> = {};
    if (existingBytes > 0) {
      headers["Range"] = `bytes=${existingBytes}-`;
    }

    const response = await fetchWithTimeout(url, { headers, signal, timeoutMs: 30_000 });
    if (!response.ok || !response.body) {
      if (response.status === 416) {
        return { sizeBytes: existingBytes };
      }
      throw new Error(`Hugging Face download failed with ${response.status}`);
    }

    const isPartial = response.status === 206;
    const incomingBytes = Number(response.headers.get("content-length")) || 0;
    const totalBytes = batch?.expectedSizeBytes ?? (isPartial ? existingBytes + incomingBytes : incomingBytes || undefined);

    const writer = fs.createWriteStream(partPath, { flags: isPartial ? "a" : "w" });
    const reader = response.body.getReader();
    let downloadedBytes = isPartial ? existingBytes : 0;

    try {
      while (true) {
        if (signal.aborted) {
          throw new DOMException("The user aborted a request.", "AbortError");
        }
        const { done, value } = await reader.read();
        if (done) break;

        if (!writer.write(Buffer.from(value))) {
          await new Promise<void>((resolve, reject) => {
            const onDrain = () => {
              signal.removeEventListener("abort", onAbort);
              resolve();
            };
            const onAbort = () => {
              writer.removeListener("drain", onDrain);
              reject(new DOMException("The user aborted a request.", "AbortError"));
            };
            writer.once("drain", onDrain);
            signal.addEventListener("abort", onAbort);
          });
        }
        downloadedBytes += value.length;
        const fileProgress = totalBytes ? downloadedBytes / totalBytes : 0;
        const progress = batch
          ? Math.round(((batch.fileIndex + fileProgress) / batch.fileCount) * 100)
          : totalBytes ? Math.round(fileProgress * 100) : 0;
        this.save({
          ...job,
          progress,
          totalBytes: batch ? undefined : totalBytes,
          downloadedBytes: batch ? batch.baseDownloadedBytes + downloadedBytes : downloadedBytes,
          message: batch
            ? `Downloading shard ${batch.fileIndex + 1}/${batch.fileCount}: ${path.basename(safeFilename)}`
            : `Downloading ${path.basename(safeFilename)}`,
          updatedAt: new Date().toISOString()
        });
      }
    } finally {
      await new Promise<void>((resolve) => {
        writer.end(() => resolve());
      });
    }

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

function hfFilenames(request: StartDownloadRequest): string[] {
  const filenames = request.filenames?.length ? request.filenames : request.filename ? [request.filename] : [];
  return filenames.map((filename) => validateHuggingFacePath(filename));
}
