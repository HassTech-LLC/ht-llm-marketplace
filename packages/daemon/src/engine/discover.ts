import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface DiscoveredModel {
  name: string;
  path: string;
  sizeBytes: number;
  source: string;
  dir: string;
}

export interface ModelRoot {
  dir: string;
  source: string;
  maxDepth?: number;
}

export interface ModelRootInput {
  modelsDir?: string;
  downloadsDir?: string;
  extraDirs?: string[];
}

/**
 * The set of directories scanned for loadable GGUF models. Covers the
 * marketplace's own storage plus the common local model managers, so the Run
 * tab can list everything usable on the machine without manual paths.
 */
export function defaultModelRoots(input: ModelRootInput = {}): ModelRoot[] {
  const home = os.homedir();
  const roots: ModelRoot[] = [];
  if (input.modelsDir) roots.push({ dir: input.modelsDir, source: "marketplace" });
  if (input.downloadsDir) roots.push({ dir: input.downloadsDir, source: "marketplace" });
  
  // LM Studio
  roots.push({ dir: path.join(home, ".lmstudio", "models"), source: "LM Studio" });
  roots.push({ dir: path.join(home, ".cache", "lm-studio", "models"), source: "LM Studio" });
  roots.push({ dir: path.join(home, ".lmstudio", ".internal", "bundled-models"), source: "LM Studio (Bundled)" });

  // Jan & AnythingLLM
  roots.push({ dir: path.join(home, "jan", "models"), source: "Jan" });
  roots.push({ dir: path.join(home, "AppData", "Local", "jan", "models"), source: "Jan" });
  roots.push({ dir: path.join(home, "AppData", "Roaming", "anythingllm-desktop", "storage", "models"), source: "AnythingLLM" });

  // Hugging Face Cache
  roots.push({ dir: path.join(home, ".cache", "huggingface", "hub"), source: "Hugging Face Cache" });

  // Custom HT LLM Research
  try {
    const researchPath = path.join(home, "Desktop", "ht- llm research");
    if (fs.existsSync(researchPath)) {
      roots.push({ dir: researchPath, source: "HT LLM Research", maxDepth: 10 });
    }
  } catch {
    // Ignore error
  }

  // Downloads and Desktop (with shallow maxDepth)
  try {
    const downloadsPath = path.join(home, "Downloads");
    if (fs.existsSync(downloadsPath)) {
      roots.push({ dir: downloadsPath, source: "Downloads", maxDepth: 2 });
    }
  } catch {
    // Ignore error
  }
  try {
    const desktopPath = path.join(home, "Desktop");
    if (fs.existsSync(desktopPath)) {
      roots.push({ dir: desktopPath, source: "Desktop", maxDepth: 2 });
    }
  } catch {
    // Ignore error
  }

  // Windows Multi-Drive shallow scanner (C:, D:, E:, F:, G:, H:)
  const drives = ["c:", "d:", "e:", "f:", "g:", "h:"];
  for (const drive of drives) {
    const customRoots = [
      path.join(drive + path.sep, "models"),
      path.join(drive + path.sep, "llm"),
      path.join(drive + path.sep, "gguf"),
      path.join(drive + path.sep, "lmstudio", "models"),
      path.join(drive + path.sep, "jan", "models"),
      path.join(drive + path.sep, "Ollama", "models")
    ];
    for (const cand of customRoots) {
      try {
        if (fs.existsSync(cand)) {
          roots.push({ dir: cand, source: `Drive ${drive.toUpperCase()}` });
        }
      } catch {
        // drive not mounted or inaccessible
      }
    }
  }

  for (const extra of input.extraDirs ?? []) {
    if (extra) roots.push({ dir: extra, source: "folder" });
  }
  return roots;
}

const SPLIT_SHARD = /-(\d{5})-of-(\d{5})\.gguf$/i;

/**
 * Recursively scan the given roots for usable `.gguf` model files. Multipart
 * models are represented by their first shard only; multimodal projector files
 * (`mmproj-*`) are skipped because they are not standalone models. Results are
 * deduped by real path so the same file discovered via two roots appears once.
 */
const EXCLUDED_DIRS = new Set([
  "node_modules",
  "bower_components",
  "dist",
  "build",
  "out",
  "coverage",
  "tests",
  "cypress",
  "public",
  "assets",
  ".next",
  ".vite",
  ".nuxt",
  "vendor",
  "temp",
  "tmp",
  "cache",
  "npm",
  "yarn",
  "pnpm",
  ".git",
  ".svn",
  ".hg"
]);

