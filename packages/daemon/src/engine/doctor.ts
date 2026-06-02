import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fetchJsonWithLimit } from "../http.js";

// Architectures known to require a newer llama.cpp than older bundles ship.
// Extend as upstream adds architectures. Unknown architectures are treated as
// supported (no false positives) — a genuine load failure is handled
// gracefully downstream by the engine. Keyed by GGUF `general.architecture`.
export const MIN_RELEASE_BY_ARCH: Record<string, number> = {
  gemma3: 9999, // Requires a very new upstream release; fall back to Ollama if present
  gemma4: 8637  // llama.cpp PR #21309; landed in ~b8637
};

/** Parse a llama.cpp release tag like "b8390" into its number (8390). */
export function releaseNumber(release?: string): number | undefined {
  const match = (release || "").match(/b?(\d{3,7})/i);
  return match ? Number(match[1]) : undefined;
}

export interface ArchSupport {
  supported: boolean;
  architecture?: string;
  minRelease?: string;
  reason?: string;
}

/**
 * Decide whether the bundled engine release can run a model of a given
 * architecture. Only blocks architectures we *know* need a newer release;
 * everything else (unknown arch, unknown release) is allowed through.
 */
export function checkArchSupport(architecture: string | undefined, bundledRelease: string | undefined): ArchSupport {
  if (!architecture) return { supported: true };
  const minimum = MIN_RELEASE_BY_ARCH[architecture.toLowerCase()];
  if (minimum === undefined) return { supported: true, architecture };
  const current = releaseNumber(bundledRelease);
  if (current === undefined) return { supported: true, architecture };
  if (current >= minimum) return { supported: true, architecture };
  return {
    supported: false,
    architecture,
    minRelease: `b${minimum}`,
    reason: `Model architecture '${architecture}' needs llama.cpp ≥ b${minimum}, but the built-in engine is ${bundledRelease}. Update the engine, or run this model via Ollama.`
  };
}

/** Read the llama.cpp release a prebuilt was built from, scanning a node_modules dir. */
export function readBundledLlamaReleaseFrom(nodeModulesDir: string): string | undefined {
  const scope = path.join(nodeModulesDir, "@node-llama-cpp");
  let entries: string[];
  try {
    entries = fs.readdirSync(scope);
  } catch {
    return undefined;
  }
  for (const entry of entries) {
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(scope, entry, "_nlcBuildMetadata.json"), "utf8"));
      const release = meta?.buildOptions?.llamaCpp?.release;
      if (typeof release === "string") return release;
    } catch {
      /* try the next variant */
    }
  }
  return undefined;
}

function locateNodeModulesDir(): string | undefined {
  try {
    // Resolve the package's main entry (the "." export is always allowed, unlike
    // the "/package.json" subpath which node-llama-cpp's exports map blocks), then
    // walk back to the enclosing node_modules directory.
    const require = createRequire(import.meta.url);
    const main = require.resolve("node-llama-cpp");
    const marker = `node_modules${path.sep}`;
    const idx = main.lastIndexOf(marker);
    if (idx !== -1) return main.slice(0, idx + marker.length - 1);
  } catch {
    /* fall through to cwd-based candidates */
  }
  for (const candidate of [
    path.resolve(process.cwd(), "node_modules"),
    path.resolve(process.cwd(), "..", "..", "node_modules"),
    path.resolve(process.cwd(), "..", "..", "..", "node_modules")
  ]) {
    if (fs.existsSync(path.join(candidate, "@node-llama-cpp"))) return candidate;
  }
  return undefined;
}

function findHighestLocalBuild(nodeModulesDir: string): string | undefined {
  const localBuildsDir = path.join(nodeModulesDir, "node-llama-cpp", "llama", "localBuilds");
  try {
    if (!fs.existsSync(localBuildsDir)) return undefined;
    const entries = fs.readdirSync(localBuildsDir);
    let highestRelease: string | undefined = undefined;
    let highestNum = -1;
    for (const entry of entries) {
      const match = entry.match(/release-b(\d+)/i);
      if (match) {
        const num = Number(match[1]);
        if (num > highestNum) {
          if (fs.existsSync(path.join(localBuildsDir, entry, "buildDone.status"))) {
            highestNum = num;
            highestRelease = `b${num}`;
          }
        }
      }
    }
    return highestRelease;
  } catch {
    return undefined;
  }
}

/**
 * Read the bundled llama.cpp release from a node_modules dir. Primary source is
 * node-llama-cpp's own `llama/binariesGithubRelease.json` (present in a clean
 * npm install); falls back to scanning the prebuilt packages' build metadata
 * (present after a local source build).
 */
export function readReleaseRecord(nodeModulesDir: string): string | undefined {
  const localBuild = findHighestLocalBuild(nodeModulesDir);
  if (localBuild) return localBuild;

  try {
    const info = JSON.parse(
      fs.readFileSync(path.join(nodeModulesDir, "node-llama-cpp", "llama", "binariesGithubRelease.json"), "utf8")
    );
    if (typeof info?.release === "string") return info.release;
  } catch {
    /* fall through to prebuilt metadata scan */
  }
  return readBundledLlamaReleaseFrom(nodeModulesDir);
}


/** The llama.cpp release the installed engine was built from (or undefined). */
export function readBundledLlamaRelease(): string | undefined {
  const dir = locateNodeModulesDir();
  return dir ? readReleaseRecord(dir) : undefined;
}

/** The installed node-llama-cpp package version, if resolvable. */
export function installedEngineVersion(): string | undefined {
  const dir = locateNodeModulesDir();
  if (!dir) return undefined;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, "node-llama-cpp", "package.json"), "utf8"));
    return typeof pkg.version === "string" ? pkg.version : undefined;
  } catch {
    return undefined;
  }
}

/** Best-effort: the latest node-llama-cpp version published to npm. */
export async function latestEngineVersion(): Promise<string | undefined> {
  try {
    const data = await fetchJsonWithLimit<{ version?: string }>("https://registry.npmjs.org/node-llama-cpp/latest", {
      timeoutMs: 5_000,
      maxBytes: 256 * 1024
    });
    return typeof data.version === "string" ? data.version : undefined;
  } catch {
    return undefined;
  }
}
