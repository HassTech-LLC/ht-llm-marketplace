import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type ModelTrustLevel = "owned" | "configured" | "installed-runtime" | "ambient" | "virtual";

export interface DiscoveredModel {
  name: string;
  path: string;
  sizeBytes: number;
  source: string;
  dir: string;
  trustLevel?: ModelTrustLevel;
  autoWarmEligible?: boolean;
  trustReason?: string;
  license?: string;
}

export interface ModelRoot {
  dir: string;
  source: string;
  maxDepth?: number;
  trustLevel?: ModelTrustLevel;
  autoWarmEligible?: boolean;
  trustReason?: string;
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
  if (input.modelsDir) roots.push(ownedRoot(input.modelsDir, "marketplace"));
  if (input.downloadsDir) roots.push(ownedRoot(input.downloadsDir, "marketplace"));
  
  // LM Studio
  roots.push(installedRuntimeRoot(path.join(home, ".lmstudio", "models"), "LM Studio"));
  roots.push(installedRuntimeRoot(path.join(home, ".cache", "lm-studio", "models"), "LM Studio"));
  roots.push(installedRuntimeRoot(path.join(home, ".lmstudio", ".internal", "bundled-models"), "LM Studio (Bundled)"));

  // Jan & AnythingLLM
  roots.push(ambientRoot(path.join(home, "jan", "models"), "Jan", "Jan models are visible for manual loading until HT Studio has a Jan runtime readiness adapter."));
  roots.push(ambientRoot(path.join(home, "AppData", "Local", "jan", "models"), "Jan", "Jan models are visible for manual loading until HT Studio has a Jan runtime readiness adapter."));
  roots.push(ambientRoot(path.join(home, "AppData", "Roaming", "anythingllm-desktop", "storage", "models"), "AnythingLLM", "AnythingLLM models are visible for manual loading until HT Studio has an AnythingLLM runtime readiness adapter."));

  // Hugging Face Cache
  roots.push(ambientRoot(path.join(home, ".cache", "huggingface", "hub"), "Hugging Face Cache", "Cached Hugging Face files are not auto-warmed until installed through HT Studio or added as an explicit model directory."));

  // Custom HT LLM Research
  try {
    const researchPath = path.join(home, "Desktop", "ht- llm research");
    if (fs.existsSync(researchPath)) {
      roots.push({
        ...ambientRoot(researchPath, "HT LLM Research", "Reference research workspace models are visible for manual loading but excluded from automatic residency."),
        maxDepth: 10
      });
    }
  } catch {
    // Ignore error
  }

  // Downloads and Desktop (with shallow maxDepth)
  try {
    const downloadsPath = path.join(home, "Downloads");
    if (fs.existsSync(downloadsPath)) {
      roots.push({
        ...ambientRoot(downloadsPath, "Downloads", "Downloads is a broad filesystem discovery root, so models found there require manual loading or explicit configuration."),
        maxDepth: 2
      });
    }
  } catch {
    // Ignore error
  }
  try {
    const desktopPath = path.join(home, "Desktop");
    if (fs.existsSync(desktopPath)) {
      roots.push({
        ...ambientRoot(desktopPath, "Desktop", "Desktop is a broad filesystem discovery root, so models found there require manual loading or explicit configuration."),
        maxDepth: 2
      });
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
          roots.push(ambientRoot(cand, `Drive ${drive.toUpperCase()}`, "Drive-level model roots are broad discoveries and are not auto-warmed without explicit configuration."));
        }
      } catch {
        // drive not mounted or inaccessible
      }
    }
  }

  for (const extra of input.extraDirs ?? []) {
    if (extra) roots.push(configuredRoot(extra));
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

  const walk = (root: ModelRoot, dir: string, depth: number, currentMaxDepth: number): void => {
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
        walk(root, full, depth + 1, currentMaxDepth);
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
        source: root.source,
        dir: path.basename(path.dirname(full)),
        trustLevel: root.trustLevel ?? "ambient",
        autoWarmEligible: root.autoWarmEligible === true,
        trustReason: root.trustReason ?? defaultTrustReason(root.trustLevel ?? "ambient", root.source)
      });
    }
  };

  for (const root of roots) {
    if (found.length >= maxFiles) break;
    walk(root, root.dir, 0, root.maxDepth ?? maxDepth);
  }

  // Ollama offline manifests scan
  const home = os.homedir();
  const ollamaModelsEnv = process.env.OLLAMA_MODELS;
  
  const ollamaRoots: Array<{ manifests: string; blobs: string }> = [];
  if (ollamaModelsEnv) {
    ollamaRoots.push({
      manifests: path.join(ollamaModelsEnv, "manifests"),
      blobs: path.join(ollamaModelsEnv, "blobs")
    });
  } else {
    ollamaRoots.push({
      manifests: path.join(home, ".ollama", "models", "manifests"),
      blobs: path.join(home, ".ollama", "models", "blobs")
    });
    // Windows service default locations
    if (process.platform === "win32") {
      ollamaRoots.push({
        manifests: "C:\\Windows\\system32\\config\\systemprofile\\.ollama\\models\\manifests",
        blobs: "C:\\Windows\\system32\\config\\systemprofile\\.ollama\\models\\blobs"
      });
      ollamaRoots.push({
        manifests: "C:\\ProgramData\\ollama\\models\\manifests",
        blobs: "C:\\ProgramData\\ollama\\models\\blobs"
      });
    }
  }

  if (!options.skipOllama) {
    for (const ollamaRoot of ollamaRoots) {
      if (!fs.existsSync(ollamaRoot.manifests)) continue;
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
              const relative = path.relative(ollamaRoot.manifests, full);
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
                const blobPath = path.join(ollamaRoot.blobs, blobName);
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
                      dir: "ollama-blobs",
                      trustLevel: "installed-runtime",
                      autoWarmEligible: true,
                      trustReason: "Installed Ollama model discovered from the configured Ollama model store."
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
      walkOllama(ollamaRoot.manifests);
    }
  }

  return found.sort((a, b) => a.name.localeCompare(b.name));
}

function ownedRoot(dir: string, source: string): ModelRoot {
  return {
    dir,
    source,
    trustLevel: "owned",
    autoWarmEligible: true,
    trustReason: "Model is inside HT Studio-managed storage."
  };
}

function configuredRoot(dir: string): ModelRoot {
  return {
    dir,
    source: "Configured Folder",
    trustLevel: "configured",
    autoWarmEligible: true,
    trustReason: "Model root was explicitly configured."
  };
}

function installedRuntimeRoot(dir: string, source: string): ModelRoot {
  return {
    dir,
    source,
    trustLevel: "installed-runtime",
    autoWarmEligible: true,
    trustReason: `${source} is an installed local runtime/model manager root.`
  };
}

function ambientRoot(dir: string, source: string, trustReason: string): ModelRoot {
  return {
    dir,
    source,
    trustLevel: "ambient",
    autoWarmEligible: false,
    trustReason
  };
}

function defaultTrustReason(trustLevel: ModelTrustLevel, source: string) {
  if (trustLevel === "owned") return "Model is inside HT Studio-managed storage.";
  if (trustLevel === "configured") return "Model root was explicitly configured.";
  if (trustLevel === "installed-runtime") return `${source} is an installed local runtime/model manager root.`;
  if (trustLevel === "virtual") return "Virtual model is provided by HT Studio.";
  return `${source} is a broad discovery source and is manual-only until explicitly configured.`;
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
