import type { ArtifactFormat, CatalogFile, CatalogFilePart, CatalogItem, CompatibilityScore } from "@ht-llm-marketplace/sdk";
import { fetchJsonWithLimit } from "../http.js";

const HUB = "https://huggingface.co";
const HF_JSON_LIMIT = 10 * 1024 * 1024;

export async function searchHuggingFace(query: string, limit = 12): Promise<CatalogItem[]> {
  if (!query.trim()) return curatedSearchSeeds();
  const safeLimit = clampInt(limit, 1, 50);
  const url = `${HUB}/api/models?search=${encodeURIComponent(query.slice(0, 200))}&filter=gguf&sort=downloads&direction=-1&limit=${safeLimit}`;
  const models = await fetchJsonWithLimit<HfModel[]>(url, { maxBytes: HF_JSON_LIMIT });
  return models.map((model) => {
    const tags = model.tags || [];
    return {
      id: model.modelId,
      source: "huggingface",
      repoId: model.modelId,
      name: model.modelId.split("/").pop() || model.modelId,
      author: model.modelId.split("/")[0],
      downloads: model.downloads,
      likes: model.likes,
      tags,
      license: tagValue(tags, "license:"),
      task: model.pipeline_tag || tags.find((tag) => tag.includes("text-generation") || tag.includes("image-text-to-text")),
      format: tags.includes("gguf") ? "gguf" : "unknown",
      updatedAt: model.lastModified,
      url: `${HUB}/${model.modelId}`,
      fit: compatibilityFromUnknown(tags)
    };
  });
}

export async function listHuggingFaceFiles(repoId: string, revision = "main"): Promise<CatalogFile[]> {
  const normalizedRepoId = validateHuggingFaceRepoId(repoId);
  const normalizedRevision = validateHuggingFaceRevision(revision);
  const url = `${HUB}/api/models/${encodeRepoId(normalizedRepoId)}/tree/${encodeURIComponent(normalizedRevision)}?recursive=1`;
  const files = await fetchJsonWithLimit<HfFile[]>(url, { maxBytes: HF_JSON_LIMIT });
  const catalogFiles = files
    .filter((file) => file.type !== "directory")
    .map((file) => {
      const filePath = validateHuggingFacePath(file.path);
      const format = detectFormat(filePath);
      return {
        repoId: normalizedRepoId,
        path: filePath,
        sizeBytes: file.size,
        format,
        downloadUrl: huggingFaceResolveUrl(normalizedRepoId, normalizedRevision, filePath),
        runnable: format === "gguf",
        fit: compatibilityFromSize(file.size, format)
      };
    })
    .filter((file) => file.format !== "unknown");
  return groupMultipartGgufs(catalogFiles);
}

export async function dryRunHuggingFaceDownload(repoId: string, revision: string, allowPatterns: string[]) {
  const files = await listHuggingFaceFiles(repoId, revision);
  const allowed = files.filter((file) => {
    if (allowPatterns.length === 0) return true;
    return allowPatterns.some((pattern) => matchPattern(pattern, file.path) || file.parts?.some((part) => matchPattern(pattern, part.path)));
  });
  const expanded = allowed.flatMap((file) => file.parts || [file]);
  const totalBytes = expanded.reduce((total, file) => total + (Number.isFinite(file.sizeBytes) ? file.sizeBytes || 0 : 0), 0);
  return {
    repoId,
    revision,
    allowPatterns,
    fileCount: expanded.length,
    totalBytes,
    bytesToDownload: totalBytes,
    files: expanded.map((file) => ({
      path: file.path,
      sizeBytes: file.sizeBytes,
      wouldDownload: true
    }))
  };
}

export function validateHuggingFaceRepoId(repoId: string): string {
  const value = requireSafeString(repoId, "repoId", 200);
  const parts = value.split("/");
  if (parts.length !== 2 || parts.some((part) => !/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(part) || part.includes(".."))) {
    throw new Error("Invalid Hugging Face repoId. Expected owner/name with safe characters.");
  }
  return value;
}

