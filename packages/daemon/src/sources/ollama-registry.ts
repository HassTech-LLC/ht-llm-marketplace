// Client for the Ollama model registry (registry.ollama.ai), an OCI-style
// registry. Lets the marketplace pull models from Ollama's public library
// directly — no Ollama app required — and run the resulting GGUF in the
// built-in engine. We implement the open protocol rather than shelling out.

import type { CatalogItem } from "@ht-llm-marketplace/sdk";
import { fetchJsonWithLimit } from "../http.js";

const OLLAMA_REGISTRY = "https://registry.ollama.ai";
const MODEL_MEDIA_TYPE = "application/vnd.ollama.image.model";
const MANIFEST_ACCEPT = "application/vnd.docker.distribution.manifest.v2+json";

export interface OllamaRef {
  namespace: string;
  model: string;
  tag: string;
}

export interface OllamaManifestLayer {
  mediaType: string;
  digest: string;
  size?: number;
}

export interface OllamaManifest {
  schemaVersion?: number;
  layers?: OllamaManifestLayer[];
  config?: OllamaManifestLayer;
}

export interface ResolvedOllamaModel {
  ref: string;
  namespace: string;
  model: string;
  tag: string;
  name: string;
  sizeBytes?: number;
  digest: string;
  downloadUrl: string;
}

/**
 * Parse an Ollama model reference like `qwen2.5`, `qwen2.5:0.5b`, or
 * `library/llama3.2:1b` into { namespace, model, tag }. Defaults the namespace
 * to `library` and the tag to `latest`, matching Ollama's own defaults.
 */
