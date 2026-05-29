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
  roots.push({ dir: path.join(home, ".lmstudio", "models"), source: "LM Studio" });
  roots.push({ dir: path.join(home, ".cache", "lm-studio", "models"), source: "LM Studio" });
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
export function discoverGgufModels(roots: ModelRoot[], options: { maxDepth?: number; maxFiles?: number } = {}): DiscoveredModel[] {
  const maxDepth = options.maxDepth ?? 6;
  const maxFiles = options.maxFiles ?? 500;
  const seen = new Set<string>();
  const found: DiscoveredModel[] = [];

  const walk = (dir: string, source: string, depth: number): void => {
    if (depth > maxDepth || found.length >= maxFiles) return;
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
        if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
        walk(full, source, depth + 1);
        continue;
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".gguf")) continue;
      if (/mmproj/i.test(entry.name)) continue;
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
    walk(root.dir, root.source, 0);
  }

  return found.sort((a, b) => a.name.localeCompare(b.name));
}

function realResolve(value: string): string {
  try {
    return fs.realpathSync(value).toLowerCase();
  } catch {
    return path.resolve(value).toLowerCase();
  }
}