export function validateHuggingFaceRevision(revision = "main"): string {
  const value = requireSafeString(revision || "main", "revision", 200);
  if (value.startsWith("/") || value.includes("\\") || value.split("/").some((part) => part === "..")) {
    throw new Error("Invalid Hugging Face revision.");
  }
  if (!/^[A-Za-z0-9._/-]+$/.test(value)) throw new Error("Invalid Hugging Face revision.");
  return value;
}

export function validateHuggingFacePath(filePath: string): string {
  const value = requireSafeString(filePath, "filename", 500);
  if (value.startsWith("/") || value.includes("\\") || value.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("Invalid Hugging Face file path.");
  }
  return value;
}

export function huggingFaceResolveUrl(repoId: string, revision: string, filePath: string): string {
  return `${HUB}/${encodeRepoId(validateHuggingFaceRepoId(repoId))}/resolve/${encodeURIComponent(
    validateHuggingFaceRevision(revision)
  )}/${encodePath(validateHuggingFacePath(filePath))}`;
}

export function detectFormat(filePath: string): ArtifactFormat {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".gguf")) return "gguf";
  if (lower.endsWith(".safetensors")) return "safetensors";
  if (lower.endsWith(".onnx")) return "onnx";
  if (lower.includes("/mlx") || lower.endsWith(".mlx")) return "mlx";
  if (lower.includes("diffusion") || lower.endsWith(".ckpt")) return "diffusers";
  if (lower.includes("whisper")) return "whisper";
  return "unknown";
}

export function compatibilityFromSize(sizeBytes?: number, format: ArtifactFormat = "unknown"): CompatibilityScore {
  if (format !== "gguf") {
    return { level: "unsupported", label: "Catalog only", reasons: [`${format} artifacts need a matching runtime adapter.`] };
  }
  if (!sizeBytes) return { level: "unknown", label: "Unknown fit", reasons: ["File size is unavailable."] };
  const gb = sizeBytes / 1024 / 1024 / 1024;
  if (gb <= 8) return { level: "excellent", label: "Fast local fit", reasons: ["Likely fits comfortably on 16 GB VRAM systems."] };
  if (gb <= 14) return { level: "good", label: "GPU fit", reasons: ["Likely fits with normal context and modest headroom."] };
  if (gb <= 24) return { level: "heavy", label: "Quality mode", reasons: ["May need reduced context, CPU offload, or on-demand loading."] };
  return { level: "heavy", label: "Heavy", reasons: ["Large artifact; verify memory estimate before loading."] };
}

export function groupMultipartGgufs(files: CatalogFile[]): CatalogFile[] {
  const groups = new Map<string, Array<CatalogFile & { splitIndex: number; splitTotal: number }>>();
  const singles: CatalogFile[] = [];

  for (const file of files) {
    const split = parseSplitGgufPath(file.path);
    if (!split) {
      singles.push(file);
      continue;
    }
    const group = groups.get(split.groupPath) || [];
    group.push({ ...file, splitIndex: split.index, splitTotal: split.total });
    groups.set(split.groupPath, group);
  }

  const grouped = [...groups.entries()].map(([groupPath, parts]) => {
    const sortedParts = parts.sort((a, b) => a.splitIndex - b.splitIndex);
    const complete = sortedParts.length === sortedParts[0].splitTotal;
    const sizeKnown = sortedParts.every((part) => typeof part.sizeBytes === "number" && part.sizeBytes > 0);
    const sizeBytes = sizeKnown ? sortedParts.reduce((total, part) => total + (part.sizeBytes || 0), 0) : undefined;
    const catalogParts: CatalogFilePart[] = sortedParts.map((part) => ({
      path: part.path,
      sizeBytes: part.sizeBytes,
      downloadUrl: part.downloadUrl
    }));

    return {
      repoId: sortedParts[0].repoId,
      path: groupPath,
      format: "gguf" as ArtifactFormat,
      sizeBytes,
      downloadUrl: sortedParts[0].downloadUrl,
      runnable: complete,
      fit: sizeKnown
        ? compatibilityFromSize(sizeBytes, "gguf")
        : compatibilityFromMultipart(sortedParts.length, sortedParts[0].splitTotal, complete),
      multipart: true,
      partCount: sortedParts[0].splitTotal,
      parts: catalogParts
    };
  });

  return [...singles, ...grouped].sort((a, b) => {
    if (a.format !== b.format) return a.format === "gguf" ? -1 : 1;
    const aSize = a.sizeBytes ?? Number.MAX_SAFE_INTEGER;
    const bSize = b.sizeBytes ?? Number.MAX_SAFE_INTEGER;
    if (aSize !== bSize) return aSize - bSize;
    return a.path.localeCompare(b.path);
  });
}

