import type { EmbeddingProvider, LocalEmbeddingRequest, LocalEmbeddingResult } from "./types.js";

export function normalizeEmbeddingInput(input: LocalEmbeddingRequest["input"]): string[] {
  const values = typeof input === "string" ? [input] : input;
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("input must be a non-empty string or string array");
  }
  return values.map((value, index) => {
    if (typeof value !== "string") throw new Error(`input[${index}] must be a string`);
    if (!value.trim()) throw new Error(index === 0 && values.length === 1 ? "input must not be empty" : `input[${index}] must not be empty`);
    return value;
  });
}

export function trimDimensions(vector: number[], dimensions?: number): number[] {
  if (!dimensions) return [...vector];
  if (!Number.isInteger(dimensions) || dimensions <= 0) throw new Error("dimensions must be a positive integer");
  if (dimensions > vector.length) throw new Error(`dimensions must be <= ${vector.length}`);
  return vector.slice(0, dimensions);
}

export function l2Normalize(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!magnitude) return vector.map(() => 0);
  return vector.map((value) => value / magnitude);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const size = Math.min(a.length, b.length);
  if (!size) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < size; i += 1) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (!magA || !magB) return 0;
  return dot / Math.sqrt(magA * magB);
}

export async function createEmbeddingProvider(): Promise<EmbeddingProvider | undefined> {
  if (process.env.HT_LLM_ENABLE_EMBEDDINGS === "0") return undefined;
  const dimensions = parseEmbeddingDimensions(process.env.HT_LLM_EMBEDDING_DIMENSIONS);
  const backend = process.env.HT_LLM_EMBEDDING_BACKEND || "hash";
  if (backend === "transformers") {
    const { createTransformersEmbeddingProvider } = await import("./transformers.js");
    return createTransformersEmbeddingProvider({
      model: process.env.HT_LLM_EMBEDDING_MODEL || "Xenova/all-MiniLM-L6-v2",
      dimensions
    });
  }
  return createHashEmbeddingProvider({
    model: process.env.HT_LLM_EMBEDDING_MODEL || "local-hash-embedding",
    dimensions
  });
}

export function parseEmbeddingDimensions(value: string | undefined): number {
  if (!value) return 384;
  const dimensions = Number(value);
  if (!Number.isInteger(dimensions) || dimensions <= 0) {
    throw new Error("HT_LLM_EMBEDDING_DIMENSIONS must be a positive integer");
  }
  return dimensions;
}

export function createHashEmbeddingProvider(options: { model: string; dimensions: number }): EmbeddingProvider {
  return {
    id: "local-hash",
    model: options.model,
    dimensions: options.dimensions,
    async embed(input, requestOptions): Promise<LocalEmbeddingResult> {
      const dimensions = requestOptions?.dimensions || options.dimensions;
      const vectors = input.map((text) => hashTextEmbedding(text, dimensions));
      return {
        model: options.model,
        vectors,
        tokenEstimate: input.reduce((sum, text) => sum + Math.max(1, Math.ceil(text.length / 4)), 0),
        dimensions
      };
    }
  };
}

export function hashTextEmbedding(text: string, dimensions: number): number[] {
  if (!Number.isInteger(dimensions) || dimensions <= 0) throw new Error("dimensions must be a positive integer");
  const vector = new Array<number>(dimensions).fill(0);
  const terms = text.toLowerCase().split(/[^a-z0-9_]+/).filter(Boolean);
  for (const term of terms.length ? terms : [text.toLowerCase()]) {
    const index = positiveHash(term) % dimensions;
    const sign = positiveHash(`${term}:sign`) % 2 === 0 ? 1 : -1;
    vector[index] += sign;
  }
  return l2Normalize(vector);
}

function positiveHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