export function parseOllamaRef(input: string): OllamaRef {
  const trimmed = (input || "").trim().replace(/^ollama:\/\//i, "");
  if (!trimmed) throw new Error("An Ollama model reference is required (e.g. \"qwen2.5:0.5b\").");

  let namespace = "library";
  let rest = trimmed;
  const slash = trimmed.lastIndexOf("/");
  if (slash !== -1) {
    namespace = trimmed.slice(0, slash) || "library";
    rest = trimmed.slice(slash + 1);
  }

  let model = rest;
  let tag = "latest";
  const colon = rest.lastIndexOf(":");
  if (colon !== -1) {
    model = rest.slice(0, colon);
    tag = rest.slice(colon + 1) || "latest";
  }

  if (!model) throw new Error(`Invalid Ollama model reference: ${input}`);
  return { namespace, model, tag };
}

/** Pick the GGUF model layer out of an Ollama manifest. */
export function selectModelLayer(manifest: OllamaManifest): OllamaManifestLayer {
  const layer = (manifest.layers || []).find((entry) => entry.mediaType === MODEL_MEDIA_TYPE);
  if (!layer || !layer.digest) {
    throw new Error("No GGUF model layer found in the Ollama manifest.");
  }
  return layer;
}

export function ollamaManifestUrl(ref: OllamaRef): string {
  return `${OLLAMA_REGISTRY}/v2/${ref.namespace}/${ref.model}/manifests/${encodeURIComponent(ref.tag)}`;
}

export function ollamaBlobUrl(ref: OllamaRef, digest: string): string {
  return `${OLLAMA_REGISTRY}/v2/${ref.namespace}/${ref.model}/blobs/${digest}`;
}

export function displayRef(ref: OllamaRef): string {
  const prefix = ref.namespace === "library" ? "" : `${ref.namespace}/`;
  return `${prefix}${ref.model}:${ref.tag}`;
}

// Curated set of well-known Ollama Library models. Surfaced from
// /api/catalog/search?source=ollama because the public registry exposes no
// search endpoint — only manifest fetches by ref.
const OLLAMA_LIBRARY_SEEDS: Array<{ ref: string; description: string; tags: string[] }> = [
  { ref: "qwen2.5:0.5b", description: "Tiny multilingual chat model — fits on any laptop.", tags: ["gguf", "chat", "tiny"] },
  { ref: "qwen2.5:1.5b", description: "Small Qwen chat model — strong tool use.", tags: ["gguf", "chat", "small"] },
  { ref: "llama3.2:1b", description: "Meta Llama 3.2 1B — fast local assistant.", tags: ["gguf", "chat", "small"] },
  { ref: "llama3.2:3b", description: "Meta Llama 3.2 3B — better reasoning than 1B.", tags: ["gguf", "chat", "medium"] },
  { ref: "phi3.5:3.8b", description: "Microsoft Phi-3.5 mini — strong reasoning, small footprint.", tags: ["gguf", "chat", "reasoning"] },
  { ref: "gemma2:2b", description: "Google Gemma 2 2B — open instruction-tuned chat.", tags: ["gguf", "chat", "small"] },
  { ref: "mistral:7b", description: "Mistral 7B instruct — classic baseline.", tags: ["gguf", "chat", "medium"] },
  { ref: "qwen2.5-coder:1.5b", description: "Qwen 2.5 Coder — code completion & explanation.", tags: ["gguf", "code", "small"] }
];

function ollamaSeedToCatalogItem(seed: { ref: string; description: string; tags: string[] }): CatalogItem {
  return {
    id: `ollama://${seed.ref}`,
    source: "ollama",
    name: seed.ref,
    description: seed.description,
    tags: seed.tags,
    format: "gguf",
    url: `https://ollama.com/library/${seed.ref.split(":")[0]}`,
    fit: { level: "unknown", label: "Resolve via Ollama registry", reasons: ["Sizes resolved at download time."] }
  };
}

/**
 * Catalog search for Ollama Library. With no public search API, this returns:
 * - When `query` parses as a valid Ollama ref: a resolved single-item result
 *   plus curated seeds beneath it.
 * - Otherwise: filtered curated seeds (case-insensitive substring on name/desc).
 *
 * Always returns Ollama-sourced CatalogItems — never HuggingFace — so the
 * `?source=ollama` filter is byte-distinguishable from `?source=hf`.
 */
export async function searchOllamaCatalog(query: string, limit = 12): Promise<CatalogItem[]> {
  const trimmed = (query || "").trim();
  const seeds = OLLAMA_LIBRARY_SEEDS.map(ollamaSeedToCatalogItem);

  if (!trimmed) return seeds.slice(0, limit);

  const lower = trimmed.toLowerCase();
  const filtered = seeds.filter((item) =>
    item.name.toLowerCase().includes(lower) || (item.description || "").toLowerCase().includes(lower)
  );

  // If the query looks like an Ollama ref the user already knows, resolve it
  // and put the live registry hit first.
  if (/^[a-z0-9][a-z0-9._\-]*(?::[a-z0-9._\-]+)?$/i.test(trimmed) || trimmed.startsWith("ollama://")) {
    try {
      const resolved = await resolveOllamaModel(trimmed);
      const live: CatalogItem = {
        id: `ollama://${resolved.ref}`,
        source: "ollama",
        name: resolved.name,
        description: `Resolved from registry.ollama.ai (${resolved.digest.slice(0, 16)}).`,
        tags: ["gguf", "resolved"],
        format: "gguf",
        updatedAt: undefined,
        url: `https://ollama.com/library/${resolved.model}`,
        fit: { level: "unknown", label: "Ready to download", reasons: [] }
      };
      // De-dup live hit against any seed that already matched.
      const rest = filtered.filter((item) => item.id !== live.id);
      return [live, ...rest].slice(0, limit);
    } catch {
      // Fall back to filtered seeds — the query didn't resolve to a real ref.
    }
  }

  return filtered.slice(0, limit);
}

/** Resolve a reference to a concrete downloadable GGUF via the manifest. */
export async function resolveOllamaModel(input: string): Promise<ResolvedOllamaModel> {
  const ref = parseOllamaRef(input);
  const manifest = await fetchJsonWithLimit<OllamaManifest>(ollamaManifestUrl(ref), {
    headers: { accept: MANIFEST_ACCEPT },
    timeoutMs: 8_000,
    maxBytes: 1024 * 1024
  }).catch((error) => {
    throw new Error(`Ollama library lookup failed for "${displayRef(ref)}": ${(error as Error).message}`);
  });
  const layer = selectModelLayer(manifest);
  return {
    ref: displayRef(ref),
    namespace: ref.namespace,
    model: ref.model,
    tag: ref.tag,
    name: `${ref.model}:${ref.tag}`,
    sizeBytes: layer.size,
    digest: layer.digest,
    downloadUrl: ollamaBlobUrl(ref, layer.digest)
  };
}