export function parseSplitGgufPath(filePath: string) {
  const match = filePath.match(/^(.*)-(\d{5})-of-(\d{5})\.gguf$/i);
  if (!match) return undefined;
  const index = Number.parseInt(match[2], 10);
  const total = Number.parseInt(match[3], 10);
  if (!Number.isFinite(index) || !Number.isFinite(total) || index < 1 || total < 2) return undefined;
  return {
    groupPath: `${match[1]}.gguf`,
    index,
    total
  };
}

function compatibilityFromMultipart(foundParts: number, totalParts: number, complete: boolean): CompatibilityScore {
  if (!complete) {
    return {
      level: "unsupported",
      label: "Missing shards",
      reasons: [`Found ${foundParts} of ${totalParts} GGUF shards. All shards are required for a runnable split model.`]
    };
  }
  return {
    level: "unknown",
    label: "Multipart GGUF",
    reasons: ["This split GGUF must be downloaded as a complete artifact before exact fit can be scored."]
  };
}

function compatibilityFromUnknown(tags: string[]): CompatibilityScore {
  if (!tags.includes("gguf")) return { level: "unsupported", label: "Catalog only", reasons: ["No GGUF tag found."] };
  return { level: "unknown", label: "Pick a file", reasons: ["Open file variants to score exact quantization size."] };
}

function tagValue(tags: string[], prefix: string) {
  return tags.find((tag) => tag.startsWith(prefix))?.slice(prefix.length);
}

function requireSafeString(value: string, name: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required`);
  const trimmed = value.trim();
  if (trimmed.length > maxLength) throw new Error(`${name} is too long`);
  return trimmed;
}

function encodeRepoId(repoId: string): string {
  return repoId.split("/").map(encodeURIComponent).join("/");
}

function encodePath(filePath: string): string {
  return filePath.split("/").map(encodeURIComponent).join("/");
}

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function curatedSearchSeeds(): CatalogItem[] {
  return [
    "unsloth/Qwen3-Coder-Next-GGUF",
    "unsloth/Qwen3.6-27B-GGUF",
    "lmstudio-community/gemma-4-E4B-it-GGUF",
    "bartowski/Meta-Llama-3.1-8B-Instruct-GGUF"
  ].map((repoId) => ({
    id: repoId,
    source: "huggingface",
    repoId,
    name: repoId.split("/").pop() || repoId,
    author: repoId.split("/")[0],
    tags: ["gguf"],
    format: "gguf",
    url: `${HUB}/${repoId}`,
    fit: { level: "unknown", label: "Pick a file", reasons: ["Open file variants to score exact size."] }
  }));
}

export function matchPattern(pattern: string, value: string) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i").test(value);
}

interface HfModel {
  modelId: string;
  downloads?: number;
  likes?: number;
  tags?: string[];
  pipeline_tag?: string;
  lastModified?: string;
}

interface HfFile {
  path: string;
  type?: string;
  size?: number;
}
