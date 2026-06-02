import { describe, expect, it, vi } from "vitest";
import {
  compatibilityFromSize,
  detectFormat,
  groupMultipartGgufs,
  huggingFaceResolveUrl,
  matchPattern,
  parseSplitGgufPath,
  validateHuggingFacePath,
  validateHuggingFaceRepoId,
  fetchHuggingFaceFileSha256
} from "../sources/huggingface.js";

describe("huggingface source helpers", () => {
  it("detects runnable GGUF files", () => {
    expect(detectFormat("Qwen3-Q4_K_M.gguf")).toBe("gguf");
    expect(detectFormat("model.safetensors")).toBe("safetensors");
  });

  it("matches allow patterns", () => {
    expect(matchPattern("*.gguf", "model.Q4_K_M.gguf")).toBe(true);
    expect(matchPattern("*.gguf", "model.safetensors")).toBe(false);
  });

  it("validates repo IDs and file paths before building Hugging Face URLs", () => {
    expect(validateHuggingFaceRepoId("org/model-name.GGUF")).toBe("org/model-name.GGUF");
    expect(validateHuggingFacePath("Q4_K_M/model file.gguf")).toBe("Q4_K_M/model file.gguf");
    expect(() => validateHuggingFaceRepoId("../bad/model")).toThrow("Invalid Hugging Face repoId");
    expect(() => validateHuggingFacePath("../model.gguf")).toThrow("Invalid Hugging Face file path");
    expect(huggingFaceResolveUrl("org/model", "main", "Q4_K_M/model file.gguf")).toBe(
      "https://huggingface.co/org/model/resolve/main/Q4_K_M/model%20file.gguf"
    );
  });

  it("scores exact file sizes", () => {
    expect(compatibilityFromSize(5 * 1024 * 1024 * 1024, "gguf").level).toBe("excellent");
    expect(compatibilityFromSize(30 * 1024 * 1024 * 1024, "gguf").level).toBe("heavy");
    expect(compatibilityFromSize(5 * 1024 * 1024 * 1024, "safetensors").level).toBe("unsupported");
  });

  it("detects split GGUF shard groups", () => {
    expect(parseSplitGgufPath("Q4_1/Model-Q4_1-00002-of-00003.gguf")).toEqual({
      groupPath: "Q4_1/Model-Q4_1.gguf",
      index: 2,
      total: 3
    });
    expect(parseSplitGgufPath("Model-Q4_K_M.gguf")).toBeUndefined();
  });

  it("groups multipart GGUF shards into one runnable artifact", () => {
    const grouped = groupMultipartGgufs([
      {
        repoId: "org/model",
        path: "Q4_1/Model-Q4_1-00002-of-00003.gguf",
        format: "gguf",
        sizeBytes: 2 * 1024 * 1024 * 1024,
        downloadUrl: "https://example.test/2",
        runnable: true,
        fit: compatibilityFromSize(2 * 1024 * 1024 * 1024, "gguf")
      },
      {
        repoId: "org/model",
        path: "Q4_1/Model-Q4_1-00001-of-00003.gguf",
        format: "gguf",
        sizeBytes: 2 * 1024 * 1024 * 1024,
        downloadUrl: "https://example.test/1",
        runnable: true,
        fit: compatibilityFromSize(2 * 1024 * 1024 * 1024, "gguf")
      },
      {
        repoId: "org/model",
        path: "Q4_1/Model-Q4_1-00003-of-00003.gguf",
        format: "gguf",
        sizeBytes: 2 * 1024 * 1024 * 1024,
        downloadUrl: "https://example.test/3",
        runnable: true,
        fit: compatibilityFromSize(2 * 1024 * 1024 * 1024, "gguf")
      }
    ]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({
      path: "Q4_1/Model-Q4_1.gguf",
      multipart: true,
      partCount: 3,
      runnable: true,
      sizeBytes: 6 * 1024 * 1024 * 1024
    });
    expect(grouped[0].parts?.map((part) => part.path)).toEqual([
      "Q4_1/Model-Q4_1-00001-of-00003.gguf",
      "Q4_1/Model-Q4_1-00002-of-00003.gguf",
      "Q4_1/Model-Q4_1-00003-of-00003.gguf"
    ]);
  });

  it("does not score zero-size multipart shards as fast local fits", () => {
    const grouped = groupMultipartGgufs([
      {
        repoId: "org/model",
        path: "Q4_1/Model-Q4_1-00001-of-00002.gguf",
        format: "gguf",
        sizeBytes: 0,
        downloadUrl: "https://example.test/1",
        runnable: true,
        fit: compatibilityFromSize(0, "gguf")
      },
      {
        repoId: "org/model",
        path: "Q4_1/Model-Q4_1-00002-of-00002.gguf",
        format: "gguf",
        sizeBytes: 0,
        downloadUrl: "https://example.test/2",
        runnable: true,
        fit: compatibilityFromSize(0, "gguf")
      }
    ]);

    expect(grouped[0].sizeBytes).toBeUndefined();
    expect(grouped[0].fit.level).toBe("unknown");
    expect(grouped[0].fit.label).toBe("Multipart GGUF");
  });

  describe("fetchHuggingFaceFileSha256", () => {
    it("resolves the SHA256 from fetch mock response", async () => {
      const mockFetch = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => [
          {
            path: "model.gguf",
            lfs: { oid: "abc123expectedsha256" }
          }
        ]
      } as any);

      const sha = await fetchHuggingFaceFileSha256("org/model", "main", "model.gguf");
      expect(sha).toBe("abc123expectedsha256");
      expect(mockFetch).toHaveBeenCalled();
      mockFetch.mockRestore();
    });

    it("returns undefined on fetch error or mismatch", async () => {
      const mockFetch = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: false
      } as any);

      const sha = await fetchHuggingFaceFileSha256("org/model", "main", "model.gguf");
      expect(sha).toBeUndefined();
      mockFetch.mockRestore();
    });
  });
});
