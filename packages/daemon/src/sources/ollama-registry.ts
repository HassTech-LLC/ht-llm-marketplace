// Client for the Ollama model registry (registry.ollama.ai), an OCI-style
// registry. Lets the marketplace pull models from Ollama's public library
// directly — no Ollama app required — and run the resulting GGUF in the
// built-in engine. We implement the open protocol rather than shelling out.

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

/** Resolve a reference to a concrete downloadable GGUF via the manifest. */
export async function resolveOllamaModel(input: string): Promise<ResolvedOllamaModel> {
  const ref = parseOllamaRef(input);
  const response = await fetch(ollamaManifestUrl(ref), { headers: { accept: MANIFEST_ACCEPT } });
  if (!response.ok) {
    throw new Error(
      `Ollama library lookup failed (${response.status}) for "${displayRef(ref)}". Check the model name and tag.`
    );
  }
  const manifest = (await response.json()) as OllamaManifest;
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