export function discoverGgufModels(roots: ModelRoot[], options: { maxDepth?: number; maxFiles?: number; skipOllama?: boolean } = {}): DiscoveredModel[] {
  const maxDepth = options.maxDepth ?? 6;
  const maxFiles = options.maxFiles ?? 500;
  const seen = new Set<string>();
  const found: DiscoveredModel[] = [];

  const walk = (dir: string, source: string, depth: number, currentMaxDepth: number): void => {
    if (depth > currentMaxDepth || found.length >= maxFiles) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (found.length >= maxFiles) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const lowerName = entry.name.toLowerCase();
        if (entry.name.startsWith(".") || EXCLUDED_DIRS.has(lowerName)) continue;
        walk(full, source, depth + 1, currentMaxDepth);
        continue;
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".gguf")) continue;
      if (/mmproj/i.test(entry.name)) continue;
      if (!hasGgufMagic(full)) continue;
      const shard = entry.name.match(SPLIT_SHARD);
      if (shard && Number(shard[1]) !== 1) continue; // keep only the first shard of a split model
      const resolved = realResolve(full);
      if (seen.has(resolved)) continue;
      seen.add(resolved);
      let sizeBytes = 0;
      try {
        sizeBytes = fs.statSync(full).size;
      } catch {
        sizeBytes = 0;
      }
      found.push({
        name: entry.name.replace(/(-\d{5}-of-\d{5})?\.gguf$/i, ""),
        path: full,
        sizeBytes,
        source,
        dir: path.basename(path.dirname(full))
      });
    }
  };

  for (const root of roots) {
    if (found.length >= maxFiles) break;
    walk(root.dir, root.source, 0, root.maxDepth ?? maxDepth);
  }

  // Ollama offline manifests scan
  const home = os.homedir();
  const ollamaModelsEnv = process.env.OLLAMA_MODELS;
  const ollamaManifestsDir = ollamaModelsEnv
    ? path.join(ollamaModelsEnv, "manifests")
    : path.join(home, ".ollama", "models", "manifests");
  const ollamaBlobsDir = ollamaModelsEnv
    ? path.join(ollamaModelsEnv, "blobs")
    : path.join(home, ".ollama", "models", "blobs");

  if (!options.skipOllama && fs.existsSync(ollamaManifestsDir)) {
    const walkOllama = (dir: string): void => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walkOllama(full);
          continue;
        }
        if (entry.isFile()) {
          try {
            const relative = path.relative(ollamaManifestsDir, full);
            const parts = relative.split(path.sep);
            let modelName = parts.join("/");
            if (parts.length >= 4 && parts[0] === "registry.ollama.ai" && parts[1] === "library") {
              modelName = parts.slice(2).join(":");
            } else if (parts.length >= 2) {
              modelName = parts.join(":");
            }

            const manifest = JSON.parse(fs.readFileSync(full, "utf8"));
            const modelLayer = manifest.layers?.find(
              (l: any) => l.mediaType === "application/vnd.ollama.image.model"
            );
            if (modelLayer?.digest) {
              const blobName = modelLayer.digest.replace(":", "-");
              const blobPath = path.join(ollamaBlobsDir, blobName);
              if (fs.existsSync(blobPath) && hasGgufMagic(blobPath)) {
                let sizeBytes = 0;
                try {
                  sizeBytes = fs.statSync(blobPath).size;
                } catch {
                  sizeBytes = modelLayer.size || 0;
                }
                const resolvedBlob = realResolve(blobPath);
                if (!seen.has(resolvedBlob)) {
                  seen.add(resolvedBlob);
                  found.push({
                    name: modelName,
                    path: blobPath,
                    sizeBytes,
                    source: "Ollama",
                    dir: "ollama-blobs"
                  });
                }
              }
            }
          } catch {
            // skip invalid manifests
          }
        }
      }
    };
    walkOllama(ollamaManifestsDir);
  }

  return found.sort((a, b) => a.name.localeCompare(b.name));
}

function hasGgufMagic(filePath: string): boolean {
  const buffer = Buffer.alloc(4);
  let fd: number | undefined;
  try {
    fd = fs.openSync(filePath, "r");
    if (fs.readSync(fd, buffer, 0, 4, 0) !== 4) return false;
    return buffer.toString("ascii") === "GGUF";
  } catch {
    return false;
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        // Ignore close errors during discovery.
      }
    }
  }
}

function realResolve(value: string): string {
  try {
    return fs.realpathSync(value).toLowerCase();
  } catch {
    return path.resolve(value).toLowerCase();
  }
}
