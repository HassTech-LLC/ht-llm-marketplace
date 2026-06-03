import { describe, expect, it } from "vitest";
import { cosineSimilarity, createEmbeddingProvider, hashTextEmbedding, l2Normalize, normalizeEmbeddingInput, parseEmbeddingDimensions, trimDimensions } from "../local.js";

describe("local embeddings helpers", () => {
  it("normalizes string and array inputs", () => {
    expect(normalizeEmbeddingInput("hello")).toEqual(["hello"]);
    expect(normalizeEmbeddingInput(["hello", "world"])).toEqual(["hello", "world"]);
  });

  it("rejects empty embedding input", () => {
    expect(() => normalizeEmbeddingInput("")).toThrow("input must not be empty");
    expect(() => normalizeEmbeddingInput(["ok", ""])).toThrow("input[1] must not be empty");
  });

  it("trims dimensions without mutating the original vector", () => {
    const vector = [1, 2, 3, 4];
    expect(trimDimensions(vector, 2)).toEqual([1, 2]);
    expect(vector).toEqual([1, 2, 3, 4]);
  });

  it("normalizes vectors to unit length", () => {
    const normalized = l2Normalize([3, 4]);
    expect(normalized[0]).toBeCloseTo(0.6);
    expect(normalized[1]).toBeCloseTo(0.8);
  });

  it("computes cosine similarity", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("creates deterministic zero-dependency hash embeddings", () => {
    const first = hashTextEmbedding("hello local model", 16);
    const second = hashTextEmbedding("hello local model", 16);
    expect(first).toEqual(second);
    expect(first).toHaveLength(16);
    expect(cosineSimilarity(first, second)).toBeCloseTo(1);
  });

  it("validates configured embedding dimensions", () => {
    expect(parseEmbeddingDimensions(undefined)).toBe(384);
    expect(parseEmbeddingDimensions("128")).toBe(128);
    expect(() => parseEmbeddingDimensions("0")).toThrow("positive integer");
    expect(() => parseEmbeddingDimensions("wide")).toThrow("positive integer");
  });

  it("creates hash embeddings by default and disables only with an explicit opt-out", async () => {
    const previousEnabled = process.env.HT_LLM_ENABLE_EMBEDDINGS;
    const previousBackend = process.env.HT_LLM_EMBEDDING_BACKEND;
    const previousDimensions = process.env.HT_LLM_EMBEDDING_DIMENSIONS;
    try {
      delete process.env.HT_LLM_ENABLE_EMBEDDINGS;
      delete process.env.HT_LLM_EMBEDDING_BACKEND;
      process.env.HT_LLM_EMBEDDING_DIMENSIONS = "8";
      const provider = await createEmbeddingProvider();
      expect(provider?.id).toBe("local-hash");
      expect(provider?.dimensions).toBe(8);

      process.env.HT_LLM_ENABLE_EMBEDDINGS = "0";
      await expect(createEmbeddingProvider()).resolves.toBeUndefined();
    } finally {
      restoreEnv("HT_LLM_ENABLE_EMBEDDINGS", previousEnabled);
      restoreEnv("HT_LLM_EMBEDDING_BACKEND", previousBackend);
      restoreEnv("HT_LLM_EMBEDDING_DIMENSIONS", previousDimensions);
    }
  });
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
