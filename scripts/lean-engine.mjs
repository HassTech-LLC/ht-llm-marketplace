#!/usr/bin/env node
// Trim the embedded engine to a portable, lightweight footprint.
//
// node-llama-cpp ships prebuilt binaries for every backend as separate
// `@node-llama-cpp/*` packages. The CUDA ones (`*-cuda`, `*-cuda-ext`) are
// NVIDIA-only and ~6x the size of the Vulkan binary, which already covers
// NVIDIA, AMD, and Intel GPUs. For a drop-in-anywhere product we standardize
// on Vulkan (+ CPU + Metal on macOS) and remove the CUDA prebuilts.
//
// Run with `npm run engine:lean`. Idempotent and safe to re-run.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

// Backends to remove. Vulkan is the cross-vendor GPU path we keep; CUDA is the
// heavy, NVIDIA-only one we drop. (Add more patterns here if other heavy
// vendor-specific backends appear.)
const DROP_PATTERNS = [/cuda/i];

function dirSizeBytes(dir) {
  let total = 0;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += dirSizeBytes(full);
    else if (entry.isFile()) {
      try {
        total += fs.statSync(full).size;
      } catch {
        /* ignore */
      }
    }
  }
  return total;
}

function findScopeDirs(root) {
  // @node-llama-cpp can live in the root node_modules (hoisted) and/or nested
  // under packages/*/node_modules depending on the install layout.
  const candidates = [
    path.join(root, "node_modules", "@node-llama-cpp"),
    path.join(root, "packages", "daemon", "node_modules", "@node-llama-cpp")
  ];
  return candidates.filter((dir) => fs.existsSync(dir));
}

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1);
let freed = 0;
let removed = 0;
const scopeDirs = findScopeDirs(repoRoot);

if (scopeDirs.length === 0) {
  console.log("[lean-engine] No @node-llama-cpp packages found — nothing to prune.");
  process.exit(0);
}

for (const scopeDir of scopeDirs) {
  for (const entry of fs.readdirSync(scopeDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!DROP_PATTERNS.some((pattern) => pattern.test(entry.name))) continue;
    const full = path.join(scopeDir, entry.name);
    const size = dirSizeBytes(full);
    fs.rmSync(full, { recursive: true, force: true });
    freed += size;
    removed += 1;
    console.log(`[lean-engine] removed @node-llama-cpp/${entry.name} (${mb(size)} MB)`);
  }
}

if (removed === 0) {
  console.log("[lean-engine] Already lean — no CUDA prebuilts present.");
} else {
  console.log(`[lean-engine] Done. Removed ${removed} package(s), freed ${mb(freed)} MB.`);
  console.log("[lean-engine] Engine now uses Vulkan (cross-vendor GPU) + CPU; Metal on macOS.");
}
